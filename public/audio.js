const PENTATONIC = [0, 2, 4, 7, 9];
const CHORDS = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]];
const BPM = 112;
const STEP = 60 / BPM / 4;
const STORE_KEY = 'wrapped-sound';
const CUTOFF = { night: 900, deep: 1100, paper: 2200, sun: 3200, pumpkin: 2600, l1: 2400, l2: 2000, l3: 1600, l4: 1300 };

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const pentaNote = (degree, base = 72) => base + PENTATONIC[degree % 5] + 12 * Math.floor(degree / 5);

function loadPreference() {
  try { return localStorage.getItem(STORE_KEY) !== 'off'; } catch { return true; }
}

function savePreference(on) {
  try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch {}
}

export function melodyFrom(values) {
  const active = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (!active.length) return [null];
  const rank = (v) => active.findIndex((a) => a >= v) / active.length;
  return values.map((v) => (v > 0 ? pentaNote(Math.min(7, Math.floor(rank(v) * 8))) : null));
}

export function createAudio() {
  let ctx = null;
  let master, music, sfx, padFilter, noise;
  let timer = null;
  let step = 0;
  let nextTime = 0;
  let layers = 0;
  let melody = [null];
  let lastTick = 0;
  let enabled = loadPreference();
  const listeners = new Set();

  function notify() { listeners.forEach((fn) => fn(state())); }
  function state() { return { enabled, running: !!ctx && ctx.state === 'running' && !!timer }; }

  function bus(volume, into) {
    const g = ctx.createGain();
    g.gain.value = volume;
    g.connect(into);
    return g;
  }

  function ensure() {
    if (ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.connect(ctx.destination);
    master = bus(enabled ? 0.85 : 0, comp);
    music = bus(0.55, master);
    sfx = bus(0.7, master);
    padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1800;
    padFilter.connect(music);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    ctx.onstatechange = notify;
  }

  function envelope(time, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
    return g;
  }

  function tone(time, freq, { type = 'sine', volume = 0.1, attack = 0.004, decay = 0.2, out = sfx, glideTo } = {}) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, time + attack + decay);
    const g = envelope(time, volume, attack, decay);
    osc.connect(g).connect(out);
    osc.start(time);
    osc.stop(time + attack + decay + 0.05);
  }

  function burst(time, { volume = 0.15, decay = 0.05, type = 'highpass', freq = 7000, sweepTo, q = 1, out = sfx } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, time);
    filter.Q.value = q;
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, time + decay);
    const g = envelope(time, volume, 0.005, decay);
    src.connect(filter).connect(g).connect(out);
    src.start(time);
    src.stop(time + decay + 0.05);
  }

  function kick(time) { tone(time, 150, { volume: 0.9, decay: 0.22, glideTo: 42, out: music }); }
  function hat(time) { burst(time, { volume: 0.12, decay: 0.035, out: music }); }
  function clap(time) { burst(time, { volume: 0.3, decay: 0.12, type: 'bandpass', freq: 1700, q: 0.8, out: music }); }
  function bass(time, midi) { tone(time, mtof(midi), { type: 'triangle', volume: 0.32, decay: STEP * 1.8, out: music }); }
  function lead(time, midi) {
    tone(time, mtof(midi), { type: 'square', volume: 0.035, attack: 0.01, decay: STEP * 1.5, out: padFilter });
    tone(time, mtof(midi + 12), { type: 'sine', volume: 0.05, attack: 0.005, decay: STEP * 1.2, out: music });
  }
  function pad(time, chord) {
    chord.forEach((semi, i) => {
      [-6, 6].forEach((detune) => {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = mtof(60 + semi);
        osc.detune.value = detune + i;
        const g = ctx.createGain();
        const len = STEP * 16;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.022, time + 0.4);
        g.gain.setValueAtTime(0.022, time + len - 0.3);
        g.gain.linearRampToValueAtTime(0.0001, time + len);
        osc.connect(g).connect(padFilter);
        osc.start(time);
        osc.stop(time + len + 0.05);
      });
    });
  }

  function playStep(s, t) {
    const pos = s % 16;
    const chord = CHORDS[Math.floor(s / 16) % CHORDS.length];
    if (pos === 0) pad(t, chord);
    if (layers >= 1) {
      if (pos === 0 || pos === 8 || (layers >= 3 && pos === 10)) kick(t);
      if (pos % 4 === 2) hat(t);
    }
    if (layers >= 2) {
      if (pos === 4 || pos === 12) clap(t);
      if ([0, 3, 6, 8, 11, 14].includes(pos)) bass(t, 36 + chord[0] + (pos === 6 || pos === 14 ? 12 : 0));
    }
    if (layers >= 3 && pos % 2 === 0) {
      const note = melody[(s / 2) % melody.length];
      if (note !== null && note !== undefined) lead(t, note);
    }
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.12) {
      playStep(step, nextTime);
      nextTime += STEP;
      step++;
    }
  }

  return {
    get enabled() { return enabled; },
    get running() { return state().running; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().then(notify, () => {});
      return ctx?.state === 'running';
    },

    start(values) {
      ensure();
      if (!ctx) return;
      melody = melodyFrom(values);
      step = 0;
      layers = 0;
      nextTime = ctx.currentTime + 0.08;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(enabled ? 0.85 : 0, ctx.currentTime);
      clearInterval(timer);
      timer = setInterval(schedule, 25);
      notify();
    },

    stop() {
      clearInterval(timer);
      timer = null;
      if (!ctx) return;
      master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
      notify();
    },

    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended' && timer) ctx.resume(); },

    setEnabled(on) {
      enabled = on;
      savePreference(on);
      if (ctx) master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.08);
      if (on) this.unlock();
      notify();
    },

    slide(index, count, theme) {
      if (!ctx) return;
      layers = index === 0 ? 0 : index === 1 ? 1 : index < 4 ? 2 : 3;
      if (index === count - 1) layers = 3;
      padFilter.frequency.setTargetAtTime(CUTOFF[theme] ?? 1800, ctx.currentTime, 0.4);
    },

    whoosh() {
      if (!ctx || !enabled) return;
      burst(ctx.currentTime, { volume: 0.22, decay: 0.42, type: 'bandpass', freq: 380, sweepTo: 3600, q: 1.4 });
    },

    tick() {
      if (!ctx || !enabled) return;
      const now = ctx.currentTime;
      if (now - lastTick < 0.045) return;
      lastTick = now;
      tone(now, 2100, { volume: 0.025, decay: 0.018 });
    },

    effects(section) {
      if (!ctx || !enabled) return;
      const t0 = ctx.currentTime;
      const at = (s) => t0 + s;
      const q = (sel) => section.querySelectorAll(sel);

      if (section.querySelector('.avatar.pop')) tone(at(0.12), 520, { type: 'triangle', volume: 0.16, decay: 0.16, glideTo: 1040 });
      if (section.querySelector('.bounce')) {
        tone(at(0.5), 1568, { volume: 0.09, decay: 0.7 });
        tone(at(0.5), 2093, { volume: 0.06, decay: 0.9 });
      }

      const rain = q('.rain i').length;
      if (rain) {
        const hits = Math.min(28, rain);
        for (let k = 0; k < hits; k++) {
          const i = Math.floor((k / hits) * rain);
          tone(at(0.5 + i * 0.009 + 0.75), mtof(pentaNote(k % 10, 76)), { volume: 0.05, decay: 0.07 });
        }
      }

      const streak = q('.streak i').length;
      if (streak) {
        const notes = Math.min(20, streak);
        for (let k = 0; k < notes; k++) {
          const i = Math.floor((k / notes) * streak);
          tone(at(0.5 + i * 0.018), mtof(pentaNote(k, 64)), { type: 'triangle', volume: 0.07, decay: 0.12 });
        }
      }

      if (section.querySelector('.year-grid')) {
        for (let k = 0; k < 14; k++) tone(at(0.3 + k * 0.06), mtof(pentaNote(k, 72)), { volume: 0.04, decay: 0.25 });
      }

      q('.lang-rows li').forEach((_, i) => tone(at(0.55 + i * 0.09), mtof(pentaNote(i * 2, 67)), { type: 'triangle', volume: 0.07, decay: 0.14 }));
      q('.stacks .stack').forEach((_, i) => { if (i < 24) tone(at(0.4 + i * 0.05), mtof(pentaNote(i, 64)), { volume: 0.035, decay: 0.1 }); });
      q('.podium li, .figures li').forEach((_, i) => tone(at(0.2 + (i + 3) * 0.09), mtof(pentaNote(i + 3, 67)), { type: 'triangle', volume: 0.06, decay: 0.12 }));
      q('.sticker').forEach((_, i) => {
        const t = at(0.6 + i * 0.12 + 0.12);
        tone(t, 700 + i * 90, { type: 'triangle', volume: 0.12, decay: 0.08, glideTo: 1400 + i * 120 });
        burst(t, { volume: 0.08, decay: 0.03 });
      });
      if (section.querySelector('.card-drop')) {
        tone(at(0.75), 120, { volume: 0.5, decay: 0.25, glideTo: 50 });
        tone(at(0.8), mtof(84), { volume: 0.06, decay: 0.6 });
      }
    },
  };
}
