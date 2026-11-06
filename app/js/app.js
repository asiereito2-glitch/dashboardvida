// Punto de entrada: enrutado por hash, barra de pestañas y repintado.
import { save, state, subscribe } from './store.js';
import { icons } from './icons.js';
import { closeSheet, esc, showToast } from './ui.js';
import { applyAppearance } from './appearance.js';
import {
  hideBalance, refreshBalanceTheme, refreshSummaryIfStale, showBalance,
} from './balance-bridge.js';
import { hideTravel, refreshTravelTheme, showTravel } from './travel-bridge.js';
import { todayKey } from './dates.js';
import { computeXp, gameEnabled, levelInfo } from './game.js';
import { renderProfile } from './views/profile.js';
import { syncGoalCompletion, syncGoalSources } from './goals.js';
import { renderGoals } from './views/goals.js';
import { renderGoalForm } from './views/goal-form.js';
import { renderGoalDetail } from './views/goal-detail.js';
import { renderHabits } from './views/habits.js';
import { renderHabitDetail } from './views/habit-detail.js';
import { renderHabitForm } from './views/habit-form.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';
import { renderTodos } from './views/todos.js';
import { renderTodoForm } from './views/todo-form.js';
import { renderToday } from './views/today.js';
import { renderHome } from './views/home.js';
import { renderWeek } from './views/week.js';
import { renderHomeSettings } from './views/home-settings.js';
import { renderBody } from './views/body.js';
import { renderGym, renderGymSession } from './views/gym.js';
import { renderGymExercise, renderGymProgress } from './views/gym-progress.js';
import { renderGymRoutine } from './views/gym-routine.js';
import { renderGymSessionEdit } from './views/gym-session-edit.js';
import { renderGymTrain } from './views/gym-train.js';
import { renderBalance } from './views/balance.js';
import { renderBookDetail, renderLibrary, renderLibraryReading } from './views/library.js';
import { renderBookForm } from './views/book-form.js';
import { renderWork, renderWorkShifts } from './views/work.js';
import { renderTravel } from './views/travel.js';
import { renderLibraryStats } from './views/library-stats.js';
import { loadCovers } from './covers.js';

// Secciones del menú lateral. Cada una tiene su propia barra inferior (`tabs`).
const SECTIONS = [
  { id: 'home', label: 'Inicio', icon: icons.home, href: '#/home', tabs: [] },
  { id: 'week', label: 'Resumen', icon: icons.sparkle, href: '#/week', tabs: [] },
  {
    id: 'habits',
    label: 'Hábitos',
    icon: icons.habits,
    href: '#/today',
    tabs: [
      { id: 'today', label: 'Hoy', icon: icons.sun, href: '#/today' },
      { id: 'habits', label: 'Hábitos', icon: icons.habits, href: '#/habits' },
      { id: 'todos', label: 'Tareas', icon: icons.todos, href: '#/todos', onlyIf: () => state.settings.showTodos },
      { id: 'stats', label: 'Estadísticas', icon: icons.stats, href: '#/stats' },
    ],
  },
  {
    id: 'goals',
    label: 'Metas',
    icon: icons.goal,
    href: '#/goals',
    tabs: [
      { id: 'active', label: 'En curso', icon: icons.goal, href: '#/goals' },
      { id: 'done', label: 'Cumplidas', icon: icons.trophy, href: '#/goals/done' },
      { id: 'evolution', label: 'Evolución', icon: icons.stats, href: '#/goals/evolution' },
    ],
  },
  {
    id: 'body',
    label: 'Cuerpo',
    icon: icons.body,
    href: '#/body',
    tabs: [
      { id: 'log', label: 'Registro', icon: icons.note, href: '#/body' },
      { id: 'weight', label: 'Peso', icon: icons.scale, href: '#/body/weight' },
      { id: 'sleep', label: 'Sueño', icon: icons.moon, href: '#/body/sleep' },
      { id: 'gym', label: 'Gimnasio', icon: icons.dumbbell, href: '#/body/gym' },
    ],
  },
  {
    id: 'work',
    label: 'Trabajo',
    icon: icons.briefcase,
    href: '#/work',
    tabs: [
      { id: 'log', label: 'Registro', icon: icons.note, href: '#/work' },
      { id: 'shifts', label: 'Turnos', icon: icons.briefcase, href: '#/work/shifts' },
    ],
  },
  {
    id: 'library',
    label: 'Biblioteca',
    icon: icons.book,
    href: '#/library',
    tabs: [
      { id: 'reading', label: 'Leyendo', icon: icons.book, href: '#/library' },
      { id: 'all', label: 'Mi biblioteca', icon: icons.grid, href: '#/library/all' },
      { id: 'stats', label: 'Estadísticas', icon: icons.stats, href: '#/library/stats' },
    ],
  },
  {
    id: 'travel',
    label: 'Viajes',
    icon: icons.globe,
    href: '#/travel',
    tabs: [
      { id: 'mapa', label: 'Mapa', icon: icons.map, href: '#/travel' },
      { id: 'viajes', label: 'Viajes', icon: icons.luggage, href: '#/travel/viajes' },
      { id: 'paises', label: 'Países', icon: icons.flag, href: '#/travel/paises' },
      { id: 'resumen', label: 'Resumen', icon: icons.stats, href: '#/travel/resumen' },
    ],
  },
  {
    id: 'balance',
    label: 'Balance',
    icon: icons.wallet,
    href: '#/balance',
    tabs: [
      { id: 'home', label: 'Inicio', icon: icons.home, href: '#/balance' },
      { id: 'patrimonio', label: 'Patrimonio', icon: icons.wallet, href: '#/balance/patrimonio' },
      { id: 'analysis', label: 'Análisis', icon: icons.stats, href: '#/balance/analysis' },
      { id: 'settings', label: 'Ajustes', icon: icons.gear, href: '#/balance/settings' },
    ],
  },
  {
    id: 'settings',
    label: 'Ajustes',
    icon: icons.gear,
    href: '#/settings',
    tabs: [
      { id: 'general', label: 'General', icon: icons.gear, href: '#/settings' },
      { id: 'categories', label: 'Categorías', icon: icons.tag, href: '#/settings/categories' },
      { id: 'look', label: 'Apariencia', icon: icons.palette, href: '#/settings/look' },
      { id: 'data', label: 'Datos', icon: icons.archive, href: '#/settings/data' },
    ],
  },
];

const DEFAULT_ROUTE = '#/home';

// Pantalla principal de una sección (con menú y barra inferior).
const page = (section, tab, view, params = {}) => ({ section, tab, view, params, top: true });
// Pantalla interior (formularios, detalles): se sale con su botón de volver.
const inner = (section, view, params = {}) => ({ section, view, params, top: false });

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [section, id, action, extra, mode] = parts;
  if (section === 'home') return page('home', null, renderHome);
  if (section === 'week') return page('week', null, renderWeek);
  if (section === 'body' && id === 'gym') {
    if (action === 'train') return inner('body', renderGymTrain);
    if (action === 'progress') {
      return inner('body', renderGymProgress, { tab: ['exercises', 'muscles', 'calendar'].includes(extra) ? extra : 'routines' });
    }
    if (action === 'exercise') return inner('body', renderGymExercise, { name: decodeURIComponent(extra) });
    if (action === 'routine') return inner('body', renderGymRoutine, { id: extra === 'new' ? null : extra });
    if (action === 'session' && mode === 'edit') return inner('body', renderGymSessionEdit, { id: extra });
    if (action === 'session') return inner('body', renderGymSession, { id: extra });
    return page('body', 'gym', renderGym);
  }
  if (section === 'body') {
    const tab = ['weight', 'sleep'].includes(id) ? id : 'log';
    return page('body', tab, renderBody, { tab });
  }
  if (section === 'work') {
    return id === 'shifts' ? page('work', 'shifts', renderWorkShifts) : page('work', 'log', renderWork);
  }
  if (section === 'library') {
    if (!id) return page('library', 'reading', renderLibraryReading);
    if (id === 'all') return page('library', 'all', renderLibrary);
    if (id === 'stats') return page('library', 'stats', renderLibraryStats);
    if (id === 'new') return inner('library', renderBookForm, { id: null });
    if (action === 'edit') return inner('library', renderBookForm, { id });
    return inner('library', renderBookDetail, { id });
  }
  if (section === 'travel') {
    const view = ['viajes', 'paises', 'resumen'].includes(id) ? id : 'mapa';
    return page('travel', view, renderTravel, { view });
  }
  if (section === 'balance') {
    const view = ['patrimonio', 'analysis', 'settings'].includes(id) ? id : 'home';
    return page('balance', view, renderBalance, { view });
  }
  if (section === 'habits' && id === 'new') return inner('habits', renderHabitForm);
  if (section === 'habits' && id === 'archived') return inner('habits', renderHabits, { archived: true });
  if (section === 'habits' && id && action === 'edit') return inner('habits', renderHabitForm, { id });
  if (section === 'habits' && id) return inner('habits', renderHabitDetail, { id });
  if (section === 'habits') return page('habits', 'habits', renderHabits);
  if (section === 'today') return page('habits', 'today', renderToday);
  if (section === 'goals' && id === 'new') return inner('goals', renderGoalForm);
  if (section === 'goals' && id === 'done') return page('goals', 'done', renderGoals, { tab: 'done' });
  if (section === 'goals' && id === 'evolution') return page('goals', 'evolution', renderGoals, { tab: 'evolution' });
  if (section === 'goals' && id && action === 'edit') return inner('goals', renderGoalForm, { id });
  if (section === 'goals' && id) return inner('goals', renderGoalDetail, { id });
  if (section === 'goals') return page('goals', 'active', renderGoals, { tab: 'active' });
  if (section === 'todos' && !state.settings.showTodos) return null;
  // #/todos/new/2026-10-27 crea la tarea con esa fecha por defecto
  if (section === 'todos' && id === 'new') return inner('habits', renderTodoForm, { due: action });
  if (section === 'todos' && id === 'list') return inner('habits', renderTodos, { filter: action });
  if (section === 'todos' && id) return inner('habits', renderTodoForm, { id });
  if (section === 'todos') return page('habits', 'todos', renderTodos);
  if (section === 'stats') return page('habits', 'stats', renderStats);
  if (section === 'settings' && id === 'home') return inner('settings', renderHomeSettings);
  if (section === 'settings') {
    const tab = ['categories', 'look', 'data'].includes(id) ? id : 'general';
    return page('settings', tab, renderSettings, { tab });
  }
  if (section === 'profile' && state.settings.gameMode) return inner('habits', renderProfile);
  return null;
}

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');
const menuBtn = document.getElementById('menu-btn');
const drawer = document.getElementById('drawer');
const drawerBackdrop = document.getElementById('drawer-backdrop');
let current = null;

function setDrawer(open) {
  drawer.classList.toggle('open', open);
  drawerBackdrop.classList.toggle('open', open);
  drawer.inert = !open;
}

function renderDrawer() {
  drawer.innerHTML = `
    <div class="drawer-title">Mi vida</div>
    <nav>
      ${SECTIONS.map((s) => `
        <a class="drawer-item ${s.id === current?.section ? 'active' : ''}" href="${s.href}">
          ${s.icon}<span>${s.label}</span>
        </a>`).join('')}
    </nav>`;
  drawer.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => setDrawer(false));
  });
}

// `entering` es true cuando se acaba de llegar a la ruta (las vistas con
// formulario reinician su estado local solo en ese caso).
function render(entering = false) {
  if (!current) return;
  const section = SECTIONS.find((s) => s.id === current.section);
  const tabs = section.tabs.filter((t) => !t.onlyIf || t.onlyIf());
  const showTabs = current.top && tabs.length > 0;
  tabbar.classList.toggle('hidden', !showTabs);
  app.classList.toggle('no-tabbar', !showTabs);
  app.classList.toggle('top-page', current.top);
  menuBtn.classList.toggle('hidden', !current.top);
  tabbar.style.gridTemplateColumns = `repeat(${tabs.length}, 1fr)`;
  tabbar.innerHTML = tabs.map((t) => `
    <a class="tab ${t.id === current.tab ? 'active' : ''}" href="${t.href}">
      ${t.icon}<span>${t.label}</span>
    </a>`).join('');
  renderDrawer();
  current.view(app, current.params, entering);
  if (current.section !== 'balance') hideBalance();
  if (current.section !== 'travel') hideTravel();
  if (current.section === 'balance') showBalance(current.params.view, entering);
  if (current.section === 'travel') showTravel(current.params.view, entering);
  if (entering) playEnter();
}

// Animación de entrada solo al cambiar de pantalla, no al marcar un hábito.
let enterTimer = null;
function playEnter() {
  clearTimeout(enterTimer);
  app.classList.remove('enter');
  void app.offsetWidth;
  app.classList.add('enter');
  enterTimer = setTimeout(() => app.classList.remove('enter'), ENTER_MS);
}
const ENTER_MS = 750;

function onRouteChange() {
  const route = parseRoute();
  if (!route) {
    location.replace(DEFAULT_ROUTE);
    return;
  }
  closeSheet();
  setDrawer(false);
  current = route;
  render(true);
  window.scrollTo(0, 0);
}

menuBtn.innerHTML = icons.menu;
menuBtn.onclick = () => setDrawer(true);
drawerBackdrop.onclick = () => setDrawer(false);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });
setDrawer(false);

// La app instalada antes de esta versión arranca en #/today: al abrirla se va a Inicio.
if (!sessionStorage.getItem('started')) {
  sessionStorage.setItem('started', '1');
  if (['', '#/today'].includes(location.hash)) history.replaceState(null, '', DEFAULT_ROUTE);
}

// Modo juego: avisa de la XP ganada y celebra al subir de nivel.
let lastXp = null;
function gameFeedback() {
  if (!gameEnabled()) {
    lastXp = null;
    return;
  }
  const xp = computeXp().total;
  const { level } = levelInfo(xp);
  const delta = lastXp === null ? 0 : xp - lastXp;
  lastXp = xp;
  if (delta > 0 && delta <= MAX_TOAST_XP) showToast(`+${delta} XP`);
  if (level > state.settings.lastLevelSeen) {
    state.settings.lastLevelSeen = level;
    showToast(`<span class="toast-emoji">🎉</span>¡Subes a nivel ${level}!`, { big: true, duration: 2600 });
    save();
  } else if (level < state.settings.lastLevelSeen) {
    state.settings.lastLevelSeen = level;
  }
}
const MAX_TOAST_XP = 200; // cambios mayores (importar una copia, etc.) no se anuncian

// Marca las metas que llegan al 100% (por un registro o al cumplir su hábito) y lo celebra.
function goalFeedback() {
  const synced = syncGoalSources();
  const { newlyDone, changed: completionChanged } = syncGoalCompletion();
  const changed = synced || completionChanged;
  newlyDone.forEach((g) => showToast(`<span class="toast-emoji">🏆</span>¡Meta cumplida!<br>${esc(g.name)}`, { big: true, duration: 3000 }));
  if (changed) save();
}

window.addEventListener('hashchange', onRouteChange);
// Viajes guarda desde su marco: las metas conectadas e Inicio se ponen al día.
window.addEventListener('storage', (e) => {
  if (e.key !== 'huella.v1') return;
  goalFeedback();
  if (['home', 'goals'].includes(current?.section)) render(false);
});
// Balance avisa cuando sus datos cambian: Inicio muestra el resumen al momento.
window.onBalanceSummary = () => {
  goalFeedback();
  if (['home', 'goals', 'week'].includes(current?.section)) render(false);
};

subscribe(() => {
  applyAppearance();
  refreshBalanceTheme();
  refreshTravelTheme();
  goalFeedback();
  render(false);
  gameFeedback();
});
applyAppearance();
onRouteChange();
loadCovers().then(() => render(false));
refreshSummaryIfStale(todayKey());
goalFeedback();
gameFeedback();

// Al volver a la app (p. ej. al día siguiente) se repinta para que "Hoy" sea el día actual.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') render(false);
});

// En localhost no se registra para que los cambios se vean al recargar mientras se desarrolla.
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('sw.js');
}
