// Corregir un entrenamiento ya guardado.
import { getSession, updateSession } from '../gym.js';
import { fmtNumber, parseNum } from '../goals.js';
import { todayKey } from '../dates.js';
import { icons } from '../icons.js';
import { esc, navigate } from '../ui.js';

let form = null;
let error = null;

function initForm(id) {
  const session = getSession(id);
  error = null;
  form = session && {
    id,
    date: session.date,
    minutes: session.minutes ? String(session.minutes) : '',
    exercises: session.exercises.map((e) => ({
      name: e.name,
      kind: e.kind,
      muscle: e.muscle || '',
      sets: e.sets.map((s) => ({ w: s.w ? fmtNumber(s.w) : '', r: fmtNumber(s.r) })),
    })),
  };
}

function setRow(exercise, exIndex, set, setIndex) {
  const free = exercise.kind === 'free';
  return `
    <div class="gym-set ${free ? 'no-weight' : ''}">
      <span class="gym-set-num">${setIndex + 1}</span>
      ${free ? '' : `<input data-f="w" data-ex="${exIndex}" data-set="${setIndex}" inputmode="decimal" autocomplete="off" aria-label="Serie ${setIndex + 1}, kilos" placeholder="${exercise.kind === 'weight' ? 'kg' : '0'}" value="${esc(set.w)}">`}
      <input data-f="r" data-ex="${exIndex}" data-set="${setIndex}" inputmode="numeric" autocomplete="off" aria-label="Serie ${setIndex + 1}, repeticiones" placeholder="0" value="${esc(set.r)}">
      <button class="gym-check" data-del-set="${setIndex}" data-ex="${exIndex}" aria-label="Quitar serie ${setIndex + 1}">${icons.close}</button>
    </div>`;
}

function exerciseCard(exercise, i) {
  const free = exercise.kind === 'free';
  return `
    <section class="card gym-ex">
      <div class="gym-ex-head"><h2>${esc(exercise.name)}</h2></div>
      <div class="gym-set gym-set-head ${free ? 'no-weight' : ''}">
        <span>Serie</span>
        ${free ? '' : '<span>Kg</span>'}
        <span>${free ? 'Reps o seg' : 'Reps'}</span>
        <span></span>
      </div>
      ${exercise.sets.map((set, s) => setRow(exercise, i, set, s)).join('')}
      <div class="gym-ex-actions"><button data-add-set="${i}">+ Serie</button></div>
    </section>`;
}

// Un ejercicio sin series se quita del entrenamiento.
function collect() {
  const exercises = [];
  for (const e of form.exercises) {
    const sets = [];
    for (const s of e.sets) {
      const r = parseNum(s.r);
      const w = parseNum(s.w);
      if (!r || r <= 0) {
        error = `Revisa las repeticiones de «${e.name}».`;
        return null;
      }
      if (e.kind === 'weight' && w === null) {
        error = `Falta el peso en «${e.name}».`;
        return null;
      }
      sets.push({ w: e.kind === 'free' ? 0 : w || 0, r });
    }
    if (sets.length) exercises.push({ name: e.name, kind: e.kind, muscle: e.muscle, sets });
  }
  if (!exercises.length) error = 'Deja al menos una serie, o borra el entrenamiento.';
  return exercises.length ? exercises : null;
}

function submit(root) {
  error = null;
  const exercises = collect();
  if (!exercises) {
    draw(root);
    window.scrollTo(0, 0);
    return;
  }
  const minutes = Number(form.minutes);
  updateSession(form.id, {
    date: form.date || todayKey(),
    minutes: minutes > 0 ? Math.round(minutes) : null,
    exercises,
  });
  navigate(`#/body/gym/session/${form.id}`);
}

function draw(root) {
  const y = window.scrollY;
  root.innerHTML = `
    <header class="nav-header">
      <a class="icon-btn danger" href="#/body/gym/session/${form.id}" aria-label="Cancelar">${icons.close}</a>
      <h1>Editar entrenamiento</h1>
      <button class="icon-btn" data-save aria-label="Guardar">${icons.check}</button>
    </header>
    ${error ? `<div class="notice error" style="margin-bottom:12px">${esc(error)}</div>` : ''}

    <div class="gym-edit stack">
      <div class="card stack">
        <label class="field-row"><span>Día</span>
          <input type="date" class="date-input" data-field="date" value="${form.date}" max="${todayKey()}"></label>
        <label class="field-row"><span>Minutos</span>
          <input class="num-input" data-field="minutes" inputmode="numeric" maxlength="3" value="${esc(form.minutes)}"></label>
      </div>
      ${form.exercises.map(exerciseCard).join('')}
      <button class="primary-btn" data-save style="margin:0;width:100%">Guardar cambios</button>
    </div>`;
  window.scrollTo(0, y);

  const change = (fn) => { fn(); draw(root); };
  root.querySelector('.gym-edit').addEventListener('input', (e) => {
    const { f, ex, set, field } = e.target.dataset;
    if (field) form[field] = e.target.value;
    if (!f) return;
    const clean = f === 'w' ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value.replace(/\D/g, '');
    e.target.value = clean;
    form.exercises[ex].sets[set][f] = clean;
  });
  root.querySelectorAll('[data-save]').forEach((b) => { b.onclick = () => submit(root); });
  root.querySelectorAll('[data-add-set]').forEach((b) => {
    b.onclick = () => change(() => {
      const { sets } = form.exercises[b.dataset.addSet];
      sets.push({ w: sets.at(-1)?.w || '', r: '' });
    });
  });
  root.querySelectorAll('[data-del-set]').forEach((b) => {
    b.onclick = () => change(() => {
      form.exercises[b.dataset.ex].sets.splice(Number(b.dataset.delSet), 1);
    });
  });
}

export function renderGymSessionEdit(root, { id }, entering) {
  if (entering || form?.id !== id) initForm(id);
  if (!form) {
    root.innerHTML = '<div class="card empty small">Este entrenamiento ya no existe.</div>';
    return;
  }
  draw(root);
}
