// Datos de una semana (lunes a domingo) reunidos de todas las áreas de la app.
import { activeHabits, isGoodNight, state } from './store.js';
import { sessionVolume } from './gym.js';
import { readBalanceData } from './balance-bridge.js';
import { completion, isDayDone } from './habit-logic.js';
import { computeXp, gameEnabled } from './game.js';
import { addDays, startOfWeek, todayKey } from './dates.js';

const average = (list) => (list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : null);

function valuesInWeek(map, start, end) {
  return Object.keys(map).filter((k) => k >= start && k <= end).sort().map((k) => map[k]);
}

// Último peso conocido hasta `end`.
function weightUntil(end) {
  const days = Object.keys(state.body.weights).filter((k) => k <= end).sort();
  return days.length ? state.body.weights[days[days.length - 1]] : null;
}

function habitStats(start, end, today) {
  const rows = activeHabits().map((habit) => {
    const c = completion(habit, start, end, today);
    let done = 0;
    for (let k = start; k <= end; k = addDays(k, 1)) if (isDayDone(habit, k)) done++;
    return { habit, done, weight: c.weight, pct: c.weight ? Math.round((c.score / c.weight) * 100) : null };
  }).filter((r) => r.pct !== null);
  const weight = rows.reduce((sum, r) => sum + r.weight, 0);
  const overall = weight ? Math.round(rows.reduce((sum, r) => sum + r.pct * r.weight, 0) / weight) : null;
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  return {
    pct: overall,
    done: rows.reduce((sum, r) => sum + r.done, 0),
    best: sorted[0] || null,
    worst: sorted.length > 1 && sorted.at(-1).pct < sorted[0].pct ? sorted.at(-1) : null,
  };
}

function gymWeek(start, end) {
  if (!state.gym.sessions.length) return null;
  const sessions = state.gym.sessions.filter((s) => s.date >= start && s.date <= end);
  return { count: sessions.length, kilos: sessions.reduce((sum, s) => sum + sessionVolume(s), 0) };
}

function pagesInWeek(start, end) {
  const readings = state.books.flatMap((b) => b.readings);
  if (!readings.length) return null;
  return readings.filter((r) => r.date >= start && r.date <= end).reduce((sum, r) => sum + r.pages, 0);
}

function money(start, end) {
  const data = readBalanceData();
  if (!data) return null;
  const list = (data.transactions || []).filter((t) => t.date >= start && t.date <= end
    && !t.extraordinary && !t.tripId);
  const sum = (type) => list.filter((t) => t.type === type).reduce((total, t) => total + t.amount, 0);
  return { spent: sum('expense'), income: sum('income') };
}

export function weekSummary(start, today = todayKey()) {
  const end = addDays(start, 6);
  const previousWeight = weightUntil(addDays(start, -1));
  const weight = valuesInWeek(state.body.weights, start, end).length ? weightUntil(end) : null;
  const xpByDay = gameEnabled() ? computeXp(today).byDay : null;
  return {
    start,
    end,
    habits: habitStats(start, end, today),
    mood: average(valuesInWeek(state.moods, start, end)),
    sleep: average(valuesInWeek(state.body.sleep, start, end)),
    goodNights: valuesInWeek(state.body.sleep, start, end).filter(isGoodNight).length,
    nights: valuesInWeek(state.body.sleep, start, end).length,
    gym: gymWeek(start, end),
    pages: pagesInWeek(start, end),
    weight,
    weightChange: weight !== null && previousWeight !== null ? weight - previousWeight : null,
    money: money(start, end),
    todosDone: state.todos.filter((t) => t.done && t.doneAt >= start && t.doneAt <= end).length,
    goalsDone: state.goals.filter((g) => g.completedAt && g.completedAt >= start && g.completedAt <= end),
    xp: xpByDay ? Object.entries(xpByDay)
      .filter(([k]) => k >= start && k <= end)
      .reduce((sum, [, v]) => sum + v, 0) : null,
  };
}

// Gasto para Inicio: hoy, esta semana y % frente a los mismos días de la semana pasada
// (de lunes hasta el mismo día), para no comparar una semana a medias con una entera.
export function homeSpending(today = todayKey()) {
  const expenses = (readBalanceData()?.transactions || []).filter((t) => t.type === 'expense');
  const sum = (from, to) => expenses
    .filter((t) => t.date >= from && t.date <= to)
    .reduce((total, t) => total + t.amount, 0);
  const week = sum(startOfWeek(today), today);
  const lastWeek = sum(addDays(startOfWeek(today), -7), addDays(today, -7));
  return {
    today: sum(today, today),
    week,
    change: lastWeek ? Math.round(((week - lastWeek) / lastWeek) * 100) : null,
  };
}

export function lastWeekStart(today = todayKey()) {
  return addDays(startOfWeek(today), -7);
}
