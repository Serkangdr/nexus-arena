// Nexus Arena demo · ortak veri katmanı
//
// Asıl uygulama ASP.NET Core + SQLite ile sunucuda çalışır. Bu statik demo aynı kuralları
// (ücret hesabı, rezervasyon politikası, bakiye defteri) tarayıcıda uygular. Veriler
// localStorage'da tutulur: ziyaretçi sitesi ve admin paneli aynı veriyi paylaşır, açık
// sekmeler birbirinin değişikliğini anında görür. Demo verisi birkaç saatte bir tazelenir.

const STORAGE_KEY = 'nexus-arena:demo';
const VERSION = 1;
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export const HOLD_BEFORE_MINUTES = 30;
export const MAP_HORIZON_MINUTES = 12 * 60;
export const STAFF_NAME = 'Yönetici';

// ===========================================================================
// Depolama

let memory = null;
const listeners = new Set();

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.version === VERSION ? data : null;
  } catch {
    return null;
  }
}

function write(state) {
  memory = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Gizli sekme ya da kota: veri yalnızca bu sayfa açıkken yaşar.
  }
}

/** Güncel veri. Hiç yoksa ya da eskidiyse demo verisi yeniden üretilir. */
export function getState() {
  const stored = read() ?? memory;
  if (stored && Date.now() - stored.seededAt < MAX_AGE_MS) {
    memory = stored;
    return stored;
  }
  const fresh = seed(Date.now());
  write(fresh);
  return fresh;
}

/**
 * Veriyi değiştirir. İşlev { ok: false, error } dönerse hiçbir şey kaydedilmez.
 * Başka bir sekme az önce yazmış olabileceği için her işlem en güncel veri üzerinde çalışır.
 */
export function commit(mutate) {
  const state = structuredClone(getState());
  const result = mutate(state) ?? { ok: true };
  if (result.ok === false) return result;
  write(state);
  listeners.forEach((listener) => listener(state, { local: true }));
  return result;
}

export function resetDemo() {
  const fresh = seed(Date.now());
  write(fresh);
  listeners.forEach((listener) => listener(fresh, { local: true }));
}

/** Bu sekmede ya da başka bir sekmede veri değişince çağrılır. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  memory = null;
  const state = getState();
  listeners.forEach((listener) => listener(state, { local: false }));
});

/** HTML'e yazılacak metni kaçırır (Razor'ın @ ifadesi gibi). */
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );

export const ok = (value) => ({ ok: true, value });
export const fail = (error, extra) => ({ ok: false, error, ...extra });

function nextId(state, table) {
  state.ids[table] = (state.ids[table] ?? 0) + 1;
  return state.ids[table];
}

export const byOrder = (a, b) => a.sortOrder - b.sortOrder || a.id - b.id;

// ===========================================================================
// Biçimler (panelde ve sitede para, süre, telefon, tarih)

const money0 = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const money2 = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const round2 = (value) =>
  (Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-9)) / 100;

/** "₺120" ya da kuruşlu ise "₺120,50". */
export const money = (amount) =>
  Number.isInteger(round2(amount)) ? money0.format(amount) : money2.format(amount);

/** "3 saat", "45 dk", "1 sa 30 dk". */
export function duration(minutes) {
  if (minutes == null || minutes <= 0) return 'Süresiz';
  if (minutes < 60) return `${minutes} dk`;
  if (minutes % 60 === 0) return `${minutes / 60} saat`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}

/** Oynanan süre: "1 sa 5 dk"; bir dakikadan kısa oturumlarda "1 dk'dan kısa". */
export const playTime = (minutes) => (minutes <= 0 ? "1 dk'dan kısa" : duration(minutes));

/** Kronometre biçimi: "1:05:09". */
export function elapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const payment = (method) =>
  ({ cash: 'Nakit', card: 'Kart', online: 'Online' })[method] ?? '—';

export const transactionKind = (kind) =>
  ({ topup: 'Yükleme', session: 'Oturum', refund: 'İade', adjustment: 'Düzeltme' })[kind] ?? kind;

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];
const MONTHS_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const DAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const pad = (n) => String(n).padStart(2, '0');

/** .NET biçim dizgeleriyle aynı: "d MMMM dddd" → "30 Ekim Perşembe". */
export function formatDate(value, pattern) {
  const d = value instanceof Date ? value : new Date(value);
  return pattern.replace(/dddd|ddd|dd|d|MMMM|MMM|MM|yyyy|HH|mm|ss/g, (token) => {
    switch (token) {
      case 'dddd':
        return DAYS[d.getDay()];
      case 'ddd':
        return DAYS_SHORT[d.getDay()];
      case 'dd':
        return pad(d.getDate());
      case 'd':
        return String(d.getDate());
      case 'MMMM':
        return MONTHS[d.getMonth()];
      case 'MMM':
        return MONTHS_SHORT[d.getMonth()];
      case 'MM':
        return pad(d.getMonth() + 1);
      case 'yyyy':
        return String(d.getFullYear());
      case 'HH':
        return pad(d.getHours());
      case 'mm':
        return pad(d.getMinutes());
      default:
        return pad(d.getSeconds());
    }
  });
}

export const hhmm = (value) => formatDate(value, 'HH:mm');

/** Yerel günün anahtarı: "2026-10-30". */
export const dayKey = (value) => formatDate(value, 'yyyy-MM-dd');

export function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(value, days) {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
}

/** "2026-10-30" + "19:30" → yerel saatle zaman damgası. Tanınmazsa null. */
export function localTime(day, time) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '');
  const tm = /^(\d{2}):(\d{2})$/.exec(time ?? '');
  if (!dm || !tm) return null;
  return new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]).getTime();
}

/** Aramalar için: küçük harf, Türkçe harfler ASCII karşılıklarına (ş→s, ı→i...). */
export function fold(text) {
  const map = {
    ç: 'c',
    Ç: 'c',
    ğ: 'g',
    Ğ: 'g',
    ı: 'i',
    I: 'i',
    İ: 'i',
    ö: 'o',
    Ö: 'o',
    ş: 's',
    Ş: 's',
    ü: 'u',
    Ü: 'u',
    â: 'a',
    Â: 'a',
    î: 'i',
    Î: 'i',
    û: 'u',
    Û: 'u',
  };
  return [...(text ?? '')].map((ch) => map[ch] ?? ch.toLowerCase()).join('');
}

/** "Standart Plus" → "standart-plus". */
export function slugFrom(text) {
  const map = {
    ç: 'c',
    Ç: 'c',
    ğ: 'g',
    Ğ: 'g',
    ı: 'i',
    I: 'i',
    İ: 'i',
    i: 'i',
    ö: 'o',
    Ö: 'o',
    ş: 's',
    Ş: 's',
    ü: 'u',
    Ü: 'u',
  };
  let out = '';
  let pendingDash = false;
  for (const ch of text ?? '') {
    const mapped = map[ch] ?? (/[A-Za-z0-9]/.test(ch) ? ch.toLowerCase() : '-');
    if (mapped === '-') {
      pendingDash = out.length > 0;
      continue;
    }
    if (pendingDash) {
      out += '-';
      pendingDash = false;
    }
    out += mapped;
  }
  return out;
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ===========================================================================
// Telefon numaraları: "0532 123 45 67" ve "+90 532 123 4567" aynı kayıt olsun diye tek biçim

export function normalizePhone(input) {
  if (!input || !input.trim()) return null;
  const digits = input.replace(/\D/g, '');
  let national = null;
  if (digits.length === 12 && digits.startsWith('90')) national = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  if (!national || national[0] === '0') return null;
  return '+90' + national;
}

/** "+905321234567" → "0532 123 45 67". */
export function phone(normalized) {
  return normalized?.length === 13 && normalized.startsWith('+90')
    ? `0${normalized.slice(3, 6)} ${normalized.slice(6, 9)} ${normalized.slice(9, 11)} ${normalized.slice(11, 13)}`
    : (normalized ?? '');
}

/** Arama kutusundaki numara parçası: rakamlar, baştaki 90 ülke kodu düşülür. */
export function searchDigits(query) {
  const digits = query.replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('90') && digits.length > 2 ? digits.slice(2) : digits;
}

export function customerSearchKey(customer) {
  const national = customer.phone.startsWith('+90') ? customer.phone.slice(3) : customer.phone;
  return `${fold(customer.fullName)} ${national} 0${national}`;
}

// ===========================================================================
// Ücretlendirme

export const billingPolicy = (state) => ({
  block: state.operation.billingBlockMinutes,
  minimum: state.operation.minimumMinutes,
});

export function roundUp(policy, minutes) {
  if (policy.block <= 1 || minutes <= 0) return Math.max(minutes, 0);
  return Math.ceil(minutes / policy.block) * policy.block;
}

const price = (rate, minutes) => round2((rate * minutes) / 60);

/**
 * Paketsiz: max(minimum, dilime yuvarlanmış süre) × saatlik tarife.
 * Paketli: paket fiyatı + paket süresini aşan kısım (dilime yuvarlanır, minimum uygulanmaz) × saatlik tarife.
 */
export function calculateCharge(startedAt, endedAt, hourlyRate, policy, pkg) {
  const elapsedMinutes = Math.max(0, Math.floor((endedAt - startedAt) / MINUTE));
  if (!pkg) {
    const billed = Math.max(policy.minimum, roundUp(policy, elapsedMinutes));
    return {
      elapsedMinutes,
      billedMinutes: billed,
      amount: price(hourlyRate, billed),
      packagePrice: null,
      overtimeMinutes: 0,
      overtimeAmount: 0,
    };
  }
  const overtime = roundUp(policy, Math.max(0, elapsedMinutes - pkg.minutes));
  const overtimeAmount = price(hourlyRate, overtime);
  return {
    elapsedMinutes,
    billedMinutes: pkg.minutes + overtime,
    amount: round2(pkg.price + overtimeAmount),
    packagePrice: pkg.price,
    overtimeMinutes: overtime,
    overtimeAmount,
  };
}

/** Ücretin bakiyeden ve kasadan ödenecek kısımları. Bakiye hiçbir zaman eksiye düşmez. */
export function settle(charge, balance) {
  const fromBalance = Math.min(Math.max(balance, 0), charge);
  return { fromBalance: round2(fromBalance), atCounter: round2(charge - fromBalance) };
}

/** Müşteri defterine hareket ekler. Kayıtlar silinmez; düzeltme yeni bir hareketle yapılır. */
export function addLedgerEntry(state, customer, kind, amount, at, extra = {}) {
  customer.balance = round2(customer.balance + amount);
  state.transactions.push({
    id: nextId(state, 'transactions'),
    customerId: customer.id,
    kind,
    amount: round2(amount),
    balanceAfter: customer.balance,
    method: extra.method ?? null,
    sessionId: extra.sessionId ?? null,
    note: extra.note ?? null,
    staff: extra.staff === undefined ? STAFF_NAME : extra.staff,
    createdAt: at,
  });
}

export const sessionPackage = (session) =>
  session.packageName != null
    ? { name: session.packageName, minutes: session.packageMinutes, price: session.packagePrice }
    : null;

// ===========================================================================
// Rezervasyon kuralları

export function reservationPolicy(state) {
  const op = state.operation;
  const policy = {
    slot: op.resSlotMinutes,
    min: op.resMinMinutes,
    max: op.resMaxMinutes,
    days: op.resBookingDays,
    lead: op.resLeadMinutes,
    noShow: op.resNoShowMinutes,
    maxPending: op.resMaxPendingPerPhone,
  };
  policy.durations = () => {
    const out = [];
    for (let m = policy.min; m <= policy.max; m += policy.slot) out.push(m);
    return out;
  };
  /** Bir günün tüm başlangıç saatleri: "00:00", "00:30"... */
  policy.startTimes = () => {
    const out = [];
    for (let m = 0; m < 24 * 60; m += policy.slot)
      out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    return out;
  };
  /** Takvimde seçilebilen günler: bugün ve sonraki günler. */
  policy.dayList = (now) => {
    const today = startOfDay(now);
    return Array.from({ length: Math.max(policy.days, 1) }, (_, i) => addDays(today, i));
  };
  policy.isStartAllowed = (start, now) =>
    start >= now + policy.lead * MINUTE &&
    startOfDay(start) <= addDays(startOfDay(now), policy.days - 1).getTime();
  /** Kurallara uymuyorsa müşteriye gösterilecek mesaj. */
  policy.validate = (start, minutes, now, enforceLead = true) => {
    if (!policy.durations().includes(minutes)) {
      return `Süre ${hours(policy.min)} ile ${hours(policy.max)} arasında, ${policy.slot} dakikalık adımlarla seçilmeli.`;
    }
    if (new Date(start).getMinutes() % policy.slot !== 0) {
      return `Başlangıç saati ${policy.slot} dakikalık dilimlerden biri olmalı.`;
    }
    if (startOfDay(start) > addDays(startOfDay(now), policy.days - 1).getTime()) {
      return `En fazla ${policy.days} günlük takvimden seçebilirsin.`;
    }
    if (!enforceLead) {
      return start <= now - policy.slot * MINUTE ? 'Geçmiş bir saat seçilemez.' : null;
    }
    if (start < now + policy.lead * MINUTE) {
      return policy.lead > 0
        ? `Bu saat çok yakın; en erken ${policy.lead} dakika sonrası için rezervasyon yapılabilir.`
        : 'Geçmiş bir saat seçilemez.';
    }
    return null;
  };
  /** Bekleyen ve onaylı talepler, başlangıçtan gelmeme süresi sonrasına kadar yer tutar. */
  policy.isLive = (status, startsAt, now) =>
    (status === 'pending' || status === 'confirmed') && now < startsAt + policy.noShow * MINUTE;
  policy.liveCutoff = (now) => now - policy.noShow * MINUTE;
  /** Onaylı rezervasyonun PC'si haritada "rezerve" görünmeli mi? */
  policy.holdsStation = (startsAt, now) =>
    now >= startsAt - HOLD_BEFORE_MINUTES * MINUTE && now < startsAt + policy.noShow * MINUTE;
  policy.phaseOf = (status, startsAt, now) => {
    switch (status) {
      case 'pending':
        return policy.isLive(status, startsAt, now) ? 'pending' : 'unanswered';
      case 'confirmed':
        if (!policy.isLive(status, startsAt, now)) return 'late';
        return policy.holdsStation(startsAt, now) ? 'due' : 'confirmed';
      case 'completed':
        return 'completed';
      case 'noshow':
        return 'noshow';
      default:
        return 'cancelled';
    }
  };
  return policy;
}

const hours = (minutes) => (minutes % 60 === 0 ? `${minutes / 60} saat` : `${minutes} dakika`);

export const overlaps = (start, end, otherStart, otherEnd) => start < otherEnd && otherStart < end;

export const reservationEnd = (reservation) =>
  reservation.startsAt + reservation.durationMinutes * MINUTE;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newCode(state) {
  for (;;) {
    let code = '';
    const bytes = crypto.getRandomValues(new Uint32Array(6));
    for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    if (!state.reservations.some((r) => r.code === code)) return code;
  }
}

export function normalizeCode(input) {
  if (!input || !input.trim()) return null;
  const code = input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return code.length === 6 && [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
}

const firstName = (fullName) => fullName.split(' ').filter(Boolean)[0] ?? fullName;

// ===========================================================================
// Sorgular

export const tierById = (state, id) => state.tiers.find((t) => t.id === id);
export const stationById = (state, id) => state.stations.find((s) => s.id === id);
export const customerById = (state, id) => state.customers.find((c) => c.id === id);
export const openSessionOf = (state, stationId) =>
  state.sessions.find((g) => g.stationId === stationId && g.endedAt == null);

/** Sitede görünen ve en az bir PC'si hizmette olan sınıfın kapasitesi; rezervasyona kapalıysa null. */
export function capacityOf(state, tierId) {
  const tier = tierById(state, tierId);
  if (!tier || !tier.isVisible) return null;
  return state.stations.filter((s) => s.tierId === tierId && !s.isOutOfService).length;
}

/**
 * Şu an onaylı bir rezervasyon için tutulan boş PC'ler: hizmette, açık oturumu yok,
 * rezervasyonu başlamak üzere ya da bekleme süresinde. "Boş PC" sayısı bunları boş saymaz.
 */
export function heldStationIds(state, now) {
  const policy = reservationPolicy(state);
  const ids = new Set();
  for (const r of state.reservations) {
    if (r.status !== 'confirmed' || r.stationId == null) continue;
    if (r.startsAt > now + HOLD_BEFORE_MINUTES * MINUTE || r.startsAt <= policy.liveCutoff(now))
      continue;
    const station = stationById(state, r.stationId);
    if (!station || station.isOutOfService || openSessionOf(state, station.id)) continue;
    ids.add(r.stationId);
  }
  return [...ids];
}

/** Hizmetteki PC'lerden kaçı boş (rezervasyon için tutulanlar boş sayılmaz). */
export function seatStatus(state, now) {
  const inService = state.stations.filter((s) => !s.isOutOfService);
  const busy = inService.filter((s) => openSessionOf(state, s.id)).length;
  const held = heldStationIds(state, now).length;
  return { available: inService.length - busy - held, total: inService.length };
}

/** Sitenin ana sayfasındaki içerik (sunucudaki EfSiteContentSource ile aynı seçimler). */
export function homeContent(state) {
  const s = state.settings;
  const tiers = state.tiers
    .filter((t) => t.isVisible && t.specs.length > 0)
    .sort(byOrder)
    .map((t) => ({ name: t.name, label: t.label, specs: [...t.specs].sort(byOrder) }));
  const prices = state.tiers
    .filter((t) => t.isVisible)
    .sort(byOrder)
    .map((t) => {
      const rate = t.hourlyRate > 0 ? t.hourlyRate : null;
      const packages = t.plans
        .filter((p) => p.isVisible)
        .sort(byOrder)
        .map((p) => ({
          name: p.name,
          durationMinutes: p.durationMinutes,
          price: p.price,
          saving: saving(rate, p.durationMinutes, p.price),
        }));
      return { name: t.name, label: t.label, hourlyRate: rate, packages };
    })
    .filter((t) => t.hourlyRate != null || t.packages.length > 0);
  return {
    hero: {
      eyebrow: s.heroEyebrow,
      lineOne: s.heroLineOne,
      lineTwo: s.heroLineTwo,
      lead: s.heroLead,
    },
    tiers,
    gear: [...state.gear].sort(byOrder),
    games: state.games
      .filter((g) => g.isVisible)
      .sort(byOrder)
      .map((g) => g.name),
    prices,
  };
}

/** Paket, saatlik tarifeye göre en az %1 avantajlıysa yüzde değeri. */
function saving(rate, minutes, packagePrice) {
  if (!(rate > 0) || !(minutes > 0)) return null;
  const regular = (rate * minutes) / 60;
  const percent = Math.floor(((regular - packagePrice) / regular) * 100);
  return percent >= 1 ? percent : null;
}

/** Her sayfada görünen ortak bilgiler: ad, slogan, boş PC, bağlantılar. */
export function siteChrome(state, now) {
  return {
    name: state.settings.name,
    tagline: state.settings.tagline,
    description: state.settings.heroLead,
    seats: seatStatus(state, now),
    hasPrices: state.tiers.some(
      (t) => t.isVisible && (t.hourlyRate > 0 || t.plans.some((p) => p.isVisible)),
    ),
    links: [...state.links].sort(byOrder),
  };
}

/** Rezervasyon formu: sitede görünen ve hizmette PC'si olan sınıflar, takvim günleri. */
export function bookingOptions(state, now) {
  const policy = reservationPolicy(state);
  const tiers = state.tiers
    .filter((t) => t.isVisible)
    .sort(byOrder)
    .map((t) => ({
      id: t.id,
      name: t.name,
      label: t.label,
      hourlyRate: t.hourlyRate,
      capacity: capacityOf(state, t.id),
    }))
    .filter((t) => t.capacity > 0);
  return { tiers, days: policy.dayList(now), today: startOfDay(now), policy };
}

/** Sınıfta [from, to) aralığına değebilecek, hâlâ yer tutan talepler. */
function liveReservations(state, tierId, now) {
  const policy = reservationPolicy(state);
  const cutoff = policy.liveCutoff(now);
  return state.reservations.filter(
    (r) =>
      r.tierId === tierId &&
      (r.status === 'pending' || r.status === 'confirmed') &&
      r.startsAt > cutoff,
  );
}

/** Seçilen gün ve süre için her başlangıç saatinin durumu. */
export function availability(state, tierId, day, minutes, now) {
  const policy = reservationPolicy(state);
  const capacity = capacityOf(state, tierId);
  if (capacity == null) return null;
  if (!policy.durations().includes(minutes)) minutes = policy.min;
  const live = liveReservations(state, tierId, now);
  return {
    capacity,
    slots: policy.startTimes().map((time) => {
      const start = localTime(day, time);
      const end = start + minutes * MINUTE;
      const taken = live.filter((r) => overlaps(start, end, r.startsAt, reservationEnd(r))).length;
      return {
        time,
        allowed: policy.isStartAllowed(start, now),
        free: Math.max(0, capacity - taken),
      };
    }),
  };
}

/** Formdaki alan hataları (sunucudaki DataAnnotations mesajlarıyla aynı). */
export function validateReservationInput(input) {
  const errors = {};
  const name = (input.fullName ?? '').trim();
  if (!name) errors.fullName = 'Adını ve soyadını yaz.';
  else if (name.length < 3) errors.fullName = 'Ad soyad en az 3 harf olmalı.';
  else if (name.length > 100) errors.fullName = 'Ad soyad en fazla 100 karakter olabilir.';
  else if (!/\p{L}/u.test(name)) errors.fullName = 'Adını ve soyadını harflerle yaz.';
  if (!(input.phone ?? '').trim())
    errors.phone = 'Telefon numaranı yaz; onay için seni bu numaradan ararız.';
  else if (!normalizePhone(input.phone))
    errors.phone = 'Geçerli bir numara gir, örn. 0532 123 45 67.';
  if ((input.note ?? '').length > 300) errors.note = 'Not en fazla 300 karakter olabilir.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '')) errors.date = 'Takvimden bir gün seç.';
  if (!/^\d{2}:\d{2}$/.test(input.time ?? '')) errors.time = 'Listeden bir saat seç.';
  return errors;
}

/**
 * Talebi kaydeder (onay bekler). Telefon kayıtlı bir müşteriyle eşleşirse bağlanır.
 * Personelin girdiği taleplerde ön süre ve telefon başına bekleyen talep sınırı uygulanmaz.
 */
export function createReservation(state, input, { byStaff = false, now = Date.now() } = {}) {
  const phoneNumber = normalizePhone(input.phone);
  if (!phoneNumber) return fail('Geçerli bir telefon numarası gir.');
  const startsAt = localTime(input.date, input.time);
  if (startsAt == null) return fail('Takvimden bir gün ve saat seç.');

  const policy = reservationPolicy(state);
  const ruleError = policy.validate(startsAt, input.durationMinutes, now, !byStaff);
  if (ruleError) return fail(ruleError);

  const tier = state.tiers.find((t) => t.id === input.tierId && t.isVisible);
  const capacity = tier ? capacityOf(state, tier.id) : null;
  if (!tier || !(capacity > 0)) return fail('Bu sistem sınıfı şu an rezervasyona açık değil.');

  const cutoff = policy.liveCutoff(now);
  const pending = byStaff
    ? 0
    : state.reservations.filter(
        (r) => r.phone === phoneNumber && r.status === 'pending' && r.startsAt > cutoff,
      ).length;
  if (!byStaff && pending >= policy.maxPending) {
    return fail(
      policy.maxPending === 1
        ? 'Bu numarayla onay bekleyen bir talebin var. Onaylanınca yenisini gönderebilirsin.'
        : `Bu numarayla onay bekleyen ${pending} talebin var. Onaylanınca yenisini gönderebilirsin.`,
    );
  }

  const end = startsAt + input.durationMinutes * MINUTE;
  const taken = liveReservations(state, tier.id, now).filter((r) =>
    overlaps(startsAt, end, r.startsAt, reservationEnd(r)),
  ).length;
  if (taken >= capacity)
    return fail(`${tier.name} bu saatlerde dolu. Başka bir saat ya da süre seç.`);

  const customer = state.customers.find((c) => c.phone === phoneNumber && c.isActive);
  const reservation = {
    id: nextId(state, 'reservations'),
    code: newCode(state),
    tierId: tier.id,
    stationId: null,
    customerId: customer?.id ?? null,
    customerName: input.fullName.trim(),
    phone: phoneNumber,
    startsAt,
    durationMinutes: input.durationMinutes,
    status: 'pending',
    note: input.note?.trim() ? input.note.trim() : null,
    createdAt: now,
    handledBy: null,
    handledAt: null,
    byStaff,
  };
  state.reservations.push(reservation);
  return ok(receiptOf(state, reservation, now));
}

/** Onay ekranı ve durum sayfası için özet: kodu bilen herkes görebildiği için yalnızca ilk ad. */
export function receiptOf(state, reservation, now = Date.now()) {
  const policy = reservationPolicy(state);
  const station = reservation.stationId ? stationById(state, reservation.stationId) : null;
  return {
    id: reservation.id,
    code: reservation.code,
    firstName: firstName(reservation.customerName),
    tierName: tierById(state, reservation.tierId)?.name ?? '—',
    startsAt: reservation.startsAt,
    durationMinutes: reservation.durationMinutes,
    phone: reservation.phone,
    status: reservation.status,
    phase: policy.phaseOf(reservation.status, reservation.startsAt, now),
    stationCode: reservation.status === 'confirmed' ? (station?.code ?? null) : null,
  };
}

export function findReceipt(state, code, now = Date.now()) {
  const normalized = normalizeCode(code);
  const reservation = normalized && state.reservations.find((r) => r.code === normalized);
  return reservation ? receiptOf(state, reservation, now) : null;
}

// ===========================================================================
// Demo verisi: içerik asıl uygulamanın başlangıç verisiyle aynı; operasyon kayıtları
// (müşteriler, oturumlar, rezervasyonlar) şimdiki saate göre örnek olarak üretilir.

function seed(now) {
  const random = mulberry32(20261030);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const between = (min, max) => min + Math.floor(random() * (max - min + 1));

  const state = {
    version: VERSION,
    seededAt: now,
    ids: {},
    settings: {
      name: 'Nexus Arena',
      tagline: '7/24 kesintisiz oyun deneyimi.',
      heroEyebrow: 'Premium internet kafe · Espor standartlarında',
      heroLineOne: 'Düşük ping',
      heroLineTwo: 'Yüksek FPS',
      heroLead:
        'Sıradan bir internet kafe değil. Espor seviyesinde donanım, fiber altyapı ve premium bir atmosferle oyun deneyimini zirveye taşı.',
    },
    operation: {
      billingBlockMinutes: 15,
      minimumMinutes: 30,
      resSlotMinutes: 30,
      resMinMinutes: 60,
      resMaxMinutes: 360,
      resBookingDays: 7,
      resLeadMinutes: 30,
      resNoShowMinutes: 10,
      resMaxPendingPerPhone: 2,
    },
    tiers: [],
    gear: [],
    games: [],
    links: [],
    stations: [],
    customers: [],
    transactions: [],
    sessions: [],
    reservations: [],
  };

  const spec = (sortOrder, category, figure, detail, title, description) => ({
    id: nextId(state, 'specs'),
    sortOrder,
    category,
    figure,
    detail,
    title,
    description,
  });
  const plan = (sortOrder, name, durationMinutes, planPrice) => ({
    id: nextId(state, 'plans'),
    sortOrder,
    name,
    durationMinutes,
    price: planPrice,
    isVisible: true,
  });

  state.tiers.push({
    id: nextId(state, 'tiers'),
    slug: 'vip',
    name: 'VIP Sistem',
    label: 'Pro-Esports oda',
    sortOrder: 1,
    hourlyRate: 120,
    isVisible: true,
    specs: [
      spec(
        1,
        'Ekran kartı',
        'RTX 4090',
        '24 GB GDDR6X',
        'NVIDIA GeForce RTX 4090',
        'En ağır oyunları en yüksek ayarlarda, kare kaybı yaşamadan oynatan amiral gemisi.',
      ),
      spec(
        2,
        'İşlemci',
        'i9-14900K',
        '24 çekirdek · 6.0 GHz',
        'Intel Core i9-14900K',
        'Oyun, yayın ve kayıt aynı anda açıkken bile takılma yok.',
      ),
      spec(
        3,
        'Monitör',
        '360 Hz',
        '1 ms · Zowie espor',
        '360 Hz Zowie espor monitörü',
        'Saniyede 360 kare, 1 ms tepki süresi. Rakibini bir kare önce gör.',
      ),
    ],
    plans: [plan(1, '3 saat', 180, 320), plan(2, 'Gece paketi', 480, 600)],
  });
  state.tiers.push({
    id: nextId(state, 'tiers'),
    slug: 'standart-plus',
    name: 'Standart Plus',
    label: 'Ana salon',
    sortOrder: 2,
    hourlyRate: 70,
    isVisible: true,
    specs: [
      spec(
        1,
        'Ekran kartı',
        'RTX 4060 Ti',
        'NVIDIA GeForce',
        'NVIDIA GeForce RTX 4060 Ti',
        'Rekabetçi oyunlarda yüksek FPS, günlük oyunda rahat bir performans.',
      ),
      spec(
        2,
        'İşlemci',
        '7600X',
        '6 çekirdek · 5.3 GHz',
        'AMD Ryzen 5 7600X',
        'Yüksek saat hızıyla rekabetçi oyunların aradığı tepki süresi.',
      ),
      spec(
        3,
        'Monitör',
        '165 Hz',
        'IPS panel',
        '165 Hz IPS monitör',
        'Canlı renkler ve akıcı bir görüntü, uzun seanslarda bile.',
      ),
    ],
    plans: [
      plan(1, '3 saat', 180, 190),
      plan(2, '5 saat', 300, 300),
      plan(3, 'Gece paketi', 480, 400),
    ],
  });

  state.gear = [
    {
      id: nextId(state, 'gear'),
      sortOrder: 1,
      category: 'Mouse',
      name: 'Logitech G Pro X Superlight',
      detail: 'Ultra hafif, kablosuz',
    },
    {
      id: nextId(state, 'gear'),
      sortOrder: 2,
      category: 'Kulaklık',
      name: 'HyperX Cloud II',
      detail: '7.1 surround ses',
    },
  ];
  state.games = [
    'Valorant',
    'CS2',
    'League of Legends',
    'Apex Legends',
    'PUBG',
    'GTA V',
    'Rust',
  ].map((name, index) => ({
    id: nextId(state, 'games'),
    sortOrder: index + 1,
    name,
    isVisible: true,
  }));
  // Asıl uygulamada da bağlantılar boş gelir; gerçek adresler panelden girilir.
  state.links = ['Instagram', 'Discord', 'İletişim'].map((label, index) => ({
    id: nextId(state, 'links'),
    sortOrder: index + 1,
    label,
    url: '#',
  }));

  // 10 VIP + 30 Standart Plus PC
  const [vip, std] = state.tiers;
  let order = 0;
  for (const [tier, prefix, count] of [
    [vip, 'VIP', 10],
    [std, 'STD', 30],
  ]) {
    for (let i = 1; i <= count; i++) {
      state.stations.push({
        id: nextId(state, 'stations'),
        code: `${prefix}-${pad(i)}`,
        tierId: tier.id,
        isOutOfService: false,
        sortOrder: ++order,
      });
    }
  }
  const station = (code) => state.stations.find((s) => s.code === code);
  station('STD-17').isOutOfService = true;

  // ---- Müşteriler (örnek kişiler, gerçek değildir) ----
  const people = [
    ['Emre Yıldız', '05324182763'],
    ['Zeynep Kaya', '05419021538'],
    ['Burak Şahin', '05557316409', 'Hafta sonları turnuva takımıyla gelir.'],
    ['Elif Demir', '05072864172'],
    ['Mert Aydın', '05336490851'],
    ['Can Öztürk', '05441709326'],
    ['Selin Arslan', '05385137284'],
    ['Kerem Polat', '05528643017', 'VIP odayı tercih ediyor.'],
    ['Deniz Çelik', '05053271948'],
    ['Ece Yılmaz', '05314586290'],
    ['Arda Koç', '05467915603'],
    ['Onur Kurt', '05492058314'],
  ];
  for (const [index, [fullName, raw, note]] of people.entries()) {
    state.customers.push({
      id: nextId(state, 'customers'),
      fullName,
      phone: normalizePhone(raw),
      note: note ?? null,
      balance: 0,
      isActive: true,
      createdAt: startOfDay(now).getTime() - (40 - index * 2) * 24 * 60 * MINUTE,
    });
  }

  const ledger = (customer, kind, amount, at, extra) =>
    addLedgerEntry(state, customer, kind, amount, at, extra);

  // Bakiye yüklemeleri: her müşterinin ilk ziyaretinde
  const policy = billingPolicy(state);
  for (const customer of state.customers) {
    ledger(
      customer,
      'topup',
      pick([250, 250, 500, 500, 1000]),
      customer.createdAt + 19 * 60 * MINUTE,
      {
        method: pick(['cash', 'card']),
        staff: pick([STAFF_NAME, 'Barış Tan']),
      },
    );
  }

  // ---- Rezervasyon yardımcıları ----
  const slot = 30 * MINUTE;
  const nextSlot = Math.ceil(now / slot) * slot;
  const at = (dayOffset, time) => {
    const [h, m] = time.split(':').map(Number);
    const d = addDays(startOfDay(now), dayOffset);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const reserve = (fields) => {
    const reservation = {
      id: nextId(state, 'reservations'),
      code: newCode(state),
      stationId: null,
      customerId: null,
      note: null,
      handledBy: null,
      handledAt: null,
      byStaff: false,
      ...fields,
    };
    reservation.phone = normalizePhone(reservation.phone);
    const match = state.customers.find((c) => c.phone === reservation.phone && c.isActive);
    reservation.customerId = match?.id ?? null;
    state.reservations.push(reservation);
    return reservation;
  };

  const closeSession = (session, endedAt) => {
    const charge = calculateCharge(
      session.startedAt,
      endedAt,
      session.hourlyRate,
      policy,
      sessionPackage(session),
    );
    const customer = session.customerId ? customerById(state, session.customerId) : null;
    const split = customer
      ? settle(charge.amount, customer.balance)
      : { fromBalance: 0, atCounter: charge.amount };
    Object.assign(session, {
      endedAt,
      billedMinutes: charge.billedMinutes,
      charge: charge.amount,
      paidFromBalance: split.fromBalance,
      paidAtCounter: split.atCounter,
      counterMethod: split.atCounter > 0 ? pick(['cash', 'cash', 'card']) : null,
    });
    if (customer && split.fromBalance > 0) {
      ledger(customer, 'session', -split.fromBalance, endedAt, {
        sessionId: session.id,
        note: `${stationById(state, session.stationId).code} oturumu`,
      });
    }
  };

  const newSession = (stationRow, startedAt, customerId, plan) => {
    const tier = tierById(state, stationRow.tierId);
    const session = {
      id: nextId(state, 'sessions'),
      stationId: stationRow.id,
      customerId,
      reservationId: null,
      startedAt,
      endedAt: null,
      hourlyRate: tier.hourlyRate,
      planId: plan?.id ?? null,
      packageName: plan?.name ?? null,
      packageMinutes: plan?.durationMinutes ?? null,
      packagePrice: plan?.price ?? null,
      billedMinutes: null,
      charge: null,
      paidFromBalance: null,
      paidAtCounter: null,
      counterMethod: null,
    };
    state.sessions.push(session);
    return session;
  };

  // ---- Şu an açık oturumlar (önce planlanır; geçmiş oturumlar bunlarla çakışmasın) ----
  const openPlan = [
    // [PC, kaç dk önce başladı, müşteri sırası (null: misafir), paket adı]
    ['VIP-01', 142, 7, null],
    ['VIP-02', 64, 0, null],
    ['VIP-04', 176, null, '3 saat'],
    ['VIP-05', 23, 2, null],
    ['VIP-09', 95, null, null],
    ['STD-01', 188, 5, '3 saat'],
    ['STD-02', 41, null, null],
    ['STD-03', 117, 9, null],
    ['STD-06', 12, null, null],
    ['STD-08', 236, 3, '5 saat'],
    ['STD-10', 58, 4, null],
    ['STD-11', 83, null, '3 saat'],
    ['STD-14', 31, 6, null],
    ['STD-15', 154, null, null],
    ['STD-19', 7, 8, null],
    ['STD-22', 99, 10, '3 saat'],
    ['STD-23', 47, null, null],
    ['STD-26', 128, null, null],
  ].map(([code, minutesAgo, customerIndex, packageName]) => ({
    station: station(code),
    startedAt: now - minutesAgo * MINUTE - between(0, 50) * 1000,
    customerIndex,
    packageName,
  }));
  const openStart = new Map(openPlan.map((o) => [o.station.id, o.startedAt]));

  // Aynı PC'de aynı anda iki oturum olmasın.
  const isFree = (stationRow, from, to) =>
    !stationRow.isOutOfService &&
    !(openStart.has(stationRow.id) && to > openStart.get(stationRow.id)) &&
    !state.sessions.some(
      (g) => g.stationId === stationRow.id && overlaps(from, to, g.startedAt, g.endedAt ?? now),
    );

  // Dün gelip oturum açan rezervasyon
  const done = reserve({
    tierId: vip.id,
    stationId: station('VIP-06').id,
    customerName: 'Mert Aydın',
    phone: '05336490851',
    startsAt: at(-1, '19:00'),
    durationMinutes: 120,
    status: 'completed',
    createdAt: at(-2, '13:12'),
    handledBy: STAFF_NAME,
    handledAt: at(-1, '19:04'),
  });
  const doneSession = newSession(
    station('VIP-06'),
    done.startsAt + 4 * MINUTE,
    done.customerId,
    null,
  );
  doneSession.reservationId = done.id;
  closeSession(doneSession, done.startsAt + 131 * MINUTE);

  // ---- Kapanmış oturumlar: son 3 gün ve bugün, şu ana kadar ----
  const today = startOfDay(now).getTime();
  const regulars = state.customers.slice(0, 11);
  for (let d = 3; d >= 0; d--) {
    const dayStart = today - d * 24 * 60 * MINUTE;
    const count = d === 0 ? 16 : between(9, 13);
    for (let i = 0; i < count; i++) {
      const startedAt = dayStart + between(9 * 60, 22 * 60) * MINUTE + between(0, 59) * 1000;
      const length = pick([38, 52, 64, 75, 96, 118, 135, 170, 185, 212]);
      const endedAt = startedAt + length * MINUTE + between(0, 59) * 1000;
      if (endedAt > now - 5 * MINUTE) continue;
      const candidates = state.stations.filter((s) => isFree(s, startedAt, endedAt));
      if (candidates.length === 0) continue;
      const stationRow = pick(candidates);
      const customer = random() < 0.65 ? pick(regulars) : null;
      const plans = tierById(state, stationRow.tierId).plans.filter(
        (p) => p.durationMinutes <= length + 30,
      );
      const plan = length >= 150 && random() < 0.4 && plans.length ? pick(plans) : null;
      closeSession(newSession(stationRow, startedAt, customer?.id ?? null, plan), endedAt);
    }
  }

  // Dün ve bugün kasada yapılan yüklemeler (gün sonu raporunda görünsün). Oturumlardan
  // sonra eklenir: geçmiş oturumların bakiyeden ödenen kısmı bunlarla karşılanmış sayılmasın.
  for (const [index, dayOffset, time, amount, method] of [
    [0, -1, '18:40', 250, 'cash'],
    [6, -1, '21:15', 100, 'card'],
    [2, 0, '10:20', 500, 'card'],
    [9, 0, '13:05', 250, 'cash'],
    [4, 0, '15:30', 100, 'cash'],
  ]) {
    const paidAt = at(dayOffset, time);
    if (paidAt < now) ledger(state.customers[index], 'topup', amount, paidAt, { method });
  }

  for (const o of openPlan) {
    const tier = tierById(state, o.station.tierId);
    const plan = o.packageName ? tier.plans.find((p) => p.name === o.packageName) : null;
    newSession(
      o.station,
      o.startedAt,
      o.customerIndex == null ? null : state.customers[o.customerIndex].id,
      plan,
    );
  }

  // Bir müşteri pasif: panelde "Pasifleri göster" ile görünür.
  state.customers[11].isActive = false;

  // ---- Rezervasyonlar ----
  // Onaylı ve PC'si şu an tutulan (haritada "rezerve")
  reserve({
    tierId: vip.id,
    stationId: station('VIP-07').id,
    customerName: 'Zeynep Kaya',
    phone: '05419021538',
    startsAt: nextSlot,
    durationMinutes: 120,
    status: 'confirmed',
    createdAt: now - 26 * 60 * MINUTE,
    handledBy: STAFF_NAME,
    handledAt: now - 25 * 60 * MINUTE,
  });
  // Onaylı ama gelmedi (bekleme süresi doldu)
  reserve({
    tierId: std.id,
    stationId: station('STD-21').id,
    customerName: 'Tolga Er',
    phone: '05061847293',
    startsAt: nextSlot - 2 * slot,
    durationMinutes: 90,
    status: 'confirmed',
    createdAt: now - 5 * 60 * MINUTE,
    handledBy: 'Barış Tan',
    handledAt: now - 4 * 60 * MINUTE,
  });
  // Bekleyen talepler
  reserve({
    tierId: std.id,
    customerName: 'Yiğit Aksoy',
    phone: '05374120956',
    startsAt: nextSlot + 4 * slot,
    durationMinutes: 120,
    status: 'pending',
    note: 'Arkadaşımla yan yana oturmak istiyoruz.',
    createdAt: now - 18 * MINUTE,
  });
  reserve({
    tierId: vip.id,
    customerName: 'Kerem Polat',
    phone: '05528643017',
    startsAt: at(1, '20:00'),
    durationMinutes: 180,
    status: 'pending',
    createdAt: now - 52 * MINUTE,
  });
  reserve({
    tierId: std.id,
    customerName: 'Ayşe Tunç',
    phone: '05356208741',
    startsAt: at(2, '18:30'),
    durationMinutes: 60,
    status: 'pending',
    createdAt: now - 3 * 60 * MINUTE,
  });
  // Yaklaşan onaylılar
  reserve({
    tierId: std.id,
    stationId: station('STD-05').id,
    customerName: 'Can Öztürk',
    phone: '05441709326',
    startsAt: nextSlot + 6 * slot,
    durationMinutes: 150,
    status: 'confirmed',
    note: 'Kulaklık mikrofonu çalışan bir PC lütfen.',
    createdAt: now - 7 * 60 * MINUTE,
    handledBy: STAFF_NAME,
    handledAt: now - 6 * 60 * MINUTE,
  });
  reserve({
    tierId: vip.id,
    stationId: station('VIP-03').id,
    customerName: 'Burak Şahin',
    phone: '05557316409',
    startsAt: at(1, '21:00'),
    durationMinutes: 240,
    status: 'confirmed',
    note: '5 kişilik takım, yan yana.',
    createdAt: now - 20 * 60 * MINUTE,
    handledBy: STAFF_NAME,
    handledAt: now - 19 * 60 * MINUTE,
  });
  // Geçmiş: iptal ve gelmedi
  reserve({
    tierId: std.id,
    customerName: 'Gizem Er',
    phone: '05423318806',
    startsAt: at(-1, '22:00'),
    durationMinutes: 120,
    status: 'cancelled',
    createdAt: at(-1, '15:40'),
    handledBy: 'Barış Tan',
    handledAt: at(-1, '16:02'),
  });
  reserve({
    tierId: std.id,
    stationId: station('STD-09').id,
    customerName: 'Efe Yalçın',
    phone: '05467712035',
    startsAt: at(-2, '17:30'),
    durationMinutes: 90,
    status: 'noshow',
    createdAt: at(-3, '11:20'),
    handledBy: STAFF_NAME,
    handledAt: at(-2, '17:45'),
  });

  state.sessions.sort((a, b) => a.startedAt - b.startedAt);
  recomputeLedger(state);
  return state;
}

/** Defteri zaman sırasıyla yeniden toplar; her kaydın "sonraki bakiye"si ve müşteri bakiyesi tutarlı olur. */
function recomputeLedger(state) {
  state.transactions.sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const balances = new Map();
  for (const t of state.transactions) {
    const next = round2((balances.get(t.customerId) ?? 0) + t.amount);
    t.balanceAfter = next;
    balances.set(t.customerId, next);
  }
  for (const customer of state.customers) customer.balance = balances.get(customer.id) ?? 0;
}

function mulberry32(seedValue) {
  let a = seedValue;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { nextId, firstName, MINUTE };
