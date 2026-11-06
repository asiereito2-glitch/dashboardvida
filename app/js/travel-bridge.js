// Conexión con Huella, que funciona en su propia página (viajes/index.html) dentro de un marco.
// Sus datos quedan en el dispositivo, en la misma web que la app.
import { readTravel } from './store.js';
import { SOVEREIGN } from '../viajes/sovereign.js';

let frame = null;
let pendingView = null;
let overlayOpen = false;
let lastTheme = null;

function embed() {
  try {
    return frame?.contentWindow?.huellaEmbed || null;
  } catch {
    return null;
  }
}

function safeBottomPx() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;height:var(--safe-bottom);visibility:hidden';
  document.body.appendChild(probe);
  const height = probe.offsetHeight;
  probe.remove();
  return `${height}px`;
}

window.onTravelReady = () => {
  const api = embed();
  api?.setSafeBottom(safeBottomPx());
  if (pendingView) api?.go(pendingView);
  pendingView = null;
};

window.onTravelOverlay = (open) => {
  overlayOpen = open;
  document.body.classList.toggle('balance-overlay', open && !frame.classList.contains('hidden'));
};

export function showTravel(view, entering) {
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = 'travel-frame';
    frame.title = 'Viajes';
    frame.src = `viajes/index.html#/${view}`;
    document.body.appendChild(frame);
  }
  frame.classList.remove('hidden');
  document.body.classList.toggle('balance-overlay', overlayOpen);
  if (!entering) return;
  const api = embed();
  if (api) api.go(view);
  else pendingView = view;
}

export function hideTravel() {
  if (!frame || frame.classList.contains('hidden')) return;
  frame.classList.add('hidden');
  document.body.classList.remove('balance-overlay');
}

// Solo repinta Viajes si el tema ha cambiado de verdad.
export function refreshTravelTheme() {
  const api = embed();
  const theme = document.documentElement.dataset.theme;
  if (!api || theme === lastTheme) return;
  lastTheme = theme;
  api.refreshTheme();
}

// Mismas reglas que Huella: cuenta lo marcado, los viajes ya empezados, sus ciudades
// y regiones, y el país de residencia. Los territorios no suman.
function visitedCountries(data, today) {
  const visited = new Set(Object.keys(data.marks || {}).filter((c) => data.marks[c] === 'visited'));
  (data.trips || []).filter((t) => t.start <= today).forEach((t) => {
    t.countries.forEach((c) => visited.add(c));
    (t.cities || []).forEach((city) => visited.add(city.c));
  });
  (data.places || []).forEach((city) => visited.add(city.c));
  Object.keys(data.regions || {}).forEach((c) => visited.add(c));
  if (data.settings?.home) visited.add(data.settings.home);
  return [...visited].filter((c) => SOVEREIGN.has(c)).length;
}

// Resumen para Inicio y Metas. null si aún no has usado Viajes.
export function travelSummary(today) {
  const data = readTravel();
  if (!data) return null;
  const trips = data.trips || [];
  return {
    countries: visitedCountries(data, today),
    current: trips.find((t) => t.start <= today && today <= t.end) || null,
    next: trips.filter((t) => t.start > today).sort((a, b) => a.start.localeCompare(b.start))[0] || null,
  };
}
