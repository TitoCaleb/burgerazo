import { EVENTS } from '../shared/constants.js';
import { RoomManager } from './rooms.js';
import { getPlayerView } from './engine/state.js';

/** Wires Socket.io events to the RoomManager. */
export function registerSocketHandlers(io, manager) {
  // playerId -> socket id currently representing that player
  const sockets = new Map();

  const broadcastRoom = (room) => {
    io.to(room.code).emit(EVENTS.ROOM_STATE, RoomManager.publicState(room));
  };

  const sendGameState = (room, onlyPlayerId) => {
    if (!room.game) return;
    for (const p of room.players) {
      if (onlyPlayerId && p.id !== onlyPlayerId) continue;
      const socketId = sockets.get(p.id);
      if (!socketId) continue;
      io.to(socketId).emit(EVENTS.GAME_STATE, {
        ...getPlayerView(room.game, p.id),
        log: room.log,
        turnRemainingMs: manager.turnRemainingMs(room),
        turnSeconds: room.settings?.turnSeconds ?? 0,
      });
    }
  };

  const sendEvents = (room, events) => {
    for (const e of events) io.to(room.code).emit(EVENTS.GAME_EVENT, e);
  };

  manager.onTimeout = (room, events) => {
    sendGameState(room);
    sendEvents(room, events);
    broadcastRoom(room);
  };

  io.on('connection', (socket) => {
    const reply = (ack, payload) => {
      if (typeof ack === 'function') ack(payload);
      else if (payload.error) socket.emit(EVENTS.ERROR, { message: payload.error });
    };
    const fail = (ack, error) => reply(ack, { ok: false, error });

    const currentRoom = () => {
      const { code, playerId } = socket.data;
      const room = code ? manager.get(code) : null;
      return room && room.players.some((p) => p.id === playerId) ? room : null;
    };

    const bind = (room, player) => {
      const previous = sockets.get(player.id);
      if (previous && previous !== socket.id) io.sockets.sockets.get(previous)?.leave(room.code);
      socket.data = { code: room.code, playerId: player.id };
      sockets.set(player.id, socket.id);
      socket.join(room.code);
      socket.emit(EVENTS.CHAT_HISTORY, room.chat ?? []);
    };

    // Simple per-socket rate limit for chat: at most CHAT_BURST messages per CHAT_WINDOW_MS.
    let chatTimes = [];
    const chatAllowed = () => {
      const now = Date.now();
      chatTimes = chatTimes.filter((t) => now - t < CHAT_WINDOW_MS);
      if (chatTimes.length >= CHAT_BURST) return false;
      chatTimes.push(now);
      return true;
    };

    socket.on(EVENTS.CHAT_SEND, (payload, ack) => {
      const room = currentRoom();
      if (!room) return fail(ack, 'No estás en una sala');
      if (!chatAllowed()) return fail(ack, 'Más despacio 🙂');
      const result = manager.addChat(room, socket.data.playerId, payload?.text);
      if (result.error) return fail(ack, result.error);
      reply(ack, { ok: true });
      io.to(room.code).emit(EVENTS.CHAT_MESSAGE, result.message);
    });

    socket.on(EVENTS.ROOM_CREATE, (payload, ack) => {
      const result = manager.createRoom(payload?.name);
      if (result.error) return fail(ack, result.error);
      bind(result.room, result.player);
      reply(ack, { ok: true, code: result.room.code, ...credentials(result.player) });
      broadcastRoom(result.room);
    });

    socket.on(EVENTS.ROOM_JOIN, (payload, ack) => {
      const result = manager.joinRoom(payload?.code, payload?.name);
      if (result.error) return fail(ack, result.error);
      bind(result.room, result.player);
      reply(ack, { ok: true, code: result.room.code, ...credentials(result.player) });
      broadcastRoom(result.room);
    });

    socket.on(EVENTS.ROOM_REJOIN, (payload, ack) => {
      const result = manager.rejoin(payload?.code, payload?.playerId, payload?.token);
      if (result.error) return fail(ack, result.error);
      bind(result.room, result.player);
      reply(ack, { ok: true, code: result.room.code, playerId: result.player.id });
      broadcastRoom(result.room);
      sendGameState(result.room, result.player.id);
    });

    socket.on(EVENTS.ROOM_LEAVE, (_payload, ack) => {
      const room = currentRoom();
      if (!room) return fail(ack, 'No estás en una sala');
      const { playerId } = socket.data;
      manager.leave(room, playerId);
      sockets.delete(playerId);
      socket.leave(room.code);
      socket.data = {};
      reply(ack, { ok: true });
      if (manager.get(room.code)) broadcastRoom(room);
    });

    socket.on(EVENTS.ROOM_SETTINGS, (payload, ack) => {
      const room = currentRoom();
      if (!room) return fail(ack, 'No estás en una sala');
      const result = manager.updateSettings(room, socket.data.playerId, payload);
      if (result.error) return fail(ack, result.error);
      reply(ack, { ok: true, settings: result.settings });
      broadcastRoom(room);
    });

    socket.on(EVENTS.GAME_START, (_payload, ack) => {
      const room = currentRoom();
      if (!room) return fail(ack, 'No estás en una sala');
      const result = manager.startGame(room, socket.data.playerId);
      if (result.error) return fail(ack, result.error);
      reply(ack, { ok: true });
      broadcastRoom(room);
      sendGameState(room);
      sendEvents(room, result.events);
    });

    socket.on(EVENTS.GAME_RESTART, (_payload, ack) => {
      const room = currentRoom();
      if (!room) return fail(ack, 'No estás en una sala');
      const result = manager.restart(room, socket.data.playerId);
      if (result.error) return fail(ack, result.error);
      reply(ack, { ok: true });
      broadcastRoom(room);
      sendGameState(room);
      sendEvents(room, result.events);
    });

    socket.on(EVENTS.GAME_ACTION, (action, ack) => {
      const room = currentRoom();
      if (!room) return fail(ack, 'No estás en una sala');
      const result = manager.act(room, socket.data.playerId, action);
      if (result.error) return fail(ack, result.error);
      reply(ack, { ok: true });
      sendGameState(room);
      sendEvents(room, result.events);
      broadcastRoom(room);
    });

    socket.on('disconnect', () => {
      const room = currentRoom();
      const { playerId } = socket.data ?? {};
      if (!room || sockets.get(playerId) !== socket.id) return;
      sockets.delete(playerId);
      manager.setConnected(room, playerId, false);
      broadcastRoom(room);
    });
  });
}

const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 5000;

const credentials = (player) => ({ playerId: player.id, token: player.token });
