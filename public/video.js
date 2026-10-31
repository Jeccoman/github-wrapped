const W = 720;
const H = 1280;
const FPS = 30;
const OUTRO_URL = 'audio/outro.mp3';
const C = {
  paper: '#f6f8fa', ink: '#0b2e17', l1: '#9be9a8', l2: '#40c463', l3: '#30a14e', l4: '#216e39',
  night: '#0d1117', sun: '#ffee4a', pumpkin: '#fe9600', dusk: '#03001c', soft: '#174227',
};
const CONFETTI = [C.l1, C.l2, C.l3, C.sun, C.pumpkin, C.paper];
const MIME_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - (1 - clamp(t)) ** 3;
const spring = (t) => {
  const x = clamp(t);
  return 1 - Math.cos(x * Math.PI * 2.4) * Math.exp(-5.5 * x);
};
const display = (size, weight = 300) => `${weight} ${size}px "Stack Sans Headline", system-ui, sans-serif`;
const body = (size, weight = 500) => `${weight} ${size}px "Stack Sans Text", system-ui, sans-serif`;

export function videoSupported() {
  const encoders = 'VideoEncoder' in window && 'AudioEncoder' in window;
  const recorder = typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream && MIME_TYPES.some((t) => MediaRecorder.isTypeSupported(t));
  return encoders || recorder;
}

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function cell(ctx, x, y, size, colour) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.2);
  ctx.fill();
}

function fitText(ctx, text, font, maxWidth, size) {
  let s = size;
  ctx.font = font(s);
  while (s > 12 && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = font(s);
  }
  return s;
}

function words(ctx, text, x, y, t, colour) {
  ctx.fillStyle = colour;
  let cx = x;
  text.split(' ').forEach((w, i) => {
    const k = easeOut((t - i * 0.08) / 0.5);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillText(w, cx, y + (1 - k) * 40);
    ctx.restore();
    cx += ctx.measureText(`${w} `).width;
  });
}

function avatarAt(ctx, img, fallback, x, y, size, t) {
  const k = spring(t / 0.8);
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((1 - k) * -0.5);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.roundRect(-size / 2, -size / 2, size, size, size * 0.2);
  ctx.clip();
  if (img) ctx.drawImage(img, -size / 2, -size / 2, size, size);
  else {
    ctx.fillStyle = C.l2;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.fillStyle = C.ink;
    ctx.font = display(size * 0.55, 500);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fallback, 0, 4);
  }
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function bigNumber(ctx, { label, value, unit, fg, soft }, t) {
  const shown = value * (1 - (1 - clamp((t - 0.3) / 1.4)) ** 4);
  ctx.font = display(52);
  words(ctx, label, 56, 300, t, soft);
  const k = spring((t - 0.3) / 0.9);
  const size = fitText(ctx, fmt(value), (s) => display(s), W - 112, 230);
  ctx.save();
  ctx.translate(56, 520);
  ctx.scale(0.3 + 0.7 * k, 0.3 + 0.7 * k);
  ctx.globalAlpha = clamp(k * 2);
  ctx.fillStyle = fg;
  ctx.font = display(size);
  ctx.fillText(fmt(shown), 0, 0);
  ctx.restore();
  ctx.font = display(44);
  ctx.globalAlpha = easeOut((t - 0.8) / 0.5);
  ctx.fillStyle = fg;
  ctx.fillText(unit, 56, 600);
  ctx.globalAlpha = 1;
}

function rain(ctx, count, colour, t) {
  const cols = 10;
  const size = 50;
  const gap = 10;
  const n = Math.min(70, count);
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const k = easeOut((t - 0.6 - i * 0.012) / 0.6);
    if (k <= 0) continue;
    const y = H - 120 - (row + 1) * (size + gap);
    cell(ctx, 56 + col * (size + gap), y - (1 - k) * 700, size, colour);
  }
}

function streakCells(ctx, days, t) {
  const n = Math.min(60, days);
  const size = 46;
  const gap = 10;
  for (let i = 0; i < n; i++) {
    const lit = t > 0.6 + i * 0.025;
    cell(ctx, 56 + (i % 11) * (size + gap), 720 + Math.floor(i / 11) * (size + gap), size, lit ? C.dusk : 'rgba(3,0,28,0.15)');
  }
}

function languageScene(ctx, langs, t) {
  ctx.font = display(52);
  words(ctx, 'Mostly in', 56, 300, t, '#9da7b3');
  const top = langs[0];
  const size = fitText(ctx, top.name, (s) => display(s, 500), W - 112, 150);
  ctx.globalAlpha = easeOut((t - 0.3) / 0.5);
  ctx.fillStyle = top.color;
  ctx.font = display(size, 500);
  ctx.fillText(top.name, 56, 460);
  ctx.globalAlpha = 1;
  langs.slice(0, 4).forEach((l, r) => {
    const y = 600 + r * 130;
    ctx.globalAlpha = easeOut((t - 0.6 - r * 0.12) / 0.4);
    ctx.fillStyle = '#e6edf3';
    ctx.font = body(30, 700);
    ctx.fillText(l.name, 56, y);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(l.pct)}%`, W - 56, y);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    const filled = Math.max(1, Math.round(l.pct / 5));
    for (let j = 0; j < 20; j++) {
      const on = j < filled && t > 0.8 + r * 0.12 + j * 0.03;
      cell(ctx, 56 + j * 30.4, y + 20, 26, on ? l.color : '#21262d');
    }
  });
}

function yearWave(ctx, days, t) {
  if (!days?.length) return;
  const max = Math.max(1, ...days.map((d) => d.contributionCount));
  const first = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const levels = ['#174227', '#2f7a45', C.l3, C.l2, C.l1];
  const pitch = 11.4;
  days.forEach((d, i) => {
    const idx = i + first;
    const col = Math.floor(idx / 7);
    if (t < 0.4 + col * 0.02) return;
    const level = d.contributionCount === 0 ? 0 : Math.min(4, Math.ceil((d.contributionCount / max) * 4));
    cell(ctx, 56 + col * pitch, 860 + (idx % 7) * pitch, pitch - 2.4, levels[level]);
  });
}

function makeConfetti() {
  return Array.from({ length: 150 }, (_, i) => {
    const side = i % 3;
    return {
      x: side === 0 ? 0 : side === 1 ? W : W / 2,
      vx: side === 0 ? 3 + Math.random() * 10 : side === 1 ? -(3 + Math.random() * 10) : (Math.random() - 0.5) * 8,
      vy: -(16 + Math.random() * 14),
      size: 14 + Math.random() * 14,
      spin: (Math.random() - 0.5) * 0.4,
      colour: CONFETTI[i % CONFETTI.length],
      delay: side === 2 ? 0.35 : 0,
    };
  });
}

function drawConfetti(ctx, pieces, t) {
  for (const p of pieces) {
    const s = Math.max(0, t - p.delay) * FPS;
    if (s <= 0) continue;
    const x = p.x + p.vx * s * 0.99 ** s;
    const y = H + p.vy * s + 0.35 * s * s;
    if (y > H + 40) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(p.spin * s);
    ctx.scale(1, 0.4 + 0.6 * Math.abs(Math.cos(s * 0.15)));
    ctx.fillStyle = p.colour;
    ctx.beginPath();
    ctx.roundRect(-p.size / 2, -p.size / 2, p.size, p.size, p.size * 0.2);
    ctx.fill();
    ctx.restore();
  }
}

function wipe(ctx, colour, k) {
  const cols = 6;
  const rows = 11;
  const w = W / cols;
  const h = H / rows;
  ctx.fillStyle = colour;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const local = clamp(k * 1.8 - (x + y) * 0.05);
      if (local <= 0) continue;
      const s = Math.min(w, h) * 1.15 * local;
      ctx.save();
      ctx.translate(x * w + w / 2, y * h + h / 2);
      ctx.rotate((1 - local) * -0.8);
      ctx.beginPath();
      ctx.roundRect(-s / 2 * (w / Math.min(w, h)), -s / 2 * (h / Math.min(w, h)), s * (w / Math.min(w, h)), s * (h / Math.min(w, h)), s * 0.2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function scenesFor(stats, images) {
  const handle = stats.kind === 'org' ? stats.login : stats.kind === 'party' ? 'Wrap Party' : `@${stats.login}`;
  const footer = (ctx, colour) => {
    ctx.font = body(24);
    ctx.fillStyle = colour;
    ctx.fillText(`${location.host} · made by @Jeccoman`, 56, H - 60);
  };
  const intro = {
    bg: C.ink,
    dur: 2.6,
    draw(ctx, t) {
      if (stats.kind === 'party') {
        stats.members.slice(0, 6).forEach((m, i) => avatarAt(ctx, images[i], m.name[0], 56 + i * 104, 360, 92, t - i * 0.08));
      } else {
        avatarAt(ctx, images[0], stats.name[0], 56, 300, 200, t);
      }
      ctx.font = display(fitText(ctx, handle, (s) => display(s), W - 112, 96));
      words(ctx, handle, 56, 640, t - 0.3, C.paper);
      ctx.font = display(56);
      words(ctx, stats.kind === 'party' ? `Our ${stats.year} on GitHub` : `${stats.year} on GitHub`, 56, 730, t - 0.5, C.l1);
      footer(ctx, C.l1);
    },
  };
  const languages = stats.languages?.length
    ? { bg: C.night, dur: 3.0, draw: (ctx, t) => languageScene(ctx, stats.languages, t) }
    : null;

  if (stats.kind === 'org') {
    return [
      intro,
      { bg: C.l2, dur: 3.2, draw: (ctx, t) => { rain(ctx, 70, C.ink, t); bigNumber(ctx, { label: 'Together we shipped', value: stats.totalCommits, unit: 'commits', fg: '#04200e', soft: '#0d4122' }, t); } },
      { bg: C.sun, dur: 3.0, draw: (ctx, t) => bigNumber(ctx, { label: 'and merged', value: stats.prs, unit: 'pull requests', fg: C.dusk, soft: '#4d4300' }, t) },
      languages ?? { bg: C.night, dur: 3.0, draw() {} },
      finale(stats.persona.title, (ctx, t) => monthStacks(ctx, stats.byMonth, t)),
    ];
  }
  if (stats.kind === 'party') {
    return [
      intro,
      { bg: C.l2, dur: 3.2, draw: (ctx, t) => { rain(ctx, 70, C.ink, t); bigNumber(ctx, { label: 'Together we made', value: stats.total, unit: 'contributions', fg: '#04200e', soft: '#0d4122' }, t); } },
      { bg: C.l1, dur: 3.0, draw: (ctx, t) => leaderboard(ctx, stats.members, t) },
      languages ?? { bg: C.night, dur: 3.0, draw() {} },
      finale(stats.streak ? `@${stats.streak.member.login}` : 'Wrap Party', (ctx, t) => partyBars(ctx, stats.members, t)),
    ];
  }
  return [
    intro,
    { bg: C.l2, dur: 3.2, draw: (ctx, t) => { rain(ctx, 70, C.ink, t); bigNumber(ctx, { label: 'This year I made', value: stats.total, unit: 'contributions', fg: '#04200e', soft: '#0d4122' }, t); } },
    { bg: C.pumpkin, dur: 3.0, draw: (ctx, t) => { bigNumber(ctx, { label: 'Longest streak', value: stats.longest, unit: stats.longest === 1 ? 'day' : 'days in a row', fg: C.dusk, soft: '#3a2100' }, t); streakCells(ctx, stats.longest, t); } },
    languages ?? { bg: C.night, dur: 3.0, draw() {} },
    finale(stats.persona.title, (ctx, t) => yearWave(ctx, stats.days, t)),
  ];

  function finale(title, extra) {
    const pieces = makeConfetti();
    return {
      bg: C.ink,
      dur: 3.6,
      draw(ctx, t) {
        ctx.font = display(48);
        const lead = { user: "I'm a", party: stats.streak ? 'The streak champion is' : 'That was the', org: 'And the title goes to' }[stats.kind];
        words(ctx, lead, 56, 360, t, C.l1);
        ctx.font = display(fitText(ctx, title, (s) => display(s, 500), W - 112, 104), 500);
        words(ctx, title, 56, 480, t - 0.2, C.paper);
        extra(ctx, t);
        footer(ctx, C.l1);
        drawConfetti(ctx, pieces, t - 0.9);
      },
    };
  }
}

function monthStacks(ctx, months, t) {
  const max = Math.max(1, ...months);
  months.forEach((v, m) => {
    const h = v ? Math.max(1, Math.round((v / max) * 8)) : 0;
    for (let r = 0; r < h; r++) {
      if (t < 0.4 + m * 0.05 + r * 0.04) continue;
      cell(ctx, 56 + m * 51, 1080 - r * 40, 34, r === h - 1 && v === max ? C.l1 : C.l3);
    }
  });
}

function partyBars(ctx, members, t) {
  const max = Math.max(1, ...members.map((m) => m.total));
  members.slice(0, 6).forEach((m, i) => {
    const y = 640 + i * 72;
    ctx.globalAlpha = easeOut((t - 0.3 - i * 0.1) / 0.4);
    ctx.font = body(26, 700);
    ctx.fillStyle = C.paper;
    ctx.fillText(`@${m.login}`, 56, y);
    ctx.globalAlpha = 1;
    const n = Math.max(1, Math.round((m.total / max) * 18));
    for (let j = 0; j < n; j++) if (t > 0.5 + i * 0.1 + j * 0.03) cell(ctx, 56 + j * 33, y + 12, 27, i === 0 ? C.l1 : C.l3);
  });
}

function leaderboard(ctx, members, t) {
  ctx.font = display(64);
  words(ctx, 'The leaderboard', 56, 300, t, C.ink);
  members.slice(0, 5).forEach((m, i) => {
    const y = 440 + i * 150;
    const k = spring((t - 0.4 - i * 0.15) / 0.7);
    ctx.save();
    ctx.translate((1 - k) * 300, 0);
    ctx.globalAlpha = clamp(k * 2);
    ctx.fillStyle = C.ink;
    ctx.font = display(i === 0 ? 76 : 52, i === 0 ? 500 : 300);
    ctx.fillText(`@${m.login}`, 56, y);
    ctx.font = body(28);
    ctx.fillStyle = '#1d5a31';
    ctx.fillText(`${fmt(m.total)} contributions`, 56, y + 46);
    ctx.restore();
  });
}

const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.mjs';
const SAMPLE_RATE = 44100;
const AUDIO_CONFIG = { codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128000 };
const VIDEO_CODECS = ['avc1.42E01F', 'avc1.4D401F', 'avc1.640028'];

async function decodeOutro() {
  try {
    const res = await fetch(OUTRO_URL);
    const ctx = new OfflineAudioContext(2, SAMPLE_RATE, SAMPLE_RATE);
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function pickVideoConfig() {
  if (!('VideoEncoder' in window) || !('AudioEncoder' in window) || !('VideoFrame' in window)) return null;
  for (const codec of VIDEO_CODECS) {
    const config = { codec, width: W, height: H, bitrate: 4_000_000, framerate: FPS };
    const { supported } = await VideoEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
    if (supported) return config;
  }
  return null;
}

async function prepare(stats) {
  await Promise.all([
    document.fonts.load(display(100)), document.fonts.load(display(100, 500)), document.fonts.load(body(30)), document.fonts.load(body(30, 700)),
  ]).catch(() => {});
  const avatarUrls = stats.kind === 'party' ? stats.members.slice(0, 6).map((m) => m.avatarUrl) : [stats.avatarUrl];
  const images = await Promise.all(avatarUrls.map(loadImage));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const scenes = scenesFor(stats, images);
  const total = scenes.reduce((n, s) => n + s.dur, 0);

  function draw(time) {
    let start = 0;
    let index = scenes.findIndex((s) => { const end = start + s.dur; if (time < end) return true; start = end; return false; });
    if (index === -1) { index = scenes.length - 1; start = total - scenes[index].dur; }
    const scene = scenes[index];
    const t = time - start;
    ctx.fillStyle = scene.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = scene.bg === C.night ? '#161b22' : 'rgba(255,255,255,0.08)';
    ctx.translate(W + 80, H + 60);
    ctx.rotate(time * 0.25);
    ctx.beginPath();
    ctx.roundRect(-420, -420, 840, 840, 168);
    ctx.fill();
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
    scene.draw(ctx, t);
    const next = scenes[index + 1];
    if (next && t > scene.dur - 0.35) wipe(ctx, next.bg, (t - (scene.dur - 0.35)) / 0.35);
    if (index > 0 && t < 0.3) wipe(ctx, scene.bg, 1 - t / 0.3);
  }

  return { canvas, draw, total };
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function encodeMp4(stats, videoConfig, onProgress) {
  const [{ Muxer, ArrayBufferTarget }, outro, { canvas, draw, total }] = await Promise.all([import(MUXER_URL), decodeOutro(), prepare(stats)]);
  const audioOk = outro && (await AudioEncoder.isConfigSupported(AUDIO_CONFIG).catch(() => ({ supported: false }))).supported;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: audioOk ? { codec: 'aac', numberOfChannels: 2, sampleRate: SAMPLE_RATE } : undefined,
    fastStart: 'in-memory',
  });
  let failure = null;
  const videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  videoEncoder.configure(videoConfig);

  const frames = Math.round(total * FPS);
  for (let i = 0; i < frames; i++) {
    if (failure) throw failure;
    draw(i / FPS);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    videoEncoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    while (videoEncoder.encodeQueueSize > 6) await nextTick();
    if (i % 5 === 0) {
      onProgress((i / frames) * 0.9);
      await nextTick();
    }
  }
  await videoEncoder.flush();

  if (audioOk) {
    const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e; } });
    audioEncoder.configure(AUDIO_CONFIG);
    const length = Math.min(outro.length, Math.round(total * SAMPLE_RATE));
    const fadeFrom = length - Math.round(0.8 * SAMPLE_RATE);
    const channels = [outro.getChannelData(0), outro.getChannelData(outro.numberOfChannels > 1 ? 1 : 0)];
    const block = 4096;
    for (let offset = 0; offset < length; offset += block) {
      const n = Math.min(block, length - offset);
      const data = new Float32Array(n * 2);
      channels.forEach((channel, c) => {
        for (let k = 0; k < n; k++) {
          const at = offset + k;
          const gain = at > fadeFrom ? Math.max(0, (length - at) / (length - fadeFrom)) : 1;
          data[c * n + k] = channel[at] * gain;
        }
      });
      const audioData = new AudioData({ format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((offset / SAMPLE_RATE) * 1e6), data });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    await audioEncoder.flush();
  }
  if (failure) throw failure;
  muxer.finalize();
  onProgress(1);
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), extension: 'mp4' };
}

async function recordRealtime(stats, onProgress) {
  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const { canvas, draw, total } = await prepare(stats);
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  await audioCtx.resume().catch(() => {});
  const dest = audioCtx.createMediaStreamDestination();
  const outro = await decodeOutro();
  const stream = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

  draw(0);
  recorder.start();
  if (outro) {
    const src = audioCtx.createBufferSource();
    src.buffer = outro;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(1, audioCtx.currentTime + total - 0.8);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + total);
    src.connect(gain).connect(dest);
    src.start();
  }
  const began = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      const time = (performance.now() - began) / 1000;
      draw(Math.min(time, total));
      onProgress(Math.min(1, time / total));
      if (time >= total) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((track) => track.stop());
  audioCtx.close();
  const type = mimeType.split(';')[0];
  return { blob: new Blob(chunks, { type }), extension: type === 'video/mp4' ? 'mp4' : 'webm' };
}

export async function recordVideo(stats, { onProgress = () => {} } = {}) {
  const videoConfig = await pickVideoConfig();
  if (videoConfig) {
    try {
      return await encodeMp4(stats, videoConfig, onProgress);
    } catch (err) {
      console.error(err);
    }
  }
  return recordRealtime(stats, onProgress);
}
