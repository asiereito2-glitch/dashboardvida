// Cuerpo: registro de peso y sueño con sus gráficas.
import {
  GOOD_SLEEP, isGoodNight, latestWeight, setBodyEntry, state,
} from '../store.js';
import { fmtNumber, parseNum } from '../goals.js';
import {
  DAY_NAMES_SHORT, addDays, fmtDuration, fromKey, onDayLabel, relativeDayLabel, todayKey,
} from '../dates.js';
import { esc } from '../ui.js';

const MAX_RECENT = 14;
const WEIGHT_LIMITS = [20, 400];
const SLEEP_LIMITS = [0, 24];
const WEIGHT_RANGES = [{ days: 30, label: '30 días' }, { days: 90, label: '90 días' }, { days: 365, label: '1 año' }];
const SLEEP_RANGES = [{ days: 14, label: '14 días' }, { days: 30, label: '30 días' }, { days: 90, label: '90 días' }];

let logDate = null;
let notice = null;
let weightRange = 90;
let sleepRange = 14;

const average = (list) => list.reduce((sum, v) => sum + v, 0) / list.length;
const round1 = (n) => Math.round(n * 10) / 10;
const kg = (n) => `${fmtNumber(round1(n))} kg`;

function inRange(map, days, today) {
  const from = addDays(today, -(days - 1));
  return Object.entries(map)
    .filter(([date]) => date >= from && date <= today)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

function statBox(emoji, value, label) {
  return `<div class="stat"><div class="ico">${emoji}</div><div class="val">${value}</div><div class="lbl">${label}</div></div>`;
}

function rangeSelector(ranges, current) {
  return `
    <div class="segmented">
      ${ranges.map((r) => `<button data-range="${r.days}" class="${r.days === current ? 'on' : ''}">${r.label}</button>`).join('')}
    </div>`;
}

// ---------- Registro ----------

function splitDuration(value) {
  const total = Math.round(value * 60);
  return { h: Math.floor(total / 60), min: total % 60 };
}

// Horas y minutos escritos -> horas. null si están vacíos (borra el dato), undefined si no son válidos.
function joinDuration(h, min) {
  if (!h && !min) return null;
  const hoursPart = h ? Number(h) : 0;
  const minutesPart = min ? Number(min) : 0;
  if (!Number.isInteger(hoursPart) || !Number.isInteger(minutesPart) || minutesPart > 59) return undefined;
  return hoursPart + minutesPart / 60;
}

function logTab(root, today) {
  logDate ||= today;
  const weight = state.body.weights[logDate];
  const sleep = state.body.sleep[logDate];
  const sleepParts = sleep === undefined ? null : splitDuration(sleep);
  const dates = [...new Set([...Object.keys(state.body.weights), ...Object.keys(state.body.sleep)])]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, MAX_RECENT);

  root.innerHTML = `
    <header class="page-header"><h1 class="page-title">Cuerpo</h1></header>
    ${notice ? `<div class="notice ${notice.error ? 'error' : ''}" style="margin-bottom:12px">${esc(notice.text)}</div>` : ''}

    <div class="card stack">
      <label class="field-row"><span>Día</span>
        <input type="date" class="date-input" data-log-date value="${logDate}" max="${today}"></label>
      <label class="field-row"><span>Peso (kg)</span>
        <input class="num-input" data-weight inputmode="decimal" placeholder="${latestWeight() ? fmtNumber(latestWeight()) : '75,0'}" value="${weight ? fmtNumber(weight) : ''}"></label>
      <div class="field-row"><span>Sueño</span>
        <span class="duration-input">
          <input class="num-input" data-sleep-h inputmode="numeric" maxlength="2" placeholder="7" aria-label="Horas" value="${sleepParts ? sleepParts.h : ''}"><span class="muted">h</span>
          <input class="num-input" data-sleep-min inputmode="numeric" maxlength="2" placeholder="30" aria-label="Minutos" value="${sleepParts ? sleepParts.min : ''}"><span class="muted">min</span>
        </span>
      </div>
      <div class="small muted">Apunta las horas de la noche anterior. Si dejas un campo vacío, se borra ese dato.</div>
      <button class="primary-btn" data-save style="margin:0;width:100%">Guardar</button>
    </div>

    ${dates.length ? `
      <div class="section-title">Últimos registros</div>
      <div class="option-list">
        ${dates.map((d) => {
          const w = state.body.weights[d];
          const s = state.body.sleep[d];
          return `
          <button data-pick="${d}">
            <span class="grow">${relativeDayLabel(d)}</span>
            ${w ? `<span class="small muted">⚖️ ${kg(w)}</span>` : ''}
            ${s !== undefined ? `<span class="small muted">😴 ${fmtDuration(s)}</span>` : ''}
          </button>`;
        }).join('')}
      </div>` : ''}`;

  const rerender = () => logTab(root, today);
  root.querySelector('[data-log-date]').onchange = (e) => {
    logDate = e.target.value || today;
    notice = null;
    rerender();
  };
  root.querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => {
      logDate = b.dataset.pick;
      notice = null;
      rerender();
      window.scrollTo(0, 0);
    };
  });
  root.querySelector('[data-save]').onclick = () => {
    const weightText = root.querySelector('[data-weight]').value;
    const sleepH = root.querySelector('[data-sleep-h]').value.trim();
    const sleepMin = root.querySelector('[data-sleep-min]').value.trim();
    const newWeight = parseNum(weightText);
    const newSleep = joinDuration(sleepH, sleepMin);
    const outOf = (n, [lo, hi]) => n !== null && (n < lo || n > hi);
    if ((weightText.trim() && newWeight === null) || outOf(newWeight, WEIGHT_LIMITS)) {
      notice = { text: 'Revisa el peso.', error: true };
      rerender();
      return;
    }
    if (newSleep === undefined || outOf(newSleep, SLEEP_LIMITS)) {
      notice = { text: 'Revisa el sueño: hasta 24 horas y entre 0 y 59 minutos.', error: true };
      rerender();
      return;
    }
    notice = { text: `Guardado para ${onDayLabel(logDate)}.` };
    setBodyEntry(logDate, newWeight, newSleep);
  };
}

// ---------- Peso ----------

function weightChart(points, days, today) {
  const W = 300;
  const H = 150;
  const values = points.map((p) => p.value);
  const pad = Math.max(0.5, (Math.max(...values) - Math.min(...values)) * 0.15);
  const lo = Math.min(...values) - pad;
  const hi = Math.max(...values) + pad;
  const x = (date) => 8 + ((days - 1 - Math.round((fromKey(today) - fromKey(date)) / 864e5)) / (days - 1)) * (W - 16);
  const y = (v) => H - 8 - ((v - lo) / (hi - lo)) * (H - 16);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points.at(-1);
  return `
    <div class="goal-chart">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evolución del peso">
        <path d="${line}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg>
      <span class="goal-chart-dot" style="left:${(x(last.date) / W) * 100}%;top:${(y(last.value) / H) * 100}%"></span>
      <span class="chart-max small muted">${kg(hi - pad)}</span>
      <span class="chart-min small muted">${kg(lo + pad)}</span>
    </div>`;
}

function weightTab(root, today) {
  const points = inRange(state.body.weights, weightRange, today);
  let content = '<div class="card empty small" style="margin-top:12px">Apunta tu peso para ver aquí su evolución.</div>';
  if (points.length) {
    const first = points[0].value;
    const last = points.at(-1).value;
    const change = round1(last - first);
    const sign = change > 0 ? '+' : change < 0 ? '−' : '';
    content = `
      <div class="stat-row" style="margin-top:12px">
        ${statBox('⚖️', kg(last), 'Actual')}
        ${statBox('↕️', `${sign}${kg(Math.abs(change))}`, 'Cambio')}
        ${statBox('📊', kg(average(points.map((p) => p.value))), 'Media')}
      </div>
      <div class="card" style="margin-top:12px">
        ${points.length > 1 ? weightChart(points, weightRange, today) : '<div class="small muted">Con dos registros verás la gráfica.</div>'}
        <div class="small muted" style="margin-top:8px">${points.length} registro${points.length === 1 ? '' : 's'} · desde ${onDayLabel(points[0].date)}</div>
      </div>`;
  }
  root.innerHTML = `
    <header class="page-header"><h1 class="page-title">Peso</h1></header>
    ${rangeSelector(WEIGHT_RANGES, weightRange)}
    ${content}`;
  root.querySelectorAll('[data-range]').forEach((b) => {
    b.onclick = () => { weightRange = Number(b.dataset.range); weightTab(root, today); };
  });
}

// ---------- Sueño ----------

function nightKind(hours) {
  if (isGoodNight(hours)) return 'good';
  return hours < GOOD_SLEEP[0] ? 'low' : 'long';
}

const NIGHT_LABELS = [['good', 'Buena'], ['low', 'Corta'], ['long', 'Larga']];

function sleepBars(days, today) {
  const [lowest, highest] = GOOD_SLEEP;
  const max = Math.max(highest + 1, ...Object.values(state.body.sleep));
  const bars = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = addDays(today, -i);
    const value = state.body.sleep[key];
    const height = value === undefined ? 0 : Math.max(2, (value / max) * 100);
    const kind = value === undefined ? '' : nightKind(value);
    bars.push(`<span class="sleep-col ${kind}" title="${key}: ${value === undefined ? '–' : fmtDuration(value)}"><span style="height:${height}%"></span></span>`);
  }
  return `
    <div class="sleep-bars">
      <span class="sleep-band" style="bottom:${(lowest / max) * 100}%;height:${((highest - lowest) / max) * 100}%"></span>
      ${bars.join('')}
    </div>
    <div class="xp-axis small muted"><span>${relativeDayLabel(addDays(today, -(days - 1)))}</span><span>Hoy</span></div>
    <div class="sleep-legend small muted">
      ${NIGHT_LABELS.map(([kind, label]) => `<span><i class="${kind}"></i>${label}</span>`).join('')}
    </div>`;
}

function sleepByWeekday(entries) {
  const groups = Array.from({ length: 7 }, () => []);
  entries.forEach((e) => groups[(fromKey(e.date).getDay() + 6) % 7].push(e.value));
  return groups.map((list, i) => {
    const avg = list.length ? average(list) : null;
    return `
      <div class="wd-row wide">
        <span>${DAY_NAMES_SHORT[i]}</span>
        <div class="progress"><div style="width:${avg === null ? 0 : Math.min(100, (avg / 10) * 100)}%"></div></div>
        <span class="pct">${avg === null ? '–' : fmtDuration(avg)}</span>
      </div>`;
  }).join('');
}

function sleepTab(root, today) {
  const entries = inRange(state.body.sleep, sleepRange, today);
  let content = '<div class="card empty small" style="margin-top:12px">Apunta tus horas de sueño para ver aquí tus gráficas.</div>';
  if (entries.length) {
    const values = entries.map((e) => e.value);
    const short = values.filter((v) => nightKind(v) === 'low').length;
    const good = values.filter((v) => nightKind(v) === 'good').length;
    content = `
      <div class="stat-row" style="margin-top:12px">
        ${statBox('😴', fmtDuration(average(values)), 'Media')}
        ${statBox('🌟', `${good} de ${values.length}`, 'Noches buenas')}
        ${statBox('⚠️', short, `Menos de ${GOOD_SLEEP[0]} h`)}
      </div>
      <div class="card" style="margin-top:12px">
        ${sleepBars(sleepRange, today)}
        <div class="small muted" style="margin-top:8px">La franja marca de ${GOOD_SLEEP[0]} a ${GOOD_SLEEP[1]} horas.</div>
      </div>
      <div class="section-title">Por día de la semana</div>
      <div class="card stack">${sleepByWeekday(entries)}</div>`;
  }
  root.innerHTML = `
    <header class="page-header"><h1 class="page-title">Sueño</h1></header>
    ${rangeSelector(SLEEP_RANGES, sleepRange)}
    ${content}`;
  root.querySelectorAll('[data-range]').forEach((b) => {
    b.onclick = () => { sleepRange = Number(b.dataset.range); sleepTab(root, today); };
  });
}

export function renderBody(root, { tab }, entering) {
  const today = todayKey();
  if (entering) {
    notice = null;
    logDate = today;
  }
  if (tab === 'weight') weightTab(root, today);
  else if (tab === 'sleep') sleepTab(root, today);
  else logTab(root, today);
}
