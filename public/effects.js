const STORE_KEY = 'wrapped-haptics';
const COLOURS = ['#9be9a8', '#40c463', '#30a14e', '#216e39', '#ffee4a', '#fe9600', '#f6f8fa'];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let hapticsOn = (() => { try { return localStorage.getItem(STORE_KEY) !== 'off'; } catch { return true; } })();
let iosSwitch = null;

export const haptics = {
  get enabled() { return hapticsOn; },
  set enabled(on) {
    hapticsOn = on;
    try { localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch {}
  },
};

function iosTap() {
  if (!iosSwitch) {
    iosSwitch = document.createElement('label');
    iosSwitch.setAttribute('aria-hidden', 'true');
    iosSwitch.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    iosSwitch.append(input);
    document.body.append(iosSwitch);
  }
  iosSwitch.click();
}

export function haptic(pattern = 10) {
  if (!hapticsOn) return;
  const steps = Array.isArray(pattern) ? pattern : [pattern];
  if (navigator.vibrate) {
    navigator.vibrate(steps);
    return;
  }
  if (!matchMedia('(pointer: coarse)').matches) return;
  let at = 0;
  steps.forEach((ms, i) => {
    if (i % 2 === 0) setTimeout(iosTap, at);
    at += ms;
  });
}

export function confetti(host) {
  if (reducedMotion()) return () => {};
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const { width, height } = host.getBoundingClientRect();
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const unit = Math.max(8, width / 34);
  const pieces = [];
  const spawn = (x, y, dir, count, power) => {
    for (let i = 0; i < count; i++) {
      pieces.push({
        x, y,
        vx: dir * (2 + Math.random() * 7) + (Math.random() - 0.5) * 2,
        vy: -(power * (0.6 + Math.random() * 0.6)),
        size: unit * (0.7 + Math.random() * 0.8),
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        flip: Math.random() * Math.PI,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      });
    }
  };
  const rain = (count) => {
    for (let i = 0; i < count; i++) {
      pieces.push({
        x: Math.random() * width, y: -unit * (1 + Math.random() * 6),
        vx: (Math.random() - 0.5) * 1.2, vy: 1 + Math.random() * 2,
        size: unit * (0.6 + Math.random() * 0.6),
        angle: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.15, flip: Math.random() * Math.PI,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      });
    }
  };

  spawn(0, height, 1, 70, height / 38);
  spawn(width, height, -1, 70, height / 38);
  const later = [setTimeout(() => spawn(width / 2, height, 0.4, 50, height / 34), 380), setTimeout(() => rain(60), 900)];

  let raf = 0;
  let last = performance.now();
  const frame = (t) => {
    const dt = Math.min(2, (t - last) / 16.7);
    last = t;
    ctx.clearRect(0, 0, width, height);
    for (const p of pieces) {
      p.vy += 0.32 * dt;
      p.vx *= 0.99;
      p.vy = Math.min(p.vy, 9);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      p.flip += 0.12 * dt;
      const squash = Math.abs(Math.cos(p.flip));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.scale(1, 0.35 + 0.65 * squash);
      ctx.fillStyle = p.colour;
      ctx.beginPath();
      ctx.roundRect(-p.size / 2, -p.size / 2, p.size, p.size, p.size * 0.2);
      ctx.fill();
      ctx.restore();
    }
    for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i].y > height + 40) pieces.splice(i, 1);
    if (pieces.length || performance.now() - start < 1200) raf = requestAnimationFrame(frame);
    else canvas.remove();
  };
  const start = performance.now();
  raf = requestAnimationFrame(frame);

  return () => {
    later.forEach(clearTimeout);
    cancelAnimationFrame(raf);
    canvas.remove();
  };
}
