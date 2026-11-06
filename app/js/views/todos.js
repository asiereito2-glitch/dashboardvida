// Pantalla de tareas: resumen, tarjetas por prioridad, foco y listas filtradas.
import { state, toggleTodo } from '../store.js';
import { relativeDayLabel, todayKey } from '../dates.js';
import { icons } from '../icons.js';
import { esc, navigate } from '../ui.js';

export const PRIORITIES = [
  { id: 'high', label: 'Alta', icon: icons.arrowUp },
  { id: 'normal', label: 'Normal', icon: icons.dash },
  { id: 'low', label: 'Baja', icon: icons.arrowDown },
];
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

const FILTERS = {
  open: { title: 'Abiertas', match: () => true },
  overdue: { title: 'Vencidas', match: (t, today) => t.due && t.due < today, hideDone: true },
  today: { title: 'Para hoy', match: (t, today) => t.due === today },
  high: { title: 'Prioridad alta', match: (t) => t.priority === 'high' },
  normal: { title: 'Prioridad normal', match: (t) => t.priority === 'normal' },
  low: { title: 'Prioridad baja', match: (t) => t.priority === 'low' },
};

const FOCUS_LIMIT = 5;
const DONE_LIMIT = 30;

export function priorityBadge(priority) {
  const p = PRIORITIES.find((x) => x.id === priority);
  return `<span class="prio ${priority}" title="Prioridad ${p.label.toLowerCase()}">${p.icon}</span>`;
}

// Abiertas ordenadas: primero por fecha (sin fecha al final), luego por prioridad.
export function sortedOpenTodos(filter = () => true) {
  const today = todayKey();
  return state.todos
    .filter((t) => !t.done && filter(t, today))
    .sort((a, b) =>
      (a.due || '9999').localeCompare(b.due || '9999')
      || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      || a.createdAt.localeCompare(b.createdAt));
}

export function todoRow(todo) {
  const today = todayKey();
  const overdue = !todo.done && todo.due && todo.due < today;
  const date = todo.due
    ? `<span class="todo-date ${overdue ? 'overdue' : ''}">${icons.calendar}${relativeDayLabel(todo.due)}</span>`
    : '';
  return `
    <div class="card todo-row ${todo.done ? 'done' : ''}" data-todo="${todo.id}" role="button">
      <button class="check ${todo.done ? 'done' : ''}" data-toggle="${todo.id}"
        aria-label="${todo.done ? 'Desmarcar' : 'Completar'} ${esc(todo.title)}">${todo.done ? icons.check : ''}</button>
      <div class="grow">
        <div class="todo-title">${esc(todo.title)}</div>
        ${date}
      </div>
      ${priorityBadge(todo.priority)}
    </div>`;
}

export function bindTodoRows(root) {
  root.querySelectorAll('[data-toggle]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTodo(b.dataset.toggle);
    });
  });
  root.querySelectorAll('[data-todo]').forEach((el) => {
    el.addEventListener('click', () => navigate(`#/todos/${el.dataset.todo}`));
  });
}

function renderList(root, filterId) {
  const filter = FILTERS[filterId] || FILTERS.open;
  const today = todayKey();
  const open = sortedOpenTodos(filter.match);
  const done = filter.hideDone ? [] : state.todos
    .filter((t) => t.done && filter.match(t, today))
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))
    .slice(0, DONE_LIMIT);

  root.innerHTML = `
    <header class="nav-header">
      <button class="icon-btn" data-back aria-label="Volver">${icons.back}</button>
      <h1>${filter.title}</h1>
      <button class="icon-btn" data-new aria-label="Nueva tarea">${icons.plus}</button>
    </header>
    ${open.length
      ? `<div class="stack">${open.map(todoRow).join('')}</div>`
      : '<div class="card empty"><div class="big">✨</div>No hay tareas pendientes aquí.</div>'}
    ${done.length ? `
      <div class="section-title">Completadas</div>
      <div class="stack">${done.map(todoRow).join('')}</div>` : ''}`;

  root.querySelector('[data-back]').onclick = () => {
    if (history.length > 1) history.back();
    else location.replace('#/todos');
  };
  root.querySelector('[data-new]').onclick = () => navigate('#/todos/new');
  bindTodoRows(root);
}

export function renderTodos(root, params) {
  if (params.filter) return renderList(root, params.filter);

  const today = todayKey();
  const open = sortedOpenTodos();
  const overdue = open.filter((t) => t.due && t.due < today).length;
  const dueToday = open.filter((t) => t.due === today).length;
  const focus = open.slice(0, FOCUS_LIMIT);

  const overviewItem = (filter, value, label) => `
    <button class="ov-item" data-filter="${filter}">
      <span class="ov-val ${filter === 'overdue' && value ? 'overdue' : ''}">${value}</span>
      <span class="ov-lbl">${label}</span>
    </button>`;

  root.innerHTML = `
    <header class="page-header">
      <h1 class="page-title">Tareas</h1>
      <button class="icon-btn" data-new aria-label="Nueva tarea">${icons.plus}</button>
    </header>

    <div class="card overview">
      <div class="small" style="font-weight:600">Resumen</div>
      <div class="ov-row">
        ${overviewItem('overdue', overdue, 'Vencidas')}
        ${overviewItem('open', open.length, 'Abiertas')}
        ${overviewItem('today', dueToday, 'Para hoy')}
      </div>
    </div>

    <div class="prio-cards">
      ${PRIORITIES.map((p) => `
        <button class="prio-card ${p.id}" data-filter="${p.id}">
          <span class="prio-card-top">${priorityBadge(p.id)}${icons.chevronRight}</span>
          <span class="prio-count">${open.filter((t) => t.priority === p.id).length}</span>
          <span class="prio-pill">${p.label}</span>
        </button>`).join('')}
    </div>

    <div class="section-head">
      <div class="section-title">Foco</div>
      ${open.length ? `<button class="link-btn" data-filter="open">Ver todas ${icons.chevronRight}</button>` : ''}
    </div>
    ${focus.length
      ? `<div class="stack">${focus.map(todoRow).join('')}</div>`
      : `<div class="card empty">
          <div class="big">✅</div>
          No tienes tareas pendientes.<br>
          <button class="primary-btn" data-new>${icons.plus} Nueva tarea</button>
        </div>`}`;

  root.querySelectorAll('[data-new]').forEach((b) => { b.onclick = () => navigate('#/todos/new'); });
  root.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => navigate(`#/todos/list/${b.dataset.filter}`);
  });
  bindTodoRows(root);
}
