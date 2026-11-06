// Pestaña Metas: metas en curso y vitrina de metas cumplidas.
import {
  activeGoals, completedGoals, currentValue, fmtValue, forecast, goalSeries, progress,
} from '../goals.js';
import { relativeDayLabel } from '../dates.js';
import { icons } from '../icons.js';
import { esc, navigate } from '../ui.js';

export const STATUS = {
  ontrack: { label: 'En camino', cls: 'ok' },
  tight: { label: 'Vas justo', cls: 'warn' },
  late: { label: 'Vas tarde', cls: 'bad' },
  expired: { label: 'Plazo vencido', cls: 'bad' },
};

export function statusPill(status) {
  const s = STATUS[status];
  return s ? `<span class="status-pill ${s.cls}">${s.label}</span>` : '';
}

function deadlineText(f) {
  if (f.daysLeft === undefined) return 'Sin fecha límite';
  if (f.daysLeft < 0) return 'Plazo vencido';
  if (f.daysLeft === 0) return 'Termina hoy';
  return `Quedan ${f.daysLeft} día${f.daysLeft === 1 ? '' : 's'}`;
}

function goalCard(goal) {
  const p = progress(goal);
  const f = forecast(goal);
  return `
    <div class="card goal-card" data-open="${goal.id}" role="button">
      <div class="goal-top">
        <span class="goal-emoji">${esc(goal.emoji)}</span>
        <span class="grow goal-name">${esc(goal.name)}</span>
        ${statusPill(f.status)}
      </div>
      <div class="goal-values">
        <b>${fmtValue(goal, currentValue(goal))}</b>
        <span class="muted"> / ${fmtValue(goal, goal.target)}</span>
      </div>
      <div class="progress goal-progress"><div style="width:${p * 100}%"></div></div>
      <div class="goal-foot small muted">
        <span>${Math.round(p * 100)}%</span>
        <span>${deadlineText(f)}</span>
      </div>
    </div>`;
}

function activeTab() {
  const goals = activeGoals();
  if (goals.length) return `<div class="stack">${goals.map(goalCard).join('')}</div>`;
  return `
    <div class="card empty">
      <div class="big">🎯</div>
      ${completedGoals().length ? 'No tienes metas en curso.' : 'Todavía no tienes metas.'}<br>
      <span class="small">Ahorrar dinero, ir X veces al gimnasio, llegar a un peso…</span><br>
      <button class="primary-btn" data-new>${icons.plus} Crear meta</button>
    </div>`;
}

function doneTab() {
  const done = completedGoals();
  if (!done.length) return '<div class="card empty"><div class="big">🏆</div>Aquí aparecerán las metas que cumplas.</div>';
  return `
    <div class="option-list">
      ${done.map((g) => `
        <button data-open="${g.id}">
          <span style="font-size:22px">${esc(g.emoji)}</span>
          <span class="grow">${esc(g.name)}<span class="small muted" style="display:block">${fmtValue(g, g.target)} · ${relativeDayLabel(g.completedAt)}</span></span>
          ${icons.chevronRight}
        </button>`).join('')}
    </div>`;
}

// Línea pequeña con la evolución de una meta.
function sparkline(goal) {
  const points = goalSeries(goal);
  if (points.length < 2) return '<div class="sparkline empty-line"></div>';
  const values = [...points.map((p) => p.value), goal.target];
  const lo = Math.min(...values);
  const span = (Math.max(...values) - lo) || 1;
  const W = 100;
  const H = 32;
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - 2 - ((p.value - lo) / span) * (H - 4);
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `
    <svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${path}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>
    </svg>`;
}

function evolutionTab() {
  const goals = activeGoals();
  const done = completedGoals().length;
  const avg = goals.length
    ? Math.round((goals.reduce((sum, g) => sum + progress(g), 0) / goals.length) * 100)
    : 0;
  const rows = goals.map((g) => `
    <button class="card evo-row" data-open="${g.id}">
      <span class="goal-emoji">${esc(g.emoji)}</span>
      <span class="grow">
        <span class="goal-name">${esc(g.name)}</span>
        ${sparkline(g)}
      </span>
      <b>${Math.round(progress(g) * 100)}%</b>
    </button>`).join('');
  return `
    <div class="stat-row">
      <div class="stat"><div class="ico">🎯</div><div class="val">${goals.length}</div><div class="lbl">En curso</div></div>
      <div class="stat"><div class="ico">🏆</div><div class="val">${done}</div><div class="lbl">Cumplidas</div></div>
      <div class="stat"><div class="ico">📈</div><div class="val">${avg}%</div><div class="lbl">Progreso medio</div></div>
    </div>
    ${goals.length
      ? `<div class="stack" style="margin-top:12px">${rows}</div>`
      : '<div class="card empty small" style="margin-top:12px">Crea una meta para ver su evolución.</div>'}`;
}

const TABS = {
  active: { title: 'Metas', render: activeTab },
  done: { title: 'Cumplidas', render: doneTab },
  evolution: { title: 'Evolución', render: evolutionTab },
};

export function renderGoals(root, { tab = 'active' } = {}) {
  const current = TABS[tab];

  root.innerHTML = `
    <header class="page-header">
      <h1 class="page-title">${current.title}</h1>
      <button class="icon-btn" data-new aria-label="Nueva meta">${icons.plus}</button>
    </header>
    ${current.render()}`;

  root.querySelectorAll('[data-new]').forEach((b) => { b.onclick = () => navigate('#/goals/new'); });
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = () => navigate(`#/goals/${el.dataset.open}`);
  });
}
