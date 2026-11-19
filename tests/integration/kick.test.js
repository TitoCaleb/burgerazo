import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startServer, emit, waitFor } from './helpers.js';
import { RoomManager } from '../../server/rooms.js';

let server;
beforeEach(async () => {
  server = await startServer({ manager: new RoomManager({ seed: () => 1 }) });
});
afterEach(() => server.close());

describe('kicking players from the lobby', () => {
  it('host kicks a player, who is notified and cannot rejoin', async () => {
    const ana = server.client();
    const created = await emit(ana, 'room:create', { name: 'Ana' });
    const luis = server.client();
    const joined = await emit(luis, 'room:join', { code: created.code, name: 'Luis' });
    await waitFor(ana, 'room:state', (s) => s.players.length === 2);

    const kicked = new Promise((resolve) => luis.on('room:kicked', resolve));
    expect((await emit(luis, 'room:kick', { playerId: created.playerId })).error).toBe(
      'Solo el anfitrión puede expulsar',
    );
    expect((await emit(ana, 'room:kick', { playerId: created.playerId })).error).toBe(
      'No puedes expulsarte a ti mismo',
    );
    expect((await emit(ana, 'room:kick', { playerId: joined.playerId })).ok).toBe(true);
    expect(await kicked).toEqual({ code: created.code });
    await waitFor(ana, 'room:state', (s) => s.players.length === 1);

    const rejoin = await emit(luis, 'room:rejoin', {
      code: created.code,
      playerId: joined.playerId,
      token: joined.token,
    });
    expect(rejoin.ok).toBe(false);
    // The name is free again, so they can join fresh.
    expect((await emit(luis, 'room:join', { code: created.code, name: 'Luis' })).ok).toBe(true);
  });

  it('frees a stuck offline player so the name can be reused', async () => {
    const ana = server.client();
    const created = await emit(ana, 'room:create', { name: 'Ana' });
    const ghost = server.client();
    const joined = await emit(ghost, 'room:join', { code: created.code, name: 'Luis' });
    ghost.disconnect();
    await waitFor(ana, 'room:state', (s) => s.players.some((p) => !p.connected));
    const retry = server.client();
    expect((await emit(retry, 'room:join', { code: created.code, name: 'Luis' })).ok).toBe(false);
    expect((await emit(ana, 'room:kick', { playerId: joined.playerId })).ok).toBe(true);
    expect((await emit(retry, 'room:join', { code: created.code, name: 'Luis' })).ok).toBe(true);
  });

  it('cannot kick once the game started', async () => {
    const ana = server.client();
    const created = await emit(ana, 'room:create', { name: 'Ana' });
    const luis = server.client();
    const joined = await emit(luis, 'room:join', { code: created.code, name: 'Luis' });
    await emit(ana, 'game:start');
    expect((await emit(ana, 'room:kick', { playerId: joined.playerId })).error).toBe(
      'Solo se puede expulsar antes de empezar',
    );
  });
});
