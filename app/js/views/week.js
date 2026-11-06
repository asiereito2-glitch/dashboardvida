// Resumen semanal: tu semana entera comparada con la anterior.
import { state } from '../store.js';
import { fmtNumber } from '../goals.js';
import {
  addDays, fmtDuration, relativeDayLabel, startOfWeek, todayKey,
} from '../dates.js';
import { icons } from '../icons.js';
import { esc } from '../ui.js';
import { weekSummary } from '../week-summary.js';

let offset = -1; // semanas respecto a la actual: -1 es la pasada, la última completa

const round1 = (n) => Math.round(n * 10) / 10;

export function moneyText(n) {
  if (state.settings.hideMoney) return '••••';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n);
}

function weekTitle(start) {
  if (offset === 0) return 'Esta semana';
  if (offset === -1) return 'La semana pasada';
  return `${relativeDayLabel(start)} – ${relativeDayLabel(addDays(start, 6))}`;
}

// Diferencia con la semana anterior. `goodWhenUp` indica si subir es bueno.
function delta(now, before, goodWhenUp, format) {
  if (now === null || before === null) return '';
  const diff = now - before;
  if (Math.abs(diff) < 0.05) return '<span class="wk-delta">= que la anterior</span>';
  const good = goodWhenUp ? diff > 0 : diff < 0;
  return `<span class="wk-delta ${good ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${format(Math.abs(diff))}</span>`;
}

function tile(emoji, label, value, comparison) {
  return `
    <div class="card week-tile">
      <span class="week-tile-top">${emoji} ${label}</span>
      <b>${value}</b>
      ${comparison}
    </div>`;
}

function headline(week, before) {
  if (week.habits.pct === null) return 'Crea hábitos para ver cómo te ha ido cada semana.';
  const text = `Has cumplido el ${week.habits.pct}% de tus hábitos`;
  if (before.habits.pct === null || before.habits.pct === week.habits.pct) return `${text}.`;
  const diff = week.habits.pct - before.habits.pct;
  return `${text}, ${Math.abs(diff)} puntos ${diff > 0 ? 'más' : 'menos'} que la semana anterior.`;
}

function tiles(week, before) {
  const list = [];
  if (week.habits.pct !== null) {
    list.push(tile('✅', 'Hábitos', `${week.habits.pct}%`, delta(week.habits.pct, before.habits.pct, true, (n) => `${n} pts`)));
  }
  list.push(tile('😊', 'Ánimo medio', week.mood === null ? '–' : fmtNumber(round1(week.mood)),
    delta(week.mood, before.mood, true, (n) => fmtNumber(round1(n)))));
  if (week.money) {
    list.push(tile('💸', 'Gastado', moneyText(week.money.spent),
      state.settings.hideMoney ? '' : delta(week.money.spent, before.money?.spent ?? null, false, moneyText)));
  }
  list.push(tile('😴', 'Sueño medio', week.sleep === null ? '–' : fmtDuration(week.sleep),
    delta(week.sleep, before.sleep, true, fmtDuration)));
  if (week.nights) {
    list.push(tile('🌟', 'Noches buenas', `${week.goodNights} de ${week.nights}`,
      delta(week.goodNights, before.nights ? before.goodNights : null, true, (n) => n)));
  }
  if (week.gym) {
    list.push(tile('🏋️', 'Entrenamientos', week.gym.count, delta(week.gym.count, before.gym?.count ?? null, true, (n) => n)));
    list.push(tile('💪', 'Kilos levantados', `${fmtNumber(Math.round(week.gym.kilos))} kg`,
      delta(week.gym.kilos, before.gym?.kilos ?? null, true, (n) => `${fmtNumber(Math.round(n))} kg`)));
  }
  if (week.pages !== null) {
    list.push(tile('📖', 'Páginas leídas', fmtNumber(week.pages), delta(week.pages, before.pages, true, fmtNumber)));
  }
  if (week.weight !== null) {
    const change = week.weightChange === null ? ''
      : `<span class="wk-delta">${week.weightChange > 0 ? '▲' : week.weightChange < 0 ? '▼' : '='} ${fmtNumber(round1(Math.abs(week.weightChange)))} kg</span>`;
    list.push(tile('⚖️', 'Peso', `${fmtNumber(round1(week.weight))} kg`, change));
  }
  if (state.settings.showTodos) {
    list.push(tile('📝', 'Tareas hechas', week.todosDone, delta(week.todosDone, before.todosDone, true, (n) => n)));
  }
  if (week.xp !== null) {
    list.push(tile('⭐', 'Experiencia', `${week.xp} XP`, delta(week.xp, before.xp, true, (n) => `${n} XP`)));
  }
  return list.join('');
}

function habitsCard(week) {
  const { best, worst } = week.habits;
  if (!best) return '';
  const row = (title, r) => `
    <div class="mh-row">
      <span class="emoji">${esc(r.habit.emoji)}</span>
      <div class="grow"><div class="small muted">${title}</div><div>${esc(r.habit.name)}</div></div>
      <b>${r.pct}%</b>
    </div>`;
  return `
    <div class="card stack" style="margin-top:12px">
      ${row('Tu mejor hábito', best)}
      ${worst ? row('A mejorar', worst) : ''}
    </div>`;
}

function goalsCard(week) {
  if (!week.goalsDone.length) return '';
  return `
    <div class="card stack" style="margin-top:12px">
      ${week.goalsDone.map((g) => `
        <div class="mh-row">
          <span class="emoji">🏆</span>
          <div class="grow"><div class="small muted">Meta cumplida</div><div>${esc(g.emoji)} ${esc(g.name)}</div></div>
        </div>`).join('')}
    </div>`;
}

export function renderWeek(root, params, entering) {
  const today = todayKey();
  if (entering) offset = -1;
  const start = addDays(startOfWeek(today), offset * 7);
  const week = weekSummary(start, today);
  const before = weekSummary(addDays(start, -7), today);

  root.innerHTML = `
    <header class="page-header"><h1 class="page-title">Resumen</h1></header>

    <div class="month-nav">
      <button data-week="-1" aria-label="Semana anterior">${icons.chevronLeft}</button>
      <span>${weekTitle(start)}</span>
      <button data-week="1" aria-label="Semana siguiente" ${offset >= 0 ? 'disabled' : ''}>${icons.chevronRight}</button>
    </div>

    <div class="card week-headline">${headline(week, before)}${offset === 0 ? ' <span class="muted">La semana aún no ha terminado.</span>' : ''}</div>

    <div class="week-tiles">${tiles(week, before)}</div>
    ${habitsCard(week)}
    ${goalsCard(week)}`;

  root.querySelectorAll('[data-week]').forEach((b) => {
    b.onclick = () => {
      offset = Math.min(0, offset + Number(b.dataset.week));
      renderWeek(root, params, false);
    };
  });
}
