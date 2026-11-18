import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startServer, emit } from './helpers.js';
import { RoomManager } from '../../server/rooms.js';

let server;
beforeEach(async () => {
  server = await startServer();
});
afterEach(() => server.close());

/** Collects chat events for a socket. */
function track(socket) {
  socket.chat = { messages: [], history: [] };
  socket.on('chat:message', (m) => socket.chat.messages.push(m));
  socket.on('chat:history', (h) => socket.chat.history.push(h));
  return socket;
}

const until = async (fn, timeout = 2000) => {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

async function twoPlayers() {
  const ana = track(server.client());
  const luis = track(server.client());
  const created = await emit(ana, 'room:create', { name: 'Ana' });
  const joined = await emit(luis, 'room:join', { code: created.code, name: 'Luis' });
  return { ana, luis, created, joined };
}

describe('chat', () => {
  it('broadcasts messages to everyone in the room', async () => {
    const { ana, luis, created } = await twoPlayers();
    const outsider = track(server.client());
    await emit(outsider, 'room:create', { name: 'Otro' });

    expect(await emit(ana, 'chat:send', { text: '  hola   a todos  ' })).toEqual({ ok: true });
    await until(() => luis.chat.messages.length === 1 && ana.chat.messages.length === 1);
    const msg = luis.chat.messages[0];
    expect(msg).toMatchObject({ playerId: created.playerId, name: 'Ana', text: 'hola a todos' });
    expect(typeof msg.at).toBe('number');
    expect(outsider.chat.messages).toEqual([]);
  });

  it('rejects empty, too long, invalid messages and non-members', async () => {
    const { ana } = await twoPlayers();
    expect((await emit(ana, 'chat:send', { text: '   ' })).error).toBe('El mensaje está vacío');
    expect((await emit(ana, 'chat:send', { text: 'x'.repeat(201) })).error).toBe(
      'Máximo 200 caracteres',
    );
    expect((await emit(ana, 'chat:send', { text: 42 })).error).toBe('Mensaje inválido');
    expect((await emit(server.client(), 'chat:send', { text: 'hola' })).error).toBe(
      'No estás en una sala',
    );
  });

  it('rate limits bursts', async () => {
    const { ana } = await twoPlayers();
    const replies = [];
    for (let i = 0; i < 7; i++) replies.push(await emit(ana, 'chat:send', { text: `m${i}` }));
    expect(replies.filter((r) => r.ok)).toHaveLength(5);
    expect(replies.at(-1).error).toBe('Más despacio 🙂');
  });

  it('sends the history on join and on rejoin', async () => {
    const { ana, luis, created, joined } = await twoPlayers();
    await emit(ana, 'chat:send', { text: 'primero' });

    const sofi = track(server.client());
    await emit(sofi, 'room:join', { code: created.code, name: 'Sofi' });
    await until(() => sofi.chat.history.length === 1);
    expect(sofi.chat.history[0].map((m) => m.text)).toEqual(['primero']);

    luis.disconnect();
    const back = track(server.client());
    await emit(back, 'room:rejoin', {
      code: created.code,
      playerId: joined.playerId,
      token: joined.token,
    });
    await until(() => back.chat.history.length === 1);
    expect(back.chat.history[0].map((m) => m.text)).toEqual(['primero']);
  });
});

describe('RoomManager.addChat', () => {
  it('keeps only the last 50 messages and survives old snapshots without chat', () => {
    const m = new RoomManager();
    const { room, player } = m.createRoom('Ana');
    for (let i = 0; i < 60; i++) m.addChat(room, player.id, `m${i}`);
    expect(room.chat).toHaveLength(50);
    expect(room.chat[0].text).toBe('m10');
    expect(m.addChat(room, 'ghost', 'hola').error).toBe('No estás en esta sala');

    const m2 = new RoomManager();
    const snapshot = structuredClone(room);
    delete snapshot.chat;
    m2.restore([snapshot]);
    expect(m2.get(room.code).chat).toEqual([]);
  });
});
