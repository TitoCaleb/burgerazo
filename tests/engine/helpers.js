import { GAME_STATUS } from '../../shared/constants.js';

let counter = 0;

/** Card factories with unique ids (prefix "t" so they never collide with the real deck). */
export const ing = (kind) => ({ id: `t${++counter}`, type: 'ingredient', kind });
export const pest = (kind) => ({ id: `t${++counter}`, type: 'pest', kind });
export const cold = (kind) => ({ id: `t${++counter}`, type: 'cold', kind });
export const special = (name) => ({ id: `t${++counter}`, type: 'special', special: name });

/** A plate slot: ingredient card plus modifiers on top. */
export const slot = (kind, ...modifiers) => ({ card: ing(kind), modifiers });

/** Filler cards for decks. */
export const filler = (n) => Array.from({ length: n }, () => ing('meat'));

/**
 * Builds a hand-crafted game state. Players default to Ana (p1), Luis (p2), Sofi (p3).
 */
export function makeState({ players, deck = filler(10), discard = [], turn = 0 } = {}) {
  const defaults = [
    { id: 'p1', name: 'Ana' },
    { id: 'p2', name: 'Luis' },
    { id: 'p3', name: 'Sofi' },
  ];
  const list = (players ?? [{}, {}, {}]).map((p, i) => ({
    ...defaults[i],
    hand: [],
    body: [],
    ...p,
  }));
  return {
    players: list,
    deck,
    discard,
    turn,
    turnNumber: 1,
    status: GAME_STATUS.PLAYING,
    winnerId: null,
    rngState: 42,
  };
}

/** Every card in the game, wherever it is. */
export function allCards(state) {
  const cards = [...state.deck, ...state.discard];
  for (const p of state.players) {
    cards.push(...p.hand);
    for (const s of p.body) cards.push(s.card, ...s.modifiers);
  }
  return cards;
}
