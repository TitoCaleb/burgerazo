import { INGREDIENT_EMOJI, INGREDIENT_LABELS, SPECIAL_INFO, ANY } from '../shared/constants.js';
import { ingredientState } from '../server/engine/rules.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

export const kindLabel = (kind) => INGREDIENT_LABELS[kind] ?? kind;

/** Title + big icon + small caption for any card. */
export function describeCard(card) {
  switch (card.type) {
    case 'ingredient':
      return {
        icon: INGREDIENT_EMOJI[card.kind],
        title: cap(kindLabel(card.kind)),
        caption: 'Ingrediente',
      };
    case 'pest':
      return card.kind === ANY
        ? { icon: '🐀', title: 'Rata', caption: 'Plaga para cualquier ingrediente' }
        : {
            icon: '🪰',
            title: 'Plaga',
            caption: `para ${kindLabel(card.kind)} ${INGREDIENT_EMOJI[card.kind]}`,
          };
    case 'cold':
      return card.kind === ANY
        ? { icon: '🧊', title: 'Nevera', caption: 'Frío para cualquier ingrediente' }
        : {
            icon: '❄️',
            title: 'Frío',
            caption: `para ${kindLabel(card.kind)} ${INGREDIENT_EMOJI[card.kind]}`,
          };
    case 'special': {
      const info = SPECIAL_INFO[card.special];
      return { icon: info.emoji, title: info.name, caption: info.text };
    }
    default:
      return { icon: '❓', title: '?', caption: '' };
  }
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function cardHTML(
  card,
  { selected = false, disabled = false, isNew = false, attrs = '' } = {},
) {
  const { icon, title, caption } = describeCard(card);
  const kind = card.kind ?? card.special;
  const classes = ['card', `card--${card.type}`, `kind--${kind}`];
  if (selected) classes.push('is-selected');
  if (isNew) classes.push('is-new');
  return `<button type="button" class="${classes.join(' ')}" data-card="${esc(card.id)}" ${
    disabled ? 'disabled' : ''
  } ${attrs}>
    <span class="card__icon" aria-hidden="true">${icon}</span>
    <span class="card__title">${esc(title)}</span>
    <span class="card__caption">${esc(caption)}</span>
  </button>`;
}

const STATE_INFO = {
  fresh: { badge: '', label: 'fresco' },
  contaminated: { badge: '🪰', label: 'con plaga' },
  chilled: { badge: '❄️', label: 'refrigerado' },
  frozen: { badge: '🧊', label: 'congelado' },
};

export function slotHTML(slot, playerId, { target = false, selected = false } = {}) {
  const st = ingredientState(slot);
  const info = STATE_INFO[st];
  const classes = ['slot', `kind--${slot.card.kind}`, `state--${st}`];
  if (target) classes.push('is-target');
  if (selected) classes.push('is-selected');
  return `<button type="button" class="${classes.join(' ')}" data-player="${esc(playerId)}" data-slot="${esc(
    slot.card.id,
  )}" ${target || selected ? '' : 'tabindex="-1"'} aria-label="${esc(
    `${kindLabel(slot.card.kind)} ${info.label}`,
  )}">
    <span class="slot__icon" aria-hidden="true">${INGREDIENT_EMOJI[slot.card.kind]}</span>
    ${info.badge ? `<span class="slot__badge" aria-hidden="true">${info.badge}</span>` : ''}
    <span class="slot__label">${esc(info.label)}</span>
  </button>`;
}

let toastTimer;
export function toast(message, kind = 'error') {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2800);
}
