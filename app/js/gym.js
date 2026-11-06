// Gimnasio: rutinas, entrenamiento en curso e historial.
// Un mismo ejercicio se reconoce por su nombre, aunque esté en varias rutinas.
import {
  getHabit, persist, save, state, uid,
} from './store.js';
import { isDayDone } from './habit-logic.js';
import { fmtNumber, parseNum } from './goals.js';
import { addDays, startOfWeek, todayKey } from './dates.js';

export const KINDS = [
  { id: 'weight', label: 'Con peso' },
  { id: 'bodyweight', label: 'Corporal' },
  { id: 'free', label: 'Libre' },
];
export const REST_OPTIONS = [60, 90, 120, 180];
export const MUSCLES = [
  { id: 'chest', label: 'Pecho' },
  { id: 'back', label: 'Espalda' },
  { id: 'shoulders', label: 'Hombros' },
  { id: 'biceps', label: 'Bíceps' },
  { id: 'triceps', label: 'Tríceps' },
  { id: 'forearms', label: 'Antebrazos' },
  { id: 'abs', label: 'Abdomen' },
  { id: 'glutes', label: 'Glúteos' },
  { id: 'quads', label: 'Cuádriceps' },
  { id: 'hamstrings', label: 'Femorales' },
  { id: 'calves', label: 'Gemelos' },
];
const DEFAULT_REST = 90;
const DEFAULT_INCREMENT = 2.5;

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Ejercicios guardados aunque aún no estén en ninguna rutina ni entrenamiento.
const catalog = () => (state.gym.catalog ||= []);

// ---------- Rutinas ----------

export function getRoutine(id) {
  return state.gym.routines.find((r) => r.id === id);
}

export function newExercise(data = {}) {
  return {
    id: uid(),
    name: '',
    kind: 'weight',
    muscle: '',
    sets: 3,
    min: 8,
    max: 12,
    inc: DEFAULT_INCREMENT,
    note: '',
    ...data,
  };
}

// Corregir un nombre mantiene el historial de ese ejercicio y lo cambia en las demás rutinas.
function renameExercise(from, to) {
  const rename = (e) => { if (sameName(e.name, from)) e.name = to; };
  state.gym.routines.forEach((r) => r.exercises.forEach(rename));
  state.gym.sessions.forEach((s) => s.exercises.forEach(rename));
  state.gym.draft?.exercises.forEach(rename);
  catalog().forEach(rename);
  state.goals.forEach((g) => {
    if (g.source?.type === 'exercise' && sameName(g.source.id, from)) g.source.id = to;
  });
}

export function saveRoutine(id, data, renames = []) {
  renames.forEach(([from, to]) => renameExercise(from, to));
  const routine = id ? getRoutine(id) : { id: uid() };
  Object.assign(routine, data);
  // Un ejercicio ya conocido trae su grupo muscular.
  routine.exercises.forEach((e) => { e.muscle ||= exerciseMuscle(e.name); });
  if (!id) state.gym.routines.push(routine);
  save();
  return routine;
}

export function duplicateRoutine(id) {
  const source = getRoutine(id);
  const copy = {
    ...source,
    id: uid(),
    name: `${source.name} (copia)`,
    exercises: source.exercises.map((e) => ({ ...e, id: uid() })),
  };
  state.gym.routines.push(copy);
  save();
  return copy;
}

// El historial de la rutina se conserva.
export function deleteRoutine(id) {
  state.gym.routines = state.gym.routines.filter((r) => r.id !== id);
  save();
}

export function exerciseNames() {
  const names = new Map();
  const add = (e) => { if (!names.has(e.name.toLowerCase())) names.set(e.name.toLowerCase(), e.name); };
  state.gym.routines.forEach((r) => r.exercises.forEach(add));
  state.gym.sessions.forEach((s) => s.exercises.forEach(add));
  catalog().forEach(add);
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

function knownExercise(name) {
  for (const routine of state.gym.routines) {
    const found = routine.exercises.find((e) => sameName(e.name, name));
    if (found) return found;
  }
  return catalog().find((e) => sameName(e.name, name)) || null;
}

// ---------- Entrenamiento en curso ----------

const blankSet = (w = '') => ({ w, r: '', done: false });

function draftExercise(e) {
  return {
    id: uid(),
    name: e.name,
    kind: e.kind,
    muscle: e.muscle || '',
    sets: e.sets,
    min: e.min,
    max: e.max,
    inc: e.inc,
    note: e.note,
    log: Array.from({ length: e.sets }, () => blankSet()),
  };
}

export function startDraft(routineId) {
  const routine = routineId ? getRoutine(routineId) : null;
  state.gym.draft = {
    routineId: routine?.id || null,
    name: routine?.name || 'Entreno libre',
    rest: routine?.rest || DEFAULT_REST,
    date: todayKey(),
    startedAt: Date.now(),
    restUntil: null,
    exercises: routine ? routine.exercises.map(draftExercise) : [],
  };
  persist();
}

export function discardDraft() {
  state.gym.draft = null;
  save();
}

// Ejercicio para añadir o sustituir solo en este entrenamiento.
export function draftExerciseNamed(name, kind, muscle) {
  const known = knownExercise(name);
  return draftExercise(newExercise({
    ...known,
    name: known?.name || name.trim(),
    kind: known?.kind || kind,
    muscle: muscle || known?.muscle || '',
  }));
}

// Convierte lo apuntado en un entrenamiento. Las series sin repeticiones no cuentan.
function loggedExercises(draft) {
  const missing = [];
  const exercises = [];
  draft.exercises.forEach((e) => {
    const sets = [];
    let lacksWeight = false;
    e.log.forEach((s) => {
      const r = parseNum(s.r);
      if (!r || r <= 0) return;
      const w = parseNum(s.w);
      if (w === null && e.kind === 'weight') lacksWeight = true;
      sets.push({ w: e.kind === 'free' ? 0 : w || 0, r });
    });
    if (lacksWeight) missing.push(e.name);
    if (sets.length) exercises.push({ name: e.name, kind: e.kind, muscle: e.muscle || '', sets });
  });
  return { exercises, missing };
}

export const draftCheck = () => loggedExercises(state.gym.draft);

// ---------- Hábito vinculado ----------

export const linkedHabit = () => getHabit(state.gym.habitId) || null;

export function setLinkedHabit(id) {
  state.gym.habitId = id;
  save();
}

function changeHabitCount(habitId, date, change) {
  const log = (state.logs[habitId] ||= {});
  const count = (log[date] || 0) + change;
  if (count > 0) log[date] = count;
  else delete log[date];
}

// Si ya lo habías marcado ese día, no se toca ni se desmarcará después.
function markLinkedHabit(session) {
  const habit = linkedHabit();
  if (!habit || isDayDone(habit, session.date)) return;
  changeHabitCount(habit.id, session.date, 1);
  session.habitId = habit.id;
}

// Si hay otro entrenamiento ese día, el hábito sigue marcado y pasa a depender de él.
function unmarkHabit(session) {
  if (!session.habitId) return;
  const sameDay = state.gym.sessions.find((s) => s.id !== session.id && s.date === session.date);
  if (sameDay) sameDay.habitId = session.habitId;
  else changeHabitCount(session.habitId, session.date, -1);
  delete session.habitId;
}

export function finishDraft(date, minutes) {
  const draft = state.gym.draft;
  const session = {
    id: uid(),
    date,
    finishedAt: Date.now(),
    routineId: draft.routineId,
    routineName: draft.name,
    minutes,
    exercises: loggedExercises(draft).exercises,
  };
  markLinkedHabit(session);
  state.gym.sessions.push(session);
  state.gym.draft = null;
  save();
  return session;
}

// ---------- Historial ----------

const byDate = (a, b) => a.date.localeCompare(b.date) || a.finishedAt - b.finishedAt;
const isEarlier = (a, b) => byDate(a, b) < 0;

export function getSession(id) {
  return state.gym.sessions.find((s) => s.id === id);
}

export function updateSession(id, data) {
  const session = getSession(id);
  const movedMark = session.habitId && data.date !== session.date;
  if (movedMark) unmarkHabit(session);
  Object.assign(session, data);
  if (movedMark) markLinkedHabit(session);
  save();
}

export function deleteSession(id) {
  unmarkHabit(getSession(id));
  state.gym.sessions = state.gym.sessions.filter((s) => s.id !== id);
  save();
}

export function sessionsNewestFirst() {
  return [...state.gym.sessions].sort((a, b) => byDate(b, a));
}

export function sessionVolume(session) {
  return session.exercises.reduce(
    (total, e) => total + e.sets.reduce((sum, s) => sum + s.w * s.r, 0),
    0,
  );
}

export const sessionSets = (session) => session.exercises.reduce((total, e) => total + e.sets.length, 0);

export function previousSession(session) {
  return sessionsNewestFirst().find((s) => s.routineName === session.routineName && isEarlier(s, session)) || null;
}

export function lastRoutineSession(name) {
  return sessionsNewestFirst().find((s) => s.routineName === name) || null;
}

// Última vez que se hizo un ejercicio: { date, sets }.
export function lastTime(name) {
  for (const session of sessionsNewestFirst()) {
    const found = session.exercises.find((e) => sameName(e.name, name));
    if (found) return { date: session.date, sets: found.sets };
  }
  return null;
}

const topWeight = (exercise) => Math.max(...exercise.sets.map((s) => s.w));

// Ejercicios en los que este entrenamiento supera el peso máximo anterior.
export function sessionRecords(session) {
  return session.exercises.flatMap((e) => {
    const earlier = state.gym.sessions
      .filter((s) => isEarlier(s, session))
      .flatMap((s) => s.exercises.filter((x) => sameName(x.name, e.name)))
      .map(topWeight);
    const top = topWeight(e);
    if (!earlier.length || top <= 0 || top <= Math.max(...earlier)) return [];
    return [{ name: e.name, weight: top, before: Math.max(...earlier) }];
  });
}

export function sessionsThisWeek(today = todayKey()) {
  const start = startOfWeek(today);
  const end = addDays(start, 6);
  return state.gym.sessions.filter((s) => s.date >= start && s.date <= end).length;
}

// '60 kg · 10 / 9 / 8', o serie a serie si los pesos cambian.
export function setsLabel(exercise) {
  const { kind, sets } = exercise;
  const reps = sets.map((s) => fmtNumber(s.r)).join(' / ');
  if (kind === 'free') return reps;
  const first = sets[0].w;
  if (sets.every((s) => s.w === first)) return `${first ? `${fmtNumber(first)} kg` : 'Corporal'} · ${reps}`;
  return sets.map((s) => `${s.w ? fmtNumber(s.w) : 'PC'}×${fmtNumber(s.r)}`).join(' · ');
}

// ---------- Progreso ----------

// Peso estimado a una repetición (fórmula de Epley).
const oneRepMax = (set) => set.w * (1 + set.r / 30);

export function exerciseHistory(name) {
  return [...state.gym.sessions].sort(byDate).flatMap((session) => session.exercises
    .filter((e) => sameName(e.name, name))
    .map((e) => ({
      date: session.date,
      sessionId: session.id,
      kind: e.kind,
      muscle: e.muscle,
      sets: e.sets,
      top: topWeight(e),
      topReps: Math.max(...e.sets.map((s) => s.r)),
      estimate: Math.max(...e.sets.map(oneRepMax)),
      volume: e.sets.reduce((sum, s) => sum + s.w * s.r, 0),
    })));
}

// Doble progresión: primero más repeticiones y, al llegar al máximo en todas las series, más peso.
export function recommend(exercise) {
  const { name, kind, sets: planned, min, max } = exercise;
  const history = exerciseHistory(name).reverse();
  if (!history.length || kind === 'free' || !min) return null;
  const recent = (entry) => entry.sets.slice(0, planned);
  const heaviest = (sets) => Math.max(...sets.map((s) => s.w));
  const sets = recent(history[0]);
  const weight = heaviest(sets);
  const same = sets.every((s) => s.w === weight);
  const reps = sets.map((s) => s.r).join(' / ');
  const short = sets.some((s) => s.r < min);
  const keep = { kind: 'hold', title: weight ? `Mantén ${fmtNumber(weight)} kg` : 'Mantén el peso corporal', suggest: weight || null };

  if (sets.length >= planned && same && sets.every((s) => s.r >= max)) {
    if (!weight) return { kind: 'up', title: 'Súbele la dificultad', text: `Llegaste a ${max} repeticiones en todas las series. Añade lastre o usa una variante más difícil.`, suggest: null };
    const next = weight + (exercise.inc ?? DEFAULT_INCREMENT);
    return { kind: 'up', title: `Sube a ${fmtNumber(next)} kg`, text: `Llegaste a ${max} repeticiones en todas las series. Con el peso nuevo vuelve a empezar desde ${min}.`, suggest: next };
  }
  if (short) {
    const before = history[1] ? recent(history[1]) : null;
    const twice = before && heaviest(before) === weight && before.some((s) => s.r < min);
    if (!twice) return { ...keep, text: `Alguna serie quedó por debajo de ${min} repeticiones (${reps}). Repite este peso.` };
    if (!weight) return { kind: 'down', title: 'Prueba una variante más fácil', text: `Dos sesiones seguidas por debajo de ${min} repeticiones.`, suggest: null };
    const lower = Math.round(weight * 0.9 * 2) / 2;
    return { kind: 'down', title: `Baja a ${fmtNumber(lower)} kg`, text: `Dos sesiones seguidas por debajo de ${min} repeticiones. Baja un 10 % y vuelve a subir.`, suggest: lower };
  }
  return { ...keep, text: `Objetivo: llegar a ${max} repeticiones en todas las series (última vez: ${reps}).` };
}

export function adviceFor(name) {
  const known = knownExercise(name);
  return known ? recommend(known) : null;
}

// Ejercicios de las rutinas actuales con el peso que toca.
export function readyToIncrease() {
  const names = new Set(state.gym.routines.flatMap((r) => r.exercises.map((e) => e.name)));
  return [...names].flatMap((name) => {
    const advice = adviceFor(name);
    return advice?.kind === 'up' ? [{ name, suggest: advice.suggest }] : [];
  });
}

// Una fila por ejercicio ya entrenado, del más reciente al más antiguo.
export function exerciseSummaries() {
  return exerciseNames()
    .flatMap((name) => {
      const history = exerciseHistory(name);
      if (!history.length) return [];
      return [{
        name,
        lastDate: history.at(-1).date,
        top: Math.max(...history.map((h) => h.top)),
        topReps: Math.max(...history.map((h) => h.topReps)),
      }];
    })
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

// Primero la rutina entrenada más recientemente.
export function routineNames() {
  return [...new Set(sessionsNewestFirst().map((s) => s.routineName))];
}

export function routineSessions(name) {
  return state.gym.sessions.filter((s) => s.routineName === name).sort(byDate);
}

export function setWeeklyGoal(goal) {
  state.gym.weeklyGoal = goal;
  save();
}

export function weekStats(today = todayKey()) {
  const goal = state.gym.weeklyGoal;
  const current = startOfWeek(today);
  const count = (monday) => {
    const end = addDays(monday, 6);
    return state.gym.sessions.filter((s) => s.date >= monday && s.date <= end).length;
  };
  const thisWeek = count(current);
  // La semana en curso no rompe la racha: solo suma cuando ya se ha cumplido.
  let streak = thisWeek >= goal ? 1 : 0;
  for (let week = addDays(current, -7); count(week) >= goal; week = addDays(week, -7)) streak++;
  const first = state.gym.sessions.map((s) => s.date).sort()[0];
  let done = 0;
  let weeks = 0;
  if (first) {
    for (let week = startOfWeek(first); week < current; week = addDays(week, 7)) {
      done += Math.min(count(week), goal);
      weeks++;
    }
  }
  return {
    goal, thisWeek, streak, adherence: weeks ? Math.round((done / (goal * weeks)) * 100) : null,
  };
}

// La rutina que más tiempo lleva sin hacerse (o una sin estrenar).
export function nextRoutine() {
  const lastDate = (r) => lastRoutineSession(r.name)?.date || '';
  return [...state.gym.routines].sort((a, b) => lastDate(a).localeCompare(lastDate(b)))[0] || null;
}

// ---------- Grupos musculares ----------

// Si el ejercicio se guardó sin grupo, vale el que tenga ahora en tus rutinas.
const muscleOf = (exercise) => exercise.muscle || knownExercise(exercise.name)?.muscle || '';

export function exerciseMuscle(name) {
  return muscleOf({ name }) || exerciseHistory(name).reverse().find((h) => h.muscle)?.muscle || '';
}

// Todos los ejercicios: entrenados, de rutinas y guardados. Primero los más recientes.
export function exerciseList() {
  return exerciseNames()
    .map((name) => {
      const history = exerciseHistory(name);
      return {
        name,
        muscle: exerciseMuscle(name),
        lastDate: history.at(-1)?.date || null,
        top: Math.max(0, ...history.map((h) => h.top)),
        topReps: Math.max(0, ...history.map((h) => h.topReps)),
      };
    })
    .sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '') || a.name.localeCompare(b.name, 'es'));
}

// Devuelve el texto del error, o null si se ha guardado.
export function addExercise(name, muscle) {
  const clean = name.trim();
  if (!clean) return 'Ponle un nombre.';
  if (exerciseNames().some((n) => sameName(n, clean))) return 'Ya tienes un ejercicio con ese nombre.';
  catalog().push({ name: clean, kind: 'weight', muscle });
  save();
  return null;
}

// El grupo se aplica al ejercicio en todas partes, también a lo ya entrenado.
export function setExerciseMuscle(name, muscle) {
  const apply = (e) => { if (sameName(e.name, name)) e.muscle = muscle; };
  if (!catalog().some((e) => sameName(e.name, name))) catalog().push({ name, kind: 'weight', muscle });
  catalog().forEach(apply);
  state.gym.routines.forEach((r) => r.exercises.forEach(apply));
  state.gym.sessions.forEach((s) => s.exercises.forEach(apply));
  state.gym.draft?.exercises.forEach(apply);
  save();
}

// Solo se puede borrar si no está en ninguna rutina ni tiene historial.
export function canDeleteExercise(name) {
  return !exerciseHistory(name).length
    && !state.gym.routines.some((r) => r.exercises.some((e) => sameName(e.name, name)));
}

export function deleteExercise(name) {
  state.gym.catalog = catalog().filter((e) => !sameName(e.name, name));
  save();
}

// % de series por grupo, de mayor a menor. Las series sin grupo no cuentan en el %.
export function muscleShares(sessions) {
  const sets = new Map();
  let unassigned = 0;
  sessions.flatMap((s) => s.exercises).forEach((e) => {
    const muscle = muscleOf(e);
    if (muscle) sets.set(muscle, (sets.get(muscle) || 0) + e.sets.length);
    else unassigned += e.sets.length;
  });
  const total = [...sets.values()].reduce((sum, n) => sum + n, 0);
  return {
    total,
    unassigned,
    shares: [...sets].map(([id, n]) => ({ id, sets: n, pct: Math.round((n / total) * 100) }))
      .sort((a, b) => b.sets - a.sets),
  };
}

export const sessionsBetween = (from, to) => state.gym.sessions.filter((s) => s.date >= from && s.date <= to);
