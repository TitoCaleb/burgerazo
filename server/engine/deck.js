import { INGREDIENTS, ANY, CARD_TYPES, SPECIALS } from '../../shared/constants.js';

export const DECK_SIZE = 66;

const SPECIAL_COUNTS = {
  [SPECIALS.ORDER_SWAP]: 3,
  [SPECIALS.DROPPED]: 2,
  [SPECIALS.INSPECTION]: 2,
  [SPECIALS.RUSH_HOUR]: 1,
  [SPECIALS.DAILY_SPECIAL]: 2,
};

/** Returns the full, unshuffled 66-card deck. */
export function createDeck() {
  const specs = [];
  for (const kind of INGREDIENTS) {
    for (let i = 0; i < 5; i++) specs.push({ type: CARD_TYPES.INGREDIENT, kind });
  }
  for (const type of [CARD_TYPES.PEST, CARD_TYPES.COLD]) {
    for (const kind of INGREDIENTS) {
      for (let i = 0; i < 4; i++) specs.push({ type, kind });
    }
    for (let i = 0; i < 2; i++) specs.push({ type, kind: ANY });
  }
  for (const [special, count] of Object.entries(SPECIAL_COUNTS)) {
    for (let i = 0; i < count; i++) specs.push({ type: CARD_TYPES.SPECIAL, special });
  }
  return specs.map((spec, i) => ({ id: `card_${String(i + 1).padStart(2, '0')}`, ...spec }));
}

/**
 * Deterministic PRNG (mulberry32). Returns a function producing floats in [0, 1)
 * with a `getState()` method so the seed can be stored in the game state.
 */
export function createRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.getState = () => a;
  return rng;
}

/** Fisher-Yates shuffle. Returns a new array; never mutates the input. */
export function shuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
