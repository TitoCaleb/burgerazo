import { customAlphabet, nanoid } from 'nanoid';
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_STATUS, GAME_STATUS } from '../shared/constants.js';
import { createGame } from './engine/state.js';
import { applyAction } from './engine/actions.js';

// No O/0/I/1 to avoid confusion when reading codes aloud.
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const makeCode = customAlphabet(ROOM_ALPHABET, 4);
export const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;
const LOG_SIZE = 30;
const MAX_NAME = 20;

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

function cleanName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed.length >= 1 && trimmed.length <= MAX_NAME ? trimmed : null;
}

/**
 * Manages rooms in memory. No sockets here: socketHandlers.js wires this to Socket.io.
 * Persistence hooks: `onChange(room)` after every state change, `onDelete(code)` when a
 * room is removed and `onGameEnd(room)` when a game finishes.
 */
export class RoomManager {
  constructor({
    now = Date.now,
    seed = randomSeed,
    onChange = () => {},
    onDelete = () => {},
    onGameEnd = () => {},
  } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.seed = seed;
    this.onChange = onChange;
    this.onDelete = onDelete;
    this.onGameEnd = onGameEnd;
  }

  /** Restores rooms from snapshots (after a server restart). Everyone starts disconnected. */
  restore(snapshots) {
    for (const room of snapshots) {
      if (!room?.code || this.rooms.has(room.code)) continue;
      for (const p of room.players) p.connected = false;
      room.emptySince = this.now();
      this.rooms.set(room.code, room);
    }
    return this.rooms.size;
  }

  get(code) {
    return this.rooms.get(String(code ?? '').toUpperCase()) ?? null;
  }

  createRoom(name) {
    const clean = cleanName(name);
    if (!clean) return { error: `Escribe un nombre de 1 a ${MAX_NAME} letras` };
    let code;
    do code = makeCode();
    while (this.rooms.has(code));
    const room = {
      code,
      hostId: null,
      players: [],
      status: ROOM_STATUS.LOBBY,
      game: null,
      log: [],
      emptySince: null,
    };
    this.rooms.set(code, room);
    const player = this.#addPlayer(room, clean);
    room.hostId = player.id;
    this.onChange(room);
    return { room, player };
  }

  joinRoom(code, name) {
    const room = this.get(code);
    if (!room) return { error: 'No existe una sala con ese código' };
    const clean = cleanName(name);
    if (!clean) return { error: `Escribe un nombre de 1 a ${MAX_NAME} letras` };
    if (room.status !== ROOM_STATUS.LOBBY) return { error: 'La partida ya empezó' };
    if (room.players.length >= MAX_PLAYERS) return { error: 'La sala está llena' };
    if (room.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      return { error: 'Ya hay alguien con ese nombre en la sala' };
    }
    const player = this.#addPlayer(room, clean);
    this.onChange(room);
    return { room, player };
  }

  rejoin(code, playerId, token) {
    const room = this.get(code);
    if (!room) return { error: 'La sala ya no existe' };
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.token !== token) return { error: 'No estabas en esa sala' };
    this.setConnected(room, player.id, true);
    return { room, player };
  }

  /** Leaving the lobby removes you; leaving mid-game just disconnects you (you can come back). */
  leave(room, playerId) {
    if (room.status === ROOM_STATUS.LOBBY) {
      room.players = room.players.filter((p) => p.id !== playerId);
      if (room.players.length === 0) {
        this.rooms.delete(room.code);
        this.onDelete(room.code);
        return;
      }
      if (room.hostId === playerId) room.hostId = room.players[0].id;
      this.onChange(room);
    } else {
      this.setConnected(room, playerId, false);
    }
  }

  setConnected(room, playerId, connected) {
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;
    player.connected = connected;
    if (!connected && room.hostId === playerId) {
      const next = this.#nextConnected(room, playerId);
      if (next) room.hostId = next.id;
    }
    if (connected && !room.players.some((p) => p.id === room.hostId && p.connected)) {
      room.hostId = playerId;
    }
    room.emptySince = room.players.some((p) => p.connected) ? null : this.now();
    this.onChange(room);
  }

  startGame(room, playerId) {
    if (room.hostId !== playerId) return { error: 'Solo el anfitrión puede empezar' };
    if (room.status === ROOM_STATUS.PLAYING) return { error: 'La partida ya empezó' };
    if (room.players.length < MIN_PLAYERS) {
      return { error: `Se necesitan al menos ${MIN_PLAYERS} jugadores` };
    }
    const previous = room.game?.status === GAME_STATUS.FINISHED ? room.game : null;
    room.game = createGame({ players: room.players, seed: this.seed() });
    room.status = ROOM_STATUS.PLAYING;
    room.startedAt = this.now();
    const first = room.game.players[room.game.turn].name;
    room.log = [`🍔 ¡Empieza la partida! Comienza ${first}`];
    if (previous) {
      const winner = previous.players.find((p) => p.id === previous.winnerId);
      room.log.unshift(`Partida anterior: ${winner ? `ganó ${winner.name}` : 'empate'}`);
    }
    this.onChange(room);
    return { events: [{ text: room.log.at(-1) }] };
  }

  restart(room, playerId) {
    if (room.status !== ROOM_STATUS.FINISHED) return { error: 'La partida no ha terminado' };
    return this.startGame(room, playerId);
  }

  act(room, playerId, action) {
    if (room.status !== ROOM_STATUS.PLAYING) return { error: 'No hay una partida en curso' };
    const result = applyAction(room.game, playerId, action);
    if (result.error) return { error: result.error };
    room.game = result.state;
    room.log = [...room.log, ...result.events.map((e) => e.text)].slice(-LOG_SIZE);
    if (room.game.status === GAME_STATUS.FINISHED) {
      room.status = ROOM_STATUS.FINISHED;
      this.onGameEnd(room);
    }
    this.onChange(room);
    return { events: result.events };
  }

  /** Deletes rooms that have had nobody connected for longer than the TTL. */
  cleanup() {
    const deleted = [];
    for (const room of this.rooms.values()) {
      if (room.emptySince !== null && this.now() - room.emptySince > EMPTY_ROOM_TTL_MS) {
        this.rooms.delete(room.code);
        this.onDelete(room.code);
        deleted.push(room.code);
      }
    }
    return deleted;
  }

  /** Public room info (no tokens, no socket ids). */
  static publicState(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      players: room.players.map(({ id, name, connected }) => ({ id, name, connected })),
    };
  }

  #addPlayer(room, name) {
    const player = { id: nanoid(10), token: nanoid(21), name, connected: true };
    room.players.push(player);
    room.emptySince = null;
    return player;
  }

  #nextConnected(room, fromId) {
    const n = room.players.length;
    const start = room.players.findIndex((p) => p.id === fromId);
    for (let i = 1; i < n; i++) {
      const p = room.players[(start + i) % n];
      if (p.connected) return p;
    }
    return null;
  }
}
