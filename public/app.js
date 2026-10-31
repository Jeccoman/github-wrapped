import { createClient, fetchUserData, fetchOrgData, FIRST_YEAR, NAME_RE } from './github.js';
import { computeUserStats, computeOrgStats } from './stats.js';
import { buildUserSlides, buildOrgSlides, storyCardHtml, fmt } from './slides.js';

const SLIDE_MS = 7000;
const $ = (sel, el = document) => el.querySelector(sel);

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
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  slide.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    if (reduce || target === 0) { el.textContent = fmt(target); return; }
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / 1200);
      el.textContent = fmt(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1 && slide.classList.contains('active')) requestAnimationFrame(step);
      else el.textContent = fmt(target);
    };
    requestAnimationFrame(step);
  });
}

let stopStory = () => {};

function playStory(stats, slides) {
  const story = $('#story');
  story.innerHTML = `
    <div class="frame">
      <div class="progress">${slides.map(() => '<span><i></i></span>').join('')}</div>
      <button class="story-close" data-action="close" aria-label="Close">×</button>
      ${slides.map((s) => `<section class="slide theme-${s.theme}">${s.html}</section>`).join('')}
    </div>`;
  story.hidden = false;

  const frame = $('.frame', story);
  const sections = [...frame.querySelectorAll('.slide')];
  const bars = [...frame.querySelectorAll('.progress i')];
  let idx = 0, elapsed = 0, paused = false, last = performance.now(), raf = 0, pressAt = 0;

  function show(i) {
    idx = Math.max(0, Math.min(sections.length - 1, i));
    elapsed = 0;
    sections.forEach((el, j) => el.classList.toggle('active', j === idx));
    bars.forEach((b, j) => { b.style.width = j < idx ? '100%' : '0%'; });
    animateCounters(sections[idx]);
  }

  function tick(t) {
    const dt = t - last;
    last = t;
    if (!paused) elapsed += dt;
    bars[idx].style.width = `${Math.min(100, (elapsed / SLIDE_MS) * 100)}%`;
    if (idx < sections.length - 1 && elapsed >= SLIDE_MS) show(idx + 1);
    raf = requestAnimationFrame(tick);
  }

  async function onAction(action, button) {
    if (action === 'close') stopStory();
    else if (action === 'replay') show(0);
    else if (action === 'copy-link') await copyLink(button);
    else if (action === 'save-card') await saveImage(button, () => $('#share-card'), `${stats.login}-${stats.year}`);
    else if (action === 'save-story') await saveStoryImage(button, stats);
  }

  const onDown = (e) => {
    if (e.target.closest('button')) return;
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
  const onVisibility = () => { paused = document.hidden; };

  frame.addEventListener('pointerdown', onDown);
  frame.addEventListener('pointerup', onUp);
  frame.addEventListener('pointercancel', () => { paused = false; });
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  stopStory = () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    story.hidden = true;
    story.innerHTML = '';
    $('#setup').hidden = false;
  };

  show(0);
  raf = requestAnimationFrame(tick);
}

function setStatus(message) {
  const el = $('.share-status');
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
  const canvas = await window.html2canvas(el, { backgroundColor: null, scale, useCORS: true, logging: false });
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

function saveImage(button, getEl, slug) {
  return withBusy(button, 'Saving…', async () => {
    const blob = await renderPng(getEl(), 3);
    await deliver(blob, `github-wrapped-${slug}.png`);
    setStatus('Saved.');
  });
}

function saveStoryImage(button, stats) {
  return withBusy(button, 'Saving…', async () => {
    const host = document.createElement('div');
    host.className = 'offscreen';
    host.innerHTML = storyCardHtml(stats);
    document.body.append(host);
    try {
      await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
      const blob = await renderPng(host.firstElementChild, 3);
      await deliver(blob, `github-wrapped-${stats.login}-${stats.year}-story.png`);
      setStatus('Saved. Ready for your Stories.');
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

function initSetup() {
  const form = $('#setup-form');
  const yearSelect = $('#year');
  const thisYear = new Date().getFullYear();
  for (let y = thisYear; y >= FIRST_YEAR; y--) yearSelect.add(new Option(y, y));

  const tokenToggle = $('#use-token');
  const syncMode = () => {
    const kind = form.elements.kind.value;
    const withToken = tokenToggle.checked;
    $('#token-field').hidden = !withToken;
    $('#token').required = withToken;
    $('#name').required = !withToken;
    $('#name-label').textContent = kind === 'org' ? 'Organization' : 'Username';
    $('#name').placeholder = kind === 'org' ? 'skyconnect' : 'octocat';
    $('#name-hint').textContent = withToken && kind === 'user' ? '(blank = token owner)' : '';
  };
  form.addEventListener('change', syncMode);

  async function run() {
    const kind = form.elements.kind.value;
    const token = tokenToggle.checked ? $('#token').value.trim() : '';
    const name = $('#name').value.trim().replace(/^@/, '');
    const year = Number(yearSelect.value);
    $('#error').textContent = '';
    if (name && !NAME_RE.test(name)) { $('#error').textContent = "That doesn't look like a GitHub name."; return; }
    if (kind === 'org' && !name) { $('#error').textContent = 'Enter an organization name.'; return; }

    $('#setup').hidden = true;
    $('#loading').hidden = false;
    try {
      const raw = await loadRaw({ kind, name, year, token }, (msg) => { $('#loading-text').textContent = msg; });
      const stats = kind === 'org' ? computeOrgStats(raw) : computeUserStats(raw);
      const canCopyLink = !token;
      if (canCopyLink) history.replaceState(null, '', `?${new URLSearchParams({ [kind]: stats.login, year })}`);
      const slides = kind === 'org' ? buildOrgSlides(stats, { canCopyLink }) : buildUserSlides(stats, { canCopyLink });
      $('#loading').hidden = true;
      playStory(stats, slides);
    } catch (err) {
      $('#loading').hidden = true;
      $('#setup').hidden = false;
      $('#error').textContent = err.message;
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); run(); });

  const params = new URLSearchParams(location.search);
  const shared = params.get('org') ? 'org' : params.get('user') ? 'user' : null;
  if (shared) {
    form.elements.kind.value = shared;
    $('#name').value = params.get(shared);
    if (Number(params.get('year')) >= FIRST_YEAR && Number(params.get('year')) <= thisYear) yearSelect.value = params.get('year');
  }
  syncMode();
  if (shared) run();
}

initSetup();
