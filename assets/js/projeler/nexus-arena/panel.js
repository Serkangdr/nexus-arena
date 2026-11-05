// Nexus Arena · admin paneli (demo)
//
// Asıl panel Blazor Server ile çalışır: ekranlar sunucuda çizilir, tıklamalar SignalR ile gider,
// diğer personelin işlemleri anında yansır. Bu statik demo aynı ekranları tarayıcıda çizer:
// her değişiklikten sonra sayfa yeniden üretilir ve mevcut DOM'a yamanır (Blazor'ın fark
// algoritması gibi), böylece odak, açık çekmece ve animasyonlar korunur. Veriler ortak demo
// katmanındadır (data.js); site ve panel aynı veriyi paylaşır, açık sekmeler anında senkronlanır.

import * as D from './data.js';
import { icon, initials } from './panel-ui.js';
import { pcMap, sessions, customers, customerProfile, reservations } from './panel-ops.js';
import { tiers, tierEdit, games, prices, siteTexts } from './panel-content.js';

const SITE_URL = 'index.html';
const AUTH_KEY = 'nexus-arena:panel-oturum';
const STAFF = { name: D.STAFF_NAME, role: 'Yönetici', isAdmin: true };

// ===========================================================================
// DOM yaması: yeni işaretlemeyi mevcut ağaca uygular, aynı kalan düğümlere dokunmaz.

function morph(target, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  patchChildren(target, template.content);
}

function patchChildren(parent, next) {
  const current = [...parent.childNodes];
  const incoming = [...next.childNodes];
  incoming.forEach((node, i) => {
    const existing = current[i];
    if (!existing) parent.appendChild(node);
    else if (!sameKind(existing, node)) parent.replaceChild(node, existing);
    else patchNode(existing, node);
  });
  for (let i = incoming.length; i < current.length; i++) current[i].remove();
}

const sameKind = (a, b) =>
  a.nodeType === b.nodeType &&
  a.nodeName === b.nodeName &&
  (a.nodeType !== 1 || (a.getAttribute('data-key') ?? '') === (b.getAttribute('data-key') ?? ''));

function patchNode(el, next) {
  if (el.nodeType !== 1) {
    if (el.nodeValue !== next.nodeValue) el.nodeValue = next.nodeValue;
    return;
  }
  for (const { name } of [...el.attributes]) {
    // <details> açıklığı kullanıcının elinde; yeniden çizim kapatmasın.
    if (!next.hasAttribute(name) && !(name === 'open' && el.tagName === 'DETAILS'))
      el.removeAttribute(name);
  }
  for (const { name, value } of [...next.attributes]) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
  switch (el.tagName) {
    case 'INPUT':
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = next.hasAttribute('checked');
      else if (el.value !== (next.getAttribute('value') ?? ''))
        el.value = next.getAttribute('value') ?? '';
      return;
    case 'TEXTAREA':
      if (el.value !== next.textContent) el.value = next.textContent;
      return;
    case 'SELECT': {
      patchChildren(el, next);
      const chosen = [...next.children].find((o) => o.hasAttribute('selected'));
      const value = chosen
        ? chosen.getAttribute('value')
        : (next.children[0]?.getAttribute('value') ?? '');
      if (el.value !== value) el.value = value;
      return;
    }
    default:
      patchChildren(el, next);
  }
}

// ===========================================================================
// Bildirimler: sayfanın köşesinde kısa süre görünen "Kaydedildi" / hata mesajları

const toaster = document.createElement('div');
toaster.className = 'toaster';
toaster.setAttribute('role', 'status');
toaster.setAttribute('aria-live', 'polite');

function toast(message, isError = false) {
  const item = document.createElement('div');
  item.className = `toast toast--${isError ? 'error' : 'success'}`;
  item.innerHTML = `${icon(isError ? 'alert' : 'check')}<span>${D.esc(message)}</span>`;
  toaster.appendChild(item);
  setTimeout(() => item.remove(), isError ? 6000 : 2600);
}

// ===========================================================================
// Giriş (demo): gerçek kimlik doğrulama yok; oturum bu sekmede tutulur.

function signedIn() {
  try {
    return sessionStorage.getItem(AUTH_KEY) === '1';
  } catch {
    return memoryAuth;
  }
}
let memoryAuth = false;
function setSignedIn(value) {
  memoryAuth = value;
  try {
    if (value) sessionStorage.setItem(AUTH_KEY, '1');
    else sessionStorage.removeItem(AUTH_KEY);
  } catch {
    // gizli sekme
  }
}

const login = {
  title: () => 'Personel girişi · Nexus Arena',
  enter: () => ({
    email: 'yonetici@nexusarena.demo',
    password: 'demo-panel',
    remember: true,
    errors: {},
    error: null,
  }),
  view({ ui }) {
    const field = (key) => (ui.errors[key] ? ' invalid' : '');
    const message = (key) =>
      ui.errors[key] ? `<div class="validation-message">${ui.errors[key]}</div>` : '';
    return `<div class="auth">
    <section class="auth__brand" aria-hidden="true">
        <a class="brand" href="${SITE_URL}" tabindex="-1">
            <span class="brand__mark"></span>
            <span>Nexus<span class="brand__slash">/</span>Arena</span>
        </a>
        <p class="auth__title">Kontrol<br /><span>paneli</span></p>
        <p class="auth__meta mono"><span class="pulse"></span>Yalnızca personel</p>
    </section>

    <section class="auth__panel">
        <form class="auth-form" novalidate data-submit="signIn">
            <header>
                <h1 class="auth-form__title">Giriş yap</h1>
                <p class="auth-form__lead">Vardiyanı başlatmak için hesabınla giriş yap.</p>
            </header>
            <p class="form-alert form-alert--warn">Demo: hesap bilgileri hazır, "Giriş yap"a basman yeterli. Değişiklikler yalnızca bu tarayıcıda saklanır.</p>
            ${ui.error ? `<p class="form-alert" role="alert">${D.esc(ui.error)}</p>` : ''}
            <div class="field">
                <label class="field__label" for="email">E-posta</label>
                <input id="email" class="field__input${field('email')}" data-bind="email" value="${D.esc(ui.email)}" autocomplete="username" inputmode="email" />
                ${message('email')}
            </div>
            <div class="field">
                <label class="field__label" for="password">Şifre</label>
                <input id="password" type="password" class="field__input${field('password')}" data-bind="password" value="${D.esc(ui.password)}" autocomplete="current-password" />
                ${message('password')}
            </div>
            <label class="check">
                <input type="checkbox" data-bind="remember"${ui.remember ? ' checked' : ''} />
                <span>Bu cihazda açık kalsın</span>
            </label>
            <button type="submit" class="btn btn--volt btn--block">
                <span class="roll" data-text="Giriş yap"><span>Giriş yap</span></span>
            </button>
        </form>
    </section>
</div>`;
  },
  actions: {
    signIn({ ui }) {
      ui.errors = {};
      if (!ui.email.trim()) ui.errors.email = 'E-posta gerekli.';
      else if (!/^[^@\s]+@[^@\s]+$/.test(ui.email.trim()))
        ui.errors.email = 'Geçerli bir e-posta adresi gir.';
      if (!ui.password) ui.errors.password = 'Şifre gerekli.';
      if (Object.keys(ui.errors).length) return;
      setSignedIn(true);
      navigate(returnTo ?? '/');
    },
  },
};

// ===========================================================================
// Panel ana sayfası

const dashboard = {
  title: () => 'Panel · Nexus Arena',
  enter: () => ({}),
  tick: 10000,
  view({ state, now }) {
    const date = new Date(now);
    const firstName = STAFF.name.split(' ')[0];
    const policy = D.reservationPolicy(state);
    const active = state.stations.filter((s) => !s.isOutOfService);
    const outOfService = state.stations.length - active.length;
    const openSessions = state.sessions.filter((g) => g.endedAt == null);
    const busy = openSessions.filter(
      (g) => !D.stationById(state, g.stationId).isOutOfService,
    ).length;
    const held = D.heldStationIds(state, now);
    const free = active.length - busy - held.length;
    const pending = state.reservations.filter(
      (r) => r.status === 'pending' && r.startsAt > policy.liveCutoff(now),
    ).length;
    const customerCount = state.customers.filter((c) => c.isActive).length;
    const tierRows = [...state.tiers].sort(D.byOrder).map((t) => {
      const stations = active.filter((s) => s.tierId === t.id);
      return {
        name: t.name,
        stations: stations.length,
        free: stations.filter((s) => !D.openSessionOf(state, s.id) && !held.includes(s.id)).length,
        rate: t.hourlyRate,
      };
    });
    const placeholderLinks = state.links.filter((l) => l.url === '#' || l.url === '').length;
    const missingRates = tierRows.filter((t) => t.rate <= 0).map((t) => t.name);
    const total = active.length + outOfService;
    const setup = [
      ['Yönetici hesabı', true, 'Panele giriş yapabiliyorsun.'],
      [
        "PC'ler tanımlandı",
        total > 0,
        total > 0 ? `${total} PC kayıtlı.` : 'Henüz hiç PC yok; PC haritası modülünden eklenecek.',
      ],
      [
        'Saatlik tarifeler',
        missingRates.length === 0,
        missingRates.length === 0
          ? 'Tüm sınıfların tarifesi girildi.'
          : `Eksik: ${missingRates.join(', ')}. Oturum ücreti bunlarla hesaplanacak.`,
      ],
      [
        'Sosyal medya bağlantıları',
        placeholderLinks === 0,
        placeholderLinks === 0
          ? 'Sitedeki bağlantılar gerçek adreslere gidiyor.'
          : `${placeholderLinks} bağlantı hâlâ boş; sitede tıklanınca bir yere gitmiyor.`,
      ],
    ];
    const ratio = (part, whole) => (whole === 0 ? 0 : +(part / whole).toFixed(3));
    const hint =
      (outOfService > 0 ? `${outOfService} PC hizmet dışı` : "Tüm PC'ler hizmette") +
      (held.length > 0 ? ` · ${held.length} PC rezerve` : '');

    return `<header class="page-head">
    <div>
        <p class="page-head__eyebrow mono">${D.formatDate(date, 'dddd, d MMMM yyyy')}</p>
        <h1 class="page-head__title">${greeting(date.getHours())}, ${D.esc(firstName)}.</h1>
    </div>
    <p class="live mono" title="Veriler 10 saniyede bir yenilenir"><span class="pulse" aria-hidden="true"></span>Canlı · ${D.formatDate(date, 'HH:mm:ss')}</p>
</header>

<section class="stat-grid" aria-label="Anlık durum">
    <article class="stat stat--accent">
        <p class="stat__label mono">Boş PC</p>
        <p class="stat__value">${free}<span>/${active.length}</span></p>
        <div class="stat__meter" aria-hidden="true"><span style="--fill: ${ratio(free, active.length)}"></span></div>
        <p class="stat__hint">${hint}</p>
    </article>
    <article class="stat">
        <p class="stat__label mono">Açık oturum</p>
        <p class="stat__value">${openSessions.length}</p>
        <p class="stat__hint">Şu an oynayan masa</p>
    </article>
    <article class="stat">
        <p class="stat__label mono">Kayıtlı müşteri</p>
        <p class="stat__value">${customerCount}</p>
        <p class="stat__hint">Aktif hesap</p>
    </article>
    <article class="stat">
        <p class="stat__label mono">Bekleyen rezervasyon</p>
        <p class="stat__value">${pending}</p>
        <p class="stat__hint"><a class="text-link" href="#/rezervasyonlar">Onay bekliyor →</a></p>
    </article>
</section>

<div class="panel-grid">
    <section class="card">
        <header class="card__head">
            <h2 class="card__title">Kurulum</h2>
            <p class="mono">${setup.filter((s) => s[1]).length}/${setup.length} tamam</p>
        </header>
        <ul class="checklist">
            ${setup
              .map(
                ([
                  title,
                  done,
                  detail,
                ]) => `<li class="checklist__item ${done ? 'is-done' : 'is-todo'}">
                <span class="checklist__mark">${icon(done ? 'check' : 'dot')}</span>
                <div>
                    <p class="checklist__title">${title}</p>
                    <p class="checklist__detail">${D.esc(detail)}</p>
                </div>
            </li>`,
              )
              .join('')}
        </ul>
    </section>

    <section class="card">
        <header class="card__head">
            <h2 class="card__title">Sistem sınıfları</h2>
            <p class="mono">${tierRows.length} sınıf</p>
        </header>
        <table class="table">
            <thead>
                <tr><th>Sınıf</th><th class="num">Boş / PC</th><th class="num">Saatlik</th></tr>
            </thead>
            <tbody>
                ${tierRows
                  .map(
                    (t) => `<tr>
                    <td>${D.esc(t.name)}</td>
                    <td class="num">${t.free} / ${t.stations}</td>
                    <td class="num">${t.rate > 0 ? D.money(Math.round(t.rate)) : '<span class="tag tag--warn">Girilmedi</span>'}</td>
                </tr>`,
                  )
                  .join('')}
            </tbody>
        </table>
    </section>
</div>`;
  },
};

function greeting(hour) {
  if (hour >= 5 && hour < 12) return 'Günaydın';
  if (hour >= 12 && hour < 18) return 'İyi günler';
  if (hour >= 18 && hour < 23) return 'İyi akşamlar';
  return 'İyi geceler';
}

// ===========================================================================
// Yönlendirme: #/pc, #/musteriler/3 ...

const ROUTES = [
  [/^\/$/, dashboard],
  [/^\/pc$/, pcMap],
  [/^\/oturumlar$/, sessions],
  [/^\/musteriler$/, customers],
  [/^\/musteriler\/(\d+)$/, customerProfile],
  [/^\/rezervasyonlar$/, reservations],
  [/^\/sistemler$/, tiers],
  [/^\/sistemler\/(\d+)$/, tierEdit],
  [/^\/oyunlar$/, games],
  [/^\/fiyatlar$/, prices],
  [/^\/site$/, siteTexts],
  [/^\/giris$/, login],
];

const MENU = [
  [
    'Operasyon',
    [
      ['PC haritası', 'monitor', '/pc'],
      ['Oturumlar', 'timer', '/oturumlar'],
      ['Müşteriler', 'users', '/musteriler'],
    ],
  ],
  ['Rezervasyon', [['Rezervasyonlar', 'calendar', '/rezervasyonlar']]],
  [
    'İçerik',
    [
      ['Sistemler', 'cpu', '/sistemler'],
      ['Oyunlar', 'gamepad', '/oyunlar'],
      ['Fiyatlar', 'tag', '/fiyatlar'],
      ['Site metinleri', 'type', '/site'],
    ],
  ],
  ['Yönetim', [['Personel', 'shield', null]]],
];

let current = null; // { page, ui, path, params, query }
let returnTo = null;
let shell = null; // { main, drawer }
let shellUi = {};

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(search) };
}

export function navigate(path) {
  if (location.hash === `#${path}`) route();
  else location.hash = path;
}

function route() {
  const { path, query } = parseHash();
  let match = null;
  let page = null;
  for (const [pattern, candidate] of ROUTES) {
    match = pattern.exec(path);
    if (match) {
      page = candidate;
      break;
    }
  }
  if (!page) return navigate('/');
  if (page !== login && !signedIn()) {
    returnTo = path === '/' ? null : `${path}${query.toString() ? `?${query}` : ''}`;
    return navigate('/giris');
  }
  if (page === login && signedIn()) return navigate('/');

  current = { page, path, params: match.slice(1), query, ui: {} };
  shellUi = {};
  current.ui = page.enter?.(context()) ?? {};
  render({ scrollTop: true });
}

// ===========================================================================
// Çizim

function context() {
  return {
    state: D.getState(),
    now: Date.now(),
    ui: current.ui,
    params: current.params,
    query: current.query,
    staff: STAFF,
    toast,
    navigate,
    /** Veriyi değiştirir; hata olursa bildirim gösterir. Başarılıysa true. */
    run(mutate, successMessage) {
      const result = D.commit(mutate);
      if (result.ok === false) {
        toast(result.error ?? 'İşlem tamamlanamadı.', true);
        return false;
      }
      if (successMessage)
        toast(typeof successMessage === 'function' ? successMessage(result.value) : successMessage);
      return result.value ?? true;
    },
  };
}

function render({ scrollTop = false } = {}) {
  if (!current) return;
  const ctx = context();
  const { page } = current;
  document.title = page.title(ctx);

  if (page === login) {
    shell = null;
    morph(app, page.view(ctx));
    app.appendChild(toaster);
    return;
  }

  if (!shell) {
    app.innerHTML = '<div class="admin"></div><div data-drawer-root></div>';
    app.appendChild(toaster);
    shell = { admin: app.querySelector('.admin'), drawer: app.querySelector('[data-drawer-root]') };
  }

  morph(shell.admin, `${nav()}<main class="admin-main">${page.view(ctx)}</main>`);

  const drawer = page.drawer?.(ctx);
  const wasOpen = shell.drawer.childElementCount > 0;
  morph(shell.drawer, drawer ? drawerHtml(drawer) : '');
  // Açılınca odağı panele taşı; Esc ve Tab hemen panel içinde çalışsın.
  if (drawer && !wasOpen) shell.drawer.querySelector('.drawer__panel')?.focus();
  if (scrollTop) window.scrollTo(0, 0);
}

function nav() {
  const { path } = current;
  const link = (label, iconName, href) => {
    const active = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
    return `<a href="#${href}" class="admin-nav__link${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></a>`;
  };
  const groups = MENU.map(
    ([title, items]) =>
      `<p class="admin-nav__group mono">${title}</p>${items
        .map(([label, iconName, href]) =>
          href
            ? link(label, iconName, href)
            : `<span class="admin-nav__link is-soon" aria-disabled="true" title="Sonraki fazlarda gelecek">${icon(iconName)}<span>${label}</span><em class="mono">Yakında</em></span>`,
        )
        .join('')}`,
  ).join('');

  const reset = shellUi.confirmReset
    ? `<span class="confirm" role="group" aria-label="Onay">
            <span class="confirm__question">Demo verisi baştan yüklensin mi?</span>
            <button type="button" class="btn btn--sm btn--danger" data-action="demo:reset">Evet</button>
            <button type="button" class="btn btn--sm btn--ghost" data-action="demo:keep">Vazgeç</button>
        </span>`
    : `<button type="button" class="admin-nav__link" data-action="demo:ask" title="Örnek verileri ilk hâline döndürür">${icon('reset')}<span>Demo verisini sıfırla</span></button>`;

  return `<aside class="admin-nav">
    <a class="brand admin-nav__brand" href="#/">
        <span class="brand__mark" aria-hidden="true"></span>
        <span>Nexus<span class="brand__slash">/</span>Arena</span>
    </a>

    <nav class="admin-nav__menu" aria-label="Panel menüsü">
        ${link('Panel', 'dashboard', '/')}
        ${groups}
    </nav>

    <div class="admin-nav__foot">
        ${reset}
        <a class="admin-nav__link" href="${SITE_URL}" target="_blank" rel="noopener">${icon('external')}<span>Siteyi aç</span></a>
        <div class="admin-user">
            <span class="admin-user__avatar" aria-hidden="true">${initials(STAFF.name)}</span>
            <div class="admin-user__text">
                <p>${D.esc(STAFF.name)}</p>
                <p class="mono">${STAFF.role}</p>
            </div>
            <button type="button" class="icon-button" title="Çıkış yap" aria-label="Çıkış yap" data-action="signOut">${icon('logout')}</button>
        </div>
    </div>
</aside>`;
}

function drawerHtml({ title, description = null, body }) {
  return `<div class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
    <div class="drawer__scrim" data-action="drawer:close"></div>
    <section class="drawer__panel" tabindex="-1">
        <header class="drawer__head">
            <div>
                <h2 class="drawer__title" id="drawer-title">${D.esc(title)}</h2>
                ${description != null ? `<p class="drawer__description">${D.esc(description)}</p>` : ''}
            </div>
            <button type="button" class="icon-button" data-action="drawer:close" aria-label="Kapat">${icon('close')}</button>
        </header>
        <div class="drawer__body">${body}</div>
    </section>
</div>`;
}

// ===========================================================================
// Olaylar: tıklama (data-action), alan bağlama (data-bind), form gönderme (data-submit)

const GLOBAL_ACTIONS = {
  'confirm:ask'({ ui }, el) {
    ui.confirm = el.dataset.confirm;
  },
  'confirm:no'({ ui }) {
    ui.confirm = null;
  },
  'drawer:close'(ctx) {
    if (current.page.closeDrawer) current.page.closeDrawer(ctx);
    else ctx.ui.drawer = null;
  },
  signOut() {
    setSignedIn(false);
    returnTo = null;
    navigate('/giris');
  },
  'demo:ask'() {
    shellUi.confirmReset = true;
  },
  'demo:keep'() {
    shellUi.confirmReset = false;
  },
  'demo:reset'() {
    shellUi.confirmReset = false;
    D.resetDemo();
    current.ui = current.page.enter?.(context()) ?? {};
    toast('Demo verisi baştan yüklendi.');
  },
};

function act(name, el, event) {
  const handler = current.page.actions?.[name] ?? GLOBAL_ACTIONS[name];
  if (!handler) return false;
  const ctx = context();
  // Bir işlem yapılınca açık silme sorusu kapanır (onay butonunun kendisi hariç).
  if (name !== 'confirm:ask' && !GLOBAL_ACTIONS[name]) ctx.ui.confirm = null;
  handler(ctx, el, event);
  render();
  return true;
}

document.addEventListener('click', (event) => {
  if (!current) return;
  const el = event.target.closest('[data-action]');
  if (el && !el.disabled && app.contains(el)) {
    event.preventDefault();
    act(el.dataset.action, el, event);
    return;
  }
  // Tablo satırının tamamı tıklanabilir (içindeki bağlantı ve butonlar kendi işini yapar).
  const row = event.target.closest('[data-href]');
  if (row && !event.target.closest('a, button')) navigate(row.dataset.href);
});

function readValue(el) {
  if (el.type === 'checkbox') return el.checked;
  const type = el.dataset.type;
  if (type === 'number') return el.value === '' ? null : Number(el.value.replace(',', '.'));
  if (type === 'int') return el.value === '' ? null : Number.parseInt(el.value, 10);
  return el.value;
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key];
  node[keys.at(-1)] = value;
}

document.addEventListener('input', (event) => {
  const el = event.target.closest('[data-bind]');
  if (!current || !el) return;
  setPath(current.ui, el.dataset.bind, readValue(el));
  if (el.dataset.after) current.page.actions?.[el.dataset.after]?.(context(), el, event);
  render();
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-submit]');
  if (!current || !form) return;
  event.preventDefault();
  act(form.dataset.submit, form, event);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !current) return;
  if (event.target.closest?.('.drawer')) {
    act('drawer:close', event.target, event);
  } else if (current.page.onEscape) {
    current.page.onEscape(context(), event);
    render();
  }
});

// ===========================================================================
// Başlangıç

const app = document.getElementById('app');
window.addEventListener('hashchange', route);

// Başka sekmede (site ya da başka panel) yapılan değişiklikler anında yansır.
D.subscribe((state, { local }) => {
  if (!current) return;
  if (!local) current.page.onExternalChange?.(context());
  render();
});

// Saatler, süreler ve ücretler saniyede bir güncellenir.
setInterval(() => {
  if (!current || document.hidden) return;
  const every = current.page.tick ?? 0;
  if (every && (every <= 1000 || Date.now() % every < 1000)) render();
}, 1000);

route();
