// Metas: numéricas (registras el valor a mano) o ligadas a un hábito (cuentan solas).
//
// Numérica: { type: 'numeric', unit, startValue, target, entries: [{ date, value }] }
//   La meta puede subir (ahorrar, ganar peso) o bajar (perder peso): lo decide target frente a startValue.
// Hábito:   { type: 'habit', habitId, target }  -> cuenta los días cumplidos desde startDate.
import {
  getHabit, latestWeight, save, state, uid,
} from './store.js';
import { readSummary } from './balance-bridge.js';
import { exerciseSummaries } from './gym.js';
import { pagesRead } from './library.js';
import { travelSummary } from './travel-bridge.js';
import { isDayDone } from './habit-logic.js';
import { addDays, fromKey, todayKey } from './dates.js';

const ON_TRACK_MARGIN = 0.02; // tolerancia para seguir "en camino"
const TIGHT_MARGIN = 0.15; // hasta aquí por detrás es "vas justo"; más, "vas tarde"
const MIN_DAYS_FOR_ETA = 3; // con menos días el ritmo no es fiable

export const daysBetween = (from, to) => Math.round((fromKey(to) - fromKey(from)) / 864e5);

export function getGoal(id) {
  return state.goals.find((g) => g.id === id);
}

export function activeGoals() {
  return state.goals.filter((g) => !g.completedAt);
}

export function completedGoals() {
  return state.goals.filter((g) => g.completedAt).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export function createGoal(data) {
  const goal = { id: uid(), createdAt: todayKey(), completedAt: null, entries: [], ...data };
  state.goals.push(goal);
  save();
  return goal;
}

export function updateGoal(id, data) {
  Object.assign(getGoal(id), data);
  save();
}

export function deleteGoal(id) {
  state.goals = state.goals.filter((g) => g.id !== id);
  save();
}

// Un registro por día: si ya había uno en esa fecha, se sustituye.
export function addEntry(goalId, date, value) {
  const goal = getGoal(goalId);
  goal.entries = goal.entries.filter((e) => e.date !== date);
  goal.entries.push({ date, value });
  goal.entries.sort((a, b) => a.date.localeCompare(b.date));
  save();
}

export function deleteEntry(goalId, date) {
  const goal = getGoal(goalId);
  goal.entries = goal.entries.filter((e) => e.date !== date);
  save();
}

// ---------- Metas conectadas: el valor viene de Balance o de Cuerpo ----------
// goal.source: { type: 'networth' | 'liquidity' | 'account' | 'weight' | 'workouts' | 'exercise'
//   | 'booksRead' | 'pagesRead' | 'countries', id? }

// Lo que se puede conectar ahora mismo, con su valor actual.
export function sourceOptions() {
  const summary = readSummary();
  const options = [];
  if (summary) {
    options.push({ source: { type: 'networth' }, label: 'Patrimonio', unit: '€', value: summary.netWorth });
    if (summary.liquidity !== undefined) {
      options.push({ source: { type: 'liquidity' }, label: 'Liquidez', unit: '€', value: summary.liquidity });
    }
    (summary.accounts || []).forEach((a) => {
      options.push({ source: { type: 'account', id: a.id }, label: a.name, unit: '€', value: a.balance });
    });
  }
  const weight = latestWeight();
  if (weight !== null) options.push({ source: { type: 'weight' }, label: 'Peso', unit: 'kg', value: weight });
  if (state.gym.routines.length || state.gym.sessions.length) {
    options.push({
      source: { type: 'workouts' }, label: 'Entrenamientos', unit: 'veces', value: state.gym.sessions.length,
    });
  }
  exerciseSummaries().filter((e) => e.top > 0).forEach((e) => {
    options.push({
      source: { type: 'exercise', id: e.name }, label: `Máximo en ${e.name}`, unit: 'kg', value: e.top,
    });
  });
  if (state.books.length) {
    const read = state.books.filter((b) => b.status === 'read').length;
    const pages = state.books.reduce((total, b) => total + pagesRead(b), 0);
    options.push({
      source: { type: 'booksRead' }, label: 'Libros leídos', unit: 'libros', value: read,
    });
    options.push({
      source: { type: 'pagesRead' }, label: 'Páginas leídas', unit: 'páginas', value: pages,
    });
  }
  const travel = travelSummary(todayKey());
  if (travel) {
    options.push({
      source: { type: 'countries' }, label: 'Países visitados', unit: 'países', value: travel.countries,
    });
  }
  return options;
}

export const sameSource = (a, b) => a?.type === b?.type && (a?.id ?? null) === (b?.id ?? null);

function findSource(source) {
  return sourceOptions().find((o) => sameSource(o.source, source));
}

export function sourceLabel(goal) {
  if (!goal.source) return '';
  return findSource(goal.source)?.label || 'Origen no disponible';
}

// Apunta en cada meta conectada el valor de hoy. Si el dato ya no existe, conserva lo que tenía.
// Devuelve true si algo ha cambiado.
export function syncGoalSources(today = todayKey()) {
  let changed = false;
  state.goals.forEach((goal) => {
    if (!goal.source || goal.completedAt) return;
    const found = findSource(goal.source)?.value;
    if (found === undefined) return;
    const value = Math.round(found * 100) / 100;
    if (value === currentValue(goal, today)) return;
    goal.entries = goal.entries.filter((e) => e.date !== today);
    goal.entries.push({ date: today, value });
    goal.entries.sort((a, b) => a.date.localeCompare(b.date));
    changed = true;
  });
  return changed;
}

// Valor con el que empezó la meta (punto de partida real del recorrido).
export function startValue(goal) {
  return goal.type === 'habit' ? 0 : goal.startValue;
}

// Desde dónde se cuenta el % mostrado:
//   'zero'  -> lo que ya tenías cuenta (500 de 1.000 € = 50%). Ahorro, libros, km…
//   'start' -> solo cuenta lo avanzado desde el valor inicial. Peso y similares.
// Las metas que bajan siempre cuentan desde el valor inicial (desde 0 no tendría sentido).
export function defaultBaseline(unit, start, target) {
  if (target < start) return 'start';
  return String(unit).trim().toLowerCase() === 'kg' ? 'start' : 'zero';
}

export function baselineOf(goal) {
  if (goal.type === 'habit') return 'zero';
  if (goal.target < goal.startValue) return 'start';
  return goal.baseline || defaultBaseline(goal.unit || '', goal.startValue, goal.target);
}

function displayStart(goal) {
  return baselineOf(goal) === 'zero' ? 0 : startValue(goal);
}

// Último día que cuenta: hoy, o la fecha límite si ya pasó.
function lastCountedDay(goal, today) {
  return goal.deadline && goal.deadline < today ? goal.deadline : today;
}

export function currentValue(goal, today = todayKey()) {
  if (goal.type === 'habit') {
    const habit = getHabit(goal.habitId);
    if (!habit) return 0;
    let n = 0;
    const last = lastCountedDay(goal, today);
    for (let k = goal.startDate; k <= last; k = addDays(k, 1)) if (isDayDone(habit, k)) n++;
    return n;
  }
  const past = goal.entries.filter((e) => e.date <= today);
  return past.length ? past[past.length - 1].value : goal.startValue;
}

function fraction(from, current, target) {
  if (target === from) return current === from ? 1 : 0;
  return Math.max(0, Math.min(1, (current - from) / (target - from)));
}

// % que se muestra, según desde dónde cuenta la meta.
export function progress(goal, today = todayKey()) {
  return fraction(displayStart(goal), currentValue(goal, today), goal.target);
}

// Puntos para la gráfica: [{ date, value }] desde el inicio hasta hoy.
export function goalSeries(goal, today = todayKey()) {
  if (goal.type === 'habit') {
    const habit = getHabit(goal.habitId);
    const out = [];
    let n = 0;
    const last = lastCountedDay(goal, today);
    for (let k = goal.startDate; k <= last; k = addDays(k, 1)) {
      if (habit && isDayDone(habit, k)) n++;
      out.push({ date: k, value: n });
    }
    return out;
  }
  const points = [{ date: goal.startDate, value: goal.startValue }];
  goal.entries.forEach((e) => {
    if (e.date === goal.startDate) points[0] = e;
    else if (e.date > goal.startDate && e.date <= today) points.push(e);
  });
  return points;
}

// Estado y previsión según el ritmo que llevas.
// Se calculan sobre el recorrido real (del valor inicial al objetivo), cuente el % desde donde cuente.
// status: 'done' | 'ontrack' | 'tight' | 'late' | 'expired' | null (sin fecha límite)
export function forecast(goal, today = todayKey()) {
  if (progress(goal, today) >= 1) return { status: 'done' };
  const s = startValue(goal);
  const c = currentValue(goal, today);
  const p = fraction(s, c, goal.target);
  const remaining = goal.target - c;
  const elapsed = Math.max(1, daysBetween(goal.startDate, today));
  const rate = (c - s) / elapsed; // unidades por día, con signo

  let eta = null;
  if (elapsed >= MIN_DAYS_FOR_ETA && rate !== 0 && Math.sign(rate) === Math.sign(remaining)) {
    eta = addDays(today, Math.ceil(remaining / rate));
  }

  if (!goal.deadline) return { status: null, eta, remaining };
  const daysLeft = daysBetween(today, goal.deadline);
  if (daysLeft < 0) return { status: 'expired', eta, remaining, daysLeft };
  const total = Math.max(1, daysBetween(goal.startDate, goal.deadline));
  const expected = Math.min(1, daysBetween(goal.startDate, today) / total);
  let status = 'late';
  if (p >= expected - ON_TRACK_MARGIN) status = 'ontrack';
  else if (p >= expected - TIGHT_MARGIN) status = 'tight';
  return { status, eta, remaining, daysLeft, neededPerDay: remaining / Math.max(1, daysLeft) };
}

// Marca como cumplidas las metas que han llegado al 100% (y desmarca las que han bajado).
// Devuelve las recién cumplidas para poder celebrarlo.
export function syncGoalCompletion(today = todayKey()) {
  const newlyDone = [];
  let changed = false;
  state.goals.forEach((g) => {
    const reached = progress(g, today) >= 1;
    if (reached && !g.completedAt) {
      g.completedAt = today;
      newlyDone.push(g);
      changed = true;
    } else if (!reached && g.completedAt) {
      g.completedAt = null;
      changed = true;
    }
  });
  return { newlyDone, changed };
}

// ---------- Formato ----------

// Lee números escritos a la española o no: "1.234,5", "2.000", "69,5", "69.5".
// Un punto seguido de grupos de 3 cifras se toma como separador de miles.
export function parseNum(text) {
  const clean = String(text).trim().replace(/\s/g, '');
  if (!clean) return null;
  let normalized = clean;
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(clean)) normalized = clean.replace(/\./g, '');
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

export function fmtNumber(n) {
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

export function fmtValue(goal, n) {
  if (goal.type === 'habit') return `${n} ${n === 1 ? 'vez' : 'veces'}`;
  return goal.unit ? `${fmtNumber(n)} ${goal.unit}` : fmtNumber(n);
}

// "Necesitas 150 €/mes", eligiendo día, semana o mes según lo que quede.
export function neededText(goal, f) {
  if (!f.neededPerDay || f.daysLeft === undefined) return '';
  const per = Math.abs(f.neededPerDay);
  const verb = goal.type === 'numeric' && goal.target < goal.startValue ? 'bajar' : 'sumar';
  let amount = per;
  let unit = 'día';
  if (f.daysLeft > 60) { amount = per * 30.4; unit = 'mes'; }
  else if (f.daysLeft > 10) { amount = per * 7; unit = 'semana'; }
  // Cantidades grandes sin decimales (421 €); pequeñas con uno o dos (0,35 kg).
  const rounded = amount >= 10 ? Math.round(amount) : Math.round(amount * (amount >= 1 ? 10 : 100)) / (amount >= 1 ? 10 : 100);
  const value = goal.type === 'habit'
    ? `${fmtNumber(rounded)} ${rounded === 1 ? 'vez' : 'veces'}`
    : `${fmtNumber(rounded)}${goal.unit ? ` ${goal.unit}` : ''}`;
  return `Necesitas ${verb} ${value} por ${unit}`;
}
