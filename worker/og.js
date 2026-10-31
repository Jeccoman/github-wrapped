import { CellCanvas } from './png.js';
import { argmax } from '../public/stats.js';

const W = 1200;
const H = 630;
const MARGIN = 56;
const PALETTE = {
  bg: '#0b2e17',
  v0: '#174227',
  v1: '#2f7a45',
  v2: '#30a14e',
  v3: '#40c463',
  v4: '#9be9a8',
  paper: '#f6f8fa',
  sun: '#ffee4a',
  pumpkin: '#fe9600',
};
const LEVELS = ['v0', 'v1', 'v2', 'v3', 'v4'];
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function noise(c, r) {
  const n = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
  const v = n - Math.floor(n);
  return v < 0.55 ? 0 : v < 0.78 ? 1 : v < 0.92 ? 2 : v < 0.98 ? 3 : 4;
}

function header(canvas, handle, year) {
  canvas.text(handle.toUpperCase(), MARGIN, MARGIN, canvas.fitPitch(handle, 7, 640), 'paper');
  canvas.text(`WRAPPED ${year}`, W - MARGIN, MARGIN + 7, 5, 'v4', { align: 'right' });
}

function headline(canvas, number, label) {
  const pitch = canvas.fitPitch(number, 22, 640);
  canvas.text(number, MARGIN, 150, pitch, 'v3');
  canvas.text(label.toUpperCase(), MARGIN, 150 + 7 * pitch + 22, canvas.fitPitch(label, 6, 640), 'v4');
}

function facts(canvas, items) {
  const x = 760;
  const width = W - MARGIN - x;
  let y = 140;
  for (const [label, value] of items) {
    canvas.text(label.toUpperCase(), x, y, 4, 'v2');
    y += 7 * 4 + 10;
    canvas.text(value.toUpperCase(), x, y, canvas.fitPitch(value, 5, width), 'paper');
    y += 7 * 5 + 24;
  }
}

function yearGrid(canvas, days) {
  const pitch = 20;
  const size = 16;
  const top = H - 44 - 7 * pitch + (pitch - size);
  const max = Math.max(1, ...days.map((d) => d.contributionCount));
  const first = days.length ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay() : 0;
  const left = (W - 53 * pitch + (pitch - size)) / 2;
  days.forEach((d, i) => {
    const idx = i + first;
    const level = d.contributionCount === 0 ? 0 : Math.min(4, Math.ceil((d.contributionCount / max) * 4));
    canvas.cell(left + Math.floor(idx / 7) * pitch, top + (idx % 7) * pitch, size, LEVELS[level]);
  });
}

function monthBars(canvas, months) {
  const pitch = 20;
  const size = 16;
  const top = H - 44 - 7 * pitch + (pitch - size);
  const max = Math.max(1, ...months);
  const hot = argmax(months);
  const colsPerMonth = 3;
  const left = (W - (12 * colsPerMonth + 11) * pitch + (pitch - size)) / 2;
  months.forEach((v, m) => {
    const height = v === 0 ? 0 : Math.max(1, Math.round((v / max) * 7));
    for (let c = 0; c < colsPerMonth; c++) {
      for (let r = 0; r < 7; r++) {
        const filled = 7 - r <= height;
        const x = left + (m * (colsPerMonth + 1) + c) * pitch;
        canvas.cell(x, top + r * pitch, size, filled ? (m === hot ? 'v4' : 'v2') : 'v0');
      }
    }
  });
}

export function userCard(s) {
  const canvas = new CellCanvas(W, H, PALETTE);
  header(canvas, `@${s.login}`, s.year);
  headline(canvas, fmt(s.total), 'contributions');
  facts(canvas, [
    ['Longest streak', `${fmt(s.longest)} ${s.longest === 1 ? 'day' : 'days'}`],
    ['Top language', s.languages[0]?.name ?? '-'],
    ['Top repo', s.repos[0]?.nameWithOwner.split('/')[1] ?? '-'],
  ]);
  yearGrid(canvas, s.days);
  return canvas.png();
}

export function orgCard(s) {
  const canvas = new CellCanvas(W, H, PALETTE);
  header(canvas, s.login, s.year);
  headline(canvas, fmt(s.totalCommits), 'commits');
  facts(canvas, [
    ['PRs merged', fmt(s.prs)],
    ['Top language', s.languages[0]?.name ?? '-'],
    ['Top repo', s.repos[0]?.nameWithOwner.split('/')[1] ?? '-'],
  ]);
  monthBars(canvas, s.byMonth);
  return canvas.png();
}

export function defaultCard(year) {
  const canvas = new CellCanvas(W, H, PALETTE);
  const pitch = 21;
  const size = 17;
  const cols = Math.ceil(W / pitch) + 1;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 7; r++) canvas.cell(c * pitch - 8, H - 7 * pitch - 12 + r * pitch, size, LEVELS[noise(c, r)]);
  }
  canvas.text('WRAPPED', W / 2, 96, 20, 'v3', { align: 'center' });
  canvas.text('YOUR YEAR IN CODE', W / 2, 96 + 7 * 20 + 36, 7, 'paper', { align: 'center' });
  canvas.text(`GITHUB ${year}`, W / 2, 96 + 7 * 20 + 36 + 7 * 7 + 22, 5, 'v4', { align: 'center' });
  return canvas.png();
}
