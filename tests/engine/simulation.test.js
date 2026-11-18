import { describe, it, expect } from 'vitest';
import { createGame } from '../../server/engine/state.js';
import { applyAction } from '../../server/engine/actions.js';
import { validatePlay, ingredientState } from '../../server/engine/rules.js';
import { createRng } from '../../server/engine/deck.js';
import { allCards } from './helpers.js';

const GAMES = 500;
const MAX_TURNS = 3000;

/** Enumerates every valid action for the current player using the engine's own validator. */
function validActions(state) {
  const me = state.players[state.turn];
  const out = [];
  const targets = state.players.flatMap((p) =>
    p.body.map((s) => ({ playerId: p.id, ingredientId: s.card.id })),
  );
  for (const card of me.hand) {
    const candidates = [{ type: 'playCard', cardId: card.id }];
    for (const target of targets) {
      candidates.push({ type: 'playCard', cardId: card.id, target });
      if (card.special === 'orderSwap') {
        for (const own of me.body) {
          candidates.push({
            type: 'playCard',
            cardId: card.id,
            target,
            extra: { ownIngredientId: own.card.id },
          });
        }
      }
    }
    for (const a of candidates) if (!validatePlay(state, me, card, a)) out.push(a);
  }
  for (let n = 1; n <= Math.min(3, me.hand.length); n++) {
    out.push({ type: 'discard', cardIds: me.hand.slice(0, n).map((c) => c.id) });
  }
  return out;
}

function checkInvariants(state) {
  const cards = allCards(state);
  expect(cards).toHaveLength(66);
  expect(new Set(cards.map((c) => c.id)).size).toBe(66);
  for (const p of state.players) {
    const kinds = p.body.map((s) => s.card.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const s of p.body) {
      expect(s.card.type).toBe('ingredient');
      const pests = s.modifiers.filter((m) => m.type === 'pest').length;
      const colds = s.modifiers.filter((m) => m.type === 'cold').length;
      expect(pests + colds).toBe(s.modifiers.length);
      expect(pests <= 1 && colds <= 2 && !(pests && colds)).toBe(true);
      ingredientState(s);
    }
  }
}

describe('simulated games', () => {
  it(`${GAMES} random bot games finish without errors or invalid states`, () => {
    let finished = 0;
    for (let g = 0; g < GAMES; g++) {
      const n = 2 + (g % 5);
      const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Bot${i}` }));
      let state = createGame({ players, seed: g * 7919 + 1 });
      const bot = createRng(g + 100000);
      checkInvariants(state);
      for (let t = 0; t < MAX_TURNS && state.status === 'playing'; t++) {
        const options = validActions(state);
        const action = options[Math.floor(bot() * options.length)];
        const result = applyAction(state, state.players[state.turn].id, action);
        if (result.error) throw new Error(`seed ${g}: ${result.error} ${JSON.stringify(action)}`);
        state = result.state;
        checkInvariants(state);
      }
      if (state.status === 'finished') finished++;
    }
    // Random bots should almost always finish a game.
    expect(finished).toBeGreaterThan(GAMES * 0.95);
  });
});
