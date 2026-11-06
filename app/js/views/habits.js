// Pantalla de hábitos: vista lista, vista cuadrícula y lista de archivados.
import { activeHabits, archivedHabits, getCount, save, setCount, state } from '../store.js';
import {
  currentStreak, dayTarget, habitStartKey, isDayDone, lifetimeTotal, nextCount, periodProgress, streakUnit,
} from '../habit-logic.js';
import { monthGrid, monthLabel, todayKey } from '../dates.js';
import { icons } from '../icons.js';
import { esc, navigate } from '../ui.js';

const now = new Date();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();

const PERIOD_CAPTION = { day: 'Objetivo de hoy', week: 'Esta semana', month: 'Este mes' };

// Botón de check del día de hoy. Lo comparten otras pantallas (Hoy).
export function checkButton(habit, key = todayKey()) {
  const count = getCount(habit.id, key);
  const done = isDayDone(habit, key);
  const partial = !done && count > 0 && dayTarget(habit) > 1;
  return `<button class="check ${done ? 'done' : ''} ${partial ? 'partial' : ''}"
    data-check="${habit.id}" ${partial ? `data-count="${count}"` : ''} ${key > todayKey() ? 'disabled' : ''}
    aria-label="Marcar ${esc(habit.name)}">${done ? icons.check : ''}</button>`;
}

export function bindCheckButtons(root, key = todayKey()) {
  root.querySelectorAll('[data-check]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const habit = state.habits.find((h) => h.id === btn.dataset.check);
      setCount(habit.id, key, nextCount(habit, key));
    });
  });
}

function listCard(habit) {
  const { done, target } = periodProgress(habit);
  const pct = Math.min(100, (done / target) * 100);
  const streak = currentStreak(habit);
  const total = lifetimeTotal(habit);
  return `
    <div class="card habit-card" data-open="${habit.id}" role="button">
      <div class="top">
        <span class="emoji">${esc(habit.emoji)}</span>
        <span class="name">${esc(habit.name)}</span>
        ${checkButton(habit)}
      </div>
      <div class="meta">
        <div>
          <div class="count">${done} / ${target}</div>
          <div class="small muted">${PERIOD_CAPTION[habit.period]}</div>
        </div>
        <div class="streak" title="Racha: ${streak} ${streakUnit(habit, streak)}">🔥 ${streak}</div>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="habit-total">Total: <b>${total.done}</b> de ${total.days} día${total.days === 1 ? '' : 's'}</div>
    </div>`;
}

function gridTile(habit) {
  const today = todayKey();
  const start = habitStartKey(habit);
  const dots = monthGrid(viewYear, viewMonth).map((key) => {
    if (!key) return '<span class="dot blank"></span>';
    // Días futuros o anteriores al hábito: neutros, para no confundirlos con fallos.
    if (key > today || key < start) return '<span class="dot future"></span>';
    return `<span class="dot ${isDayDone(habit, key) ? 'done' : ''}"></span>`;
  }).join('');
  return `
    <div class="card habit-tile" data-open="${habit.id}" role="button">
      <div class="top"><span>${esc(habit.emoji)}</span><span class="name">${esc(habit.name)}</span></div>
      <div class="dots">${dots}</div>
    </div>`;
}

function emptyState() {
  return `
    <div class="card empty">
      <div class="big">🌱</div>
      Todavía no tienes hábitos.<br>
      <button class="primary-btn" data-new>${icons.plus} Crear hábito</button>
    </div>`;
}

function renderArchived(root) {
  const habits = archivedHabits();
  root.innerHTML = `
    <header class="nav-header">
      <button class="icon-btn" data-back aria-label="Volver">${icons.back}</button>
      <h1>Archivados</h1><span></span>
    </header>
    ${habits.length ? `<div class="option-list">${habits.map((h) => `
      <button data-open="${h.id}">
        <span style="font-size:22px">${esc(h.emoji)}</span>
        <span class="grow">${esc(h.name)}</span>${icons.chevronRight}
      </button>`).join('')}</div>`
      : '<div class="card empty"><div class="big">🗄️</div>No hay hábitos archivados.</div>'}`;
  root.querySelector('[data-back]').onclick = () => navigate('#/habits');
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = () => navigate(`#/habits/${el.dataset.open}`);
  });
}

export function renderHabits(root, params) {
  if (params.archived) return renderArchived(root);

  const habits = activeHabits();
  const isGrid = state.settings.habitsView === 'grid';
  const atCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  let body;
  if (!habits.length) body = emptyState();
  else if (isGrid) {
    body = `
      <div class="month-nav">
        <button data-month="-1" aria-label="Mes anterior">${icons.chevronLeft}</button>
        <span>${monthLabel(viewYear, viewMonth)}</span>
        <button data-month="1" aria-label="Mes siguiente" ${atCurrentMonth ? 'disabled' : ''}>${icons.chevronRight}</button>
      </div>
      <div class="habit-grid">${habits.map(gridTile).join('')}</div>`;
  } else {
    body = `<div class="stack">${habits.map(listCard).join('')}</div>`;
  }

  root.innerHTML = `
    <header class="page-header">
      <h1 class="page-title">Hábitos</h1>
      <div class="btn-group">
        <button data-toggle-view aria-label="${isGrid ? 'Ver como lista' : 'Ver como cuadrícula'}">${isGrid ? icons.list : icons.grid}</button>
        <button data-archived aria-label="Archivados">${icons.archive}</button>
        <button data-new aria-label="Nuevo hábito">${icons.plus}</button>
      </div>
    </header>
    ${body}`;

  root.querySelector('[data-toggle-view]').onclick = () => {
    state.settings.habitsView = isGrid ? 'list' : 'grid';
    save();
  };
  root.querySelector('[data-archived]').onclick = () => navigate('#/habits/archived');
  root.querySelectorAll('[data-new]').forEach((el) => { el.onclick = () => navigate('#/habits/new'); });
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = () => navigate(`#/habits/${el.dataset.open}`);
  });
  root.querySelectorAll('[data-month]').forEach((el) => {
    el.onclick = () => {
      const d = new Date(viewYear, viewMonth + Number(el.dataset.month), 1);
      viewYear = d.getFullYear();
      viewMonth = d.getMonth();
      renderHabits(root, params);
    };
  });
  bindCheckButtons(root);
}
