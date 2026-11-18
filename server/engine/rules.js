import { ANY, CARD_TYPES, SPECIALS } from '../../shared/constants.js';

/** A pest/cold card fits an ingredient if same kind or the card is universal. */
export function isCompatible(cardKind, ingredientKind) {
  return cardKind === ANY || cardKind === ingredientKind;
}

/** 'fresh' | 'contaminated' | 'chilled' | 'frozen' */
export function ingredientState(slot) {
  const pests = slot.modifiers.filter((m) => m.type === CARD_TYPES.PEST).length;
  const colds = slot.modifiers.filter((m) => m.type === CARD_TYPES.COLD).length;
  if (pests > 0) return 'contaminated';
  if (colds >= 2) return 'frozen';
  if (colds === 1) return 'chilled';
  return 'fresh';
}

export function hasKind(body, kind) {
  return body.some((slot) => slot.card.kind === kind);
}

export function findSlot(player, ingredientId) {
  return player?.body.find((slot) => slot.card.id === ingredientId) ?? null;
}

/**
 * Resolves the target of a card that needs one.
 * Returns { error } or { targetPlayer, slot }.
 */
function resolveTarget(state, target) {
  if (!target || !target.playerId || !target.ingredientId) {
    return { error: 'Tienes que elegir un ingrediente' };
  }
  const targetPlayer = state.players.find((p) => p.id === target.playerId);
  if (!targetPlayer) return { error: 'Ese jugador no existe' };
  const slot = findSlot(targetPlayer, target.ingredientId);
  if (!slot) return { error: 'Ese ingrediente no está en el plato' };
  return { targetPlayer, slot };
}

/**
 * Validates playing `card` by `player`. Returns an error string (Spanish) or null.
 * Pure: never mutates.
 */
export function validatePlay(state, player, card, action) {
  switch (card.type) {
    case CARD_TYPES.INGREDIENT:
      return hasKind(player.body, card.kind) ? 'Ya tienes ese ingrediente en tu plato' : null;

    case CARD_TYPES.PEST: {
      const r = resolveTarget(state, action.target);
      if (r.error) return r.error;
      if (r.targetPlayer.id === player.id) return 'No puedes echarle una plaga a tu propio plato';
      if (!isCompatible(card.kind, r.slot.card.kind)) return 'La plaga no es de ese ingrediente';
      if (ingredientState(r.slot) === 'frozen') return 'Ese ingrediente está congelado';
      return null;
    }

    case CARD_TYPES.COLD: {
      const r = resolveTarget(state, action.target);
      if (r.error) return r.error;
      if (r.targetPlayer.id !== player.id) return 'Solo puedes enfriar tus propios ingredientes';
      if (!isCompatible(card.kind, r.slot.card.kind)) return 'El frío no es de ese ingrediente';
      if (ingredientState(r.slot) === 'frozen') return 'Ese ingrediente ya está congelado';
      return null;
    }

    case CARD_TYPES.SPECIAL:
      return validateSpecial(state, player, card, action);

    default:
      return 'Carta desconocida';
  }
}

function validateSpecial(state, player, card, action) {
  switch (card.special) {
    case SPECIALS.DROPPED: {
      const r = resolveTarget(state, action.target);
      if (r.error) return r.error;
      if (r.targetPlayer.id === player.id) return 'Elige un ingrediente de otro jugador';
      const st = ingredientState(r.slot);
      if (st === 'chilled' || st === 'frozen') return 'Ese ingrediente está protegido por el frío';
      return null;
    }

    case SPECIALS.ORDER_SWAP: {
      const r = resolveTarget(state, action.target);
      if (r.error) return r.error;
      if (r.targetPlayer.id === player.id) return 'Elige un ingrediente de otro jugador';
      const own = findSlot(player, action.extra?.ownIngredientId);
      if (!own) return 'Elige uno de tus ingredientes para cambiar';
      if (ingredientState(own) === 'frozen' || ingredientState(r.slot) === 'frozen') {
        return 'No se pueden cambiar ingredientes congelados';
      }
      const theirKind = r.slot.card.kind;
      const ownKind = own.card.kind;
      if (theirKind !== ownKind) {
        if (hasKind(player.body, theirKind)) return 'Ya tienes ese ingrediente';
        if (hasKind(r.targetPlayer.body, ownKind)) return 'Ese jugador ya tiene ese ingrediente';
      }
      return null;
    }

    case SPECIALS.INSPECTION:
    case SPECIALS.RUSH_HOUR:
    case SPECIALS.DAILY_SPECIAL:
      return null;

    default:
      return 'Carta desconocida';
  }
}
