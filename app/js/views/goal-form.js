// Crear / editar meta.
import { activeHabits, getHabit } from '../store.js';
import {
  createGoal, defaultBaseline, fmtNumber, getGoal, parseNum, sameSource, sourceOptions, updateGoal,
} from '../goals.js';
import { habitStartKey } from '../habit-logic.js';
import { toKey, todayKey } from '../dates.js';
import { icons } from '../icons.js';
import { closeSheet, esc, openSheet } from '../ui.js';

const EMOJIS = [
  '💰', '🏦', '📈', '🏋️', '💪', '⚖️', '🏃', '🚴',
  '📚', '🎯', '✈️', '🏠', '🚗', '🎸', '🧘', '🍎',
  '💧', '🚭', '🎓', '💻', '❤️', '🏆', '⭐', '🌱',
];
const UNITS = ['€', 'kg', 'km', 'libros'];

let form = null;

const numText = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

function initForm(id) {
  const g = id && getGoal(id);
  form = g
    ? {
      id,
      type: g.type,
      name: g.name,
      emoji: g.emoji,
      unit: g.unit || '',
      startValue: numText(g.startValue),
      target: numText(g.target),
      habitId: g.habitId || null,
      startDate: g.startDate,
      deadline: g.deadline || null,
      baseline: g.baseline || null,
      source: g.source || null,
    }
    : {
      id: null,
      type: 'numeric',
      name: '',
      emoji: '🎯',
      unit: '€',
      startValue: '',
      target: '',
      habitId: activeHabits()[0]?.id || null,
      startDate: todayKey(),
      deadline: null,
      baseline: null, // null = la app elige según la unidad
      source: null, // de dónde sale el valor; null = se apunta a mano
    };
}

// Desde dónde cuenta el %: lo elegido, o lo que toque según unidad y sentido de la meta.
function effectiveBaseline() {
  const start = parseNum(form.startValue) ?? 0;
  const target = parseNum(form.target);
  if (target !== null && target < start) return { value: 'start', forced: true };
  return { value: form.baseline || defaultBaseline(form.unit, start, target ?? start), forced: false };
}

function baselineBlock() {
  const { value, forced } = effectiveBaseline();
  const start = parseNum(form.startValue);
  const target = parseNum(form.target);
  let hint = value === 'zero'
    ? 'Lo que ya tienes cuenta.'
    : 'Solo cuenta lo que avances a partir de ahora.';
  if (value === 'zero' && start && target && target > 0) {
    hint = `Lo que ya tienes cuenta: ${fmtNumber(start)} de ${fmtNumber(target)} ${esc(form.unit)} = ${Math.round(Math.min(1, start / target) * 100)}%.`;
  }
  if (forced) hint = 'Al ser una meta para bajar, se cuenta desde el valor actual.';
  return `
    <div class="small muted" style="margin-bottom:8px">Contar el progreso</div>
    <div class="segmented two">
      <button data-baseline="zero" class="${value === 'zero' ? 'on' : ''}" ${forced ? 'disabled' : ''}>Desde 0</button>
      <button data-baseline="start" class="${value === 'start' ? 'on' : ''}">Desde el valor actual</button>
    </div>
    <div class="small muted" style="margin-top:8px">${hint}</div>`;
}

function sourceBlock() {
  const options = sourceOptions();
  if (!options.length) return '';
  return `
    <div class="card">
      <div class="label">Actualizar</div>
      <div class="attr-chips">
        <button data-source="" class="${form.source ? '' : 'on'}">A mano</button>
        ${options.map((o, i) => `<button data-source="${i}" class="${sameSource(o.source, form.source) ? 'on' : ''}">${esc(o.label)}</button>`).join('')}
      </div>
      <div class="small muted" style="margin-top:8px">${form.source
        ? 'Se actualiza sola; no tendrás que apuntar nada.'
        : 'Tú apuntas cada avance. Si la conectas, se actualiza sola.'}</div>
    </div>`;
}

function deadlinePresets() {
  const now = new Date();
  const plusMonths = (m) => toKey(new Date(now.getFullYear(), now.getMonth() + m, now.getDate()));
  return [
    { label: 'Sin fecha', value: '' },
    { label: '3 meses', value: plusMonths(3) },
    { label: '6 meses', value: plusMonths(6) },
    { label: 'Fin de año', value: toKey(new Date(now.getFullYear(), 11, 31)) },
  ];
}

function openEmojiSheet(rerender) {
  openSheet('Elige un icono', `
    <div class="emoji-grid">
      ${EMOJIS.map((e) => `<button data-emoji="${e}" class="${e === form.emoji ? 'on' : ''}">${e}</button>`).join('')}
    </div>`, (sheet) => {
    sheet.querySelectorAll('[data-emoji]').forEach((b) => {
      b.onclick = () => { form.emoji = b.dataset.emoji; closeSheet(); rerender(); };
    });
  });
}

export function renderGoalForm(root, params, entering) {
  if (params.id && !getGoal(params.id)) {
    location.replace('#/goals');
    return;
  }
  if (entering || !form) initForm(params.id);
  const editing = Boolean(form.id);
  const rerender = () => renderGoalForm(root, params, false);
  const habits = activeHabits();
  const habit = form.habitId && getHabit(form.habitId);
  const presets = deadlinePresets();

  const numericFields = `
    ${sourceBlock()}
    <div class="card stack">
      <div class="label" style="margin:0">Valores</div>
      <label class="field-row"><span>${editing ? 'Valor inicial' : 'Valor actual'}</span>
        <input class="num-input" data-field="startValue" inputmode="decimal" placeholder="0" value="${esc(form.startValue)}"></label>
      <label class="field-row"><span>Objetivo</span>
        <input class="num-input" data-field="target" inputmode="decimal" placeholder="1000" value="${esc(form.target)}"></label>
      <div>
        <div class="small muted" style="margin-bottom:8px">Unidad</div>
        <div class="attr-chips">
          ${UNITS.map((u) => `<button data-unit="${u}" class="${form.unit === u ? 'on' : ''}">${u}</button>`).join('')}
          <input class="num-input unit-input" data-field="unit" maxlength="12" placeholder="Otra" value="${UNITS.includes(form.unit) ? '' : esc(form.unit)}">
        </div>
      </div>
      <div class="small muted">Para bajar (por ejemplo, perder peso) pon un objetivo menor que el valor actual.</div>
      <div data-baseline-box>${baselineBlock()}</div>
    </div>`;

  const habitFields = habits.length ? `
    <div class="card stack">
      <div class="label" style="margin:0">Hábito</div>
      <div class="option-list">
        ${habits.map((h) => `
          <button data-habit="${h.id}" class="${h.id === form.habitId ? 'on' : ''}">
            <span style="font-size:20px">${esc(h.emoji)}</span><span class="grow">${esc(h.name)}</span>
          </button>`).join('')}
      </div>
      <label class="field-row"><span>Número de veces</span>
        <input class="num-input" data-field="target" inputmode="numeric" placeholder="100" value="${esc(form.target)}"></label>
      <label class="field-row"><span>Contar desde</span>
        <input type="date" class="date-input" data-start value="${form.startDate}"></label>
      ${habit ? `<button class="link-btn" data-from-habit style="margin:0;color:var(--accent)">Desde que empezó el hábito</button>` : ''}
    </div>`
    : '<div class="card empty small">Primero crea un hábito para poder ligarle una meta.</div>';

  root.innerHTML = `
    <header class="nav-header">
      <button class="icon-btn danger" data-cancel aria-label="Cancelar">${icons.close}</button>
      <h1>${editing ? 'Editar meta' : 'Nueva meta'}</h1>
      <button class="icon-btn" data-save aria-label="Guardar">${icons.check}</button>
    </header>

    <div class="stack">
      ${editing ? '' : `
      <div class="segmented two">
        <button data-type="numeric" class="${form.type === 'numeric' ? 'on' : ''}">Valor numérico</button>
        <button data-type="habit" class="${form.type === 'habit' ? 'on' : ''}">Con un hábito</button>
      </div>
      <div class="small muted" style="margin-top:-4px">${form.type === 'numeric'
        ? 'Tú apuntas cómo vas: dinero ahorrado, peso, kilómetros…'
        : 'Cuenta sola los días que cumples un hábito: "ir 100 veces al gimnasio".'}</div>`}

      <div class="name-row">
        <button class="emoji-btn" data-emoji-pick aria-label="Cambiar icono">${esc(form.emoji)}</button>
        <input class="text-input" data-field="name" maxlength="50" placeholder="${form.type === 'numeric' ? 'Ahorrar para el viaje' : 'Ir al gimnasio 100 veces'}" value="${esc(form.name)}">
      </div>

      ${form.type === 'numeric' ? numericFields : habitFields}

      <div class="card">
        <div class="label">Fecha límite</div>
        <div class="attr-chips">
          ${presets.map((p) => `<button data-deadline="${p.value}" class="${(form.deadline || '') === p.value ? 'on' : ''}">${p.label}</button>`).join('')}
        </div>
        <label class="date-row">
          <span class="muted">Otra fecha</span>
          <input type="date" data-deadline-date value="${form.deadline || ''}" min="${todayKey()}">
        </label>
      </div>

      <div class="form-error small" data-error></div>
    </div>`;

  // El bloque "Contar el progreso" se actualiza al escribir, sin repintar todo (no se pierde el foco).
  const baselineBox = root.querySelector('[data-baseline-box]');
  const refreshBaseline = () => {
    if (!baselineBox) return;
    baselineBox.innerHTML = baselineBlock();
    baselineBox.querySelectorAll('[data-baseline]').forEach((b) => {
      b.onclick = () => { form.baseline = b.dataset.baseline; refreshBaseline(); };
    });
  };
  refreshBaseline();

  root.querySelectorAll('[data-field]').forEach((input) => {
    input.oninput = () => {
      form[input.dataset.field] = input.value;
      if (input.dataset.field === 'unit') {
        root.querySelectorAll('[data-unit]').forEach((b) => b.classList.remove('on'));
      }
      refreshBaseline();
    };
  });
  if (entering && !editing) setTimeout(() => root.querySelector('[data-field="name"]').focus(), 50);

  root.querySelectorAll('[data-type]').forEach((b) => {
    b.onclick = () => {
      form.type = b.dataset.type;
      form.target = '';
      const h = form.habitId && getHabit(form.habitId);
      if (form.type === 'habit' && h && form.emoji === '🎯') form.emoji = h.emoji;
      rerender();
    };
  });
  root.querySelectorAll('[data-source]').forEach((b) => {
    b.onclick = () => {
      const option = sourceOptions()[Number(b.dataset.source)];
      form.source = b.dataset.source === '' ? null : option.source;
      if (form.source) {
        form.unit = option.unit;
        if (!editing) form.startValue = numText(Math.round(option.value * 100) / 100);
      }
      rerender();
    };
  });
  root.querySelectorAll('[data-unit]').forEach((b) => {
    b.onclick = () => { form.unit = b.dataset.unit; rerender(); };
  });
  root.querySelectorAll('[data-habit]').forEach((b) => {
    b.onclick = () => {
      form.habitId = b.dataset.habit;
      // Si aún no se ha elegido icono, usa el del hábito.
      if (!editing && form.emoji === '🎯') form.emoji = getHabit(form.habitId).emoji;
      rerender();
    };
  });
  root.querySelector('[data-start]')?.addEventListener('change', (e) => {
    form.startDate = e.target.value || todayKey();
    rerender();
  });
  root.querySelector('[data-from-habit]')?.addEventListener('click', () => {
    form.startDate = habitStartKey(habit);
    rerender();
  });
  root.querySelectorAll('[data-deadline]').forEach((b) => {
    b.onclick = () => { form.deadline = b.dataset.deadline || null; rerender(); };
  });
  root.querySelector('[data-deadline-date]').onchange = (e) => { form.deadline = e.target.value || null; rerender(); };
  root.querySelector('[data-emoji-pick]').onclick = () => openEmojiSheet(rerender);

  const leave = () => location.replace(editing ? `#/goals/${form.id}` : '#/goals');
  root.querySelector('[data-cancel]').onclick = leave;

  root.querySelector('[data-save]').onclick = () => {
    const error = (msg) => { root.querySelector('[data-error]').textContent = msg; };
    const name = form.name.trim();
    if (!name) return error('Ponle un nombre a la meta.');
    const target = parseNum(form.target);
    if (target === null) return error('Indica el objetivo.');
    if (form.deadline && form.deadline <= form.startDate) return error('La fecha límite tiene que ser posterior al inicio.');

    const data = { name, emoji: form.emoji, target, deadline: form.deadline };
    if (form.type === 'numeric') {
      const start = parseNum(form.startValue) ?? 0;
      if (start === target) return error('El objetivo tiene que ser distinto del valor actual.');
      Object.assign(data, {
        type: 'numeric',
        unit: form.unit.trim(),
        startValue: start,
        startDate: form.startDate,
        baseline: effectiveBaseline().value,
        source: form.source,
      });
    } else {
      if (!form.habitId) return error('Elige un hábito.');
      if (target < 1 || !Number.isInteger(target)) return error('El número de veces tiene que ser un entero mayor que 0.');
      Object.assign(data, { type: 'habit', habitId: form.habitId, startDate: form.startDate });
    }
    if (editing) updateGoal(form.id, data);
    else createGoal(data);
    leave();
  };
}
