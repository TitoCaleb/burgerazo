import { describe, it, expect } from 'vitest';
import { applyAction } from '../../server/engine/actions.js';
import { isBurgerComplete, findWinner } from '../../server/engine/win.js';
import { makeState, ing, pest, cold, slot, special } from './helpers.js';

const full = (...mods) => [slot('meat', ...mods), slot('cheese'), slot('lettuce'), slot('tomato')];

describe('isBurgerComplete', () => {
  it('needs all 4 kinds', () => {
    expect(isBurgerComplete(full())).toBe(true);
    expect(isBurgerComplete(full().slice(0, 3))).toBe(false);
  });

  it('chilled and frozen count, contaminated does not', () => {
    expect(isBurgerComplete(full(cold('meat')))).toBe(true);
    expect(isBurgerComplete(full(cold('meat'), cold('any')))).toBe(true);
    expect(isBurgerComplete(full(pest('meat')))).toBe(false);
  });
});

describe('winning', () => {
  it('the active player wins by placing the 4th ingredient', () => {
    const c = ing('tomato');
    const s = makeState({
      players: [{ hand: [c], body: full().slice(0, 3) }, { hand: [ing('meat')] }, {}],
    });
    const r = applyAction(s, 'p1', { type: 'playCard', cardId: c.id });
    expect(r.state.status).toBe('finished');
    expect(r.state.winnerId).toBe('p1');
    expect(r.state.turn).toBe(0);
    expect(r.events.at(-1).text).toContain('Ana');
  });

  it('a player who is not on turn can win', () => {
    // Luis has 4 ingredients, one contaminated; Ana swaps her clean tomato for it.
    const card = special('orderSwap');
    const luisBad = slot('tomato', pest('tomato'));
    const anaTomato = slot('tomato');
    const s = makeState({
      players: [
        { hand: [card], body: [anaTomato] },
        { body: [slot('meat'), slot('cheese'), slot('lettuce'), luisBad] },
        {},
      ],
    });
    const r = applyAction(s, 'p1', {
      type: 'playCard',
      cardId: card.id,
      target: { playerId: 'p2', ingredientId: luisBad.card.id },
      extra: { ownIngredientId: anaTomato.card.id },
    });
    expect(r.state.winnerId).toBe('p2');
    expect(r.state.status).toBe('finished');
  });

  it('ties go to the active player first, then turn order', () => {
    const s = makeState({
      players: [{ body: full() }, { body: full() }, { body: full() }],
      turn: 1,
    });
    expect(findWinner(s)).toBe('p2');
    s.players[1].body = [];
    expect(findWinner(s)).toBe('p3');
  });

  it('no winner on an empty table', () => {
    expect(findWinner(makeState())).toBeNull();
  });
});
