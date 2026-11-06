// Inicio: resumen de tu día con hábitos, ánimo, tareas y metas.
import {
  activeHabits, latestWeight, save, setMood, state,
} from '../store.js';
import { addMovementFromHome, pastePaymentFromClipboard, readSummary } from '../balance-bridge.js';
import { currentStreak, isDayDone } from '../habit-logic.js';
import {
  addDays, fmtDuration, startOfWeek, todayKey,
} from '../dates.js';
import { gameEnabled } from '../game.js';
import {
  activeGoals, currentValue, daysBetween, fmtNumber, fmtValue, forecast, progress,
} from '../goals.js';
import { homeSpending, lastWeekStart, weekSummary } from '../week-summary.js';
import { nextRoutine, sessionsThisWeek } from '../gym.js';
import { booksReading } from '../library.js';
import { travelSummary } from '../travel-bridge.js';
import { icons } from '../icons.js';
import { esc, navigate } from '../ui.js';
import { coverHtml, readingSheet } from './book-parts.js';
import { progressBar, progressText } from './library.js';
import { bindCheckButtons } from './habits.js';
import { statusPill } from './goals.js';
import { moneyText } from './week.js';
import { bindTodoRows, todoRow } from './todos.js';
import {
  MOODS, habitDoneOn, habitRow, ring, todosFor, xpBar,
} from './today.js';

const MAX_TODOS = 3;
const MAX_GOALS = 3;
const BACKUP_REMINDER_DAYS = 14;

function greeting() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 13) return 'Buenos días';
  if (hour >= 13 && hour < 21) return 'Buenas tardes';
  return 'Buenas noches';
}

function sectionHead(title, href, linkLabel) {
  return `
    <div class="section-head">
      <div class="section-title">${title}</div>
      <button class="link-btn" data-go="${href}">${linkLabel} ${icons.chevronRight}</button>
    </div>`;
}

function dayCard(today) {
  const habits = activeHabits();
  const { open, done } = todosFor(today);
  const habitsDone = habits.filter((h) => habitDoneOn(h, today)).length;
  const total = habits.length + open.length + done.length;
  const finished = habitsDone + done.length;
  const pct = total ? Math.round((finished / total) * 100) : 0;
  let message = 'Crea tu primer hábito para empezar.';
  if (total && finished === total) message = '¡Día completado!';
  else if (total) {
    const left = total - finished;
    message = `Te ${left === 1 ? 'queda' : 'quedan'} ${left} por hacer`;
  }
  return `
    <button class="card day-card" data-go="#/today">
      ${ring(pct)}
      <span class="grow">
        <span class="day-count">${finished} de ${total} hechos</span>
        <span class="small muted">${message}</span>
      </span>
      ${icons.chevronRight}
    </button>`;
}

function statsRow(today) {
  const habits = activeHabits();
  const best = habits
    .map((h) => ({ h, streak: currentStreak(h) }))
    .sort((a, b) => b.streak - a.streak)[0];
  let week = 0;
  for (let k = startOfWeek(today); k <= today; k = addDays(k, 1)) {
    week += habits.filter((h) => isDayDone(h, k)).length;
  }
  return `
    <div class="stat-row">
      <div class="stat"><div class="ico">🔥</div><div class="val">${best ? best.streak : 0}</div><div class="lbl">Mejor racha</div></div>
      <div class="stat"><div class="ico">✅</div><div class="val">${week}</div><div class="lbl">Esta semana</div></div>
      <div class="stat"><div class="ico">🎯</div><div class="val">${activeGoals().length}</div><div class="lbl">Metas en curso</div></div>
    </div>`;
}

// Los datos solo están en el móvil: si pasa mucho tiempo sin copia, se avisa.
function backupReminder(today) {
  const last = state.settings.lastBackupOn;
  const hasData = activeHabits().length > 0 || activeGoals().length > 0 || readSummary();
  if (!hasData || (last && daysBetween(last, today) < BACKUP_REMINDER_DAYS)) return '';
  return `
    <button class="card backup-reminder" data-go="#/settings/data">
      <span class="goal-emoji">💾</span>
      <span class="grow">
        <b>${last ? `Hace ${daysBetween(last, today)} días de tu última copia` : 'Aún no tienes copia de seguridad'}</b>
        <span class="small muted">Tus datos solo están en este móvil.</span>
      </span>
      ${icons.chevronRight}
    </button>`;
}

function moneyBlock() {
  const summary = readSummary();
  if (!summary) {
    return `
      <button class="card money-empty" data-go="#/balance">
        <span class="goal-emoji">💰</span>
        <span class="grow">
          <span class="day-count">Balance</span>
          <span class="small muted">Tus cuentas y gastos aparecerán aquí.</span>
        </span>
        ${icons.chevronRight}
      </button>`;
  }
  const hidden = state.settings.hideMoney;
  const currency = summary.currency || 'EUR';
  const money = (n, digits = 2) => (hidden ? '••••' : new Intl.NumberFormat('es-ES', {
    style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: digits,
  }).format(n));
  const spending = homeSpending();
  let changeText = '<b>–</b>';
  if (hidden) changeText = '<b>••••</b>';
  else if (spending.change === 0) changeText = '<b>=</b>';
  else if (spending.change !== null) {
    // Gastar menos que la semana pasada es lo bueno.
    changeText = `<b class="${spending.change < 0 ? 'less' : 'more'}">${spending.change > 0 ? '+' : '−'}${Math.abs(spending.change)}%</b>`;
  }
  return `
    <div class="card money-card" data-go="#/balance" role="button">
      <div class="money-top">
        <div>
          <div class="small muted">Patrimonio</div>
          <div class="money-total">${money(summary.netWorth, 0)}</div>
        </div>
        <button class="eye-btn" data-money-eye aria-label="${hidden ? 'Mostrar importes' : 'Ocultar importes'}">${hidden ? icons.eyeOff : icons.eye}</button>
      </div>
      <div class="money-row">
        <div><span class="small muted">Gastado hoy</span><b>${money(spending.today)}</b></div>
        <div><span class="small muted">Esta semana</span><b>${money(spending.week)}</b></div>
        <div><span class="small muted">Vs. anterior</span>${changeText}</div>
      </div>
      <div class="money-actions">
        <button class="pay-btn" data-paste-pay>${icons.wallet} Pegar pago</button>
        <button class="pay-add" data-add-movement aria-label="Añadir movimiento">${icons.plus}</button>
      </div>
    </div>`;
}

function weekBlock(today) {
  const week = weekSummary(lastWeekStart(today), today);
  const parts = [];
  if (week.habits.pct !== null) parts.push(`✅ ${week.habits.pct}%`);
  if (week.mood !== null) parts.push(`😊 ${fmtNumber(Math.round(week.mood * 10) / 10)}`);
  if (week.money) parts.push(`💸 ${moneyText(week.money.spent)}`);
  if (week.sleep !== null) parts.push(`😴 ${fmtDuration(week.sleep)}`);
  if (week.gym) parts.push(`🏋️ ${week.gym.count}`);
  if (week.pages !== null) parts.push(`📖 ${fmtNumber(week.pages)}`);
  if (!parts.length) return '';
  return `
    <button class="card week-link" data-go="#/week">
      <span class="grow">
        <span class="small muted">La semana pasada</span>
        <span class="week-link-values">${parts.map((p) => `<span>${p}</span>`).join('')}</span>
      </span>
      ${icons.chevronRight}
    </button>`;
}

function bodyBlock(today) {
  const weight = latestWeight();
  const sleep = state.body.sleep[today];
  return `
    <button class="card body-link" data-go="#/body">
      <span><span class="small muted">Peso</span><b>${weight === null ? '–' : `${fmtNumber(weight)} kg`}</b></span>
      <span><span class="small muted">Sueño de hoy</span><b>${sleep === undefined ? '–' : fmtDuration(sleep)}</b></span>
      <span class="grow"></span>
      ${sleep === undefined ? '<span class="pill">Apuntar</span>' : icons.chevronRight}
    </button>`;
}

function gymBlock() {
  const { draft, weeklyGoal } = state.gym;
  const routine = nextRoutine();
  if (!draft && !routine) return '';
  return `
    <button class="card week-link" data-go="${draft ? '#/body/gym/train' : '#/body/gym'}">
      <span class="goal-emoji">🏋️</span>
      <span class="grow">
        <span class="small muted">${draft ? 'Entrenamiento en curso' : 'Próximo entreno'}</span>
        <b>${esc(draft ? draft.name : routine.name)}</b>
        <span class="small muted">Esta semana: ${sessionsThisWeek()} de ${weeklyGoal}</span>
      </span>
      ${draft ? '<span class="pill">Seguir</span>' : icons.chevronRight}
    </button>`;
}

function bookBlock() {
  const [book] = booksReading();
  if (!book) return '';
  return `
    <div class="card home-book" data-go="#/library/${book.id}" role="button">
      <span class="home-book-cover">${coverHtml(book)}</span>
      <span class="grow">
        <span class="small muted">Leyendo</span>
        <b>${esc(book.title)}</b>
        ${progressBar(book)}
        <span class="small muted">${progressText(book)}</span>
      </span>
      <button class="pill" data-book-log="${book.id}">Apuntar</button>
    </div>`;
}

function travelBlock(today) {
  const travel = travelSummary(today);
  if (!travel) return '';
  let detail = 'Sin viajes a la vista';
  if (travel.current) detail = `De viaje: ${esc(travel.current.title)}`;
  else if (travel.next) {
    const days = daysBetween(today, travel.next.start);
    detail = `${esc(travel.next.title)}, ${days === 1 ? 'mañana' : `en ${days} días`}`;
  }
  return `
    <button class="card week-link" data-go="#/travel">
      <span class="goal-emoji">🌍</span>
      <span class="grow">
        <b>${travel.countries} ${travel.countries === 1 ? 'país visitado' : 'países visitados'}</b>
        <span class="small muted">${detail}</span>
      </span>
      ${icons.chevronRight}
    </button>`;
}

function pendingHabits(today) {
  const habits = activeHabits();
  if (!habits.length) return '';
  const pending = habits.filter((h) => !habitDoneOn(h, today));
  return `
    ${sectionHead('Pendientes de hoy', '#/today', 'Ver día')}
    ${pending.length
      ? `<div class="stack">${pending.map((h) => habitRow(h, today)).join('')}</div>`
      : '<div class="card empty small">Has hecho todos tus hábitos de hoy 🎉</div>'}`;
}

function moodBlock(today) {
  const mood = state.moods[today];
  return `
    <div class="card home-mood">
      <div class="small muted">${mood ? 'Hoy te sientes' : '¿Cómo te sientes hoy?'}</div>
      <div class="mood-faces">
        ${MOODS.map((m) => `
          <button class="mood-face ${m.value === mood ? 'on' : ''} ${mood && m.value !== mood ? 'dim' : ''}"
            data-mood="${m.value}" aria-label="${m.label}">${m.emoji}</button>`).join('')}
      </div>
    </div>`;
}

function todayTodos(today) {
  const { open } = todosFor(today);
  if (!open.length) return '';
  return `
    ${sectionHead('Tareas de hoy', '#/todos', 'Ver todas')}
    <div class="stack">${open.slice(0, MAX_TODOS).map(todoRow).join('')}</div>`;
}

// Primero las que tienen fecha límite más cercana; después, las más avanzadas.
function goalsBlock(today) {
  const goals = activeGoals().sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline || b.deadline) return a.deadline ? -1 : 1;
    return progress(b, today) - progress(a, today);
  }).slice(0, MAX_GOALS);
  if (!goals.length) return '';
  return `
    ${sectionHead('Metas', '#/goals', 'Ver todas')}
    <div class="stack">
      ${goals.map((g) => {
        const p = progress(g, today);
        const left = g.deadline ? daysBetween(today, g.deadline) : null;
        return `
        <button class="card home-goal" data-goal="${g.id}">
          <span class="goal-top">
            <span class="goal-emoji">${esc(g.emoji)}</span>
            <span class="grow goal-name">${esc(g.name)}</span>
            ${statusPill(forecast(g, today).status)}
          </span>
          <span class="progress goal-progress"><span style="width:${p * 100}%"></span></span>
          <span class="goal-foot small muted">
            <span>${fmtValue(g, currentValue(g, today))} de ${fmtValue(g, g.target)}</span>
            <span>${left === null ? `${Math.round(p * 100)}%` : `${left >= 0 ? `${left} días` : 'Vencida'}`}</span>
          </span>
        </button>`;
      }).join('')}
    </div>`;
}

// Bloques de Inicio, en el orden por defecto. Todos se pueden ocultar y reordenar.
const BLOCKS = [
  { id: 'level', label: 'Nivel', emoji: '⭐', render: () => (gameEnabled() ? xpBar() : ''), onlyIf: gameEnabled },
  { id: 'day', label: 'Resumen del día', emoji: '☀️', render: dayCard },
  { id: 'money', label: 'Dinero', emoji: '💰', render: moneyBlock },
  { id: 'stats', label: 'Datos rápidos', emoji: '🔥', render: statsRow },
  { id: 'week', label: 'Semana pasada', emoji: '📅', render: weekBlock },
  { id: 'body', label: 'Peso y sueño', emoji: '⚖️', render: bodyBlock },
  { id: 'mood', label: 'Estado de ánimo', emoji: '😊', render: moodBlock },
  { id: 'habits', label: 'Hábitos pendientes', emoji: '✅', render: pendingHabits },
  { id: 'todos', label: 'Tareas de hoy', emoji: '📝', render: todayTodos, onlyIf: () => state.settings.showTodos },
  { id: 'goals', label: 'Metas', emoji: '🎯', render: goalsBlock },
  { id: 'gym', label: 'Gimnasio', emoji: '🏋️', render: gymBlock },
  { id: 'book', label: 'Libro actual', emoji: '📖', render: bookBlock },
  { id: 'travel', label: 'Viajes', emoji: '🌍', render: travelBlock },
];

// Bloques en el orden elegido; los que no estén guardados (nuevos) van al final, visibles.
export function homeBlocks() {
  const saved = state.settings.homeBlocks || [];
  const known = saved.filter((b) => BLOCKS.some((x) => x.id === b.id));
  const missing = BLOCKS.filter((b) => !known.some((x) => x.id === b.id)).map(({ id }) => ({ id, on: true }));
  return [...known, ...missing]
    .map((b) => ({ ...BLOCKS.find((x) => x.id === b.id), on: b.on }))
    .filter((b) => !b.onlyIf || b.onlyIf());
}

export function renderHome(root) {
  const today = todayKey();
  const name = (state.settings.name || '').trim();
  const longDate = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const date = longDate[0].toUpperCase() + longDate.slice(1);

  root.innerHTML = `
    <header class="page-header home-header">
      <div>
        <h1 class="page-title">${greeting()}${name ? `, ${esc(name)}` : ''}</h1>
        <div class="small muted">${date}</div>
      </div>
    </header>

    <div class="stack home-blocks">
      ${backupReminder(today)}
      ${homeBlocks().filter((b) => b.on).map((b) => b.render(today)).filter(Boolean)
    .map((html) => `<div>${html}</div>`).join('')}
    </div>
    <button class="link-btn home-customize" data-go="#/settings/home">Personalizar Inicio ${icons.chevronRight}</button>`;

  root.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => navigate(b.dataset.go); });
  root.querySelector('[data-money-eye]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.settings.hideMoney = !state.settings.hideMoney;
    save();
  });
  root.querySelector('[data-book-log]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    readingSheet(e.currentTarget.dataset.bookLog);
  });
  root.querySelector('[data-paste-pay]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    pastePaymentFromClipboard();
  });
  root.querySelector('[data-add-movement]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    addMovementFromHome();
  });
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = () => navigate(`#/habits/${el.dataset.open}`);
  });
  root.querySelectorAll('[data-goal]').forEach((el) => {
    el.onclick = () => navigate(`#/goals/${el.dataset.goal}`);
  });
  root.querySelectorAll('[data-mood]').forEach((b) => {
    b.onclick = () => {
      const value = Number(b.dataset.mood);
      setMood(today, state.moods[today] === value ? null : value);
    };
  });
  bindCheckButtons(root, today);
  bindTodoRows(root);
}
