// Progreso del gimnasio: kilos por rutina, evolución de cada ejercicio y calendario.
import { state } from '../store.js';
import {
  adviceFor, exerciseHistory, sessionsBetween, exerciseSummaries, readyToIncrease, routineSessions, routineNames,
  sessionVolume, sessionsNewestFirst, setWeeklyGoal, setsLabel, weekStats,
} from '../gym.js';
import { fmtNumber } from '../goals.js';
import {
  DAY_NAMES_SHORT, addDays, fromKey, monthGrid, monthLabel, relativeDayLabel, startOfWeek, toKey, todayKey,
} from '../dates.js';
import { icons } from '../icons.js';
import { esc, navigate } from '../ui.js';
import { fmtKg, muscleCard, sessionRow } from './gym.js';

const PROGRESS_ROUTE = '#/body/gym/progress';
const TABS = [
  { id: 'routines', label: 'Rutinas' },
  { id: 'exercises', label: 'Ejercicios' },
  { id: 'muscles', label: 'Músculos' },
  { id: 'calendar', label: 'Calendario' },
];
const RANGES = [{ count: 10, label: 'Últimas 10' }, { count: 30, label: 'Últimas 30' }, { count: 0, label: 'Todas' }];
const METRICS = [
  { id: 'top', label: 'Peso máximo' },
  { id: 'estimate', label: 'Fuerza est.' },
  { id: 'volume', label: 'Kilos' },
];
const MAX_LIST = 8;
const MAX_WEEKLY_GOAL = 7;

let range = 10;
let routineName = null;
let metric = 'top';
let shownMonth = null;
let pickedDay = null;
let musclePeriod = 'week';
let muscleOffset = 0; // periodos hacia atrás desde el actual

const lastOf = (list) => (range ? list.slice(-range) : list);
const shortDate = (key) => {
  const label = relativeDayLabel(key);
  return /^\d/.test(label) ? label : label.toLowerCase();
};

function statBox(emoji, value, label) {
  return `<div class="stat"><div class="ico">${emoji}</div><div class="val">${value}</div><div class="lbl">${label}</div></div>`;
}

function rangeSelector() {
  return `<div class="segmented gym-range">${RANGES.map((r) => `<button data-range="${r.count}" class="${r.count === range ? 'on' : ''}">${r.label}</button>`).join('')}</div>`;
}

// ---------- Gráfica ----------

const W = 320;
const H = 170;
const LEFT = 42;
const RIGHT = 12;
const TOP = 12;
const BOTTOM = 26;

function lineChart(points, format, label) {
  const values = points.map((p) => p.value);
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const margin = (highest - lowest) * 0.15 || Math.max(1, highest * 0.1);
  const lo = Math.max(0, lowest - margin);
  const hi = highest + margin;
  const x = (i) => (points.length === 1 ? (LEFT + W - RIGHT) / 2 : LEFT + (i * (W - LEFT - RIGHT)) / (points.length - 1));
  const y = (v) => TOP + ((hi - v) * (H - TOP - BOTTOM)) / (hi - lo);
  const coords = points.map((p, i) => ({ ...p, cx: x(i).toFixed(1), cy: y(p.value).toFixed(1) }));
  const last = coords.at(-1);
  const gridValues = lowest === highest ? [lowest] : [lowest, highest];
  const dates = points.length > 1 ? [coords[0], last] : [last];
  return `
    <div class="gym-chart" data-chart>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
        ${gridValues.map((v) => `
          <line class="grid" x1="${LEFT}" x2="${W - RIGHT}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
          <text x="${LEFT - 6}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${esc(format(v, true))}</text>`).join('')}
        ${dates.map((p, i) => `<text x="${p.cx}" y="${H - 8}" text-anchor="${points.length === 1 ? 'middle' : i ? 'end' : 'start'}">${esc(shortDate(p.date))}</text>`).join('')}
        ${points.length > 1 ? `<polyline class="line" points="${coords.map((p) => `${p.cx},${p.cy}`).join(' ')}"/>` : ''}
        ${points.length <= 30 ? coords.map((p) => `<circle class="dot" cx="${p.cx}" cy="${p.cy}" r="3"/>`).join('') : ''}
        <circle class="mark" data-mark cx="${last.cx}" cy="${last.cy}" r="6"/>
        ${coords.map((p) => `<circle class="hit" data-point data-x="${p.cx}" data-y="${p.cy}" data-value="${esc(format(p.value))}" data-date="${esc(relativeDayLabel(p.date))}" cx="${p.cx}" cy="${p.cy}" r="16"/>`).join('')}
      </svg>
      <div class="gym-chart-tip"><b data-tip-value>${esc(format(last.value))}</b> <span class="small muted" data-tip-date>${esc(relativeDayLabel(last.date))}</span></div>
    </div>`;
}

// Tocar un punto muestra su valor y su fecha.
function bindCharts(root) {
  root.querySelectorAll('[data-chart]').forEach((chart) => {
    const mark = chart.querySelector('[data-mark]');
    chart.querySelectorAll('[data-point]').forEach((point) => {
      const show = () => {
        mark.setAttribute('cx', point.dataset.x);
        mark.setAttribute('cy', point.dataset.y);
        chart.querySelector('[data-tip-value]').textContent = point.dataset.value;
        chart.querySelector('[data-tip-date]').textContent = point.dataset.date;
      };
      point.addEventListener('click', show);
      point.addEventListener('pointerenter', show);
    });
  });
}

const kgAxis = (v, short) => (short ? fmtNumber(Math.round(v)) : fmtKg(v));
const exactKg = (v, short) => (short ? fmtNumber(Math.round(v * 10) / 10) : `${fmtNumber(Math.round(v * 10) / 10)} kg`);
const repsAxis = (v, short) => (short ? fmtNumber(Math.round(v)) : `${fmtNumber(Math.round(v))} reps`);

function signedKg(diff) {
  if (!diff) return '=';
  return `${diff > 0 ? '+' : '−'}${fmtKg(Math.abs(diff))}`;
}

// ---------- Rutinas ----------

function routinesTab() {
  const names = routineNames();
  if (!names.length) return '<div class="card empty small" style="margin-top:12px">Termina tu primer entrenamiento para ver aquí tus gráficas.</div>';
  if (!names.includes(routineName)) [routineName] = names;
  const sessions = lastOf(routineSessions(routineName));
  const points = sessions.map((s) => ({ date: s.date, value: sessionVolume(s) }));
  const values = points.map((p) => p.value);
  const hasKilos = Math.max(...values) > 0;
  return `
    <div class="gym-chips">
      ${names.map((n) => `<button data-routine="${esc(n)}" class="${n === routineName ? 'on' : ''}">${esc(n)}</button>`).join('')}
    </div>
    ${hasKilos ? `
      <div class="stat-row" style="margin-top:12px">
        ${statBox('🏋️', fmtKg(values.at(-1)), 'Último')}
        ${statBox('🏆', fmtKg(Math.max(...values)), 'Mejor')}
        ${statBox('↕️', signedKg(values.at(-1) - values[0]), 'Cambio')}
      </div>
      <div class="card" style="margin-top:12px">
        <div class="gym-chart-title">Kilos levantados por entrenamiento</div>
        ${lineChart(points, kgAxis, `Kilos levantados en ${routineName}`)}
        ${points.length === 1 ? '<div class="small muted">Con dos entrenamientos verás la línea.</div>' : ''}
      </div>
      ${rangeSelector()}` : '<div class="card empty small" style="margin-top:12px">Esta rutina no tiene series con peso todavía.</div>'}
    <div class="section-title">Entrenamientos</div>
    <div class="card gym-session-list">${[...sessions].reverse().slice(0, MAX_LIST).map(sessionRow).join('')}</div>`;
}

// ---------- Ejercicios ----------

const exerciseHref = (name) => `#/body/gym/exercise/${encodeURIComponent(name)}`;

function exercisesTab() {
  const list = exerciseSummaries();
  if (!list.length) return '<div class="card empty small" style="margin-top:12px">Aquí verás cada ejercicio cuando termines tu primer entrenamiento.</div>';
  const ready = readyToIncrease();
  return `
    ${ready.length ? `
      <div class="section-title" style="margin-top:20px">Listos para subir</div>
      <div class="card gym-session-list">
        ${ready.map((r) => `
          <a class="gym-session-row" href="${exerciseHref(r.name)}">
            <span class="grow"><span class="gym-session-name">${esc(r.name)}</span></span>
            <b class="gym-up">${r.suggest ? `${fmtNumber(r.suggest)} kg` : 'Más difícil'}</b>
          </a>`).join('')}
      </div>` : ''}
    <div class="section-title" style="margin-top:20px">Todos</div>
    <div class="card gym-session-list">
      ${list.map((e) => `
        <a class="gym-session-row" href="${exerciseHref(e.name)}">
          <span class="grow">
            <span class="gym-session-name">${esc(e.name)}</span>
            <span class="small muted">${relativeDayLabel(e.lastDate)}</span>
          </span>
          <span class="small muted">${e.top ? `${fmtNumber(e.top)} kg` : `${fmtNumber(e.topReps)} reps`}</span>
        </a>`).join('')}
    </div>`;
}

const SERIES = {
  top: (entry) => entry.top,
  estimate: (entry) => entry.estimate,
  volume: (entry) => entry.volume,
};

export function renderGymExercise(root, { name }) {
  const history = exerciseHistory(name);
  if (!history.length) {
    root.innerHTML = `<div class="card empty small">Este ejercicio aún no tiene historial.</div>`;
    return;
  }
  const weighted = history.some((h) => h.top > 0);
  const shown = lastOf(history);
  const key = weighted ? metric : null;
  const points = shown.map((h) => ({ date: h.date, value: key ? SERIES[key](h) : h.topReps }));
  const format = !key ? repsAxis : key === 'volume' ? kgAxis : exactKg;
  const advice = adviceFor(name);
  const best = (field) => Math.max(...history.map((h) => h[field]));
  root.innerHTML = `
    <header class="nav-header">
      <a class="icon-btn" href="${PROGRESS_ROUTE}/exercises" aria-label="Volver">${icons.back}</a>
      <h1>${esc(name)}</h1>
      <span></span>
    </header>
    ${advice ? `<div class="gym-advice" data-kind="${advice.kind}"><b>${esc(advice.title)}.</b> ${esc(advice.text)}</div>` : ''}
    <div class="stat-row">
      ${weighted ? `
        ${statBox('🏆', exactKg(best('top')), 'Peso máximo')}
        ${statBox('💪', exactKg(best('estimate')), 'Fuerza est.')}
        ${statBox('🏋️', fmtKg(best('volume')), 'Mejor día')}` : `
        ${statBox('🏆', fmtNumber(best('topReps')), 'Mejor serie')}
        ${statBox('🔁', history.length, 'Sesiones')}
        ${statBox('📅', relativeDayLabel(history.at(-1).date), 'Última')}`}
    </div>
    <div class="card" style="margin-top:12px">
      ${weighted ? `<div class="segmented gym-metrics">${METRICS.map((m) => `<button data-metric="${m.id}" class="${m.id === key ? 'on' : ''}">${m.label}</button>`).join('')}</div>` : '<div class="gym-chart-title">Repeticiones de la mejor serie</div>'}
      ${lineChart(points, format, `Evolución de ${name}`)}
      ${key === 'estimate' ? '<div class="small muted">Lo que podrías levantar a una repetición, calculado con tus series. Es una estimación.</div>' : ''}
    </div>
    ${rangeSelector()}
    <div class="section-title">Historial</div>
    <div class="card gym-session-list">
      ${[...history].reverse().slice(0, MAX_LIST).map((h) => `
        <a class="gym-session-row" href="#/body/gym/session/${h.sessionId}">
          <span class="grow">
            <span class="gym-session-name">${esc(setsLabel(h))}</span>
            <span class="small muted">${relativeDayLabel(h.date)}</span>
          </span>
        </a>`).join('')}
    </div>`;
  bindRange(root, () => renderGymExercise(root, { name }));
  root.querySelectorAll('[data-metric]').forEach((b) => {
    b.onclick = () => {
      metric = b.dataset.metric;
      renderGymExercise(root, { name });
    };
  });
  bindCharts(root);
}

// ---------- Músculos ----------

function musclePeriodRange() {
  const today = todayKey();
  if (musclePeriod === 'week') {
    const start = addDays(startOfWeek(today), -7 * muscleOffset);
    return { from: start, to: addDays(start, 6) };
  }
  const now = fromKey(today);
  const first = new Date(now.getFullYear(), now.getMonth() - muscleOffset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { from: toKey(first), to: toKey(last), title: monthLabel(first.getFullYear(), first.getMonth()) };
}

function muscleTitle({ from, to, title }) {
  if (title) return title;
  if (muscleOffset === 0) return 'Esta semana';
  if (muscleOffset === 1) return 'La semana pasada';
  return `${relativeDayLabel(from)} – ${relativeDayLabel(to)}`;
}

function musclesTab() {
  const range = musclePeriodRange();
  return `
    <div class="segmented two gym-range">
      <button data-period="week" class="${musclePeriod === 'week' ? 'on' : ''}">Semana</button>
      <button data-period="month" class="${musclePeriod === 'month' ? 'on' : ''}">Mes</button>
    </div>
    <div class="month-nav gym-range">
      <button data-offset="1" aria-label="Periodo anterior">${icons.chevronLeft}</button>
      <span>${muscleTitle(range)}</span>
      <button data-offset="-1" aria-label="Periodo siguiente" ${muscleOffset === 0 ? 'disabled' : ''}>${icons.chevronRight}</button>
    </div>
    <div style="margin-top:12px">${muscleCard(sessionsBetween(range.from, range.to))}</div>`;
}

// ---------- Calendario ----------

function currentMonth() {
  const today = fromKey(todayKey());
  return { year: today.getFullYear(), month: today.getMonth() };
}

function calendarTab() {
  const today = todayKey();
  shownMonth ||= currentMonth();
  const { year, month } = shownMonth;
  const sessions = sessionsNewestFirst();
  const trained = new Set(sessions.map((s) => s.date));
  const stats = weekStats(today);
  const now = currentMonth();
  const isCurrent = year === now.year && month === now.month;
  const dayList = pickedDay ? sessions.filter((s) => s.date === pickedDay) : [];
  return `
    <div class="stat-row" style="margin-top:12px">
      ${statBox('📅', `${stats.thisWeek}/${stats.goal}`, 'Esta semana')}
      ${statBox('🔥', stats.streak, `Semana${stats.streak === 1 ? '' : 's'} seguida${stats.streak === 1 ? '' : 's'}`)}
      ${statBox('🎯', stats.adherence === null ? '–' : `${stats.adherence}%`, 'Cumplimiento')}
    </div>
    <div class="card" style="margin-top:12px">
      <div class="stepper" style="margin-top:0">
        <span>Objetivo semanal</span>
        <span class="controls">
          <button data-goal="-1" aria-label="Menos" ${stats.goal <= 1 ? 'disabled' : ''}>${icons.minus}</button>
          <span class="num">${stats.goal}</span>
          <button data-goal="1" aria-label="Más" ${stats.goal >= MAX_WEEKLY_GOAL ? 'disabled' : ''}>${icons.plus}</button>
        </span>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="gym-cal-head">
        <button data-month="-1" aria-label="Mes anterior">${icons.chevronLeft}</button>
        <b>${monthLabel(year, month)}</b>
        <button data-month="1" aria-label="Mes siguiente" ${isCurrent ? 'disabled' : ''}>${icons.chevronRight}</button>
      </div>
      <div class="gym-cal">
        ${DAY_NAMES_SHORT.map((d) => `<span class="gym-cal-name">${d}</span>`).join('')}
        ${monthGrid(year, month).map((key) => {
          if (!key) return '<span></span>';
          const cls = [trained.has(key) ? 'on' : '', key === today ? 'today' : '', key === pickedDay ? 'picked' : ''].join(' ');
          return `<button class="gym-day ${cls}" data-day="${key}" ${key > today ? 'disabled' : ''} aria-label="${key}${trained.has(key) ? ', entrenado' : ''}">${fromKey(key).getDate()}</button>`;
        }).join('')}
      </div>
    </div>
    ${pickedDay ? `
      <div class="section-title">${relativeDayLabel(pickedDay)}</div>
      ${dayList.length
        ? `<div class="card gym-session-list">${dayList.map(sessionRow).join('')}</div>`
        : '<div class="card empty small">Sin entrenamiento este día.</div>'}` : ''}`;
}

function moveMonth(step) {
  const date = new Date(shownMonth.year, shownMonth.month + step, 1);
  shownMonth = { year: date.getFullYear(), month: date.getMonth() };
}

// ---------- Pantalla ----------

function bindRange(root, redraw) {
  root.querySelectorAll('[data-range]').forEach((b) => {
    b.onclick = () => {
      range = Number(b.dataset.range);
      redraw();
    };
  });
}

export function renderGymProgress(root, { tab }, entering) {
  if (entering) pickedDay = null;
  const redraw = () => renderGymProgress(root, { tab });
  const content = {
    routines: routinesTab, exercises: exercisesTab, muscles: musclesTab, calendar: calendarTab,
  }[tab]();
  root.innerHTML = `
    <header class="nav-header">
      <a class="icon-btn" href="#/body/gym" aria-label="Volver">${icons.back}</a>
      <h1>Progreso</h1>
      <span></span>
    </header>
    <div class="segmented four">
      ${TABS.map((t) => `<button data-tab="${t.id}" class="${t.id === tab ? 'on' : ''}">${t.label}</button>`).join('')}
    </div>
    ${content}`;
  root.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => navigate(`${PROGRESS_ROUTE}/${b.dataset.tab}`);
  });
  root.querySelectorAll('[data-routine]').forEach((b) => {
    b.onclick = () => {
      routineName = b.dataset.routine;
      redraw();
    };
  });
  root.querySelectorAll('[data-period]').forEach((b) => {
    b.onclick = () => {
      musclePeriod = b.dataset.period;
      muscleOffset = 0;
      redraw();
    };
  });
  root.querySelectorAll('[data-offset]').forEach((b) => {
    b.onclick = () => {
      muscleOffset += Number(b.dataset.offset);
      redraw();
    };
  });
  root.querySelectorAll('[data-goal]').forEach((b) => {
    b.onclick = () => setWeeklyGoal(state.gym.weeklyGoal + Number(b.dataset.goal));
  });
  root.querySelectorAll('[data-month]').forEach((b) => {
    b.onclick = () => {
      moveMonth(Number(b.dataset.month));
      redraw();
    };
  });
  root.querySelectorAll('[data-day]').forEach((b) => {
    b.onclick = () => {
      pickedDay = b.dataset.day;
      redraw();
    };
  });
  bindRange(root, redraw);
  bindCharts(root);
}
