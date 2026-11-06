// Detalle de un hábito: rachas, calendario mensual editable y acciones.
import { deleteHabit, getCategory, getCount, getHabit, setCount, updateHabit } from '../store.js';
import {
  bestStreak, currentStreak, dayTarget, doneDaysInMonth, goalText, isDayDone, nextCount, streakUnit,
} from '../habit-logic.js';
import {
  DAY_NAMES_SHORT, addDays, fromKey, monthGrid, monthLabel, startOfWeek, todayKey,
} from '../dates.js';
import { icons } from '../icons.js';
import { confirmSheet, esc, navigate } from '../ui.js';

let viewYear;
let viewMonth;

function goBack(habit) {
  if (history.length > 1) history.back();
  else location.replace(habit?.archived ? '#/habits/archived' : '#/habits');
}

function calendarDay(habit, key, today) {
  if (!key) return '<span></span>';
  const count = getCount(habit.id, key);
  const done = isDayDone(habit, key);
  const partial = !done && count > 0;
  const classes = ['cal-day', done && 'done', partial && 'partial', key === today && 'today'].filter(Boolean).join(' ');
  const label = dayTarget(habit) > 1 ? ` (${count}/${dayTarget(habit)})` : '';
  return `<button class="${classes}" data-day="${key}" ${key > today ? 'disabled' : ''}
    aria-label="${key}${label}">${fromKey(key).getDate()}</button>`;
}

const MONTH_INITIALS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Mapa del último año: una columna por semana (lunes arriba) y un cuadro por día.
function yearHeatmap(habit, today) {
  const start = startOfWeek(addDays(today, -364));
  const max = dayTarget(habit);
  const columns = [];
  let total = 0;
  for (let week = start; week <= today; week = addDays(week, 7)) {
    const cells = [];
    let label = '';
    for (let i = 0; i < 7; i++) {
      const key = addDays(week, i);
      if (key > today) {
        cells.push('<span class="hm-cell future"></span>');
        continue;
      }
      if (key.endsWith('-01') || (week === start && i === 0)) label = MONTH_INITIALS[fromKey(key).getMonth()];
      const count = Math.min(getCount(habit.id, key), max);
      if (count >= max) total++;
      const level = count ? Math.max(1, Math.round((count / max) * 4)) : 0;
      cells.push(`<span class="hm-cell l${level}" title="${key}: ${count}/${max}"></span>`);
    }
    columns.push(`<div class="hm-col"><span class="hm-month">${label}</span>${cells.join('')}</div>`);
  }
  return `
    <div class="card">
      <h3 style="margin:0 0 4px;font-size:20px">Último año</h3>
      <div class="small muted">${total} día${total === 1 ? '' : 's'} completado${total === 1 ? '' : 's'}</div>
      <div class="heatmap" data-heatmap>${columns.join('')}</div>
      <div class="hm-legend small muted">Menos
        ${[0, 1, 2, 3, 4].map((l) => `<span class="hm-cell l${l}"></span>`).join('')} Más</div>
    </div>`;
}

export function renderHabitDetail(root, { id }, entering) {
  const habit = getHabit(id);
  if (!habit) {
    location.replace('#/habits');
    return;
  }
  const now = new Date();
  if (entering || viewYear === undefined) {
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
  }
  const today = todayKey();
  const streak = currentStreak(habit);
  const best = bestStreak(habit);
  const thisMonth = doneDaysInMonth(habit, now.getFullYear(), now.getMonth());
  const category = habit.categoryId && getCategory(habit.categoryId);
  const atCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  root.innerHTML = `
    <header class="nav-header">
      <button class="icon-btn" data-back aria-label="Volver">${icons.back}</button>
      <h1>${esc(habit.name)}</h1>
      <span class="icon-btn emoji">${esc(habit.emoji)}</span>
    </header>

    <div class="stack">
      <div class="stat-row">
        <div class="stat"><div class="ico">🔥</div><div class="val">${streak} ${streakUnit(habit, streak)}</div><div class="lbl">Racha actual</div></div>
        <div class="stat"><div class="ico">📅</div><div class="val">${thisMonth}</div><div class="lbl">Días este mes</div></div>
        <div class="stat"><div class="ico">🏆</div><div class="val">${best} ${streakUnit(habit, best)}</div><div class="lbl">Mejor racha</div></div>
      </div>

      <div class="card row-card">
        <span class="bubble">🎯</span>
        <span class="grow"><span class="small muted" style="display:block">Objetivo</span>${goalText(habit)}</span>
      </div>

      ${category ? `
      <div class="card row-card">
        <span class="bubble">${esc(category.emoji)}</span>
        <span class="grow"><span class="small muted" style="display:block">Categoría</span>${esc(category.name)}</span>
      </div>` : ''}

      <div class="card calendar">
        <h3>Resumen mensual</h3>
        <div class="small muted">Toca un día para cambiar su estado.</div>
        <div class="cal-head">
          <button data-month="-1" aria-label="Mes anterior">${icons.chevronLeft}</button>
          <span>${monthLabel(viewYear, viewMonth)}</span>
          <button data-month="1" aria-label="Mes siguiente" ${atCurrentMonth ? 'disabled' : ''}>${icons.chevronRight}</button>
        </div>
        <div class="cal-grid">
          ${DAY_NAMES_SHORT.map((d) => `<span class="wd">${d}</span>`).join('')}
          ${monthGrid(viewYear, viewMonth).map((k) => calendarDay(habit, k, today)).join('')}
        </div>
      </div>

      ${yearHeatmap(habit, today)}

      <div class="action-row">
        ${habit.archived ? `
          <button class="action-btn" data-restore><span class="ico">♻️</span>Restaurar</button>
          <button class="action-btn danger" data-delete><span class="ico">🗑️</span>Eliminar</button>
        ` : `
          <button class="action-btn" data-edit><span class="ico">✏️</span>Editar</button>
          <button class="action-btn" data-archive><span class="ico">🗄️</span>Archivar</button>
        `}
      </div>
    </div>`;

  // El mapa empieza mostrando las semanas más recientes.
  const heatmap = root.querySelector('[data-heatmap]');
  heatmap.scrollLeft = heatmap.scrollWidth;

  root.querySelector('[data-back]').onclick = () => goBack(habit);

  root.querySelectorAll('[data-month]').forEach((b) => {
    b.onclick = () => {
      const d = new Date(viewYear, viewMonth + Number(b.dataset.month), 1);
      viewYear = d.getFullYear();
      viewMonth = d.getMonth();
      renderHabitDetail(root, { id }, false);
    };
  });

  root.querySelectorAll('[data-day]').forEach((b) => {
    b.onclick = () => setCount(habit.id, b.dataset.day, nextCount(habit, b.dataset.day));
  });

  root.querySelector('[data-edit]')?.addEventListener('click', () => navigate(`#/habits/${id}/edit`));
  root.querySelector('[data-archive]')?.addEventListener('click', () => {
    updateHabit(id, { archived: true });
    location.replace('#/habits');
  });
  root.querySelector('[data-restore]')?.addEventListener('click', () => updateHabit(id, { archived: false }));
  root.querySelector('[data-delete]')?.addEventListener('click', () => {
    confirmSheet('Eliminar hábito', `Se borrará "${habit.name}" y todo su historial. No se puede deshacer.`, 'Eliminar', () => {
      deleteHabit(id);
      location.replace('#/habits/archived');
    });
  });
}
