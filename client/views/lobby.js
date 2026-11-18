import { esc, toast } from '../ui.js';
import { chatButtonHTML } from '../chat.js';

export function renderLobby(root, { room, playerId }, actions) {
  const isHost = room.hostId === playerId;
  const canStart = isHost && room.players.length >= 2;
  const link = `${location.origin}/?sala=${room.code}`;

  root.innerHTML = `
  <main class="screen lobby">
    <header class="topbar">
      <button class="btn btn--ghost btn--small" data-act="leave">← Salir</button>
      <span class="topbar__title">Sala</span>
      <span class="topbar__meta">${chatButtonHTML()}</span>
    </header>

    <section class="panel code-panel">
      <p class="muted">Comparte este código con tus amigos</p>
      <button class="room-code" data-act="copy" aria-label="Copiar enlace de la sala">${esc(room.code)}</button>
      <button class="btn btn--small" data-act="copy">📋 Copiar enlace</button>
    </section>

    <section class="panel">
      <h2>Jugadores (${room.players.length}/6)</h2>
      <ul class="player-list">
        ${room.players
          .map(
            (p) => `<li class="${p.connected ? '' : 'is-offline'}">
              <span class="dot" aria-hidden="true"></span>
              <span class="player-list__name">${esc(p.name)}${p.id === playerId ? ' (tú)' : ''}</span>
              ${p.id === room.hostId ? '<span class="tag">👑 anfitrión</span>' : ''}
            </li>`,
          )
          .join('')}
      </ul>
    </section>

    <footer class="lobby__footer">
      ${
        isHost
          ? `<button class="btn btn--primary btn--big" data-act="start" ${canStart ? '' : 'disabled'}>
              ${canStart ? '¡Empezar partida!' : 'Esperando a otro jugador…'}
            </button>`
          : '<p class="muted center">Esperando a que el anfitrión empiece…</p>'
      }
    </footer>
  </main>`;

  root.querySelector('[data-act="leave"]').addEventListener('click', actions.leave);
  root.querySelector('[data-act="start"]')?.addEventListener('click', actions.start);
  for (const btn of root.querySelectorAll('[data-act="copy"]')) {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(link);
        toast('Enlace copiado', 'ok');
      } catch {
        toast(`Código: ${room.code}`, 'ok');
      }
    });
  }
}
