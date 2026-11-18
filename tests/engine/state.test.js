import { describe, it, expect } from 'vitest';
import { createGame, getPlayerView } from '../../server/engine/state.js';
import { allCards } from './helpers.js';

const players = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `J${i + 1}` }));

describe('createGame', () => {
  it('deals 3 cards to each player and keeps all 66 cards', () => {
    const g = createGame({ players: players(4), seed: 1 });
    for (const p of g.players) {
      expect(p.hand).toHaveLength(3);
      expect(p.body).toEqual([]);
    }
    expect(g.deck).toHaveLength(66 - 12);
    expect(new Set(allCards(g).map((c) => c.id)).size).toBe(66);
    expect(g.status).toBe('playing');
    expect(g.turn).toBeGreaterThanOrEqual(0);
    expect(g.turn).toBeLessThan(4);
  });

  it('is deterministic per seed and keeps join order', () => {
    const a = createGame({ players: players(3), seed: 9 });
    const b = createGame({ players: players(3), seed: 9 });
    expect(a).toEqual(b);
    expect(a.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('picks different starting players across seeds', () => {
    const starts = new Set();
    for (let seed = 0; seed < 50; seed++)
      starts.add(createGame({ players: players(3), seed }).turn);
    expect(starts.size).toBe(3);
  });

  it('rejects fewer than 2 or more than 6 players', () => {
    expect(() => createGame({ players: players(1), seed: 1 })).toThrow();
    expect(() => createGame({ players: players(7), seed: 1 })).toThrow();
    expect(() => createGame({ players: undefined, seed: 1 })).toThrow();
  });
});

describe('getPlayerView', () => {
  const g = createGame({ players: players(3), seed: 5 });
  const view = getPlayerView(g, 'p2');
  const json = JSON.stringify(view);

  it('includes own hand and public info', () => {
    expect(view.hand).toEqual(g.players[1].hand);
    expect(view.players.map((p) => p.handCount)).toEqual([3, 3, 3]);
    expect(view.deckCount).toBe(g.deck.length);
    expect(view.turnPlayerId).toBe(g.players[g.turn].id);
    expect(view.status).toBe('playing');
    expect(view.winnerId).toBeNull();
    expect(view.discardTop).toBeNull();
  });

  it('never leaks other hands, the deck or the rng', () => {
    for (const other of [g.players[0], g.players[2]]) {
      for (const c of other.hand) expect(json).not.toContain(`"${c.id}"`);
    }
    for (const c of g.deck) expect(json).not.toContain(`"${c.id}"`);
    expect(view).not.toHaveProperty('deck');
    expect(view).not.toHaveProperty('rngState');
    for (const p of view.players) expect(p).not.toHaveProperty('hand');
  });

  it('returns an empty hand for spectators / unknown ids', () => {
    expect(getPlayerView(g, 'nobody').hand).toEqual([]);
  });

  it('shows the top of the discard pile', () => {
    const s = structuredClone(g);
    s.discard.push({ id: 'x1', type: 'pest', kind: 'meat' });
    expect(getPlayerView(s, 'p1').discardTop).toEqual({ id: 'x1', type: 'pest', kind: 'meat' });
  });
});
