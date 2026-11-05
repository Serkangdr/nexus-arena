// Nexus Arena · hareket katmanı
// GSAP (ScrollTrigger, SplitText) ve Lenis sayfada assets/vendor altından global olarak yüklenir.
// Demo: içerik önce ortak veriden çizilir (panelde yapılan değişiklikler yansısın), sonra hareketler kurulur.

import { createSignalField } from './signal-field.js';
import { getState, subscribe, findReceipt } from './data.js';
import { renderChrome, renderHome, renderStatus, updateSeats } from './home.js';
import { mountBooking } from './booking.js';

const root = document.documentElement;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

renderContent();
init();

function renderContent() {
  const state = getState();
  const now = Date.now();
  if (document.body.dataset.page === 'status') {
    const code = new URLSearchParams(location.search).get('kod');
    const title = renderStatus(state, findReceipt(state, code, now));
    renderChrome(state, now, { onHome: false, pageTitle: title });
  } else {
    renderHome(state, now);
    renderChrome(state, now);
    mountBooking();
  }

  // Panelde başka sekmede oturum açılıp kapandıkça boş PC sayısı güncellenir.
  subscribe((latest) => updateSeats(latest, Date.now()));
  setInterval(() => updateSeats(getState(), Date.now()), 30000);
}

function init() {
  const { gsap, ScrollTrigger, SplitText, Lenis } = window;
  if (!gsap || !ScrollTrigger || !SplitText) {
    // Kütüphaneler yüklenemedi: içerik animasyonsuz görünsün.
    root.classList.remove('js');
    return;
  }
  window.__nexusReady = true;
  gsap.registerPlugin(ScrollTrigger, SplitText);

  const lenis = reducedMotion || !Lenis ? null : createSmoothScroll(gsap, ScrollTrigger, Lenis);
  // Rezervasyon formu gönderimden sonra aynı yumuşak kaydırmayı kullanır.
  window.__nexusLenis = lenis;
  const field = setupField(gsap, ScrollTrigger);

  setupAnchors(lenis);
  setupMenu(gsap, lenis);
  setupHeader(ScrollTrigger);
  setupClock();
  setupPing();

  if (reducedMotion) {
    document.querySelector('[data-loader]')?.remove();
    gsap.set('[data-hero-title]', { visibility: 'visible' });
    return;
  }

  lenis?.stop();
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  playLoader(gsap)
    .then(() => fontsReady)
    .then(() => {
      playIntro(gsap, field);
      lenis?.start();
      setupReveals(gsap, SplitText);
      setupTiers(gsap, ScrollTrigger);
      setupMarquees(gsap, ScrollTrigger);
      setupCounters(gsap);
      if (finePointer) {
        setupCursor(gsap);
        document.querySelectorAll('[data-magnetic]').forEach((el) => magnetic(gsap, el));
      }
      ScrollTrigger.refresh();
    });
}

// ---------------------------------------------------------------------------
// Kaydırma

function createSmoothScroll(gsap, ScrollTrigger, Lenis) {
  const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

function setupAnchors(lenis) {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href*="#"]');
    if (!link || link.origin !== location.origin || link.pathname !== location.pathname) return;
    const target =
      link.hash.length > 1 && document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!target) return;
    event.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    history.replaceState(null, '', link.hash);
  });
}

// Mobil menü: tam ekran açılır, bağlantılar maskenin altından yükselir. Esc ya da bir bağlantı kapatır.
function setupMenu(gsap, lenis) {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.getElementById('site-menu');
  if (!toggle || !menu) return;

  const labels = menu.querySelectorAll('[data-menu-link]');
  const srLabel = toggle.querySelector('.sr-only');
  let open = false;

  const setOpen = (value) => {
    if (value === open) return;
    open = value;
    toggle.setAttribute('aria-expanded', String(open));
    if (srLabel) srLabel.textContent = open ? 'Menüyü kapat' : 'Menüyü aç';
    root.classList.toggle('menu-open', open);
    gsap.killTweensOf([menu, labels]);

    if (open) {
      menu.hidden = false;
      lenis?.stop();
      if (!reducedMotion) {
        gsap
          .timeline()
          .fromTo(
            menu,
            { clipPath: 'inset(0% 0% 100% 0%)' },
            { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8, ease: 'expo.inOut' },
          )
          .fromTo(
            labels,
            { yPercent: 110 },
            { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06 },
            '-=0.35',
          );
      }
      menu.querySelector('a')?.focus({ preventScroll: true });
    } else {
      lenis?.start();
      const hide = () => {
        if (!open) menu.hidden = true;
      };
      if (reducedMotion) hide();
      else
        gsap.to(menu, {
          clipPath: 'inset(0% 0% 100% 0%)',
          duration: 0.6,
          ease: 'expo.inOut',
          onComplete: hide,
        });
    }
  };

  toggle.addEventListener('click', () => setOpen(!open));
  // Menü dinleyicisi belge düzeyindeki bağlantı kaydırmasından önce çalışır; kaydırma kilidi o ana kadar açılmış olur.
  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      toggle.focus();
    }
  });
  matchMedia('(min-width: 1101px)').addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
}

function setupHeader(ScrollTrigger) {
  const header = document.querySelector('[data-header]');
  if (!header) return;
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate(self) {
      const y = self.scroll();
      header.classList.toggle('is-scrolled', y > 40);
      header.classList.toggle('is-hidden', self.direction === 1 && y > window.innerHeight * 0.6);
    },
  });
}

// ---------------------------------------------------------------------------
// Açılış

function playLoader(gsap) {
  const loader = document.querySelector('[data-loader]');
  if (!loader) return Promise.resolve();

  // Aynı oturumda ikinci ziyarette açılışı kısalt.
  let seen = false;
  try {
    seen = sessionStorage.getItem('nexus:loader') === '1';
    sessionStorage.setItem('nexus:loader', '1');
  } catch {
    /* gizli sekme vb. */
  }

  const count = loader.querySelector('[data-loader-count]');
  const bar = loader.querySelector('[data-loader-bar]');
  const counter = { value: 0 };

  return new Promise((resolve) => {
    gsap
      .timeline({
        onComplete: () => {
          loader.remove();
        },
      })
      .to(counter, {
        value: 100,
        duration: seen ? 0.5 : 1.8,
        ease: 'power3.inOut',
        onUpdate: () => {
          count.textContent = String(Math.round(counter.value)).padStart(3, '0');
        },
      })
      .to(bar, { scaleX: 1, duration: seen ? 0.5 : 1.8, ease: 'power3.inOut' }, 0)
      .add(resolve)
      .to(loader, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' })
      .to(count, { yPercent: -40, opacity: 0, duration: 0.8, ease: 'expo.in' }, '<');
  });
}

function playIntro(gsap, field) {
  const { SplitText } = window;
  const title = document.querySelector('[data-hero-title]');
  const tl = gsap.timeline({ delay: 0.25 });

  if (title) {
    const lines = [...title.querySelectorAll('.hero__line')];
    const splits = lines.map((line) =>
      SplitText.create(line, { type: 'lines,chars', mask: 'lines', linesClass: 'split-line' }),
    );
    gsap.set(title, { visibility: 'visible' });
    splits.forEach((split, i) => {
      tl.from(
        split.chars,
        {
          yPercent: 140,
          rotate: 6,
          duration: 1.3,
          ease: 'expo.out',
          stagger: 0.035,
        },
        i * 0.12,
      );
    });
    tl.add(() => splits.forEach((split) => split.revert()));
  }

  tl.from(
    '[data-hero-fade]',
    { y: 24, autoAlpha: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1 },
    0.5,
  );

  if (field) {
    gsap.to(field.state, { rise: 1, duration: 2.6, ease: 'expo.out', delay: 0.1 });
  }
}

// ---------------------------------------------------------------------------
// Hero

function setupField(gsap, ScrollTrigger) {
  const canvas = document.querySelector('[data-field]');
  if (!canvas) return null;
  const field = createSignalField(canvas, { reducedMotion });
  if (!field) {
    canvas.remove();
    return null;
  }

  if (!reducedMotion) {
    ScrollTrigger.create({
      trigger: '[data-hero]',
      start: 'top top',
      end: 'bottom top',
      onUpdate: (self) => {
        field.state.scroll = self.progress;
      },
    });
    gsap.to('[data-hero-title]', {
      yPercent: -18,
      opacity: 0.25,
      ease: 'none',
      scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true },
    });
  }
  return field;
}

function setupClock() {
  const el = document.querySelector('[data-clock]');
  if (!el) return;
  const format = new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const tick = () => {
    el.textContent = format.format(new Date());
  };
  tick();
  setInterval(tick, 1000);
}

// Sunucuya gerçek gidiş-dönüş süresi: 5 ölçümün ortancası.
// Asıl uygulama /api/ping ucunu ölçer; statik demoda aynı sayfaya gövdesiz (HEAD) istek atılır.
function setupPing() {
  const el = document.querySelector('[data-ping]');
  if (!el) return;

  const measure = async () => {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const started = performance.now();
      try {
        await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' });
      } catch {
        el.textContent = '--';
        return;
      }
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    el.textContent = String(Math.max(1, Math.round(samples[2])));
  };

  measure();
  setInterval(() => {
    if (!document.hidden) measure();
  }, 8000);
}

// ---------------------------------------------------------------------------
// Bölümler

function setupReveals(gsap, SplitText) {
  document.querySelectorAll('[data-split]').forEach((el) => {
    const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'split-line' });
    gsap.from(split.lines, {
      yPercent: 110,
      duration: 1.3,
      ease: 'expo.out',
      stagger: 0.09,
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
      onComplete: () => split.revert(),
    });
  });

  gsap.utils.toArray('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      y: 36,
      autoAlpha: 0,
      duration: 1.2,
      ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
}

// Donanım: sol taraf sabit kalır, sağdaki kalem görünür oldukça büyük değer karışıp yenisine dönüşür.
function setupTiers(gsap, ScrollTrigger) {
  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px)', () => {
    const cleanups = [];

    document.querySelectorAll('[data-tier]').forEach((tier) => {
      const specs = [...tier.querySelectorAll('[data-spec]')];
      const figure = tier.querySelector('[data-figure]');
      const detail = tier.querySelector('[data-detail]');
      const meter = tier.querySelector('[data-meter]');
      const count = tier.querySelector('[data-count]');
      let active = -1;

      tier.classList.add('is-interactive');

      const activate = (index) => {
        if (index === active) return;
        active = index;
        specs.forEach((spec, i) => spec.classList.toggle('is-active', i === index));
        scramble(gsap, figure, specs[index].dataset.figure);
        scramble(gsap, detail, specs[index].dataset.detail, 0.5);
        meter.style.setProperty('--progress', String((index + 1) / specs.length));
        count.textContent = String(index + 1).padStart(2, '0');
      };

      activate(0);
      specs.forEach((spec, index) => {
        ScrollTrigger.create({
          trigger: spec,
          start: 'top 55%',
          end: 'bottom 55%',
          onToggle: (self) => self.isActive && activate(index),
        });
      });

      cleanups.push(() => {
        tier.classList.remove('is-interactive');
        specs.forEach((spec) => spec.classList.remove('is-active'));
      });
    });

    return () => cleanups.forEach((cleanup) => cleanup());
  });
}

const SCRAMBLE_CHARS = 'ABCDEFGHJKLMNPRSTUVXYZ0123456789';

function scramble(gsap, el, text, duration = 0.7) {
  if (!el || el.textContent === text) return;
  el._scramble?.kill();
  const progress = { value: 0 };
  el._scramble = gsap.to(progress, {
    value: 1,
    duration,
    ease: 'power2.out',
    onUpdate() {
      const settled = Math.floor(progress.value * text.length);
      let out = '';
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        out +=
          i < settled || ch === ' ' || ch === '·'
            ? ch
            : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0];
      }
      el.textContent = out;
    },
    onComplete() {
      el.textContent = text;
    },
  });
}

// Fiyatlar görünür olunca sıfırdan gerçek değere sayar. Sunucu biçimi ("₺120") ile aynı biçimde yazılır.
function setupCounters(gsap) {
  document.querySelectorAll('[data-count-to]').forEach((el) => {
    const target = Number(el.dataset.countTo);
    if (!Number.isFinite(target) || target <= 0) return;

    const decimals = Number(el.dataset.decimals) || 0;
    const format = new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    const state = { value: 0 };
    el.textContent = format.format(0);

    gsap.to(state, {
      value: target,
      duration: 1.8,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      onUpdate: () => {
        el.textContent = format.format(state.value);
      },
      onComplete: () => {
        el.textContent = format.format(target);
      },
    });
  });
}

// Oyun şeritleri: sürekli akar; kaydırma hızıyla hızlanır, kaydırma yönüyle yön değiştirir.
// Her izde liste iki kez var, bu yüzden konum -50% ile 0 arasında sarılır.
const MARQUEE_SPEED = 50 / 38; // saniyede iz genişliğinin yüzdesi

function setupMarquees(gsap, ScrollTrigger) {
  const wrap = gsap.utils.wrap(-50, 0);
  const rows = [...document.querySelectorAll('[data-marquee]')].map((row) => {
    const track = row.querySelector('.marquee__track');
    const item = {
      direction: Number(row.dataset.marquee) || 1,
      x: 0,
      hover: 1,
      setX: gsap.quickSetter(track, 'xPercent'),
    };
    row.addEventListener('pointerenter', () =>
      gsap.to(item, { hover: 0.12, duration: 0.6, ease: 'power2.out' }),
    );
    row.addEventListener('pointerleave', () =>
      gsap.to(item, { hover: 1, duration: 0.6, ease: 'power2.out' }),
    );
    return item;
  });
  if (!rows.length) return;

  let boost = 0;
  let scrollDirection = 1;
  let visible = false;

  ScrollTrigger.create({
    trigger: '#oyunlar',
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => {
      visible = self.isActive;
    },
    onUpdate(self) {
      scrollDirection = self.direction;
      boost = Math.max(boost, Math.min(Math.abs(self.getVelocity()) / 250, 8));
    },
  });

  gsap.ticker.add((_time, deltaMs) => {
    if (!visible) return;
    boost *= 0.94;
    const step = MARQUEE_SPEED * (deltaMs / 1000) * (1 + boost) * scrollDirection;
    rows.forEach((row) => {
      row.x = wrap(row.x - step * row.direction * row.hover);
      row.setX(row.x);
    });
  });
}

// ---------------------------------------------------------------------------
// İmleç ve mıknatıs etkisi

function setupCursor(gsap) {
  const cursor = document.querySelector('[data-cursor]');
  if (!cursor) return;
  const xTo = gsap.quickTo(cursor, 'x', { duration: 0.45, ease: 'power3.out' });
  const yTo = gsap.quickTo(cursor, 'y', { duration: 0.45, ease: 'power3.out' });

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      xTo(event.clientX);
      yTo(event.clientY);
      cursor.classList.add('is-visible');
    },
    { passive: true },
  );

  document.addEventListener('pointerover', (event) => {
    cursor.classList.toggle('is-hover', Boolean(event.target.closest('a, button, .marquee__item')));
  });
  document.documentElement.addEventListener('pointerleave', () =>
    cursor.classList.remove('is-visible'),
  );
}

function magnetic(gsap, el) {
  const strength = Number(el.dataset.magnetic) || 0.35;
  const xTo = gsap.quickTo(el, 'x', { duration: 0.8, ease: 'elastic.out(1, 0.4)' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.8, ease: 'elastic.out(1, 0.4)' });

  el.addEventListener('pointermove', (event) => {
    const rect = el.getBoundingClientRect();
    xTo((event.clientX - (rect.left + rect.width / 2)) * strength);
    yTo((event.clientY - (rect.top + rect.height / 2)) * strength);
  });
  el.addEventListener('pointerleave', () => {
    xTo(0);
    yTo(0);
  });
}
