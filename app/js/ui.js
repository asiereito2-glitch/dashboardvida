// Utilidades de interfaz compartidas.

export function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function navigate(hash) {
  location.hash = hash;
}

// Hoja inferior. `bind` recibe el elemento de la hoja para añadir eventos.
export function openSheet(title, bodyHtml, bind) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="sheet-backdrop">
      <div class="sheet" role="dialog" aria-label="${esc(title)}">
        <div class="grabber"></div>
        <h2>${esc(title)}</h2>
        ${bodyHtml}
      </div>
    </div>`;
  const backdrop = root.firstElementChild;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSheet();
  });
  bind?.(backdrop.querySelector('.sheet'));
}

export function closeSheet() {
  document.getElementById('sheet-root').innerHTML = '';
}

// Aviso flotante breve (p. ej. "+20 XP"). `big` para celebraciones como subir de nivel.
export function showToast(html, { big = false, duration = 1600 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${big ? 'big' : ''}`;
  el.innerHTML = html;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), duration);
  setTimeout(() => el.remove(), duration + 400);
}

export function confirmSheet(title, message, confirmLabel, onConfirm) {
  openSheet(title, `
    <p class="muted" style="text-align:center;margin:0 0 20px">${esc(message)}</p>
    <div class="option-list">
      <button data-ok style="justify-content:center;color:var(--red);font-weight:600">${esc(confirmLabel)}</button>
      <button data-cancel style="justify-content:center">Cancelar</button>
    </div>`, (sheet) => {
    sheet.querySelector('[data-ok]').onclick = () => { closeSheet(); onConfirm(); };
    sheet.querySelector('[data-cancel]').onclick = closeSheet;
  });
}
