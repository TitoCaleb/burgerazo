import { describe, it, expect, afterAll } from 'vitest';
import { startServer, emit, waitFor } from './helpers.js';
import { RoomManager } from '../../server/rooms.js';
import { validatePlay } from '../../server/engine/rules.js';
import { createRng } from '../../server/engine/deck.js';

/** Picks a random action that is valid from the player's own (filtered) view. */
function pickAction(view, rng) {
  const me = view.players.find((p) => p.id === view.me);
  const options = [];
  const targets = view.players.flatMap((p) =>
    p.body.map((s) => ({ playerId: p.id, ingredientId: s.card.id })),
  );
  for (const card of view.hand) {
    const tries = [{ cardId: card.id }];
    for (const target of targets) {
      tries.push({ cardId: card.id, target });
      for (const own of me.body) {
        tries.push({ cardId: card.id, target, extra: { ownIngredientId: own.card.id } });
      }
    }
    for (const t of tries)
      if (!validatePlay(view, me, card, t)) options.push({ type: 'playCard', ...t });
  }
  // Prefer playing; discard only when stuck.
  if (options.length) return options[Math.floor(rng() * options.length)];
  return { type: 'discard', cardIds: [view.hand[0].id] };
}

describe('full game over sockets', () => {
  let server;
  afterAll(() => server?.close());

  it('3 clients play until someone wins, then the host restarts', async () => {
    server = await startServer({ manager: new RoomManager({ seed: () => 777 }) });
    const sockets = [server.client(), server.client(), server.client()];
    const created = await emit(sockets[0], 'room:create', { name: 'Ana' });
    await emit(sockets[1], 'room:join', { code: created.code, name: 'Luis' });
    await emit(sockets[2], 'room:join', { code: created.code, name: 'Sofi' });
    expect((await emit(sockets[0], 'game:start')).ok).toBe(true);

    const rng = createRng(1);
    let turns = 0;
    let lastTurnNumber = 0;
    for (; turns < 2000; turns++) {
      const view = await waitFor(
        sockets[0],
        'game:state',
        (v) => v.turnNumber > lastTurnNumber || v.status !== 'playing',
      );
      if (view.status !== 'playing') break;
      lastTurnNumber = view.turnNumber;
      const active = sockets.find((s) => s.received['game:state'].at(-1)?.me === view.turnPlayerId);
      const activeView = await waitFor(
        active,
        'game:state',
        (v) => v.turnNumber === view.turnNumber,
      );
      const reply = await emit(active, 'game:action', pickAction(activeView, rng));
      expect(reply).toEqual({ ok: true });
    }

    const finals = await Promise.all(
      sockets.map((s) => waitFor(s, 'game:state', (v) => v.status === 'finished')),
    );
    expect(new Set(finals.map((v) => v.winnerId)).size).toBe(1);
    expect(finals[0].winnerId).toBeTruthy();
    await waitFor(sockets[1], 'room:state', (r) => r.status === 'finished');

    expect((await emit(sockets[1], 'game:restart')).error).toBe('Solo el anfitrión puede empezar');
    expect((await emit(sockets[0], 'game:restart')).ok).toBe(true);
    const fresh = await waitFor(sockets[2], 'game:state', (v) => v.status === 'playing');
    expect(fresh.players.every((p) => p.body.length === 0)).toBe(true);
  });
});
