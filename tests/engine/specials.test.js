import { describe, it, expect } from 'vitest';
import { applyAction } from '../../server/engine/actions.js';
import { validatePlay } from '../../server/engine/rules.js';
import { makeState, ing, pest, cold, slot, special, allCards } from './helpers.js';

const play = (state, cardId, target, extra) =>
  applyAction(state, 'p1', { type: 'playCard', cardId, target, extra });
const tgt = (playerId, s) => ({ playerId, ingredientId: s.card.id });
const kinds = (p) => p.body.map((s) => s.card.kind).sort();

describe('dropped (¡Se cayó al piso!)', () => {
  const setup = (target) => {
    const card = special('dropped');
    return { card, target, s: makeState({ players: [{ hand: [card] }, { body: [target] }, {}] }) };
  };

  it('throws away a fresh ingredient', () => {
    const { card, target, s } = setup(slot('meat'));
    const r = play(s, card.id, tgt('p2', target));
    expect(r.state.players[1].body).toEqual([]);
    expect(r.state.discard.map((c) => c.id).sort()).toEqual([target.card.id, card.id].sort());
  });

  it('throws away a contaminated ingredient with its pest', () => {
    const p = pest('meat');
    const { card, target, s } = setup(slot('meat', p));
    const r = play(s, card.id, tgt('p2', target));
    expect(r.state.discard.map((c) => c.id).sort()).toEqual([target.card.id, p.id, card.id].sort());
  });

  it('cannot hit chilled/frozen ingredients or your own plate', () => {
    for (const target of [slot('meat', cold('meat')), slot('meat', cold('meat'), cold('meat'))]) {
      const { card, s } = setup(target);
      expect(play(s, card.id, tgt('p2', target)).error).toBe(
        'Ese ingrediente está protegido por el frío',
      );
    }
    const card = special('dropped');
    const own = slot('meat');
    const s = makeState({ players: [{ hand: [card], body: [own] }, {}, {}] });
    expect(play(s, card.id, tgt('p1', own)).error).toBe('Elige un ingrediente de otro jugador');
    expect(play(s, card.id).error).toBe('Tienes que elegir un ingrediente');
  });
});

describe('orderSwap (Cambio de pedido)', () => {
  it('swaps ingredients with their modifiers', () => {
    const card = special('orderSwap');
    const mine = slot('meat', cold('meat'));
    const theirs = slot('cheese', pest('cheese'));
    const s = makeState({ players: [{ hand: [card], body: [mine] }, { body: [theirs] }, {}] });
    const r = play(s, card.id, tgt('p2', theirs), { ownIngredientId: mine.card.id });
    expect(r.state.players[0].body).toEqual([theirs]);
    expect(r.state.players[1].body).toEqual([mine]);
    expect(r.state.discard.map((c) => c.id)).toEqual([card.id]);
  });

  it('allows swapping the same kind', () => {
    const card = special('orderSwap');
    const mine = slot('meat', pest('meat'));
    const theirs = slot('meat');
    const s = makeState({ players: [{ hand: [card], body: [mine] }, { body: [theirs] }, {}] });
    expect(
      play(s, card.id, tgt('p2', theirs), { ownIngredientId: mine.card.id }).error,
    ).toBeUndefined();
  });

  it('rejects duplicates, frozen, own target and missing own ingredient', () => {
    const card = special('orderSwap');
    const mine = slot('meat');
    const mineCheese = slot('cheese');
    const theirsCheese = slot('cheese');
    const theirsFrozen = slot('tomato', cold('any'), cold('tomato'));
    const theirsMeat = slot('meat');
    const p2 = { body: [theirsCheese, theirsFrozen] };
    const p3 = { body: [slot('lettuce'), theirsMeat] };
    const s = makeState({ players: [{ hand: [card], body: [mine, mineCheese] }, p2, p3] });
    const err = (target, own) => play(s, card.id, target, { ownIngredientId: own }).error;

    expect(err(tgt('p2', theirsCheese), mine.card.id)).toBe('Ya tienes ese ingrediente');
    expect(err(tgt('p2', theirsFrozen), mine.card.id)).toBe(
      'No se pueden cambiar ingredientes congelados',
    );
    expect(err(tgt('p3', p3.body[0]), mine.card.id)).toBe('Ese jugador ya tiene ese ingrediente');
    expect(err(tgt('p1', mine), mineCheese.card.id)).toBe('Elige un ingrediente de otro jugador');
    expect(err(tgt('p2', theirsCheese), 'nope')).toBe('Elige uno de tus ingredientes para cambiar');
    expect(play(s, card.id).error).toBe('Tienes que elegir un ingrediente');
  });

  it('rejects swapping your own frozen ingredient', () => {
    const card = special('orderSwap');
    const mine = slot('meat', cold('meat'), cold('meat'));
    const theirs = slot('meat');
    const s = makeState({ players: [{ hand: [card], body: [mine] }, { body: [theirs] }, {}] });
    expect(play(s, card.id, tgt('p2', theirs), { ownIngredientId: mine.card.id }).error).toBe(
      'No se pueden cambiar ingredientes congelados',
    );
  });

  it('can make the active player win', () => {
    const card = special('orderSwap');
    const bad = slot('tomato', pest('tomato'));
    const good = slot('tomato');
    const s = makeState({
      players: [
        { hand: [card], body: [slot('meat'), slot('cheese'), slot('lettuce'), bad] },
        { body: [good] },
        {},
      ],
    });
    const r = play(s, card.id, tgt('p2', good), { ownIngredientId: bad.card.id });
    expect(r.state.winnerId).toBe('p1');
  });
});

describe('inspection (Inspección sanitaria)', () => {
  it('removes every contaminated ingredient on every plate, including yours', () => {
    const card = special('inspection');
    const s = makeState({
      players: [
        { hand: [card], body: [slot('meat', pest('meat')), slot('cheese')] },
        { body: [slot('tomato', pest('any')), slot('lettuce', cold('lettuce'))] },
        { body: [slot('meat')] },
      ],
    });
    const r = play(s, card.id);
    expect(kinds(r.state.players[0])).toEqual(['cheese']);
    expect(kinds(r.state.players[1])).toEqual(['lettuce']);
    expect(kinds(r.state.players[2])).toEqual(['meat']);
    expect(r.state.discard).toHaveLength(5);
    expect(allCards(r.state)).toHaveLength(allCards(s).length);
  });

  it('is valid even with nothing to inspect', () => {
    const card = special('inspection');
    const s = makeState({ players: [{ hand: [card] }, {}, {}] });
    expect(play(s, card.id).events[0].text).toContain('0 ingredientes');
  });
});

describe('rushHour (Hora pico)', () => {
  it('passes every hand to the next player', () => {
    const card = special('rushHour');
    const a = [card, ing('meat'), ing('meat')];
    const b = [ing('cheese')];
    const c = [ing('tomato'), ing('lettuce')];
    const s = makeState({ players: [{ hand: a }, { hand: b }, { hand: c }] });
    const r = play(s, card.id);
    // p1 receives p3's hand (2 cards) then refills to 3
    expect(r.state.players[0].hand.slice(0, 2)).toEqual(c);
    expect(r.state.players[0].hand).toHaveLength(3);
    expect(r.state.players[1].hand).toEqual(a.slice(1));
    expect(r.state.players[2].hand).toEqual(b);
  });
});

describe('dailySpecial (Plato del día)', () => {
  it('draws 2 extra cards (hand can exceed 3)', () => {
    const card = special('dailySpecial');
    const s = makeState({
      players: [{ hand: [card, ing('meat'), ing('cheese')] }, { hand: [ing('meat')] }, {}],
    });
    const r = play(s, card.id);
    expect(r.state.players[0].hand).toHaveLength(4);
    expect(r.state.discard.map((c) => c.id)).toEqual([card.id]);
  });
});

describe('unknown cards', () => {
  it('validatePlay rejects unknown types and specials', () => {
    const s = makeState();
    const p = s.players[0];
    expect(validatePlay(s, p, { id: 'x', type: 'banana' }, {})).toBe('Carta desconocida');
    expect(validatePlay(s, p, { id: 'x', type: 'special', special: 'banana' }, {})).toBe(
      'Carta desconocida',
    );
  });
});
