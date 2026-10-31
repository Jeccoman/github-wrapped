const FONT = {
  a: '01110 10001 10001 11111 10001 10001 10001', b: '11110 10001 10001 11110 10001 10001 11110',
  c: '01111 10000 10000 10000 10000 10000 01111', d: '11110 10001 10001 10001 10001 10001 11110',
  e: '11111 10000 10000 11110 10000 10000 11111', f: '11111 10000 10000 11110 10000 10000 10000',
  g: '01111 10000 10000 10011 10001 10001 01111', h: '10001 10001 10001 11111 10001 10001 10001',
  i: '11111 00100 00100 00100 00100 00100 11111', j: '00111 00010 00010 00010 00010 10010 01100',
  k: '10001 10010 10100 11000 10100 10010 10001', l: '10000 10000 10000 10000 10000 10000 11111',
  m: '10001 11011 10101 10101 10001 10001 10001', n: '10001 11001 10101 10011 10001 10001 10001',
  o: '01110 10001 10001 10001 10001 10001 01110', p: '11110 10001 10001 11110 10000 10000 10000',
  q: '01110 10001 10001 10001 10101 10010 01101', r: '11110 10001 10001 11110 10100 10010 10001',
  s: '01111 10000 10000 01110 00001 00001 11110', t: '11111 00100 00100 00100 00100 00100 00100',
  u: '10001 10001 10001 10001 10001 10001 01110', v: '10001 10001 10001 10001 10001 01010 00100',
  w: '10001 10001 10001 10101 10101 10101 01010', x: '10001 10001 01010 00100 01010 10001 10001',
  y: '10001 10001 01010 00100 00100 00100 00100', z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10011 10101 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11110 00001 00001 01110 00001 00001 11110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  '-': '00000 00000 00000 11111 00000 00000 00000',
};

const LEAD_COLS = 3;

function noiseLevel(col, row) {
  const n = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453;
  const r = n - Math.floor(n);
  return r < 0.72 ? 0 : r < 0.92 ? 1 : 2;
}

function litCells(text) {
  const lit = new Set();
  [...text.toLowerCase()].forEach((ch, k) => {
    const glyph = FONT[ch];
    if (!glyph) return;
    glyph.split(' ').forEach((bits, row) => {
      [...bits].forEach((bit, x) => { if (bit === '1') lit.add(`${LEAD_COLS + k * 6 + x}:${row}`); });
    });
  });
  return lit;
}

function cellSize() {
  const w = innerWidth;
  return w <= 760 ? w * 0.064 : Math.min(50, Math.max(18, w * 0.032));
}

export function heroGraph(graph) {
  const stage = graph.parentElement;
  let previous = new Set();
  let text = '';

  function render() {
    const cell = cellSize();
    const gap = cell * 0.2;
    const step = cell + gap;
    const visible = Math.ceil(stage.clientWidth / step) + 2;
    const cols = Math.max(visible, LEAD_COLS + text.length * 6 + LEAD_COLS);
    const lit = litCells(text);
    let rects = '';
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 7; r++) {
        const key = `${c}:${r}`;
        let cls = `v${noiseLevel(c, r)}`;
        if (lit.has(key)) cls = previous.has(key) ? 'lit' : 'on';
        rects += `<rect class="${cls}" x="${(c * step).toFixed(1)}" y="${(r * step).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" rx="${(cell * 0.2).toFixed(1)}" style="--c:${c};--r:${r};--k:${c}"/>`;
      }
    }
    const width = cols * step - gap;
    const height = 7 * step - gap;
    graph.innerHTML = `<svg width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(1)} ${height.toFixed(1)}" role="img" aria-label="Contribution graph spelling ${text}">${rects}</svg>`;
    previous = lit;

    const overflow = width - stage.clientWidth + step;
    const needsDrift = (LEAD_COLS + text.length * 6) * step > stage.clientWidth;
    graph.style.setProperty('--shift', needsDrift ? `${-Math.round(overflow)}px` : '0px');
    graph.style.setProperty('--drift-time', needsDrift ? `${Math.max(6, overflow / 50)}s` : '0s');
  }

  graph.classList.add('wave');
  setTimeout(() => graph.classList.remove('wave'), 1800);
  addEventListener('resize', render);

  return {
    write(value) {
      const next = value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
      if (next === text && graph.childElementCount) return;
      text = next;
      render();
    },
  };
}

export function blockMark(el, word = 'WRAPPED') {
  const heights = [100, 70, 88, 62, 96, 76, 86];
  const colours = ['var(--l1)', 'var(--l2)', 'var(--sun)', 'var(--l3)', 'var(--pumpkin)', 'var(--l1)', 'var(--l2)'];
  el.innerHTML = [...word].map((ch, i) => `<span style="--h:${heights[i % heights.length]}%;--i:${i};background:${colours[i % colours.length]}">${ch}</span>`).join('');
}

export function observeReveals() {
  const targets = document.querySelectorAll('.reveal, .shutter, .block-mark');
  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('in-view'));
    return;
  }
  const watched = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      watched.get(entry.target).classList.add('in-view');
      io.unobserve(entry.target);
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });
  targets.forEach((el) => {
    const observed = el.classList.contains('shutter') ? el.parentElement : el;
    watched.set(observed, el);
    io.observe(observed);
  });
}
