// Pantalla Hoy: semana, progreso del día, estado de ánimo, hábitos y tareas.
import { activeHabits, save, setMood, state } from '../store.js';
import { isDayDone, periodProgress } from '../habit-logic.js';
import { DAY_NAMES_SHORT, MONTH_NAMES, addDays, fromKey, startOfWeek, todayKey } from '../dates.js';
import { icons } from '../icons.js';
import { closeSheet, esc, navigate, openSheet } from '../ui.js';
import { bindCheckButtons, checkButton } from './habits.js';
import { computeXp, gameEnabled, levelInfo } from '../game.js';
import { bindTodoRows, sortedOpenTodos, todoRow } from './todos.js';

export const MOODS = [
  { value: 1, emoji: '😞', label: 'Muy mal' },
  { value: 2, emoji: '😕', label: 'Mal' },
  { value: 3, emoji: '😐', label: 'Normal' },
  { value: 4, emoji: '🙂', label: 'Bien' },
  { value: 5, emoji: '😄', label: 'Muy bien' },
];

let selected = null;
let selectedOn = null; // día en que se eligió `selected`, para volver a hoy al cambiar de día

const PERIOD_SUFFIX = { day: 'hoy', week: 'esta semana', month: 'este mes' };

// Un hábito semanal/mensual ya cumplido no cuenta como pendiente en los días que quedan.
export function habitDoneOn(habit, key) {
  if (isDayDone(habit, key)) return true;
  if (habit.period === 'day') return false;
  const { done, target } = periodProgress(habit, key);
  return done >= target;
}

export function todosFor(key) {
  if (!state.settings.showTodos) return { open: [], done: [] };
  const today = todayKey();
  const matches = (t) => t.due === key || (key === today && !t.done && t.due && t.due < today);
  const open = sortedOpenTodos(matches);
  const done = state.todos.filter((t) => t.done && matches(t));
  return { open, done };
}

export function ring(pct) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return `
    <div class="ring" aria-label="${pct}% completado">
      <svg width="50" height="50" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="${r}" stroke="var(--surface-3)" stroke-width="4" fill="none"/>
        <circle cx="25" cy="25" r="${r}" stroke="var(--accent)" stroke-width="4" fill="none"
          stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"
          transform="rotate(-90 25 25)"/>
      </svg>
      <span>${pct}</span>
    </div>`;
}

function weekStrip(today) {
  const start = startOfWeek(selected);
  const d = fromKey(selected);
  const days = DAY_NAMES_SHORT.map((name, i) => {
    const key = addDays(start, i);
    const cls = ['wk-day', key === selected && 'on', key > today && 'future'].filter(Boolean).join(' ');
    return `<button class="${cls}" data-select="${key}">
      <span class="wk-name">${name}</span>
      <span class="wk-num">${fromKey(key).getDate()}</span>
      ${key === today ? '<span class="wk-dot"></span>' : '<span class="wk-dot none"></span>'}
    </button>`;
  }).join('');
  return `
    <div class="wk-month">
      <span>${MONTH_NAMES[d.getMonth()].slice(0, 3).toUpperCase()}</span>
      <span class="muted">${d.getFullYear()}</span>
    </div>
    <div class="wk-days" data-swipe>${days}</div>`;
}

function moodCard(today) {
  if (selected > today) return '';
  const mood = state.moods[selected];
  if (!mood && state.settings.moodHiddenOn === selected) return '';
  const current = MOODS.find((m) => m.value === mood);
  return `
    <div class="card mood-card">
      ${mood ? '' : `<button class="mood-close" data-mood-hide aria-label="Ocultar">${icons.close}</button>`}
      <div class="mood-title">${current ? `Te sientes: <b>${current.label.toLowerCase()}</b>` : '¿Cómo te sientes?'}</div>
      <div class="mood-faces">
        ${MOODS.map((m) => `
          <button class="mood-face ${m.value === mood ? 'on' : ''} ${mood && m.value !== mood ? 'dim' : ''}"
            data-mood="${m.value}" aria-label="${m.label}">${m.emoji}</button>`).join('')}
      </div>
    </div>`;
}

export function habitRow(habit, key) {
  const showProgress = habit.period !== 'day' || habit.target > 1;
  const { done, target } = periodProgress(habit, key);
  return `
    <div class="card today-habit" data-open="${habit.id}" role="button">
      <span class="emoji">${esc(habit.emoji)}</span>
      <span class="grow">
        <span class="name">${esc(habit.name)}</span>
        ${showProgress ? `<span class="small muted">${done}/${target} ${PERIOD_SUFFIX[habit.period]}</span>` : ''}
      </span>
      ${checkButton(habit, key)}
    </div>`;
}

function sectionHead(title, count, href, linkLabel) {
  return `
    <div class="section-head">
      <div class="section-title">${title}${count ? ` <span class="pill">${count}</span>` : ''}</div>
      <button class="link-btn" data-go="${href}">${linkLabel} ${icons.chevronRight}</button>
    </div>`;
}

// Barra de nivel del modo juego; lleva al perfil.
export function xpBar() {
  const { level, into, needed } = levelInfo(computeXp().total);
  return `
    <button class="xp-bar" data-go="#/profile" aria-label="Ver perfil">
      <span class="xp-level">Nivel ${level}</span>
      <span class="xp-track"><span style="width:${(into / needed) * 100}%"></span></span>
      <span class="xp-num">${into}/${needed} XP</span>
    </button>`;
}

function openAddSheet() {
  openSheet('Añadir', `
    <div class="option-list">
      <button data-add="todo"><span style="font-size:20px">📝</span><span class="grow">Nueva tarea</span>${icons.chevronRight}</button>
      <button data-add="habit"><span style="font-size:20px">🌱</span><span class="grow">Nuevo hábito</span>${icons.chevronRight}</button>
    </div>`, (sheet) => {
    sheet.querySelector('[data-add="todo"]').onclick = () => { closeSheet(); navigate(`#/todos/new/${selected}`); };
    sheet.querySelector('[data-add="habit"]').onclick = () => { closeSheet(); navigate('#/habits/new'); };
  });
}

export function renderToday(root) {
  const today = todayKey();
  if (!selected || selectedOn !== today) {
    selected = today;
    selectedOn = today;
  }

  const habits = activeHabits();
  const habitsDone = habits.filter((h) => habitDoneOn(h, selected)).length;
  const { open, done } = todosFor(selected);
  const total = habits.length + open.length + done.length;
  const pct = total ? Math.round(((habitsDone + done.length) / total) * 100) : 0;
  const openHabits = habits.length - habitsDone;

  root.innerHTML = `
    <header class="page-header"><h1 class="page-title">Hoy</h1></header>
    ${gameEnabled() ? xpBar() : ''}
    <div class="card week-card">
      ${weekStrip(today)}
      ${ring(pct)}
    </div>

    ${selected !== today ? `<button class="back-today" data-select="${today}">${icons.chevronLeft} Volver a hoy</button>` : ''}

    ${moodCard(today)}

    ${sectionHead('Hábitos', openHabits ? `${openHabits} pendiente${openHabits === 1 ? '' : 's'}` : '', '#/habits', 'Ver todos')}
    ${habits.length
      ? `<div class="stack">${habits.map((h) => habitRow(h, selected)).join('')}</div>`
      : '<div class="card empty small">Aún no tienes hábitos.</div>'}

    ${state.settings.showTodos ? `
      ${sectionHead('Tareas', open.length ? `${open.length} abierta${open.length === 1 ? '' : 's'}` : '', '#/todos', 'Ver todas')}
      ${open.length || done.length
        ? `<div class="stack">${[...open, ...done].map(todoRow).join('')}</div>`
        : `<div class="card empty small">No hay tareas para ${selected === today ? 'hoy' : 'este día'}.</div>`}
    ` : ''}

    <button class="fab" data-fab aria-label="Añadir">${icons.plus}</button>`;

  root.querySelectorAll('[data-select]').forEach((b) => {
    b.onclick = () => { selected = b.dataset.select; renderToday(root); };
  });

  // Deslizar la semana con el dedo
  const strip = root.querySelector('[data-swipe]');
  let startX = null;
  strip.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  strip.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) < 50) return;
    selected = addDays(selected, dx < 0 ? 7 : -7);
    renderToday(root);
  });

  root.querySelectorAll('[data-mood]').forEach((b) => {
    b.onclick = () => {
      const value = Number(b.dataset.mood);
      setMood(selected, state.moods[selected] === value ? null : value);
    };
  });
  root.querySelector('[data-mood-hide]')?.addEventListener('click', () => {
    state.settings.moodHiddenOn = selected;
    save();
  });

  root.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => navigate(b.dataset.go); });
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = () => navigate(`#/habits/${el.dataset.open}`);
  });
  root.querySelector('[data-fab]').onclick = state.settings.showTodos
    ? openAddSheet
    : () => navigate('#/habits/new');
  bindCheckButtons(root, selected);
  bindTodoRows(root);
}
