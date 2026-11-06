// Estadísticas: completados por semana, calendario de ánimo y resumen por hábito.
import { activeHabits, state } from '../store.js';
import {
  completion, habitStartKey, isDayDone, onlyCurrentPeriod, periodGoal,
} from '../habit-logic.js';
import {
  DAY_NAMES_SHORT, addDays, daysInMonth, fromKey, monthGrid, monthLabel, relativeDayLabel, startOfWeek, toKey, todayKey,
} from '../dates.js';
import { icons } from '../icons.js';
import { esc, navigate } from '../ui.js';
import { MOODS } from './today.js';
import {
  ATTRIBUTES, attributePoints, computeXp, gameEnabled, monthKey,
} from '../game.js';

let weekOffset = 0;
let moodYear;
let moodMonth;

const SUMMARY_DAYS = 30;
const CURRENT_PERIOD = { day: 'hoy', week: 'esta semana', month: 'este mes' };

function weekTitle(start) {
  if (weekOffset === 0) return 'Esta semana';
  if (weekOffset === -1) return 'Semana pasada';
  return `${relativeDayLabel(start)} – ${relativeDayLabel(addDays(start, 6))}`;
}

function weekChart(today) {
  const start = addDays(startOfWeek(today), weekOffset * 7);
  const days = DAY_NAMES_SHORT.map((name, i) => {
    const key = addDays(start, i);
    const future = key > today;
    const count = future ? null : state.habits.filter((h) => isDayDone(h, key)).length;
    return { name: name.slice(0, 2), key, count };
  });
  const total = days.reduce((s, d) => s + (d.count || 0), 0);
  const end = addDays(start, 6);
  const todosDone = state.todos.filter((t) => t.done && t.doneAt >= start && t.doneAt <= end).length;

  // Gráfica de área en SVG: 7 columnas, la altura se ajusta al máximo de la semana.
  const W = 300;
  const H = 100;
  const pad = 12;
  const max = Math.max(1, ...days.map((d) => d.count || 0));
  const x = (i) => ((i + 0.5) * W) / 7; // centrado en la columna de su etiqueta
  const y = (v) => H - 8 - (v / max) * (H - 24);
  const pts = days.filter((d) => d.count !== null).map((d) => [x(days.indexOf(d)), y(d.count)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const area = pts.length ? `${line} L${pts.at(-1)[0]},${H} L${pts[0][0]},${H} Z` : '';

  return `
    <div class="card">
      <div class="chart-head">
        <div>
          <div class="chart-title">${weekTitle(start)}</div>
          <div class="small muted">${total} completado${total === 1 ? '' : 's'}${state.settings.showTodos
            ? ` · ${todosDone} tarea${todosDone === 1 ? '' : 's'} hecha${todosDone === 1 ? '' : 's'}` : ''}</div>
        </div>
        <div class="pager">
          <button data-week="-1" aria-label="Semana anterior">${icons.chevronLeft}</button>
          <button data-week="1" aria-label="Semana siguiente" ${weekOffset >= 0 ? 'disabled' : ''}>${icons.chevronRight}</button>
        </div>
      </div>
      <div class="chart-wrap">
      <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
        aria-label="Hábitos completados por día">
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="currentColor" stop-opacity="0.35"/>
            <stop offset="1" stop-color="currentColor" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <line x1="${pad}" x2="${W - pad}" y1="${H - 8}" y2="${H - 8}" stroke="var(--faint)" stroke-dasharray="2 4"/>
        ${area ? `<path d="${area}" fill="url(#area)"/>` : ''}
        ${line ? `<path d="${line}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>` : ''}
      </svg>
      <div class="chart-dots">
        ${days.map((d, i) => d.count === null ? '' : `<span style="left:${(x(i) / W) * 100}%;top:${(y(d.count) / H) * 100}%"></span>`).join('')}
      </div>
      </div>
      <div class="chart-labels">
        ${days.map((d) => `<div class="${d.key === today ? 'today' : ''}"><span>${d.name}</span><b>${d.count ?? '–'}</b></div>`).join('')}
      </div>
    </div>`;
}

// Días seguidos con ánimo registrado. Si hoy aún no hay registro, cuenta desde ayer.
function moodStreaks(today) {
  let current = 0;
  let day = state.moods[today] ? today : addDays(today, -1);
  while (state.moods[day]) {
    current++;
    day = addDays(day, -1);
  }
  let best = 0;
  let run = 0;
  let prev = null;
  Object.keys(state.moods).sort().forEach((k) => {
    run = prev && addDays(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  });
  return { current, best };
}

function moodCalendar(today) {
  const grid = monthGrid(moodYear, moodMonth);
  const keys = grid.filter(Boolean);
  const entries = keys.map((k) => state.moods[k]).filter(Boolean);
  const freq = {};
  entries.forEach((v) => { freq[v] = (freq[v] || 0) + 1; });
  const top = Object.keys(freq).sort((a, b) => freq[b] - freq[a] || b - a)[0];
  const topMood = MOODS.find((m) => m.value === Number(top));
  const avg = entries.length ? entries.reduce((s, v) => s + v, 0) / entries.length : null;
  const avgMood = avg && MOODS.find((m) => m.value === Math.round(avg));
  const streaks = moodStreaks(today);
  const now = new Date();
  const atCurrentMonth = moodYear === now.getFullYear() && moodMonth === now.getMonth();

  return `
    <div class="card">
      <div class="cal-head" style="margin-top:0">
        <button data-mood-month="-1" aria-label="Mes anterior">${icons.chevronLeft}</button>
        <span>${monthLabel(moodYear, moodMonth)}</span>
        <button data-mood-month="1" aria-label="Mes siguiente" ${atCurrentMonth ? 'disabled' : ''}>${icons.chevronRight}</button>
      </div>
      <div class="mood-stats">
        <div><b>${entries.length}</b><span>Registros</span></div>
        <div><b>${topMood ? topMood.emoji : '–'}</b><span>Más frecuente</span></div>
        <div><b>${entries.length}/${daysInMonth(moodYear, moodMonth)}</b><span>Días</span></div>
      </div>
      <div class="mood-stats">
        <div>
          <b>${avgMood ? `${avgMood.emoji} ${avg.toFixed(1).replace('.', ',')}` : '–'}</b>
          <span>Media del mes</span>
        </div>
        <div><b>🔥 ${streaks.current}</b><span>Racha actual</span></div>
        <div><b>🏆 ${streaks.best}</b><span>Mejor racha</span></div>
      </div>
      <div class="mood-grid">
        ${DAY_NAMES_SHORT.map((d) => `<span class="wd">${d}</span>`).join('')}
        ${grid.map((k) => {
          if (!k) return '<span></span>';
          const m = MOODS.find((x) => x.value === state.moods[k]);
          return `<div class="mood-day ${k === today ? 'today' : ''} ${k > today ? 'future' : ''}">
            <span>${fromKey(k).getDate()}</span>${m ? `<i>${m.emoji}</i>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DAY_NAMES_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const EVOLUTION_MONTHS = 6;
const WEEKDAY_WEEKS = 12;
const MIN_MOOD_SAMPLES = 3;

const decimal = (n) => n.toFixed(1).replace('.', ',');

// % de cumplimiento de cada mes, sumando todos los hábitos activos según su objetivo.
function monthlyEvolution(today) {
  const habits = activeHabits();
  if (!habits.length) return '';
  const now = fromKey(today);
  const months = [];
  for (let i = EVOLUTION_MONTHS - 1; i >= 0; i--) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const startKey = toKey(first);
    const endKey = toKey(new Date(first.getFullYear(), first.getMonth() + 1, 0));
    let score = 0;
    let weight = 0;
    habits.forEach((h) => {
      const c = completion(h, startKey, endKey, today);
      score += c.score;
      weight += c.weight;
    });
    months.push({
      label: MONTH_SHORT[first.getMonth()],
      pct: weight ? Math.round((score / weight) * 100) : null,
      current: i === 0,
    });
  }
  return `
    <div class="section-title">Evolución mensual</div>
    <div class="card">
      <div class="small muted">Cumplimiento de tus hábitos según su objetivo</div>
      <div class="bars">
        ${months.map((m) => `
          <div class="bar ${m.current ? 'current' : ''}">
            <span class="val">${m.pct === null ? '–' : `${m.pct}%`}</span>
            ${m.pct === null ? '' : `<div class="fill" style="height:${Math.max(2, m.pct * 0.95)}px"></div>`}
            <span class="lbl">${m.label}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

// Cumplimiento de los hábitos diarios por día de la semana en las últimas semanas (sin contar hoy).
function weekdayStats(today) {
  const habits = activeHabits().filter((h) => h.period === 'day');
  if (!habits.length) return '';
  const done = Array(7).fill(0);
  const expected = Array(7).fill(0);
  for (let k = addDays(today, -WEEKDAY_WEEKS * 7); k < today; k = addDays(k, 1)) {
    const wd = (fromKey(k).getDay() + 6) % 7;
    habits.forEach((h) => {
      if (k < habitStartKey(h)) return;
      expected[wd]++;
      if (isDayDone(h, k)) done[wd]++;
    });
  }
  const pcts = expected.map((e, i) => (e ? Math.round((done[i] / e) * 100) : null));
  const valid = pcts.map((p, i) => [p, i]).filter(([p]) => p !== null);
  if (!valid.length) return '';
  const best = valid.reduce((a, b) => (b[0] > a[0] ? b : a));
  const worst = valid.reduce((a, b) => (b[0] < a[0] ? b : a));
  const distinct = best[0] !== worst[0];
  return `
    <div class="section-title">Por día de la semana</div>
    <div class="card stack">
      <div class="small muted">
        ${distinct
          ? `Tu mejor día es el <b style="color:var(--green)">${DAY_NAMES_LONG[best[1]]}</b> y el peor el <b style="color:var(--red)">${DAY_NAMES_LONG[worst[1]]}</b>.`
          : 'Todos los días vas igual.'}
        Hábitos diarios, últimas ${WEEKDAY_WEEKS} semanas.
      </div>
      ${pcts.map((p, i) => `
        <div class="wd-row ${distinct && i === best[1] ? 'best' : ''} ${distinct && i === worst[1] ? 'worst' : ''}">
          <span>${DAY_NAMES_SHORT[i]}</span>
          <div class="progress"><div style="width:${p ?? 0}%"></div></div>
          <span class="pct">${p === null ? '–' : `${p}%`}</span>
        </div>`).join('')}
    </div>`;
}

// Ánimo medio los días que cumples cada hábito frente a los días que no.
function moodByHabit(today) {
  const habits = activeHabits();
  if (!habits.length) return '';
  const moodDays = Object.keys(state.moods).filter((k) => k <= today);
  const rows = habits.map((h) => {
    const yes = [];
    const no = [];
    moodDays.forEach((k) => {
      if (k < habitStartKey(h)) return;
      (isDayDone(h, k) ? yes : no).push(state.moods[k]);
    });
    if (yes.length < MIN_MOOD_SAMPLES || no.length < MIN_MOOD_SAMPLES) return null;
    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    return { habit: h, yes: avg(yes), no: avg(no), diff: avg(yes) - avg(no) };
  }).filter(Boolean).sort((a, b) => b.diff - a.diff);

  return `
    <div class="section-title">Ánimo según hábitos</div>
    <div class="card stack">
      ${rows.length ? `
        <div class="small muted">Tu ánimo medio (1–5) los días que cumples cada hábito frente a los que no.</div>
        ${rows.map((r) => {
          const cls = r.diff >= 0.05 ? 'up' : r.diff <= -0.05 ? 'down' : '';
          return `
          <div class="mh-row">
            <span class="emoji">${esc(r.habit.emoji)}</span>
            <div class="grow">
              <div>${esc(r.habit.name)}</div>
              <div class="small muted">Cuando lo haces ${decimal(r.yes)} · cuando no ${decimal(r.no)}</div>
            </div>
            <span class="mh-diff ${cls}">${r.diff >= 0 ? '+' : '−'}${decimal(Math.abs(r.diff))}</span>
          </div>`;
        }).join('')}`
      : `<div class="small muted">Registra tu ánimo unos días más para ver esta comparación (hacen falta al menos ${MIN_MOOD_SAMPLES} días haciendo el hábito y ${MIN_MOOD_SAMPLES} sin hacerlo).</div>`}
    </div>`;
}

// Modo juego: XP diaria del mes y atributos de este mes frente al anterior.
function xpSection(today) {
  if (!gameEnabled()) return '';
  const xp = computeXp(today);
  const now = fromKey(today);
  const year = now.getFullYear();
  const month = now.getMonth();
  const total = daysInMonth(year, month);
  const days = Array.from({ length: total }, (_, i) => {
    const key = toKey(new Date(year, month, i + 1));
    return { key, day: i + 1, xp: key > today ? null : (xp.byDay[key] || 0) };
  });
  const monthTotal = days.reduce((s, d) => s + (d.xp || 0), 0);
  const avg = Math.round(monthTotal / now.getDate());
  const max = Math.max(1, ...days.map((d) => d.xp || 0));
  const thisMonth = xp.byAttributeMonth[monthKey(now)] || {};
  const lastMonth = xp.byAttributeMonth[monthKey(new Date(year, month - 1, 1))] || {};

  return `
    <div class="section-head">
      <div class="section-title">Experiencia</div>
      <button class="link-btn" data-go="#/profile">Ver perfil ${icons.chevronRight}</button>
    </div>
    <div class="card">
      <div class="chart-title">${monthTotal.toLocaleString('es-ES')} XP <span class="small muted" style="font-weight:400">este mes</span></div>
      <div class="small muted">Media de ${avg} XP al día</div>
      <div class="xp-bars">
        ${days.map((d) => `
          <span class="xp-col ${d.key === today ? 'today' : ''}" title="${d.day}: ${d.xp ?? 0} XP">
            <span style="height:${d.xp ? Math.max(4, (d.xp / max) * 100) : 0}%"></span>
          </span>`).join('')}
      </div>
      <div class="xp-axis small muted"><span>1</span><span>${Math.ceil(total / 2)}</span><span>${total}</span></div>
    </div>
    <div class="card stack" style="margin-top:12px">
      <div class="small muted">Puntos de atributo este mes, comparados con el mes pasado</div>
      ${ATTRIBUTES.map((a) => {
        const cur = attributePoints(thisMonth[a.id] || 0);
        const diff = cur - attributePoints(lastMonth[a.id] || 0);
        return `
        <div class="attr-row">
          <span class="attr-emoji">${a.emoji}</span>
          <span class="attr-name">${a.label}</span>
          <span class="mh-diff ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}" style="text-align:left;font-size:13px">
            ${diff > 0 ? '▲' : diff < 0 ? '▼' : ''} ${diff ? Math.abs(diff) : '='}</span>
          <b class="attr-val">${cur}</b>
        </div>`;
      }).join('')}
    </div>`;
}

function habitSummary(today) {
  const habits = activeHabits();
  if (!habits.length) return '';
  const rows = habits.map((h) => {
    let done = 0;
    for (let i = 0; i < SUMMARY_DAYS; i++) if (isDayDone(h, addDays(today, -i))) done++;
    const c = completion(h, addDays(today, -(SUMMARY_DAYS - 1)), today, today);
    const pct = c.weight ? Math.round((c.score / c.weight) * 100) : 0;
    // Un hábito recién creado solo tiene el periodo en curso: se muestra su progreso directamente.
    let detail;
    if (onlyCurrentPeriod(h, today)) {
      const g = periodGoal(h, today);
      detail = `${g.done} de ${g.target} ${CURRENT_PERIOD[h.period]}`;
    } else {
      detail = `${done} día${done === 1 ? '' : 's'} · ${pct}% del objetivo`;
    }
    return `
      <div class="sum-row">
        <span class="emoji">${esc(h.emoji)}</span>
        <div class="grow">
          <div class="sum-top"><span>${esc(h.name)}</span><span class="muted small">${detail}</span></div>
          <div class="progress"><div style="width:${pct}%"></div></div>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="section-title">Últimos ${SUMMARY_DAYS} días</div>
    <div class="card stack">${rows}</div>`;
}

export function renderStats(root, params, entering) {
  const now = new Date();
  if (entering || moodYear === undefined) {
    weekOffset = 0;
    moodYear = now.getFullYear();
    moodMonth = now.getMonth();
  }
  const today = todayKey();

  root.innerHTML = `
    <header class="page-header">
      <h1 class="page-title">Estadísticas</h1>
    </header>
    ${weekChart(today)}
    ${xpSection(today)}
    ${monthlyEvolution(today)}
    ${weekdayStats(today)}
    <div class="section-title">Estado de ánimo</div>
    ${moodCalendar(today)}
    ${moodByHabit(today)}
    ${habitSummary(today)}`;

  const rerender = () => renderStats(root, params, false);
  root.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => navigate(b.dataset.go); });
  root.querySelectorAll('[data-week]').forEach((b) => {
    b.onclick = () => { weekOffset = Math.min(0, weekOffset + Number(b.dataset.week)); rerender(); };
  });
  root.querySelectorAll('[data-mood-month]').forEach((b) => {
    b.onclick = () => {
      const d = new Date(moodYear, moodMonth + Number(b.dataset.moodMonth), 1);
      moodYear = d.getFullYear();
      moodMonth = d.getMonth();
      rerender();
    };
  });
}
