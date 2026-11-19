import { customAlphabet, nanoid } from 'nanoid';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_STATUS,
  GAME_STATUS,
  CHAT_MAX_LENGTH,
  CHAT_HISTORY_SIZE,
  TURN_TIMER_OPTIONS,
} from '../shared/constants.js';
import { createGame } from './engine/state.js';
import { applyAction } from './engine/actions.js';

// No O/0/I/1 to avoid confusion when reading codes aloud.
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const makeCode = customAlphabet(ROOM_ALPHABET, 4);
export const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;
const LOG_SIZE = 30;
const MAX_NAME = 20;

const randomSeed = () => Math.floor(Math.random() * 2 ** 32);
const defaultSetTimer = (fn, ms) => {
  const t = setTimeout(fn, ms);
  t.unref?.();
  return t;
};

function cleanName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return trimmed.length >= 1 && trimmed.length <= MAX_NAME ? trimmed : null;
}

/**
 * Manages rooms in memory. No sockets here: socketHandlers.js wires this to Socket.io.
 * Persistence hooks: `onChange(room)` after every state change, `onDelete(code)` when a
 * room is removed and `onGameEnd(room)` when a game finishes.
 * Turn timer: when a turn runs out the active player discards their first card
 * automatically and `onTimeout(room, events)` is called so the socket layer can broadcast.
 */
export class RoomManager {
  constructor({
    now = Date.now,
    seed = randomSeed,
    onChange = () => {},
    onDelete = () => {},
    onGameEnd = () => {},
    onTimeout = () => {},
    setTimer = defaultSetTimer,
    clearTimer = clearTimeout,
  } = {}) {
    this.rooms = new Map();
    this.now = now;
    this.seed = seed;
    this.onChange = onChange;
    this.onDelete = onDelete;
    this.onGameEnd = onGameEnd;
    this.onTimeout = onTimeout;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.timers = new Map(); // room code -> timer handle (kept out of the snapshot)
  }

  /** Restores rooms from snapshots (after a server restart). Everyone starts disconnected. */
  restore(snapshots) {
    for (const room of snapshots) {
      if (!room?.code || this.rooms.has(room.code)) continue;
      for (const p of room.players) p.connected = false;
      room.chat ??= [];
      room.settings ??= { turnSeconds: 0 };
      room.emptySince = this.now();
      this.rooms.set(room.code, room);
      this.#scheduleTurn(room); // a restored game gets a fresh full turn
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
      chat: [],
      settings: { turnSeconds: 0 },
      turnDeadline: null,
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
        this.#deleteRoom(room.code);
        return;
      }
      if (room.hostId === playerId) room.hostId = room.players[0].id;
      this.onChange(room);
    } else {
      this.setConnected(room, playerId, false);
    }
  }

  /** Host-only: removes another player from the lobby (e.g. someone who left and got stuck offline). */
  kick(room, hostId, targetId) {
    if (room.hostId !== hostId) return { error: 'Solo el anfitrión puede expulsar' };
    if (room.status !== ROOM_STATUS.LOBBY)
      return { error: 'Solo se puede expulsar antes de empezar' };
    if (targetId === hostId) return { error: 'No puedes expulsarte a ti mismo' };
    const target = room.players.find((p) => p.id === targetId);
    if (!target) return { error: 'Ese jugador no está en la sala' };
    room.players = room.players.filter((p) => p.id !== targetId);
    this.onChange(room);
    return { player: target };
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
    this.#scheduleTurn(room);
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
    this.#scheduleTurn(room);
    this.onChange(room);
    return { events: result.events };
  }

  /** Host-only room settings, editable outside of a running game. */
  updateSettings(room, playerId, settings) {
    if (room.hostId !== playerId) return { error: 'Solo el anfitrión puede cambiar esto' };
    if (room.status === ROOM_STATUS.PLAYING)
      return { error: 'No se puede cambiar en plena partida' };
    const seconds = Number(settings?.turnSeconds);
    if (!TURN_TIMER_OPTIONS.includes(seconds)) return { error: 'Tiempo de turno inválido' };
    room.settings = { ...room.settings, turnSeconds: seconds };
    this.onChange(room);
    return { settings: room.settings };
  }

  /** Milliseconds left in the current turn, or null without a timer. */
  turnRemainingMs(room) {
    return room.turnDeadline ? Math.max(0, room.turnDeadline - this.now()) : null;
  }

  #scheduleTurn(room) {
    const existing = this.timers.get(room.code);
    if (existing) this.clearTimer(existing);
    this.timers.delete(room.code);
    const seconds = room.settings?.turnSeconds ?? 0;
    if (room.status !== ROOM_STATUS.PLAYING || !seconds) {
      room.turnDeadline = null;
      return;
    }
    room.turnDeadline = this.now() + seconds * 1000;
    const { code } = room;
    const turnNumber = room.game.turnNumber;
    this.timers.set(
      code,
      this.setTimer(() => this.#expireTurn(code, turnNumber), seconds * 1000),
    );
  }

  #expireTurn(code, turnNumber) {
    this.timers.delete(code);
    const room = this.get(code);
    if (!room || room.status !== ROOM_STATUS.PLAYING || room.game.turnNumber !== turnNumber) return;
    const player = room.game.players[room.game.turn];
    const card = player.hand[0];
    if (!card) return;
    const notice = { text: `⏰ Se acabó el tiempo de ${player.name}` };
    room.log = [...room.log, notice.text].slice(-LOG_SIZE);
    const result = this.act(room, player.id, { type: 'discard', cardIds: [card.id] });
    if (!result.error) this.onTimeout(room, [notice, ...result.events]);
  }

  #deleteRoom(code) {
    const timer = this.timers.get(code);
    if (timer) this.clearTimer(timer);
    this.timers.delete(code);
    this.rooms.delete(code);
    this.onDelete(code);
  }

  /** Adds a chat message from a room member. Returns { message } or { error }. */
  addChat(room, playerId, text) {
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { error: 'No estás en esta sala' };
    if (typeof text !== 'string') return { error: 'Mensaje inválido' };
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return { error: 'El mensaje está vacío' };
    if (clean.length > CHAT_MAX_LENGTH) {
      return { error: `Máximo ${CHAT_MAX_LENGTH} caracteres` };
    }
    const message = {
      id: nanoid(8),
      playerId,
      name: player.name,
      text: clean,
      at: this.now(),
    };
    room.chat = [...(room.chat ?? []), message].slice(-CHAT_HISTORY_SIZE);
    this.onChange(room);
    return { message };
  }

  /** Deletes rooms that have had nobody connected for longer than the TTL. */
  cleanup() {
    const deleted = [];
    for (const room of this.rooms.values()) {
      if (room.emptySince !== null && this.now() - room.emptySince > EMPTY_ROOM_TTL_MS) {
        this.#deleteRoom(room.code);
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
      settings: room.settings ?? { turnSeconds: 0 },
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
