import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startServer, emit, waitFor } from './helpers.js';
import { RoomManager } from '../../server/rooms.js';

let server;
beforeEach(async () => {
  server = await startServer({ manager: new RoomManager({ seed: () => 1234 }) });
});
afterEach(() => server.close());

/** Creates a room with Ana (host) + Luis + Sofi and returns the clients and credentials. */
async function roomWithThree() {
  const ana = server.client();
  const created = await emit(ana, 'room:create', { name: 'Ana' });
  expect(created.ok).toBe(true);
  expect(created.code).toMatch(/^[A-HJ-NP-Z]{4}$/);
  const others = [];
  for (const name of ['Luis', 'Sofi']) {
    const c = server.client();
    const joined = await emit(c, 'room:join', { code: created.code.toLowerCase(), name });
    expect(joined.ok).toBe(true);
    others.push({ socket: c, ...joined });
  }
  await waitFor(ana, 'room:state', (s) => s.players.length === 3);
  return {
    code: created.code,
    players: [{ socket: ana, ...created }, ...others],
  };
}

const byId = (players, id) => players.find((p) => p.playerId === id);

describe('rooms over sockets', () => {
  it('creates a room and three players join', async () => {
    const { code, players } = await roomWithThree();
    const state = players[0].socket.received['room:state'].at(-1);
    expect(state.code).toBe(code);
    expect(state.hostId).toBe(players[0].playerId);
    expect(state.status).toBe('lobby');
    expect(state.players.map((p) => p.name)).toEqual(['Ana', 'Luis', 'Sofi']);
    expect(JSON.stringify(state)).not.toContain(players[0].token);
  });

  it('rejects bad joins', async () => {
    const { code } = await roomWithThree();
    const c = server.client();
    expect((await emit(c, 'room:join', { code: 'ZZZZ', name: 'X' })).error).toBe(
      'No existe una sala con ese código',
    );
    expect((await emit(c, 'room:join', { code, name: '  ' })).ok).toBe(false);
    expect((await emit(c, 'room:join', { code, name: 'ana' })).error).toBe(
      'Ya hay alguien con ese nombre en la sala',
    );
    for (const name of ['D', 'E', 'F'])
      expect((await emit(server.client(), 'room:join', { code, name })).ok).toBe(true);
    expect((await emit(c, 'room:join', { code, name: 'G' })).error).toBe('La sala está llena');
  });

  it('only the host can start, with at least 2 players', async () => {
    const solo = server.client();
    await emit(solo, 'room:create', { name: 'Solo' });
    expect((await emit(solo, 'game:start')).error).toBe('Se necesitan al menos 2 jugadores');

    const { players } = await roomWithThree();
    expect((await emit(players[1].socket, 'game:start')).error).toBe(
      'Solo el anfitrión puede empezar',
    );
    expect((await emit(players[0].socket, 'game:start')).ok).toBe(true);
    const late = server.client();
    expect((await emit(late, 'room:join', { code: players[0].code, name: 'Tarde' })).error).toBe(
      'La partida ya empezó',
    );
  });

  it('each player receives only their own hand; turns are enforced', async () => {
    const { players } = await roomWithThree();
    await emit(players[0].socket, 'game:start');
    const views = await Promise.all(
      players.map((p) => waitFor(p.socket, 'game:state', (s) => s.status === 'playing')),
    );
    for (const [i, view] of views.entries()) {
      expect(view.me).toBe(players[i].playerId);
      expect(view.hand).toHaveLength(3);
      for (const p of view.players) expect(p).not.toHaveProperty('hand');
      for (const [j, other] of views.entries()) {
        if (i === j) continue;
        for (const card of other.hand) expect(JSON.stringify(view)).not.toContain(`"${card.id}"`);
      }
    }

    const turnId = views[0].turnPlayerId;
    const active = byId(players, turnId);
    const idle = players.find((p) => p.playerId !== turnId);
    const idleView = views[players.indexOf(idle)];

    const outOfTurn = await emit(idle.socket, 'game:action', {
      type: 'discard',
      cardIds: [idleView.hand[0].id],
    });
    expect(outOfTurn).toEqual({ ok: false, error: 'No es tu turno' });

    const activeView = views[players.indexOf(active)];
    const ok = await emit(active.socket, 'game:action', {
      type: 'discard',
      cardIds: [activeView.hand[0].id],
    });
    expect(ok).toEqual({ ok: true });
    const after = await waitFor(idle.socket, 'game:state', (s) => s.turnPlayerId !== turnId);
    expect(after.discardTop.id).toBe(activeView.hand[0].id);
    await waitFor(idle.socket, 'game:event', (e) => e.text.includes('tiró 1 carta'));
  });

  it('emits an error event when no ack is given', async () => {
    const c = server.client();
    const got = new Promise((resolve) => c.on('error', resolve));
    c.emit('game:start');
    expect(await got).toEqual({ message: 'No estás en una sala' });
  });

  it('reconnects with room:rejoin and keeps the same hand', async () => {
    const { code, players } = await roomWithThree();
    await emit(players[0].socket, 'game:start');
    const luis = players[1];
    const before = await waitFor(luis.socket, 'game:state');
    luis.socket.disconnect();
    await waitFor(players[0].socket, 'room:state', (s) =>
      s.players.some((p) => p.id === luis.playerId && !p.connected),
    );

    const back = server.client();
    expect(
      (await emit(back, 'room:rejoin', { code, playerId: luis.playerId, token: 'x' })).ok,
    ).toBe(false);
    const rejoined = await emit(back, 'room:rejoin', {
      code,
      playerId: luis.playerId,
      token: luis.token,
    });
    expect(rejoined.ok).toBe(true);
    const view = await waitFor(back, 'game:state');
    expect(view.hand).toEqual(before.hand);
    expect(view.log.length).toBeGreaterThan(0);
    await waitFor(players[0].socket, 'room:state', (s) => s.players.every((p) => p.connected));
  });

  it('passes the host role to the next connected player when the host disconnects', async () => {
    const { players } = await roomWithThree();
    players[0].socket.disconnect();
    const state = await waitFor(players[1].socket, 'room:state', (s) =>
      s.players.some((p) => !p.connected),
    );
    expect(state.hostId).toBe(players[1].playerId);
    expect((await emit(players[1].socket, 'game:start')).ok).toBe(true);
  });

  it('leaving the lobby removes the player and reassigns host', async () => {
    const { players } = await roomWithThree();
    expect((await emit(players[0].socket, 'room:leave')).ok).toBe(true);
    const state = await waitFor(players[1].socket, 'room:state', (s) => s.players.length === 2);
    expect(state.hostId).toBe(players[1].playerId);
    expect((await emit(players[0].socket, 'room:leave')).ok).toBe(false);
  });

  it('restart is only allowed after the game ends', async () => {
    const { players } = await roomWithThree();
    await emit(players[0].socket, 'game:start');
    expect((await emit(players[0].socket, 'game:restart')).error).toBe(
      'La partida no ha terminado',
    );
  });
});

describe('RoomManager', () => {
  it('deletes rooms that stay empty more than 30 minutes', () => {
    let t = 0;
    const m = new RoomManager({ now: () => t });
    const { room, player } = m.createRoom('Ana');
    m.setConnected(room, player.id, false);
    t = 29 * 60 * 1000;
    expect(m.cleanup()).toEqual([]);
    t = 31 * 60 * 1000;
    expect(m.cleanup()).toEqual([room.code]);
    expect(m.get(room.code)).toBeNull();
  });

  it('a rejoining player becomes host if no host is connected', () => {
    const m = new RoomManager();
    const { room, player: ana } = m.createRoom('Ana');
    const { player: luis } = m.joinRoom(room.code, 'Luis');
    m.setConnected(room, ana.id, false);
    m.setConnected(room, luis.id, false);
    expect(room.hostId).toBe(luis.id); // passed to Luis, then nobody left to hand it to
    m.rejoin(room.code, ana.id, ana.token);
    expect(room.hostId).toBe(ana.id);
  });

  it('finished games move the room to finished and allow restart', () => {
    const m = new RoomManager({ seed: () => 1 });
    const { room, player: ana } = m.createRoom('Ana');
    m.joinRoom(room.code, 'Luis');
    m.startGame(room, ana.id);
    room.game.status = 'playing';
    // Force a win: give the active player a complete burger minus one ingredient in hand.
    const active = room.game.players[room.game.turn];
    const kinds = ['meat', 'cheese', 'lettuce'];
    active.body = kinds.map((kind, i) => ({
      card: { id: `w${i}`, type: 'ingredient', kind },
      modifiers: [],
    }));
    active.hand = [{ id: 'w3', type: 'ingredient', kind: 'tomato' }];
    const res = m.act(room, active.id, { type: 'playCard', cardId: 'w3' });
    expect(res.error).toBeUndefined();
    expect(room.status).toBe('finished');
    expect(m.act(room, active.id, { type: 'discard', cardIds: ['x'] }).error).toBeTruthy();
    expect(m.restart(room, ana.id).error).toBeUndefined();
    expect(room.status).toBe('playing');
    expect(room.log[0]).toBe(`Partida anterior: ganó ${active.name}`);
  });
});
