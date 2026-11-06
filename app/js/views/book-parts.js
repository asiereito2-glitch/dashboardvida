// Piezas compartidas de la Biblioteca: portada, estrellas y hojas de lectura.
import {
  deleteReading, finishBook, getBook, pagesRead, saveReading,
} from '../library.js';
import { getCover } from '../covers.js';
import { fmtNumber } from '../goals.js';
import { todayKey } from '../dates.js';
import { closeSheet, esc, openSheet } from '../ui.js';

const STARS = [1, 2, 3, 4, 5];

export function coverHtml(book, cover = getCover(book.id)) {
  return cover
    ? `<img class="book-cover" src="${cover}" alt="Portada de ${esc(book.title || 'libro')}">`
    : `<span class="book-cover book-cover-empty">${esc(book.title || 'Sin portada')}</span>`;
}

// Parte rellena de la estrella n: entera, media o nada.
const starFill = (n, rating) => Math.max(0, Math.min(1, rating - (n - 1))) * 100;

function star(n, rating, buttons = '') {
  return `<span class="star-slot"><span class="star-empty">★</span><span class="star-full" style="width:${starFill(n, rating)}%">★</span>${buttons}</span>`;
}

export function starsText(rating) {
  return rating ? `<span class="book-stars" role="img" aria-label="${fmtNumber(rating)} de 5">${STARS.map((n) => star(n, rating)).join('')}</span>` : '';
}

// Cada estrella tiene dos zonas: la mitad izquierda vale media y la derecha, entera.
export function starPicker(rating) {
  const halves = (n) => [n - 0.5, n].map((value) => `<button type="button" data-star="${value}" aria-label="${fmtNumber(value)} de 5"></button>`).join('');
  return `
    <div class="star-picker" role="group" aria-label="Valoración">
      ${STARS.map((n) => star(n, rating, halves(n))).join('')}
    </div>
    <div class="star-value small muted">${rating ? `${fmtNumber(rating)} de 5` : 'Toca la mitad de una estrella para poner media'}</div>`;
}

// Tocar la misma estrella otra vez quita la valoración.
export const nextRating = (current, tapped) => (current === tapped ? 0 : tapped);

export function finishSheet(id, date = todayKey()) {
  let rating = getBook(id).rating || 0;
  openSheet('¡Libro terminado!', `
    <div class="stack">
      <label class="field-row"><span>Día que lo acabaste</span>
        <input type="date" class="date-input" data-date value="${date}" max="${todayKey()}"></label>
      <div data-stars>${starPicker(rating)}</div>
      <button class="primary-btn" data-ok style="margin:0;width:100%">Guardar</button>
      <button class="gym-action" data-cancel style="width:100%">Todavía no</button>
    </div>`, (sheet) => {
    const box = sheet.querySelector('[data-stars]');
    box.addEventListener('click', (e) => {
      const star = e.target.closest('[data-star]');
      if (!star) return;
      rating = nextRating(rating, Number(star.dataset.star));
      box.innerHTML = starPicker(rating);
    });
    sheet.querySelector('[data-cancel]').onclick = closeSheet;
    sheet.querySelector('[data-ok]').onclick = () => {
      const chosen = sheet.querySelector('[data-date]').value || todayKey();
      closeSheet();
      finishBook(id, chosen, rating);
    };
  });
}

// Se puede apuntar lo leído esta vez o la página por la que vas.
export function readingSheet(id, entry = null) {
  const book = getBook(id);
  const others = pagesRead(book) - (entry?.pages || 0);
  let mode = 'pages';
  openSheet(entry ? 'Editar lectura' : 'Apuntar lectura', `
    <div class="stack">
      <div class="segmented two">
        <button type="button" data-mode="pages" class="on">Páginas leídas</button>
        <button type="button" data-mode="page">Voy por la página</button>
      </div>
      <label class="field-row"><span data-label>Páginas</span>
        <input class="num-input" data-pages inputmode="numeric" maxlength="5" placeholder="${others ? others + 1 : 20}" value="${entry?.pages || ''}"></label>
      <label class="field-row"><span>Día</span>
        <input type="date" class="date-input" data-date value="${entry?.date || todayKey()}" max="${todayKey()}"></label>
      <div class="small muted">${others ? `Llevas ${others} páginas${book.totalPages ? ` de ${book.totalPages}` : ''}.` : 'Es tu primera lectura de este libro.'}</div>
      <div class="notice error" data-error hidden></div>
      <button class="primary-btn" data-ok style="margin:0;width:100%">Guardar</button>
      ${entry ? '<button class="gym-action danger" data-remove style="width:100%">Borrar esta lectura</button>' : ''}
    </div>`, (sheet) => {
    const input = sheet.querySelector('[data-pages]');
    const fail = (text) => {
      const box = sheet.querySelector('[data-error]');
      box.textContent = text;
      box.hidden = false;
    };
    sheet.querySelectorAll('[data-mode]').forEach((b) => {
      b.onclick = () => {
        mode = b.dataset.mode;
        sheet.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('on', x === b));
        sheet.querySelector('[data-label]').textContent = mode === 'page' ? 'Página' : 'Páginas';
      };
    });
    sheet.querySelector('[data-remove]')?.addEventListener('click', () => {
      closeSheet();
      deleteReading(id, entry.id);
    });
    sheet.querySelector('[data-ok]').onclick = () => {
      const typed = Number(input.value.trim());
      if (!Number.isInteger(typed) || typed <= 0) {
        fail('Escribe un número de páginas.');
        return;
      }
      const pages = mode === 'page' ? typed - others : typed;
      if (pages <= 0) {
        fail(`Ya llevabas ${others} páginas: escribe una página mayor.`);
        return;
      }
      const date = sheet.querySelector('[data-date]').value || todayKey();
      closeSheet();
      saveReading(id, entry?.id, { date, pages });
      const updated = getBook(id);
      const reachedEnd = updated.totalPages && pagesRead(updated) >= updated.totalPages;
      if (reachedEnd && updated.status === 'reading') finishSheet(id, date);
    };
  });
}
