// Tema y fondo. La foto propia se guarda aparte (no entra en las copias de seguridad).
import { state } from './store.js';

const PHOTO_KEY = 'habitos-wallpaper';
const PHOTO_MAX_SIZE = 900;
const PHOTO_QUALITY = 0.7;

const THEME_COLORS = { light: '#d8ccbc', dark: '#12100d' };

export function getPhoto() {
  try {
    return localStorage.getItem(PHOTO_KEY);
  } catch {
    return null;
  }
}

export function applyAppearance() {
  const root = document.documentElement;
  const theme = state.settings.theme === 'dark' ? 'dark' : 'light';
  root.dataset.theme = theme;
  root.dataset.wallpaper = state.settings.wallpaper || 'warm';

  const photo = state.settings.wallpaper === 'photo' ? getPhoto() : null;
  if (photo) {
    root.dataset.photo = '1';
    root.style.setProperty('--photo', `url("${photo}")`);
  } else {
    delete root.dataset.photo;
    root.style.removeProperty('--photo');
  }
  document.querySelector('meta[name="theme-color"]').content = THEME_COLORS[theme];
}

// Reduce la foto para que quepa en el almacenamiento del dispositivo. Devuelve false si no se pudo.
export async function savePhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    localStorage.setItem(PHOTO_KEY, canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
    return true;
  } catch (err) {
    console.error('No se pudo guardar la foto', err);
    return false;
  }
}
