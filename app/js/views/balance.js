// Sección Balance: el contenido lo pinta Balance en su marco; aquí solo va el botón +.
import { addMovement } from '../balance-bridge.js';
import { icons } from '../icons.js';

export function renderBalance(root, { view }) {
  root.innerHTML = view === 'settings'
    ? ''
    : `<button class="fab" data-fab aria-label="Añadir movimiento">${icons.plus}</button>`;
  root.querySelector('[data-fab]')?.addEventListener('click', addMovement);
}
