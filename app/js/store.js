// Estado de la app guardado en localStorage del dispositivo.
import { todayKey } from './dates.js';
import { allCovers, replaceCovers } from './covers.js';

const STORAGE_KEY = 'habitos-data-v1';
const BALANCE_KEY = 'balance_app_local_v1';
const BALANCE_SUMMARY_KEY = 'balance_summary';
const TRAVEL_KEY = 'huella.v1';

const DEFAULT_CATEGORIES = [
  { id: 'salud', name: 'Salud', emoji: '💪' },
  { id: 'aprendizaje', name: 'Aprendizaje', emoji: '📚' },
  { id: 'mente', name: 'Mente', emoji: '🧘' },
  { id: 'productividad', name: 'Productividad', emoji: '💼' },
  { id: 'social', name: 'Social', emoji: '👥' },
  { id: 'finanzas', name: 'Finanzas', emoji: '💰' },
  { id: 'hogar', name: 'Hogar', emoji: '🏠' },
];

function emptyState() {
  return {
    version: 1,
    habits: [],
    // logs[habitId][fecha] = número de veces completado ese día
    logs: {},
    categories: DEFAULT_CATEGORIES,
    todos: [],
    goals: [],
    moods: {},
    // peso en kg y horas dormidas, por fecha
    body: { weights: {}, sleep: {} },
    // rutinas, entrenamientos guardados y el que está en curso (`draft`)
    gym: { routines: [], sessions: [], draft: null, weeklyGoal: 3 },
    // las portadas van aparte, en covers.js
    books: [],
    // precio neto por hora, turnos guardados y turnos apuntados
    work: { rate: null, templates: [], shifts: [] },
    settings: {
      habitsView: 'list', showTodos: true, gameMode: false, lastLevelSeen: 1, theme: 'light', wallpaper: 'warm',
    },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const saved = JSON.parse(raw);
    const base = emptyState();
    return { ...base, ...saved, settings: { ...base.settings, ...saved.settings } };
  } catch {
    return emptyState();
  }
}

export const state = load();

// ---------- Copias de seguridad ----------

function readBalance() {
  try {
    return JSON.parse(localStorage.getItem(BALANCE_KEY));
  } catch {
    return null;
  }
}

export function readTravel() {
  try {
    return JSON.parse(localStorage.getItem(TRAVEL_KEY));
  } catch {
    return null;
  }
}

// La copia incluye los datos de la app, las portadas y, aparte, los de Balance y Viajes.
export function exportJson() {
  return JSON.stringify({
    ...state, covers: allCovers(), balance: readBalance(), travel: readTravel(),
  }, null, 2);
}

// Sustituye todos los datos. Lanza un error si el archivo no parece una copia válida.
// Devuelve true si también se ha restaurado Balance o Viajes, que deben volver a arrancar.
// Las copias que no traen esos datos no los tocan.
export function importJson(text) {
  const {
    balance, travel, covers, ...data
  } = JSON.parse(text);
  if (!Array.isArray(data.habits) || typeof data.logs !== 'object') {
    throw new Error(Array.isArray(data.transactions)
      ? 'Esa es una copia de Balance: impórtala en Balance → Ajustes.'
      : 'El archivo no es una copia de seguridad válida.');
  }
  if (balance) restoreBalance(balance);
  if (travel) localStorage.setItem(TRAVEL_KEY, JSON.stringify(travel));
  if (covers) replaceCovers(covers);
  const base = emptyState();
  replaceState({ ...base, ...data, settings: { ...base.settings, ...data.settings } });
  return Boolean(balance || travel);
}

// Como al importar en Balance, el PIN no viene de la copia: se mantiene el actual.
function restoreBalance(balance) {
  const profile = readBalance()?.profile || {};
  const restored = {
    ...balance,
    profile: { ...balance.profile, pinEnabled: Boolean(profile.pinEnabled), pinHash: profile.pinHash ?? null },
  };
  localStorage.setItem(BALANCE_KEY, JSON.stringify(restored));
  localStorage.removeItem(BALANCE_SUMMARY_KEY);
}

export function markBackupDone() {
  state.settings.lastBackupOn = todayKey();
  save();
}

export function resetAll() {
  replaceCovers({});
  replaceState(emptyState());
}

function replaceState(next) {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, next);
  save();
}

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Guarda sin repintar: para lo que se escribe mientras hay un campo activo.
export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('No se pudieron guardar los datos', err);
  }
}

export function save() {
  persist();
  listeners.forEach((fn) => fn());
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Hábitos ----------

export function getHabit(id) {
  return state.habits.find((h) => h.id === id);
}

export function activeHabits() {
  return state.habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
}

export function archivedHabits() {
  return state.habits.filter((h) => h.archived);
}

export function createHabit(data) {
  const habit = {
    id: uid(),
    name: data.name,
    emoji: data.emoji,
    period: data.period, // 'day' | 'week' | 'month'
    target: data.target,
    categoryId: data.categoryId || null,
    difficulty: data.difficulty || 'medium',
    archived: false,
    createdAt: todayKey(),
    order: state.habits.length,
  };
  state.habits.push(habit);
  save();
  return habit;
}

export function updateHabit(id, data) {
  Object.assign(getHabit(id), data);
  save();
}

export function deleteHabit(id) {
  state.habits = state.habits.filter((h) => h.id !== id);
  delete state.logs[id];
  save();
}

export function getCount(habitId, key) {
  return state.logs[habitId]?.[key] || 0;
}

export function setCount(habitId, key, count) {
  const log = (state.logs[habitId] ||= {});
  if (count > 0) log[key] = count;
  else delete log[key];
  save();
}

// ---------- Cuerpo ----------

// Una noche buena dura de 7 a 9 horas.
export const GOOD_SLEEP = [7, 9];
export const isGoodNight = (hours) => hours >= GOOD_SLEEP[0] && hours <= GOOD_SLEEP[1];

// Un valor null borra ese dato del día.
export function setBodyEntry(key, weight, sleep) {
  const assign = (map, value) => {
    if (value === null) delete map[key];
    else map[key] = value;
  };
  assign(state.body.weights, weight);
  assign(state.body.sleep, sleep);
  save();
}

export function latestWeight() {
  const days = Object.keys(state.body.weights).sort();
  return days.length ? state.body.weights[days[days.length - 1]] : null;
}

// ---------- Estado de ánimo (1 = muy mal ... 5 = muy bien) ----------

export function setMood(key, value) {
  if (value) state.moods[key] = value;
  else delete state.moods[key];
  save();
}

export function getCategory(id) {
  return state.categories.find((c) => c.id === id);
}

export function updateCategory(id, data) {
  Object.assign(getCategory(id), data);
  save();
}

// Los hábitos de una categoría borrada quedan sin categoría.
export function deleteCategory(id) {
  state.categories = state.categories.filter((c) => c.id !== id);
  state.habits.forEach((h) => { if (h.categoryId === id) h.categoryId = null; });
  save();
}

// ---------- Tareas ----------

export function getTodo(id) {
  return state.todos.find((t) => t.id === id);
}

export function createTodo(data) {
  const todo = {
    id: uid(),
    title: data.title,
    notes: data.notes || '',
    priority: data.priority, // 'high' | 'normal' | 'low'
    due: data.due || null,
    done: false,
    doneAt: null,
    createdAt: todayKey(),
  };
  state.todos.push(todo);
  save();
  return todo;
}

export function updateTodo(id, data) {
  Object.assign(getTodo(id), data);
  save();
}

export function toggleTodo(id) {
  const todo = getTodo(id);
  todo.done = !todo.done;
  todo.doneAt = todo.done ? todayKey() : null;
  save();
}

export function deleteTodo(id) {
  state.todos = state.todos.filter((t) => t.id !== id);
  save();
}
