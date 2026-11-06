// Biblioteca: lo que estoy leyendo, todos mis libros y la ficha de cada uno.
import { state } from '../store.js';
import {
  booksNewestFirst, booksReading, deleteBook, getBook, pagesRead, progressPct, readingsNewestFirst,
  startBook, statusLabel,
} from '../library.js';
import { relativeDayLabel, todayKey } from '../dates.js';
import { icons } from '../icons.js';
import { confirmSheet, esc, navigate } from '../ui.js';
import {
  coverHtml, finishSheet, readingSheet, starsText,
} from './book-parts.js';

const NEW_ROUTE = '#/library/new';
const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'reading', label: 'Leyendo' },
  { id: 'read', label: 'Leídos' },
  { id: 'unread', label: 'Sin leer' },
];

let filter = 'all';
let search = '';

const addButton = () => `<a class="fab" href="${NEW_ROUTE}" aria-label="Añadir libro">${icons.plus}</a>`;
const plain = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function progressText(book) {
  const read = pagesRead(book);
  if (book.totalPages) return `Página ${read} de ${book.totalPages} · ${progressPct(book)}%`;
  return read ? `${read} páginas leídas` : 'Sin lecturas apuntadas';
}

export function progressBar(book) {
  const pct = progressPct(book);
  return pct === null ? '' : `<div class="progress"><div style="width:${pct}%"></div></div>`;
}

function readingCard(book) {
  return `
    <div class="card book-reading">
      <a class="book-reading-cover" href="#/library/${book.id}">${coverHtml(book)}</a>
      <div class="book-reading-main">
        <a class="book-reading-title" href="#/library/${book.id}">${esc(book.title)}</a>
        ${book.author ? `<div class="small muted">${esc(book.author)}</div>` : ''}
        ${progressBar(book)}
        <div class="small muted book-reading-progress">${progressText(book)}</div>
        <button class="gym-action" data-log="${book.id}">${icons.plus}<span>Apuntar lectura</span></button>
      </div>
    </div>`;
}

export function renderLibraryReading(root) {
  const books = booksReading();
  root.innerHTML = `
    <header class="page-header"><h1 class="page-title">Leyendo</h1></header>
    ${books.length
    ? `<div class="stack">${books.map(readingCard).join('')}</div>`
    : `<div class="card empty small">
        <div class="big">📚</div>
        No estás leyendo ningún libro ahora mismo.
        <a class="primary-btn" href="${state.books.length ? '#/library/all' : NEW_ROUTE}">${state.books.length ? 'Ver mi biblioteca' : 'Añadir un libro'}</a>
      </div>`}
    ${addButton()}`;
  root.querySelectorAll('[data-log]').forEach((b) => {
    b.onclick = () => readingSheet(b.dataset.log);
  });
}

function bookTile(book) {
  return `
    <a class="book-tile" href="#/library/${book.id}">
      ${coverHtml(book)}
      <span class="book-tile-title">${esc(book.title)}</span>
      <span class="small muted">${book.rating ? starsText(book.rating) : statusLabel(book.status)}</span>
    </a>`;
}

function visibleBooks() {
  const wanted = plain(search.trim());
  return booksNewestFirst().filter((b) => (filter === 'all' || b.status === filter)
    && (!wanted || plain(`${b.title} ${b.author}`).includes(wanted)));
}

function gridHtml() {
  const books = visibleBooks();
  if (!books.length) return `<div class="card empty small">${state.books.length ? 'No hay libros que coincidan.' : 'Añade tu primer libro con el botón +.'}</div>`;
  return `
    <div class="small muted book-count">${books.length} libro${books.length === 1 ? '' : 's'}</div>
    <div class="book-grid">${books.map(bookTile).join('')}</div>`;
}

export function renderLibrary(root) {
  root.innerHTML = `
    <header class="page-header"><h1 class="page-title">Mi biblioteca</h1></header>
    <div class="segmented four">
      ${FILTERS.map((f) => `<button data-filter="${f.id}" class="${f.id === filter ? 'on' : ''}">${f.label}</button>`).join('')}
    </div>
    <input class="text-input book-input book-search" data-search type="search" placeholder="Buscar por título o autor" value="${esc(search)}" autocomplete="off">
    <div data-grid>${gridHtml()}</div>
    ${addButton()}`;
  root.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => {
      filter = b.dataset.filter;
      renderLibrary(root);
    };
  });
  root.querySelector('[data-search]').oninput = (e) => {
    search = e.target.value;
    root.querySelector('[data-grid]').innerHTML = gridHtml();
  };
}

// ---------- Ficha ----------

function datesText(book) {
  const parts = [];
  if (book.startedOn) parts.push(`Empezado: ${relativeDayLabel(book.startedOn)}`);
  if (book.finishedOn) parts.push(`Acabado: ${relativeDayLabel(book.finishedOn)}`);
  return parts.join(' · ');
}

function mainAction(book) {
  if (book.status === 'unread') return '<button class="primary-btn" data-start style="margin:0;width:100%">Empezar a leer</button>';
  const log = '<button class="primary-btn" data-add-reading style="margin:0;width:100%">Apuntar lectura</button>';
  if (book.status === 'read') return '';
  return `${log}<button class="gym-action" data-finish style="width:100%">He terminado el libro</button>`;
}

export function renderBookDetail(root, { id }) {
  const book = getBook(id);
  if (!book) {
    root.innerHTML = '<div class="card empty small">Este libro ya no está en tu biblioteca.</div>';
    return;
  }
  const readings = readingsNewestFirst(book);
  root.innerHTML = `
    <header class="nav-header">
      <a class="icon-btn" href="#/library/all" aria-label="Volver">${icons.back}</a>
      <h1>${esc(statusLabel(book.status))}</h1>
      <a class="icon-btn" href="#/library/${book.id}/edit" aria-label="Editar libro">${icons.note}</a>
    </header>

    <div class="book-hero">
      ${coverHtml(book)}
      <h2>${esc(book.title)}</h2>
      ${book.author ? `<div class="muted">${esc(book.author)}</div>` : ''}
      ${starsText(book.rating)}
      ${datesText(book) ? `<div class="small muted">${datesText(book)}</div>` : ''}
    </div>

    ${book.status === 'unread' || (book.status === 'read' && !readings.length) ? '' : `
      <div class="card" style="margin-top:16px">
        <div class="small muted">${progressText(book)}</div>
        ${progressBar(book)}
      </div>`}

    <div class="stack" style="margin-top:12px">${mainAction(book)}</div>

    ${readings.length ? `
      <div class="section-title">Lecturas</div>
      <div class="card gym-session-list">
        ${readings.map((r) => `
          <button class="gym-session-row book-log-row" data-entry="${r.id}">
            <span class="grow"><span class="gym-session-name">${r.pages} páginas</span></span>
            <span class="small muted">${relativeDayLabel(r.date)}</span>
          </button>`).join('')}
      </div>
      <div class="small muted book-hint">Toca una lectura para corregirla.</div>` : ''}

    <button class="gym-discard small book-delete" data-delete>Borrar libro</button>`;

  const on = (selector, fn) => {
    const el = root.querySelector(selector);
    if (el) el.onclick = fn;
  };
  on('[data-start]', () => startBook(id, todayKey()));
  on('[data-add-reading]', () => readingSheet(id));
  on('[data-finish]', () => finishSheet(id));
  root.querySelectorAll('[data-entry]').forEach((b) => {
    b.onclick = () => readingSheet(id, book.readings.find((r) => r.id === b.dataset.entry));
  });
  on('[data-delete]', () => confirmSheet('Borrar libro', 'Se borrará con su foto y sus lecturas. No se puede deshacer.', 'Borrar', () => {
    deleteBook(id);
    navigate('#/library/all');
  }));
}
