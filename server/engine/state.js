import { HAND_SIZE, MIN_PLAYERS, MAX_PLAYERS, GAME_STATUS } from '../../shared/constants.js';
import { createDeck, createRng, shuffle } from './deck.js';

/**
 * Creates a new game. `players` is [{ id, name }] in turn order.
 * `seed` makes shuffling and the starting player deterministic.
 */
export function createGame({ players, seed }) {
  if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new Error(`Se necesitan entre ${MIN_PLAYERS} y ${MAX_PLAYERS} jugadores`);
  }
  const rng = createRng(seed);
  const deck = shuffle(createDeck(), rng);
  const gamePlayers = players.map(({ id, name }) => ({ id, name, hand: [], body: [] }));
  for (let round = 0; round < HAND_SIZE; round++) {
    for (const p of gamePlayers) p.hand.push(deck.pop());
  }
  return {
    players: gamePlayers,
    deck,
    discard: [],
    turn: Math.floor(rng() * gamePlayers.length),
    turnNumber: 1,
    status: GAME_STATUS.PLAYING,
    winnerId: null,
    rngState: rng.getState(),
  };
}

/** What a single player is allowed to see. Never includes other hands or the deck. */
export function getPlayerView(state, playerId) {
  const me = state.players.find((p) => p.id === playerId);
  return {
    me: playerId,
    hand: me ? structuredClone(me.hand) : [],
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      body: structuredClone(p.body),
    })),
    turnPlayerId: state.players[state.turn]?.id ?? null,
    turnNumber: state.turnNumber,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    discardTop: state.discard.length ? { ...state.discard[state.discard.length - 1] } : null,
    status: state.status,
    winnerId: state.winnerId,
  };
}
