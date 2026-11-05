// Nexus Arena · rezervasyon formu
// Asıl uygulamada form sunucuya gönderilir; sunucu kuralları denetler ve bölümün içini döner.
// Demo aynı kuralları ortak veri katmanında uygular: talep kaydedilir ve admin panelinde
// "Bekleyen" listesine düşer. Seçilen gün ve süre için dolu saatler, özet ve onay ekranı aynıdır.

import {
  getState,
  commit,
  esc,
  money,
  duration,
  formatDate,
  dayKey,
  addDays,
  localTime,
  bookingOptions,
  availability,
  validateReservationInput,
  createReservation,
  phone,
  MINUTE,
} from './data.js';

export const STATUS_URL = 'nexus-arena-rezervasyon.html';
const PANEL_URL = 'nexus-arena-panel.html';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let body = null;

/** Formun o anki hâli: seçimler, alan hataları, genel hata ya da onay özeti. */
let view = null;

/** Bölümün içini çizer. Site içeriği veriden yeniden çizildikten sonra çağrılır. */
export function mountBooking() {
  body = document.querySelector('[data-booking-body]');
  if (!body) return;
  view = { input: defaults(), errors: {}, error: null, receipt: null };
  body.innerHTML = render();
  bind();
}

// İlk açılışta: ilk sınıf, saati kalan ilk gün, o günün ilk uygun saati ve 2 saat (yoksa en kısa süre).
function defaults() {
  const state = getState();
  const now = Date.now();
  const options = bookingOptions(state, now);
  const policy = options.policy;
  const durations = policy.durations();
  const input = {
    tierId: options.tiers[0]?.id ?? 0,
    durationMinutes: durations.includes(120) ? 120 : policy.min,
    date: '',
    time: '',
    fullName: '',
    phone: '',
    note: '',
  };
  outer: for (const day of options.days) {
    for (const time of policy.startTimes()) {
      if (policy.isStartAllowed(localTime(dayKey(day), time), now)) {
        input.date = dayKey(day);
        input.time = time;
        break outer;
      }
    }
  }
  return input;
}

function render() {
  if (view.receipt) return receipt(view.receipt);

  const state = getState();
  const now = Date.now();
  const options = bookingOptions(state, now);
  if (options.tiers.length === 0) {
    return '<p class="booking-closed">Şu an online rezervasyon alınmıyor. Yerini ayırtmak için kafeye uğrayabilirsin.</p>';
  }

  const { input, errors } = view;
  const policy = options.policy;
  const selectedTier = options.tiers.find((t) => t.id === input.tierId) ?? options.tiers[0];
  const start = localTime(input.date, input.time);
  const hasSlots = (day) =>
    policy.startTimes().some((time) => policy.isStartAllowed(localTime(dayKey(day), time), now));
  const fieldError = (key) =>
    `<span class="booking-error ${errors[key] ? 'field-validation-error' : 'field-validation-valid'}">${esc(errors[key] ?? '')}</span>`;
  const invalid = (key) => (errors[key] ? ' input-validation-error' : '');

  const alert = view.error
    ? `<p class="booking-alert" role="alert" data-booking-alert tabindex="-1">${esc(view.error)}</p>`
    : Object.keys(errors).length
      ? '<p class="booking-alert" role="alert" data-booking-alert tabindex="-1">Formda düzeltilmesi gereken alanlar var.</p>'
      : '';

  const tiers = options.tiers
    .map(
      (tier) => `<label class="booking-choice booking-tier">
          <input type="radio" name="Input.SystemTierId" value="${tier.id}"${tier.id === selectedTier.id ? ' checked' : ''}
                 data-name="${esc(tier.name)}" data-rate="${tier.hourlyRate}" data-capacity="${tier.capacity}" />
          <span class="booking-tier__label mono">${esc(tier.label)}</span>
          <span class="booking-tier__name">${esc(tier.name)}</span>
          <span class="booking-tier__meta mono">${tier.hourlyRate > 0 ? `${money(tier.hourlyRate)} / saat · ` : ''}${tier.capacity} PC</span>
        </label>`,
    )
    .join('');

  const today = dayKey(options.today);
  const tomorrow = dayKey(addDays(options.today, 1));
  const days = options.days
    .map((day) => {
      const key = dayKey(day);
      const open = hasSlots(day);
      const name = key === today ? 'Bugün' : key === tomorrow ? 'Yarın' : formatDate(day, 'ddd');
      return `<label class="booking-choice booking-day"${open ? '' : ' title="Bugün için saat kalmadı"'}>
          <input type="radio" name="Input.Date" value="${key}"${key === input.date ? ' checked' : ''}${open ? '' : ' disabled'} data-label="${formatDate(day, 'd MMMM dddd')}" />
          <span class="booking-day__name mono">${name}</span>
          <span class="booking-day__num">${day.getDate()}</span>
          <span class="booking-day__month mono">${formatDate(day, 'MMM')}</span>
        </label>`;
    })
    .join('');

  const times = policy
    .startTimes()
    .map(
      (time) => `<option value="${time}"${time === input.time ? ' selected' : ''}>${time}</option>`,
    )
    .join('');
  const durations = policy
    .durations()
    .map(
      (m) =>
        `<option value="${m}"${m === input.durationMinutes ? ' selected' : ''}>${duration(m)}</option>`,
    )
    .join('');

  const estimate = Math.round(((selectedTier.hourlyRate * input.durationMinutes) / 60) * 100) / 100;

  return `<form class="booking-form" action="#rezervasyon" novalidate data-booking-form data-slot="${policy.slot}">
        <div class="booking-form__steps">
            ${alert}
            <fieldset class="booking-step">
                <legend class="booking-step__legend"><span class="mono">01</span>Sistem</legend>
                <div class="booking-tiers">${tiers}</div>
            </fieldset>

            <fieldset class="booking-step">
                <legend class="booking-step__legend"><span class="mono">02</span>Gün</legend>
                <div class="booking-days">${days}</div>
                ${fieldError('date')}
            </fieldset>

            <fieldset class="booking-step">
                <legend class="booking-step__legend"><span class="mono">03</span>Saat ve süre</legend>
                <div class="booking-pair">
                    <div class="booking-field">
                        <label class="booking-field__label mono" for="booking-time">Başlangıç</label>
                        <span class="booking-select">
                            <select id="booking-time" class="booking-input${invalid('time')}" name="Input.Time" data-booking-time>${times}</select>
                        </span>
                        ${fieldError('time')}
                    </div>
                    <div class="booking-field">
                        <label class="booking-field__label mono" for="booking-duration">Süre</label>
                        <span class="booking-select">
                            <select id="booking-duration" class="booking-input" name="Input.DurationMinutes" data-booking-duration>${durations}</select>
                        </span>
                    </div>
                </div>
                <p class="booking-step__hint" data-booking-availability>
                    Başlangıç saatleri ${policy.slot} dakikada bir; en erken ${policy.lead} dakika sonrası seçilebilir.
                </p>
            </fieldset>

            <fieldset class="booking-step">
                <legend class="booking-step__legend"><span class="mono">04</span>İletişim</legend>
                <div class="booking-pair">
                    <div class="booking-field">
                        <label class="booking-field__label mono" for="Input_FullName">Ad soyad</label>
                        <input class="booking-input${invalid('fullName')}" id="Input_FullName" name="Input.FullName" autocomplete="name" maxlength="100" placeholder="Adın ve soyadın" value="${esc(input.fullName)}" />
                        ${fieldError('fullName')}
                    </div>
                    <div class="booking-field">
                        <label class="booking-field__label mono" for="Input_PhoneNumber">Telefon</label>
                        <input class="booking-input${invalid('phone')}" id="Input_PhoneNumber" name="Input.PhoneNumber" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0532 123 45 67" value="${esc(input.phone)}" />
                        ${fieldError('phone')}
                    </div>
                </div>
                <div class="booking-field">
                    <label class="booking-field__label mono" for="Input_Note">Not <em>(isteğe bağlı)</em></label>
                    <textarea class="booking-input booking-input--area${invalid('note')}" id="Input_Note" name="Input.Note" maxlength="300" rows="3"
                              placeholder="Örn. arkadaşımla yan yana oturmak istiyoruz.">${esc(input.note)}</textarea>
                    ${fieldError('note')}
                </div>

                <div class="booking-trap" aria-hidden="true">
                    <label for="booking-website">Web siteniz</label>
                    <input id="booking-website" name="Website" type="text" tabindex="-1" autocomplete="off" value="" />
                </div>
            </fieldset>
        </div>

        <aside class="booking-ticket" aria-label="Talep özeti">
            <p class="booking-ticket__head mono">
                <span>Talep özeti</span>
                <span class="booking-ticket__free" data-ticket-free></span>
            </p>
            <dl class="booking-ticket__rows">
                <div><dt class="mono">Sistem</dt><dd data-ticket-tier>${esc(selectedTier.name)}</dd></div>
                <div><dt class="mono">Gün</dt><dd data-ticket-day>${start == null ? '—' : formatDate(start, 'd MMMM dddd')}</dd></div>
                <div>
                    <dt class="mono">Saat</dt>
                    <dd data-ticket-time>${start == null ? '—' : `${formatDate(start, 'HH:mm')} → ${formatDate(start + input.durationMinutes * MINUTE, 'HH:mm')}`}</dd>
                </div>
                <div class="booking-ticket__price"${selectedTier.hourlyRate > 0 ? '' : ' hidden'}>
                    <dt class="mono">Tahmini</dt>
                    <dd data-ticket-price>${selectedTier.hourlyRate > 0 ? money(estimate) : ''}</dd>
                </div>
            </dl>
            <p class="booking-ticket__note">Ödeme kafede alınır; paketler oturum açılırken seçilebilir. Talebin, ekibimiz onaylayınca kesinleşir.</p>

            <button type="submit" class="booking-submit" aria-label="Talebi gönder" data-magnetic="0.25">
                <svg class="booking-submit__ring" viewBox="0 0 200 200" aria-hidden="true">
                    <defs>
                        <path id="booking-ring-path" d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0" />
                    </defs>
                    <text><textPath href="#booking-ring-path">Talebi gönder · 7/24 açık · Onaylayınca PC'n hazır · </textPath></text>
                </svg>
                <span class="booking-submit__disc">
                    <span class="booking-submit__label">Talebi<br />gönder</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" /></svg>
                </span>
            </button>
        </aside>
    </form>`;
}

function receipt(r) {
  const end = r.startsAt + r.durationMinutes * MINUTE;
  return `<div class="booking-done" data-booking-done tabindex="-1">
        <p class="booking-done__eyebrow mono"><span class="pulse" aria-hidden="true"></span>Talep alındı · onay bekliyor</p>
        <h3 class="booking-done__title">Teşekkürler, ${esc(r.firstName)}.</h3>
        <p class="booking-done__lead">
            Ekibimiz uygunluğu kontrol edip talebini onaylayınca PC'n seni bekleyecek.
            Gerekirse <strong>${phone(r.phone)}</strong> numarasından arayacağız.
        </p>

        <div class="booking-done__ticket">
            <div class="booking-done__code">
                <span class="mono">Takip kodu</span>
                <strong>${r.code}</strong>
            </div>
            <dl class="booking-done__rows">
                <div><dt class="mono">Sistem</dt><dd>${esc(r.tierName)}</dd></div>
                <div><dt class="mono">Gün</dt><dd>${formatDate(r.startsAt, 'd MMMM dddd')}</dd></div>
                <div><dt class="mono">Saat</dt><dd>${formatDate(r.startsAt, 'HH:mm')} → ${formatDate(end, 'HH:mm')}</dd></div>
                <div><dt class="mono">Süre</dt><dd>${duration(r.durationMinutes)}</dd></div>
            </dl>
        </div>

        <div class="booking-done__actions">
            <a class="btn btn--volt btn--lg" href="${STATUS_URL}?kod=${r.code}" data-magnetic>
                <span class="roll" data-text="Durumu takip et"><span>Durumu takip et</span></span>
                <svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </a>
            <a class="link-roll link-roll--muted" href="#rezervasyon" data-booking-new>
                <span class="roll" data-text="Yeni talep oluştur"><span>Yeni talep oluştur</span></span>
            </a>
        </div>
        <p class="booking-done__hint mono">Kodu sakla: durum sayfası bu kodla açılır.</p>
        <p class="booking-done__hint mono">Demo · <a href="${PANEL_URL}#/rezervasyonlar" target="_blank" rel="noopener">talebi admin panelinde gör →</a></p>
    </div>`;
}

function bind() {
  const newLink = body.querySelector('[data-booking-new]');
  newLink?.addEventListener('click', (event) => {
    // Belge düzeyindeki çapa kaydırması bu bağlantıyı yakalamasın.
    event.preventDefault();
    event.stopPropagation();
    view = { input: defaults(), errors: {}, error: null, receipt: null };
    replace();
  });

  const form = body.querySelector('[data-booking-form]');
  if (form) bindForm(form);
}

function bindForm(form) {
  const time = form.querySelector('[data-booking-time]');
  const duration = form.querySelector('[data-booking-duration]');
  const hint = form.querySelector('[data-booking-availability]');
  const submit = form.querySelector('[type="submit"]');
  const ticket = {
    tier: form.querySelector('[data-ticket-tier]'),
    day: form.querySelector('[data-ticket-day]'),
    time: form.querySelector('[data-ticket-time]'),
    price: form.querySelector('[data-ticket-price]'),
    free: form.querySelector('[data-ticket-free]'),
  };
  const checked = (name) => form.querySelector(`input[name="${name}"]:checked`);

  let data = null;
  let busy = false;

  const refreshTicket = () => {
    const tier = checked('Input.SystemTierId');
    const day = checked('Input.Date');
    const minutes = Number(duration.value) || 0;

    if (tier) ticket.tier.textContent = tier.dataset.name;
    if (day) ticket.day.textContent = day.dataset.label;
    if (time.value) ticket.time.textContent = `${time.value} → ${addMinutes(time.value, minutes)}`;

    const rate = Number(tier?.dataset.rate) || 0;
    const priceRow = ticket.price?.closest('div');
    if (priceRow) {
      priceRow.hidden = rate <= 0;
      ticket.price.textContent = money(Math.round(((rate * minutes) / 60) * 100) / 100);
    }

    const slot = data?.slots.find((s) => s.time === time.value);
    if (!slot) {
      ticket.free.textContent = '';
      return;
    }
    const full = slot.free === 0;
    ticket.free.textContent = full
      ? 'Dolu'
      : slot.free <= 2
        ? `Son ${slot.free} PC`
        : `${slot.free} PC müsait`;
    ticket.free.classList.toggle('is-full', full);
  };

  const refreshHint = () => {
    if (!hint || !data) return;
    const open = [...time.options].filter((o) => !o.disabled).length;
    const slot = data.slots.find((s) => s.time === time.value);
    hint.classList.toggle('is-full', open === 0);
    if (open === 0) {
      hint.textContent =
        'Bu gün ve süre için boş saat kalmadı. Başka bir gün ya da daha kısa bir süre seç.';
    } else if (slot) {
      hint.innerHTML = `<strong>${slot.free}/${data.capacity}</strong> PC bu saatlerde müsait. Dolu saatler listede seçilemez.`;
    }
  };

  // Kurala uymayan (geçmiş, çok yakın) saatler listeden gizlenir; dolu saatler "dolu" yazısıyla kapalı kalır.
  const applyAvailability = (result) => {
    data = result;
    const slots = new Map(result.slots.map((s) => [s.time, s]));
    for (const option of time.options) {
      const slot = slots.get(option.value);
      const allowed = Boolean(slot?.allowed);
      const full = allowed && slot.free === 0;
      option.hidden = !allowed;
      option.disabled = !allowed || full;
      option.textContent = full ? `${option.value} · dolu` : option.value;
    }

    if (time.selectedOptions[0]?.disabled) {
      const next =
        [...time.options].find((o) => !o.disabled && o.value > time.value) ??
        [...time.options].find((o) => !o.disabled);
      if (next) time.value = next.value;
    }
    refreshTicket();
    refreshHint();
  };

  const refreshAvailability = () => {
    const tier = checked('Input.SystemTierId');
    const day = checked('Input.Date');
    if (!tier || !day) return;
    const result = availability(
      getState(),
      Number(tier.value),
      day.value,
      Number(duration.value),
      Date.now(),
    );
    if (result) applyAvailability(result);
  };

  const collect = () => ({
    tierId: Number(checked('Input.SystemTierId')?.value) || 0,
    date: checked('Input.Date')?.value ?? '',
    time: time.value,
    durationMinutes: Number(duration.value) || 0,
    fullName: form.elements['Input.FullName'].value,
    phone: form.elements['Input.PhoneNumber'].value,
    note: form.elements['Input.Note'].value,
  });

  form.addEventListener('change', (event) => {
    if (['Input.SystemTierId', 'Input.Date', 'Input.DurationMinutes'].includes(event.target.name))
      refreshAvailability();
    refreshTicket();
    refreshHint();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    submit.classList.add('is-loading');
    submit.setAttribute('aria-busy', 'true');

    const input = collect();
    // Gerçek uygulamadaki ağ gidiş-dönüşü kadar kısa bir bekleme; yükleniyor animasyonu görünsün.
    await new Promise((resolve) => setTimeout(resolve, 450));

    const errors = validateReservationInput(input);
    if (form.elements.Website.value) {
      view = {
        input,
        errors: {},
        error: 'Talep gönderilemedi. Sayfayı yenileyip tekrar dene.',
        receipt: null,
      };
    } else if (Object.keys(errors).length) {
      view = { input, errors, error: null, receipt: null };
    } else {
      const result = commit((state) => createReservation(state, input));
      view = result.ok
        ? { input, errors: {}, error: null, receipt: result.value }
        : { input, errors: {}, error: result.error, receipt: null };
    }
    await replace();
  });

  refreshTicket();
  refreshAvailability();
}

// Yeni hâli bölümün içine koyar; onay ekranına kaydırır ya da ilk hatayı gösterir.
async function replace() {
  const { gsap, ScrollTrigger } = window;
  const animate = gsap && !reducedMotion;
  // Yalnızca saydamlık: görünürlük gizlenirse yeni içerikteki alana odak verilemez.
  if (animate) await gsap.to(body, { opacity: 0, y: -16, duration: 0.3, ease: 'power2.in' });

  body.innerHTML = render();
  bind();
  ScrollTrigger?.refresh();

  const done = body.querySelector('[data-booking-done]');
  const alert = body.querySelector('[data-booking-alert]');
  const target = done ?? body.querySelector('.input-validation-error') ?? alert ?? body;
  scrollTo(done ? body : (alert ?? target));
  if (target instanceof HTMLElement) target.focus({ preventScroll: true });

  if (animate) {
    gsap.fromTo(
      body,
      { opacity: 0, y: 28 },
      { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', clearProps: 'opacity,transform' },
    );
  }
}

function scrollTo(element) {
  const lenis = window.__nexusLenis;
  if (lenis) lenis.scrollTo(element, { offset: -150, duration: 1.2 });
  else element.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function addMinutes(value, minutes) {
  const [h, m] = value.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const end = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return total >= 24 * 60 ? `${end} (ertesi gün)` : end;
}
