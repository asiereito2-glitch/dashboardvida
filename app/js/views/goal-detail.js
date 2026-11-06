// Detalle de una meta: progreso, previsión, gráfica y registros.
import { getHabit } from '../store.js';
import {
  addEntry, currentValue, daysBetween, deleteEntry, deleteGoal, fmtNumber, fmtValue, forecast,
  getGoal, goalSeries, neededText, parseNum, progress, sourceLabel, startValue,
} from '../goals.js';
import { onDayLabel, relativeDayLabel, todayKey } from '../dates.js';
import { icons } from '../icons.js';
import { closeSheet, confirmSheet, esc, navigate, openSheet } from '../ui.js';
import { statusPill } from './goals.js';

// Gráfica de evolución. Si hay fecha límite, una línea discontinua marca el ritmo ideal.
function chart(goal, today) {
  const series = goalSeries(goal, today);
  const start = goal.startDate;
  const end = [today, goal.deadline, series.at(-1)?.date].filter(Boolean).sort().at(-1);
  const span = Math.max(1, daysBetween(start, end));
  const values = [...series.map((p) => p.value), startValue(goal), goal.target];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = (hi - lo || 1) * 0.12;
  lo -= pad;
  hi += pad;

  const W = 300;
  const H = 150;
  const x = (date) => 8 + (daysBetween(start, date) / span) * (W - 16);
  const y = (v) => H - 10 - ((v - lo) / (hi - lo)) * (H - 20);
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = series.at(-1);
  const area = `${line} L${x(last.date).toFixed(1)},${H} L${x(series[0].date).toFixed(1)},${H} Z`;

  return `
    <div class="goal-chart">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evolución de la meta">
        <defs>
          <linearGradient id="goal-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity="0.25"/>
            <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="0" x2="${W}" y1="${y(goal.target)}" y2="${y(goal.target)}" stroke="var(--green)" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>
        ${goal.deadline ? `<line x1="${x(start)}" y1="${y(startValue(goal))}" x2="${x(goal.deadline)}" y2="${y(goal.target)}"
          stroke="var(--muted)" stroke-dasharray="2 5" vector-effect="non-scaling-stroke"/>` : ''}
        <path d="${area}" fill="url(#goal-area)"/>
        <path d="${line}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg>
      <span class="goal-chart-dot" style="left:${(x(last.date) / W) * 100}%;top:${(y(last.value) / H) * 100}%"></span>
    </div>
    <div class="goal-chart-legend small muted">
      <span><i class="lg target"></i>Objetivo</span>
      ${goal.deadline ? '<span><i class="lg ideal"></i>Ritmo ideal</span>' : ''}
      <span>${relativeDayLabel(start)} → ${relativeDayLabel(end)}</span>
    </div>`;
}

function openEntrySheet(goal) {
  const today = todayKey();
  openSheet('Nuevo registro', `
    <label class="field-row"><span>Valor${goal.unit ? ` (${esc(goal.unit)})` : ''}</span>
      <input class="num-input" data-value inputmode="decimal" placeholder="${fmtNumber(currentValue(goal))}"></label>
    <label class="field-row" style="margin-top:12px"><span>Fecha</span>
      <input type="date" class="date-input" data-date value="${today}" max="${today}" min="${goal.startDate}"></label>
    <div class="form-error small" data-error></div>
    <div class="option-list" style="margin-top:16px">
      <button data-ok style="justify-content:center;font-weight:600">Guardar</button>
    </div>`, (sheet) => {
    const input = sheet.querySelector('[data-value]');
    setTimeout(() => input.focus(), 50);
    sheet.querySelector('[data-ok]').onclick = () => {
      const n = parseNum(input.value);
      if (n === null) {
        sheet.querySelector('[data-error]').textContent = 'Escribe un número.';
        return;
      }
      closeSheet();
      addEntry(goal.id, sheet.querySelector('[data-date]').value || today, n);
    };
  });
}

export function renderGoalDetail(root, { id }) {
  const goal = getGoal(id);
  if (!goal) {
    location.replace('#/goals');
    return;
  }
  const today = todayKey();
  const p = progress(goal, today);
  const current = currentValue(goal, today);
  const f = forecast(goal, today);
  const habit = goal.type === 'habit' && getHabit(goal.habitId);
  const remaining = Math.abs(goal.target - current);

  let forecastText = '';
  if (f.status !== 'done') {
    if (f.eta && goal.deadline && f.eta > goal.deadline) forecastText = 'A este ritmo <b>no llegarás a tiempo</b>.';
    else if (f.eta) forecastText = `A este ritmo lo conseguirás <b>${onDayLabel(f.eta)}</b>.`;
    else if (daysBetween(goal.startDate, today) < 3) forecastText = 'En unos días podré calcular cuándo lo conseguirás.';
    else forecastText = 'Aún no hay avance para calcular cuándo lo conseguirás.';
  }
  const needed = f.status && f.status !== 'done' && f.status !== 'expired' ? neededText(goal, f) : '';

  const entries = goal.type === 'numeric' ? [...goal.entries].reverse() : [];
  const entryRows = entries.map((e) => {
    const idx = goal.entries.findIndex((x) => x.date === e.date);
    const prev = idx > 0 ? goal.entries[idx - 1].value : goal.startValue;
    const diff = e.value - prev;
    return `
      <button data-entry="${e.date}">
        <span class="grow">${fmtValue(goal, e.value)}<span class="small muted" style="display:block">${relativeDayLabel(e.date)}</span></span>
        <span class="small ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'muted'}">${diff > 0 ? '+' : diff < 0 ? '−' : ''}${fmtNumber(Math.abs(diff))}</span>
      </button>`;
  }).join('');

  root.innerHTML = `
    <header class="nav-header">
      <button class="icon-btn" data-back aria-label="Volver">${icons.back}</button>
      <h1>${esc(goal.name)}</h1>
      <span class="icon-btn emoji">${esc(goal.emoji)}</span>
    </header>

    <div class="stack">
      ${goal.completedAt ? `<div class="notice">🏆 ¡Meta cumplida ${onDayLabel(goal.completedAt)}!</div>` : ''}

      <div class="card goal-hero">
        <div class="goal-pct">${Math.round(p * 100)}<span>%</span></div>
        <div class="progress goal-progress"><div style="width:${p * 100}%"></div></div>
        <div class="stat-row" style="margin-top:14px">
          <div class="stat"><div class="val">${fmtValue(goal, current)}</div><div class="lbl">Actual</div></div>
          <div class="stat"><div class="val">${fmtValue(goal, goal.target)}</div><div class="lbl">Objetivo</div></div>
          <div class="stat"><div class="val">${f.status === 'done' ? '✓' : fmtValue(goal, remaining)}</div><div class="lbl">Falta</div></div>
        </div>
        ${f.status !== 'done' ? `
        <div class="goal-forecast">
          ${statusPill(f.status)}
          ${goal.deadline ? `<span class="small muted">Fecha límite: ${relativeDayLabel(goal.deadline)}${f.daysLeft >= 0 ? ` · quedan ${f.daysLeft} días` : ''}</span>` : ''}
          <div class="small">${forecastText}</div>
          ${needed ? `<div class="small muted">${needed}.</div>` : ''}
        </div>` : ''}
      </div>

      <div class="card">
        <div class="label">Evolución</div>
        ${chart(goal, today)}
      </div>

      ${goal.type === 'numeric' ? `
        ${goal.source ? `
          <div class="card row-card">
            <span class="bubble">🔗</span>
            <span class="grow"><span class="small muted" style="display:block">Se actualiza sola con</span>${esc(sourceLabel(goal))}</span>
          </div>` : `<button class="primary-btn" data-add style="margin:0;width:100%">${icons.plus} Añadir registro</button>`}
        ${entries.length ? `
          <div class="section-title" style="margin-top:8px">Registros</div>
          <div class="option-list entry-list">${entryRows}</div>
          ${goal.source ? '' : '<div class="small muted">Toca un registro para borrarlo.</div>'}` : ''}
      ` : `
        <button class="card row-card" data-habit style="text-align:left">
          <span class="bubble">${habit ? esc(habit.emoji) : '❔'}</span>
          <span class="grow">
            <span class="small muted" style="display:block">Se actualiza sola con el hábito</span>
            ${habit ? esc(habit.name) : 'Hábito eliminado'}
          </span>
          ${habit ? icons.chevronRight : ''}
        </button>`}

      <div class="action-row">
        <button class="action-btn" data-edit><span class="ico">✏️</span>Editar</button>
        <button class="action-btn danger" data-delete><span class="ico">🗑️</span>Eliminar</button>
      </div>
    </div>`;

  root.querySelector('[data-back]').onclick = () => {
    if (history.length > 1) history.back();
    else location.replace('#/goals');
  };
  root.querySelector('[data-add]')?.addEventListener('click', () => openEntrySheet(goal));
  root.querySelector('[data-habit]')?.addEventListener('click', () => habit && navigate(`#/habits/${habit.id}`));
  if (!goal.source) root.querySelectorAll('[data-entry]').forEach((b) => {
    b.onclick = () => confirmSheet('Borrar registro', `Se borrará el registro (${relativeDayLabel(b.dataset.entry)}).`, 'Borrar',
      () => deleteEntry(goal.id, b.dataset.entry));
  });
  root.querySelector('[data-edit]').onclick = () => navigate(`#/goals/${id}/edit`);
  root.querySelector('[data-delete]').onclick = () => confirmSheet('Eliminar meta', `Se borrará "${goal.name}" y sus registros.`, 'Eliminar', () => {
    deleteGoal(id);
    location.replace('#/goals');
  });
}
