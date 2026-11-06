// Mapa muscular: cuerpo por delante y por detrás, con cada grupo coloreado según su % de series.
import { MUSCLES } from '../gym.js';

const MIN_OPACITY = 0.25;
const SIZE = 'viewBox="0 0 120 256"';

// Mitad izquierda del cuerpo; la derecha se dibuja como su reflejo.
const SHAPES = {
  shoulders: 'M41 38C33 38 28 44 27 53L26 62C32 61 38 56 41 50Z',
  chest: 'M59 40L44 40C41 46 41 54 43 60C48 64 55 64 59 61Z',
  upperArm: 'M26 65C24 73 22 83 23 93L31 93C34 83 37 72 39 59C35 62 30 64 26 65Z',
  forearms: 'M22 96C20 106 18 116 18 126L24 127C27 116 31 106 31 96Z',
  abs: 'M59 64C53 67 48 66 44 63C44 76 45 90 47 102L59 108Z',
  quads: 'M58 113C52 110 47 108 43 106C40 125 40 150 44 176L55 176C58 155 59 135 58 113Z',
  shins: 'M44 190C42 205 43 222 46 238L53 238C56 222 57 205 55 190Z',
  back: 'M59 38L44 39C41 46 41 54 43 62C44 72 47 84 50 96L59 100Z',
  glutes: 'M59 103L48 99C43 104 42 114 44 122C49 127 55 126 59 122Z',
  hamstrings: 'M57 126C52 130 47 128 43 125C41 140 41 160 45 176L55 176C57 160 58 142 57 126Z',
  calves: 'M44 190C41 200 42 212 46 222L47 238L53 238L54 222C58 212 58 200 55 190Z',
};

const NEUTRAL = `
  <path d="M19 129C16 133 16 140 19 143C23 143 25 136 24 130Z"/>
  <ellipse cx="49.5" cy="183" rx="5.5" ry="5"/>
  <path d="M46 241L54 241L55 250C50 252 45 252 42 250Z"/>`;

// Grupo → forma que lo pinta en cada vista, y dónde va su %.
const FRONT = [
  { shape: 'shoulders', muscle: 'shoulders', label: [33, 51] },
  { shape: 'chest', muscle: 'chest', label: [60, 53] },
  { shape: 'upperArm', muscle: 'biceps', label: [30, 80] },
  { shape: 'forearms', muscle: 'forearms', label: [24, 112] },
  { shape: 'abs', muscle: 'abs', label: [60, 86] },
  { shape: 'quads', muscle: 'quads', label: [49, 142] },
  { shape: 'shins', muscle: null },
];
const BACK = [
  { shape: 'shoulders', muscle: 'shoulders' },
  { shape: 'back', muscle: 'back', label: [60, 68] },
  { shape: 'upperArm', muscle: 'triceps', label: [30, 80] },
  { shape: 'forearms', muscle: null },
  { shape: 'glutes', muscle: 'glutes', label: [60, 115] },
  { shape: 'hamstrings', muscle: 'hamstrings', label: [49, 150] },
  { shape: 'calves', muscle: 'calves', label: [49, 208] },
];

function figure(parts, title, shareOf, top) {
  const halves = parts.map((part) => {
    const pct = part.muscle ? shareOf(part.muscle) : 0;
    const style = pct ? ` class="on" fill-opacity="${MIN_OPACITY + (1 - MIN_OPACITY) * (pct / top)}"` : '';
    return `<path d="${SHAPES[part.shape]}"${style}/>`;
  }).join('');
  const labels = parts
    .filter((part) => part.label && shareOf(part.muscle))
    .map((part) => `<text x="${part.label[0]}" y="${part.label[1]}">${shareOf(part.muscle)}%</text>`)
    .join('');
  return `
    <figure class="body-figure">
      <svg ${SIZE} role="img" aria-label="${title}">
        <ellipse cx="60" cy="16" rx="10" ry="13"/>
        <rect x="54.5" y="28" width="11" height="9" rx="2"/>
        ${NEUTRAL}
        <g transform="translate(120 0) scale(-1 1)">${NEUTRAL}</g>
        ${halves}
        <g transform="translate(120 0) scale(-1 1)">${halves}</g>
        ${labels}
      </svg>
      <figcaption class="small muted">${title}</figcaption>
    </figure>`;
}

// `shares`: [{ id, pct }] ordenado de mayor a menor.
export function bodyMap(shares) {
  const byId = new Map(shares.map((s) => [s.id, s.pct]));
  const shareOf = (id) => byId.get(id) || 0;
  const top = Math.max(1, ...shares.map((s) => s.pct));
  return `
    <div class="body-map">
      ${figure(FRONT, 'Delante', shareOf, top)}
      ${figure(BACK, 'Detrás', shareOf, top)}
    </div>`;
}

export function muscleRows(shares) {
  const top = Math.max(1, ...shares.map((s) => s.pct));
  return shares.map((s) => `
    <div class="wd-row muscle-row">
      <span class="muscle-name">${MUSCLES.find((m) => m.id === s.id).label}</span>
      <div class="progress"><div class="muscle-bar" style="width:${(s.pct / top) * 100}%"></div></div>
      <span class="pct">${s.pct}%</span>
    </div>`).join('');
}
