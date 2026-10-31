import { createClient, fetchUserData, fetchOrgData, FIRST_YEAR, NAME_RE } from './github.js';
import { computeUserStats, computeOrgStats, computePartyStats } from './stats.js';
import { buildUserSlides, buildOrgSlides, buildPartySlides, storyCardHtml, shareCardHtml, fmt } from './slides.js';
import { heroGraph, blockMark, observeReveals } from './landing.js';
import { demoRaw } from './demo.js';
import { createAudio } from './audio.js';
import { haptic, haptics, confetti } from './effects.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const THIS_YEAR = new Date().getFullYear();

const settings = { org: false, private: false, lastYear: false, slow: false, haptics: haptics.enabled };
const audio = createAudio();

function melodyValues(stats) {
  if (stats.kind === 'party') return stats.weeks;
  if (stats.kind === 'org') return [...stats.byMonth, ...stats.info.hours];
  const weeks = [];
  stats.days.forEach((d, i) => { weeks[Math.floor(i / 7)] = (weeks[Math.floor(i / 7)] ?? 0) + d.contributionCount; });
  return weeks;
}

const PARTY_MAX = 8;

function partyNames(value) {
  return [...new Set(value.split(/[\s,]+/).map((n) => n.trim().replace(/^@/, '')).filter(Boolean).map((n) => n.toLowerCase()))];
}

async function loadParty(names, year, token, onProgress) {
  const members = [];
  const failed = [];
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < names.length) {
      const name = names[next++];
      try {
        members.push(computeUserStats(await loadRaw({ kind: 'user', name, year, token }, () => {})));
      } catch {
        failed.push(name);
      }
      onProgress(`Read ${++done} of ${names.length} friends…`);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  if (members.length < 2) throw new Error(`A party needs at least two people we can read.${failed.length ? ` Couldn't find: ${failed.map((n) => `@${n}`).join(', ')}.` : ''}`);
  return { stats: computePartyStats(members, year), failed };
}

async function loadRaw({ kind, name, year, token }, onProgress) {
  if (token) {
    const gql = createClient(token);
    return kind === 'org'
      ? fetchOrgData(gql, name, year, onProgress)
      : fetchUserData(gql, name, year, onProgress);
  }
  onProgress(`Reading ${name}'s ${year}…`);
  const params = new URLSearchParams({ [kind === 'org' ? 'org' : 'login']: name, year });
  const res = await fetch(`/api/${kind}?${params}`);
  if (res.status === 404 && !res.headers.get('content-type')?.includes('json')) {
    throw new Error('Public mode is not available here. Add a token instead.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Something went wrong (${res.status}).`);
  return body;
}

function animateCounters(slide) {
  slide.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (reducedMotion() || target === 0) { el.textContent = fmt(target); return; }
    const start = performance.now() + 380;
    el.textContent = '0';
    const step = (t) => {
      const k = Math.max(0, Math.min(1, (t - start) / 1300));
      const text = fmt(target * (1 - Math.pow(1 - k, 4)));
      if (text !== el.textContent) audio.tick();
      el.textContent = text;
      if (k < 1 && slide.classList.contains('active')) requestAnimationFrame(step);
      else el.textContent = fmt(target);
    };
    requestAnimationFrame(step);
  });
}

function slideMarkup(slide) {
  return `<section class="slide theme-${slide.theme}"><div class="giant" aria-hidden="true"></div>${slide.html}</section>`;
}

let stopStory = () => {};

function playStory(stats, slides) {
  const slideMs = settings.slow ? 14000 : 7000;
  const story = $('#story');
  const wipeCells = Array.from({ length: 66 }, (_, n) => `<i style="--x:${n % 6};--y:${Math.floor(n / 6)}"></i>`).join('');
  story.innerHTML = `
    <div class="frame" data-ui>
      <div class="progress">${slides.map(() => '<span><i></i></span>').join('')}</div>
      <button class="story-sound" data-action="sound" aria-label="Sound"><i></i><i></i><i></i></button>
      <button class="story-close" data-action="close" aria-label="Close">×</button>
      <div class="wipe" aria-hidden="true">${wipeCells}</div>
      ${slides.map(slideMarkup).join('')}
    </div>`;
  story.hidden = false;
  document.body.style.overflow = 'hidden';

  const frame = $('.frame', story);
  const wipe = $('.wipe', frame);
  const sections = $$('.slide', frame);
  const bars = $$('.progress i', frame);
  const soundButton = $('.story-sound', frame);
  const syncSound = ({ enabled, running }) => {
    soundButton.classList.toggle('playing', enabled && running);
    soundButton.classList.toggle('muted', !enabled);
    soundButton.setAttribute('aria-label', !enabled ? 'Turn sound on' : running ? 'Turn sound off' : 'Tap for sound');
  };
  const offSound = audio.onChange(syncSound);
  let idx = -1, elapsed = 0, paused = false, last = performance.now(), raf = 0, pressAt = 0, busy = false;
  const timers = [];
  let slideTimers = [];
  let stopConfetti = () => {};

  function celebrate(section) {
    slideTimers.forEach(clearTimeout);
    slideTimers = [];
    stopConfetti();
    frame.classList.remove('party');
    const later = (ms, fn) => slideTimers.push(setTimeout(fn, ms));
    if (section.querySelector('.bounce')) later(520, () => haptic(18));
    $$('.sticker', section).forEach((_, i) => later(720 + i * 120, () => haptic(8)));
    if (section.querySelector('.card-drop')) {
      later(760, () => {
        frame.classList.add('party');
        stopConfetti = confetti(frame);
        haptic([40, 50, 40, 50, 120]);
      });
    }
  }

  function activate(i) {
    idx = i;
    elapsed = 0;
    sections.forEach((el, j) => el.classList.toggle('active', j === idx));
    bars.forEach((b, j) => { b.style.width = j < idx ? '100%' : '0%'; });
    frame.style.setProperty('--pfg', getComputedStyle(sections[idx]).getPropertyValue('--fg'));
    audio.slide(idx, sections.length, slides[idx].theme);
    audio.outro(idx === sections.length - 1);
    audio.effects(sections[idx]);
    celebrate(sections[idx]);
    animateCounters(sections[idx]);
  }

  function show(i) {
    const next = Math.max(0, Math.min(sections.length - 1, i));
    if (next === idx || busy) return;
    if (idx === -1 || reducedMotion()) { activate(next); return; }
    busy = true;
    audio.whoosh();
    haptic(8);
    frame.style.setProperty('--wipe', getComputedStyle(sections[next]).getPropertyValue('--bg'));
    wipe.className = 'wipe cover';
    timers.push(setTimeout(() => {
      activate(next);
      wipe.className = 'wipe uncover';
      busy = false;
    }, 560));
    timers.push(setTimeout(() => { if (!busy) wipe.className = 'wipe'; }, 1200));
  }

  function tick(t) {
    const dt = t - last;
    last = t;
    if (!paused && !busy) elapsed += dt;
    if (idx >= 0) bars[idx].style.width = `${Math.min(100, (elapsed / slideMs) * 100)}%`;
    if (idx < sections.length - 1 && elapsed >= slideMs) show(idx + 1);
    raf = requestAnimationFrame(tick);
  }

  async function onAction(action, button) {
    haptic(10);
    if (action === 'sound') {
      if (!audio.enabled) audio.setEnabled(true);
      else if (audio.running) audio.setEnabled(false);
      else audio.unlock();
    } else if (action === 'close') stopStory();
    else if (action === 'replay') show(0);
    else if (action === 'copy-link') await copyLink(button);
    else if (action === 'save-card') await saveOffscreen(button, shareCardHtml(stats), `github-wrapped-${stats.login}-${stats.year}.png`, 'Saved.');
    else if (action === 'save-story') await saveOffscreen(button, storyCardHtml(stats), `github-wrapped-${stats.login}-${stats.year}-story.png`, 'Saved. Ready for your Stories.');
  }

  const onDown = (e) => {
    if (e.target.closest('button')) return;
    if (audio.enabled) audio.unlock();
    paused = true;
    pressAt = performance.now();
  };
  const onUp = (e) => {
    const button = e.target.closest('button');
    if (button) { onAction(button.dataset.action, button); return; }
    paused = false;
    if (performance.now() - pressAt > 250) return;
    const { left, width } = frame.getBoundingClientRect();
    show(e.clientX - left < width / 3 ? idx - 1 : idx + 1);
  };
  const onKey = (e) => {
    if (e.key === 'ArrowRight') show(idx + 1);
    else if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === ' ') { e.preventDefault(); paused = !paused; }
    else if (e.key === 'Escape') stopStory();
  };
  const onVisibility = () => {
    paused = document.hidden;
    if (document.hidden) audio.suspend(); else audio.resume();
  };

  frame.addEventListener('pointerdown', onDown);
  frame.addEventListener('pointerup', onUp);
  frame.addEventListener('pointercancel', () => { paused = false; });
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  stopStory = () => {
    cancelAnimationFrame(raf);
    slideTimers.forEach(clearTimeout);
    stopConfetti();
    audio.stop();
    offSound();
    timers.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    story.hidden = true;
    story.innerHTML = '';
    document.body.style.overflow = '';
    $('#setup').hidden = false;
  };

  audio.start(melodyValues(stats));
  syncSound({ enabled: audio.enabled, running: false });
  show(0);
  raf = requestAnimationFrame(tick);
}

function setStatus(message) {
  const el = $('.slide.active .share-status');
  if (el) el.textContent = message;
}

async function withBusy(button, busyLabel, work) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    await work();
  } catch (err) {
    console.error(err);
    setStatus("Couldn't save the image. Try a screenshot instead.");
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

async function renderPng(el, scale) {
  const canvas = await window.html2canvas(el, {
    backgroundColor: null,
    scale,
    useCORS: true,
    logging: false,
    onclone: (doc) => {
      const still = doc.createElement('style');
      still.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
      doc.head.append(still);
    },
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: 'image/png' });
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveOffscreen(button, html, filename, done) {
  return withBusy(button, 'Saving…', async () => {
    const host = document.createElement('div');
    host.className = 'offscreen';
    host.innerHTML = html;
    host.firstElementChild.removeAttribute('id');
    document.body.append(host);
    try {
      await Promise.all($$('img', host).map((img) => img.decode().catch(() => {})));
      const blob = await renderPng(host.firstElementChild, 3);
      await deliver(blob, filename);
      setStatus(done);
    } finally {
      host.remove();
    }
  });
}

async function copyLink(button) {
  try {
    await navigator.clipboard.writeText(location.href);
    button.textContent = 'Link copied';
    setTimeout(() => { button.textContent = 'Copy link'; }, 2000);
  } catch {
    setStatus(location.href);
  }
}

function showLoading(on) {
  const loader = $('.loader');
  if (!loader.childElementCount) {
    loader.innerHTML = Array.from({ length: 21 }, (_, n) => `<i style="--d:${(n % 7) + Math.floor(n / 7)}"></i>`).join('');
  }
  $('#loading').hidden = !on;
}

const PLATES = [
  {
    title: 'One big number',
    text: 'Every contribution you made this year, counted up in front of you, with how many days you showed up and how it compares to last year.',
    pick: (slides) => slides[1],
  },
  {
    title: 'What you spoke',
    text: 'Your languages, weighted by where your commits actually went, not by what happens to sit in your repos.',
    pick: (slides) => slides.find((s) => s.html.includes('lang-rows')),
  },
  {
    title: 'A card to share',
    text: 'The whole year on one card, with your real contribution graph, plus a 1080×1920 version made for Instagram and WhatsApp Stories.',
    pick: (_, stats) => ({ theme: 'l2', html: `<div class="card-drop">${shareCardHtml(stats)}</div>` }),
  },
];

function initShowcase(demoStats, demoSlides) {
  const plate = $('#plate');
  const tabs = $$('[data-plate]');
  function select(n, animate) {
    const p = PLATES[n];
    plate.innerHTML = `<div class="mini-frame" inert>${slideMarkup(p.pick(demoSlides, demoStats)).replace('class="slide ', 'class="slide active ')}</div>`;
    plate.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === n)));
    $('#plate-title').textContent = p.title;
    $('#plate-text').textContent = p.text;
    if (animate) {
      plate.classList.remove('swap');
      void plate.offsetWidth;
      plate.classList.add('swap');
    }
  }
  tabs.forEach((t, i) => t.addEventListener('click', () => select(i, true)));
  $('.text-tabs').addEventListener('keydown', (e) => {
    const current = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    const n = (current + delta + tabs.length) % tabs.length;
    select(n, true);
    tabs[n].focus();
  });
  select(0, false);
}

function initSetup() {
  const form = $('#setup-form');
  const nameInput = $('#name');
  const yearSelect = $('#year');
  for (let y = THIS_YEAR; y >= FIRST_YEAR; y--) yearSelect.add(new Option(y, y));
  $('#footer-year').textContent = THIS_YEAR;
  $('#last-year-more').textContent = `Your ${THIS_YEAR - 1}, complete: every day from 1 January to 31 December.`;

  const graph = heroGraph($('#hero-graph'));
  graph.write(String(THIS_YEAR));
  nameInput.addEventListener('input', () => graph.write(nameInput.value.replace(/[\s,]+/g, '-') || String(THIS_YEAR)));

  blockMark($('.block-mark'));
  observeReveals();

  const demoStats = computeUserStats(demoRaw(THIS_YEAR));
  const demoSlides = buildUserSlides(demoStats, { canCopyLink: false });
  initShowcase(demoStats, demoSlides);
  $('[data-demo]').addEventListener('click', () => {
    if (audio.enabled) audio.unlock();
    $('#setup').hidden = true;
    playStory(demoStats, buildUserSlides(demoStats, { canCopyLink: false }));
  });

  const bands = $$('.band');
  function syncKind() {
    const kind = form.elements.kind.value;
    nameInput.placeholder = { user: 'GitHub username', org: 'GitHub organization', party: 'friend1, friend2, friend3' }[kind];
    nameInput.maxLength = kind === 'party' ? 320 : 39;
    nameInput.setAttribute('aria-label', kind === 'party' ? `Up to ${PARTY_MAX} GitHub usernames, separated by commas` : 'GitHub username or organization');
  }
  function setSetting(key, on, fromForm = false) {
    if (key === 'sound' && on !== audio.enabled) audio.setEnabled(on);
    if (key === 'haptics') {
      haptics.enabled = on;
      if (on) haptic(20);
    }
    settings[key] = on;
    const band = bands.find((b) => b.dataset.setting === key);
    band.classList.toggle('on', on);
    $('.switch', band).setAttribute('aria-checked', String(on));
    if (key === 'org' && !fromForm) form.elements.kind.value = on ? 'org' : 'user';
    if (key === 'org') syncKind();
    if (key === 'lastYear' && !fromForm) yearSelect.value = String(on ? THIS_YEAR - 1 : THIS_YEAR);
    if (key === 'private' && on) setTimeout(() => $('#token').focus({ preventScroll: true }), 60);
  }
  bands.forEach((band) => {
    band.addEventListener('click', (e) => {
      if (e.target.closest('input, label, p.band-more, #token-help')) return;
      setSetting(band.dataset.setting, !settings[band.dataset.setting]);
    });
  });
  settings.sound = audio.enabled;
  setSetting('sound', audio.enabled);
  setSetting('haptics', haptics.enabled);
  audio.onChange(({ enabled }) => { if (settings.sound !== enabled) setSetting('sound', enabled); });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'kind') {
      setSetting('org', e.target.value === 'org', true);
      syncKind();
    }
    if (e.target === yearSelect) setSetting('lastYear', Number(yearSelect.value) === THIS_YEAR - 1, true);
  });

  $$('[data-focus-name]').forEach((a) => a.addEventListener('click', () => {
    setTimeout(() => nameInput.focus({ preventScroll: true }), reducedMotion() ? 0 : 500);
  }));

  async function run() {
    const kind = form.elements.kind.value;
    const token = settings.private ? $('#token').value.trim() : '';
    const name = nameInput.value.trim().replace(/^@/, '');
    const year = Number(yearSelect.value);
    const error = $('#error');
    error.textContent = '';
    if (settings.private && !token) {
      error.textContent = 'Paste your token under “Count my private work too”, or switch it off.';
      $('#token').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      return;
    }
    if (kind === 'party') {
      const names = partyNames(name);
      const bad = names.find((n) => !NAME_RE.test(n));
      if (names.length < 2) { error.textContent = 'Add at least two usernames, separated by commas.'; nameInput.focus(); return; }
      if (names.length > PARTY_MAX) { error.textContent = `A party fits up to ${PARTY_MAX} people.`; return; }
      if (bad) { error.textContent = `“${bad}” doesn't look like a GitHub username.`; return; }
      $('#setup').hidden = true;
      showLoading(true);
      try {
        const { stats } = await loadParty(names, year, token, (msg) => { $('#loading-text').textContent = msg; });
        const canCopyLink = !token;
        if (canCopyLink) history.replaceState(null, '', `?${new URLSearchParams({ party: stats.members.map((m) => m.login).join(','), year })}`);
        showLoading(false);
        playStory(stats, buildPartySlides(stats, { canCopyLink }));
      } catch (err) {
        showLoading(false);
        $('#setup').hidden = false;
        error.textContent = err.message;
        scrollTo({ top: 0 });
      }
      return;
    }
    if (!name && !(token && kind === 'user')) { error.textContent = `Type a GitHub ${kind === 'org' ? 'organization' : 'username'} first.`; nameInput.focus(); return; }
    if (name && !NAME_RE.test(name)) { error.textContent = "That doesn't look like a GitHub name."; return; }

    $('#setup').hidden = true;
    showLoading(true);
    try {
      const raw = await loadRaw({ kind, name, year, token }, (msg) => { $('#loading-text').textContent = msg; });
      const stats = kind === 'org' ? computeOrgStats(raw) : computeUserStats(raw);
      const canCopyLink = !token;
      if (canCopyLink) history.replaceState(null, '', `?${new URLSearchParams({ [kind]: stats.login, year })}`);
      const slides = kind === 'org' ? buildOrgSlides(stats, { canCopyLink }) : buildUserSlides(stats, { canCopyLink });
      showLoading(false);
      playStory(stats, slides);
    } catch (err) {
      showLoading(false);
      $('#setup').hidden = false;
      error.textContent = err.message;
      scrollTo({ top: 0 });
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (audio.enabled) audio.unlock();
    run();
  });

  const params = new URLSearchParams(location.search);
  const shared = params.get('party') ? 'party' : params.get('org') ? 'org' : params.get('user') ? 'user' : null;
  if (shared) {
    form.elements.kind.value = shared;
    setSetting('org', shared === 'org', true);
    syncKind();
    nameInput.value = shared === 'party' ? partyNames(params.get('party')).join(', ') : params.get(shared);
    graph.write(nameInput.value.replace(/[\s,]+/g, '-'));
    const y = Number(params.get('year'));
    if (y >= FIRST_YEAR && y <= THIS_YEAR) {
      yearSelect.value = String(y);
      setSetting('lastYear', y === THIS_YEAR - 1, true);
    }
    run();
  }
}

initSetup();
