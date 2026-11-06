// Personalizar Inicio: qué bloques se ven y en qué orden.
import { save, state } from '../store.js';
import { icons } from '../icons.js';
import { homeBlocks } from './home.js';

export function renderHomeSettings(root) {
  const blocks = homeBlocks();

  root.innerHTML = `
    <header class="nav-header">
      <button class="icon-btn" data-back aria-label="Volver">${icons.back}</button>
      <h1>Personalizar Inicio</h1><span></span>
    </header>
    <p class="small muted" style="margin:0 4px 12px">Elige qué ver y ordénalo con las flechas.</p>
    <div class="stack">
      ${blocks.map((b, i) => `
        <div class="card block-row ${b.on ? '' : 'off'}">
          <span class="block-emoji">${b.emoji}</span>
          <span class="grow">${b.label}</span>
          <button class="block-move" data-move="-1" data-index="${i}" aria-label="Subir ${b.label}" ${i === 0 ? 'disabled' : ''}>${icons.arrowUp}</button>
          <button class="block-move" data-move="1" data-index="${i}" aria-label="Bajar ${b.label}" ${i === blocks.length - 1 ? 'disabled' : ''}>${icons.arrowDown}</button>
          <input type="checkbox" class="switch" data-toggle-block="${i}" ${b.on ? 'checked' : ''} aria-label="Mostrar ${b.label}">
        </div>`).join('')}
    </div>`;

  const persist = (list) => {
    state.settings.homeBlocks = list.map(({ id, on }) => ({ id, on }));
    save();
  };

  root.querySelector('[data-back]').onclick = () => {
    if (history.length > 1) history.back();
    else location.replace('#/home');
  };
  root.querySelectorAll('[data-move]').forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.index);
      const j = i + Number(b.dataset.move);
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      persist(blocks);
    };
  });
  root.querySelectorAll('[data-toggle-block]').forEach((input) => {
    input.onchange = () => {
      blocks[Number(input.dataset.toggleBlock)].on = input.checked;
      persist(blocks);
    };
  });
}
