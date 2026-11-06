// Añadir / editar un libro.
import { STATUSES, getBook, saveBook } from '../library.js';
import { getCover } from '../covers.js';
import { todayKey } from '../dates.js';
import { icons } from '../icons.js';
import { esc, navigate } from '../ui.js';
import { coverHtml, nextRating, starPicker } from './book-parts.js';
import { cropCover } from './crop-sheet.js';

let form = null;
let error = null;

function initForm(id) {
  const book = id && getBook(id);
  error = null;
  form = book
    ? {
      id,
      title: book.title,
      author: book.author,
      totalPages: book.totalPages ? String(book.totalPages) : '',
      status: book.status,
      startedOn: book.startedOn || '',
      finishedOn: book.finishedOn || '',
      rating: book.rating || 0,
      cover: undefined, // undefined = sin cambios, null = quitada
    }
    : {
      id: null,
      title: '',
      author: '',
      totalPages: '',
      status: 'unread',
      startedOn: '',
      finishedOn: '',
      rating: 0,
      cover: undefined,
    };
}

const shownCover = () => (form.cover === undefined ? form.id && getCover(form.id) : form.cover);

function setStatus(status) {
  form.status = status;
  const today = todayKey();
  if (status === 'reading') form.startedOn ||= today;
  if (status === 'read') form.finishedOn ||= today;
}

function validate() {
  const pages = form.totalPages.trim();
  if (!form.title.trim()) return 'Ponle un título al libro.';
  if (pages && (!Number.isInteger(Number(pages)) || Number(pages) <= 0)) return 'Revisa el número de páginas.';
  if (form.status === 'read' && form.startedOn && form.finishedOn && form.finishedOn < form.startedOn) {
    return 'El día que lo acabaste no puede ser anterior al día que lo empezaste.';
  }
  return null;
}

function submit(root) {
  error = validate();
  if (error) {
    draw(root);
    window.scrollTo(0, 0);
    return;
  }
  const { status } = form;
  const book = saveBook(form.id, {
    title: form.title.trim(),
    author: form.author.trim(),
    totalPages: Number(form.totalPages) || null,
    status,
    startedOn: status === 'unread' ? null : form.startedOn || null,
    finishedOn: status === 'read' ? form.finishedOn || null : null,
    rating: status === 'read' ? form.rating : 0,
  }, form.cover);
  navigate(`#/library/${book.id}`);
}

function draw(root) {
  const y = window.scrollY;
  const today = todayKey();
  const cover = shownCover();
  root.innerHTML = `
    <header class="nav-header">
      <a class="icon-btn danger" href="${form.id ? `#/library/${form.id}` : '#/library/all'}" aria-label="Cancelar">${icons.close}</a>
      <h1>${form.id ? 'Editar libro' : 'Añadir libro'}</h1>
      <button class="icon-btn" data-save aria-label="Guardar">${icons.check}</button>
    </header>
    ${error ? `<div class="notice error" style="margin-bottom:12px">${esc(error)}</div>` : ''}

    <div class="book-form stack">
      <div class="book-form-cover">
        <button type="button" class="book-cover-btn" data-pick aria-label="Elegir foto">${coverHtml({ title: form.title || 'Añadir foto' }, cover)}</button>
        <input type="file" accept="image/*" data-file hidden>
        <div class="book-cover-actions">
          <button type="button" class="gym-action" data-pick>${cover ? 'Cambiar foto' : 'Añadir foto'}</button>
          ${cover ? '<button type="button" class="gym-action danger" data-no-cover>Quitar</button>' : ''}
        </div>
      </div>

      <input class="text-input book-input" data-field="title" placeholder="Título" value="${esc(form.title)}" autocomplete="off">
      <input class="text-input book-input" data-field="author" placeholder="Autor (opcional)" value="${esc(form.author)}" autocomplete="off">

      <div class="card stack">
        <label class="field-row"><span>Páginas del libro</span>
          <input class="num-input" data-field="totalPages" inputmode="numeric" maxlength="5" placeholder="Opcional" value="${esc(form.totalPages)}"></label>
      </div>

      <div class="card stack">
        <div class="label" style="margin:0">Estado</div>
        <div class="segmented">
          ${STATUSES.map((s) => `<button type="button" data-status="${s.id}" class="${s.id === form.status ? 'on' : ''}">${s.label}</button>`).join('')}
        </div>
        ${form.status === 'unread' ? '' : `
          <label class="field-row"><span>Día que lo empecé</span>
            <input type="date" class="date-input" data-field="startedOn" value="${form.startedOn}" max="${today}"></label>`}
        ${form.status === 'read' ? `
          <label class="field-row"><span>Día que lo acabé</span>
            <input type="date" class="date-input" data-field="finishedOn" value="${form.finishedOn}" max="${today}"></label>
          <div class="label" style="margin:4px 0 0">Valoración</div>
          <div data-stars>${starPicker(form.rating)}</div>` : ''}
      </div>

      <button class="primary-btn" data-save style="margin:0;width:100%">Guardar</button>
    </div>`;
  window.scrollTo(0, y);

  const box = root.querySelector('.book-form');
  const fileInput = root.querySelector('[data-file]');
  box.addEventListener('input', (e) => {
    const { field } = e.target.dataset;
    if (field) form[field] = e.target.value;
  });
  root.querySelectorAll('[data-save]').forEach((b) => { b.onclick = () => submit(root); });
  root.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => fileInput.click(); });
  fileInput.onchange = () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    if (!file) return;
    cropCover(file, (dataUrl) => {
      form.cover = dataUrl;
      draw(root);
    });
  };
  const noCover = root.querySelector('[data-no-cover]');
  if (noCover) {
    noCover.onclick = () => {
      form.cover = null;
      draw(root);
    };
  }
  root.querySelectorAll('[data-status]').forEach((b) => {
    b.onclick = () => {
      setStatus(b.dataset.status);
      draw(root);
    };
  });
  root.querySelectorAll('[data-star]').forEach((b) => {
    b.onclick = () => {
      form.rating = nextRating(form.rating, Number(b.dataset.star));
      draw(root);
    };
  });
}

export function renderBookForm(root, { id }, entering) {
  if (entering || !form) initForm(id);
  draw(root);
}
