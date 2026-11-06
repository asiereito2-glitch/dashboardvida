// Crear / editar una rutina.
import {
  KINDS, MUSCLES, REST_OPTIONS, deleteRoutine, duplicateRoutine, exerciseNames, getRoutine, newExercise, saveRoutine,
} from '../gym.js';
import { parseNum } from '../goals.js';
import { icons } from '../icons.js';
import { confirmSheet, esc, navigate, showToast } from '../ui.js';

const GYM_ROUTE = '#/body/gym';

let form = null;
let error = null;

function initForm(id) {
  const routine = id && getRoutine(id);
  error = null;
  form = routine
    ? {
      id,
      name: routine.name,
      rest: routine.rest,
      exercises: routine.exercises.map((e) => ({ ...e, savedName: e.name })),
    }
    : { id: null, name: '', rest: 90, exercises: [newExercise()] };
}

const kindButtons = (e, i) => KINDS.map((k) => `
  <button type="button" data-kind="${k.id}" data-i="${i}" class="${e.kind === k.id ? 'on' : ''}">${k.label}</button>`).join('');

function exerciseCard(e, i) {
  const count = form.exercises.length;
  return `
    <div class="card gym-edit-ex">
      <div class="gym-edit-top">
        <span class="gym-edit-num">${i + 1}</span>
        <input class="gym-edit-name" data-f="name" data-i="${i}" list="gym-names" placeholder="Nombre del ejercicio" value="${esc(e.name)}" autocomplete="off">
      </div>
      <div class="segmented">${kindButtons(e, i)}</div>
      <label class="field-row"><span>Grupo muscular</span>
        <select class="date-input" data-f="muscle" data-i="${i}">
          <option value="">Sin indicar</option>
          ${MUSCLES.map((m) => `<option value="${m.id}" ${m.id === e.muscle ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select></label>
      <div class="gym-edit-nums">
        <label>Series <input class="num-input" data-f="sets" data-i="${i}" inputmode="numeric" maxlength="2" value="${e.sets}"></label>
        ${e.kind === 'free' ? '' : `
          <label>Reps <input class="num-input" data-f="min" data-i="${i}" inputmode="numeric" maxlength="3" value="${e.min || ''}">
          a <input class="num-input" data-f="max" data-i="${i}" inputmode="numeric" maxlength="3" value="${e.max || ''}"></label>`}
        ${e.kind === 'weight' ? `<label>Subir <input class="num-input" data-f="inc" data-i="${i}" inputmode="decimal" maxlength="5" value="${String(e.inc).replace('.', ',')}"> kg</label>` : ''}
      </div>
      <input class="gym-edit-note" data-f="note" data-i="${i}" placeholder="Nota opcional (ej.: kg por mancuerna)" value="${esc(e.note || '')}" autocomplete="off">
      <div class="gym-edit-actions">
        <button type="button" class="icon-btn" data-move="-1" data-i="${i}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${icons.arrowUp}</button>
        <button type="button" class="icon-btn" data-move="1" data-i="${i}" aria-label="Bajar" ${i === count - 1 ? 'disabled' : ''}>${icons.arrowDown}</button>
        <button type="button" class="icon-btn danger" data-remove="${i}" aria-label="Quitar ejercicio">${icons.trash}</button>
      </div>
    </div>`;
}

const toInt = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

// Devuelve el texto del error, o null si todo está bien.
function validate(exercises) {
  if (!form.name.trim()) return 'Ponle un nombre a la rutina.';
  if (!exercises.length) return 'Añade al menos un ejercicio con nombre.';
  for (const e of exercises) {
    if (!toInt(e.sets) || e.sets > 20) return `Revisa las series de «${e.name}».`;
    if (e.kind === 'free') continue;
    const min = toInt(e.min);
    const max = toInt(e.max);
    if (!min || !max || min > max) return `Revisa las repeticiones de «${e.name}».`;
    if (e.kind === 'weight' && !(parseNum(e.inc) > 0)) return `Revisa cuánto subir en «${e.name}».`;
  }
  return null;
}

function submit(root) {
  const exercises = form.exercises.filter((e) => e.name.trim());
  error = validate(exercises);
  if (error) {
    draw(root);
    window.scrollTo(0, 0);
    return;
  }
  const renames = exercises
    .filter((e) => e.savedName && e.savedName !== e.name.trim())
    .map((e) => [e.savedName, e.name.trim()]);
  saveRoutine(form.id, {
    name: form.name.trim(),
    rest: form.rest,
    exercises: exercises.map(({ savedName, ...e }) => ({
      ...e,
      name: e.name.trim(),
      note: (e.note || '').trim(),
      sets: Number(e.sets),
      min: e.kind === 'free' ? 0 : Number(e.min),
      max: e.kind === 'free' ? 0 : Number(e.max),
      inc: parseNum(e.inc) ?? 2.5,
    })),
  }, renames);
  navigate(GYM_ROUTE);
}

function draw(root) {
  const y = window.scrollY;
  root.innerHTML = `
    <header class="nav-header">
      <a class="icon-btn danger" href="${GYM_ROUTE}" aria-label="Cancelar">${icons.close}</a>
      <h1>${form.id ? 'Editar rutina' : 'Nueva rutina'}</h1>
      <button class="icon-btn" data-save aria-label="Guardar">${icons.check}</button>
    </header>
    ${error ? `<div class="notice error" style="margin-bottom:12px">${esc(error)}</div>` : ''}

    <div class="gym-form stack">
      <input class="text-input gym-routine-input" data-routine-name placeholder="Nombre (ej.: Torso A)" value="${esc(form.name)}" autocomplete="off">

      <div class="card stack">
        <div class="label" style="margin:0">Descanso entre series</div>
        <div class="segmented gym-rest">
          ${REST_OPTIONS.map((s) => `<button type="button" data-rest="${s}" class="${form.rest === s ? 'on' : ''}">${s < 120 ? `${s} s` : `${s / 60} min`}</button>`).join('')}
        </div>
      </div>

      <div class="section-title" style="margin:8px 0 0">Ejercicios</div>
      ${form.exercises.map(exerciseCard).join('')}
      <datalist id="gym-names">${exerciseNames().map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>

      <button type="button" class="gym-action" data-add style="width:100%">${icons.plus}<span>Añadir ejercicio</span></button>
      ${form.exercises.some((e) => e.savedName) ? '<div class="small muted">Si cambias el nombre de un ejercicio, su historial lo sigue. Para cambiarlo por otro distinto, quítalo y añade el nuevo.</div>' : ''}
      <button class="primary-btn" data-save style="margin:0;width:100%">Guardar rutina</button>
      ${form.id ? `
        <div class="gym-actions">
          <button type="button" class="gym-action" data-copy>Duplicar</button>
          <button type="button" class="gym-action danger" data-delete>Borrar</button>
        </div>` : ''}
    </div>`;
  window.scrollTo(0, y);

  const change = (fn) => { fn(); draw(root); };
  const box = root.querySelector('.gym-form');
  box.addEventListener('input', (e) => {
    const { f, i } = e.target.dataset;
    if (e.target.matches('[data-routine-name]')) form.name = e.target.value;
    else if (f) form.exercises[i][f] = e.target.value;
  });
  root.querySelectorAll('[data-save]').forEach((b) => { b.onclick = () => submit(root); });
  root.querySelectorAll('[data-rest]').forEach((b) => {
    b.onclick = () => change(() => { form.rest = Number(b.dataset.rest); });
  });
  root.querySelectorAll('[data-kind]').forEach((b) => {
    b.onclick = () => change(() => { form.exercises[b.dataset.i].kind = b.dataset.kind; });
  });
  root.querySelectorAll('[data-move]').forEach((b) => {
    b.onclick = () => change(() => {
      const i = Number(b.dataset.i);
      const [item] = form.exercises.splice(i, 1);
      form.exercises.splice(i + Number(b.dataset.move), 0, item);
    });
  });
  root.querySelectorAll('[data-remove]').forEach((b) => {
    b.onclick = () => change(() => { form.exercises.splice(Number(b.dataset.remove), 1); });
  });
  root.querySelector('[data-add]').onclick = () => {
    change(() => form.exercises.push(newExercise()));
    root.querySelectorAll('.gym-edit-name')[form.exercises.length - 1].focus();
  };
  const copy = root.querySelector('[data-copy]');
  if (copy) {
    copy.onclick = () => {
      navigate(`#/body/gym/routine/${duplicateRoutine(form.id).id}`);
      showToast('Rutina duplicada');
    };
  }
  const remove = root.querySelector('[data-delete]');
  if (remove) {
    remove.onclick = () => confirmSheet(
      'Borrar rutina',
      'Los entrenamientos que ya hiciste se quedan en tu historial.',
      'Borrar rutina',
      () => {
        deleteRoutine(form.id);
        navigate(GYM_ROUTE);
      },
    );
  }
}

export function renderGymRoutine(root, { id }, entering) {
  if (entering || !form) initForm(id);
  draw(root);
}
