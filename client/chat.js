import { EVENTS, CHAT_MAX_LENGTH, CHAT_HISTORY_SIZE } from '../shared/constants.js';
import { esc, toast } from './ui.js';

// The chat lives outside #app so re-rendering the board never wipes what you are typing.
const QUICK = ['😂', '👏', '😱', '😡', '🍔', '¡GG!'];

const state = { messages: [], unread: 0, open: false, myId: null, inRoom: false };
let els = null;
let send = async () => ({ ok: true });

function mount() {
  const panel = document.createElement('section');
  panel.className = 'chat-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Chat de la sala');
  panel.innerHTML = `
    <header class="chat-panel__head">
      <strong>💬 Chat</strong>
      <button type="button" class="btn btn--ghost btn--small" data-chat-close aria-label="Cerrar chat">✕</button>
    </header>
    <ol class="chat-list" aria-live="polite"></ol>
    <div class="chat-quick">${QUICK.map(
      (q) =>
        `<button type="button" class="chat-quick__btn" data-quick="${esc(q)}">${esc(q)}</button>`,
    ).join('')}</div>
    <form class="chat-form" autocomplete="off">
      <input class="chat-input" maxlength="${CHAT_MAX_LENGTH}" placeholder="Escribe un mensaje…" enterkeyhint="send" />
      <button class="btn btn--primary" type="submit">Enviar</button>
    </form>`;
  document.body.append(panel);

  els = {
    panel,
    list: panel.querySelector('.chat-list'),
    form: panel.querySelector('.chat-form'),
    input: panel.querySelector('.chat-input'),
  };

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(els.input.value).then((ok) => ok && (els.input.value = ''));
  });
  panel.querySelector('[data-chat-close]').addEventListener('click', () => setOpen(false));
  panel
    .querySelectorAll('[data-quick]')
    .forEach((b) => b.addEventListener('click', () => submit(b.dataset.quick)));
  // Toggle buttons are rendered by the views, so use delegation.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-chat-toggle]')) setOpen(!state.open);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.open) setOpen(false);
  });
}

async function submit(text) {
  if (!text.trim()) return false;
  const reply = await send(text);
  if (!reply.ok) toast(reply.error);
  return reply.ok;
}

function setOpen(open) {
  state.open = open && state.inRoom;
  els.panel.hidden = !state.open;
  document.body.classList.toggle('chat-open', state.open);
  if (state.open) {
    state.unread = 0;
    updateBadges();
    renderList();
    els.input.focus({ preventScroll: true });
  }
}

const time = (at) => new Date(at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

function renderList() {
  if (!state.messages.length) {
    els.list.innerHTML = '<li class="chat-empty">Todavía no hay mensajes. ¡Saluda! 👋</li>';
    return;
  }
  els.list.innerHTML = state.messages
    .map(
      (m) => `<li class="chat-msg ${m.playerId === state.myId ? 'is-mine' : ''}">
        <span class="chat-msg__meta">${esc(m.playerId === state.myId ? 'Tú' : m.name)} · ${time(m.at)}</span>
        <span class="chat-msg__text">${esc(m.text)}</span>
      </li>`,
    )
    .join('');
  els.list.scrollTop = els.list.scrollHeight;
}

function updateBadges() {
  for (const badge of document.querySelectorAll('.chat-badge')) {
    badge.textContent = state.unread > 9 ? '9+' : String(state.unread);
    badge.hidden = state.unread === 0;
  }
}

/** HTML for the 💬 button that views put in their top bar. */
export function chatButtonHTML() {
  const n = state.unread > 9 ? '9+' : state.unread;
  return `<button type="button" class="btn btn--ghost btn--small chat-toggle" data-chat-toggle aria-label="Abrir chat">
    💬<span class="chat-badge" ${state.unread ? '' : 'hidden'}>${n}</span>
  </button>`;
}

/** Called on every render: tells the chat whether we're in a room and who we are. */
export function setChatContext({ inRoom, myId }) {
  if (!inRoom && state.inRoom) {
    state.messages = [];
    state.unread = 0;
  }
  state.inRoom = inRoom;
  state.myId = myId;
  if (!inRoom && state.open) setOpen(false);
}

export function initChat(socket, request) {
  mount();
  send = (text) => request(EVENTS.CHAT_SEND, { text });

  socket.on(EVENTS.CHAT_HISTORY, (messages) => {
    state.messages = messages;
    renderList();
  });

  socket.on(EVENTS.CHAT_MESSAGE, (message) => {
    state.messages = [...state.messages, message].slice(-CHAT_HISTORY_SIZE);
    if (!state.open && message.playerId !== state.myId) {
      state.unread += 1;
      toast(`💬 ${message.name}: ${message.text}`, 'chat');
    }
    updateBadges();
    renderList();
  });
}
