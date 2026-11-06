// Utilidades de fechas. Las fechas se guardan como texto 'YYYY-MM-DD' en hora local.

export const DAY_NAMES_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const pad = (n) => String(n).padStart(2, '0');

export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return toKey(new Date());
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

// Lunes = 0 ... Domingo = 6
export function weekdayIndex(key) {
  return (fromKey(key).getDay() + 6) % 7;
}

export function startOfWeek(key) {
  return addDays(key, -weekdayIndex(key));
}

export function startOfMonth(key) {
  return key.slice(0, 8) + '01';
}

export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function monthLabel(year, month) {
  const name = MONTH_NAMES[month];
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}

const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

// 'Hoy', 'Mañana', 'Ayer' o '12 oct' (con año si no es el actual).
export function relativeDayLabel(key) {
  const today = todayKey();
  if (key === today) return 'Hoy';
  if (key === addDays(today, 1)) return 'Mañana';
  if (key === addDays(today, -1)) return 'Ayer';
  const d = fromKey(key);
  const label = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

// Para usar dentro de una frase: 'hoy', 'mañana', 'ayer' o 'el 12 oct'.
export function onDayLabel(key) {
  const label = relativeDayLabel(key);
  return ['Hoy', 'Mañana', 'Ayer'].includes(label) ? label.toLowerCase() : `el ${label}`;
}

// Duración guardada en horas: 7.5 -> '7h 30min', 8 -> '8h'.
export function fmtDuration(hours) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (!h) return `${min}min`;
  return min ? `${h}h ${min}min` : `${h}h`;
}

// Devuelve las celdas de un mes para un calendario que empieza en lunes.
// Las celdas vacías del principio son null.
export function monthGrid(year, month) {
  const first = toKey(new Date(year, month, 1));
  const cells = Array(weekdayIndex(first)).fill(null);
  const total = daysInMonth(year, month);
  for (let d = 1; d <= total; d++) cells.push(toKey(new Date(year, month, d)));
  return cells;
}
