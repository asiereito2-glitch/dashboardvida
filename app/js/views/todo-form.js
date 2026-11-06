// Crear / editar tarea.
import { createTodo, deleteTodo, getTodo, updateTodo } from '../store.js';
import { addDays, todayKey } from '../dates.js';
import { icons } from '../icons.js';
import { confirmSheet, esc } from '../ui.js';
import { PRIORITIES, priorityBadge } from './todos.js';

let form = null;

function initForm(id, defaultDue) {
  const todo = id && getTodo(id);
  form = todo
    ? { id, title: todo.title, notes: todo.notes, priority: todo.priority, due: todo.due }
    : { id: null, title: '', notes: '', priority: 'normal', due: defaultDue || todayKey() };
}

function leave() {
  if (history.length > 1) history.back();
  else location.replace('#/todos');
}

export function renderTodoForm(root, params, entering) {
  if (params.id && !getTodo(params.id)) {
    location.replace('#/todos');
    return;
  }
  if (entering || !form) initForm(params.id, params.due);
  const editing = Boolean(form.id);
  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const rerender = () => renderTodoForm(root, params, false);
  const dateChip = (value, label) =>
    `<button data-due="${value}" class="${(form.due || '') === value ? 'on' : ''}">${label}</button>`;

  root.innerHTML = `
    <header class="nav-header">
      <button class="icon-btn danger" data-cancel aria-label="Cancelar">${icons.close}</button>
      <h1>${editing ? 'Editar tarea' : 'Nueva tarea'}</h1>
      <button class="icon-btn" data-save aria-label="Guardar">${icons.check}</button>
    </header>

    <div class="stack">
      <input class="text-input" data-title maxlength="80" placeholder="¿Qué tienes que hacer?"
        value="${esc(form.title)}" style="flex:none;height:60px">

      <div class="card">
        <div class="label">Prioridad</div>
        <div class="segmented">
          ${PRIORITIES.map((p) => `
            <button data-priority="${p.id}" class="prio-seg ${p.id === form.priority ? 'on' : ''}">
              ${priorityBadge(p.id)} ${p.label}
            </button>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="label">Fecha</div>
        <div class="segmented">
          ${dateChip('', 'Sin fecha')}
          ${dateChip(today, 'Hoy')}
          ${dateChip(tomorrow, 'Mañana')}
        </div>
        <label class="date-row">
          <span class="muted">Otra fecha</span>
          <input type="date" data-date value="${form.due || ''}">
        </label>
      </div>

      <div class="card">
        <div class="label">Notas</div>
        <textarea class="notes" data-notes rows="3" maxlength="1000" placeholder="Opcional">${esc(form.notes)}</textarea>
      </div>

      ${editing ? `<button class="action-btn danger" data-delete style="flex-direction:row;justify-content:center">${icons.trash} Eliminar tarea</button>` : ''}
    </div>`;

  const titleInput = root.querySelector('[data-title]');
  titleInput.oninput = () => { form.title = titleInput.value; };
  if (entering && !editing) setTimeout(() => titleInput.focus(), 50);
  const notes = root.querySelector('[data-notes]');
  notes.oninput = () => { form.notes = notes.value; };

  root.querySelectorAll('[data-priority]').forEach((b) => {
    b.onclick = () => { form.priority = b.dataset.priority; rerender(); };
  });
  root.querySelectorAll('[data-due]').forEach((b) => {
    b.onclick = () => { form.due = b.dataset.due || null; rerender(); };
  });
  root.querySelector('[data-date]').onchange = (e) => { form.due = e.target.value || null; rerender(); };

  root.querySelector('[data-cancel]').onclick = leave;
  root.querySelector('[data-save]').onclick = () => {
    const title = form.title.trim();
    if (!title) {
      titleInput.focus();
      titleInput.style.borderColor = 'var(--red)';
      return;
    }
    const data = { title, notes: form.notes.trim(), priority: form.priority, due: form.due };
    if (editing) updateTodo(form.id, data);
    else createTodo(data);
    leave();
  };
  root.querySelector('[data-delete]')?.addEventListener('click', () => {
    confirmSheet('Eliminar tarea', `Se borrará "${form.title}".`, 'Eliminar', () => {
      deleteTodo(form.id);
      location.replace('#/todos');
    });
  });
}
