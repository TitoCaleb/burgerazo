// Shared constants between server and client. Pure data, no imports.

export const INGREDIENTS = ['meat', 'cheese', 'lettuce', 'tomato'];
export const ANY = 'any';

export const CARD_TYPES = {
  INGREDIENT: 'ingredient',
  PEST: 'pest',
  COLD: 'cold',
  SPECIAL: 'special',
};

export const SPECIALS = {
  ORDER_SWAP: 'orderSwap',
  DROPPED: 'dropped',
  INSPECTION: 'inspection',
  RUSH_HOUR: 'rushHour',
  DAILY_SPECIAL: 'dailySpecial',
};

export const HAND_SIZE = 3;
export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY_SIZE = 50;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export const GAME_STATUS = { PLAYING: 'playing', FINISHED: 'finished' };
export const ROOM_STATUS = { LOBBY: 'lobby', PLAYING: 'playing', FINISHED: 'finished' };

// Human-readable labels (Spanish UI)
export const INGREDIENT_LABELS = {
  meat: 'carne',
  cheese: 'queso',
  lettuce: 'lechuga',
  tomato: 'tomate',
  any: 'universal',
};

export const INGREDIENT_EMOJI = {
  meat: '🥩',
  cheese: '🧀',
  lettuce: '🥬',
  tomato: '🍅',
  any: '⭐',
};

export const SPECIAL_INFO = {
  orderSwap: {
    name: 'Cambio de pedido',
    emoji: '🔄',
    text: 'Cambia uno de tus ingredientes por uno de otro jugador (ninguno congelado).',
  },
  dropped: {
    name: '¡Se cayó al piso!',
    emoji: '💥',
    text: 'Un ingrediente sin frío de otro jugador se va a la basura.',
  },
  inspection: {
    name: 'Inspección sanitaria',
    emoji: '📋',
    text: 'Todos los ingredientes con plaga de todos los platos se van a la basura.',
  },
  rushHour: {
    name: 'Hora pico',
    emoji: '⏰',
    text: 'Cada jugador pasa su mano al siguiente jugador.',
  },
  dailySpecial: {
    name: 'Plato del día',
    emoji: '🍟',
    text: 'Robas 2 cartas extra.',
  },
};

export const EVENTS = {
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_REJOIN: 'room:rejoin',
  ROOM_LEAVE: 'room:leave',
  ROOM_STATE: 'room:state',
  GAME_START: 'game:start',
  GAME_ACTION: 'game:action',
  GAME_RESTART: 'game:restart',
  GAME_STATE: 'game:state',
  GAME_EVENT: 'game:event',
  CHAT_SEND: 'chat:send',
  CHAT_MESSAGE: 'chat:message',
  CHAT_HISTORY: 'chat:history',
  ERROR: 'error',
};
