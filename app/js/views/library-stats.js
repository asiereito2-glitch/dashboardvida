// Biblioteca: estadísticas de lectura.
import { state } from '../store.js';
import { libraryStats } from '../library.js';
import { fmtNumber } from '../goals.js';
import { DAY_NAMES_SHORT } from '../dates.js';
import { esc } from '../ui.js';
import { starsText } from './book-parts.js';

const round1 = (n) => Math.round(n * 10) / 10;
const plural = (n, word) => `${fmtNumber(n)} ${word}${n === 1 ? '' : 's'}`;

function statBox(emoji, value, label) {
  return `<div class="stat"><div class="ico">${emoji}</div><div class="val">${value}</div><div class="lbl">${label}</div></div>`;
}

// Barras verticales. Al tocar una se ve su valor exacto; empieza marcada la última.
function barChart(items, unit, label) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const last = items.at(-1);
  return `
    <div class="lib-chart" data-bars>
      <div class="lib-bars" role="img" aria-label="${esc(label)}">
        ${items.map((item) => `
          <button class="lib-bar ${item === last ? 'on' : ''}" data-value="${esc(plural(item.value, unit))}" data-name="${esc(item.full)}" aria-label="${esc(item.full)}: ${esc(plural(item.value, unit))}">
            <span class="lib-bar-track"><span style="height:${item.value ? Math.max(3, (item.value / max) * 100) : 0}%"></span></span>
            <span class="lib-bar-label">${esc(item.short)}</span>
          </button>`).join('')}
      </div>
      <div class="gym-chart-tip"><b data-tip-value>${esc(plural(last.value, unit))}</b> <span class="small muted" data-tip-date>${esc(last.full)}</span></div>
    </div>`;
}

function bindBars(root) {
  root.querySelectorAll('[data-bars]').forEach((chart) => {
    const bars = chart.querySelectorAll('.lib-bar');
    bars.forEach((bar) => {
      bar.onclick = () => {
        bars.forEach((b) => b.classList.toggle('on', b === bar));
        chart.querySelector('[data-tip-value]').textContent = bar.dataset.value;
        chart.querySelector('[data-tip-date]').textContent = bar.dataset.name;
      };
    });
  });
}

function weekdayRows(pages) {
  const max = Math.max(1, ...pages);
  return pages.map((value, i) => `
    <div class="wd-row wide">
      <span>${DAY_NAMES_SHORT[i]}</span>
      <div class="progress"><div style="width:${(value / max) * 100}%"></div></div>
      <span class="pct">${fmtNumber(value)}</span>
    </div>`).join('');
}

export function renderLibraryStats(root) {
  const stats = libraryStats();
  const header = '<header class="page-header"><h1 class="page-title">Estadísticas</h1></header>';
  if (!state.books.length) {
    root.innerHTML = `${header}<div class="card empty small">Añade tus libros para ver aquí tus estadísticas.</div>`;
    return;
  }
  root.innerHTML = `
    ${header}
    <div class="stat-row">
      ${statBox('📚', stats.booksThisYear, 'Libros este año')}
      ${statBox('📖', fmtNumber(stats.pagesThisMonth), 'Páginas este mes')}
      ${statBox('📊', stats.pagesPerDay === null ? '–' : fmtNumber(Math.round(stats.pagesPerDay)), 'Páginas por día')}
    </div>
    ${stats.pagesPerDay === null ? '' : '<div class="small muted lib-note">La media cuenta solo los días que has leído.</div>'}

    <div class="section-title">Páginas por mes</div>
    <div class="card">${barChart(stats.pagesByMonth, 'página', 'Páginas leídas en los últimos 12 meses')}</div>

    <div class="section-title">Libros leídos por año</div>
    <div class="card">
      ${stats.booksByYear.length
    ? barChart(stats.booksByYear, 'libro', 'Libros leídos por año')
    : '<div class="small muted">Aparecerán cuando acabes un libro con fecha de fin.</div>'}
      ${stats.undatedRead ? `<div class="small muted lib-note">${plural(stats.undatedRead, 'libro')} sin fecha de fin no se cuenta${stats.undatedRead === 1 ? '' : 'n'} aquí.</div>` : ''}
    </div>

    <div class="section-title">Por día de la semana</div>
    <div class="card stack">
      ${stats.pagesByWeekday.some(Boolean)
    ? `<div class="small muted">Páginas leídas en total.</div>${weekdayRows(stats.pagesByWeekday)}`
    : '<div class="small muted">Apunta tus lecturas para ver qué días lees más.</div>'}
    </div>

    <div class="section-title">Curiosidades</div>
    <div class="stat-row">
      ${statBox('🔥', plural(stats.streak, 'día'), 'Racha actual')}
      ${statBox('🏆', plural(stats.bestStreak, 'día'), 'Mejor racha')}
      ${statBox('⏱️', stats.daysPerBook === null ? '–' : plural(Math.round(stats.daysPerBook), 'día'), 'Por libro')}
    </div>

    ${stats.topRated.length ? `
      <div class="section-title">Mejor valorados</div>
      <div class="small muted lib-rating">Valoración media: <b>${fmtNumber(round1(stats.averageRating))} de 5</b></div>
      <div class="card gym-session-list">
        ${stats.topRated.map((book) => `
          <a class="gym-session-row" href="#/library/${book.id}">
            <span class="grow"><span class="gym-session-name">${esc(book.title)}</span></span>
            ${starsText(book.rating)}
          </a>`).join('')}
      </div>` : ''}`;
  bindBars(root);
}
