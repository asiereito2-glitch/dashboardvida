// Perfil del modo juego: nivel, clase y atributos.
import {
  ATTRIBUTES, attributePoints, computeXp, levelInfo, playerClass,
} from '../game.js';
import { icons } from '../icons.js';
import { navigate } from '../ui.js';

// Gráfico de araña de los 5 atributos, escalado al atributo más alto.
function radar(byAttribute) {
  const size = 240;
  const c = size / 2;
  const r = 80;
  const max = Math.max(1, ...Object.values(byAttribute));
  const point = (i, ratio) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / ATTRIBUTES.length;
    return [c + Math.cos(angle) * r * ratio, c + Math.sin(angle) * r * ratio];
  };
  const ring = (ratio) => ATTRIBUTES.map((_, i) => point(i, ratio).join(',')).join(' ');
  const shape = ATTRIBUTES.map((a, i) => point(i, Math.max(0.04, byAttribute[a.id] / max)).join(',')).join(' ');
  const labels = ATTRIBUTES.map((a, i) => {
    const [x, y] = point(i, 1.28);
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="18">${a.emoji}</text>`;
  }).join('');
  return `
    <svg class="radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="Gráfico de atributos">
      ${[0.25, 0.5, 0.75, 1].map((k) => `<polygon points="${ring(k)}" fill="none" stroke="var(--surface-3)"/>`).join('')}
      ${ATTRIBUTES.map((_, i) => { const [x, y] = point(i, 1); return `<line x1="${c}" y1="${c}" x2="${x}" y2="${y}" stroke="var(--surface-3)"/>`; }).join('')}
      <polygon points="${shape}" fill="color-mix(in srgb, var(--xp) 35%, transparent)" stroke="var(--xp)" stroke-width="2"/>
      ${labels}
    </svg>`;
}

export function renderProfile(root) {
  const xp = computeXp();
  const { level, into, needed } = levelInfo(xp.total);
  const cls = playerClass(xp.byAttribute);
  const maxAttr = Math.max(1, ...Object.values(xp.byAttribute));

  root.innerHTML = `
    <header class="nav-header">
      <button class="icon-btn" data-back aria-label="Volver">${icons.back}</button>
      <h1>Perfil</h1><span></span>
    </header>

    <div class="stack">
      <div class="card level-card">
        <div class="level-badge"><b>${level}</b><span>NIVEL</span></div>
        <div class="grow">
          <div class="level-total">${xp.total.toLocaleString('es-ES')} XP</div>
          <div class="small muted">en total</div>
          <div class="xp-track big"><span style="width:${(into / needed) * 100}%"></span></div>
          <div class="small muted">${needed - into} XP para el nivel ${level + 1}</div>
        </div>
      </div>

      <div class="card class-card">
        <span class="class-emoji">${cls ? cls.emoji : '🥚'}</span>
        <div class="grow">
          <div class="small muted">Tu clase</div>
          <div class="class-name">${cls ? cls.name : 'Sin clase todavía'}</div>
          <div class="small muted">${cls ? cls.text : 'Completa hábitos para descubrir tu clase.'}</div>
        </div>
      </div>

      <div class="card">
        <div class="label">Atributos</div>
        ${radar(xp.byAttribute)}
        <div class="stack" style="margin-top:8px">
          ${ATTRIBUTES.map((a) => `
            <div class="attr-row">
              <span class="attr-emoji">${a.emoji}</span>
              <span class="attr-name">${a.label}</span>
              <div class="progress"><div style="width:${(xp.byAttribute[a.id] / maxAttr) * 100}%"></div></div>
              <b class="attr-val">${attributePoints(xp.byAttribute[a.id])}</b>
            </div>`).join('')}
        </div>
      </div>

      <div class="card small muted">
        Cada hábito cumplido da XP según su dificultad (Fácil 10 · Media 20 · Difícil 30), más un bonus por racha
        de hasta +25. Cada meta cumplida da 100 XP. Cada entrenamiento da 30 XP (si marca su hábito, la de ese hábito), cada día de lectura 10 y cada libro terminado 50. La XP sube el atributo de su categoría; puedes cambiar qué atributo sube cada categoría en
        <a href="#/settings/categories" style="color:var(--accent)">Ajustes</a>.
      </div>
    </div>`;

  root.querySelector('[data-back]').onclick = () => {
    if (history.length > 1) history.back();
    else navigate('#/today');
  };
}
