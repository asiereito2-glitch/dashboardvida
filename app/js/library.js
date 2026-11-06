// Biblioteca: libros, su estado y las páginas de cada lectura.
import { save, state, uid } from './store.js';
import { deleteCover, setCover } from './covers.js';
import {
  MONTH_NAMES, addDays, fromKey, toKey, todayKey, weekdayIndex,
} from './dates.js';

export const STATUSES = [
  { id: 'unread', label: 'Sin leer' },
  { id: 'reading', label: 'Leyendo' },
  { id: 'read', label: 'Leído' },
];

export const statusLabel = (id) => STATUSES.find((s) => s.id === id).label;
export const getBook = (id) => state.books.find((b) => b.id === id);
export const pagesRead = (book) => book.readings.reduce((total, r) => total + r.pages, 0);

export function booksNewestFirst() {
  return [...state.books].sort((a, b) => b.addedAt - a.addedAt);
}

export const booksReading = () => booksNewestFirst().filter((b) => b.status === 'reading');

export function readingsNewestFirst(book) {
  return [...book.readings].sort((a, b) => b.date.localeCompare(a.date));
}

export function progressPct(book) {
  if (!book.totalPages) return null;
  return Math.min(100, Math.round((pagesRead(book) / book.totalPages) * 100));
}

export function saveBook(id, data, cover) {
  const book = id ? getBook(id) : {
    id: uid(), readings: [], addedAt: Date.now(),
  };
  Object.assign(book, data);
  if (!id) state.books.push(book);
  if (cover) setCover(book.id, cover);
  else if (cover === null) deleteCover(book.id);
  save();
  return book;
}

export function deleteBook(id) {
  state.books = state.books.filter((b) => b.id !== id);
  deleteCover(id);
  save();
}

export function startBook(id, date) {
  Object.assign(getBook(id), { status: 'reading', startedOn: date, finishedOn: null });
  save();
}

// Apuntar páginas en un libro sin empezar lo pasa a Leyendo.
export function saveReading(bookId, entryId, data) {
  const book = getBook(bookId);
  const entry = book.readings.find((r) => r.id === entryId);
  if (entry) Object.assign(entry, data);
  else book.readings.push({ id: uid(), ...data });
  if (book.status === 'unread') {
    book.status = 'reading';
    book.startedOn = data.date;
  }
  if (book.startedOn && data.date < book.startedOn) book.startedOn = data.date;
  save();
}

export function deleteReading(bookId, entryId) {
  const book = getBook(bookId);
  book.readings = book.readings.filter((r) => r.id !== entryId);
  save();
}

export function finishBook(id, date, rating) {
  Object.assign(getBook(id), { status: 'read', finishedOn: date, rating });
  save();
}

// ---------- Estadísticas ----------

const TOP_RATED = 3;
const MONTHS_SHOWN = 12;
const average = (list) => (list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : null);

// Racha que acaba en `end`: días seguidos con lectura, mirando hacia atrás.
function streakEndingOn(end, days) {
  let streak = 0;
  for (let key = end; days.has(key); key = addDays(key, -1)) streak++;
  return streak;
}

function pagesByMonth(pagesByDay, today) {
  const year = fromKey(today).getFullYear();
  const month = fromKey(today).getMonth();
  return Array.from({ length: MONTHS_SHOWN }, (_, i) => {
    const date = new Date(year, month - (MONTHS_SHOWN - 1 - i), 1);
    const prefix = toKey(date).slice(0, 7);
    const value = Object.entries(pagesByDay)
      .filter(([day]) => day.startsWith(prefix))
      .reduce((sum, [, pages]) => sum + pages, 0);
    const name = MONTH_NAMES[date.getMonth()];
    return { short: name.slice(0, 3), full: `${name} de ${date.getFullYear()}`, value };
  });
}

function booksByYear(finished, today) {
  if (!finished.length) return [];
  const years = finished.map((b) => Number(b.finishedOn.slice(0, 4)));
  const first = Math.min(...years);
  const last = Number(today.slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, i) => {
    const year = first + i;
    return { short: String(year), full: String(year), value: years.filter((y) => y === year).length };
  });
}

export function libraryStats(today = todayKey()) {
  const pagesByDay = {};
  state.books.forEach((book) => book.readings.forEach((r) => {
    pagesByDay[r.date] = (pagesByDay[r.date] || 0) + r.pages;
  }));
  const days = new Set(Object.keys(pagesByDay));
  const read = state.books.filter((b) => b.status === 'read');
  const finished = read.filter((b) => b.finishedOn);
  const rated = read.filter((b) => b.rating);
  const totalPages = Object.values(pagesByDay).reduce((sum, v) => sum + v, 0);
  const pagesByWeekday = Array(7).fill(0);
  Object.entries(pagesByDay).forEach(([day, pages]) => { pagesByWeekday[weekdayIndex(day)] += pages; });
  const durations = finished
    .filter((b) => b.startedOn)
    .map((b) => Math.round((fromKey(b.finishedOn) - fromKey(b.startedOn)) / 864e5) + 1);
  // Si hoy aún no has leído, la racha sigue viva desde ayer.
  const streakEnd = days.has(today) ? today : addDays(today, -1);
  return {
    booksThisYear: finished.filter((b) => b.finishedOn.startsWith(today.slice(0, 4))).length,
    pagesThisMonth: Object.entries(pagesByDay)
      .filter(([day]) => day.startsWith(today.slice(0, 7)))
      .reduce((sum, [, pages]) => sum + pages, 0),
    pagesPerDay: days.size ? totalPages / days.size : null,
    pagesByMonth: pagesByMonth(pagesByDay, today),
    booksByYear: booksByYear(finished, today),
    undatedRead: read.length - finished.length,
    pagesByWeekday,
    streak: streakEndingOn(streakEnd, days),
    bestStreak: Math.max(0, ...[...days].map((day) => streakEndingOn(day, days))),
    daysPerBook: average(durations),
    averageRating: average(rated.map((b) => b.rating)),
    topRated: [...rated]
      .sort((a, b) => b.rating - a.rating || (b.finishedOn || '').localeCompare(a.finishedOn || ''))
      .slice(0, TOP_RATED),
  };
}
