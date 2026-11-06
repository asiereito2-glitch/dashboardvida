// Trabajo: apuntar turnos, ver horas y sueldo aproximado, y guardar turnos habituales.
import { save, state } from '../store.js';
import {
  deleteShift, deleteTemplate, endsNextDay, saveShift, saveTemplate, setRate, shiftHours, shiftPay,
  shiftsByDay, workTotals,
} from '../work.js';
import { parseNum } from '../goals.js';
import { fmtDuration, relativeDayLabel, todayKey } from '../dates.js';
import { icons } from '../icons.js';
import {
  closeSheet, confirmSheet, esc, openSheet, showToast,
} from '../ui.js';

const MAX_DAYS = 14;

let form = null;
let notice = null;

const hoursText = (hours) => (hours ? fmtDuration(hours) : '0h');
const rangeText = (s) => `${s.start} – ${s.end}${endsNextDay(s) ? ' (+1 día)' : ''}`;

function moneyText(n) {
  if (state.settings.hideMoney) return '••••';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

function totalBox(label, total) {
  return `<div class="stat"><div class="lbl">${label}</div><div class="val">${hoursText(total.hours)}</div><div class="work-money">${moneyText(total.pay)}</div></div>`;
}

function shiftFields(values, withDate) {
  return `
    ${withDate ? `<label class="field-row"><span>Día</span>
      <input type="date" class="date-input" data-field="date" value="${values.date}"></label>` : ''}
    <label class="field-row"><span>Desde</span>
      <input type="time" class="date-input" data-field="start" value="${values.start}"></label>
    <label class="field-row"><span>Hasta</span>
      <input type="time" class="date-input" data-field="end" value="${values.end}"></label>`;
}

function shiftSheet(shift) {
  const values = { date: shift.date, start: shift.start, end: shift.end };
  openSheet('Editar turno', `
    <div class="stack">
      ${shiftFields(values, true)}
      <div class="notice error" data-error hidden></div>
      <button class="primary-btn" data-ok style="margin:0;width:100%">Guardar</button>
      <button class="gym-action danger" data-remove style="width:100%">Borrar turno</button>
    </div>`, (sheet) => {
    sheet.addEventListener('input', (e) => {
      if (e.target.dataset.field) values[e.target.dataset.field] = e.target.value;
    });
    sheet.querySelector('[data-ok]').onclick = () => {
      const error = saveShift(shift.id, values);
      const box = sheet.querySelector('[data-error]');
      box.textContent = error;
      box.hidden = !error;
      if (!error) closeSheet();
    };
    sheet.querySelector('[data-remove]').onclick = () => {
      closeSheet();
      deleteShift(shift.id);
    };
  });
}

function dayCard({ date, shifts }) {
  const hours = shifts.reduce((sum, s) => sum + shiftHours(s), 0);
  const pay = shifts.reduce((sum, s) => sum + shiftPay(s), 0);
  return `
    <div class="card work-day">
      <div class="work-day-head">
        <b>${relativeDayLabel(date)}</b>
        <span class="small muted">${hoursText(hours)} · ${moneyText(pay)}</span>
      </div>
      ${shifts.map((s) => `
        <button class="work-shift" data-shift="${s.id}">
          <span class="grow">${rangeText(s)}</span>
          <span class="small muted">${hoursText(shiftHours(s))}</span>
        </button>`).join('')}
    </div>`;
}

export function renderWork(root, _params, entering) {
  if (entering || !form) {
    form = { date: todayKey(), start: '', end: '' };
    notice = null;
  }
  const totals = workTotals();
  const days = shiftsByDay();
  const { templates, rate } = state.work;
  root.innerHTML = `
    <header class="page-header">
      <h1 class="page-title">Trabajo</h1>
      <button class="eye-btn" data-eye aria-label="${state.settings.hideMoney ? 'Mostrar importes' : 'Ocultar importes'}">${state.settings.hideMoney ? icons.eyeOff : icons.eye}</button>
    </header>

    <div class="stat-row">
      ${totalBox('Hoy', totals.today)}
      ${totalBox('Esta semana', totals.week)}
      ${totalBox('Este mes', totals.month)}
    </div>
    <div class="small muted work-note">${rate ? 'Sueldo neto aproximado.' : 'Pon tu precio por hora en Turnos para ver el sueldo.'}</div>

    ${notice ? `<div class="notice ${notice.error ? 'error' : ''}" style="margin-top:12px">${esc(notice.text)}</div>` : ''}

    <div class="card stack work-form" style="margin-top:12px">
      <label class="field-row"><span>Día</span>
        <input type="date" class="date-input" data-field="date" value="${form.date}"></label>
      ${templates.length ? `
        <div class="work-templates">
          ${templates.map((t) => `<button data-template="${t.id}">${esc(t.name)}</button>`).join('')}
        </div>` : ''}
      ${shiftFields(form, false)}
      <button class="primary-btn" data-add style="margin:0;width:100%">Añadir turno</button>
    </div>

    ${days.length ? `
      <div class="section-title">Últimos días</div>
      <div class="stack">${days.slice(0, MAX_DAYS).map(dayCard).join('')}</div>` : ''}`;

  const add = (shift, done) => {
    const error = saveShift(null, shift);
    notice = error ? { text: error, error: true } : { text: `Turno añadido: ${rangeText(shift)}.` };
    if (!error) done?.();
    renderWork(root);
  };
  root.querySelector('.work-form').addEventListener('input', (e) => {
    if (e.target.dataset.field) form[e.target.dataset.field] = e.target.value;
  });
  root.querySelector('[data-add]').onclick = () => add(form, () => { form = { ...form, start: '', end: '' }; });
  root.querySelectorAll('[data-template]').forEach((b) => {
    b.onclick = () => {
      const { start, end } = templates.find((t) => t.id === b.dataset.template);
      add({ date: form.date, start, end });
    };
  });
  root.querySelectorAll('[data-shift]').forEach((b) => {
    b.onclick = () => shiftSheet(state.work.shifts.find((s) => s.id === b.dataset.shift));
  });
  root.querySelector('[data-eye]').onclick = () => {
    state.settings.hideMoney = !state.settings.hideMoney;
    save();
  };
}

// ---------- Turnos guardados y precio ----------

function templateSheet(template) {
  const values = template ? { ...template } : { name: '', start: '', end: '' };
  openSheet(template ? 'Editar turno guardado' : 'Nuevo turno guardado', `
    <div class="stack">
      <input class="text-input gym-sheet-input" data-field="name" placeholder="Nombre (ej.: Mañana)" value="${esc(values.name)}" autocomplete="off">
      ${shiftFields(values, false)}
      <div class="notice error" data-error hidden></div>
      <button class="primary-btn" data-ok style="margin:0;width:100%">Guardar</button>
      ${template ? '<button class="gym-action danger" data-remove style="width:100%">Borrar</button>' : ''}
    </div>`, (sheet) => {
    sheet.addEventListener('input', (e) => {
      if (e.target.dataset.field) values[e.target.dataset.field] = e.target.value;
    });
    sheet.querySelector('[data-ok]').onclick = () => {
      const name = values.name.trim();
      const error = (!name && 'Ponle un nombre.')
        || ((!values.start || !values.end) && 'Elige las dos horas.')
        || (values.start === values.end && 'La hora de inicio y la de fin son iguales.');
      const box = sheet.querySelector('[data-error]');
      box.textContent = error || '';
      box.hidden = !error;
      if (error) return;
      closeSheet();
      saveTemplate(template?.id, { name, start: values.start, end: values.end });
    };
    sheet.querySelector('[data-remove]')?.addEventListener('click', () => {
      closeSheet();
      confirmSheet('Borrar turno guardado', 'Los turnos que ya apuntaste no cambian.', 'Borrar', () => deleteTemplate(template.id));
    });
  });
}

export function renderWorkShifts(root, _params, entering) {
  if (entering) notice = null;
  const { templates, rate } = state.work;
  root.innerHTML = `
    <header class="page-header"><h1 class="page-title">Turnos</h1></header>

    ${notice ? `<div class="notice ${notice.error ? 'error' : ''}" style="margin-bottom:12px">${esc(notice.text)}</div>` : ''}

    <div class="card stack">
      <label class="field-row"><span>Precio neto por hora</span>
        <span class="work-rate"><input class="num-input" data-rate inputmode="decimal" placeholder="12,50" value="${rate ? String(rate).replace('.', ',') : ''}"> €</span></label>
      <div class="small muted">Si lo cambias, solo afecta a los turnos nuevos.</div>
    </div>

    <div class="section-title">Turnos guardados</div>
    ${templates.length ? `
      <div class="card gym-session-list">
        ${templates.map((t) => `
          <button class="gym-session-row book-log-row" data-template="${t.id}">
            <span class="grow"><span class="gym-session-name">${esc(t.name)}</span>
            <span class="small muted">${rangeText(t)}</span></span>
            <span class="small muted">${hoursText(shiftHours(t))}</span>
          </button>`).join('')}
      </div>` : '<div class="card empty small">Guarda tus horarios habituales para añadirlos con un toque.</div>'}
    <button class="gym-action" data-new style="width:100%;margin-top:12px">${icons.plus}<span>Nuevo turno guardado</span></button>`;

  root.querySelector('[data-rate]').onchange = (e) => {
    const value = parseNum(e.target.value);
    if (e.target.value.trim() && !(value > 0)) {
      notice = { text: 'Revisa el precio por hora.', error: true };
      renderWorkShifts(root);
      return;
    }
    notice = null;
    setRate(value);
  };
  root.querySelectorAll('[data-template]').forEach((b) => {
    b.onclick = () => templateSheet(templates.find((t) => t.id === b.dataset.template));
  });
  root.querySelector('[data-new]').onclick = () => templateSheet(null);
}
