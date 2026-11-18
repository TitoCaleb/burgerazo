import { describe, it, expect } from 'vitest';
import { createDeck, createRng, shuffle, DECK_SIZE } from '../../server/engine/deck.js';
import { INGREDIENTS } from '../../shared/constants.js';

const count = (deck, pred) => deck.filter(pred).length;

describe('deck', () => {
  const deck = createDeck();

  it('has 66 cards with unique ids', () => {
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck.map((c) => c.id)).size).toBe(66);
    expect(deck[0].id).toBe('card_01');
    expect(deck[65].id).toBe('card_66');
  });

  it('has the exact distribution', () => {
    for (const kind of INGREDIENTS) {
      expect(count(deck, (c) => c.type === 'ingredient' && c.kind === kind)).toBe(5);
      expect(count(deck, (c) => c.type === 'pest' && c.kind === kind)).toBe(4);
      expect(count(deck, (c) => c.type === 'cold' && c.kind === kind)).toBe(4);
    }
    expect(count(deck, (c) => c.type === 'ingredient')).toBe(20);
    expect(count(deck, (c) => c.type === 'pest' && c.kind === 'any')).toBe(2);
    expect(count(deck, (c) => c.type === 'cold' && c.kind === 'any')).toBe(2);
    const specials = (s) => count(deck, (c) => c.special === s);
    expect(specials('orderSwap')).toBe(3);
    expect(specials('dropped')).toBe(2);
    expect(specials('inspection')).toBe(2);
    expect(specials('rushHour')).toBe(1);
    expect(specials('dailySpecial')).toBe(2);
    expect(count(deck, (c) => c.type === 'special')).toBe(10);
  });

  it('seeded shuffle is deterministic and does not mutate', () => {
    const copy = structuredClone(deck);
    const a = shuffle(deck, createRng(123));
    const b = shuffle(deck, createRng(123));
    const c = shuffle(deck, createRng(124));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.map((x) => x.id)).not.toEqual(c.map((x) => x.id));
    expect(deck).toEqual(copy);
    expect(new Set(a.map((x) => x.id)).size).toBe(66);
  });

  it('rng state can be saved and resumed', () => {
    const r1 = createRng(7);
    r1();
    const r2 = createRng(r1.getState());
    expect(r1()).toBe(r2());
  });
});
