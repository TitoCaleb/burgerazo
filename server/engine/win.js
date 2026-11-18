import { INGREDIENTS } from '../../shared/constants.js';
import { ingredientState } from './rules.js';

/** A burger is complete with all 4 ingredient kinds and none contaminated. */
export function isBurgerComplete(body) {
  const goodKinds = new Set(
    body.filter((slot) => ingredientState(slot) !== 'contaminated').map((slot) => slot.card.kind),
  );
  return INGREDIENTS.every((kind) => goodKinds.has(kind));
}

/**
 * Returns the winner's id or null. Checks every player starting from the
 * current turn, so ties go to the active player first, then turn order.
 */
export function findWinner(state) {
  const n = state.players.length;
  for (let i = 0; i < n; i++) {
    const player = state.players[(state.turn + i) % n];
    if (isBurgerComplete(player.body)) return player.id;
  }
  return null;
}
