// Gimnasio: rutinas, historial y detalle de un entrenamiento.
import { activeHabits, state } from '../store.js';
import {
  deleteSession, getSession, lastRoutineSession, linkedHabit, muscleShares, setLinkedHabit,
  previousSession, sessionRecords, sessionSets, sessionVolume, sessionsNewestFirst, sessionsThisWeek,
  setsLabel, startDraft,
} from '../gym.js';
import { fmtNumber } from '../goals.js';
import { fmtDuration, onDayLabel, relativeDayLabel } from '../dates.js';
import { icons } from '../icons.js';
import { bodyMap, muscleRows } from './body-map.js';
import {
  closeSheet, confirmSheet, esc, navigate, openSheet,
} from '../ui.js';

const MAX_RECENT = 6;
const TRAIN_ROUTE = '#/body/gym/train';
const GYM_ROUTE = '#/body/gym';

export const fmtKg = (n) => `${fmtNumber(Math.round(n))} kg`;

function statBox(emoji, value, label) {
  return `<div class="stat"><div class="ico">${emoji}</div><div class="val">${value}</div><div class="lbl">${label}</div></div>`;
}

function begin(routineId) {
  const go = () => {
    startDraft(routineId);
    navigate(TRAIN_ROUTE);
  };
  if (!state.gym.draft) {
    go();
    return;
  }
  confirmSheet(
    'Entrenamiento sin terminar',
    `Tienes «${state.gym.draft.name}» en curso. Si empiezas otro, se perderá lo apuntado.`,
    'Descartar y empezar',
    go,
  );
}

function habitSheet() {
  const current = state.gym.habitId || '';
  const options = [{ id: '', label: 'Ninguno' }, ...activeHabits().map((h) => ({ id: h.id, label: `${h.emoji} ${h.name}` }))];
  openSheet('Hábito de gimnasio', `
    <p class="small muted" style="text-align:center;margin:0 0 14px">Se marcará solo el día que termines un entrenamiento.</p>
    <div class="option-list">
      ${options.map((o) => `<button data-habit="${o.id}" class="${o.id === current ? 'on' : ''}"><span class="grow">${esc(o.label)}</span></button>`).join('')}
    </div>`, (sheet) => {
    sheet.querySelectorAll('[data-habit]').forEach((b) => {
      b.onclick = () => {
        closeSheet();
        setLinkedHabit(b.dataset.habit || null);
      };
    });
  });
}

function routineCard(routine) {
  const last = lastRoutineSession(routine.name);
  const count = routine.exercises.length;
  return `
    <div class="card gym-routine">
      <a class="grow" href="#/body/gym/routine/${routine.id}">
        <div class="gym-routine-name">${esc(routine.name)}</div>
        <div class="small muted">${count} ejercicio${count === 1 ? '' : 's'} · ${last ? `última vez ${onDayLabel(last.date)}` : 'sin estrenar'}</div>
      </a>
      <button class="gym-start" data-start="${routine.id}">Empezar</button>
    </div>`;
}

export function sessionRow(session) {
  const volume = sessionVolume(session);
  return `
    <a class="gym-session-row" href="#/body/gym/session/${session.id}">
      <span class="grow">
        <span class="gym-session-name">${esc(session.routineName)}</span>
        <span class="small muted">${relativeDayLabel(session.date)}</span>
      </span>
      <span class="small muted">${volume ? fmtKg(volume) : `${sessionSets(session)} series`}</span>
    </a>`;
}

export function renderGym(root) {
  const { routines, draft, weeklyGoal } = state.gym;
  const recent = sessionsNewestFirst().slice(0, MAX_RECENT);
  root.innerHTML = `
    <header class="page-header"><h1 class="page-title">Gimnasio</h1></header>

    ${draft ? `
      <div class="card gym-live">
        <div class="grow">
          <div class="small muted">En curso</div>
          <div class="gym-routine-name">${esc(draft.name)}</div>
        </div>
        <a class="gym-start" href="${TRAIN_ROUTE}">Seguir</a>
      </div>` : ''}

    ${routines.length ? `
      <div class="small muted gym-week">Esta semana: <b>${sessionsThisWeek()} de ${weeklyGoal}</b> entrenamientos</div>
      <div class="stack">${routines.map(routineCard).join('')}</div>` : `
      <div class="card empty small">
        <div class="big">🏋️</div>
        Crea tu primera rutina para empezar a entrenar.
      </div>`}

    <a class="card gym-progress-link" href="#/body/gym/progress">
      ${icons.stats}<span class="grow">Ver mi progreso</span>${icons.chevronRight}
    </a>
    ${activeHabits().length ? `
      <button class="card gym-progress-link" data-link-habit>
        ${icons.check}
        <span class="grow">Marcar hábito al terminar<span class="small muted gym-link-value">${linkedHabit() ? esc(`${linkedHabit().emoji} ${linkedHabit().name}`) : 'Sin vincular'}</span></span>
        ${icons.chevronRight}
      </button>` : ''}

    <div class="gym-actions">
      <a class="gym-action" href="#/body/gym/routine/new">${icons.plus}<span>Nueva rutina</span></a>
      <button class="gym-action" data-free>${icons.sparkle}<span>Entreno libre</span></button>
    </div>

    ${recent.length ? `
      <div class="section-title">Últimos entrenamientos</div>
      <div class="card gym-session-list">${recent.map(sessionRow).join('')}</div>` : ''}`;

  root.querySelectorAll('[data-start]').forEach((b) => {
    b.onclick = () => begin(b.dataset.start);
  });
  root.querySelector('[data-free]').onclick = () => begin(null);
  root.querySelector('[data-link-habit]')?.addEventListener('click', habitSheet);
}

// ---------- Mapa muscular ----------

export function muscleCard(sessions) {
  const { shares, unassigned, total } = muscleShares(sessions);
  if (!total) {
    return `<div class="card empty small">${unassigned
      ? 'Indica el grupo muscular de tus ejercicios en cada rutina para ver aquí el mapa.'
      : 'Sin entrenamientos en este periodo.'}</div>`;
  }
  return `
    <div class="card">
      ${bodyMap(shares)}
      <div class="stack body-rows">${muscleRows(shares)}</div>
      <div class="small muted body-note">Porcentaje de series por grupo muscular.${unassigned ? ` ${unassigned} ${unassigned === 1 ? 'serie' : 'series'} sin grupo no cuenta${unassigned === 1 ? '' : 'n'}.` : ''}</div>
    </div>`;
}

// ---------- Detalle de un entrenamiento ----------

function comparison(session, previous) {
  if (!previous) return '';
  const diff = sessionVolume(session) - sessionVolume(previous);
  if (!sessionVolume(previous) || !sessionVolume(session)) return '';
  const text = diff === 0
    ? 'Los mismos kilos que la vez anterior.'
    : `${fmtKg(Math.abs(diff))} ${diff > 0 ? 'más' : 'menos'} que la vez anterior (${relativeDayLabel(previous.date).toLowerCase()}).`;
  return `<div class="notice" style="margin-top:12px">${diff >= 0 ? '💪' : '📉'} ${text}</div>`;
}

export function renderGymSession(root, { id }) {
  const session = getSession(id);
  if (!session) {
    root.innerHTML = '<div class="card empty small">Este entrenamiento ya no existe.</div>';
    return;
  }
  const records = sessionRecords(session);
  root.innerHTML = `
    <header class="nav-header">
      <a class="icon-btn" href="${GYM_ROUTE}" aria-label="Volver">${icons.back}</a>
      <h1>${esc(session.routineName)}</h1>
      <button class="icon-btn danger" data-delete aria-label="Borrar entrenamiento">${icons.trash}</button>
    </header>
    <div class="small muted gym-session-date">${relativeDayLabel(session.date)}</div>

    <div class="stat-row">
      ${statBox('🏋️', fmtKg(sessionVolume(session)), 'Kilos totales')}
      ${statBox('🔁', sessionSets(session), 'Series')}
      ${statBox('⏱️', session.minutes ? fmtDuration(session.minutes / 60) : '–', 'Duración')}
    </div>
    ${comparison(session, previousSession(session))}

    ${records.length ? `
      <div class="section-title">Récords</div>
      <div class="card stack">
        ${records.map((r) => `
          <div class="gym-record">
            <span class="grow">🏆 ${esc(r.name)}</span>
            <b>${fmtNumber(r.weight)} kg</b>
          </div>`).join('')}
      </div>` : ''}

    <div class="section-title">Músculos trabajados</div>
    ${muscleCard([session])}

    <div class="section-title">Ejercicios</div>
    <div class="card gym-session-list">
      ${session.exercises.map((e) => `
        <div class="gym-session-row">
          <span class="grow"><span class="gym-session-name">${esc(e.name)}</span>
          <span class="small muted">${esc(setsLabel(e))}</span></span>
        </div>`).join('')}
    </div>
    <a class="gym-action gym-edit-link" href="#/body/gym/session/${session.id}/edit">Editar entrenamiento</a>`;

  root.querySelector('[data-delete]').onclick = () => {
    confirmSheet('Borrar entrenamiento', 'Se quitará del historial. No se puede deshacer.', 'Borrar', () => {
      deleteSession(id);
      navigate(GYM_ROUTE);
    });
  };
}
