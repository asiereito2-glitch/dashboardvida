// Modo juego: experiencia (XP), niveles, atributos y clase.
//
// La XP no se guarda: se calcula a partir del historial de cada hábito. Así, desmarcar
// un día resta su XP y cambiar la dificultad de un hábito recalcula todo su historial.
import { getCategory, getCount, getHabit, state } from './store.js';
import { habitStartKey, isDayDone } from './habit-logic.js';
import { addDays, startOfMonth, startOfWeek, todayKey } from './dates.js';

export const DIFFICULTIES = [
  { id: 'easy', label: 'Fácil', xp: 10 },
  { id: 'medium', label: 'Media', xp: 20 },
  { id: 'hard', label: 'Difícil', xp: 30 },
];

export const ATTRIBUTES = [
  { id: 'fuerza', label: 'Fuerza', emoji: '💪' },
  { id: 'sabiduria', label: 'Sabiduría', emoji: '📖' },
  { id: 'disciplina', label: 'Disciplina', emoji: '🛡️' },
  { id: 'concentracion', label: 'Concentración', emoji: '🎯' },
  { id: 'animo', label: 'Ánimo', emoji: '☀️' },
];

const DEFAULT_ATTRIBUTE_BY_CATEGORY = {
  salud: 'fuerza',
  aprendizaje: 'sabiduria',
  mente: 'animo',
  productividad: 'concentracion',
  social: 'animo',
  finanzas: 'disciplina',
  hogar: 'disciplina',
};
const FALLBACK_ATTRIBUTE = 'disciplina';

export const CLASSES = {
  fuerza: { name: 'Guerrero', emoji: '⚔️', text: 'Tu fuerza está por encima de todo. Cuerpo fuerte, mente fuerte.' },
  sabiduria: { name: 'Sabio', emoji: '📜', text: 'Aprender es lo tuyo. Cada día sabes un poco más.' },
  disciplina: { name: 'Paladín', emoji: '🛡️', text: 'Constancia de hierro. Cumples aunque no te apetezca.' },
  concentracion: { name: 'Arquero', emoji: '🏹', text: 'Foco total. Apuntas a un objetivo y no fallas.' },
  animo: { name: 'Bardo', emoji: '🎵', text: 'Cuidas tu mente y a los tuyos. Tu energía contagia.' },
  balanced: { name: 'Aventurero', emoji: '🧭', text: 'Equilibrado en todo. Ningún camino se te resiste.' },
};

export const GOAL_XP = 100; // por cada meta cumplida
export const WORKOUT_XP = 30; // por entrenamiento
export const READING_DAY_XP = 10; // por cada día con lectura apuntada
export const BOOK_XP = 50; // por libro terminado
const STREAK_BONUS_STEP = 5; // XP extra por cada semana (o periodo) de racha
const STREAK_BONUS_MAX = 25;
const BALANCED_MARGIN = 0.1; // si el 1º y el 2º atributo difieren menos de un 10%, clase equilibrada

export function gameEnabled() {
  return Boolean(state.settings.gameMode);
}

export function difficultyOf(habit) {
  return DIFFICULTIES.find((d) => d.id === habit.difficulty) || DIFFICULTIES[1];
}

export function attributeOfCategory(categoryId) {
  const cat = categoryId && getCategory(categoryId);
  return cat?.attribute || DEFAULT_ATTRIBUTE_BY_CATEGORY[categoryId] || FALLBACK_ATTRIBUTE;
}

export function attributeOfHabit(habit) {
  return attributeOfCategory(habit.categoryId);
}

// XP ganada por un hábito cada día: { 'YYYY-MM-DD': xp }.
// Diarios: XP proporcional a lo hecho; bonus por cada 7 días seguidos cumplidos.
// Semanales/mensuales: XP por cada día hecho; bonus por cada periodo anterior cumplido seguido.
function habitXpByDay(habit, today) {
  const base = difficultyOf(habit).xp;
  const out = {};
  const start = habitStartKey(habit);

  if (habit.period === 'day') {
    let run = 0;
    for (let k = start; k <= today; k = addDays(k, 1)) {
      const count = Math.min(getCount(habit.id, k), habit.target);
      if (!count) {
        if (k !== today) run = 0;
        continue;
      }
      const full = count >= habit.target;
      if (full) run++;
      else if (k !== today) run = 0;
      const bonus = full ? Math.min(STREAK_BONUS_MAX, Math.floor(run / 7) * STREAK_BONUS_STEP) : 0;
      out[k] = Math.round((base * count) / habit.target) + bonus;
    }
    return out;
  }

  const periodStart = habit.period === 'week' ? startOfWeek : startOfMonth;
  let streak = 0;
  let current = periodStart(start);
  let doneInPeriod = 0;
  for (let k = start; k <= today; k = addDays(k, 1)) {
    const p = periodStart(k);
    if (p !== current) {
      streak = doneInPeriod >= habit.target ? streak + 1 : 0;
      current = p;
      doneInPeriod = 0;
    }
    if (isDayDone(habit, k)) {
      doneInPeriod++;
      out[k] = base + Math.min(STREAK_BONUS_MAX, streak * STREAK_BONUS_STEP);
    }
  }
  return out;
}

// Resumen completo: XP total, por día y por atributo (también por mes para comparar).
export function computeXp(today = todayKey()) {
  const byDay = {};
  const byAttribute = Object.fromEntries(ATTRIBUTES.map((a) => [a.id, 0]));
  const byAttributeMonth = {}; // { 'YYYY-MM': { atributo: xp } }
  let total = 0;
  const add = (day, attr, xp) => {
    total += xp;
    byDay[day] = (byDay[day] || 0) + xp;
    byAttribute[attr] += xp;
    const month = day.slice(0, 7);
    byAttributeMonth[month] ||= Object.fromEntries(ATTRIBUTES.map((a) => [a.id, 0]));
    byAttributeMonth[month][attr] += xp;
  };
  state.habits.forEach((habit) => {
    const attr = attributeOfHabit(habit);
    Object.entries(habitXpByDay(habit, today)).forEach(([day, xp]) => add(day, attr, xp));
  });
  // Meta cumplida: XP extra al atributo de su hábito (las numéricas, a Disciplina).
  state.goals.forEach((goal) => {
    if (!goal.completedAt || goal.completedAt > today) return;
    const habit = goal.type === 'habit' && getHabit(goal.habitId);
    add(goal.completedAt, habit ? attributeOfHabit(habit) : FALLBACK_ATTRIBUTE, GOAL_XP);
  });
  // Un entrenamiento que ya marcó su hábito da la XP de ese hábito, no las dos.
  state.gym.sessions.forEach((session) => {
    if (session.date > today || getHabit(session.habitId)) return;
    add(session.date, 'fuerza', WORKOUT_XP);
  });
  const readingDays = new Set(state.books.flatMap((b) => b.readings.map((r) => r.date)));
  readingDays.forEach((day) => { if (day <= today) add(day, 'sabiduria', READING_DAY_XP); });
  state.books.forEach((book) => {
    if (book.status === 'read' && book.finishedOn && book.finishedOn <= today) add(book.finishedOn, 'sabiduria', BOOK_XP);
  });
  return { total, byDay, byAttribute, byAttributeMonth };
}

// XP necesaria para pasar del nivel `level` al siguiente: 100, 125, 150...
const xpForLevel = (level) => 100 + (level - 1) * 25;

export function levelInfo(xp) {
  let level = 1;
  let rest = xp;
  while (rest >= xpForLevel(level)) {
    rest -= xpForLevel(level);
    level++;
  }
  return { level, into: rest, needed: xpForLevel(level) };
}

// Puntos de atributo que se muestran (XP / 10, más manejable).
export const attributePoints = (xp) => Math.round(xp / 10);

export function playerClass(byAttribute) {
  const sorted = Object.entries(byAttribute).sort((a, b) => b[1] - a[1]);
  const [first, second] = sorted;
  if (!first[1]) return null;
  if (second[1] && (first[1] - second[1]) / first[1] < BALANCED_MARGIN) return CLASSES.balanced;
  return CLASSES[first[0]];
}

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
