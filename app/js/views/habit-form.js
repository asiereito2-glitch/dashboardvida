// Crear / editar hábito.
import { createHabit, getCategory, getHabit, save, state, uid, updateHabit } from '../store.js';
import { goalText } from '../habit-logic.js';
import { DIFFICULTIES, gameEnabled } from '../game.js';
import { icons } from '../icons.js';
import { closeSheet, esc, openSheet } from '../ui.js';

const EMOJIS = [
  '📚', '📖', '✍️', '📝', '🧠', '🧘', '🙏', '😴',
  '🚶', '🏃', '🚴', '🏋️', '🤸', '🏊', '⚽', '🎾',
  '💧', '🥗', '🍎', '🥦', '☕', '🚭', '🍷', '💊',
  '🦷', '🧴', '🛏️', '🧹', '🧺', '🍳', '🪴', '🐶',
  '💼', '💻', '📧', '📅', '💰', '📈', '🎯', '⏰',
  '🎸', '🎨', '📷', '🎧', '🗣️', '❤️', '📞', '☀️',
];

const PERIODS = [
  { id: 'day', label: 'Diario', max: 20 },
  { id: 'week', label: 'Semanal', max: 7 },
  { id: 'month', label: 'Mensual', max: 31 },
];

let form = null;

function initForm(id) {
  const habit = id && getHabit(id);
  form = habit
    ? {
      id,
      name: habit.name,
      emoji: habit.emoji,
      period: habit.period,
      target: habit.target,
      categoryId: habit.categoryId,
      difficulty: habit.difficulty || 'medium',
    }
    : { id: null, name: '', emoji: '📚', period: 'day', target: 1, categoryId: null, difficulty: 'medium' };
}

function openEmojiSheet(rerender) {
  openSheet('Elige un icono', `
    <div class="emoji-grid">
      ${EMOJIS.map((e) => `<button data-emoji="${e}" class="${e === form.emoji ? 'on' : ''}">${e}</button>`).join('')}
    </div>
    <p class="small muted" style="text-align:center;margin:16px 0 8px">O escribe cualquier emoji:</p>
    <div class="name-row">
      <input class="text-input" data-custom maxlength="8" placeholder="🙂" style="height:48px;text-align:center;font-size:24px">
      <button class="primary-btn" data-use style="margin:0">Usar</button>
    </div>`, (sheet) => {
    sheet.querySelectorAll('[data-emoji]').forEach((b) => {
      b.onclick = () => { form.emoji = b.dataset.emoji; closeSheet(); rerender(); };
    });
    sheet.querySelector('[data-use]').onclick = () => {
      const value = sheet.querySelector('[data-custom]').value.trim();
      if (!value) return;
      form.emoji = value;
      closeSheet();
      rerender();
    };
  });
}

function openCategorySheet(rerender) {
  const option = (id, emoji, name) => `
    <button data-cat="${id ?? ''}" class="${(form.categoryId ?? '') === (id ?? '') ? 'on' : ''}">
      <span style="font-size:20px">${esc(emoji)}</span><span class="grow">${esc(name)}</span>
    </button>`;
  openSheet('Categoría', `
    <div class="option-list">
      ${option(null, '➖', 'Sin categoría')}
      ${state.categories.map((c) => option(c.id, c.emoji, c.name)).join('')}
    </div>
    <p class="small muted" style="margin:18px 0 8px">Nueva categoría</p>
    <div class="name-row">
      <input class="text-input" data-new-cat maxlength="30" placeholder="Nombre" style="height:48px">
      <button class="primary-btn" data-add style="margin:0">Añadir</button>
    </div>`, (sheet) => {
    sheet.querySelectorAll('[data-cat]').forEach((b) => {
      b.onclick = () => { form.categoryId = b.dataset.cat || null; closeSheet(); rerender(); };
    });
    sheet.querySelector('[data-add]').onclick = () => {
      const name = sheet.querySelector('[data-new-cat]').value.trim();
      if (!name) return;
      const cat = { id: uid(), name, emoji: '🏷️' };
      state.categories.push(cat);
      form.categoryId = cat.id;
      closeSheet();
      save();
    };
  });
}

export function renderHabitForm(root, params, entering) {
  if (entering || !form) initForm(params.id);
  const editing = Boolean(form.id);
  const period = PERIODS.find((p) => p.id === form.period);
  const category = form.categoryId && getCategory(form.categoryId);
  const rerender = () => renderHabitForm(root, params, false);

  root.innerHTML = `
    <header class="nav-header">
      <button class="icon-btn danger" data-cancel aria-label="Cancelar">${icons.close}</button>
      <h1>${editing ? 'Editar hábito' : 'Nuevo hábito'}</h1>
      <button class="icon-btn" data-save aria-label="Guardar">${icons.check}</button>
    </header>

    <div class="stack">
      <div class="name-row">
        <button class="emoji-btn" data-emoji-pick aria-label="Cambiar icono">${esc(form.emoji)}</button>
        <input class="text-input" data-name maxlength="40" placeholder="Nombre del hábito" value="${esc(form.name)}">
      </div>

      <div class="card">
        <div class="label">Objetivo</div>
        <div class="segmented">
          ${PERIODS.map((p) => `<button data-period="${p.id}" class="${p.id === form.period ? 'on' : ''}">${p.label}</button>`).join('')}
        </div>
        <div class="stepper">
          <span class="muted">${goalText(form)}</span>
          <div class="controls">
            <button data-step="-1" aria-label="Menos" ${form.target <= 1 ? 'disabled' : ''}>${icons.minus}</button>
            <span class="num">${form.target}</span>
            <button data-step="1" aria-label="Más" ${form.target >= period.max ? 'disabled' : ''}>${icons.plus}</button>
          </div>
        </div>
      </div>

      ${gameEnabled() ? `
      <div class="card">
        <div class="label">Dificultad</div>
        <div class="segmented">
          ${DIFFICULTIES.map((d) => `
            <button data-difficulty="${d.id}" class="${d.id === form.difficulty ? 'on' : ''}">${d.label}<span class="seg-sub">${d.xp} XP</span></button>`).join('')}
        </div>
      </div>` : ''}

      <button class="card row-card" data-category style="text-align:left">
        <span class="bubble">${category ? esc(category.emoji) : icons.tag}</span>
        <span class="grow">
          <span class="small muted" style="display:block">Categoría</span>
          <span class="${category ? '' : 'muted'}">${category ? esc(category.name) : 'Elegir categoría'}</span>
        </span>
        ${icons.chevronRight}
      </button>
    </div>`;

  const nameInput = root.querySelector('[data-name]');
  nameInput.oninput = () => { form.name = nameInput.value; };
  if (entering && !editing) setTimeout(() => nameInput.focus(), 50);

  // Sustituye la entrada del formulario en el historial para que "atrás" no vuelva a él.
  const leave = () => location.replace(editing ? `#/habits/${form.id}` : '#/habits');
  root.querySelector('[data-cancel]').onclick = leave;
  root.querySelector('[data-emoji-pick]').onclick = () => openEmojiSheet(rerender);
  root.querySelector('[data-category]').onclick = () => openCategorySheet(rerender);

  root.querySelectorAll('[data-period]').forEach((b) => {
    b.onclick = () => {
      form.period = b.dataset.period;
      form.target = Math.min(form.target, PERIODS.find((p) => p.id === form.period).max);
      rerender();
    };
  });
  root.querySelectorAll('[data-difficulty]').forEach((b) => {
    b.onclick = () => { form.difficulty = b.dataset.difficulty; rerender(); };
  });
  root.querySelectorAll('[data-step]').forEach((b) => {
    b.onclick = () => {
      form.target = Math.max(1, Math.min(period.max, form.target + Number(b.dataset.step)));
      rerender();
    };
  });

  root.querySelector('[data-save]').onclick = () => {
    const name = form.name.trim();
    if (!name) {
      nameInput.focus();
      nameInput.style.borderColor = 'var(--red)';
      return;
    }
    const data = {
      name,
      emoji: form.emoji,
      period: form.period,
      target: form.target,
      categoryId: form.categoryId,
      difficulty: form.difficulty,
    };
    if (editing) updateHabit(form.id, data);
    else createHabit(data);
    leave();
  };
}
