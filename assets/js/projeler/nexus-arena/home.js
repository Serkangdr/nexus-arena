// Nexus Arena · sitenin içerik şablonları
// Asıl uygulamada bu bölümler sunucuda Razor ile üretilir (Pages/Shared/_Layout ve Home/*).
// Demo, aynı işaretlemeyi ortak veriden üretir: panelde yapılan değişiklik siteye yansır.
// Sayfadaki statik HTML, JavaScript kapalıyken görünen başlangıç içeriğidir.

import { esc, money, duration, formatDate, homeContent, siteChrome } from './data.js';

export const SITE_URL = 'index.html';

const isExternal = (url) => url.startsWith('http://') || url.startsWith('https://');
const linkAttrs = (url) => (isExternal(url) ? ' target="_blank" rel="noopener"' : '');
const two = (n) => String(n).padStart(2, '0');

/** Üst menü ve mobil menü aynı listeyi kullanır; fiyat yoksa "Fiyatlar" çıkmaz. */
function menu(chrome, onHome) {
  const base = onHome ? '' : SITE_URL;
  const items = [
    [`${base}#sistemler`, 'Sistemler'],
    [`${base}#oyunlar`, 'Oyunlar'],
  ];
  if (chrome.hasPrices) items.push([`${base}#fiyatlar`, 'Fiyatlar']);
  items.push([`${base}#rezervasyon`, 'Rezervasyon']);
  return items;
}

/** Üst bilgi, mobil menü ve alt bilgi: kafe adı, boş PC sayısı ve bağlantılar. */
export function renderChrome(state, now, { onHome = true, pageTitle = null } = {}) {
  const chrome = siteChrome(state, now);
  const items = menu(chrome, onHome);
  const seats = chrome.seats;
  document.title = pageTitle
    ? `${pageTitle} · ${chrome.name}`
    : `${chrome.name} · Premium internet kafe`;

  const brand = document.querySelector('.site-header .brand');
  if (brand) {
    brand.setAttribute('aria-label', `${chrome.name} ana sayfa`);
    brand.querySelector(':scope > span:last-child').innerHTML = chrome.name
      .split(' ')
      .filter(Boolean)
      .map(esc)
      .join('<span class="brand__slash">/</span>');
  }

  const nav = document.querySelector('.site-nav');
  if (nav) {
    nav.innerHTML = items
      .map(([href, label], i) => `<a href="${href}"><span>${two(i + 1)}</span>${label}</a>`)
      .join('');
  }

  updateSeats(state, now);

  const menuList = document.querySelector('.site-menu__nav ol');
  if (menuList) {
    menuList.innerHTML = items
      .map(
        ([href, label], i) => `<li>
          <a href="${href}">
            <span class="site-menu__index mono">${two(i + 1)}</span>
            <span class="site-menu__mask"><span class="site-menu__label" data-menu-link>${label}</span></span>
          </a>
        </li>`,
      )
      .join('');
  }

  const menuFoot = document.querySelector('.site-menu__foot');
  if (menuFoot) {
    menuFoot.innerHTML = `${
      seats.total > 0
        ? `<p class="mono"><span class="pulse" aria-hidden="true"></span> ${seats.available} / ${seats.total} PC boş</p>`
        : ''
    }<ul class="site-menu__links">${chrome.links
      .map((l) => `<li><a href="${esc(l.url)}"${linkAttrs(l.url)}>${esc(l.label)}</a></li>`)
      .join('')}</ul>`;
  }

  const footer = document.querySelector('.site-footer');
  if (footer) {
    footer.querySelector('.footer-brand').innerHTML =
      `<p class="mono">${esc(chrome.name)}</p><p>${esc(chrome.tagline)}</p>`;
    footer.querySelector('.footer-links').innerHTML = chrome.links
      .map(
        (l) => `<li>
          <a href="${esc(l.url)}" class="link-roll"${linkAttrs(l.url)}>
            <span class="roll" data-text="${esc(l.label)}"><span>${esc(l.label)}</span></span>
          </a>
        </li>`,
      )
      .join('');
    footer.querySelector('.footer-copy').textContent =
      `© ${new Date().getFullYear()} ${chrome.name}`;
    const mark = footer.querySelector('.footer-mark');
    mark.textContent = chrome.name;
    mark.style.setProperty('--chars', String(chrome.name.length));
  }
  return chrome;
}

/**
 * Boş PC sayısı (üst bilgi, mobil menü, giriş bölümü). Panelde oturum açılıp kapandıkça
 * ya da bir rezervasyonun saati yaklaştıkça değişir; menüye ve animasyonlara dokunmadan güncellenir.
 */
export function updateSeats(state, now) {
  const { seats } = siteChrome(state, now);
  const status = document.querySelector('.header-status');
  if (status) {
    status.style.display = seats.total === 0 ? 'none' : '';
    status.querySelector('strong').textContent = seats.available;
  }
  const menuSeats = document.querySelector('.site-menu__foot > p.mono');
  if (menuSeats) menuSeats.lastChild.textContent = ` ${seats.available} / ${seats.total} PC boş`;
  const hud = document.querySelector('[data-hud-seats]');
  if (hud) hud.innerHTML = `${seats.available}<span class="hud__dim">/${seats.total}</span>`;
}

/** Rezervasyon durum sayfası (asıl uygulamada /rezervasyon/{kod}). */
export function renderStatus(state, receipt) {
  const main = document.getElementById('icerik');
  if (!main) return null;
  if (!receipt) {
    main.innerHTML = `<section class="section status-page">
    <p class="status-page__code" aria-hidden="true">404</p>
    <h1 class="status-page__title">Sayfa bulunamadı.</h1>
    <p class="status-page__text">Aradığın sayfa kaldırılmış ya da adres yanlış yazılmış olabilir. Ana sayfadan devam et.</p>
    <div>
        <a class="btn btn--volt btn--lg" href="${SITE_URL}" data-magnetic>
            <span class="roll" data-text="Ana sayfaya dön"><span>Ana sayfaya dön</span></span>
        </a>
    </div>
</section>`;
    return 'Sayfa bulunamadı';
  }

  const [title, message, isGood] = STATUS_TEXT[receipt.phase] ?? STATUS_TEXT.cancelled;
  const end = receipt.startsAt + receipt.durationMinutes * 60 * 1000;
  main.innerHTML = `<section class="section ticket-page">
    <p class="ticket-page__eyebrow mono">Rezervasyon · <span lang="en">#</span>${receipt.code}</p>
    <h1 class="ticket-page__title${isGood ? '' : ' is-muted'}">${title}</h1>
    <p class="ticket-page__text">${esc(receipt.firstName)}, ${message}</p>

    <dl class="ticket-page__rows">
        <div><dt class="mono">Sistem</dt><dd>${esc(receipt.tierName)}</dd></div>
        <div><dt class="mono">Gün</dt><dd>${formatDate(receipt.startsAt, 'd MMMM dddd')}</dd></div>
        <div><dt class="mono">Saat</dt><dd>${formatDate(receipt.startsAt, 'HH:mm')} → ${formatDate(end, 'HH:mm')}</dd></div>
        <div><dt class="mono">Süre</dt><dd>${duration(receipt.durationMinutes)}</dd></div>
        ${receipt.stationCode ? `<div><dt class="mono">PC</dt><dd>${esc(receipt.stationCode)}</dd></div>` : ''}
    </dl>

    <div class="ticket-page__actions">
        <a class="btn btn--volt btn--lg" href="${SITE_URL}#rezervasyon" data-magnetic>
            <span class="roll" data-text="Yeni rezervasyon"><span>Yeni rezervasyon</span></span>
        </a>
        <a class="link-roll link-roll--muted" href="${SITE_URL}"><span class="roll" data-text="Ana sayfa"><span>Ana sayfa</span></span></a>
    </div>
</section>`;
  return 'Rezervasyon durumu';
}

const STATUS_TEXT = {
  pending: [
    'Onay bekliyor',
    'talebini aldık. Ekibimiz uygunluğu kontrol edip onaylayınca bu sayfada göreceksin.',
    true,
  ],
  confirmed: [
    'Onaylandı',
    "PC'n ayrıldı. Başlangıçtan biraz önce gel; kasada adını söylemen yeterli.",
    true,
  ],
  due: [
    'Onaylandı',
    "PC'n ayrıldı. Başlangıçtan biraz önce gel; kasada adını söylemen yeterli.",
    true,
  ],
  late: [
    'Bekleme süresi doldu',
    "başlangıç saatinden bu yana PC'n tutuldu ama süre doldu. Hâlâ geliyorsan kafeyi ara.",
    false,
  ],
  unanswered: [
    'Süresi geçti',
    'talebin saatinden önce onaylanamadı. Yeni bir saat için tekrar talep gönderebilirsin.',
    false,
  ],
  completed: ['Tamamlandı', 'seni ağırladık. İyi oyunlar!', true],
  noshow: ['Gelinmedi', 'rezervasyon saatinde gelmediğin için PC serbest bırakıldı.', false],
  cancelled: [
    'İptal edildi',
    'bu rezervasyon iptal edildi. Yeni bir saat için tekrar talep gönderebilirsin.',
    false,
  ],
};

/** Ana sayfanın bölümleri. Rezervasyon bölümünün içini booking.js doldurur. */
export function renderHome(state, now) {
  const main = document.getElementById('icerik');
  if (!main) return;
  const home = homeContent(state);
  const chrome = siteChrome(state, now);
  const hasPrices = home.prices.length > 0;
  main.innerHTML =
    hero(home.hero, chrome.seats) +
    hardware(home) +
    games(home.games) +
    (hasPrices ? prices(home.prices) : '') +
    booking(hasPrices ? 4 : 3);
}

function hero(h, seats) {
  return `<section class="hero" data-hero>
    <canvas class="hero__field" data-field aria-hidden="true"></canvas>
    <div class="hero__veil" aria-hidden="true"></div>

    <div class="hero__inner">
        <div class="hero__top mono" data-hero-fade>
            <p>${esc(h.eyebrow)}</p>
            <p class="hero__scroll" aria-hidden="true">Kaydır <span></span></p>
        </div>

        <h1 class="hero__title" data-hero-title>
            <span class="hero__line">${esc(h.lineOne)}</span>
            <span class="hero__line hero__line--end">${esc(h.lineTwo)}</span>
        </h1>

        <div class="hero__foot">
            <div class="hero__copy" data-hero-fade>
                <p class="hero__lead">${esc(h.lead)}</p>
                <div class="hero__actions">
                    <a class="btn btn--volt btn--lg" href="#rezervasyon" data-magnetic>
                        <span class="roll" data-text="Yerini ayırt"><span>Yerini ayırt</span></span>
                        <svg class="btn__icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </a>
                    <a class="link-roll link-roll--muted" href="#sistemler"><span class="roll" data-text="Sistemleri gör"><span>Sistemleri gör</span></span></a>
                </div>
            </div>

            <dl class="hud" data-hero-fade style="--hud-items: ${seats.total > 0 ? 4 : 3}">
                <div class="hud__item">
                    <dt>Yerel saat</dt>
                    <dd data-clock>--:--:--</dd>
                </div>
                <div class="hud__item">
                    <dt><span class="pulse" aria-hidden="true"></span>Sunucuya ping</dt>
                    <dd><span data-ping>--</span> ms</dd>
                </div>
                <div class="hud__item">
                    <dt>Açık</dt>
                    <dd>7/24</dd>
                </div>
                ${
                  seats.total > 0
                    ? `<div class="hud__item">
                    <dt>Boş PC</dt>
                    <dd data-hud-seats>${seats.available}<span class="hud__dim">/${seats.total}</span></dd>
                </div>`
                    : ''
                }
            </dl>
        </div>
    </div>
</section>`;
}

function hardware(home) {
  const tiers = home.tiers
    .map((tier) => {
      const first = tier.specs[0];
      return `<article class="tier" data-tier>
            <div class="tier__stage">
                <div class="tier__stage-inner">
                    <p class="tier__label mono"><span class="tier__dot" aria-hidden="true"></span>${esc(tier.label)}</p>
                    <h3 class="tier__name">${esc(tier.name)}</h3>
                    <div class="tier__readout" aria-hidden="true">
                        <p class="tier__figure" data-figure>${esc(first.figure)}</p>
                        <p class="tier__detail mono" data-detail>${esc(first.detail)}</p>
                    </div>
                    <div class="tier__meter" aria-hidden="true"><span data-meter style="--progress: ${+(1 / tier.specs.length).toFixed(3)}"></span></div>
                    <p class="tier__count mono" aria-hidden="true"><span data-count>01</span> / ${two(tier.specs.length)}</p>
                </div>
            </div>

            <ol class="tier__specs">
                ${tier.specs
                  .map(
                    (
                      spec,
                    ) => `<li class="spec" data-spec data-figure="${esc(spec.figure)}" data-detail="${esc(spec.detail)}">
                        <p class="spec__cat mono">${esc(spec.category)}</p>
                        <p class="spec__figure" aria-hidden="true">${esc(spec.figure)}</p>
                        <h4 class="spec__title">${esc(spec.title)}</h4>
                        <p class="spec__desc">${esc(spec.description)}</p>
                    </li>`,
                  )
                  .join('')}
            </ol>
        </article>`;
    })
    .join('');

  const gear = home.gear.length
    ? `<div class="gear">
            <p class="gear__label mono" data-reveal>Ekipman</p>
            <ul class="gear__list">
                ${home.gear
                  .map(
                    (item) => `<li class="gear__item" data-reveal>
                        <p class="mono">${esc(item.category)}</p>
                        <p class="gear__name">${esc(item.name)}</p>
                        <p class="gear__detail">${esc(item.detail)}</p>
                    </li>`,
                  )
                  .join('')}
            </ul>
        </div>`
    : '';

  return `<section class="section hardware" id="sistemler">
    <header class="section-head">
        <p class="section-head__index mono">(01)</p>
        <h2 class="section-title" data-split>Donanım cephaneliği</h2>
        <p class="section-intro" data-reveal>
            İki sınıf, tek standart: her masada rekabetçi oyunun gerektirdiği her şey. Aşağı kaydır, sistemleri parça parça incele.
        </p>
    </header>
    ${tiers}
    ${gear}
</section>`;
}

function games(list) {
  const group = (items) =>
    `<div class="marquee__group">${items
      .map(
        (game) =>
          `<span class="marquee__item"><span lang="en">${esc(game)}</span><i class="marquee__sep"></i></span>`,
      )
      .join('')}</div>`;
  const track = (items) => `<div class="marquee__track">${group(items)}${group(items)}</div>`;
  return `<section class="section games" id="oyunlar">
    <header class="section-head">
        <p class="section-head__index mono">(02)</p>
        <h2 class="section-title" data-split>Yüklü oyunlar</h2>
        <p class="section-intro" data-reveal>
            Popüler oyunlar her makinede kurulu ve güncel. Otur, giriş yap, oyna.
        </p>
    </header>

    <ul class="sr-only">${list.map((game) => `<li>${esc(game)}</li>`).join('')}</ul>

    <div class="marquee" data-marquee="1" aria-hidden="true">${track(list)}</div>
    <div class="marquee marquee--outline" data-marquee="-1" aria-hidden="true">${track([...list].reverse())}</div>
</section>`;
}

function prices(list) {
  const cards = list
    .map((tier) => {
      const rate =
        tier.hourlyRate != null
          ? `<div class="price-card__rate">
                        <p class="price-card__figure" data-count-to="${tier.hourlyRate}" data-decimals="${Number.isInteger(tier.hourlyRate) ? 0 : 2}">${money(tier.hourlyRate)}</p>
                        <p class="price-card__unit mono">/ saat</p>
                    </div>`
          : '';
      const packages = tier.packages.length
        ? `<p class="price-card__subhead mono">Paketler</p>
                    <ul class="packages">${tier.packages
                      .map((p) => {
                        // Paket adı zaten süreyi söylüyorsa ("3 saat") tekrar yazma.
                        const showDuration =
                          p.durationMinutes > 0 &&
                          duration(p.durationMinutes).toLocaleLowerCase('tr') !==
                            p.name.toLocaleLowerCase('tr');
                        return `<li class="package">
                                <span class="package__name">${esc(p.name)}</span>
                                <span class="package__leader" aria-hidden="true"></span>
                                ${showDuration ? `<span class="package__duration mono">${duration(p.durationMinutes)}</span>` : ''}
                                ${p.saving != null ? `<span class="package__saving mono">%${p.saving} avantaj</span>` : ''}
                                <span class="package__price">${money(p.price)}</span>
                            </li>`;
                      })
                      .join('')}</ul>`
        : '';
      return `<article class="price-card" data-reveal>
                <header class="price-card__head">
                    <p class="price-card__label mono"><span class="tier__dot" aria-hidden="true"></span>${esc(tier.label)}</p>
                    <h3 class="price-card__name">${esc(tier.name)}</h3>
                </header>
                ${rate}
                ${packages}
            </article>`;
    })
    .join('');
  return `<section class="section prices" id="fiyatlar">
    <header class="section-head">
        <p class="section-head__index mono">(03)</p>
        <h2 class="section-title" data-split>Fiyatlar</h2>
        <p class="section-intro" data-reveal>
            Saatlik oyna ya da paket seç. Uzun seanslarda paketler saatlik tarifeden daha avantajlı.
        </p>
    </header>

    <div class="price-grid">${cards}</div>
</section>`;
}

function booking(index) {
  return `<section class="section booking" id="rezervasyon">
    <header class="booking__head">
        <p class="booking__index mono">(${two(index)}) Rezervasyon</p>
        <h2 class="booking__title" data-split>
            <span>Yerini</span>
            <span>ayırt.</span>
        </h2>
        <p class="booking__intro" data-reveal>
            Sistemi, günü ve saati seç; talebini gönder. Ekibimiz onaylayınca PC'n seni bekler.
        </p>
    </header>

    <div class="booking__body" data-booking-body></div>
</section>`;
}
