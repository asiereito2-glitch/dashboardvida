// Entrenamiento en curso. Todo se guarda al escribir: se puede cerrar la app y seguir después.
import { persist, state } from '../store.js';
import {
  KINDS, MUSCLES, discardDraft, draftCheck, draftExerciseNamed, exerciseNames, finishDraft, lastTime, recommend, setsLabel,
} from '../gym.js';
import { fmtNumber } from '../goals.js';
import { fmtDuration, relativeDayLabel, todayKey } from '../dates.js';
import { icons } from '../icons.js';
import {
  closeSheet, confirmSheet, esc, navigate, openSheet, showToast,
} from '../ui.js';

const GYM_ROUTE = '#/body/gym';
const REST_STEP = 15;
const MAX_MINUTES = 300; // más que esto suele ser que la app se quedó abierta
const LATE_ALERT_MS = 5000; // al volver a la app mucho después, ya no suena

let view = null;
let ticker = null;
let audio = null;
let wakeLock = null;

const draft = () => state.gym.draft;
const elapsedMinutes = () => Math.max(1, Math.round((Date.now() - draft().startedAt) / 60000));

// ---------- Pantalla encendida y sonido ----------

async function keepScreenOn() {
  if (wakeLock && !wakeLock.released) return;
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null; // algunos iPhone no lo permiten; la app sigue igual
  }
}

function allowScreenOff() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// El sonido tiene que prepararse durante un toque: Safari no deja iniciarlo después.
function prepareSound() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch {
    audio = null;
  }
}

function playBeep() {
  if (!audio) return;
  try {
    [0, 0.3].forEach((delay) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = 880;
      gain.gain.value = 0.25;
      tone.connect(gain).connect(audio.destination);
      tone.start(audio.currentTime + delay);
      tone.stop(audio.currentTime + delay + 0.18);
    });
  } catch {
    audio = null;
  }
}

// ---------- Descanso ----------

function startRest() {
  prepareSound();
  draft().restUntil = Date.now() + draft().rest * 1000;
}

function restLabel(ms) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function paintRest() {
  const bar = document.querySelector('[data-rest-bar]');
  if (!bar) return;
  const until = draft().restUntil;
  const left = until ? until - Date.now() : 0;
  bar.classList.toggle('on', left > 0);
  if (left > 0) bar.querySelector('[data-rest-left]').textContent = restLabel(left);
  if (until && left <= 0) {
    draft().restUntil = null;
    persist();
    if (left > -LATE_ALERT_MS) {
      playBeep();
      navigator.vibrate?.(300);
      showToast('Descanso terminado');
    }
  }
}

function tick() {
  const clock = document.querySelector('[data-elapsed]');
  if (!clock || !draft()) {
    clearInterval(ticker);
    ticker = null;
    allowScreenOff();
    return;
  }
  clock.textContent = fmtDuration(elapsedMinutes() / 60);
  paintRest();
}

// ---------- Pintar ----------

// Lo que se propone en cada serie. Si toca cambiar de peso, las repeticiones de antes ya no sirven.
function setHints(exercise, index, last, advice) {
  const previous = last?.sets[Math.min(index, last.sets.length - 1)];
  const target = exercise.min ? `${exercise.min}-${exercise.max}` : '0';
  const weight = advice?.suggest ?? previous?.w;
  const reps = previous && !(advice?.suggest && advice.kind !== 'hold') ? fmtNumber(previous.r) : '';
  return {
    w: weight ? fmtNumber(weight) : '',
    r: reps,
    rPlaceholder: reps || target,
  };
}

function setRow(exercise, exIndex, set, setIndex, last, advice) {
  const hints = setHints(exercise, setIndex, last, advice);
  const free = exercise.kind === 'free';
  const weightHint = hints.w || (exercise.kind === 'bodyweight' ? '0' : 'kg');
  return `
    <div class="gym-set ${free ? 'no-weight' : ''} ${set.done ? 'done' : ''}">
      <span class="gym-set-num">${setIndex + 1}</span>
      ${free ? '' : `<input data-f="w" data-ex="${exIndex}" data-set="${setIndex}" inputmode="decimal" autocomplete="off" aria-label="Serie ${setIndex + 1}, kilos" placeholder="${weightHint}" value="${esc(set.w)}">`}
      <input data-f="r" data-ex="${exIndex}" data-set="${setIndex}" inputmode="numeric" autocomplete="off" aria-label="Serie ${setIndex + 1}, repeticiones" placeholder="${hints.rPlaceholder}" value="${esc(set.r)}">
      <button class="gym-check" data-check data-ex="${exIndex}" data-set="${setIndex}" aria-label="Serie ${setIndex + 1} hecha" aria-pressed="${set.done}">${icons.check}</button>
    </div>`;
}

function exerciseCard(exercise, i) {
  const last = lastTime(exercise.name);
  const advice = recommend(exercise);
  const canUse = advice?.suggest && advice.kind !== 'hold' && !exercise.log.some((s) => s.w);
  const free = exercise.kind === 'free';
  const target = exercise.min ? `${exercise.sets} × ${exercise.min}-${exercise.max}` : `${exercise.sets} series`;
  return `
    <section class="card gym-ex">
      <div class="gym-ex-head">
        <h2>${esc(exercise.name)}</h2>
        <span class="small muted">${target}</span>
      </div>
      ${exercise.note ? `<div class="small muted">${esc(exercise.note)}</div>` : ''}
      ${last ? `<div class="gym-last small">Última vez (${relativeDayLabel(last.date).toLowerCase()}): ${esc(setsLabel({ kind: exercise.kind, sets: last.sets }))}</div>` : ''}
      ${advice ? `
        <div class="gym-advice" data-kind="${advice.kind}">
          <b>${esc(advice.title)}.</b> ${esc(advice.text)}
          ${canUse ? `<button class="gym-use" data-use="${i}">Usar ${fmtNumber(advice.suggest)} kg en todas</button>` : ''}
        </div>` : ''}
      <div class="gym-set gym-set-head ${free ? 'no-weight' : ''}">
        <span>Serie</span>
        ${free ? '' : '<span>Kg</span>'}
        <span>${free ? 'Reps o seg' : 'Reps'}</span>
        <span></span>
      </div>
      ${exercise.log.map((set, s) => setRow(exercise, i, set, s, last, advice)).join('')}
      <div class="gym-ex-actions">
        <button data-add-set="${i}">+ Serie</button>
        <button data-del-set="${i}" ${exercise.log.length < 2 ? 'disabled' : ''}>− Serie</button>
        <span class="grow"></span>
        <button data-swap="${i}">Cambiar</button>
        <button data-del-ex="${i}">Quitar</button>
      </div>
    </section>`;
}

function exerciseSheet(title, onDone) {
  let kind = KINDS[0].id;
  openSheet(title, `
    <div class="stack">
      <input class="text-input gym-sheet-input" data-name list="gym-names-train" placeholder="Nombre del ejercicio" autocomplete="off">
      <datalist id="gym-names-train">${exerciseNames().map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      <div class="segmented">${KINDS.map((k) => `<button data-kind="${k.id}" class="${k.id === kind ? 'on' : ''}">${k.label}</button>`).join('')}</div>
      <label class="field-row"><span>Grupo muscular</span>
        <select class="date-input" data-muscle>
          <option value="">Sin indicar</option>
          ${MUSCLES.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}
        </select></label>
      <button class="primary-btn" data-ok style="margin:0;width:100%">Listo</button>
    </div>`, (sheet) => {
    sheet.querySelectorAll('[data-kind]').forEach((b) => {
      b.onclick = () => {
        kind = b.dataset.kind;
        sheet.querySelectorAll('[data-kind]').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    sheet.querySelector('[data-ok]').onclick = () => {
      const name = sheet.querySelector('[data-name]').value;
      if (!name.trim()) return;
      closeSheet();
      onDone(draftExerciseNamed(name, kind, sheet.querySelector('[data-muscle]').value));
    };
  });
}

function finishSheet() {
  const { exercises, missing } = draftCheck();
  if (!exercises.length) {
    showToast('Apunta al menos una serie');
    return;
  }
  if (missing.length) {
    showToast(`Falta el peso en: ${esc(missing.join(', '))}`, { duration: 3000 });
    return;
  }
  const planned = draft().exercises.reduce((total, e) => total + e.log.length, 0);
  const logged = exercises.reduce((total, e) => total + e.sets.length, 0);
  const minutes = elapsedMinutes();
  openSheet('Terminar entrenamiento', `
    <div class="stack">
      ${planned > logged ? `<div class="small muted">Hay ${planned - logged} serie${planned - logged === 1 ? '' : 's'} sin apuntar: no se guardará${planned - logged === 1 ? '' : 'n'}.</div>` : ''}
      <label class="field-row"><span>Día</span>
        <input type="date" class="date-input" data-date value="${draft().date}" max="${todayKey()}"></label>
      <label class="field-row"><span>Minutos</span>
        <input class="num-input" data-minutes inputmode="numeric" maxlength="3" value="${minutes <= MAX_MINUTES ? minutes : ''}"></label>
      <button class="primary-btn" data-ok style="margin:0;width:100%">Guardar entrenamiento</button>
      <button class="gym-action" data-cancel style="width:100%">Seguir entrenando</button>
    </div>`, (sheet) => {
    sheet.querySelector('[data-cancel]').onclick = closeSheet;
    sheet.querySelector('[data-ok]').onclick = () => {
      const date = sheet.querySelector('[data-date]').value || todayKey();
      const typed = Number(sheet.querySelector('[data-minutes]').value);
      closeSheet();
      const session = finishDraft(date, typed > 0 ? Math.round(typed) : null);
      navigate(`#/body/gym/session/${session.id}`);
    };
  });
}

function onInput(e) {
  const { f, ex, set } = e.target.dataset;
  if (!f) return;
  const exercise = draft().exercises[ex];
  const index = Number(set);
  const value = f === 'w' ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value.replace(/\D/g, '');
  e.target.value = value;
  const entry = exercise.log[index];
  const previous = entry[f];
  entry[f] = value;
  // El peso pasa a las series siguientes que estén vacías o llevaran el mismo.
  if (f === 'w' && value) {
    exercise.log.slice(index + 1).forEach((next, offset) => {
      if (next.w !== '' && next.w !== previous) return;
      next.w = value;
      const input = view.querySelector(`[data-f="w"][data-ex="${ex}"][data-set="${index + 1 + offset}"]`);
      if (input) input.value = value;
    });
  }
  persist();
}

function toggleSet(exIndex, setIndex) {
  const exercise = draft().exercises[exIndex];
  const entry = exercise.log[setIndex];
  if (entry.done) {
    entry.done = false;
    return true;
  }
  const hints = setHints(exercise, setIndex, lastTime(exercise.name), recommend(exercise));
  entry.w ||= hints.w;
  entry.r ||= hints.r;
  const focusField = (field) => {
    view.querySelector(`[data-f="${field}"][data-ex="${exIndex}"][data-set="${setIndex}"]`).focus();
    return false;
  };
  if (exercise.kind === 'weight' && !entry.w) return focusField('w');
  if (!entry.r) return focusField('r');
  entry.done = true;
  startRest();
  return true;
}

function draw() {
  const root = view;
  if (!draft()) {
    root.innerHTML = '<div class="card empty small">No hay ningún entrenamiento en curso.</div>';
    return;
  }
  const y = window.scrollY;
  const { name, exercises } = draft();
  root.innerHTML = `
    <header class="nav-header">
      <a class="icon-btn" href="${GYM_ROUTE}" aria-label="Volver">${icons.back}</a>
      <h1>${esc(name)}<span class="gym-elapsed small muted" data-elapsed>${fmtDuration(elapsedMinutes() / 60)}</span></h1>
      <button class="icon-btn" data-finish aria-label="Terminar">${icons.check}</button>
    </header>

    <div class="gym-train stack">
      ${exercises.map(exerciseCard).join('')}
      <button class="gym-action" data-add-ex style="width:100%">${icons.plus}<span>Añadir ejercicio</span></button>
      <button class="primary-btn" data-finish style="margin:0;width:100%">Terminar entrenamiento</button>
      <button class="gym-discard small" data-discard>Descartar entrenamiento</button>
    </div>

    <div class="gym-rest-bar" data-rest-bar>
      <span class="grow"><span class="small muted">Descanso</span> <b data-rest-left></b></span>
      <button data-rest-add="-${REST_STEP}">−${REST_STEP}</button>
      <button data-rest-add="${REST_STEP}">+${REST_STEP}</button>
      <button data-rest-skip>Saltar</button>
    </div>`;
  window.scrollTo(0, y);
  paintRest();

  const change = (fn) => {
    fn();
    persist();
    draw();
  };
  const box = root.querySelector('.gym-train');
  box.addEventListener('input', onInput);
  root.querySelectorAll('[data-check]').forEach((b) => {
    b.onclick = () => {
      if (toggleSet(Number(b.dataset.ex), Number(b.dataset.set))) change(() => {});
    };
  });
  root.querySelectorAll('[data-use]').forEach((b) => {
    b.onclick = () => change(() => {
      const exercise = draft().exercises[b.dataset.use];
      const weight = fmtNumber(recommend(exercise).suggest);
      exercise.log.forEach((s) => { s.w = weight; });
    });
  });
  root.querySelectorAll('[data-add-set]').forEach((b) => {
    b.onclick = () => change(() => {
      const { log } = draft().exercises[b.dataset.addSet];
      log.push({ w: log.at(-1)?.w || '', r: '', done: false });
    });
  });
  root.querySelectorAll('[data-del-set]').forEach((b) => {
    b.onclick = () => change(() => { draft().exercises[b.dataset.delSet].log.pop(); });
  });
  root.querySelectorAll('[data-swap]').forEach((b) => {
    b.onclick = () => exerciseSheet('Cambiar solo hoy', (exercise) => change(() => {
      draft().exercises[b.dataset.swap] = exercise;
    }));
  });
  root.querySelectorAll('[data-del-ex]').forEach((b) => {
    b.onclick = () => confirmSheet('Quitar ejercicio', 'Solo se quita de este entrenamiento, no de la rutina.', 'Quitar', () => change(() => {
      draft().exercises.splice(Number(b.dataset.delEx), 1);
    }));
  });
  root.querySelector('[data-add-ex]').onclick = () => exerciseSheet('Añadir ejercicio', (exercise) => change(() => {
    draft().exercises.push(exercise);
  }));
  root.querySelectorAll('[data-finish]').forEach((b) => { b.onclick = finishSheet; });
  root.querySelector('[data-discard]').onclick = () => confirmSheet(
    'Descartar entrenamiento',
    'Se perderá todo lo apuntado en esta sesión.',
    'Descartar',
    () => {
      discardDraft();
      navigate(GYM_ROUTE);
    },
  );
  root.querySelectorAll('[data-rest-add]').forEach((b) => {
    b.onclick = () => {
      draft().restUntil += Number(b.dataset.restAdd) * 1000;
      persist();
      paintRest();
    };
  });
  root.querySelector('[data-rest-skip]').onclick = () => {
    draft().restUntil = null;
    persist();
    paintRest();
  };
}

export function renderGymTrain(root) {
  view = root;
  draw();
  if (draft()) {
    keepScreenOn();
    ticker ||= setInterval(tick, 1000);
  }
}
