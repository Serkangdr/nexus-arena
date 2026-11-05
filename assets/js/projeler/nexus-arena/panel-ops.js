// Nexus Arena paneli · operasyon ekranları
// PC haritası, oturumlar ve gün sonu, müşteriler ve rezervasyonlar. İşaretleme ve kurallar
// asıl uygulamadaki Blazor sayfalarıyla (Components/Admin/Operations) ve servislerle aynıdır.

import * as D from './data.js';
import {
  icon,
  pageHeader,
  confirmButton,
  chargeDetails,
  charCount,
  validation,
  invalid,
  initials,
} from './panel-ui.js';

const { esc, money, duration, MINUTE } = D;
const QUICK_AMOUNTS = [100, 250, 500, 1000];
const MAX_PREVIEW_AGE = 30 * MINUTE;

// ===========================================================================
// Ortak: müşteri arama ve kayıt

/** Ad ya da telefonun herhangi bir parçasıyla arar (asıl uygulamadaki SearchKey mantığı). */
function searchCustomers(state, query, { take = 50, includeInactive = false } = {}) {
  let list = state.customers.filter((c) => includeInactive || c.isActive);
  const q = (query ?? '').trim();
  if (q) {
    const digits = !/\p{L}/u.test(q) ? D.searchDigits(q) : null;
    if (digits) {
      list = list.filter((c) => D.customerSearchKey(c).includes(digits));
    } else {
      for (const term of D.fold(q).split(' ').filter(Boolean)) {
        list = list.filter((c) => D.customerSearchKey(c).includes(term));
      }
    }
  }
  list.sort((a, b) => D.customerSearchKey(a).localeCompare(D.customerSearchKey(b)));
  return {
    total: list.length,
    items: list.slice(0, take).map((c) => ({ ...c, lastVisit: lastVisit(state, c.id) })),
  };
}

function lastVisit(state, customerId) {
  let latest = null;
  for (const g of state.sessions)
    if (g.customerId === customerId && (latest == null || g.startedAt > latest))
      latest = g.startedAt;
  return latest;
}

function validateCustomer(input) {
  const errors = {};
  if (!input.fullName?.trim()) errors.fullName = 'Ad soyad gerekli.';
  else if (input.fullName.length > 100) errors.fullName = 'En fazla 100 karakter.';
  if (!input.phone?.trim()) errors.phone = 'Telefon gerekli.';
  else if (!D.normalizePhone(input.phone))
    errors.phone = 'Geçerli bir numara gir, örn. 0532 123 45 67.';
  if ((input.note ?? '').length > 500) errors.note = 'En fazla 500 karakter.';
  return errors;
}

function createCustomer(state, input, now) {
  const phone = D.normalizePhone(input.phone);
  if (!phone) return D.fail('Geçerli bir telefon numarası gir.');
  const owner = state.customers.find((c) => c.phone === phone);
  if (owner) return D.fail(`Bu numara zaten ${owner.fullName} adına kayıtlı.`);
  const customer = {
    id: D.nextId(state, 'customers'),
    fullName: input.fullName.trim(),
    phone,
    note: input.note?.trim() ? input.note.trim() : null,
    balance: 0,
    isActive: true,
    createdAt: now,
  };
  state.customers.push(customer);
  return D.ok(customer.id);
}

function customerFields(form, errors, prefix) {
  return `<div class="field-pair">
    <div class="field">
        <div class="field__row"><label class="field__label" for="customer-name">Ad soyad</label>${charCount(form.fullName, 100)}</div>
        <input id="customer-name" class="field__input${invalid(errors, 'fullName')}" autocomplete="off" data-bind="${prefix}.fullName" value="${esc(form.fullName)}" />
        ${validation(errors, 'fullName')}
    </div>
    <div class="field">
        <label class="field__label" for="customer-phone">Telefon</label>
        <input id="customer-phone" class="field__input${invalid(errors, 'phone')}" inputmode="tel" placeholder="0532 123 45 67" autocomplete="off" data-bind="${prefix}.phone" value="${esc(form.phone)}" />
        ${validation(errors, 'phone')}
    </div>
</div>
<div class="field">
    <div class="field__row"><label class="field__label" for="customer-note">Not</label>${charCount(form.note, 500)}</div>
    <textarea id="customer-note" class="field__input field__input--area${invalid(errors, 'note')}" rows="2" placeholder="İsteğe bağlı; yalnızca personel görür." data-bind="${prefix}.note">${esc(form.note ?? '')}</textarea>
    ${validation(errors, 'note')}
</div>`;
}

// ===========================================================================
// PC haritası

/** Haritanın verisi: sınıflar, PC'ler, açık oturumlar ve PC'lere atanmış sıradaki rezervasyonlar. */
function buildMap(state, now) {
  const policy = D.reservationPolicy(state);
  const cutoff = policy.liveCutoff(now);
  const horizon = now + D.MAP_HORIZON_MINUTES * MINUTE;

  // Her PC'nin sıradaki onaylı rezervasyonu: bekleme süresi geçmemiş, en fazla 12 saat ileride.
  const reservationByStation = new Map();
  [...state.reservations]
    .filter(
      (r) =>
        r.status === 'confirmed' &&
        r.stationId != null &&
        r.startsAt > cutoff &&
        r.startsAt < horizon,
    )
    .sort((a, b) => a.startsAt - b.startsAt)
    .forEach((r) => {
      if (reservationByStation.has(r.stationId)) return;
      // Müşteri talepten sonra kaydedildiyse telefonla eşleşir; haritada da şimdiden görünsün.
      const customer = r.customerId
        ? D.customerById(state, r.customerId)
        : state.customers.find((c) => c.isActive && c.phone === r.phone);
      reservationByStation.set(r.stationId, {
        ...r,
        endsAt: D.reservationEnd(r),
        customerId: customer?.id ?? null,
        customerFullName: customer?.fullName ?? null,
      });
    });

  const tiers = [...state.tiers].sort(D.byOrder).map((t) => ({
    id: t.id,
    name: t.name,
    label: t.label,
    hourlyRate: t.hourlyRate,
    packages: [...t.plans].filter((p) => p.isVisible && p.durationMinutes > 0).sort(D.byOrder),
    stations: state.stations
      .filter((s) => s.tierId === t.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
      .map((s) => {
        const g = D.openSessionOf(state, s.id);
        const customer = g?.customerId ? D.customerById(state, g.customerId) : null;
        const reservation = g?.reservationId
          ? state.reservations.find((r) => r.id === g.reservationId)
          : null;
        return {
          ...s,
          session: g
            ? {
                id: g.id,
                startedAt: g.startedAt,
                hourlyRate: g.hourlyRate,
                pkg: D.sessionPackage(g),
                customerId: g.customerId,
                customerName: customer?.fullName ?? null,
                customerBalance: customer?.balance ?? null,
                reservationName: reservation?.customerName ?? null,
              }
            : null,
          reservation: reservationByStation.get(s.id) ?? null,
        };
      }),
  }));
  return { tiers, policy: D.billingPolicy(state), reservations: policy };
}

function remainingMinutes(session, now) {
  return session.pkg.minutes - Math.floor((now - session.startedAt) / MINUTE);
}

function tileState(map, station, now) {
  const s = station.session;
  if (s) {
    if (!s.pkg) return 'busy';
    const remaining = remainingMinutes(s, now);
    return remaining < 0 ? 'overdue' : remaining <= 10 ? 'ending' : 'busy';
  }
  if (station.isOutOfService) return 'offline';
  return station.reservation && map.reservations.holdsStation(station.reservation.startsAt, now)
    ? 'reserved'
    : 'free';
}

function countdown(map, reservation, now) {
  if (now < reservation.startsAt) {
    const minutes = Math.ceil((reservation.startsAt - now) / MINUTE);
    return `${duration(minutes)} sonra`;
  }
  const late = Math.floor((now - reservation.startsAt) / MINUTE);
  const left = map.reservations.noShow - late;
  return left > 0 ? `${late} dk gecikti · ${left} dk tutulur` : `${late} dk gecikti`;
}

const estimate = (map, s, now) =>
  D.calculateCharge(s.startedAt, now, s.hourlyRate, map.policy, s.pkg);

function findStation(map, id) {
  for (const tier of map.tiers) {
    const station = tier.stations.find((s) => s.id === id);
    if (station) return { station, tier };
  }
  return { station: null, tier: null };
}

function openStation(ui, map, id, now, fromQuery = false) {
  const { station } = findStation(map, id);
  ui.selectedId = station ? id : null;
  ui.startCustomerId = null;
  ui.planId = null;
  ui.endPreview = null;
  ui.counterMethod = null;
  ui.picker = {
    query: '',
    creating: false,
    form: { fullName: '', phone: '' },
    errors: {},
    error: null,
  };
  ui.stationForm = station ? { code: station.code, tierId: station.tierId } : null;
  ui.stationErrors = {};
  // Rezervasyonun saati yaklaştıysa (ya da rezervasyon sayfasından gelindiyse) çekmece rezervasyonla açılır.
  ui.fromReservation = Boolean(
    station?.reservation &&
    (map.reservations.holdsStation(station.reservation.startsAt, now) || fromQuery),
  );
}

function previewEnd(state, sessionId, endAt) {
  const session = state.sessions.find((g) => g.id === sessionId && g.endedAt == null);
  if (!session) return null;
  const customer = session.customerId ? D.customerById(state, session.customerId) : null;
  const end = Math.max(session.startedAt, endAt);
  const charge = D.calculateCharge(
    session.startedAt,
    end,
    session.hourlyRate,
    D.billingPolicy(state),
    D.sessionPackage(session),
  );
  return {
    sessionId,
    stationCode: D.stationById(state, session.stationId).code,
    customerName: customer?.fullName ?? null,
    customerBalance: customer?.balance ?? null,
    startedAt: session.startedAt,
    endAt: end,
    hourlyRate: session.hourlyRate,
    charge,
    settlement: customer
      ? D.settle(charge.amount, customer.balance)
      : { fromBalance: 0, atCounter: charge.amount },
  };
}

/** Oturumu kapatır ve tahsil eder: önce bakiye kullanılır (eksiye düşmez), kalan kasada alınır. */
function endSession(state, sessionId, endAt, method, now) {
  if (now - endAt > MAX_PREVIEW_AGE)
    return D.fail('Hesap önizlemesi eskidi; oturumu bitir ekranını yeniden aç.');
  const session = state.sessions.find((g) => g.id === sessionId);
  if (!session) return D.fail('Oturum bulunamadı.');
  const station = D.stationById(state, session.stationId);
  if (session.endedAt != null) return D.fail(`${station.code} oturumu zaten kapatılmış.`);
  const preview = previewEnd(state, sessionId, Math.min(endAt, now));
  const { fromBalance, atCounter } = preview.settlement;
  if (atCounter > 0 && method !== 'cash' && method !== 'card') {
    return D.fail('Kasada alınacak tutar için ödeme yöntemini seç (nakit ya da kart).');
  }
  Object.assign(session, {
    endedAt: preview.endAt,
    billedMinutes: preview.charge.billedMinutes,
    charge: preview.charge.amount,
    paidFromBalance: fromBalance,
    paidAtCounter: atCounter,
    counterMethod: atCounter > 0 ? method : null,
  });
  const customer = session.customerId ? D.customerById(state, session.customerId) : null;
  if (customer && fromBalance > 0) {
    D.addLedgerEntry(state, customer, 'session', -fromBalance, now, {
      sessionId: session.id,
      note: `${station.code} oturumu`,
    });
  }
  return D.ok(preview);
}

function startSession(state, stationId, customerId, planId, reservation, now) {
  const station = D.stationById(state, stationId);
  if (!station) return D.fail('PC bulunamadı.');
  if (station.isOutOfService) return D.fail(`${station.code} hizmet dışı.`);
  if (D.openSessionOf(state, stationId)) return D.fail(`${station.code} şu an dolu.`);
  const tier = D.tierById(state, station.tierId);
  if (tier.hourlyRate <= 0) {
    return D.fail(
      `${tier.name} için saatlik tarife girilmemiş. Yönetici önce Sistemler sayfasından tarifeyi girmeli.`,
    );
  }
  if (customerId != null) {
    const customer = D.customerById(state, customerId);
    if (!customer?.isActive) return D.fail('Müşteri bulunamadı ya da hesabı pasif.');
    const other = state.sessions.find((g) => g.customerId === customerId && g.endedAt == null);
    if (other)
      return D.fail(
        `${customer.fullName} şu an ${D.stationById(state, other.stationId).code} PC'sinde oynuyor.`,
      );
  }
  const session = {
    id: D.nextId(state, 'sessions'),
    stationId,
    customerId,
    reservationId: reservation?.id ?? null,
    startedAt: now,
    endedAt: null,
    hourlyRate: tier.hourlyRate,
    planId: null,
    packageName: null,
    packageMinutes: null,
    packagePrice: null,
    billedMinutes: null,
    charge: null,
    paidFromBalance: null,
    paidAtCounter: null,
    counterMethod: null,
  };
  if (planId != null) {
    const plan = tier.plans.find((p) => p.id === planId);
    if (!plan || !plan.isVisible || !(plan.durationMinutes > 0))
      return D.fail("Seçilen paket bu PC'nin sınıfında kullanılamıyor.");
    Object.assign(session, {
      planId,
      packageName: plan.name,
      packageMinutes: plan.durationMinutes,
      packagePrice: plan.price,
    });
  }
  if (reservation) {
    reservation.status = 'completed';
    reservation.handledBy = D.STAFF_NAME;
    reservation.handledAt = now;
  }
  state.sessions.push(session);
  return D.ok(session.id);
}

function startFromReservation(state, reservationId, planId, now) {
  const reservation = state.reservations.find((r) => r.id === reservationId);
  if (!reservation) return D.fail('Rezervasyon bulunamadı.');
  if (reservation.status !== 'confirmed' || reservation.stationId == null) {
    return D.fail('Yalnızca onaylanmış ve PC atanmış rezervasyondan oturum başlatılabilir.');
  }
  // Önce rezervasyona bağlı müşteri; pasife alındıysa ya da hiç bağlanmadıysa telefonla yeniden eşleştir.
  let customerId =
    reservation.customerId && D.customerById(state, reservation.customerId)?.isActive
      ? reservation.customerId
      : null;
  customerId ??=
    state.customers.find((c) => c.phone === reservation.phone && c.isActive)?.id ?? null;
  reservation.customerId = customerId ?? reservation.customerId;
  return startSession(state, reservation.stationId, customerId, planId, reservation, now);
}

function changeReservationStatus(state, id, status, guard, now) {
  const reservation = state.reservations.find((r) => r.id === id);
  if (!reservation) return D.fail('Rezervasyon bulunamadı.');
  const error = guard(reservation, now);
  if (error) return D.fail(error);
  reservation.status = status;
  reservation.handledBy = D.STAFF_NAME;
  reservation.handledAt = now;
  return D.ok();
}

const cancelReservation = (state, id, now) =>
  changeReservationStatus(
    state,
    id,
    'cancelled',
    (r) =>
      r.status === 'pending' || r.status === 'confirmed'
        ? null
        : 'Yalnızca bekleyen ya da onaylı rezervasyon iptal edilebilir.',
    now,
  );

const markNoShow = (state, id, now) =>
  changeReservationStatus(
    state,
    id,
    'noshow',
    (r, at) =>
      r.status !== 'confirmed'
        ? 'Yalnızca onaylı rezervasyon "gelmedi" işaretlenebilir.'
        : at < r.startsAt
          ? 'Başlangıç saati gelmeden "gelmedi" işaretlenemez.'
          : null,
    now,
  );

const markCompleted = (state, id, now) =>
  changeReservationStatus(
    state,
    id,
    'completed',
    (r) =>
      r.status !== 'confirmed' ? 'Yalnızca onaylı rezervasyon tamamlandı işaretlenebilir.' : null,
    now,
  );

export const pcMap = {
  title: () => 'PC haritası · Panel',
  tick: 1000,
  enter(ctx) {
    const ui = { filter: 'all', selectedId: null, addForm: null, addErrors: {} };
    const initial = Number(ctx.query.get('pc'));
    if (initial) openStation(ui, buildMap(ctx.state, ctx.now), initial, ctx.now, true);
    return ui;
  },
  view(ctx) {
    const { state, now, ui, staff } = ctx;
    const map = buildMap(state, now);
    const all = map.tiers.flatMap((t) => t.stations);
    const count = (predicate) => all.filter(predicate).length;
    const stateOf = (s) => tileState(map, s, now);
    const overdueCount = count((s) => stateOf(s) === 'overdue');
    const reservedCount = count((s) => stateOf(s) === 'reserved');
    const outOfService = count((s) => s.isOutOfService);
    const chip = (value, label, total, extra = '') =>
      `<button type="button" class="chip${extra}${ui.filter === value ? ' is-active' : ''}" data-action="filter" data-value="${value}">${label} <b>${total}</b></button>`;
    const matches = (s) =>
      ui.filter === 'free'
        ? stateOf(s) === 'free'
        : ui.filter === 'busy'
          ? s.session != null
          : ui.filter === 'reserved'
            ? stateOf(s) === 'reserved'
            : ui.filter === 'overdue'
              ? stateOf(s) === 'overdue'
              : true;

    const header = pageHeader({
      eyebrow: 'Operasyon',
      title: 'PC haritası',
      description:
        "Bir PC'ye tıkla: boşsa oturum başlat, doluysa süreyi ve ücreti gör ya da oturumu bitir. Ekran diğer personelin işlemleriyle anında güncellenir.",
      actions: staff.isAdmin
        ? `<button type="button" class="btn btn--ghost" data-action="openAdd">${icon('plus')}PC ekle</button>`
        : '',
    });

    const toolbar = `<div class="map-toolbar">
    <div class="chips" role="group" aria-label="Filtre">
        ${chip('all', 'Tümü', all.length)}
        ${chip(
          'free',
          'Boş',
          count((s) => stateOf(s) === 'free'),
        )}
        ${chip(
          'busy',
          'Dolu',
          count((s) => s.session != null),
        )}
        ${reservedCount > 0 || ui.filter === 'reserved' ? chip('reserved', 'Rezerve', reservedCount) : ''}
        ${overdueCount > 0 ? chip('overdue', 'Paket süresi doldu', overdueCount, ' chip--warn') : ''}
        ${outOfService > 0 ? `<span class="chip chip--muted">Hizmet dışı <b>${outOfService}</b></span>` : ''}
    </div>
    <p class="live mono" title="Diğer personelin işlemleri anında yansır"><span class="pulse" aria-hidden="true"></span>Canlı · ${D.formatDate(now, 'HH:mm:ss')}</p>
</div>`;

    const empty =
      all.length === 0
        ? `<section class="card"><p class="empty">Henüz PC tanımlı değil. ${staff.isAdmin ? 'Yukarıdaki "PC ekle" ile kafedeki bilgisayarları ekle.' : "Yöneticiden PC'leri tanımlamasını iste."}</p></section>`
        : '';

    const sections = map.tiers
      .filter((t) => t.stations.length > 0)
      .map((tier) => {
        const visible = tier.stations.filter(matches);
        return `<section class="map-tier" data-key="tier-${tier.id}">
    <header class="map-tier__head">
        <div>
            <p class="mono map-tier__label">${esc(tier.label)}</p>
            <h2 class="map-tier__name">${esc(tier.name)}</h2>
        </div>
        <p class="mono map-tier__rate">${tier.hourlyRate > 0 ? `${money(tier.hourlyRate)} / saat` : '<span class="tag tag--warn">Tarife girilmedi</span>'}</p>
    </header>
    ${visible.length === 0 ? '<p class="map-tier__empty mono">Bu filtrede PC yok.</p>' : ''}
    <div class="station-grid">${visible.map((s) => stationTile(map, s, now, stateOf(s))).join('')}</div>
</section>`;
      })
      .join('');

    return header + toolbar + empty + sections;
  },
  drawer(ctx) {
    const { state, now, ui } = ctx;
    if (ui.addForm) return addStationsDrawer(state, ui);
    if (ui.selectedId == null) return null;
    const map = buildMap(state, now);
    const { station, tier } = findStation(map, ui.selectedId);
    if (!station) {
      ui.selectedId = null;
      return null;
    }
    if (ui.endPreview && station.session?.id !== ui.endPreview.sessionId) ui.endPreview = null;
    return {
      title: station.code,
      description: `${tier.name} · ${tier.hourlyRate > 0 ? `${money(tier.hourlyRate)} / saat` : 'tarife girilmedi'}`,
      body: stationDrawer(ctx, map, station, tier),
    };
  },
  closeDrawer({ ui }) {
    ui.selectedId = null;
    ui.endPreview = null;
    ui.addForm = null;
  },
  actions: {
    filter({ ui }, el) {
      ui.filter = el.dataset.value;
    },
    open({ ui, state, now }, el) {
      openStation(ui, buildMap(state, now), Number(el.dataset.id), now);
    },
    mode({ ui }, el) {
      ui.fromReservation = el.dataset.value === 'reservation';
    },
    plan({ ui }, el) {
      ui.planId = el.dataset.id ? Number(el.dataset.id) : null;
    },
    method({ ui }, el) {
      ui.counterMethod = el.dataset.value;
    },
    'picker:select'({ ui }, el) {
      ui.startCustomerId = Number(el.dataset.id);
      ui.picker.query = '';
    },
    'picker:clear'({ ui }) {
      ui.startCustomerId = null;
    },
    'picker:new'({ ui }) {
      const q = ui.picker.query.trim();
      // Arama kutusuna numara ya da ad yazıldıysa forma taşı.
      ui.picker.form = /\p{L}/u.test(q) ? { fullName: q, phone: '' } : { fullName: '', phone: q };
      ui.picker.creating = true;
      ui.picker.errors = {};
      ui.picker.error = null;
    },
    'picker:cancel'({ ui }) {
      ui.picker.creating = false;
    },
    'picker:create'(ctx) {
      const { ui } = ctx;
      ui.picker.errors = validateCustomer(ui.picker.form);
      if (Object.keys(ui.picker.errors).length) return;
      const result = D.commit((state) => createCustomer(state, ui.picker.form, Date.now()));
      if (!result.ok) {
        ui.picker.error = result.error;
        return;
      }
      ui.picker.creating = false;
      ui.picker.query = '';
      ui.startCustomerId = result.value;
    },
    start(ctx) {
      const { ui } = ctx;
      const customer = ui.startCustomerId ? D.customerById(ctx.state, ui.startCustomerId) : null;
      const code = D.stationById(ctx.state, ui.selectedId)?.code;
      if (
        ctx.run(
          (state) =>
            startSession(state, ui.selectedId, ui.startCustomerId, ui.planId, null, Date.now()),
          `${code} başladı · ${customer?.fullName ?? 'Misafir'}`,
        )
      ) {
        ui.selectedId = null;
      }
    },
    startReservation(ctx, el) {
      const { ui, state } = ctx;
      const reservation = state.reservations.find((r) => r.id === Number(el.dataset.id));
      const station = D.stationById(state, ui.selectedId);
      const map = buildMap(state, ctx.now);
      const info = findStation(map, ui.selectedId).station?.reservation;
      const name = info?.customerFullName ?? reservation?.customerName;
      if (
        ctx.run(
          (s) => startFromReservation(s, Number(el.dataset.id), ui.planId, Date.now()),
          `${station.code} başladı · ${name} (rezervasyon)`,
        )
      ) {
        ui.selectedId = null;
      }
    },
    noShow(ctx, el) {
      const reservation = ctx.state.reservations.find((r) => r.id === Number(el.dataset.id));
      if (
        ctx.run(
          (s) => markNoShow(s, Number(el.dataset.id), Date.now()),
          `${reservation.customerName} gelmedi; PC serbest.`,
        )
      ) {
        ctx.ui.fromReservation = false;
      }
    },
    previewEnd(ctx, el) {
      const preview = previewEnd(ctx.state, Number(el.dataset.id), Date.now());
      ctx.ui.counterMethod = null;
      if (!preview) ctx.toast('Oturum az önce kapatılmış.', true);
      ctx.ui.endPreview = preview;
    },
    backFromEnd({ ui }) {
      ui.endPreview = null;
    },
    end(ctx) {
      const { ui } = ctx;
      const preview = ui.endPreview;
      if (!preview) return;
      const collected =
        preview.settlement.atCounter > 0
          ? ` · kasada ${money(preview.settlement.atCounter)} ${D.payment(ui.counterMethod).toLocaleLowerCase('tr')}`
          : '';
      if (
        ctx.run(
          (s) => endSession(s, preview.sessionId, preview.endAt, ui.counterMethod, Date.now()),
          `${preview.stationCode} kapandı · ${money(preview.charge.amount)}${collected}`,
        )
      ) {
        ui.selectedId = null;
        ui.endPreview = null;
      }
    },
    outOfService(ctx, el) {
      const value = el.dataset.value === 'true';
      const station = D.stationById(ctx.state, ctx.ui.selectedId);
      ctx.run(
        (s) => {
          const target = D.stationById(s, station.id);
          if (!target) return D.fail('PC bulunamadı.');
          if (value && D.openSessionOf(s, target.id))
            return D.fail(`${target.code} şu an kullanımda. Önce oturumu bitir.`);
          target.isOutOfService = value;
          return D.ok();
        },
        value ? `${station.code} hizmet dışı.` : `${station.code} hizmette.`,
      );
    },
    saveStation(ctx) {
      const { ui } = ctx;
      const code = (ui.stationForm.code ?? '').trim().toUpperCase();
      ui.stationErrors = {};
      if (!code) ui.stationErrors.code = 'Kod gerekli.';
      else if (!/^[A-Za-z0-9-]{1,20}$/.test(code))
        ui.stationErrors.code = 'Harf, rakam ve tire; örn. VIP-03.';
      if (Object.keys(ui.stationErrors).length) return;
      ctx.run((s) => {
        const station = D.stationById(s, ui.selectedId);
        if (!station) return D.fail('PC bulunamadı.');
        if (s.stations.some((x) => x.id !== station.id && x.code === code))
          return D.fail(`${code} kodu başka bir PC'de kullanılıyor.`);
        station.code = code;
        station.tierId = ui.stationForm.tierId;
        return D.ok();
      }, 'PC kaydedildi.');
      ui.stationForm.code = code;
    },
    deleteStation(ctx) {
      const station = D.stationById(ctx.state, ctx.ui.selectedId);
      if (
        ctx.run((s) => {
          if (s.sessions.some((g) => g.stationId === station.id))
            return D.fail("Bu PC'nin oturum geçmişi var; silmek yerine hizmet dışı bırak.");
          s.stations = s.stations.filter((x) => x.id !== station.id);
          return D.ok();
        }, `${station.code} silindi.`)
      ) {
        ctx.ui.selectedId = null;
      }
    },
    openAdd({ ui, state }) {
      const first = [...state.tiers].sort(D.byOrder)[0];
      ui.addForm = {
        tierId: first?.id ?? 0,
        prefix: first ? first.name.split(' ')[0].toLocaleUpperCase('en') : 'PC',
        count: 1,
      };
      ui.addErrors = {};
    },
    addStations(ctx) {
      const { ui } = ctx;
      const form = ui.addForm;
      ui.addErrors = {};
      if (!form.prefix?.trim()) ui.addErrors.prefix = 'Ön ek gerekli.';
      else if (!/^[A-Za-z0-9]{1,10}$/.test(form.prefix.trim()))
        ui.addErrors.prefix = '1-10 harf ya da rakam; örn. VIP.';
      if (!(form.count >= 1 && form.count <= 50))
        ui.addErrors.count = 'Tek seferde 1 ile 50 arası PC eklenebilir.';
      if (Object.keys(ui.addErrors).length) return;
      if (
        ctx.run((s) => {
          if (!D.tierById(s, form.tierId)) return D.fail('Sistem sınıfı bulunamadı.');
          const prefix = form.prefix.trim().toUpperCase();
          const last = Math.max(
            0,
            ...s.stations
              .filter((x) => x.code.toUpperCase().startsWith(`${prefix}-`))
              .map((x) => Number.parseInt(x.code.slice(prefix.length + 1), 10) || 0),
          );
          let order = Math.max(0, ...s.stations.map((x) => x.sortOrder)) + 1;
          for (let i = 1; i <= form.count; i++) {
            s.stations.push({
              id: D.nextId(s, 'stations'),
              code: `${prefix}-${String(last + i).padStart(2, '0')}`,
              tierId: form.tierId,
              isOutOfService: false,
              sortOrder: order++,
            });
          }
          return D.ok();
        }, `${form.count} PC eklendi.`)
      ) {
        ui.addForm = null;
      }
    },
  },
};

function stationTile(map, station, now, state) {
  let inner;
  const s = station.session;
  if (s) {
    const charge = estimate(map, s, now);
    let pkg = '';
    if (s.pkg) {
      const remaining = remainingMinutes(s, now);
      const fill = Math.min(1, Math.max(0, (now - s.startedAt) / MINUTE / s.pkg.minutes));
      pkg = `<span class="station__package">
                <span class="station__bar"><span style="--fill: ${+fill.toFixed(3)}"></span></span>
                <span class="mono">${remaining >= 0 ? `${esc(s.pkg.name)} · kalan ${remaining} dk` : `${esc(s.pkg.name)} · +${-remaining} dk aşım`}</span>
            </span>`;
    }
    const next = station.reservation
      ? `<span class="station__next mono${map.reservations.holdsStation(station.reservation.startsAt, now) ? ' is-warn' : ''}">${D.hhmm(station.reservation.startsAt)} rezervasyon</span>`
      : '';
    inner = `<span class="station__who">${esc(s.customerName ?? s.reservationName ?? 'Misafir')}</span>
            <span class="station__time mono">${D.elapsed(now - s.startedAt)}</span>
            ${pkg}${next}
            <span class="station__charge">${money(charge.amount)}</span>`;
  } else if (station.isOutOfService) {
    inner = '<span class="station__status">Hizmet dışı</span>';
  } else if (state === 'reserved') {
    const held = station.reservation;
    inner = `<span class="station__status">Rezerve · ${D.hhmm(held.startsAt)}</span>
            <span class="station__who">${esc(held.customerFullName ?? held.customerName)}</span>
            <span class="station__countdown mono${now >= held.startsAt ? ' is-late' : ''}">${countdown(map, held, now)}</span>
            <span class="station__cta mono">Başlat →</span>`;
  } else {
    inner = `<span class="station__status">Boş</span>
            ${station.reservation ? `<span class="station__next mono">${D.hhmm(station.reservation.startsAt)} rezerve</span>` : ''}
            <span class="station__cta mono">Başlat →</span>`;
  }
  const who = s?.customerName ?? s?.reservationName;
  const aria =
    {
      free: `${station.code}, boş. Oturum başlat.`,
      reserved: `${station.code}, ${station.reservation?.customerName} için rezerve. Rezervasyonla başlat.`,
      offline: `${station.code}, hizmet dışı.`,
      overdue: `${station.code}, ${who ?? 'misafir'}, paket süresi doldu.`,
    }[state] ?? `${station.code}, ${who ?? 'misafir'} oynuyor.`;
  return `<button type="button" class="station station--${state}" data-key="st-${station.id}" aria-label="${esc(aria)}" data-action="open" data-id="${station.id}">
        <span class="station__top">
            <span class="station__code">${esc(station.code)}</span>
            <span class="station__dot" aria-hidden="true"></span>
        </span>
        ${inner}
    </button>`;
}

// Oturum başlatırken ücretlendirme seçimi: açık uçlu ya da sınıfın paketlerinden biri.
function pricing(map, tier, ui) {
  const option = (selected, attrs, content) =>
    `<button type="button" role="radio" aria-checked="${selected}" class="option${selected ? ' is-selected' : ''}" data-action="plan"${attrs}>${content}</button>`;
  return `<div class="field">
    <p class="field__label">Ücretlendirme</p>
    <div class="options" role="radiogroup" aria-label="Ücretlendirme">
        ${option(
          ui.planId == null,
          ' data-id=""',
          `<span class="option__name">Açık uçlu</span>
            <span class="option__meta mono">${tier.hourlyRate > 0 ? `${money(tier.hourlyRate)} / saat · en az ${map.policy.minimum} dk` : 'Tarife girilmedi'}</span>`,
        )}
        ${tier.packages
          .map((p) =>
            option(
              ui.planId === p.id,
              ` data-id="${p.id}"`,
              `<span class="option__name">${esc(p.name)}</span>
            <span class="option__meta mono">${duration(p.durationMinutes)}</span>
            <span class="option__price">${money(p.price)}</span>`,
            ),
          )
          .join('')}
    </div>
    ${ui.planId != null ? '<p class="field__hint">Paket süresi aşılırsa aşan süre saatlik tarifeyle eklenir.</p>' : ''}
</div>`;
}

function customerPicker(state, ui) {
  const picker = ui.picker;
  if (ui.startCustomerId) {
    const c = D.customerById(state, ui.startCustomerId);
    return `<div class="picker"><div class="picker__selected">
        <span class="admin-user__avatar" aria-hidden="true">${initials(c.fullName)}</span>
        <div class="picker__who">
            <p class="picker__name">${esc(c.fullName)}</p>
            <p class="picker__meta mono">${D.phone(c.phone)} · Bakiye ${money(c.balance)}</p>
        </div>
        <button type="button" class="btn btn--sm btn--ghost" data-action="picker:clear">Değiştir</button>
    </div></div>`;
  }
  if (picker.creating) {
    const e = picker.errors;
    return `<div class="picker"><form class="picker__create" novalidate data-submit="picker:create">
        <div class="field-pair">
            <div class="field">
                <label class="field__label" for="picker-name">Ad soyad</label>
                <input id="picker-name" class="field__input${invalid(e, 'fullName')}" data-bind="picker.form.fullName" value="${esc(picker.form.fullName)}" />
                ${validation(e, 'fullName')}
            </div>
            <div class="field">
                <label class="field__label" for="picker-phone">Telefon</label>
                <input id="picker-phone" class="field__input${invalid(e, 'phone')}" inputmode="tel" placeholder="0532 123 45 67" data-bind="picker.form.phone" value="${esc(picker.form.phone)}" />
                ${validation(e, 'phone')}
            </div>
        </div>
        ${picker.error ? `<p class="form-alert" role="alert">${esc(picker.error)}</p>` : ''}
        <div class="form-actions">
            <button type="submit" class="btn btn--sm btn--volt">Kaydet ve seç</button>
            <button type="button" class="btn btn--sm btn--ghost" data-action="picker:cancel">Vazgeç</button>
        </div>
    </form></div>`;
  }
  const results =
    picker.query.trim().length >= 2 ? searchCustomers(state, picker.query, { take: 6 }).items : [];
  return `<div class="picker">
    <label class="sr-only" for="picker-search">Müşteri ara</label>
    <input id="picker-search" class="field__input" placeholder="Ad ya da telefonla ara…" autocomplete="off" data-bind="picker.query" value="${esc(picker.query)}" />
    ${
      results.length
        ? `<ul class="picker__results" role="listbox" aria-label="Arama sonuçları">${results
            .map(
              (
                c,
              ) => `<li><button type="button" class="picker__result" role="option" aria-selected="false" data-action="picker:select" data-id="${c.id}">
                    <span class="picker__name">${esc(c.fullName)}</span>
                    <span class="picker__meta mono">${D.phone(c.phone)}</span>
                    <span class="picker__balance">${money(c.balance)}</span>
                </button></li>`,
            )
            .join('')}</ul>`
        : picker.query.trim().length >= 2
          ? '<p class="picker__empty">Eşleşen müşteri yok.</p>'
          : ''
    }
    <button type="button" class="text-button" data-action="picker:new">${icon('plus')}Yeni müşteri kaydet</button>
</div>`;
}

function stationDrawer(ctx, map, station, tier) {
  const { state, now, ui, staff } = ctx;
  const holds = (r) => map.reservations.holdsStation(r.startsAt, now);
  let body = '';

  if (station.session) {
    const session = station.session;
    if (!ui.endPreview) {
      const charge = estimate(map, session, now);
      const next = station.reservation;
      body = `${
        next
          ? `<p class="form-alert form-alert--warn">
                ${D.hhmm(next.startsAt)}'da ${esc(next.customerName)} için rezervasyon var${holds(next) ? "; PC'nin şimdi boşalması gerekiyor" : ''}.
                Gerekirse <a class="text-link" href="#/rezervasyonlar">rezervasyonu başka PC'ye taşı</a>.
            </p>`
          : ''
      }
        <div class="session-card">
            <div class="session-card__row">
                <div>
                    <p class="mono session-card__label">Müşteri</p>
                    <p class="session-card__value">${
                      session.customerId
                        ? `<a class="text-link" href="#/musteriler/${session.customerId}">${esc(session.customerName)}</a>`
                        : esc(
                            session.reservationName
                              ? `${session.reservationName} (kayıtsız, rezervasyon)`
                              : 'Misafir (kayıtsız)',
                          )
                    }</p>
                    ${session.customerBalance != null ? `<p class="session-card__sub">Bakiye ${money(session.customerBalance)}</p>` : ''}
                </div>
                <div class="session-card__right">
                    <p class="mono session-card__label">Başlangıç</p>
                    <p class="session-card__value">${D.hhmm(session.startedAt)}</p>
                </div>
            </div>
            <p class="session-card__clock mono">${D.elapsed(now - session.startedAt)}</p>
            ${chargeDetails({ charge, hourlyRate: session.hourlyRate, pkg: session.pkg })}
        </div>
        <div class="form-actions">
            <button type="button" class="btn btn--volt btn--block" data-action="previewEnd" data-id="${session.id}">Oturumu bitir</button>
        </div>`;
    } else {
      const p = ui.endPreview;
      const due = p.settlement.atCounter > 0;
      body = `<div class="checkout">
            <p class="mono checkout__label">
                Bitiş ${D.hhmm(p.endAt)} ·
                ${D.playTime(p.charge.elapsedMinutes)} oynandı
            </p>
            <p class="checkout__total">${money(p.charge.amount)}</p>
            ${chargeDetails({ charge: p.charge, hourlyRate: p.hourlyRate, pkg: session.pkg, totalLabel: 'Toplam' })}

            <dl class="checkout__split">
                ${p.customerName != null ? `<div><dt>Bakiyeden düşülecek</dt><dd>${money(p.settlement.fromBalance)}</dd></div>` : ''}
                <div class="${due ? 'is-due' : ''}"><dt>Kasada alınacak</dt><dd>${money(p.settlement.atCounter)}</dd></div>
            </dl>

            ${
              due
                ? `<div class="segmented" role="radiogroup" aria-label="Ödeme yöntemi">
                    ${['cash', 'card']
                      .map(
                        (m) =>
                          `<button type="button" role="radio" aria-checked="${ui.counterMethod === m}" class="segmented__option${ui.counterMethod === m ? ' is-selected' : ''}" data-action="method" data-value="${m}">${D.payment(m)}</button>`,
                      )
                      .join('')}
                </div>`
                : p.customerName != null
                  ? `<p class="field__hint">Ücretin tamamı bakiyeden düşülecek. Kalan bakiye: ${money((p.customerBalance ?? 0) - p.settlement.fromBalance)}</p>`
                  : ''
            }

            <div class="form-actions">
                <button type="button" class="btn btn--volt" data-action="end"${due && !ui.counterMethod ? ' disabled' : ''}>${due ? 'Tahsil et ve bitir' : 'Bitir'}</button>
                <button type="button" class="btn btn--ghost" data-action="backFromEnd">Geri</button>
            </div>
        </div>`;
    }
  } else if (station.isOutOfService) {
    body = `<p class="empty">Bu PC hizmet dışı; oturum başlatılamaz.</p>
        <div class="form-actions">
            <button type="button" class="btn btn--volt" data-action="outOfService" data-value="false">Hizmete al</button>
        </div>`;
  } else {
    const reservation = station.reservation;
    const modes = reservation
      ? `<div class="segmented drawer__modes" role="radiogroup" aria-label="Oturum türü">
            <button type="button" role="radio" aria-checked="${ui.fromReservation}" class="segmented__option${ui.fromReservation ? ' is-selected' : ''}" data-action="mode" data-value="reservation">Rezervasyon</button>
            <button type="button" role="radio" aria-checked="${!ui.fromReservation}" class="segmented__option${!ui.fromReservation ? ' is-selected' : ''}" data-action="mode" data-value="other">Başka müşteri</button>
        </div>`
      : '';
    if (reservation && ui.fromReservation) {
      body = `${modes}
        <div class="session-card reservation-card${holds(reservation) ? ' is-holding' : ''}">
            <div class="session-card__row">
                <div>
                    <p class="mono session-card__label">Rezervasyon · <span lang="en">#${reservation.code}</span></p>
                    <p class="session-card__value">${esc(reservation.customerName)}</p>
                    <p class="session-card__sub"><a class="text-link" href="tel:${reservation.phone}">${D.phone(reservation.phone)}</a></p>
                </div>
                <div class="session-card__right">
                    <p class="mono session-card__label">Saat</p>
                    <p class="session-card__value">${D.hhmm(reservation.startsAt)}–${D.hhmm(reservation.endsAt)}</p>
                    <p class="session-card__sub">${countdown(map, reservation, now)}</p>
                </div>
            </div>
            ${reservation.note ? `<p class="reservation-card__note">“${esc(reservation.note)}”</p>` : ''}
            <p class="field__hint">${
              reservation.customerId
                ? `<span>Kayıtlı müşteri: <a class="text-link" href="#/musteriler/${reservation.customerId}">${esc(reservation.customerFullName)}</a>. Ücret önce bakiyesinden düşülür.</span>`
                : '<span>Telefon kayıtlı bir müşteriyle eşleşmiyor; misafir oturumu açılır, ücret kasada alınır.</span>'
            }</p>
        </div>

        <div class="form-grid">
            ${pricing(map, tier, ui)}
            <div class="form-actions">
                <button type="button" class="btn btn--volt btn--block" data-action="startReservation" data-id="${reservation.id}"${tier.hourlyRate <= 0 ? ' disabled' : ''}>
                    Rezervasyonla başlat
                </button>
            </div>
        </div>

        ${
          now >= reservation.startsAt
            ? `<div class="drawer__section">
                <button type="button" class="text-button" data-action="noShow" data-id="${reservation.id}">Müşteri gelmedi · PC'yi serbest bırak</button>
            </div>`
            : ''
        }`;
    } else {
      body = `${modes}
        ${reservation ? `<p class="form-alert form-alert--warn">Bu PC ${D.hhmm(reservation.startsAt)}'da ${esc(reservation.customerName)} için rezerve. Oturum o saate kadar bitmeli.</p>` : ''}
        <div class="form-grid">
            <div class="field">
                <p class="field__label">Müşteri</p>
                ${customerPicker(state, ui)}
                <p class="field__hint">Seçmezsen kayıtsız (misafir) oturum açılır; ücret kasada alınır.</p>
            </div>

            ${pricing(map, tier, ui)}

            <div class="form-actions">
                <button type="button" class="btn btn--volt btn--block" data-action="start"${tier.hourlyRate <= 0 ? ' disabled' : ''}>
                    Oturumu başlat
                </button>
            </div>
        </div>

        <div class="drawer__section">
            <button type="button" class="text-button" data-action="outOfService" data-value="true">Hizmet dışı bırak (arıza, bakım)</button>
        </div>`;
    }
  }

  if (staff.isAdmin && !station.session && ui.stationForm) {
    const e = ui.stationErrors;
    body += `<details class="drawer__section admin-only">
        <summary class="mono">PC ayarları</summary>
        <form class="form-grid" novalidate data-submit="saveStation">
            <div class="field-pair">
                <div class="field">
                    <label class="field__label" for="station-code">Kod</label>
                    <input id="station-code" class="field__input field__input--mono${invalid(e, 'code')}" data-bind="stationForm.code" value="${esc(ui.stationForm.code)}" />
                    ${validation(e, 'code')}
                </div>
                <div class="field">
                    <label class="field__label" for="station-tier">Sınıf</label>
                    <select id="station-tier" class="field__input" data-bind="stationForm.tierId" data-type="int">
                        ${map.tiers.map((t) => `<option value="${t.id}"${t.id === ui.stationForm.tierId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn--sm btn--volt">Kaydet</button>
                ${confirmButton(ui, { id: 'delete-station', action: 'deleteStation', buttonClass: 'btn btn--sm btn--danger-ghost', question: `${station.code} silinsin mi?`, content: `${icon('trash')}PC'yi sil` })}
            </div>
        </form>
    </details>`;
  }
  return body;
}

function addStationsDrawer(state, ui) {
  const form = ui.addForm;
  const e = ui.addErrors;
  return {
    title: 'PC ekle',
    description:
      'Kodlar ön ekle ve sırayla verilir; mevcut en büyük numaradan devam eder (ör. VIP-11, VIP-12).',
    body: `<form class="form-grid" novalidate data-submit="addStations">
        <div class="field">
            <label class="field__label" for="add-tier">Sistem sınıfı</label>
            <select id="add-tier" class="field__input" data-bind="addForm.tierId" data-type="int">
                ${[...state.tiers]
                  .sort(D.byOrder)
                  .map(
                    (t) =>
                      `<option value="${t.id}"${t.id === form.tierId ? ' selected' : ''}>${esc(t.name)}</option>`,
                  )
                  .join('')}
            </select>
        </div>
        <div class="field-pair">
            <div class="field">
                <label class="field__label" for="add-prefix">Ön ek</label>
                <input id="add-prefix" class="field__input field__input--mono${invalid(e, 'prefix')}" placeholder="VIP" data-bind="addForm.prefix" value="${esc(form.prefix)}" />
                ${validation(e, 'prefix')}
            </div>
            <div class="field">
                <label class="field__label" for="add-count">Adet</label>
                <input id="add-count" type="number" class="field__input${invalid(e, 'count')}" min="1" max="50" data-bind="addForm.count" data-type="int" value="${form.count ?? ''}" />
                ${validation(e, 'count')}
            </div>
        </div>
        <div class="form-actions">
            <button type="submit" class="btn btn--volt">Ekle</button>
            <button type="button" class="btn btn--ghost" data-action="drawer:close">Vazgeç</button>
        </div>
    </form>`,
  };
}

// ===========================================================================
// Oturumlar ve gün sonu

function dayReport(state, day, includeOpen) {
  const from = D.startOfDay(day).getTime();
  const to = D.addDays(D.startOfDay(day), 1).getTime();
  const closed = state.sessions
    .filter((g) => g.endedAt != null && g.endedAt >= from && g.endedAt < to)
    .sort((a, b) => b.endedAt - a.endedAt);
  const open = includeOpen
    ? state.sessions.filter((g) => g.endedAt == null).sort((a, b) => a.startedAt - b.startedAt)
    : [];
  const topUps = state.transactions.filter(
    (t) => t.kind === 'topup' && t.createdAt >= from && t.createdAt < to,
  );
  const sum = (list, pick) => D.round2(list.reduce((total, item) => total + (pick(item) ?? 0), 0));
  const counter = (method) =>
    D.round2(
      sum(
        closed.filter((g) => g.counterMethod === method),
        (g) => g.paidAtCounter,
      ) +
        sum(
          topUps.filter((t) => t.method === method),
          (t) => t.amount,
        ),
    );
  return {
    closed,
    open,
    playedMinutes: closed.reduce(
      (total, g) => total + Math.floor((g.endedAt - g.startedAt) / MINUTE),
      0,
    ),
    revenue: sum(closed, (g) => g.charge),
    fromBalance: sum(closed, (g) => g.paidFromBalance),
    cash: counter('cash'),
    card: counter('card'),
    topUps: sum(topUps, (t) => t.amount),
  };
}

function sessionRow(state, g) {
  const station = D.stationById(state, g.stationId);
  const customer = g.customerId ? D.customerById(state, g.customerId) : null;
  return {
    station: station?.code ?? '—',
    tier: D.tierById(state, station?.tierId)?.name ?? '',
    customerCell: customer
      ? `<a class="table__link" href="#/musteriler/${customer.id}">${esc(customer.fullName)}</a>`
      : '<span class="muted-cell">Misafir</span>',
  };
}

function paymentSummary(g) {
  const parts = [];
  if (g.paidFromBalance > 0) parts.push(`Bakiye ${money(g.paidFromBalance)}`);
  if (g.paidAtCounter > 0) parts.push(`${D.payment(g.counterMethod)} ${money(g.paidAtCounter)}`);
  return parts.length ? parts.join(' + ') : '—';
}

export const sessions = {
  title: () => 'Oturumlar · Panel',
  tick: 1000,
  enter: ({ now }) => ({ day: D.dayKey(now) }),
  view({ state, now, ui }) {
    const today = D.dayKey(now);
    const day = new Date(`${ui.day}T00:00:00`);
    const isToday = ui.day === today;
    const report = dayReport(state, day, isToday);

    const openTable = report.open.length
      ? `<section class="card">
    <header class="card__head">
        <h2 class="card__title">Açık oturumlar</h2>
        <a class="text-link" href="#/pc">PC haritasında yönet</a>
    </header>
    <table class="table">
        <thead><tr><th>PC</th><th>Müşteri</th><th>Başlangıç</th><th>Süre</th><th>Paket</th></tr></thead>
        <tbody>${report.open
          .map((g) => {
            const row = sessionRow(state, g);
            return `<tr data-key="o-${g.id}">
                <td><strong>${esc(row.station)}</strong> <span class="table__sub">${esc(row.tier)}</span></td>
                <td>${row.customerCell}</td>
                <td class="mono-cell">${D.hhmm(g.startedAt)}</td>
                <td class="mono-cell">${D.elapsed(now - g.startedAt)}</td>
                <td class="muted-cell">${esc(g.packageName ?? 'Açık uçlu')}</td>
            </tr>`;
          })
          .join('')}</tbody>
    </table>
</section>`
      : '';

    const closedTable = report.closed.length
      ? `<table class="table">
        <thead>
            <tr><th>PC</th><th>Müşteri</th><th>Saat</th><th>Süre</th><th>Paket</th><th class="num">Ücret</th><th class="num">Ödeme</th></tr>
        </thead>
        <tbody>${report.closed
          .map((g) => {
            const row = sessionRow(state, g);
            return `<tr data-key="c-${g.id}">
                <td><strong>${esc(row.station)}</strong> <span class="table__sub">${esc(row.tier)}</span></td>
                <td>${row.customerCell}</td>
                <td class="mono-cell">${D.hhmm(g.startedAt)}–${D.hhmm(g.endedAt)}</td>
                <td>
                    ${D.playTime(Math.floor((g.endedAt - g.startedAt) / MINUTE))}
                    ${g.billedMinutes != null ? `<span class="table__sub">${duration(g.billedMinutes)} ücretlendi</span>` : ''}
                </td>
                <td class="muted-cell">${esc(g.packageName ?? '—')}</td>
                <td class="num"><strong>${money(g.charge ?? 0)}</strong></td>
                <td class="num muted-cell">${paymentSummary(g)}</td>
            </tr>`;
          })
          .join('')}</tbody>
    </table>`
      : '<p class="empty">Bu gün kapanan oturum yok.</p>';

    return `${pageHeader({
      eyebrow: 'Operasyon',
      title: 'Oturumlar ve gün sonu',
      description:
        'Seçilen günün kapanan oturumları ve kasası. Oturum geliri bakiyeden ödenenleri de içerir; kasa yalnızca o gün alınan nakit ve kart ödemeleridir.',
    })}
<div class="day-nav">
    <button type="button" class="icon-button" aria-label="Önceki gün" data-action="day" data-offset="-1">${icon('arrow-left')}</button>
    <label class="sr-only" for="report-day">Gün</label>
    <input id="report-day" type="date" class="field__input field__input--sm" max="${today}" value="${ui.day}" data-bind="dayInput" data-after="dayInput" />
    <button type="button" class="icon-button" aria-label="Sonraki gün" data-action="day" data-offset="1"${isToday ? ' disabled' : ''}>${icon('arrow-right')}</button>
    <p class="day-nav__label">${D.formatDate(day, 'd MMMM yyyy, dddd')}</p>
    ${!isToday ? '<button type="button" class="btn btn--sm btn--ghost" data-action="today">Bugün</button>' : ''}
</div>

<section class="stat-grid" aria-label="Gün özeti">
    <article class="stat stat--accent">
        <p class="stat__label mono">Oturum geliri</p>
        <p class="stat__value">${money(report.revenue)}</p>
        <p class="stat__hint">${report.closed.length} oturum · ${report.closed.length > 0 ? D.playTime(report.playedMinutes) : 'henüz yok'}</p>
    </article>
    <article class="stat">
        <p class="stat__label mono">Kasa · nakit</p>
        <p class="stat__value">${money(report.cash)}</p>
        <p class="stat__hint">Yükleme + kasada ödenen oturum</p>
    </article>
    <article class="stat">
        <p class="stat__label mono">Kasa · kart</p>
        <p class="stat__value">${money(report.card)}</p>
        <p class="stat__hint">Yükleme + kasada ödenen oturum</p>
    </article>
    <article class="stat">
        <p class="stat__label mono">Bakiye yükleme</p>
        <p class="stat__value">${money(report.topUps)}</p>
        <p class="stat__hint">Bakiyeden harcanan ${money(report.fromBalance)}</p>
    </article>
</section>

${openTable}

<section class="card">
    <header class="card__head">
        <h2 class="card__title">Kapanan oturumlar</h2>
        <p class="mono">${report.closed.length} oturum</p>
    </header>
    ${closedTable}
</section>`;
  },
  actions: {
    day({ ui, now }, el) {
      const next = D.dayKey(D.addDays(new Date(`${ui.day}T00:00:00`), Number(el.dataset.offset)));
      ui.day = next > D.dayKey(now) ? D.dayKey(now) : next;
    },
    today({ ui, now }) {
      ui.day = D.dayKey(now);
    },
    dayInput({ ui, now }) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(ui.dayInput ?? ''))
        ui.day = ui.dayInput > D.dayKey(now) ? D.dayKey(now) : ui.dayInput;
    },
  },
};

// ===========================================================================
// Müşteriler

const emptyCustomer = () => ({ fullName: '', phone: '', note: '' });

export const customers = {
  title: () => 'Müşteriler · Panel',
  enter: () => ({ query: '', includeInactive: false, createForm: null, errors: {} }),
  view({ state, ui }) {
    const result = searchCustomers(state, ui.query, { includeInactive: ui.includeInactive });
    const list =
      result.items.length === 0
        ? `<p class="empty">${ui.query.trim() ? 'Eşleşen müşteri yok.' : 'Henüz kayıtlı müşteri yok.'}</p>`
        : `<p class="list-meta mono">${result.total} müşteri${result.total > result.items.length ? ` · ilk ${result.items.length} gösteriliyor` : ''}</p>
        <table class="table table--rows">
            <thead>
                <tr><th>Müşteri</th><th>Telefon</th><th class="num">Bakiye</th><th class="num">Son ziyaret</th></tr>
            </thead>
            <tbody>${result.items
              .map(
                (
                  c,
                ) => `<tr class="${c.isActive ? '' : 'is-muted'}" data-key="cu-${c.id}" data-href="/musteriler/${c.id}">
                    <td>
                        <a class="table__link" href="#/musteriler/${c.id}">${esc(c.fullName)}</a>
                        ${c.isActive ? '' : '<span class="tag">Pasif</span>'}
                    </td>
                    <td class="mono-cell">${D.phone(c.phone)}</td>
                    <td class="num">${money(c.balance)}</td>
                    <td class="num">${c.lastVisit ? D.formatDate(c.lastVisit, 'd MMM yyyy') : '—'}</td>
                </tr>`,
              )
              .join('')}</tbody>
        </table>`;

    return `${pageHeader({
      eyebrow: 'Operasyon',
      title: 'Müşteriler',
      description:
        'Kayıtlı müşteriler ve bakiyeleri. Ad ya da telefonun herhangi bir parçasıyla arayabilirsin.',
      actions: `<button type="button" class="btn btn--volt" data-action="openCreate">${icon('plus')}Yeni müşteri</button>`,
    })}
<section class="card">
    <div class="search-row">
        <label class="sr-only" for="customer-search">Müşteri ara</label>
        <input id="customer-search" class="field__input" placeholder="Ad, soyad ya da telefon…" autocomplete="off" data-bind="query" value="${esc(ui.query)}" />
        <label class="check">
            <input type="checkbox" data-bind="includeInactive"${ui.includeInactive ? ' checked' : ''} />
            <span>Pasifleri göster</span>
        </label>
    </div>
    ${list}
</section>`;
  },
  drawer({ ui }) {
    if (!ui.createForm) return null;
    return {
      title: 'Yeni müşteri',
      description: 'Telefon numarası müşteriyi tanımlar; aynı numara iki kez kaydedilemez.',
      body: `<form class="form-grid" novalidate data-submit="create">
        ${customerFields(ui.createForm, ui.errors, 'createForm')}
        <div class="form-actions">
            <button type="submit" class="btn btn--volt">Kaydet</button>
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
      ui.createForm = emptyCustomer();
      ui.errors = {};
    },
    create(ctx) {
      const { ui } = ctx;
      ui.errors = validateCustomer(ui.createForm);
      if (Object.keys(ui.errors).length) return;
      const id = ctx.run((state) => createCustomer(state, ui.createForm, Date.now()));
      if (id) {
        ui.createForm = null;
        ctx.navigate(`/musteriler/${id}`);
      }
    },
  },
};

// ===========================================================================
// Müşteri profili

function customerForm(customer) {
  return { fullName: customer.fullName, phone: D.phone(customer.phone), note: customer.note ?? '' };
}

export const customerProfile = {
  title: ({ state, params }) =>
    `${D.customerById(state, Number(params[0]))?.fullName ?? 'Müşteri'} · Panel`,
  enter({ state, params }) {
    const customer = D.customerById(state, Number(params[0]));
    return {
      form: customer ? customerForm(customer) : null,
      errors: {},
      topUp: { amount: null, method: 'cash' },
      topUpErrors: {},
      adjustment: { amount: null, note: '' },
      adjustErrors: {},
    };
  },
  view(ctx) {
    const { state, ui, staff } = ctx;
    const customer = D.customerById(state, Number(ctx.params[0]));
    if (!customer) {
      return pageHeader({
        eyebrow: 'Müşteriler',
        title: 'Müşteri bulunamadı',
        backHref: '#/musteriler',
        backLabel: 'Müşteriler',
      });
    }
    const ledger = state.transactions
      .filter((t) => t.customerId === customer.id)
      .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
      .slice(0, 100);
    const history = state.sessions
      .filter((g) => g.customerId === customer.id)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 30);
    const amount = ui.topUp.amount ?? 0;

    const topUp = customer.isActive
      ? `<form class="form-grid" novalidate data-submit="topUp">
            <div class="field">
                <label class="field__label" for="topup-amount">Yükleme tutarı (₺)</label>
                <div class="quick-amounts" role="group" aria-label="Hızlı tutarlar">
                    ${QUICK_AMOUNTS.map((a) => `<button type="button" class="chip${ui.topUp.amount === a ? ' is-active' : ''}" data-action="quick" data-value="${a}">${money(a)}</button>`).join('')}
                </div>
                <input id="topup-amount" type="number" class="field__input${invalid(ui.topUpErrors, 'amount')}" min="1" step="any" data-bind="topUp.amount" data-type="number" value="${ui.topUp.amount ?? ''}" />
                ${validation(ui.topUpErrors, 'amount')}
            </div>
            <div class="segmented" role="radiogroup" aria-label="Ödeme yöntemi">
                ${['cash', 'card']
                  .map(
                    (m) =>
                      `<button type="button" role="radio" aria-checked="${ui.topUp.method === m}" class="segmented__option${ui.topUp.method === m ? ' is-selected' : ''}" data-action="topUpMethod" data-value="${m}">${D.payment(m)}</button>`,
                  )
                  .join('')}
            </div>
            <button type="submit" class="btn btn--volt btn--block"${amount <= 0 ? ' disabled' : ''}>${amount > 0 ? `${money(amount)} yükle` : 'Bakiye yükle'}</button>
        </form>`
      : '<p class="empty">Pasif hesaba bakiye yüklenemez.</p>';

    const adjust =
      staff.isAdmin && customer.isActive
        ? `<details class="drawer__section admin-only">
            <summary class="mono">Bakiye düzeltme (yönetici)</summary>
            <form class="form-grid" novalidate data-submit="adjust">
                <div class="field">
                    <label class="field__label" for="adjust-amount">Tutar (₺) · düşmek için eksi yaz</label>
                    <input id="adjust-amount" type="number" class="field__input${invalid(ui.adjustErrors, 'amount')}" step="any" data-bind="adjustment.amount" data-type="number" value="${ui.adjustment.amount ?? ''}" />
                    ${validation(ui.adjustErrors, 'amount')}
                </div>
                <div class="field">
                    <label class="field__label" for="adjust-note">Neden</label>
                    <input id="adjust-note" class="field__input${invalid(ui.adjustErrors, 'note')}" placeholder="örn. Yanlış yükleme iadesi" data-bind="adjustment.note" value="${esc(ui.adjustment.note)}" />
                    ${validation(ui.adjustErrors, 'note')}
                </div>
                <button type="submit" class="btn btn--sm btn--ghost">Düzeltmeyi kaydet</button>
            </form>
        </details>`
        : '';

    return `${pageHeader({
      eyebrow: `Müşteri #${customer.id}`,
      title: customer.fullName,
      backHref: '#/musteriler',
      backLabel: 'Müşteriler',
      description: `${D.phone(customer.phone)} · ${D.formatDate(customer.createdAt, 'd MMMM yyyy')} tarihinden beri kayıtlı`,
      actions: customer.isActive ? '' : '<span class="tag">Pasif</span>',
    })}

<div class="panel-grid">
    <section class="card balance-card">
        <p class="mono balance-card__label">Bakiye</p>
        <p class="balance-card__value">${money(customer.balance)}</p>
        ${topUp}
        ${adjust}
    </section>

    <section class="card">
        <header class="card__head"><h2 class="card__title">Bilgiler</h2></header>
        <form class="form-grid" novalidate data-submit="save">
            ${customerFields(ui.form, ui.errors, 'form')}
            <div class="form-actions">
                <button type="submit" class="btn btn--volt">Kaydet</button>
                ${
                  customer.isActive
                    ? confirmButton(ui, {
                        id: 'deactivate',
                        action: 'deactivate',
                        buttonClass: 'btn btn--ghost',
                        question: 'Hesap pasife alınsın mı?',
                        confirmText: 'Evet, pasife al',
                        content: 'Pasife al',
                      })
                    : '<button type="button" class="btn btn--ghost" data-action="activate">Yeniden etkinleştir</button>'
                }
            </div>
        </form>
    </section>
</div>

<section class="card">
    <header class="card__head">
        <h2 class="card__title">Bakiye hareketleri</h2>
        <p class="mono">Son ${ledger.length} kayıt</p>
    </header>
    ${
      ledger.length === 0
        ? '<p class="empty">Henüz hareket yok.</p>'
        : `<table class="table">
        <thead>
            <tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th class="num">Tutar</th><th class="num">Sonraki bakiye</th></tr>
        </thead>
        <tbody>${ledger
          .map(
            (t) => `<tr data-key="t-${t.id}">
                <td class="mono-cell">${D.formatDate(t.createdAt, 'd MMM HH:mm')}</td>
                <td><span class="tag${t.amount > 0 ? ' tag--in' : ''}">${D.transactionKind(t.kind)}</span></td>
                <td class="muted-cell">
                    ${t.method ? D.payment(t.method) : ''}${t.note ? `${t.method ? ' · ' : ''}${esc(t.note)}` : ''}
                    ${t.staff ? `<span class="table__sub">${esc(t.staff)}</span>` : ''}
                </td>
                <td class="num ${t.amount > 0 ? 'amount-in' : 'amount-out'}">${t.amount > 0 ? '+' : '−'}${money(Math.abs(t.amount))}</td>
                <td class="num">${money(t.balanceAfter)}</td>
            </tr>`,
          )
          .join('')}</tbody>
    </table>`
    }
</section>

<section class="card">
    <header class="card__head"><h2 class="card__title">Oturumlar</h2></header>
    ${
      history.length === 0
        ? '<p class="empty">Henüz oturum yok.</p>'
        : `<table class="table">
        <thead>
            <tr><th>Tarih</th><th>PC</th><th>Süre</th><th>Paket</th><th class="num">Ücret</th></tr>
        </thead>
        <tbody>${history
          .map(
            (g) => `<tr data-key="g-${g.id}">
                <td class="mono-cell">${D.formatDate(g.startedAt, 'd MMM HH:mm')}</td>
                <td>${esc(D.stationById(state, g.stationId)?.code ?? '—')}</td>
                <td>${g.endedAt != null ? D.playTime(Math.floor((g.endedAt - g.startedAt) / MINUTE)) : '<span class="tag tag--in">Devam ediyor</span>'}</td>
                <td class="muted-cell">${esc(g.packageName ?? '—')}</td>
                <td class="num">${g.charge != null ? money(g.charge) : '—'}</td>
            </tr>`,
          )
          .join('')}</tbody>
    </table>`
    }
</section>`;
  },
  actions: {
    quick({ ui }, el) {
      ui.topUp.amount = Number(el.dataset.value);
    },
    topUpMethod({ ui }, el) {
      ui.topUp.method = el.dataset.value;
    },
    topUp(ctx) {
      const { ui } = ctx;
      const id = Number(ctx.params[0]);
      const amount = ui.topUp.amount ?? 0;
      ui.topUpErrors =
        amount < 1 || amount > 100000 ? { amount: '1 ile 100.000 ₺ arasında olmalı.' } : {};
      if (ui.topUpErrors.amount) return;
      const method = D.payment(ui.topUp.method).toLocaleLowerCase('tr');
      if (
        ctx.run(
          (state) => {
            const customer = D.customerById(state, id);
            if (!customer?.isActive) return D.fail('Müşteri bulunamadı ya da hesabı pasif.');
            D.addLedgerEntry(state, customer, 'topup', D.round2(amount), Date.now(), {
              method: ui.topUp.method,
            });
            return D.ok();
          },
          `${money(amount)} yüklendi (${method}).`,
        )
      ) {
        ui.topUp = { amount: null, method: 'cash' };
      }
    },
    adjust(ctx) {
      const { ui } = ctx;
      const id = Number(ctx.params[0]);
      const amount = ui.adjustment.amount ?? 0;
      ui.adjustErrors = {};
      if (amount < -100000 || amount > 100000)
        ui.adjustErrors.amount = '-100.000 ile 100.000 ₺ arasında olmalı.';
      if (!ui.adjustment.note.trim())
        ui.adjustErrors.note = 'Düzeltmenin nedenini yaz; defterde görünecek.';
      if (Object.keys(ui.adjustErrors).length) return;
      if (amount === 0) {
        ctx.toast('Düzeltme tutarı 0 olamaz.', true);
        return;
      }
      if (
        ctx.run((state) => {
          const customer = D.customerById(state, id);
          if (!customer?.isActive) return D.fail('Müşteri bulunamadı ya da hesabı pasif.');
          if (customer.balance + amount < 0) {
            return D.fail(
              `Bakiye eksiye düşemez; en fazla ${String(customer.balance).replace('.', ',')} ₺ düşülebilir.`,
            );
          }
          D.addLedgerEntry(state, customer, 'adjustment', D.round2(amount), Date.now(), {
            note: ui.adjustment.note.trim(),
          });
          return D.ok();
        }, 'Düzeltme kaydedildi.')
      ) {
        ui.adjustment = { amount: null, note: '' };
      }
    },
    save(ctx) {
      const { ui } = ctx;
      const id = Number(ctx.params[0]);
      ui.errors = validateCustomer(ui.form);
      if (Object.keys(ui.errors).length) return;
      ctx.run((state) => {
        const phone = D.normalizePhone(ui.form.phone);
        if (!phone) return D.fail('Geçerli bir telefon numarası gir.');
        const customer = D.customerById(state, id);
        if (!customer) return D.fail('Müşteri bulunamadı.');
        const owner = state.customers.find((c) => c.id !== id && c.phone === phone);
        if (owner) return D.fail(`Bu numara zaten ${owner.fullName} adına kayıtlı.`);
        customer.fullName = ui.form.fullName.trim();
        customer.phone = phone;
        customer.note = ui.form.note?.trim() ? ui.form.note.trim() : null;
        return D.ok();
      }, 'Müşteri bilgileri kaydedildi.');
      const customer = D.customerById(D.getState(), id);
      if (customer) ui.form = customerForm(customer);
    },
    deactivate(ctx) {
      const id = Number(ctx.params[0]);
      ctx.run((state) => {
        if (state.sessions.some((g) => g.customerId === id && g.endedAt == null))
          return D.fail('Müşterinin açık oturumu var; önce oturumu bitir.');
        const customer = D.customerById(state, id);
        if (!customer) return D.fail('Müşteri bulunamadı.');
        customer.isActive = false;
        return D.ok();
      }, 'Hesap pasife alındı.');
    },
    activate(ctx) {
      const id = Number(ctx.params[0]);
      ctx.run((state) => {
        const customer = D.customerById(state, id);
        if (!customer) return D.fail('Müşteri bulunamadı.');
        customer.isActive = true;
        return D.ok();
      }, 'Hesap yeniden etkin.');
    },
  },
};

// ===========================================================================
// Rezervasyonlar

const PHASE_TAG = {
  pending: 'tag--warn',
  confirmed: 'tag--in',
  due: 'tag--in',
  late: 'tag--danger',
  noshow: 'tag--danger',
};
const HANDLED_VERB = { confirmed: 'Onaylayan', cancelled: 'İptal eden', noshow: 'İşaretleyen' };
const DURATION_CHOICES = Array.from({ length: 48 }, (_, i) => (i + 1) * 15);
const EMPTY_TEXT = {
  pending: 'Onay bekleyen talep yok. Siteden yeni talep gelince burada ve bildirimle görünür.',
  today: 'Bugün için rezervasyon yok.',
  upcoming: 'Yaklaşan onaylı rezervasyon yok.',
  late: 'Geciken rezervasyon yok.',
  past: 'Henüz geçmiş rezervasyon yok.',
};

function board(state, view, query, now) {
  const policy = D.reservationPolicy(state);
  const cutoff = policy.liveCutoff(now);
  const todayStart = D.startOfDay(now).getTime();
  const todayEnd = D.addDays(D.startOfDay(now), 1).getTime();
  const all = state.reservations;
  const pending = all.filter((r) => r.status === 'pending' && r.startsAt > cutoff);
  const today = all.filter((r) => r.startsAt >= todayStart && r.startsAt < todayEnd);
  const upcoming = all.filter((r) => r.status === 'confirmed' && r.startsAt > cutoff);
  const late = all.filter((r) => r.status === 'confirmed' && r.startsAt <= cutoff);
  const asc = (a, b) => a.startsAt - b.startsAt;
  const desc = (a, b) => b.startsAt - a.startsAt;

  let rows;
  const q = (query ?? '').trim();
  if (q) {
    // Kod yalnızca harf ya da yalnızca rakam da olabilir; her aramada ayrıca kodla eşleşme denenir.
    const code = D.normalizeCode(q) ?? '';
    const digits = !/\p{L}/u.test(q) ? D.searchDigits(q) : null;
    rows = digits
      ? all.filter((r) => r.phone.includes(digits.replace(/^0+/, '')) || r.code === code)
      : all.filter((r) => D.fold(r.customerName).includes(D.fold(q)) || r.code === code);
    rows = [...rows].sort(desc);
  } else {
    rows = {
      pending: () => [...pending].sort(asc),
      today: () => [...today].sort(asc),
      upcoming: () => [...upcoming].sort(asc),
      late: () => [...late].sort(desc),
      past: () =>
        all
          .filter(
            (r) =>
              r.status === 'cancelled' ||
              r.status === 'completed' ||
              r.status === 'noshow' ||
              (r.status === 'pending' && r.startsAt <= cutoff),
          )
          .sort(desc),
    }[view]();
  }

  return {
    rows: rows.slice(0, 200).map((r) => {
      const station = r.stationId ? D.stationById(state, r.stationId) : null;
      const customer = r.customerId ? D.customerById(state, r.customerId) : null;
      return {
        ...r,
        endsAt: D.reservationEnd(r),
        tierName: D.tierById(state, r.tierId)?.name ?? '—',
        stationCode: station?.code ?? null,
        customerFullName: customer?.fullName ?? null,
        sessionId: state.sessions.find((g) => g.reservationId === r.id)?.id ?? null,
      };
    }),
    counts: {
      pending: pending.length,
      today: today.filter((r) => r.status !== 'cancelled').length,
      upcoming: upcoming.length,
      late: late.length,
    },
    policy,
  };
}

/** Onay çekmecesindeki PC listesi: sınıftaki hizmette olan PC'ler ve aynı saatlerde başka onaylı rezervasyonu olanlar. */
function stationChoices(state, reservationId, now) {
  const reservation = state.reservations.find((r) => r.id === reservationId);
  if (!reservation) return [];
  const policy = D.reservationPolicy(state);
  const end = D.reservationEnd(reservation);
  const others = state.reservations.filter(
    (r) =>
      r.id !== reservation.id &&
      r.status === 'confirmed' &&
      r.stationId != null &&
      r.tierId === reservation.tierId &&
      r.startsAt > policy.liveCutoff(now) &&
      D.overlaps(reservation.startsAt, end, r.startsAt, D.reservationEnd(r)),
  );
  return state.stations
    .filter((s) => s.tierId === reservation.tierId && !s.isOutOfService)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map((s) => {
      const conflict = others.find((r) => r.stationId === s.id);
      return {
        id: s.id,
        code: s.code,
        isBusyNow: Boolean(D.openSessionOf(state, s.id)),
        conflict: conflict
          ? `${D.hhmm(conflict.startsAt)}–${D.hhmm(D.reservationEnd(conflict))} ${D.firstName(conflict.customerName)} için ayrıldı`
          : null,
      };
    });
}

function confirmReservation(state, id, stationId, now) {
  const reservation = state.reservations.find((r) => r.id === id);
  if (!reservation) return D.fail('Rezervasyon bulunamadı.');
  if (reservation.status !== 'pending' && reservation.status !== 'confirmed')
    return D.fail('Bu rezervasyon kapanmış; onaylanamaz.');
  const policy = D.reservationPolicy(state);
  if (!policy.isLive(reservation.status, reservation.startsAt, now))
    return D.fail('Rezervasyonun saati geçti; onaylanamaz.');
  const station = D.stationById(state, stationId);
  if (!station || station.tierId !== reservation.tierId)
    return D.fail('Rezervasyonun sınıfından bir PC seç.');
  if (station.isOutOfService) return D.fail(`${station.code} hizmet dışı.`);
  const end = D.reservationEnd(reservation);
  const clash = state.reservations.find(
    (r) =>
      r.id !== reservation.id &&
      r.status === 'confirmed' &&
      r.stationId === stationId &&
      r.startsAt > policy.liveCutoff(now) &&
      D.overlaps(reservation.startsAt, end, r.startsAt, D.reservationEnd(r)),
  );
  if (clash)
    return D.fail(
      `${station.code} aynı saatlerde ${clash.customerName} için ayrılmış. Başka bir PC seç.`,
    );
  reservation.status = 'confirmed';
  reservation.stationId = station.id;
  // Talep geldiğinde müşteri kayıtlı değildiyse, onaya kadar kaydedilmiş olabilir.
  reservation.customerId ??=
    state.customers.find((c) => c.phone === reservation.phone && c.isActive)?.id ?? null;
  reservation.handledBy = D.STAFF_NAME;
  reservation.handledAt = now;
  return D.ok();
}

function openConfirm(ui, state, row, now) {
  const choices = stationChoices(state, row.id, now);
  const usable = choices.filter((c) => !c.conflict);
  ui.confirming = row.id;
  ui.selectedStationId =
    usable.find((c) => c.id === row.stationId)?.id ??
    usable.find((c) => !c.isBusyNow)?.id ??
    usable[0]?.id ??
    null;
}

function validateSettings(s) {
  const errors = {};
  if (!(s.bookingDays >= 1 && s.bookingDays <= 30))
    errors.bookingDays = '1 ile 30 gün arasında olmalı.';
  if (!(s.leadMinutes >= 0 && s.leadMinutes <= 240))
    errors.leadMinutes = '0 ile 240 dakika arasında olmalı.';
  if (!(s.noShowMinutes >= 5 && s.noShowMinutes <= 60))
    errors.noShowMinutes = '5 ile 60 dakika arasında olmalı.';
  if (!(s.maxPending >= 1 && s.maxPending <= 5)) errors.maxPending = '1 ile 5 arasında olmalı.';
  if (s.minMinutes < s.slotMinutes || s.minMinutes > 720 || s.minMinutes % s.slotMinutes !== 0) {
    errors.minMinutes = `En kısa süre dilimin (${s.slotMinutes} dk) katı ve en fazla 12 saat olmalı.`;
  }
  if (s.maxMinutes < s.minMinutes || s.maxMinutes > 720 || s.maxMinutes % s.slotMinutes !== 0) {
    errors.maxMinutes =
      'En uzun süre, en kısa süreden az ve 12 saatten fazla olamaz; dilimin katı olmalı.';
  }
  return errors;
}

export const reservations = {
  title: () => 'Rezervasyonlar · Panel',
  tick: 30000,
  enter({ state, now }) {
    // Bekleyen talep yoksa bugünün listesiyle aç.
    const view = board(state, 'pending', '', now).counts.pending === 0 ? 'today' : 'pending';
    return {
      view,
      query: '',
      confirming: null,
      selectedStationId: null,
      createForm: null,
      createErrors: {},
      settings: null,
      settingsErrors: {},
    };
  },
  onExternalChange(ctx) {
    const { ui, state, now } = ctx;
    const pending = board(state, 'pending', '', now).counts.pending;
    if (ui.lastPending != null && pending > ui.lastPending)
      ctx.toast('Yeni rezervasyon talebi geldi.');
    ui.lastPending = pending;
  },
  view(ctx) {
    const { state, now, ui, staff } = ctx;
    const b = board(state, ui.view, ui.query, now);
    ui.lastPending = b.counts.pending;
    const isView = (v) => !ui.query.trim() && ui.view === v;
    const chip = (v, label, count, extra = '') =>
      `<button type="button" class="chip${extra}${isView(v) ? ' is-active' : ''}" data-action="view" data-value="${v}">${label}${count != null ? ` <b>${count}</b>` : ''}</button>`;
    const dayName = (day) => {
      const key = D.dayKey(day);
      if (key === D.dayKey(now)) return 'Bugün';
      if (key === D.dayKey(D.addDays(now, 1))) return 'Yarın';
      if (key === D.dayKey(D.addDays(now, -1))) return 'Dün';
      return D.formatDate(day, 'd MMM');
    };

    const groups = [];
    for (const row of b.rows) {
      const key = D.dayKey(row.startsAt);
      let group = groups.at(-1);
      if (!group || group.key !== key)
        groups.push((group = { key, day: D.startOfDay(row.startsAt), rows: [] }));
      group.rows.push(row);
    }

    const phaseLabel = (phase, row) => {
      switch (phase) {
        case 'pending':
          return 'Onay bekliyor';
        case 'unanswered':
          return 'Yanıtlanmadı';
        case 'confirmed':
          return 'Onaylı';
        case 'due':
          return now < row.startsAt
            ? `PC tutuluyor · ${Math.ceil((row.startsAt - now) / MINUTE)} dk`
            : `Bekleniyor · ${Math.floor((now - row.startsAt) / MINUTE)} dk gecikti`;
        case 'late':
          return 'Gecikti';
        case 'completed':
          return row.sessionId ? 'Geldi · oturum açıldı' : 'Tamamlandı';
        case 'noshow':
          return 'Gelmedi';
        default:
          return 'İptal';
      }
    };

    const actionsFor = (phase, row) => {
      const id = row.id;
      switch (phase) {
        case 'pending':
          return `<button type="button" class="btn btn--sm btn--volt" data-action="openConfirm" data-id="${id}">${icon('check')}Onayla</button>
            ${confirmButton(ui, { id: `cancel-${id}`, action: 'cancel', data: { id }, buttonClass: 'btn btn--sm btn--danger-ghost', question: 'İptal edilsin mi?', confirmText: 'Evet, iptal et', content: 'İptal' })}`;
        case 'confirmed':
        case 'due':
        case 'late':
          return `${row.stationId ? `<a class="btn btn--sm ${phase === 'late' ? 'btn--ghost' : 'btn--volt'}" href="#/pc?pc=${row.stationId}">${icon('monitor')}Oturumu başlat</a>` : ''}
            ${
              phase === 'late'
                ? `<button type="button" class="btn btn--sm btn--volt" data-action="noShow" data-id="${id}">Gelmedi</button>`
                : `<button type="button" class="btn btn--sm btn--ghost" data-action="openConfirm" data-id="${id}">PC değiştir</button>`
            }
            <details class="res-more">
                <summary class="icon-button icon-button--sm" aria-label="Diğer işlemler" title="Diğer işlemler">${icon('dots')}</summary>
                <div class="res-more__menu">
                    ${phase !== 'late' && now >= row.startsAt ? `<button type="button" class="text-button" data-action="noShow" data-id="${id}">Gelmedi işaretle</button>` : ''}
                    <button type="button" class="text-button" data-action="complete" data-id="${id}">Geldi, tamamlandı</button>
                    ${confirmButton(ui, { id: `cancel-${id}`, action: 'cancel', data: { id }, buttonClass: 'text-button text-button--danger', question: 'İptal edilsin mi?', confirmText: 'Evet, iptal et', content: 'İptal et' })}
                </div>
            </details>`;
        case 'unanswered':
          return confirmButton(ui, {
            id: `cancel-${id}`,
            action: 'cancel',
            data: { id },
            buttonClass: 'btn btn--sm btn--ghost',
            question: 'Kapatılsın mı?',
            confirmText: 'Evet, iptal et',
            content: 'Kapat',
          });
        default:
          return '';
      }
    };

    const list =
      b.rows.length === 0
        ? `<section class="card"><p class="empty">${ui.query.trim() ? 'Aramaya uyan rezervasyon yok.' : EMPTY_TEXT[ui.view]}</p></section>`
        : groups
            .map(
              (group) => `<section class="res-day" data-key="d-${group.key}">
    <h2 class="res-day__title"><span>${dayName(group.day)}</span><span class="mono">${D.formatDate(group.day, 'd MMMM dddd')}</span></h2>
    ${group.rows
      .map((row) => {
        const phase = b.policy.phaseOf(row.status, row.startsAt, now);
        return `<article class="res-row res-row--${phase}" data-key="r-${row.id}">
        <div class="res-row__time">
            <p class="res-row__clock">${D.hhmm(row.startsAt)}</p>
            <p class="mono">→ ${D.hhmm(row.endsAt)} · ${duration(row.durationMinutes)}</p>
        </div>
        <div class="res-row__who">
            <p class="res-row__name">
                ${esc(row.customerName)}
                ${row.customerId ? `<a class="tag tag--in" href="#/musteriler/${row.customerId}" title="${esc(row.customerFullName ?? '')}">Kayıtlı müşteri</a>` : ''}
            </p>
            <p class="res-row__meta mono">
                <a href="tel:${row.phone}">${D.phone(row.phone)}</a>
                <span aria-hidden="true">·</span>
                <span lang="en">#${row.code}</span>
            </p>
            ${row.note ? `<p class="res-row__note">“${esc(row.note)}”</p>` : ''}
        </div>
        <div class="res-row__place">
            <p class="res-row__tier">${esc(row.tierName)}</p>
            <p class="res-row__pc">${esc(row.stationCode ?? 'PC atanmadı')}</p>
        </div>
        <div class="res-row__status">
            <span class="tag ${PHASE_TAG[phase] ?? ''}">${phaseLabel(phase, row)}</span>
            ${
              row.handledBy && row.handledAt
                ? `<span class="table__sub">${HANDLED_VERB[row.status] ?? 'Kapatan'} ${esc(row.handledBy)} · ${D.formatDate(row.handledAt, 'd MMM HH:mm')}</span>`
                : `<span class="table__sub">Talep ${D.formatDate(row.createdAt, 'd MMM HH:mm')}</span>`
            }
        </div>
        <div class="res-row__actions">${actionsFor(phase, row)}</div>
    </article>`;
      })
      .join('')}
</section>`,
            )
            .join('');

    return `${pageHeader({
      eyebrow: 'Rezervasyon',
      title: 'Rezervasyonlar',
      description: `Siteden gelen talepleri onayla ve PC ata. Onaylı rezervasyonun PC'si başlangıçtan ${D.HOLD_BEFORE_MINUTES} dk önce haritada rezerve görünür; müşteri ${b.policy.noShow} dk içinde gelmezse PC serbest kalır.`,
      actions: `${staff.isAdmin ? `<button type="button" class="btn btn--ghost" data-action="openSettings">${icon('pencil')}Kurallar</button>` : ''}
        <button type="button" class="btn btn--volt" data-action="openCreate">${icon('plus')}Yeni rezervasyon</button>`,
    })}
<div class="map-toolbar">
    <div class="chips" role="group" aria-label="Görünüm">
        ${chip('pending', 'Bekleyen', b.counts.pending)}
        ${chip('today', 'Bugün', b.counts.today)}
        ${chip('upcoming', 'Yaklaşan', b.counts.upcoming)}
        ${b.counts.late > 0 || ui.view === 'late' ? chip('late', 'Gecikti', b.counts.late, ' chip--warn') : ''}
        ${chip('past', 'Geçmiş', null)}
    </div>
    <div class="res-search">
        <label class="sr-only" for="reservation-search">Rezervasyon ara</label>
        <input id="reservation-search" class="field__input field__input--sm" placeholder="Ad, telefon ya da kod…" autocomplete="off" data-bind="query" value="${esc(ui.query)}" />
        <p class="live mono"><span class="pulse" aria-hidden="true"></span>Canlı</p>
    </div>
</div>
${list}`;
  },
  drawer(ctx) {
    const { state, now, ui } = ctx;
    if (ui.confirming != null) return confirmDrawer(state, ui, now);
    if (ui.createForm) return createDrawer(state, ui, now);
    if (ui.settings) return settingsDrawer(ui);
    return null;
  },
  closeDrawer({ ui }) {
    ui.confirming = null;
    ui.createForm = null;
    ui.settings = null;
  },
  actions: {
    view({ ui }, el) {
      ui.view = el.dataset.value;
      ui.query = '';
    },
    openConfirm({ ui, state, now }, el) {
      const row = state.reservations.find((r) => r.id === Number(el.dataset.id));
      if (row) openConfirm(ui, state, row, now);
    },
    pickStation({ ui }, el) {
      ui.selectedStationId = Number(el.dataset.id);
    },
    confirm(ctx) {
      const { ui, state } = ctx;
      const row = state.reservations.find((r) => r.id === ui.confirming);
      const code = D.stationById(state, ui.selectedStationId)?.code;
      if (
        ctx.run(
          (s) => confirmReservation(s, ui.confirming, ui.selectedStationId, Date.now()),
          `${row.customerName} · ${code} ayrıldı.`,
        )
      ) {
        ui.confirming = null;
      }
    },
    cancel(ctx, el) {
      ctx.run(
        (s) => cancelReservation(s, Number(el.dataset.id), Date.now()),
        'Rezervasyon iptal edildi.',
      );
    },
    noShow(ctx, el) {
      const row = ctx.state.reservations.find((r) => r.id === Number(el.dataset.id));
      ctx.run(
        (s) => markNoShow(s, row.id, Date.now()),
        `${row.customerName} gelmedi olarak işaretlendi.`,
      );
    },
    complete(ctx, el) {
      ctx.run(
        (s) => markCompleted(s, Number(el.dataset.id), Date.now()),
        'Rezervasyon tamamlandı.',
      );
    },
    openCreate({ ui, state, now }) {
      const options = D.bookingOptions(state, now);
      const policy = options.policy;
      // Varsayılan: içinde bulunulan dilimden sonraki ilk başlangıç (19:10 → 19:30), 2 saat.
      const slot = policy.slot * MINUTE;
      const next = new Date(Math.ceil(now / slot) * slot);
      let day = D.dayKey(next);
      if (!options.days.some((d) => D.dayKey(d) === day)) day = D.dayKey(options.days[0]);
      ui.createForm = {
        tierId: options.tiers[0]?.id ?? 0,
        date: day,
        time: D.hhmm(next),
        durationMinutes: policy.durations().includes(120) ? 120 : policy.min,
        fullName: '',
        phone: '',
        note: '',
      };
      ui.createErrors = {};
    },
    create(ctx) {
      const { ui } = ctx;
      const form = ui.createForm;
      const errors = D.validateReservationInput(form);
      // Personel formunda ad için yalnızca zorunluluk ve uzunluk; site formuyla aynı kurallar.
      ui.createErrors = errors;
      if (Object.keys(errors).length) return;
      const receipt = ctx.run((s) =>
        D.createReservation(s, form, { byStaff: true, now: Date.now() }),
      );
      if (!receipt) return;
      ui.createForm = null;
      ctx.toast(`Talep kaydedildi · ${receipt.code}`);
      // Hemen PC ata: yeni talebin onay çekmecesini aç.
      const state = D.getState();
      const row = state.reservations.find((r) => r.id === receipt.id);
      if (row) openConfirm(ui, state, row, Date.now());
    },
    openSettings({ ui, state }) {
      const p = D.reservationPolicy(state);
      ui.settings = {
        slotMinutes: p.slot,
        bookingDays: p.days,
        minMinutes: p.min,
        maxMinutes: p.max,
        leadMinutes: p.lead,
        noShowMinutes: p.noShow,
        maxPending: p.maxPending,
      };
      ui.settingsErrors = {};
    },
    saveSettings(ctx) {
      const { ui } = ctx;
      const s = ui.settings;
      ui.settingsErrors = validateSettings(s);
      if (Object.keys(ui.settingsErrors).length) {
        return;
      }
      if (
        ctx.run((state) => {
          Object.assign(state.operation, {
            resSlotMinutes: s.slotMinutes,
            resMinMinutes: s.minMinutes,
            resMaxMinutes: s.maxMinutes,
            resBookingDays: s.bookingDays,
            resLeadMinutes: s.leadMinutes,
            resNoShowMinutes: s.noShowMinutes,
            resMaxPendingPerPhone: s.maxPending,
          });
          return D.ok();
        }, 'Rezervasyon kuralları kaydedildi.')
      ) {
        ui.settings = null;
      }
    },
  },
};

function confirmDrawer(state, ui, now) {
  const r = state.reservations.find((x) => x.id === ui.confirming);
  if (!r) {
    ui.confirming = null;
    return null;
  }
  const tier = D.tierById(state, r.tierId);
  const choices = stationChoices(state, r.id, now);
  const body =
    choices.length === 0
      ? '<p class="empty">Bu sınıfta hizmette PC yok. Önce PC haritasından bir PC\'yi hizmete al.</p>'
      : `<div class="form-grid">
        ${r.note ? `<p class="res-drawer__note">“${esc(r.note)}”</p>` : ''}
        <div class="field">
            <p class="field__label">PC seç</p>
            <div class="options options--grid" role="radiogroup" aria-label="PC">
                ${choices
                  .map((c) => {
                    const selected = ui.selectedStationId === c.id;
                    return `<button type="button" role="radio" aria-checked="${selected}"${c.conflict ? ' disabled' : ''} class="option${selected ? ' is-selected' : ''}" data-action="pickStation" data-id="${c.id}">
                    <span class="option__name">${esc(c.code)}</span>
                    <span class="option__meta mono">${esc(c.conflict ?? (c.isBusyNow ? 'Şu an dolu' : 'Boş'))}</span>
                </button>`;
                  })
                  .join('')}
            </div>
            <p class="field__hint">Aynı saatlerde başka bir onaylı rezervasyonu olan PC seçilemez. Şu an dolu PC seçilebilir; başlangıca kadar boşalmalı.</p>
        </div>
        <div class="form-actions res-drawer__actions">
            <button type="button" class="btn btn--volt" data-action="confirm"${ui.selectedStationId == null ? ' disabled' : ''}>${r.status === 'confirmed' ? "PC'yi değiştir" : 'Onayla'}</button>
            <button type="button" class="btn btn--ghost" data-action="drawer:close">Vazgeç</button>
        </div>
    </div>`;
  return {
    title: r.status === 'confirmed' ? 'PC değiştir' : 'Onayla ve PC ata',
    description: `${r.customerName} · ${D.formatDate(r.startsAt, 'd MMMM dddd HH:mm')}–${D.hhmm(D.reservationEnd(r))} · ${tier?.name ?? ''}`,
    body,
  };
}

function createDrawer(state, ui, now) {
  const options = D.bookingOptions(state, now);
  const form = ui.createForm;
  const e = ui.createErrors;
  const policy = options.policy;
  const dayName = (day) => {
    const key = D.dayKey(day);
    if (key === D.dayKey(now)) return 'Bugün';
    if (key === D.dayKey(D.addDays(now, 1))) return 'Yarın';
    return D.formatDate(day, 'd MMM');
  };
  const body =
    options.tiers.length === 0
      ? '<p class="empty">Rezervasyona açık sınıf yok: sitede görünen ve hizmette PC\'si olan bir sınıf gerekli.</p>'
      : `<form class="form-grid" novalidate data-submit="create">
        <div class="field">
            <label class="field__label" for="new-tier">Sistem sınıfı</label>
            <select id="new-tier" class="field__input" data-bind="createForm.tierId" data-type="int">
                ${options.tiers.map((t) => `<option value="${t.id}"${t.id === form.tierId ? ' selected' : ''}>${esc(t.name)} · ${t.capacity} PC</option>`).join('')}
            </select>
        </div>
        <div class="field-pair">
            <div class="field">
                <label class="field__label" for="new-date">Gün</label>
                <select id="new-date" class="field__input" data-bind="createForm.date">
                    ${options.days.map((d) => `<option value="${D.dayKey(d)}"${D.dayKey(d) === form.date ? ' selected' : ''}>${dayName(d)} · ${D.formatDate(d, 'd MMMM ddd')}</option>`).join('')}
                </select>
                ${validation(e, 'date')}
            </div>
            <div class="field">
                <label class="field__label" for="new-time">Başlangıç</label>
                <select id="new-time" class="field__input field__input--mono" data-bind="createForm.time">
                    ${policy
                      .startTimes()
                      .map(
                        (t) =>
                          `<option value="${t}"${t === form.time ? ' selected' : ''}>${t}</option>`,
                      )
                      .join('')}
                </select>
                ${validation(e, 'time')}
            </div>
        </div>
        <div class="field">
            <label class="field__label" for="new-duration">Süre</label>
            <select id="new-duration" class="field__input" data-bind="createForm.durationMinutes" data-type="int">
                ${policy
                  .durations()
                  .map(
                    (m) =>
                      `<option value="${m}"${m === form.durationMinutes ? ' selected' : ''}>${duration(m)}</option>`,
                  )
                  .join('')}
            </select>
        </div>
        <div class="field-pair">
            <div class="field">
                <label class="field__label" for="new-name">Ad soyad</label>
                <input id="new-name" class="field__input${invalid(e, 'fullName')}" autocomplete="off" data-bind="createForm.fullName" value="${esc(form.fullName)}" />
                ${validation(e, 'fullName')}
            </div>
            <div class="field">
                <label class="field__label" for="new-phone">Telefon</label>
                <input id="new-phone" class="field__input${invalid(e, 'phone')}" inputmode="tel" autocomplete="off" placeholder="0532 123 45 67" data-bind="createForm.phone" value="${esc(form.phone)}" />
                ${validation(e, 'phone')}
            </div>
        </div>
        <div class="field">
            <label class="field__label" for="new-note">Not</label>
            <textarea id="new-note" class="field__input field__input--area${invalid(e, 'note')}" maxlength="300" data-bind="createForm.note">${esc(form.note)}</textarea>
            ${validation(e, 'note')}
        </div>
        <p class="field__hint">Personelin girdiği taleplerde ön süre ve telefon başına talep sınırı uygulanmaz; sınıftaki PC sayısı yine denetlenir.</p>
        <div class="form-actions">
            <button type="submit" class="btn btn--volt">Kaydet ve PC ata</button>
            <button type="button" class="btn btn--ghost" data-action="drawer:close">Vazgeç</button>
        </div>
    </form>`;
  return {
    title: 'Yeni rezervasyon',
    description:
      'Telefonla ya da kasada gelen talep. Kaydedince PC atama ekranı açılır; telefon kayıtlı bir müşteriyle eşleşirse bağlanır.',
    body,
  };
}

function settingsDrawer(ui) {
  const s = ui.settings;
  const e = ui.settingsErrors;
  const select = (id, key, values, label) =>
    `<select id="${id}" class="field__input" data-bind="settings.${key}" data-type="int">${values
      .map((v) => `<option value="${v}"${v === s[key] ? ' selected' : ''}>${label(v)}</option>`)
      .join('')}</select>`;
  const number = (id, key, min, max) =>
    `<input id="${id}" type="number" class="field__input${invalid(e, key)}" min="${min}" max="${max}" data-bind="settings.${key}" data-type="int" value="${s[key] ?? ''}" />`;
  return {
    title: 'Rezervasyon kuralları',
    description: 'Yeni kurallar yeni taleplere uygulanır; alınmış rezervasyonlar değişmez.',
    body: `<form class="form-grid" novalidate data-submit="saveSettings">
        <div class="field-pair">
            <div class="field">
                <label class="field__label" for="res-slot">Saat dilimi</label>
                ${select('res-slot', 'slotMinutes', [15, 30, 60], (v) => `${v} dakikada bir`)}
            </div>
            <div class="field">
                <label class="field__label" for="res-days">Takvim (gün)</label>
                ${number('res-days', 'bookingDays', 1, 30)}
                ${validation(e, 'bookingDays')}
            </div>
        </div>
        <div class="field-pair">
            <div class="field">
                <label class="field__label" for="res-min">En kısa süre</label>
                ${select('res-min', 'minMinutes', DURATION_CHOICES, duration)}
                ${validation(e, 'minMinutes')}
            </div>
            <div class="field">
                <label class="field__label" for="res-max">En uzun süre</label>
                ${select('res-max', 'maxMinutes', DURATION_CHOICES, duration)}
                ${validation(e, 'maxMinutes')}
            </div>
        </div>
        <div class="field-pair">
            <div class="field">
                <label class="field__label" for="res-lead">En erken (dk sonrası)</label>
                ${number('res-lead', 'leadMinutes', 0, 240)}
                ${validation(e, 'leadMinutes')}
            </div>
            <div class="field">
                <label class="field__label" for="res-noshow">Gelmezse bekleme (dk)</label>
                ${number('res-noshow', 'noShowMinutes', 5, 60)}
                ${validation(e, 'noShowMinutes')}
            </div>
        </div>
        <div class="field">
            <label class="field__label" for="res-pending">Telefon başına bekleyen talep</label>
            ${number('res-pending', 'maxPending', 1, 5)}
            ${validation(e, 'maxPending')}
            <p class="field__hint">Aynı numarayla aynı anda en fazla bu kadar onay bekleyen talep gönderilebilir.</p>
        </div>
        <div class="form-actions">
            <button type="submit" class="btn btn--volt">Kaydet</button>
            <button type="button" class="btn btn--ghost" data-action="drawer:close">Vazgeç</button>
        </div>
    </form>`,
  };
}
