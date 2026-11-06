// Cálculo de progreso y rachas.
//
// Hábito diario: target = veces al día; un día cuenta como hecho si llega al target.
// Hábito semanal/mensual: target = días del periodo; cada día se marca como hecho o no.
import { getCount, state } from './store.js';
import { addDays, fromKey, startOfMonth, startOfWeek, toKey, todayKey } from './dates.js';

export const PERIOD_LABELS = { day: 'Diario', week: 'Semanal', month: 'Mensual' };
const STREAK_UNITS = {
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
};

export function streakUnit(habit, n) {
  const [one, many] = STREAK_UNITS[habit.period];
  return n === 1 ? one : many;
}

export function goalText(habit) {
  const n = habit.target;
  if (habit.period === 'day') return n === 1 ? '1 vez al día' : `${n} veces al día`;
  if (habit.period === 'week') return n === 1 ? '1 día a la semana' : `${n} días a la semana`;
  return n === 1 ? '1 día al mes' : `${n} días al mes`;
}

export function dayTarget(habit) {
  return habit.period === 'day' ? habit.target : 1;
}

export function isDayDone(habit, key) {
  return getCount(habit.id, key) >= dayTarget(habit);
}

// Siguiente valor al tocar un día: recorre 0..target en diarios, alterna 0/1 en el resto.
export function nextCount(habit, key) {
  const max = dayTarget(habit);
  return (getCount(habit.id, key) + 1) % (max + 1);
}

function periodStart(habit, key) {
  if (habit.period === 'week') return startOfWeek(key);
  if (habit.period === 'month') return startOfMonth(key);
  return key;
}

function nextPeriodStart(habit, start) {
  if (habit.period === 'week') return addDays(start, 7);
  if (habit.period === 'month') {
    const d = fromKey(start);
    return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  return addDays(start, 1);
}

function prevPeriodStart(habit, start) {
  if (habit.period === 'week') return addDays(start, -7);
  if (habit.period === 'month') {
    const d = fromKey(start);
    return toKey(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  return addDays(start, -1);
}

// Progreso del periodo que contiene `key`: { done, target }
export function periodProgress(habit, key = todayKey()) {
  if (habit.period === 'day') return { done: getCount(habit.id, key), target: habit.target };
  const start = periodStart(habit, key);
  const end = nextPeriodStart(habit, start);
  let done = 0;
  for (let k = start; k < end; k = addDays(k, 1)) if (isDayDone(habit, k)) done++;
  return { done, target: habit.target };
}

function isPeriodMet(habit, start) {
  const { done, target } = periodProgress(habit, start);
  return done >= target;
}

export function currentStreak(habit, today = todayKey()) {
  let start = periodStart(habit, today);
  // El periodo actual todavía no ha terminado: si no está cumplido, no rompe la racha.
  if (!isPeriodMet(habit, start)) start = prevPeriodStart(habit, start);
  let streak = 0;
  while (isPeriodMet(habit, start) && streak < 5000) {
    streak++;
    start = prevPeriodStart(habit, start);
  }
  return streak;
}

// Primer día con datos del hábito: su creación o un registro anterior si se rellenó hacia atrás.
export function habitStartKey(habit) {
  const keys = Object.keys(state.logs[habit.id] || {});
  return keys.reduce((min, k) => (k < min ? k : min), habit.createdAt);
}

const daysBetween = (from, to) => Math.round((fromKey(to) - fromKey(from)) / 864e5) + 1;

// Cumplimiento del hábito entre `from` y `to`, evaluado por periodos completos (día, semana o mes).
// Cada periodo puntúa min(hecho, objetivo) / objetivo y pesa según cuántos de sus días caen en el rango.
// El periodo en curso cuenta con lo hecho hasta ahora; si el hábito se creó a mitad de periodo,
// el objetivo de ese primer periodo se reduce en proporción a los días disponibles.
// Devuelve { score, weight }: el % es score / weight.
export function completion(habit, from, to, today = todayKey()) {
  const start = habitStartKey(habit);
  const first = from > start ? from : start;
  const last = to < today ? to : today;
  let score = 0;
  let weight = 0;
  for (let s = periodStart(habit, first); s <= last; s = nextPeriodStart(habit, s)) {
    const end = addDays(nextPeriodStart(habit, s), -1);
    const overlapFrom = s > first ? s : first;
    const overlapTo = end < to ? end : to;
    const days = daysBetween(overlapFrom, overlapTo);
    if (days <= 0) continue;
    const { done, target } = periodGoal(habit, s);
    score += (Math.min(done, target) / target) * days;
    weight += days;
  }
  return { score, weight };
}

// Lo hecho y el objetivo del periodo que contiene `key`, con el objetivo reducido
// si el hábito empezó a mitad de ese periodo.
export function periodGoal(habit, key) {
  const s = periodStart(habit, key);
  if (habit.period === 'day') return { done: getCount(habit.id, s), target: habit.target };
  const end = addDays(nextPeriodStart(habit, s), -1);
  const start = habitStartKey(habit);
  const available = daysBetween(s > start ? s : start, end);
  const target = Math.max(1, Math.ceil((habit.target * available) / daysBetween(s, end)));
  return { done: periodProgress(habit, s).done, target };
}

// Días completados desde que empezó el hábito, y cuántos días han pasado (incluido hoy).
export function lifetimeTotal(habit, today = todayKey()) {
  const start = habitStartKey(habit);
  let done = 0;
  for (let k = start; k <= today; k = addDays(k, 1)) if (isDayDone(habit, k)) done++;
  return { done, days: Math.max(1, daysBetween(start, today)) };
}

// true si el hábito aún no tiene ningún periodo terminado (solo existe el actual).
export function onlyCurrentPeriod(habit, today = todayKey()) {
  return habitStartKey(habit) >= periodStart(habit, today);
}

export function bestStreak(habit, today = todayKey()) {
  let best = 0;
  let run = 0;
  const last = periodStart(habit, today);
  for (let s = periodStart(habit, habitStartKey(habit)); s <= last; s = nextPeriodStart(habit, s)) {
    if (isPeriodMet(habit, s)) best = Math.max(best, ++run);
    else if (s !== last) run = 0;
  }
  return best;
}

export function doneDaysInMonth(habit, year, month) {
  let n = 0;
  for (let k = toKey(new Date(year, month, 1)); fromKey(k).getMonth() === month; k = addDays(k, 1)) {
    if (isDayDone(habit, k)) n++;
  }
  return n;
}
