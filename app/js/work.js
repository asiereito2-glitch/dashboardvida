// Trabajo: turnos, horas y sueldo aproximado.
// Un turno que acaba antes de empezar termina al día siguiente y cuenta en el día que empieza.
import { save, state, uid } from './store.js';
import { addDays, startOfMonth, startOfWeek, todayKey } from './dates.js';

const DAY_MINUTES = 24 * 60;

const toMinutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const endsNextDay = (shift) => shift.end < shift.start;
const shiftMinutes = (shift) => (toMinutes(shift.end) - toMinutes(shift.start) + DAY_MINUTES) % DAY_MINUTES;

export const shiftHours = (shift) => shiftMinutes(shift) / 60;

// Cada turno guarda su precio: si cambia el sueldo, lo ya trabajado no se recalcula.
export const shiftPay = (shift) => shiftHours(shift) * (shift.rate ?? state.work.rate ?? 0);

function totals(from, to) {
  const shifts = state.work.shifts.filter((s) => s.date >= from && s.date <= to);
  return {
    hours: shifts.reduce((sum, s) => sum + shiftHours(s), 0),
    pay: shifts.reduce((sum, s) => sum + shiftPay(s), 0),
  };
}

export function workTotals(today = todayKey()) {
  return {
    today: totals(today, today),
    week: totals(startOfWeek(today), addDays(startOfWeek(today), 6)),
    month: totals(startOfMonth(today), `${today.slice(0, 7)}-31`),
  };
}

export function shiftsByDay() {
  const days = new Map();
  [...state.work.shifts]
    .sort((a, b) => b.date.localeCompare(a.date) || a.start.localeCompare(b.start))
    .forEach((s) => days.set(s.date, [...(days.get(s.date) || []), s]));
  return [...days].map(([date, shifts]) => ({ date, shifts }));
}

function overlaps(date, start, end, ignoreId) {
  const from = toMinutes(start);
  const to = from + shiftMinutes({ start, end });
  return state.work.shifts.some((s) => {
    if (s.date !== date || s.id === ignoreId) return false;
    const otherFrom = toMinutes(s.start);
    return from < otherFrom + shiftMinutes(s) && otherFrom < to;
  });
}

// Devuelve el texto del error, o null si el turno se ha guardado.
export function saveShift(id, { date, start, end }) {
  if (!date || !start || !end) return 'Elige el día y las dos horas.';
  if (start === end) return 'La hora de inicio y la de fin son iguales.';
  if (overlaps(date, start, end, id)) return 'Se solapa con otro turno de ese día.';
  const existing = state.work.shifts.find((s) => s.id === id);
  if (existing) Object.assign(existing, { date, start, end });
  else {
    state.work.shifts.push({
      id: uid(), date, start, end, rate: state.work.rate,
    });
  }
  save();
  return null;
}

export function deleteShift(id) {
  state.work.shifts = state.work.shifts.filter((s) => s.id !== id);
  save();
}

export function setRate(rate) {
  state.work.rate = rate;
  save();
}

export function saveTemplate(id, data) {
  const template = state.work.templates.find((t) => t.id === id);
  if (template) Object.assign(template, data);
  else state.work.templates.push({ id: uid(), ...data });
  save();
}

export function deleteTemplate(id) {
  state.work.templates = state.work.templates.filter((t) => t.id !== id);
  save();
}
