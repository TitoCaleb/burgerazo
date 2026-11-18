import { describe, it, expect, afterEach } from 'vitest';
import { RoomManager } from '../../server/rooms.js';
import { startServer, emit, waitFor } from './helpers.js';

/** Manual clock + timers so tests control time. */
function fakeTime() {
  let t = 1000;
  const timers = new Map();
  let nextId = 1;
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, at: t + ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      t += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= t) {
          timers.delete(id);
          timer.fn();
        }
      }
    },
    pending: () => timers.size,
  };
}

function setup(turnSeconds = 30) {
  const time = fakeTime();
  const timeouts = [];
  const m = new RoomManager({
    seed: () => 3,
    now: time.now,
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
    onTimeout: (room, events) => timeouts.push(events),
  });
  const { room, player: ana } = m.createRoom('Ana');
  const { player: luis } = m.joinRoom(room.code, 'Luis');
  expect(m.updateSettings(room, ana.id, { turnSeconds }).error).toBeUndefined();
  m.startGame(room, ana.id);
  return { m, room, ana, luis, time, timeouts };
}

describe('turn timer (RoomManager)', () => {
  it('auto-discards the first card when time runs out and passes the turn', () => {
    const { m, room, time, timeouts } = setup(30);
    const active = room.game.players[room.game.turn];
    const firstCard = active.hand[0];
    expect(m.turnRemainingMs(room)).toBe(30000);

    time.advance(29999);
    expect(timeouts).toHaveLength(0);
    time.advance(1);
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0][0].text).toBe(`⏰ Se acabó el tiempo de ${active.name}`);
    expect(room.game.discard.at(-1).id).toBe(firstCard.id);
    expect(room.game.players[room.game.turn].id).not.toBe(active.id);
    expect(room.log).toContain(`⏰ Se acabó el tiempo de ${active.name}`);
    expect(m.turnRemainingMs(room)).toBe(30000); // next turn restarted
  });

  it('a normal play resets the clock and cancels the old timer', () => {
    const { m, room, time, timeouts } = setup(30);
    time.advance(20000);
    const active = room.game.players[room.game.turn];
    m.act(room, active.id, { type: 'discard', cardIds: [active.hand[0].id] });
    expect(time.pending()).toBe(1);
    time.advance(15000);
    expect(timeouts).toHaveLength(0);
    expect(m.turnRemainingMs(room)).toBe(15000);
  });

  it('no timer when turnSeconds is 0, and the deadline clears when the game ends', () => {
    const { room, time, m } = setup(0);
    expect(room.turnDeadline).toBeNull();
    expect(m.turnRemainingMs(room)).toBeNull();
    expect(time.pending()).toBe(0);

    const s = setup(30);
    const active = s.room.game.players[s.room.game.turn];
    active.body = ['meat', 'cheese', 'lettuce'].map((kind, i) => ({
      card: { id: `w${i}`, type: 'ingredient', kind },
      modifiers: [],
    }));
    active.hand = [{ id: 'w3', type: 'ingredient', kind: 'tomato' }];
    s.m.act(s.room, active.id, { type: 'playCard', cardId: 'w3' });
    expect(s.room.status).toBe('finished');
    expect(s.room.turnDeadline).toBeNull();
    expect(s.time.pending()).toBe(0);
  });

  it('settings: host only, valid values, not mid-game', () => {
    const time = fakeTime();
    const m = new RoomManager({
      now: time.now,
      setTimer: time.setTimer,
      clearTimer: time.clearTimer,
    });
    const { room, player: ana } = m.createRoom('Ana');
    const { player: luis } = m.joinRoom(room.code, 'Luis');
    expect(m.updateSettings(room, luis.id, { turnSeconds: 30 }).error).toBe(
      'Solo el anfitrión puede cambiar esto',
    );
    expect(m.updateSettings(room, ana.id, { turnSeconds: 45 }).error).toBe(
      'Tiempo de turno inválido',
    );
    expect(m.updateSettings(room, ana.id, { turnSeconds: 60 }).settings).toEqual({
      turnSeconds: 60,
    });
    expect(RoomManager.publicState(room).settings).toEqual({ turnSeconds: 60 });
    m.startGame(room, ana.id);
    expect(m.updateSettings(room, ana.id, { turnSeconds: 0 }).error).toBe(
      'No se puede cambiar en plena partida',
    );
  });

  it('deleting a room cancels its timer; restored games get a fresh turn', () => {
    const { m, room, ana, luis, time } = setup(30);
    const snapshot = structuredClone(room);
    m.setConnected(room, ana.id, false);
    m.setConnected(room, luis.id, false);
    time.advance(31 * 60 * 1000); // fires the turn timers, then cleanup below
    m.cleanup();
    expect(m.get(room.code)).toBeNull();
    expect(time.pending()).toBe(0);

    const time2 = fakeTime();
    const m2 = new RoomManager({
      now: time2.now,
      setTimer: time2.setTimer,
      clearTimer: time2.clearTimer,
    });
    m2.restore([snapshot]);
    expect(m2.turnRemainingMs(m2.get(room.code))).toBe(30000);
    expect(time2.pending()).toBe(1);
  });
});

describe('turn timer over sockets', () => {
  let server;
  afterEach(() => server?.close());

  it('broadcasts settings and the auto-discard to every player', async () => {
    // Real timers, but 1 "second" = 5 ms so the test is fast.
    const manager = new RoomManager({
      seed: () => 9,
      setTimer: (fn, ms) => setTimeout(fn, ms / 200),
    });
    server = await startServer({ manager });
    const a = server.client();
    const b = server.client();
    const created = await emit(a, 'room:create', { name: 'Ana' });
    await emit(b, 'room:join', { code: created.code, name: 'Luis' });

    expect((await emit(b, 'room:settings', { turnSeconds: 30 })).ok).toBe(false);
    expect(await emit(a, 'room:settings', { turnSeconds: 30 })).toEqual({
      ok: true,
      settings: { turnSeconds: 30 },
    });
    await waitFor(b, 'room:state', (r) => r.settings.turnSeconds === 30);

    await emit(a, 'game:start');
    const first = await waitFor(b, 'game:state', (v) => v.status === 'playing');
    expect(first.turnSeconds).toBe(30);
    expect(first.turnRemainingMs).toBeGreaterThan(0);
    expect(first.turnRemainingMs).toBeLessThanOrEqual(30000);

    const deadline = Date.now() + 3000;
    while (!b.received['game:event'].some((e) => e.text.startsWith('⏰ Se acabó el tiempo'))) {
      if (Date.now() > deadline) throw new Error('no timeout event');
      await new Promise((r) => setTimeout(r, 10));
    }
    const after = await waitFor(b, 'game:state', (v) => v.turnNumber > first.turnNumber);
    expect(after.turnPlayerId).not.toBe(first.turnPlayerId);
  });
});
