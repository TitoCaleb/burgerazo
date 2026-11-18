import { nanoid } from 'nanoid';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  winner_name TEXT,
  players JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS room_snapshots (
  room_code TEXT PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;

const noop = {
  enabled: false,
  init: async () => {},
  loadRooms: async () => [],
  saveRoom: () => {},
  deleteRoom: () => {},
  recordGame: () => {},
  idle: async () => {},
  close: async () => {},
};

/**
 * Optional persistence. Without a database URL every method is a no-op.
 * Writes are fire-and-forget: they never block or break the game; errors are only logged.
 * `Pool` can be injected for tests.
 */
export async function createDb({ url = process.env.DATABASE_URL, Pool, logger = console } = {}) {
  if (!url) return noop;
  if (!Pool) ({ Pool } = (await import('pg')).default);
  // Neon connection strings already carry `sslmode=require`; certificates are verified.
  const pool = new Pool({ connectionString: url });

  const fire = (label, sql, params) => {
    pool.query(sql, params).catch((err) => logger.error(`[db] ${label} falló:`, err.message));
  };

  // Snapshot writes are serialized per room and coalesced: only the latest state is written,
  // so an older snapshot can never overwrite a newer one. `null` means delete.
  const pending = new Map();
  const flushing = new Set();
  const flush = async (code) => {
    if (flushing.has(code)) return;
    flushing.add(code);
    while (pending.has(code)) {
      const state = pending.get(code);
      pending.delete(code);
      try {
        if (state === null) {
          await pool.query('DELETE FROM room_snapshots WHERE room_code = $1', [code]);
        } else {
          await pool.query(
            `INSERT INTO room_snapshots (room_code, state, updated_at) VALUES ($1, $2, now())
             ON CONFLICT (room_code) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
            [code, state],
          );
        }
      } catch (err) {
        logger.error('[db] snapshot falló:', err.message);
      }
    }
    flushing.delete(code);
  };
  const queueSnapshot = (code, state) => {
    pending.set(code, state);
    flush(code);
  };

  return {
    enabled: true,

    async init() {
      await pool.query(SCHEMA);
    },

    async loadRooms() {
      const { rows } = await pool.query('SELECT state FROM room_snapshots');
      return rows.map((r) => r.state);
    },

    saveRoom(room) {
      queueSnapshot(room.code, JSON.stringify(room));
    },

    deleteRoom(code) {
      queueSnapshot(code, null);
    },

    recordGame(room) {
      const winner = room.game?.players.find((p) => p.id === room.game.winnerId);
      fire(
        'recordGame',
        `INSERT INTO games (id, room_code, started_at, ended_at, winner_name, players)
         VALUES ($1, $2, $3, now(), $4, $5)`,
        [
          nanoid(),
          room.code,
          room.startedAt ? new Date(room.startedAt) : null,
          winner?.name ?? null,
          JSON.stringify(room.players.map((p) => ({ id: p.id, name: p.name }))),
        ],
      );
    },

    /** Waits for queued snapshot writes (used on shutdown and in tests). */
    async idle() {
      while (flushing.size) await new Promise((r) => setTimeout(r, 5));
    },

    async close() {
      await this.idle();
      await pool.end();
    },
  };
}
