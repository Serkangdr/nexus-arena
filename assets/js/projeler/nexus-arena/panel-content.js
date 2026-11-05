// Nexus Arena paneli · içerik ekranları
// Sistemler, oyunlar, fiyatlar ve site metinleri. Burada yapılan değişiklikler demo sitesine
// (index.html) yansır; asıl uygulamada da site aynı tablolardan çizilir.

import * as D from './data.js';
import {
  icon,
  pageHeader,
  confirmButton,
  orderButtons,
  visibilityToggle,
  charCount,
  validation,
  invalid,
} from './panel-ui.js';

const { esc, money, duration } = D;
const SITE_URL = 'index.html';
const BLOCKS = [1, 5, 10, 15, 30, 60];
const EXAMPLE_MINUTES = [10, 47, 65, 130];

const siteLink = (hash = '') =>
  `<a class="btn btn--ghost" href="${SITE_URL}${hash}" target="_blank" rel="noopener">${icon('external')}Sitede gör</a>`;

/** Sıralı listede bir kaydı bir yukarı / aşağı taşır ve sıra numaralarını yeniden verir. */
function move(list, id, offset) {
  const sorted = [...list].sort(D.byOrder);
  const index = sorted.findIndex((item) => item.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= sorted.length) return;
  [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
  sorted.forEach((item, i) => (item.sortOrder = i + 1));
}

const nextOrder = (list) => Math.max(0, ...list.map((item) => item.sortOrder)) + 1;

/** Alan kuralları: [anahtar, zorunlu mesajı, en fazla]. */
function check(form, rules) {
  const errors = {};
  for (const [key, required, max] of rules) {
    const value = (form[key] ?? '').toString().trim();
    if (!value) errors[key] = required;
    else if (max && value.length > max) errors[key] = `En fazla ${max} karakter.`;
  }
  return errors;
}

const textField = ({
  id,
  label,
  bind,
  value,
  max,
  errors,
  key,
  placeholder = '',
  area = false,
  rows = 3,
  hint = '',
}) => `<div class="field">
    <div class="field__row"><label class="field__label" for="${id}">${label}</label>${max ? charCount(value, max) : ''}</div>
    ${
      area
        ? `<textarea id="${id}" class="field__input field__input--area${invalid(errors, key)}" rows="${rows}" data-bind="${bind}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''}>${esc(value ?? '')}</textarea>`
        : `<input id="${id}" class="field__input${invalid(errors, key)}" data-bind="${bind}" value="${esc(value ?? '')}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ''} />`
    }
    ${validation(errors, key)}
    ${hint ? `<p class="field__hint">${hint}</p>` : ''}
</div>`;

// ===========================================================================
// Sistemler

function validateTier(form) {
  const errors = check(form, [
    ['name', 'Ad gerekli.', 60],
    ['label', 'Etiket gerekli.', 60],
    ['slug', 'Kısa ad gerekli.', 40],
  ]);
  if (!errors.slug && !D.SLUG_PATTERN.test(form.slug.trim()))
    errors.slug = 'Yalnızca küçük harf, rakam ve tire; örn. standart-plus.';
  if (form.hourlyRate == null || form.hourlyRate < 0 || form.hourlyRate > 100000)
    errors.hourlyRate = '0 ile 100.000 arasında olmalı.';
  return errors;
}

export const tiers = {
  title: () => 'Sistemler · Panel',
  enter: () => ({ createForm: null, errors: {}, slugTouched: false }),
  view({ state }) {
    const list = [...state.tiers].sort(D.byOrder);
    const body =
      list.length === 0
        ? '<section class="card"><p class="empty">Henüz sistem sınıfı yok. "Yeni sınıf" ile ilkini oluştur.</p></section>'
        : `<ol class="tier-list">${list
            .map((tier, index) => {
              const specs = [...tier.specs].sort(D.byOrder);
              const stations = state.stations.filter((s) => s.tierId === tier.id).length;
              return `<li class="tier-card${tier.isVisible ? '' : ' is-muted'}" data-key="t-${tier.id}">
        ${orderButtons({ action: 'move', id: tier.id, itemName: tier.name, isFirst: index === 0, isLast: index === list.length - 1 })}
        <a class="tier-card__main" href="#/sistemler/${tier.id}">
            <span class="tier-card__figure" aria-hidden="true">${esc(specs[0]?.figure ?? '—')}</span>
            <span class="tier-card__text">
                <span class="mono tier-card__label">${esc(tier.label)}</span>
                <span class="tier-card__name">${esc(tier.name)}</span>
            </span>
        </a>
        <dl class="tier-card__facts">
            <div><dt class="mono">Donanım</dt><dd>${specs.length} kalem</dd></div>
            <div><dt class="mono">PC</dt><dd>${stations}</dd></div>
            <div>
                <dt class="mono">Saatlik</dt>
                <dd>${tier.hourlyRate > 0 ? money(tier.hourlyRate) : '<span class="tag tag--warn">Girilmedi</span>'}</dd>
            </div>
        </dl>
        <div class="tier-card__actions">
            ${tier.isVisible ? '' : '<span class="tag">Gizli</span>'}
            ${specs.length === 0 && tier.isVisible ? '<span class="tag tag--warn" title="Donanım kalemi olmayan sınıf sitede gösterilmez">Sitede görünmüyor</span>' : ''}
            <a class="btn btn--sm btn--ghost" href="#/sistemler/${tier.id}">${icon('pencil')}Düzenle</a>
        </div>
    </li>`;
            })
            .join('')}</ol>`;
    return `${pageHeader({
      eyebrow: 'İçerik',
      title: 'Sistemler',
      description:
        'Sistem sınıfları, donanımları ve saatlik tarifeleri. Oturum ücreti sınıfın saatlik tarifesiyle hesaplanır.',
      actions: `${siteLink('#sistemler')}<button type="button" class="btn btn--volt" data-action="openCreate">${icon('plus')}Yeni sınıf</button>`,
    })}${body}`;
  },
  drawer({ ui }) {
    const form = ui.createForm;
    if (!form) return null;
    const e = ui.errors;
    return {
      title: 'Yeni sistem sınıfı',
      description: 'Oluşturduktan sonra donanım kalemlerini ekleyebilirsin.',
      body: `<form class="form-grid" novalidate data-submit="create">
        ${textField({ id: 'tier-name', label: 'Ad', bind: 'createForm.name', value: form.name, max: 60, errors: e, key: 'name', placeholder: 'örn. Yayıncı Odası' }).replace('data-bind="createForm.name"', 'data-bind="createForm.name" data-after="suggestSlug"')}
        ${textField({ id: 'tier-label', label: 'Etiket', bind: 'createForm.label', value: form.label, max: 60, errors: e, key: 'label', placeholder: 'örn. Stüdyo', hint: 'Sitede adın üstünde küçük harflerle görünür.' })}
        <div class="field">
            <label class="field__label" for="tier-slug">Kısa ad</label>
            <input id="tier-slug" class="field__input field__input--mono${invalid(e, 'slug')}" data-bind="createForm.slug" data-after="slugTouched" value="${esc(form.slug)}" />
            ${validation(e, 'slug')}
            <p class="field__hint">Rezervasyon formunda ve adreslerde kullanılır. Addan otomatik üretilir.</p>
        </div>
        <div class="field">
            <label class="field__label" for="tier-rate">Saatlik tarife (₺)</label>
            <input id="tier-rate" type="number" class="field__input${invalid(e, 'hourlyRate')}" min="0" step="any" data-bind="createForm.hourlyRate" data-type="number" value="${form.hourlyRate ?? ''}" />
            ${validation(e, 'hourlyRate')}
        </div>
        <div class="form-actions">
            <button type="submit" class="btn btn--volt">Oluştur</button>
            <button type="button" class="btn btn--ghost" data-action="drawer:close">Vazgeç</button>
        </div>
    </form>`,
    };
  },
  closeDrawer({ ui }) {
    ui.createForm = null;
  },
  actions: {
    openCreate({ ui }) {
      ui.createForm = { name: '', label: '', slug: '', hourlyRate: 0, isVisible: true };
      ui.errors = {};
      ui.slugTouched = false;
    },
    suggestSlug({ ui }) {
      if (!ui.slugTouched) ui.createForm.slug = D.slugFrom(ui.createForm.name);
    },
    slugTouched({ ui }) {
      ui.slugTouched = true;
    },
    move(ctx, el) {
      ctx.run((s) => move(s.tiers, Number(el.dataset.id), Number(el.dataset.offset)));
    },
    create(ctx) {
      const { ui } = ctx;
      ui.errors = validateTier(ui.createForm);
      if (Object.keys(ui.errors).length) return;
      const form = ui.createForm;
      const id = ctx.run((s) => {
        const slug = form.slug.trim().toLowerCase();
        if (s.tiers.some((t) => t.slug === slug))
          return D.fail(`"${slug}" kısa adı başka bir sınıfta kullanılıyor.`);
        const tier = {
          id: D.nextId(s, 'tiers'),
          slug,
          name: form.name.trim(),
          label: form.label.trim(),
          sortOrder: nextOrder(s.tiers),
          hourlyRate: D.round2(form.hourlyRate ?? 0),
          isVisible: true,
          specs: [],
          plans: [],
        };
        s.tiers.push(tier);
        return D.ok(tier.id);
      });
      if (id) {
        ui.createForm = null;
        ctx.navigate(`/sistemler/${id}`);
      }
    },
  },
};

// ===========================================================================
// Sınıf düzenleme

const tierForm = (tier) => ({
  name: tier.name,
  label: tier.label,
  slug: tier.slug,
  hourlyRate: tier.hourlyRate,
  isVisible: tier.isVisible,
});

export const tierEdit = {
  title: ({ state, params }) => `${D.tierById(state, Number(params[0]))?.name ?? 'Sistem'} · Panel`,
  enter({ state, params }) {
    const tier = D.tierById(state, Number(params[0]));
    return {
      form: tier ? tierForm(tier) : null,
      errors: {},
      specForm: null,
      specErrors: {},
      editingSpecId: null,
    };
  },
  view({ state, ui, params }) {
    const tier = D.tierById(state, Number(params[0]));
    if (!tier || !ui.form) {
      return pageHeader({
        eyebrow: 'Sistemler',
        title: 'Sınıf bulunamadı',
        backHref: '#/sistemler',
        backLabel: 'Sistemler',
        description: 'Bu sınıf silinmiş olabilir.',
      });
    }
    const form = ui.form;
    const e = ui.errors;
    const saved = tierForm(tier);
    const dirty = Object.keys(saved).some((key) => saved[key] !== form[key]);
    const specs = [...tier.specs].sort(D.byOrder);
    const stations = state.stations.filter((s) => s.tierId === tier.id).length;

    return `${pageHeader({ eyebrow: tier.label, title: tier.name, backHref: '#/sistemler', backLabel: 'Sistemler', actions: siteLink('#sistemler') })}

<section class="card">
    <header class="card__head">
        <h2 class="card__title">Genel bilgiler</h2>
        ${dirty ? '<p class="mono unsaved"><span class="unsaved__dot"></span>Kaydedilmemiş değişiklik</p>' : ''}
    </header>
    <form class="form-grid" novalidate data-submit="save">
        <div class="field-pair">
            ${textField({ id: 'tier-name', label: 'Ad', bind: 'form.name', value: form.name, max: 60, errors: e, key: 'name' })}
            ${textField({ id: 'tier-label', label: 'Etiket', bind: 'form.label', value: form.label, max: 60, errors: e, key: 'label' })}
        </div>
        <div class="field-pair">
            <div class="field">
                <label class="field__label" for="tier-rate">Saatlik tarife (₺)</label>
                <input id="tier-rate" type="number" class="field__input${invalid(e, 'hourlyRate')}" min="0" step="any" data-bind="form.hourlyRate" data-type="number" value="${form.hourlyRate ?? ''}" />
                ${validation(e, 'hourlyRate')}
                <p class="field__hint">Oturum ücreti dakika bazında bu tarifeyle hesaplanır. Değişiklik yeni oturumlardan itibaren geçerli olur.</p>
            </div>
            <div class="field">
                <label class="field__label" for="tier-slug">Kısa ad</label>
                <input id="tier-slug" class="field__input field__input--mono${invalid(e, 'slug')}" data-bind="form.slug" value="${esc(form.slug)}" />
                ${validation(e, 'slug')}
            </div>
        </div>
        <label class="check">
            <input type="checkbox" data-bind="form.isVisible"${form.isVisible ? ' checked' : ''} />
            <span>Sitede göster</span>
        </label>
        <div class="form-actions">
            <button type="submit" class="btn btn--volt"${dirty ? '' : ' disabled'}>Kaydet</button>
            ${dirty ? '<button type="button" class="btn btn--ghost" data-action="reset">Değişiklikleri geri al</button>' : ''}
        </div>
    </form>
</section>

<section class="card">
    <header class="card__head">
        <div>
            <h2 class="card__title">Donanım kalemleri</h2>
            <p class="card__description">Sitede kaydırdıkça sırayla öne çıkar. İlk kalemin büyük değeri listede sınıfı temsil eder.</p>
        </div>
        <button type="button" class="btn btn--sm btn--ghost" data-action="newSpec">${icon('plus')}Kalem ekle</button>
    </header>
    ${specs.length === 0 ? '<p class="empty">Donanım kalemi yok. Kalemi olmayan sınıf sitede gösterilmez.</p>' : ''}
    <ol class="rows">${specs
      .map(
        (spec, index) => `<li class="row row--spec" data-key="s-${spec.id}">
        ${orderButtons({ action: 'moveSpec', id: spec.id, itemName: spec.title, isFirst: index === 0, isLast: index === specs.length - 1 })}
        <span class="spec-figure" aria-hidden="true">${esc(spec.figure)}</span>
        <div class="row__stack">
            <p class="mono row__eyebrow">${esc(spec.category)} · ${esc(spec.detail)}</p>
            <p class="row__title">${esc(spec.title)}</p>
            <p class="row__sub">${esc(spec.description)}</p>
        </div>
        <span class="row__spacer"></span>
        <button type="button" class="icon-button" aria-label="${esc(spec.title)} düzenle" data-action="editSpec" data-id="${spec.id}">${icon('pencil')}</button>
        ${confirmButton(ui, { id: `spec-${spec.id}`, action: 'deleteSpec', data: { id: spec.id }, ariaLabel: `${spec.title} sil`, content: icon('trash') })}
    </li>`,
      )
      .join('')}</ol>
</section>

<section class="card card--danger">
    <header class="card__head">
        <div>
            <h2 class="card__title">Sınıfı sil</h2>
            <p class="card__description">${
              stations > 0
                ? `Bu sınıfa bağlı ${stations} PC var; silinemez. Sitede görünmesini istemiyorsan yukarıdan gizle.`
                : 'Donanım kalemleri ve fiyat paketleri de silinir. Bu işlem geri alınamaz.'
            }</p>
        </div>
        ${confirmButton(ui, { id: 'delete-tier', action: 'deleteTier', buttonClass: 'btn btn--sm btn--danger-ghost', disabled: stations > 0, question: `${tier.name} silinsin mi?`, content: `${icon('trash')}Sınıfı sil` })}
    </header>
</section>`;
  },
  drawer({ ui }) {
    const form = ui.specForm;
    if (!form) return null;
    const e = ui.specErrors;
    return {
      title: ui.editingSpecId == null ? 'Yeni donanım kalemi' : 'Kalemi düzenle',
      body: `<div class="spec-preview" aria-label="Sitedeki görünüm önizlemesi">
        <p class="mono spec-preview__cat">${esc(form.category.trim() ? form.category : 'Tür')}</p>
        <p class="spec-preview__figure">${esc(form.figure.trim() ? form.figure : 'RTX 0000')}</p>
        <p class="mono spec-preview__detail">${esc(form.detail)}</p>
    </div>
    <form class="form-grid" novalidate data-submit="saveSpec">
        <div class="field-pair">
            ${textField({ id: 'spec-category', label: 'Tür', bind: 'specForm.category', value: form.category, max: 40, errors: e, key: 'category', placeholder: 'örn. Ekran kartı' })}
            ${textField({ id: 'spec-figure', label: 'Büyük değer', bind: 'specForm.figure', value: form.figure, max: 16, errors: e, key: 'figure', placeholder: 'örn. RTX 4090' })}
        </div>
        ${textField({ id: 'spec-detail', label: 'Teknik özet', bind: 'specForm.detail', value: form.detail, max: 60, errors: e, key: 'detail', placeholder: 'örn. 24 GB GDDR6X' })}
        ${textField({ id: 'spec-title', label: 'Başlık', bind: 'specForm.title', value: form.title, max: 80, errors: e, key: 'title', placeholder: 'örn. NVIDIA GeForce RTX 4090' })}
        ${textField({ id: 'spec-description', label: 'Açıklama', bind: 'specForm.description', value: form.description, max: 300, errors: e, key: 'description', area: true })}
        <div class="form-actions">
            <button type="submit" class="btn btn--volt">Kaydet</button>
            <button type="button" class="btn btn--ghost" data-action="drawer:close">Vazgeç</button>
        </div>
    </form>`,
    };
  },
  closeDrawer({ ui }) {
    ui.specForm = null;
  },
  actions: {
    reset({ ui, state, params }) {
      ui.form = tierForm(D.tierById(state, Number(params[0])));
      ui.errors = {};
    },
    save(ctx) {
      const { ui } = ctx;
      const id = Number(ctx.params[0]);
      ui.errors = validateTier(ui.form);
      if (Object.keys(ui.errors).length) return;
      const form = ui.form;
      ctx.run((s) => {
        const tier = D.tierById(s, id);
        if (!tier) return D.fail('Sınıf bulunamadı; başka biri silmiş olabilir.');
        const slug = form.slug.trim().toLowerCase();
        if (s.tiers.some((t) => t.id !== id && t.slug === slug))
          return D.fail(`"${slug}" kısa adı başka bir sınıfta kullanılıyor.`);
        Object.assign(tier, {
          name: form.name.trim(),
          label: form.label.trim(),
          slug,
          hourlyRate: D.round2(form.hourlyRate),
          isVisible: form.isVisible,
        });
        return D.ok();
      }, 'Sınıf kaydedildi.');
      const tier = D.tierById(D.getState(), id);
      if (tier) ui.form = tierForm(tier);
    },
    deleteTier(ctx) {
      const id = Number(ctx.params[0]);
      if (
        ctx.run((s) => {
          const stations = s.stations.filter((x) => x.tierId === id).length;
          if (stations > 0)
            return D.fail(
              `Bu sınıfa bağlı ${stations} PC var. Önce PC'leri başka bir sınıfa taşı ya da sınıfı gizle.`,
            );
          const reservations = s.reservations.filter((r) => r.tierId === id).length;
          if (reservations > 0)
            return D.fail(
              `Bu sınıf için ${reservations} rezervasyon kaydı var; geçmiş korunmalı. Sınıfı silmek yerine gizle.`,
            );
          s.tiers = s.tiers.filter((t) => t.id !== id);
          return D.ok();
        })
      ) {
        ctx.navigate('/sistemler');
      }
    },
    newSpec({ ui }) {
      ui.editingSpecId = null;
      ui.specForm = { category: '', figure: '', detail: '', title: '', description: '' };
      ui.specErrors = {};
    },
    editSpec({ ui, state, params }, el) {
      const spec = D.tierById(state, Number(params[0]))?.specs.find(
        (x) => x.id === Number(el.dataset.id),
      );
      if (!spec) return;
      ui.editingSpecId = spec.id;
      ui.specForm = {
        category: spec.category,
        figure: spec.figure,
        detail: spec.detail,
        title: spec.title,
        description: spec.description,
      };
      ui.specErrors = {};
    },
    saveSpec(ctx) {
      const { ui } = ctx;
      const tierId = Number(ctx.params[0]);
      const form = ui.specForm;
      ui.specErrors = check(form, [
        ['category', 'Tür gerekli.', 40],
        ['figure', 'Büyük değer gerekli.', 0],
        ['detail', 'Teknik özet gerekli.', 60],
        ['title', 'Başlık gerekli.', 80],
        ['description', 'Açıklama gerekli.', 300],
      ]);
      if (!ui.specErrors.figure && form.figure.trim().length > 16)
        ui.specErrors.figure = 'En fazla 16 karakter; büyük puntoda sığması için kısa tut.';
      if (Object.keys(ui.specErrors).length) return;
      const values = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
      if (
        ctx.run((s) => {
          const tier = D.tierById(s, tierId);
          if (!tier) return D.fail('Sınıf bulunamadı.');
          if (ui.editingSpecId != null) {
            const spec = tier.specs.find((x) => x.id === ui.editingSpecId);
            if (!spec) return D.fail('Kalem bulunamadı; başka biri silmiş olabilir.');
            Object.assign(spec, values);
          } else {
            tier.specs.push({
              id: D.nextId(s, 'specs'),
              sortOrder: nextOrder(tier.specs),
              ...values,
            });
          }
          return D.ok();
        }, 'Donanım kalemi kaydedildi.')
      ) {
        ui.specForm = null;
      }
    },
    moveSpec(ctx, el) {
      const tierId = Number(ctx.params[0]);
      ctx.run((s) =>
        move(D.tierById(s, tierId).specs, Number(el.dataset.id), Number(el.dataset.offset)),
      );
    },
    deleteSpec(ctx, el) {
      const tierId = Number(ctx.params[0]);
      const id = Number(el.dataset.id);
      const title = D.tierById(ctx.state, tierId)?.specs.find((x) => x.id === id)?.title;
      ctx.run((s) => {
        const tier = D.tierById(s, tierId);
        tier.specs = tier.specs.filter((x) => x.id !== id);
        return D.ok();
      }, `${title} silindi.`);
    },
  },
};

// ===========================================================================
// Oyunlar

const sameName = (a, b) => a.toLocaleLowerCase('tr') === b.toLocaleLowerCase('tr');

function validateGame(name) {
  if (name === '') return 'Oyun adı boş olamaz.';
  if (name.length > 60) return 'Oyun adı en fazla 60 karakter olabilir.';
  return null;
}

export const games = {
  title: () => 'Oyunlar · Panel',
  enter: () => ({ newName: '', editingId: null, editName: '' }),
  onEscape({ ui }) {
    ui.editingId = null;
  },
  view({ state, ui }) {
    const list = [...state.games].sort(D.byOrder);
    const rows = list
      .map(
        (
          game,
          index,
        ) => `<li class="row${game.isVisible ? '' : ' is-muted'}" data-key="g-${game.id}">
        ${orderButtons({ action: 'move', id: game.id, itemName: game.name, isFirst: index === 0, isLast: index === list.length - 1 })}
        <span class="row__index mono">${String(index + 1).padStart(2, '0')}</span>
        ${
          ui.editingId === game.id
            ? `<form class="row__edit" data-submit="rename">
            <input id="edit-game" class="field__input field__input--sm" aria-label="Oyun adı" maxlength="60" data-bind="editName" value="${esc(ui.editName)}" />
            <button type="submit" class="btn btn--sm btn--volt">Kaydet</button>
            <button type="button" class="btn btn--sm btn--ghost" data-action="cancelEdit">Vazgeç</button>
        </form>`
            : `<button type="button" class="row__title row__title--display" lang="en" title="Adını değiştirmek için tıkla" data-action="startEdit" data-id="${game.id}">${esc(game.name)}${icon('pencil')}</button>`
        }
        <span class="row__spacer"></span>
        ${game.isVisible ? '' : '<span class="tag">Gizli</span>'}
        ${visibilityToggle({ action: 'visibility', id: game.id, itemName: game.name, value: game.isVisible })}
        ${confirmButton(ui, { id: `game-${game.id}`, action: 'delete', data: { id: game.id }, ariaLabel: `${game.name} oyununu sil`, content: icon('trash') })}
    </li>`,
      )
      .join('');
    return `${pageHeader({
      eyebrow: 'İçerik',
      title: 'Oyunlar',
      description:
        'Makinelerde kurulu oyunlar. Sitedeki kayan şeritlerde bu sırayla görünür; gizlenen oyun listede kalır ama sitede çıkmaz.',
      actions: siteLink('#oyunlar'),
    })}
<section class="card">
    <form class="add-row" data-submit="add">
        <label class="sr-only" for="new-game">Yeni oyun adı</label>
        <input id="new-game" class="field__input" placeholder="Yeni oyun, örn. Fortnite" maxlength="60" autocomplete="off" data-bind="newName" value="${esc(ui.newName)}" />
        <button type="submit" class="btn btn--volt"${ui.newName.trim() ? '' : ' disabled'}>${icon('plus')}Ekle</button>
    </form>
    ${
      list.length === 0
        ? '<p class="empty">Henüz oyun yok. Yukarıdan ilk oyunu ekle.</p>'
        : `<p class="list-meta mono">${list.length} oyun · ${list.filter((g) => g.isVisible).length} tanesi sitede</p><ol class="rows">${rows}</ol>`
    }
</section>`;
  },
  actions: {
    add(ctx) {
      const { ui } = ctx;
      const name = ui.newName.trim();
      if (
        ctx.run((s) => {
          const error = validateGame(name);
          if (error) return D.fail(error);
          if (s.games.some((g) => sameName(g.name, name)))
            return D.fail(`"${name}" zaten listede.`);
          s.games.push({
            id: D.nextId(s, 'games'),
            sortOrder: nextOrder(s.games),
            name,
            isVisible: true,
          });
          return D.ok();
        }, `${name} eklendi.`)
      ) {
        ui.newName = '';
      }
    },
    startEdit({ ui, state }, el) {
      const game = state.games.find((g) => g.id === Number(el.dataset.id));
      ui.editingId = game.id;
      ui.editName = game.name;
      requestAnimationFrame(() => document.getElementById('edit-game')?.focus());
    },
    cancelEdit({ ui }) {
      ui.editingId = null;
    },
    rename(ctx) {
      const { ui } = ctx;
      const game = ctx.state.games.find((g) => g.id === ui.editingId);
      const name = ui.editName.trim();
      if (!game || name === game.name) {
        ui.editingId = null;
        return;
      }
      if (
        ctx.run((s) => {
          const error = validateGame(name);
          if (error) return D.fail(error);
          const target = s.games.find((g) => g.id === game.id);
          if (!target) return D.fail('Oyun bulunamadı; başka biri silmiş olabilir.');
          if (s.games.some((g) => g.id !== game.id && sameName(g.name, name)))
            return D.fail(`"${name}" zaten listede.`);
          target.name = name;
          return D.ok();
        }, 'Oyun adı güncellendi.')
      ) {
        ui.editingId = null;
      }
    },
    visibility(ctx, el) {
      const id = Number(el.dataset.id);
      const visible = el.dataset.value === 'true';
      const game = ctx.state.games.find((g) => g.id === id);
      ctx.run(
        (s) => {
          s.games.find((g) => g.id === id).isVisible = visible;
          return D.ok();
        },
        visible ? `${game.name} sitede gösteriliyor.` : `${game.name} sitede gizlendi.`,
      );
    },
    move(ctx, el) {
      ctx.run((s) => move(s.games, Number(el.dataset.id), Number(el.dataset.offset)));
    },
    delete(ctx, el) {
      const id = Number(el.dataset.id);
      const game = ctx.state.games.find((g) => g.id === id);
      ctx.run((s) => {
        s.games = s.games.filter((g) => g.id !== id);
        return D.ok();
      }, `${game.name} silindi.`);
    },
  },
};

// ===========================================================================
// Fiyatlar ve ücret kuralları

const blockLabel = (block) =>
  block === 1 ? 'Dakika bazında' : block === 60 ? 'Başlayan saat' : `${block} dakikalık dilim`;

export const prices = {
  title: () => 'Fiyatlar · Panel',
  enter: ({ state }) => ({
    billing: {
      block: state.operation.billingBlockMinutes,
      minimum: state.operation.minimumMinutes,
    },
    billingErrors: {},
    planForm: null,
    planErrors: {},
    editingPlanId: null,
  }),
  view({ state, ui }) {
    const groups = [...state.tiers].sort(D.byOrder);
    // Ücret kuralı örneklerindeki tutarlar için tarifesi girilmiş ilk sınıf.
    const exampleRate = groups.find((t) => t.hourlyRate > 0)?.hourlyRate ?? null;
    const saved = state.operation;
    const dirty =
      ui.billing.block !== saved.billingBlockMinutes || ui.billing.minimum !== saved.minimumMinutes;
    const policy = {
      block: ui.billing.block,
      minimum: Math.min(240, Math.max(0, ui.billing.minimum ?? 0)),
    };

    const billing = `<section class="card">
    <header class="card__head">
        <div>
            <h2 class="card__title">Ücret kuralları</h2>
            <p class="card__description">Paketsiz oturumlarda süre dilime yukarı yuvarlanır ve en az süre uygulanır. Paket aşımında yalnızca dilim uygulanır.</p>
        </div>
        ${dirty ? '<p class="mono unsaved"><span class="unsaved__dot"></span>Kaydedilmemiş değişiklik</p>' : ''}
    </header>
    <div class="split">
        <form class="form-grid" novalidate data-submit="saveBilling">
            <div class="field-pair">
                <div class="field">
                    <label class="field__label" for="billing-block">Süre dilimi</label>
                    <select id="billing-block" class="field__input" data-bind="billing.block" data-type="int">
                        ${BLOCKS.map((b) => `<option value="${b}"${b === ui.billing.block ? ' selected' : ''}>${blockLabel(b)}</option>`).join('')}
                    </select>
                </div>
                <div class="field">
                    <label class="field__label" for="billing-minimum">En az süre (dakika)</label>
                    <input id="billing-minimum" type="number" class="field__input${invalid(ui.billingErrors, 'minimum')}" min="0" max="240" data-bind="billing.minimum" data-type="int" value="${ui.billing.minimum ?? ''}" />
                    ${validation(ui.billingErrors, 'minimum')}
                </div>
            </div>
            <p class="field__hint">Değişiklik, kaydettikten sonra kapanan tüm oturumlara uygulanır.</p>
            <div class="form-actions">
                <button type="submit" class="btn btn--volt"${dirty ? '' : ' disabled'}>Kaydet</button>
            </div>
        </form>

        <dl class="rule-examples" aria-label="Örnekler">
            ${EXAMPLE_MINUTES.map((minutes) => {
              const billed = Math.max(policy.minimum, D.roundUp(policy, minutes));
              return `<div>
                <dt>${duration(minutes)} oynayan</dt>
                <dd>
                    ${duration(billed)} ücreti
                    ${exampleRate != null ? `<span class="mono">${money(D.round2((exampleRate * billed) / 60))}</span>` : ''}
                </dd>
            </div>`;
            }).join('')}
            ${exampleRate != null ? `<p class="field__hint">Tutarlar ${money(exampleRate)} / saat tarifesiyle hesaplandı.</p>` : ''}
        </dl>
    </div>
</section>`;

    const cards =
      groups.length === 0
        ? '<section class="card"><p class="empty">Önce bir sistem sınıfı oluştur; paketler sınıflara bağlıdır.</p></section>'
        : groups
            .map((tier) => {
              const plans = [...tier.plans].sort(D.byOrder);
              return `<section class="card" data-key="p-${tier.id}">
    <header class="card__head">
        <div>
            <h2 class="card__title">${esc(tier.name)}</h2>
            <p class="card__description">
                Saatlik tarife:
                ${tier.hourlyRate > 0 ? `<strong>${money(tier.hourlyRate)}</strong>` : '<span class="tag tag--warn">Girilmedi</span>'}
                · <a class="text-link" href="#/sistemler/${tier.id}">değiştir</a>
            </p>
        </div>
        <button type="button" class="btn btn--sm btn--ghost" data-action="newPlan" data-id="${tier.id}">${icon('plus')}Paket ekle</button>
    </header>
    ${plans.length === 0 ? '<p class="empty">Bu sınıf için paket yok.</p>' : ''}
    <ol class="rows">${plans
      .map((plan, index) => {
        // Süreli paketlerde saat başına düşen fiyatı göster; saatlik tarifeyle karşılaştırmayı kolaylaştırır.
        const perHour =
          plan.durationMinutes > 0 && plan.price > 0
            ? ` · saati ${money(D.round2((plan.price * 60) / plan.durationMinutes))}`
            : '';
        return `<li class="row row--price${plan.isVisible ? '' : ' is-muted'}" data-key="pl-${plan.id}">
        ${orderButtons({ action: 'movePlan', id: plan.id, itemName: plan.name, isFirst: index === 0, isLast: index === plans.length - 1 })}
        <div class="row__stack">
            <p class="row__title">${esc(plan.name)}</p>
            <p class="row__sub">${duration(plan.durationMinutes)}${perHour}</p>
        </div>
        <span class="row__spacer"></span>
        <span class="price">${money(plan.price)}</span>
        ${visibilityToggle({ action: 'planVisibility', id: plan.id, itemName: plan.name, value: plan.isVisible })}
        <button type="button" class="icon-button" aria-label="${esc(plan.name)} düzenle" data-action="editPlan" data-id="${plan.id}">${icon('pencil')}</button>
        ${confirmButton(ui, { id: `plan-${plan.id}`, action: 'deletePlan', data: { id: plan.id }, ariaLabel: `${plan.name} sil`, content: icon('trash') })}
    </li>`;
      })
      .join('')}</ol>
</section>`;
            })
            .join('');

    return `${pageHeader({
      eyebrow: 'İçerik',
      title: 'Fiyatlar',
      description:
        'Saatlik tarife oturum ücretinin temelidir ve sistem sınıfında ayarlanır. Paketler sitede fiyat listesi olarak gösterilir.',
    })}${billing}${cards}`;
  },
  drawer({ state, ui }) {
    const form = ui.planForm;
    if (!form) return null;
    const e = ui.planErrors;
    return {
      title: ui.editingPlanId == null ? 'Yeni paket' : 'Paketi düzenle',
      description: 'Sitede fiyat listesinde görünür.',
      body: `<form class="form-grid" novalidate data-submit="savePlan">
        <div class="field">
            <label class="field__label" for="plan-tier">Sistem sınıfı</label>
            <select id="plan-tier" class="field__input" data-bind="planForm.tierId" data-type="int">
                ${[...state.tiers]
                  .sort(D.byOrder)
                  .map(
                    (t) =>
                      `<option value="${t.id}"${t.id === form.tierId ? ' selected' : ''}>${esc(t.name)}</option>`,
                  )
                  .join('')}
            </select>
        </div>
        ${textField({ id: 'plan-name', label: 'Paket adı', bind: 'planForm.name', value: form.name, max: 60, errors: e, key: 'name', placeholder: 'örn. 3 saat paketi' })}
        <div class="field-pair">
            <div class="field">
                <label class="field__label" for="plan-duration">Süre (dakika)</label>
                <input id="plan-duration" type="number" class="field__input${invalid(e, 'durationMinutes')}" min="1" max="1440" placeholder="örn. 180" data-bind="planForm.durationMinutes" data-type="int" value="${form.durationMinutes ?? ''}" />
                ${validation(e, 'durationMinutes')}
                <p class="field__hint">${form.durationMinutes > 0 ? `= ${duration(form.durationMinutes)}` : 'Süreye bağlı değilse boş bırak.'}</p>
            </div>
            <div class="field">
                <label class="field__label" for="plan-price">Fiyat (₺)</label>
                <input id="plan-price" type="number" class="field__input${invalid(e, 'price')}" min="0" step="any" data-bind="planForm.price" data-type="number" value="${form.price ?? ''}" />
                ${validation(e, 'price')}
            </div>
        </div>
        <label class="check">
            <input type="checkbox" data-bind="planForm.isVisible"${form.isVisible ? ' checked' : ''} />
            <span>Sitede göster</span>
        </label>
        <div class="form-actions">
            <button type="submit" class="btn btn--volt">Kaydet</button>
            <button type="button" class="btn btn--ghost" data-action="drawer:close">Vazgeç</button>
        </div>
    </form>`,
    };
  },
  closeDrawer({ ui }) {
    ui.planForm = null;
  },
  actions: {
    saveBilling(ctx) {
      const { ui } = ctx;
      const minimum = ui.billing.minimum;
      ui.billingErrors =
        minimum == null || minimum < 0 || minimum > 240
          ? { minimum: '0 ile 240 dakika arasında olmalı.' }
          : {};
      if (ui.billingErrors.minimum) return;
      ctx.run((s) => {
        if (!BLOCKS.includes(ui.billing.block)) return D.fail('Geçersiz dilim süresi.');
        s.operation.billingBlockMinutes = ui.billing.block;
        s.operation.minimumMinutes = minimum;
        return D.ok();
      }, 'Ücret kuralları kaydedildi.');
    },
    newPlan({ ui }, el) {
      ui.editingPlanId = null;
      ui.planForm = {
        tierId: Number(el.dataset.id),
        name: '',
        durationMinutes: null,
        price: 0,
        isVisible: true,
      };
      ui.planErrors = {};
    },
    editPlan({ ui, state }, el) {
      const id = Number(el.dataset.id);
      const tier = state.tiers.find((t) => t.plans.some((p) => p.id === id));
      const plan = tier?.plans.find((p) => p.id === id);
      if (!plan) return;
      ui.editingPlanId = id;
      ui.planForm = {
        tierId: tier.id,
        name: plan.name,
        durationMinutes: plan.durationMinutes,
        price: plan.price,
        isVisible: plan.isVisible,
      };
      ui.planErrors = {};
    },
    savePlan(ctx) {
      const { ui } = ctx;
      const form = ui.planForm;
      ui.planErrors = check(form, [['name', 'Paket adı gerekli.', 60]]);
      if (
        form.durationMinutes != null &&
        (form.durationMinutes < 1 || form.durationMinutes > 1440)
      ) {
        ui.planErrors.durationMinutes = '1 ile 1440 dakika (24 saat) arasında olmalı.';
      }
      if (form.price == null || form.price < 0 || form.price > 100000)
        ui.planErrors.price = '0 ile 100.000 arasında olmalı.';
      if (Object.keys(ui.planErrors).length) return;
      if (
        ctx.run((s) => {
          const tier = D.tierById(s, form.tierId);
          if (!tier) return D.fail('Sistem sınıfı bulunamadı.');
          const values = {
            name: form.name.trim(),
            durationMinutes: form.durationMinutes,
            price: D.round2(form.price),
            isVisible: form.isVisible,
          };
          if (ui.editingPlanId != null) {
            const owner = s.tiers.find((t) => t.plans.some((p) => p.id === ui.editingPlanId));
            const plan = owner?.plans.find((p) => p.id === ui.editingPlanId);
            if (!plan) return D.fail('Paket bulunamadı; başka biri silmiş olabilir.');
            Object.assign(plan, values);
            if (owner !== tier) {
              owner.plans = owner.plans.filter((p) => p !== plan);
              plan.sortOrder = nextOrder(tier.plans);
              tier.plans.push(plan);
            }
          } else {
            tier.plans.push({
              id: D.nextId(s, 'plans'),
              sortOrder: nextOrder(tier.plans),
              ...values,
            });
          }
          return D.ok();
        }, 'Paket kaydedildi.')
      ) {
        ui.planForm = null;
      }
    },
    planVisibility(ctx, el) {
      const id = Number(el.dataset.id);
      ctx.run((s) => {
        const plan = s.tiers.flatMap((t) => t.plans).find((p) => p.id === id);
        plan.isVisible = el.dataset.value === 'true';
        return D.ok();
      });
    },
    movePlan(ctx, el) {
      const id = Number(el.dataset.id);
      ctx.run((s) =>
        move(
          s.tiers.find((t) => t.plans.some((p) => p.id === id)).plans,
          id,
          Number(el.dataset.offset),
        ),
      );
    },
    deletePlan(ctx, el) {
      const id = Number(el.dataset.id);
      const name = ctx.state.tiers.flatMap((t) => t.plans).find((p) => p.id === id)?.name;
      ctx.run((s) => {
        const tier = s.tiers.find((t) => t.plans.some((p) => p.id === id));
        if (!tier) return D.fail('Paket bulunamadı.');
        tier.plans = tier.plans.filter((p) => p.id !== id);
        return D.ok();
      }, `${name} silindi.`);
    },
  },
};

// ===========================================================================
// Site metinleri

const SETTINGS_RULES = [
  ['heroEyebrow', 'Üst satır gerekli.', 120],
  ['heroLineOne', 'Birinci satır gerekli.', 40],
  ['heroLineTwo', 'İkinci satır gerekli.', 40],
  ['heroLead', 'Tanıtım metni gerekli.', 400],
  ['name', 'Kafe adı gerekli.', 80],
  ['tagline', 'Slogan gerekli.', 160],
];

const isAllowedUrl = (url) => {
  try {
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(new URL(url.trim()).protocol);
  } catch {
    return false;
  }
};

export const siteTexts = {
  title: () => 'Site metinleri · Panel',
  enter: ({ state }) => ({
    settings: { ...state.settings },
    errors: {},
    gearForm: null,
    gearErrors: {},
    editingGearId: null,
    linkForm: null,
    linkErrors: {},
    editingLinkId: null,
  }),
  view({ state, ui }) {
    const s = ui.settings;
    const e = ui.errors;
    const dirty = Object.keys(state.settings).some((key) => state.settings[key] !== s[key]);
    const gear = [...state.gear].sort(D.byOrder);
    const links = [...state.links].sort(D.byOrder);

    return `${pageHeader({
      eyebrow: 'İçerik',
      title: 'Site metinleri',
      description:
        'Ana sayfanın giriş bölümü, kafe adı ve slogan, ekipman listesi ve sosyal medya bağlantıları.',
      actions: siteLink(),
    })}

<section class="card">
    <header class="card__head">
        <h2 class="card__title">Giriş bölümü ve genel bilgiler</h2>
        ${dirty ? '<p class="mono unsaved"><span class="unsaved__dot"></span>Kaydedilmemiş değişiklik</p>' : ''}
    </header>
    <div class="split">
        <form class="form-grid" novalidate data-submit="saveSettings">
            ${textField({ id: 'hero-eyebrow', label: 'Üst satır', bind: 'settings.heroEyebrow', value: s.heroEyebrow, max: 120, errors: e, key: 'heroEyebrow' })}
            <div class="field-pair">
                ${textField({ id: 'hero-one', label: 'Büyük başlık · 1. satır', bind: 'settings.heroLineOne', value: s.heroLineOne, max: 40, errors: e, key: 'heroLineOne' })}
                ${textField({ id: 'hero-two', label: 'Büyük başlık · 2. satır', bind: 'settings.heroLineTwo', value: s.heroLineTwo, max: 40, errors: e, key: 'heroLineTwo' })}
            </div>
            <p class="field__hint">Başlık çok büyük puntoda görünür; her satırı 12–14 karakter civarında tutmak en iyi sonucu verir.</p>
            ${textField({ id: 'hero-lead', label: 'Tanıtım metni', bind: 'settings.heroLead', value: s.heroLead, max: 400, errors: e, key: 'heroLead', area: true })}
            <div class="field-pair">
                ${textField({ id: 'site-name', label: 'Kafe adı', bind: 'settings.name', value: s.name, max: 80, errors: e, key: 'name' })}
                ${textField({ id: 'site-tagline', label: 'Slogan (alt bilgi)', bind: 'settings.tagline', value: s.tagline, max: 160, errors: e, key: 'tagline' })}
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn--volt"${dirty ? '' : ' disabled'}>Kaydet</button>
                ${dirty ? '<button type="button" class="btn btn--ghost" data-action="resetSettings">Değişiklikleri geri al</button>' : ''}
            </div>
        </form>

        <figure class="hero-preview" aria-label="Sitedeki görünüm önizlemesi">
            <figcaption class="mono">Önizleme</figcaption>
            <div class="hero-preview__stage">
                <p class="hero-preview__eyebrow mono">${esc(s.heroEyebrow)}</p>
                <p class="hero-preview__title">
                    <span>${esc(s.heroLineOne)}</span>
                    <span class="hero-preview__line-two">${esc(s.heroLineTwo)}</span>
                </p>
                <p class="hero-preview__lead">${esc(s.heroLead)}</p>
            </div>
            <div class="hero-preview__footer">
                <span class="mono">${esc(s.name)}</span>
                <span>${esc(s.tagline)}</span>
            </div>
        </figure>
    </div>
</section>

<div class="panel-grid panel-grid--even">
    <section class="card">
        <header class="card__head">
            <h2 class="card__title">Ekipman</h2>
            <button type="button" class="btn btn--sm btn--ghost" data-action="newGear">${icon('plus')}Ekle</button>
        </header>
        ${gear.length === 0 ? '<p class="empty">Ekipman yok; sitedeki ekipman şeridi gizlenir.</p>' : ''}
        <ol class="rows">${gear
          .map(
            (item, index) => `<li class="row" data-key="ge-${item.id}">
            ${orderButtons({ action: 'moveGear', id: item.id, itemName: item.name, isFirst: index === 0, isLast: index === gear.length - 1 })}
            <div class="row__stack">
                <p class="mono row__eyebrow">${esc(item.category)}</p>
                <p class="row__title">${esc(item.name)}</p>
                <p class="row__sub">${esc(item.detail)}</p>
            </div>
            <span class="row__spacer"></span>
            <button type="button" class="icon-button" aria-label="${esc(item.name)} düzenle" data-action="editGear" data-id="${item.id}">${icon('pencil')}</button>
            ${confirmButton(ui, { id: `gear-${item.id}`, action: 'deleteGear', data: { id: item.id }, ariaLabel: `${item.name} sil`, content: icon('trash') })}
        </li>`,
          )
          .join('')}</ol>
    </section>

    <section class="card">
        <header class="card__head">
            <h2 class="card__title">Sosyal bağlantılar</h2>
            <button type="button" class="btn btn--sm btn--ghost" data-action="newLink">${icon('plus')}Ekle</button>
        </header>
        ${links.length === 0 ? '<p class="empty">Bağlantı yok; sitenin alt bilgisinde bağlantı listesi boş görünür.</p>' : ''}
        <ol class="rows">${links
          .map(
            (link, index) => `<li class="row" data-key="li-${link.id}">
            ${orderButtons({ action: 'moveLink', id: link.id, itemName: link.label, isFirst: index === 0, isLast: index === links.length - 1 })}
            <div class="row__stack">
                <p class="row__title">${esc(link.label)}</p>
                ${
                  link.url === '#' || link.url === ''
                    ? '<p class="row__sub"><span class="tag tag--warn">Adres girilmedi</span></p>'
                    : `<p class="row__sub row__sub--url">${esc(link.url)}</p>`
                }
            </div>
            <span class="row__spacer"></span>
            <button type="button" class="icon-button" aria-label="${esc(link.label)} düzenle" data-action="editLink" data-id="${link.id}">${icon('pencil')}</button>
            ${confirmButton(ui, { id: `link-${link.id}`, action: 'deleteLink', data: { id: link.id }, ariaLabel: `${link.label} sil`, content: icon('trash') })}
        </li>`,
          )
          .join('')}</ol>
    </section>
</div>`;
  },
  drawer({ ui }) {
    if (ui.gearForm) {
      const f = ui.gearForm;
      const e = ui.gearErrors;
      return {
        title: ui.editingGearId == null ? 'Yeni ekipman' : 'Ekipmanı düzenle',
        description: 'Sitede donanım bölümünün altında listelenir.',
        body: `<form class="form-grid" novalidate data-submit="saveGear">
            ${textField({ id: 'gear-category', label: 'Tür', bind: 'gearForm.category', value: f.category, max: 40, errors: e, key: 'category', placeholder: 'örn. Klavye' })}
            ${textField({ id: 'gear-name', label: 'Ürün', bind: 'gearForm.name', value: f.name, max: 80, errors: e, key: 'name', placeholder: 'örn. Wooting 60HE' })}
            ${textField({ id: 'gear-detail', label: 'Kısa açıklama', bind: 'gearForm.detail', value: f.detail, max: 120, errors: e, key: 'detail', placeholder: 'örn. Analog tuşlar' })}
            <div class="form-actions">
                <button type="submit" class="btn btn--volt">Kaydet</button>
                <button type="button" class="btn btn--ghost" data-action="drawer:close">Vazgeç</button>
            </div>
        </form>`,
      };
    }
    if (ui.linkForm) {
      const f = ui.linkForm;
      const e = ui.linkErrors;
      return {
        title: ui.editingLinkId == null ? 'Yeni bağlantı' : 'Bağlantıyı düzenle',
        description:
          'Sitenin alt bilgisinde görünür. Web adresi, e-posta (mailto:) ya da telefon (tel:) olabilir.',
        body: `<form class="form-grid" novalidate data-submit="saveLink">
            ${textField({ id: 'link-label', label: 'Görünen ad', bind: 'linkForm.label', value: f.label, max: 40, errors: e, key: 'label', placeholder: 'örn. Instagram' })}
            <div class="field">
                <label class="field__label" for="link-url">Adres</label>
                <input id="link-url" class="field__input${invalid(e, 'url')}" placeholder="https://instagram.com/nexusarena" inputmode="url" data-bind="linkForm.url" value="${esc(f.url)}" />
                ${validation(e, 'url')}
                <p class="field__hint">Telefon için <code>tel:+905321234567</code>, e-posta için <code>mailto:info@ornek.com</code> yaz.</p>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn--volt">Kaydet</button>
                <button type="button" class="btn btn--ghost" data-action="drawer:close">Vazgeç</button>
            </div>
        </form>`,
      };
    }
    return null;
  },
  closeDrawer({ ui }) {
    ui.gearForm = null;
    ui.linkForm = null;
  },
  actions: {
    resetSettings({ ui, state }) {
      ui.settings = { ...state.settings };
      ui.errors = {};
    },
    saveSettings(ctx) {
      const { ui } = ctx;
      ui.errors = check(ui.settings, SETTINGS_RULES);
      if (Object.keys(ui.errors).length) return;
      const values = Object.fromEntries(Object.entries(ui.settings).map(([k, v]) => [k, v.trim()]));
      ctx.run((s) => {
        Object.assign(s.settings, values);
        return D.ok();
      }, 'Site metinleri kaydedildi.');
      ui.settings = { ...D.getState().settings };
    },
    newGear({ ui }) {
      ui.editingGearId = null;
      ui.gearForm = { category: '', name: '', detail: '' };
      ui.gearErrors = {};
    },
    editGear({ ui, state }, el) {
      const item = state.gear.find((g) => g.id === Number(el.dataset.id));
      ui.editingGearId = item.id;
      ui.gearForm = { category: item.category, name: item.name, detail: item.detail };
      ui.gearErrors = {};
    },
    saveGear(ctx) {
      const { ui } = ctx;
      ui.gearErrors = check(ui.gearForm, [
        ['category', 'Tür gerekli.', 40],
        ['name', 'Ürün adı gerekli.', 80],
        ['detail', 'Kısa açıklama gerekli.', 120],
      ]);
      if (Object.keys(ui.gearErrors).length) return;
      const values = Object.fromEntries(Object.entries(ui.gearForm).map(([k, v]) => [k, v.trim()]));
      if (
        ctx.run((s) => {
          if (ui.editingGearId != null) {
            const item = s.gear.find((g) => g.id === ui.editingGearId);
            if (!item) return D.fail('Ekipman bulunamadı; başka biri silmiş olabilir.');
            Object.assign(item, values);
          } else {
            s.gear.push({ id: D.nextId(s, 'gear'), sortOrder: nextOrder(s.gear), ...values });
          }
          return D.ok();
        }, 'Ekipman kaydedildi.')
      ) {
        ui.gearForm = null;
      }
    },
    moveGear(ctx, el) {
      ctx.run((s) => move(s.gear, Number(el.dataset.id), Number(el.dataset.offset)));
    },
    deleteGear(ctx, el) {
      const id = Number(el.dataset.id);
      const name = ctx.state.gear.find((g) => g.id === id)?.name;
      ctx.run((s) => {
        s.gear = s.gear.filter((g) => g.id !== id);
        return D.ok();
      }, `${name} silindi.`);
    },
    newLink({ ui }) {
      ui.editingLinkId = null;
      ui.linkForm = { label: '', url: '' };
      ui.linkErrors = {};
    },
    editLink({ ui, state }, el) {
      const link = state.links.find((l) => l.id === Number(el.dataset.id));
      ui.editingLinkId = link.id;
      ui.linkForm = { label: link.label, url: link.url === '#' ? '' : link.url };
      ui.linkErrors = {};
    },
    saveLink(ctx) {
      const { ui } = ctx;
      ui.linkErrors = check(ui.linkForm, [
        ['label', 'Görünen ad gerekli.', 40],
        ['url', 'Adres gerekli.', 300],
      ]);
      if (!ui.linkErrors.url && !isAllowedUrl(ui.linkForm.url))
        ui.linkErrors.url = 'https:// ile başlayan bir adres, mailto: ya da tel: bağlantısı gir.';
      if (Object.keys(ui.linkErrors).length) return;
      const values = { label: ui.linkForm.label.trim(), url: ui.linkForm.url.trim() };
      if (
        ctx.run((s) => {
          if (ui.editingLinkId != null) {
            const link = s.links.find((l) => l.id === ui.editingLinkId);
            if (!link) return D.fail('Bağlantı bulunamadı; başka biri silmiş olabilir.');
            Object.assign(link, values);
          } else {
            s.links.push({ id: D.nextId(s, 'links'), sortOrder: nextOrder(s.links), ...values });
          }
          return D.ok();
        }, 'Bağlantı kaydedildi.')
      ) {
        ui.linkForm = null;
      }
    },
    moveLink(ctx, el) {
      ctx.run((s) => move(s.links, Number(el.dataset.id), Number(el.dataset.offset)));
    },
    deleteLink(ctx, el) {
      const id = Number(el.dataset.id);
      const label = ctx.state.links.find((l) => l.id === id)?.label;
      ctx.run((s) => {
        s.links = s.links.filter((l) => l.id !== id);
        return D.ok();
      }, `${label} silindi.`);
    },
  },
};
