import { describe, it, expect, vi } from 'vitest';
import { createDb } from '../../server/db.js';
import { RoomManager } from '../../server/rooms.js';

/** In-memory fake of pg.Pool that understands the few queries db.js makes. */
function fakePool({ failOn } = {}) {
  const tables = { snapshots: new Map(), games: [] };
  const queries = [];
  class Pool {
    async query(sql, params = []) {
      queries.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
      await new Promise((r) => setTimeout(r, 1));
      if (failOn && sql.includes(failOn)) throw new Error('boom');
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.startsWith('SELECT state')) {
        return { rows: [...tables.snapshots.values()].map((s) => ({ state: JSON.parse(s) })) };
      }
      if (sql.includes('INSERT INTO room_snapshots')) tables.snapshots.set(params[0], params[1]);
      if (sql.startsWith('DELETE')) tables.snapshots.delete(params[0]);
      if (sql.includes('INSERT INTO games')) tables.games.push(params);
      return { rows: [] };
    }
    async end() {}
  }
  return { Pool, tables, queries };
}

const wire = (db) =>
  new RoomManager({
    seed: () => 5,
    onChange: (room) => db.saveRoom(room),
    onDelete: (code) => db.deleteRoom(code),
    onGameEnd: (room) => db.recordGame(room),
  });

describe('db without DATABASE_URL', () => {
  it('is a no-op', async () => {
    const db = await createDb({ url: '' });
    expect(db.enabled).toBe(false);
    await db.init();
    expect(await db.loadRooms()).toEqual([]);
    db.saveRoom({ code: 'X' });
    db.deleteRoom('X');
    db.recordGame({});
    await db.idle();
    await db.close();
  });
});

describe('db with a mocked database', () => {
  it('creates tables, saves snapshots and restores rooms after a restart', async () => {
    const fake = fakePool();
    const db = await createDb({ url: 'postgres://x', Pool: fake.Pool });
    await db.init();
    expect(fake.queries[0]).toMatch(/^CREATE TABLE/);

    const m1 = wire(db);
    const { room, player: ana } = m1.createRoom('Ana');
    const { player: luis } = m1.joinRoom(room.code, 'Luis');
    m1.startGame(room, ana.id);
    const active = room.game.players[room.game.turn];
    m1.act(room, active.id, { type: 'discard', cardIds: [active.hand[0].id] });
    await db.idle();

    // Simulated restart: a fresh manager restored from the snapshots.
    const m2 = wire(db);
    expect(m2.restore(await db.loadRooms())).toBe(1);
    const restored = m2.get(room.code);
    expect(restored.game).toEqual(room.game);
    expect(restored.players.every((p) => !p.connected)).toBe(true);
    expect(m2.rejoin(room.code, luis.id, luis.token).player.id).toBe(luis.id);
    await db.close();
  });

  it('coalesces writes so the latest snapshot wins, and deletes rooms', async () => {
    const fake = fakePool();
    const db = await createDb({ url: 'postgres://x', Pool: fake.Pool });
    for (let i = 0; i < 5; i++) db.saveRoom({ code: 'ABCD', n: i });
    await db.idle();
    expect(JSON.parse(fake.tables.snapshots.get('ABCD')).n).toBe(4);
    expect(fake.queries.filter((q) => q.startsWith('INSERT')).length).toBeLessThan(5);
    db.deleteRoom('ABCD');
    await db.idle();
    expect(fake.tables.snapshots.size).toBe(0);
  });

  it('records finished games with the winner name', async () => {
    const fake = fakePool();
    const db = await createDb({ url: 'postgres://x', Pool: fake.Pool });
    const m = wire(db);
    const { room, player: ana } = m.createRoom('Ana');
    m.joinRoom(room.code, 'Luis');
    m.startGame(room, ana.id);
    const active = room.game.players[room.game.turn];
    active.body = ['meat', 'cheese', 'lettuce'].map((kind, i) => ({
      card: { id: `w${i}`, type: 'ingredient', kind },
      modifiers: [],
    }));
    active.hand = [{ id: 'w3', type: 'ingredient', kind: 'tomato' }];
    m.act(room, active.id, { type: 'playCard', cardId: 'w3' });
    await new Promise((r) => setTimeout(r, 10));
    expect(fake.tables.games).toHaveLength(1);
    expect(fake.tables.games[0][3]).toBe(active.name);
  });

  it('logs errors without throwing', async () => {
    const fake = fakePool({ failOn: 'INSERT' });
    const logger = { error: vi.fn() };
    const db = await createDb({ url: 'postgres://x', Pool: fake.Pool, logger });
    db.saveRoom({ code: 'ABCD' });
    db.recordGame({ code: 'ABCD', players: [] });
    await db.idle();
    await new Promise((r) => setTimeout(r, 10));
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('cleanup and leaving the last player delete snapshots', () => {
    const onDelete = vi.fn();
    let t = 0;
    const m = new RoomManager({ onDelete, now: () => t });
    const a = m.createRoom('Ana');
    m.leave(a.room, a.player.id);
    const b = m.createRoom('Bea');
    m.setConnected(b.room, b.player.id, false);
    t = 60 * 60 * 1000;
    m.cleanup();
    expect(onDelete.mock.calls.map((c) => c[0])).toEqual([a.room.code, b.room.code]);
  });
});
