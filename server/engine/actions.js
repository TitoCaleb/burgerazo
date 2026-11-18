import {
  CARD_TYPES,
  SPECIALS,
  HAND_SIZE,
  GAME_STATUS,
  SPECIAL_INFO,
} from '../../shared/constants.js';
import { createRng, shuffle } from './deck.js';
import { validatePlay, ingredientState, findSlot } from './rules.js';
import { findWinner } from './win.js';

const WITH_ARTICLE = {
  meat: 'la carne',
  cheese: 'el queso',
  lettuce: 'la lechuga',
  tomato: 'el tomate',
};
const MAX_DISCARD = 3;

/**
 * Applies `action` by `playerId`. Pure: returns a new state, never mutates the input.
 * @returns {{ state, events: {text: string}[] } | { error: string }}
 */
export function applyAction(state, playerId, action) {
  if (state.status !== GAME_STATUS.PLAYING) return { error: 'La partida ya terminó' };
  const current = state.players[state.turn];
  if (!state.players.some((p) => p.id === playerId)) return { error: 'No estás en esta partida' };
  if (current.id !== playerId) return { error: 'No es tu turno' };
  if (!action || typeof action !== 'object') return { error: 'Acción inválida' };

  const s = structuredClone(state);
  const player = s.players[s.turn];
  const rng = createRng(s.rngState);
  const events = [];

  let error;
  if (action.type === 'playCard') error = playCard(s, player, action, rng, events);
  else if (action.type === 'discard') error = discard(s, player, action, events);
  else error = 'Acción desconocida';
  if (error) return { error };

  const winnerId = findWinner(s);
  if (winnerId) {
    s.status = GAME_STATUS.FINISHED;
    s.winnerId = winnerId;
    const winner = s.players.find((p) => p.id === winnerId);
    events.push({ text: `🍔 ¡${winner.name} completó su hamburguesa y ganó!` });
  } else {
    drawUpTo(s, player, HAND_SIZE, rng, events);
    advanceTurn(s, rng, events);
  }
  s.rngState = rng.getState();
  return { state: s, events };
}

function playCard(s, player, action, rng, events) {
  const idx = player.hand.findIndex((c) => c.id === action.cardId);
  if (idx === -1) return 'Esa carta no está en tu mano';
  const card = player.hand[idx];
  const error = validatePlay(s, player, card, action);
  if (error) return error;

  player.hand.splice(idx, 1);
  const name = player.name;

  switch (card.type) {
    case CARD_TYPES.INGREDIENT:
      player.body.push({ card, modifiers: [] });
      events.push({ text: `${name} puso ${WITH_ARTICLE[card.kind]} en su plato` });
      return null;

    case CARD_TYPES.PEST: {
      const target = s.players.find((p) => p.id === action.target.playerId);
      const slot = findSlot(target, action.target.ingredientId);
      const what = `${WITH_ARTICLE[slot.card.kind]} de ${target.name}`;
      const st = ingredientState(slot);
      if (st === 'fresh') {
        slot.modifiers.push(card);
        events.push({ text: `${name} le echó una plaga a ${what}` });
      } else if (st === 'contaminated') {
        target.body = target.body.filter((x) => x !== slot);
        s.discard.push(...slot.modifiers, slot.card, card);
        events.push({ text: `${name} echó a perder ${what} 🤢` });
      } else {
        // chilled: pest and cold cancel out
        s.discard.push(...slot.modifiers, card);
        slot.modifiers = [];
        events.push({ text: `${name} le quitó el frío a ${what}` });
      }
      return null;
    }

    case CARD_TYPES.COLD: {
      const slot = findSlot(player, action.target.ingredientId);
      const what = WITH_ARTICLE[slot.card.kind];
      const st = ingredientState(slot);
      if (st === 'contaminated') {
        s.discard.push(...slot.modifiers, card);
        slot.modifiers = [];
        events.push({ text: `${name} salvó ${what} de la plaga` });
      } else {
        slot.modifiers.push(card);
        const verb = st === 'fresh' ? 'refrigeró' : 'congeló';
        events.push({ text: `${name} ${verb} ${what} ❄️` });
      }
      return null;
    }

    default:
      playSpecial(s, player, card, action, rng, events);
      s.discard.push(card);
      return null;
  }
}

function playSpecial(s, player, card, action, rng, events) {
  const name = player.name;
  const label = SPECIAL_INFO[card.special].name;
  switch (card.special) {
    case SPECIALS.DROPPED: {
      const target = s.players.find((p) => p.id === action.target.playerId);
      const slot = findSlot(target, action.target.ingredientId);
      target.body = target.body.filter((x) => x !== slot);
      s.discard.push(slot.card, ...slot.modifiers);
      events.push({
        text: `${label} ${name} tiró ${WITH_ARTICLE[slot.card.kind]} de ${target.name}`,
      });
      break;
    }

    case SPECIALS.ORDER_SWAP: {
      const target = s.players.find((p) => p.id === action.target.playerId);
      const theirs = findSlot(target, action.target.ingredientId);
      const own = findSlot(player, action.extra.ownIngredientId);
      player.body[player.body.indexOf(own)] = theirs;
      target.body[target.body.indexOf(theirs)] = own;
      events.push({
        text: `${label}: ${name} cambió ${WITH_ARTICLE[own.card.kind]} por ${WITH_ARTICLE[theirs.card.kind]} de ${target.name}`,
      });
      break;
    }

    case SPECIALS.INSPECTION: {
      let removed = 0;
      for (const p of s.players) {
        const bad = p.body.filter((slot) => ingredientState(slot) === 'contaminated');
        for (const slot of bad) s.discard.push(slot.card, ...slot.modifiers);
        removed += bad.length;
        p.body = p.body.filter((slot) => !bad.includes(slot));
      }
      events.push({
        text: `${label}: ${name} mandó ${removed} ingrediente${removed === 1 ? '' : 's'} con plaga a la basura`,
      });
      break;
    }

    case SPECIALS.RUSH_HOUR: {
      const hands = s.players.map((p) => p.hand);
      const n = s.players.length;
      s.players.forEach((p, i) => {
        p.hand = hands[(i - 1 + n) % n];
      });
      events.push({ text: `${label}: ${name} hizo que todos pasaran su mano al siguiente` });
      break;
    }

    case SPECIALS.DAILY_SPECIAL: {
      events.push({ text: `${label}: ${name} robó 2 cartas extra` });
      drawCards(s, player, 2, rng, events);
      break;
    }
  }
}

function discard(s, player, action, events) {
  const ids = action.cardIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_DISCARD) {
    return `Tienes que tirar entre 1 y ${MAX_DISCARD} cartas`;
  }
  if (new Set(ids).size !== ids.length) return 'Cartas repetidas';
  const cards = ids.map((id) => player.hand.find((c) => c.id === id));
  if (cards.some((c) => !c)) return 'Esa carta no está en tu mano';
  player.hand = player.hand.filter((c) => !ids.includes(c.id));
  s.discard.push(...cards);
  events.push({
    text: `${player.name} tiró ${ids.length} carta${ids.length === 1 ? '' : 's'} a la basura`,
  });
  return null;
}

/** Draws `n` cards, reshuffling the discard pile into the deck when needed. */
function drawCards(s, player, n, rng, events) {
  for (let i = 0; i < n; i++) {
    if (s.deck.length === 0) {
      if (s.discard.length === 0) return;
      s.deck = shuffle(s.discard, rng);
      s.discard = [];
      events.push({ text: '🔀 Se acabó el mazo: se barajó la basura' });
    }
    player.hand.push(s.deck.pop());
  }
}

function drawUpTo(s, player, size, rng, events) {
  if (player.hand.length < size) drawCards(s, player, size - player.hand.length, rng, events);
}

/** Moves to the next player; players starting without cards draw first, and pass if they still have none. */
function advanceTurn(s, rng, events) {
  const n = s.players.length;
  for (let step = 1; step <= n; step++) {
    s.turn = (s.turn + 1) % n;
    s.turnNumber += 1;
    const next = s.players[s.turn];
    if (next.hand.length > 0) return;
    drawUpTo(s, next, HAND_SIZE, rng, events);
    if (next.hand.length > 0) return;
    events.push({ text: `${next.name} no tiene cartas y pasa` });
  }
  // Nobody can play: no cards anywhere outside the plates.
  s.status = GAME_STATUS.FINISHED;
  s.winnerId = null;
  events.push({ text: 'No quedan cartas: la partida termina en empate' });
}
