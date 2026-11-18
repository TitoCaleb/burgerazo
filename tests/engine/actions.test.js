import { describe, it, expect } from 'vitest';
import { applyAction } from '../../server/engine/actions.js';
import { ingredientState, isCompatible } from '../../server/engine/rules.js';
import { makeState, ing, pest, cold, slot, filler, allCards } from './helpers.js';

const play = (state, cardId, target, extra, by = 'p1') =>
  applyAction(state, by, { type: 'playCard', cardId, target, extra });

const tgt = (playerId, s) => ({ playerId, ingredientId: s.card.id });

describe('turn basics', () => {
  it('rejects playing out of turn', () => {
    const c = ing('meat');
    const s = makeState({ players: [{}, { hand: [c] }, {}] });
    expect(play(s, c.id, undefined, undefined, 'p2')).toEqual({ error: 'No es tu turno' });
  });

  it('rejects unknown players, unknown actions and missing actions', () => {
    const s = makeState();
    expect(applyAction(s, 'ghost', { type: 'discard', cardIds: [] }).error).toBeTruthy();
    expect(applyAction(s, 'p1', { type: 'dance' })).toEqual({ error: 'Acción desconocida' });
    expect(applyAction(s, 'p1', null)).toEqual({ error: 'Acción inválida' });
  });

  it('rejects a card that is not in your hand', () => {
    const s = makeState({ players: [{ hand: [ing('meat')] }, { hand: [ing('cheese')] }, {}] });
    expect(play(s, s.players[1].hand[0].id)).toEqual({ error: 'Esa carta no está en tu mano' });
  });

  it('rejects actions once the game is finished', () => {
    const s = { ...makeState(), status: 'finished' };
    expect(applyAction(s, 'p1', { type: 'discard', cardIds: ['x'] }).error).toBe(
      'La partida ya terminó',
    );
  });

  it('draws up to 3 and passes the turn', () => {
    const c = ing('meat');
    const s = makeState({
      players: [{ hand: [c, ing('cheese'), ing('tomato')] }, { hand: [ing('meat')] }, {}],
    });
    const r = play(s, c.id);
    expect(r.error).toBeUndefined();
    expect(r.state.players[0].hand).toHaveLength(3);
    expect(r.state.turn).toBe(1);
    expect(r.state.turnNumber).toBe(2);
  });

  it('wraps turn rotation from last to first', () => {
    const c = ing('meat');
    const s = makeState({
      players: [{ hand: [ing('cheese')] }, { hand: [ing('lettuce')] }, { hand: [c] }],
      turn: 2,
    });
    expect(play(s, c.id, undefined, undefined, 'p3').state.turn).toBe(0);
  });

  it('never mutates the input state', () => {
    const c = pest('meat');
    const target = slot('meat');
    const s = makeState({ players: [{ hand: [c, ing('cheese')] }, { body: [target] }, {}] });
    const snapshot = structuredClone(s);
    play(s, c.id, tgt('p2', target));
    expect(s).toEqual(snapshot);
  });
});

describe('discard', () => {
  const hand = () => [ing('meat'), ing('cheese'), ing('tomato')];

  it('discards 1 to 3 cards and refills', () => {
    for (const n of [1, 2, 3]) {
      const s = makeState({ players: [{ hand: hand() }, { hand: [ing('meat')] }, {}] });
      const ids = s.players[0].hand.slice(0, n).map((c) => c.id);
      const r = applyAction(s, 'p1', { type: 'discard', cardIds: ids });
      expect(r.state.discard.map((c) => c.id)).toEqual(ids);
      expect(r.state.players[0].hand).toHaveLength(3);
      expect(r.state.turn).toBe(1);
    }
  });

  it('rejects 0, more than 3, repeated or foreign cards', () => {
    const s = makeState({
      players: [{ hand: [...hand(), ing('lettuce')] }, { hand: [ing('meat')] }, {}],
    });
    const ids = s.players[0].hand.map((c) => c.id);
    const d = (cardIds) => applyAction(s, 'p1', { type: 'discard', cardIds }).error;
    expect(d([])).toBeTruthy();
    expect(d(ids)).toBeTruthy();
    expect(d('nope')).toBeTruthy();
    expect(d([ids[0], ids[0]])).toBe('Cartas repetidas');
    expect(d([s.players[1].hand[0].id])).toBe('Esa carta no está en tu mano');
  });
});

describe('deck reshuffle', () => {
  it('reshuffles the discard pile when the deck runs out', () => {
    const c = ing('meat');
    const old = filler(5);
    const s = makeState({
      players: [{ hand: [c] }, { hand: [ing('cheese')] }, {}],
      deck: [ing('tomato')],
      discard: old,
    });
    const r = play(s, c.id);
    expect(r.state.players[0].hand).toHaveLength(3);
    expect(r.state.deck.length + r.state.discard.length).toBe(3);
    expect(r.events.some((e) => e.text.includes('barajó'))).toBe(true);
    expect(allCards(r.state)).toHaveLength(allCards(s).length);
  });

  it('stops drawing when deck and discard are both empty', () => {
    const c = ing('meat');
    const s = makeState({ players: [{ hand: [c] }, { hand: [ing('cheese')] }], deck: [] });
    const r = play(s, c.id);
    expect(r.state.players[0].hand).toHaveLength(0);
    expect(r.state.turn).toBe(1);
  });
});

describe('empty hands at turn start', () => {
  it('a player without cards draws 3 before their turn', () => {
    const c = ing('meat');
    const s = makeState({
      players: [{ hand: [c] }, { hand: [] }, { hand: [ing('cheese')] }],
      deck: filler(10),
    });
    const r = play(s, c.id);
    expect(r.state.turn).toBe(1);
    expect(r.state.players[1].hand).toHaveLength(3);
  });

  it('skips players who still have no cards', () => {
    const c = ing('meat');
    const s = makeState({
      players: [{ hand: [c] }, { hand: [] }, { hand: [ing('cheese')] }],
      deck: [],
    });
    const r = play(s, c.id);
    expect(r.state.turn).toBe(2);
    expect(r.events.some((e) => e.text.includes('Luis no tiene cartas'))).toBe(true);
  });

  it('ends in a draw when nobody has cards left', () => {
    const c = ing('meat');
    const s = makeState({ players: [{ hand: [c] }, { hand: [] }], deck: [] });
    const r = play(s, c.id);
    expect(r.state.status).toBe('finished');
    expect(r.state.winnerId).toBeNull();
  });
});

describe('ingredients', () => {
  it('go to your own plate', () => {
    const c = ing('lettuce');
    const s = makeState({ players: [{ hand: [c] }, { hand: [ing('meat')] }, {}] });
    const r = play(s, c.id, { playerId: 'p2', ingredientId: 'whatever' });
    expect(r.state.players[0].body).toEqual([{ card: c, modifiers: [] }]);
    expect(r.state.players[1].body).toEqual([]);
  });

  it('cannot repeat a kind', () => {
    const c = ing('lettuce');
    const s = makeState({ players: [{ hand: [c], body: [slot('lettuce')] }, {}, {}] });
    expect(play(s, c.id).error).toBe('Ya tienes ese ingrediente en tu plato');
  });
});

describe('compatibility and state', () => {
  it('matches same kind or universal', () => {
    expect(isCompatible('meat', 'meat')).toBe(true);
    expect(isCompatible('any', 'cheese')).toBe(true);
    expect(isCompatible('meat', 'cheese')).toBe(false);
  });

  it('computes ingredient states', () => {
    expect(ingredientState(slot('meat'))).toBe('fresh');
    expect(ingredientState(slot('meat', pest('meat')))).toBe('contaminated');
    expect(ingredientState(slot('meat', cold('meat')))).toBe('chilled');
    expect(ingredientState(slot('meat', cold('meat'), cold('any')))).toBe('frozen');
  });
});

describe('pests', () => {
  const setup = (target, card = pest('meat')) => ({
    card,
    target,
    s: makeState({
      players: [{ hand: [card, ing('cheese')] }, { body: [target], hand: [ing('cheese')] }, {}],
    }),
  });

  it('fresh → contaminated', () => {
    const { card, target, s } = setup(slot('meat'));
    const r = play(s, card.id, tgt('p2', target));
    expect(r.state.players[1].body[0].modifiers).toEqual([card]);
  });

  it('contaminated → spoiled (ingredient and both pests discarded)', () => {
    const first = pest('any');
    const { card, target, s } = setup(slot('meat', first));
    const r = play(s, card.id, tgt('p2', target));
    expect(r.state.players[1].body).toEqual([]);
    expect(r.state.discard.map((c) => c.id).sort()).toEqual(
      [first.id, target.card.id, card.id].sort(),
    );
  });

  it('chilled → fresh (pest and cold discarded)', () => {
    const c = cold('meat');
    const { card, target, s } = setup(slot('meat', c));
    const r = play(s, card.id, tgt('p2', target));
    expect(r.state.players[1].body[0].modifiers).toEqual([]);
    expect(r.state.discard.map((x) => x.id).sort()).toEqual([c.id, card.id].sort());
  });

  it('frozen → invalid', () => {
    const { card, target, s } = setup(slot('meat', cold('meat'), cold('meat')));
    expect(play(s, card.id, tgt('p2', target)).error).toBe('Ese ingrediente está congelado');
  });

  it('universal pest works on any ingredient', () => {
    const { card, target, s } = setup(slot('tomato'), pest('any'));
    expect(play(s, card.id, tgt('p2', target)).error).toBeUndefined();
  });

  it('wrong kind → invalid', () => {
    const { card, target, s } = setup(slot('cheese'));
    expect(play(s, card.id, tgt('p2', target)).error).toBe('La plaga no es de ese ingrediente');
  });

  it('own plate → invalid', () => {
    const card = pest('meat');
    const own = slot('meat');
    const s = makeState({ players: [{ hand: [card], body: [own] }, {}, {}] });
    expect(play(s, card.id, tgt('p1', own)).error).toBe(
      'No puedes echarle una plaga a tu propio plato',
    );
  });

  it('missing or bad targets → invalid', () => {
    const { card, s } = setup(slot('meat'));
    expect(play(s, card.id).error).toBe('Tienes que elegir un ingrediente');
    expect(play(s, card.id, { playerId: 'zz', ingredientId: 'a' }).error).toBe(
      'Ese jugador no existe',
    );
    expect(play(s, card.id, { playerId: 'p2', ingredientId: 'a' }).error).toBe(
      'Ese ingrediente no está en el plato',
    );
  });
});

describe('cold', () => {
  const setup = (target, card = cold('meat')) => ({
    card,
    target,
    s: makeState({
      players: [{ hand: [card, ing('cheese')], body: [target] }, { hand: [ing('cheese')] }, {}],
    }),
  });

  it('fresh → chilled', () => {
    const { card, target, s } = setup(slot('meat'));
    const r = play(s, card.id, tgt('p1', target));
    expect(ingredientState(r.state.players[0].body[0])).toBe('chilled');
  });

  it('chilled → frozen', () => {
    const { card, target, s } = setup(slot('meat', cold('any')));
    const r = play(s, card.id, tgt('p1', target));
    expect(ingredientState(r.state.players[0].body[0])).toBe('frozen');
  });

  it('contaminated → fresh (cold and pest discarded)', () => {
    const p = pest('meat');
    const { card, target, s } = setup(slot('meat', p));
    const r = play(s, card.id, tgt('p1', target));
    expect(r.state.players[0].body[0].modifiers).toEqual([]);
    expect(r.state.discard.map((x) => x.id).sort()).toEqual([p.id, card.id].sort());
  });

  it('frozen → invalid', () => {
    const { card, target, s } = setup(slot('meat', cold('meat'), cold('meat')));
    expect(play(s, card.id, tgt('p1', target)).error).toBe('Ese ingrediente ya está congelado');
  });

  it('wrong kind → invalid', () => {
    const { card, target, s } = setup(slot('lettuce'));
    expect(play(s, card.id, tgt('p1', target)).error).toBe('El frío no es de ese ingrediente');
  });

  it("someone else's plate → invalid", () => {
    const card = cold('meat');
    const other = slot('meat');
    const s = makeState({ players: [{ hand: [card] }, { body: [other] }, {}] });
    expect(play(s, card.id, tgt('p2', other)).error).toBe(
      'Solo puedes enfriar tus propios ingredientes',
    );
  });

  it('missing target → invalid', () => {
    const { card, s } = setup(slot('meat'));
    expect(play(s, card.id).error).toBe('Tienes que elegir un ingrediente');
  });
});
