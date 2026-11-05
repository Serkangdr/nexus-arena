// Nexus Arena paneli · ortak arayüz parçaları
// Asıl uygulamadaki Blazor bileşenlerinin (Components/Shared) işaretlemesiyle birebir aynıdır.

import { esc, money, duration } from './data.js';

const ICONS = {
  dashboard:
    '<rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />',
  monitor:
    '<rect x="2.5" y="4" width="19" height="12.5" rx="1.5" /><path d="M8 20.5h8M12 16.5v4" />',
  timer: '<circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9.5 2.5h5" />',
  users:
    '<circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.7 2.5 3 5.2" />',
  calendar:
    '<rect x="3" y="4.5" width="18" height="16" rx="1.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" />',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="9.5" y="9.5" width="5" height="5" /><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />',
  gamepad:
    '<path d="M7 7h10a5 5 0 0 1 4.8 6.4l-1 3.3a2.5 2.5 0 0 1-4.3.9L14.5 15h-5l-2 2.6a2.5 2.5 0 0 1-4.3-.9l-1-3.3A5 5 0 0 1 7 7Z" /><path d="M7.5 10v3M6 11.5h3M15.5 11h.01M17.5 12.5h.01" />',
  tag: '<path d="M3 12.2V4a1 1 0 0 1 1-1h8.2a1 1 0 0 1 .7.3l8 8a1 1 0 0 1 0 1.4l-8.2 8.2a1 1 0 0 1-1.4 0l-8-8a1 1 0 0 1-.3-.7Z" /><circle cx="8" cy="8" r="1.5" />',
  type: '<path d="M4 7V4.5h16V7M12 4.5v15M8.5 19.5h7" />',
  shield:
    '<path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6l-8-3Z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" />',
  external:
    '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />',
  logout:
    '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16.5 14.5 12 10 7.5M14.5 12H3.5" />',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" />',
  dot: '<circle cx="12" cy="12" r="3" />',
  dots: '<path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3" />',
  phone:
    '<path d="M5 4h3.5l1.5 4.5-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />',
  alert: '<circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" />',
  close: '<path d="M6 6l12 12M18 6 6 18" />',
  plus: '<path d="M12 5v14M5 12h14" />',
  pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" />',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5M14 11v5" />',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6" />',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6" />',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6" />',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6" />',
  // Demo'ya özgü: veriyi baştan yükleme
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4v4h4" />',
};

/** Çizgi ikonlar: 24x24, 1.75 kalınlık, renk yazıdan gelir. */
export const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] ?? ''}</svg>`;

export function pageHeader({
  eyebrow = '',
  title,
  description = null,
  backHref = null,
  backLabel = 'Geri',
  actions = '',
}) {
  return `<header class="page-head">
    <div class="page-head__text">
        ${backHref ? `<a class="back-link" href="${backHref}">${icon('arrow-left')}${esc(backLabel)}</a>` : ''}
        <p class="page-head__eyebrow mono">${esc(eyebrow)}</p>
        <h1 class="page-head__title">${esc(title)}</h1>
        ${description != null ? `<p class="page-head__description">${esc(description)}</p>` : ''}
    </div>
    ${actions ? `<div class="page-head__actions">${actions}</div>` : ''}
</header>`;
}

/**
 * Silme gibi geri alınamaz işlemler için iki adımlı buton: önce sorar, sonra yapar.
 * Hangi butonun soru sorduğu sayfanın arayüz durumunda (ui.confirm) tutulur.
 */
export function confirmButton(
  ui,
  {
    id,
    action,
    data = {},
    content,
    buttonClass = 'icon-button icon-button--danger',
    ariaLabel = null,
    question = 'Silinsin mi?',
    confirmText = 'Evet, sil',
    disabled = false,
  },
) {
  const attrs = Object.entries(data)
    .map(([key, value]) => ` data-${key}="${esc(value)}"`)
    .join('');
  if (ui.confirm !== id) {
    return `<button type="button" class="${buttonClass}" data-action="confirm:ask" data-confirm="${esc(id)}"${disabled ? ' disabled' : ''}${ariaLabel ? ` aria-label="${esc(ariaLabel)}" title="${esc(ariaLabel)}"` : ''}>${content}</button>`;
  }
  return `<span class="confirm" role="group" aria-label="Onay">
        <span class="confirm__question">${esc(question)}</span>
        <button type="button" class="btn btn--sm btn--danger" data-action="${action}"${attrs}>${esc(confirmText)}</button>
        <button type="button" class="btn btn--sm btn--ghost" data-action="confirm:no">Vazgeç</button>
    </span>`;
}

/** Listede kaydı bir yukarı / aşağı taşır. */
export function orderButtons({ action, id, itemName, isFirst, isLast }) {
  return `<span class="order-buttons">
    <button type="button" class="icon-button icon-button--sm" data-action="${action}" data-id="${id}" data-offset="-1"${isFirst ? ' disabled' : ''} aria-label="${esc(itemName)} yukarı taşı" title="Yukarı taşı">${icon('arrow-up')}</button>
    <button type="button" class="icon-button icon-button--sm" data-action="${action}" data-id="${id}" data-offset="1"${isLast ? ' disabled' : ''} aria-label="${esc(itemName)} aşağı taşı" title="Aşağı taşı">${icon('arrow-down')}</button>
</span>`;
}

/** Bir kaydı sitede göster / gizle anahtarı. */
export function visibilityToggle({ action, id, itemName, value }) {
  return `<button type="button" class="switch${value ? ' is-on' : ''}" role="switch" aria-checked="${value}" aria-label="${esc(itemName)}: sitede ${value ? 'görünüyor' : 'gizli'}" title="${value ? 'Sitede görünüyor' : 'Sitede gizli'}" data-action="${action}" data-id="${id}" data-value="${!value}">
    <span class="switch__thumb"></span>
</button>`;
}

/** Alan sınırına yaklaştıkça uyaran karakter sayacı. */
export function charCount(value, max) {
  const length = (value ?? '').length;
  const state = length > max ? ' is-over' : length > max * 0.85 ? ' is-near' : '';
  return `<span class="char-count${state}" aria-hidden="true">${length}/${max}</span>`;
}

/** Blazor'ın <ValidationMessage> çıktısı. */
export const validation = (errors, key) =>
  errors?.[key] ? `<div class="validation-message">${esc(errors[key])}</div>` : '';

export const invalid = (errors, key) => (errors?.[key] ? ' invalid' : '');

/** Oturum ücretinin dökümü: paket + aşım ya da dilime yuvarlanmış süre × saatlik tarife. */
export function chargeDetails({ charge, hourlyRate, pkg, totalLabel = 'Şu ana kadar' }) {
  const rows = pkg
    ? `<div><dt>${esc(pkg.name)} (${duration(pkg.minutes)})</dt><dd>${money(pkg.price)}</dd></div>${
        charge.overtimeMinutes > 0
          ? `<div class="is-warn"><dt>Aşım · ${duration(charge.overtimeMinutes)}</dt><dd>${money(charge.overtimeAmount)}</dd></div>`
          : ''
      }`
    : `<div>
            <dt>Ücrete esas süre · ${duration(charge.billedMinutes)}</dt>
            <dd>${money(charge.amount)}</dd>
        </div>
        <div class="is-muted"><dt>Saatlik tarife</dt><dd>${money(hourlyRate)}</dd></div>`;
  return `<dl class="charge-details">
    ${rows}
    <div class="charge-details__total"><dt>${esc(totalLabel)}</dt><dd>${money(charge.amount)}</dd></div>
</dl>`;
}

export const initials = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toLocaleUpperCase('tr'))
    .join('');

export const skeleton = '<div class="rows-skeleton" aria-busy="true"></div>';
