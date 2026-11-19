import './styles.css';
import { EVENTS } from '../shared/constants.js';
import { socket, request } from './socket.js';
import { toast } from './ui.js';
import { renderHome } from './views/home.js';
import { renderLobby } from './views/lobby.js';
import { renderGame, resetSelection } from './views/game.js';
import { initChat, setChatContext } from './chat.js';

const SESSION_KEY = 'burgerazo:session';
const NAME_KEY = 'burgerazo:name';

function makeStorage(area) {
  return {
    get(k) {
      try {
        return JSON.parse(area().getItem(k));
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        if (v === null) area().removeItem(k);
        else area().setItem(k, JSON.stringify(v));
      } catch {
        /* private mode / blocked storage: reconnection just won't survive reloads */
      }
    },
  };
}
const storage = makeStorage(() => localStorage);
// Per-tab session so several tabs on one device can be different players;
// localStorage is the fallback when a phone browser discards the tab.
const tabStorage = makeStorage(() => sessionStorage);

const store = {
  session: tabStorage.get(SESSION_KEY) ?? storage.get(SESSION_KEY), // { code, playerId, token }
  room: null,
  game: null,
  busy: false,
};

const root = document.querySelector('#app');
const prefillCode = new URLSearchParams(location.search).get('sala')?.toUpperCase() ?? '';
let lastTurnWasMine = false;

function render() {
  const { session, room, game } = store;
  setChatContext({ inRoom: Boolean(session && room), myId: session?.playerId ?? null });
  if (!session || !room) {
    renderHome(
      root,
      { savedName: storage.get(NAME_KEY) ?? '', prefillCode, busy: store.busy },
      { create, join },
    );
  } else if (room.status === 'lobby' || !game) {
    renderLobby(root, { room, playerId: session.playerId }, { leave, start, setTimer, kick });
  } else {
    renderGame(
      root,
      { view: game, room, isHost: room.hostId === session.playerId },
      { act, leave, restart },
    );
  }
}

function setSession(reply) {
  store.session = { code: reply.code, playerId: reply.playerId, token: reply.token };
  storage.set(SESSION_KEY, store.session);
  tabStorage.set(SESSION_KEY, store.session);
  history.replaceState(null, '', `/?sala=${reply.code}`);
  render();
}

function clearSession() {
  store.session = null;
  store.room = null;
  store.game = null;
  storage.set(SESSION_KEY, null);
  tabStorage.set(SESSION_KEY, null);
  resetSelection();
  history.replaceState(null, '', '/');
}

async function withBusy(fn) {
  if (store.busy) return;
  store.busy = true;
  try {
    await fn();
  } finally {
    store.busy = false;
  }
}

function create(name) {
  storage.set(NAME_KEY, name.trim());
  return withBusy(async () => {
    const reply = await request(EVENTS.ROOM_CREATE, { name });
    if (!reply.ok) return toast(reply.error);
    setSession(reply);
  });
}

function join(code, name) {
  storage.set(NAME_KEY, name.trim());
  if (code.length !== 4) return toast('El código tiene 4 letras');
  return withBusy(async () => {
    const reply = await request(EVENTS.ROOM_JOIN, { code, name });
    if (!reply.ok) return toast(reply.error);
    setSession(reply);
  });
}

async function leave() {
  await request(EVENTS.ROOM_LEAVE);
  clearSession();
  render();
}

async function setTimer(turnSeconds) {
  const reply = await request(EVENTS.ROOM_SETTINGS, { turnSeconds });
  if (!reply.ok) toast(reply.error);
}

async function kick(playerId) {
  const reply = await request(EVENTS.ROOM_KICK, { playerId });
  if (!reply.ok) toast(reply.error);
}

async function start() {
  const reply = await request(EVENTS.GAME_START);
  if (!reply.ok) toast(reply.error);
}

async function restart() {
  const reply = await request(EVENTS.GAME_RESTART);
  if (!reply.ok) toast(reply.error);
}

function act(action) {
  return withBusy(async () => {
    const reply = await request(EVENTS.GAME_ACTION, action);
    if (!reply.ok) toast(reply.error);
    else resetSelection();
  });
}

async function rejoin() {
  if (!store.session) return render();
  const reply = await request(EVENTS.ROOM_REJOIN, store.session);
  if (!reply.ok) {
    toast(reply.error);
    clearSession();
    render();
  }
}

initChat(socket, request);
socket.on('connect', rejoin);
socket.on('disconnect', () => toast('Conexión perdida, reconectando…'));

socket.on(EVENTS.ROOM_STATE, (room) => {
  store.room = room;
  if (room.status === 'lobby') store.game = null;
  render();
});

socket.on(EVENTS.GAME_STATE, (view) => {
  // Convert "ms left" into a local deadline so clock differences with the server don't matter.
  view.turnDeadline = view.turnRemainingMs === null ? null : Date.now() + view.turnRemainingMs;
  store.game = view;
  const mine = view.status === 'playing' && view.turnPlayerId === view.me;
  if (mine && !lastTurnWasMine) navigator.vibrate?.(150);
  lastTurnWasMine = mine;
  render();
});

socket.on(EVENTS.ROOM_KICKED, () => {
  clearSession();
  render();
  toast('El anfitrión te sacó de la sala');
});

socket.on(EVENTS.ERROR, ({ message }) => toast(message));

render();
