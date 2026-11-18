import { validatePlay } from '../../server/engine/rules.js';
import { INGREDIENTS, INGREDIENT_EMOJI } from '../../shared/constants.js';
import { esc, cardHTML, slotHTML, describeCard } from '../ui.js';

// UI-only selection state; the server decides what is valid.
const ui = {
  cardId: null,
  swapOwnId: null,
  discardMode: false,
  discardIds: new Set(),
  logOpen: false,
};

export function resetSelection() {
  ui.cardId = null;
  ui.swapOwnId = null;
  ui.discardMode = false;
  ui.discardIds = new Set();
}

const TARGETED = new Set(['pest', 'cold', 'dropped', 'orderSwap']);
const needsTarget = (card) => TARGETED.has(card.type) || TARGETED.has(card.special);
const key = (playerId, ingredientId) => `${playerId}:${ingredientId}`;

/** Suggests targets using the engine's pure validator (the server re-validates everything). */
function suggestTargets(view, card) {
  const me = view.players.find((p) => p.id === view.me);
  const targets = new Set();
  const ownChoices = new Set();
  // Ingredients and untargeted specials never target a plate slot.
  if (!needsTarget(card)) return { targets, ownChoices };
  for (const p of view.players) {
    for (const slot of p.body) {
      const target = { playerId: p.id, ingredientId: slot.card.id };
      if (card.special === 'orderSwap') {
        for (const own of me.body) {
          const action = { cardId: card.id, target, extra: { ownIngredientId: own.card.id } };
          if (!validatePlay(view, me, card, action)) {
            ownChoices.add(own.card.id);
            if (ui.swapOwnId === own.card.id) targets.add(key(p.id, slot.card.id));
          }
        }
      } else if (!validatePlay(view, me, card, { cardId: card.id, target })) {
        targets.add(key(p.id, slot.card.id));
      }
    }
  }
  return { targets, ownChoices };
}

function hint(view, card, myTurn, suggestions) {
  if (!myTurn) return '';
  if (ui.discardMode) return 'Elige de 1 a 3 cartas para tirar a la basura';
  if (!card) return 'Toca una carta para jugarla';
  if (!needsTarget(card)) {
    const err = validatePlay(
      view,
      view.players.find((p) => p.id === view.me),
      card,
      {},
    );
    if (err) return err;
    return card.type === 'ingredient'
      ? 'Toca el hueco resaltado de tu plato'
      : `${describeCard(card).title}: toca “Jugar” para confirmar`;
  }
  if (card.special === 'orderSwap') {
    if (!suggestions.ownChoices.size) return 'No hay ningún cambio posible ahora';
    return ui.swapOwnId
      ? 'Ahora elige el ingrediente del rival'
      : 'Primero elige uno de tus ingredientes';
  }
  return suggestions.targets.size
    ? 'Toca un ingrediente resaltado'
    : 'Esta carta no tiene objetivos ahora';
}

function plateHTML(player, view, suggestions, { mine, card }) {
  const isTurn = player.id === view.turnPlayerId;
  const slots = INGREDIENTS.map((kind) => {
    const slot = player.body.find((s) => s.card.kind === kind);
    if (!slot && mine && card?.type === 'ingredient' && card.kind === kind) {
      // The selected ingredient can be dropped straight onto its empty spot.
      return `<button type="button" class="slot slot--empty is-target" data-drop="${esc(card.id)}"
        aria-label="Poner ${esc(kind)} en tu plato">${INGREDIENT_EMOJI[kind]}</button>`;
    }
    if (!slot)
      return `<span class="slot slot--empty" aria-label="falta">${INGREDIENT_EMOJI[kind]}</span>`;
    const isOwnChoice = mine && suggestions.ownChoices.has(slot.card.id) && !ui.swapOwnId;
    return slotHTML(slot, player.id, {
      target: suggestions.targets.has(key(player.id, slot.card.id)) || isOwnChoice,
      selected: mine && ui.swapOwnId === slot.card.id,
    });
  }).join('');
  return `<section class="plate ${mine ? 'plate--mine' : ''} ${isTurn ? 'is-turn' : ''} ${
    player.connected === false ? 'is-offline' : ''
  }">
    <header class="plate__head">
      <span class="plate__name">${isTurn ? '▶ ' : ''}${esc(player.name)}${mine ? ' (tú)' : ''}</span>
      ${mine ? '' : `<span class="plate__cards" title="Cartas en la mano">🂠 ${player.handCount}</span>`}
    </header>
    <div class="plate__slots">${slots}</div>
  </section>`;
}

export function renderGame(root, { view, room, isHost }, actions) {
  const myTurn = view.status === 'playing' && view.turnPlayerId === view.me;
  if (!view.hand.some((c) => c.id === ui.cardId)) {
    ui.cardId = null;
    ui.swapOwnId = null;
  }
  if (!myTurn) resetSelection();

  const card = view.hand.find((c) => c.id === ui.cardId);
  const suggestions =
    card && myTurn ? suggestTargets(view, card) : { targets: new Set(), ownChoices: new Set() };
  const connected = new Map(room.players.map((p) => [p.id, p.connected]));
  const players = view.players.map((p) => ({ ...p, connected: connected.get(p.id) }));
  const me = players.find((p) => p.id === view.me);
  const others = players.filter((p) => p.id !== view.me);
  const turnName = players.find((p) => p.id === view.turnPlayerId)?.name ?? '';
  const winner = players.find((p) => p.id === view.winnerId);
  const canPlayNow = card && !needsTarget(card) && !ui.discardMode;

  root.innerHTML = `
  <main class="screen game ${myTurn ? 'is-my-turn' : ''}">
    <header class="topbar">
      <button class="btn btn--ghost btn--small" data-act="leave">← Salir</button>
      <span class="topbar__title">Sala ${esc(room.code)}</span>
      <span class="topbar__meta" title="Cartas en el mazo">🂠 ${view.deckCount}</span>
    </header>

    <div class="turn-banner ${myTurn ? 'is-mine' : ''}" role="status">
      ${myTurn ? '¡Es tu turno!' : view.status === 'playing' ? `Turno de ${esc(turnName)}` : 'Partida terminada'}
    </div>

    <section class="rivals">${others.map((p) => plateHTML(p, view, suggestions, { mine: false, card })).join('')}</section>

    <details class="log" ${view.log.length ? '' : 'hidden'} ${ui.logOpen ? 'open' : ''}>
      <summary>${esc(view.log.at(-1) ?? '')}</summary>
      <ol>${view.log
        .slice(0, -1)
        .reverse()
        .map((t) => `<li>${esc(t)}</li>`)
        .join('')}</ol>
    </details>

    <section class="me">
      ${plateHTML(me, view, suggestions, { mine: true, card: myTurn && !ui.discardMode ? card : null })}
      <p class="hint" aria-live="polite">${esc(hint(view, card, myTurn, suggestions))}</p>
      <div class="hand" role="group" aria-label="Tu mano">
        ${view.hand
          .map((c) =>
            cardHTML(c, {
              selected: ui.discardMode ? ui.discardIds.has(c.id) : ui.cardId === c.id,
              disabled: !myTurn,
            }),
          )
          .join('')}
      </div>
      <div class="actions">
        ${
          ui.discardMode
            ? `<button class="btn" data-act="cancel">Cancelar</button>
               <button class="btn btn--danger" data-act="confirm-discard" ${ui.discardIds.size ? '' : 'disabled'}>
                 Tirar ${ui.discardIds.size || ''} 🗑️</button>`
            : `<button class="btn" data-act="discard-mode" ${myTurn ? '' : 'disabled'}>🗑️ Tirar cartas</button>
               <button class="btn btn--primary" data-act="play" ${canPlayNow ? '' : 'disabled'}>Jugar</button>`
        }
      </div>
    </section>

    ${
      view.status === 'finished'
        ? `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="win-title">
            <div class="overlay__box">
              <div class="overlay__icon" aria-hidden="true">${winner ? '🍔🏆' : '🤝'}</div>
              <h2 id="win-title">${
                winner
                  ? winner.id === view.me
                    ? '¡Ganaste!'
                    : `¡Ganó ${esc(winner.name)}!`
                  : 'Empate'
              }</h2>
              ${
                isHost
                  ? '<button class="btn btn--primary btn--big" data-act="restart">Jugar otra vez</button>'
                  : '<p class="muted">Esperando a que el anfitrión empiece otra…</p>'
              }
              <button class="btn btn--ghost" data-act="leave">Salir de la sala</button>
            </div>
          </div>`
        : ''
    }
  </main>`;

  const rerender = () => renderGame(root, { view, room, isHost }, actions);

  root.querySelector('.log').addEventListener('toggle', (e) => {
    ui.logOpen = e.target.open;
  });
  root
    .querySelectorAll('[data-act="leave"]')
    .forEach((b) => b.addEventListener('click', actions.leave));
  root.querySelector('[data-act="restart"]')?.addEventListener('click', actions.restart);

  root.querySelectorAll('.hand .card').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.card;
      if (ui.discardMode) {
        if (ui.discardIds.has(id)) ui.discardIds.delete(id);
        else if (ui.discardIds.size < 3) ui.discardIds.add(id);
      } else {
        ui.cardId = ui.cardId === id ? null : id;
        ui.swapOwnId = null;
      }
      rerender();
    }),
  );

  root
    .querySelector('[data-drop]')
    ?.addEventListener('click', (e) =>
      actions.act({ type: 'playCard', cardId: e.currentTarget.dataset.drop }),
    );

  root.querySelectorAll('.slot.is-target:not([data-drop]), .slot.is-selected').forEach((btn) =>
    btn.addEventListener('click', () => {
      const { player, slot } = btn.dataset;
      if (card?.special === 'orderSwap' && player === view.me) {
        ui.swapOwnId = ui.swapOwnId === slot ? null : slot;
        return rerender();
      }
      const extra = card?.special === 'orderSwap' ? { ownIngredientId: ui.swapOwnId } : undefined;
      actions.act({
        type: 'playCard',
        cardId: card.id,
        target: { playerId: player, ingredientId: slot },
        extra,
      });
    }),
  );

  root
    .querySelector('[data-act="play"]')
    ?.addEventListener('click', () => actions.act({ type: 'playCard', cardId: card.id }));
  root.querySelector('[data-act="discard-mode"]')?.addEventListener('click', () => {
    resetSelection();
    ui.discardMode = true;
    rerender();
  });
  root.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
    resetSelection();
    rerender();
  });
  root
    .querySelector('[data-act="confirm-discard"]')
    ?.addEventListener('click', () =>
      actions.act({ type: 'discard', cardIds: [...ui.discardIds] }),
    );
}
