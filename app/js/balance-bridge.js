// Conexión con Balance, que funciona tal cual en su propia página (balance/index.html)
// dentro de un marco. Sus datos quedan en el dispositivo, en la misma web que la app.
const DATA_KEY = 'balance_app_local_v1';
const SUMMARY_KEY = 'balance_summary';

let frame = null;

function embed() {
  try {
    return frame?.contentWindow?.balanceEmbed || null;
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

function ensureFrame() {
  if (frame) return;
  frame = document.createElement('iframe');
  frame.id = 'balance-frame';
  frame.title = 'Balance';
  frame.className = 'hidden';
  frame.src = 'balance/index.html';
  frame.setAttribute('allow', 'web-share; clipboard-read; clipboard-write');
  document.body.appendChild(frame);
}

let pendingView = null;
let pendingAction = null; // lo que Inicio pidió hacer cuando Balance esté en pantalla

function runPendingAction(api) {
  pendingAction?.(api);
  pendingAction = null;
}

window.onBalanceReady = () => {
  const api = embed();
  api?.setSafeBottom(safeBottomPx());
  if (pendingView) {
    api?.go(pendingView);
    pendingView = null;
    runPendingAction(api);
  }
};

// Lee el pago del portapapeles (debe hacerse en el mismo toque) y lo lleva a Balance.
export async function pastePaymentFromClipboard() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    // Sin permiso, Balance ofrece pegarlo a mano.
  }
  pendingAction = (api) => api.pay(text);
  location.hash = '#/balance';
}

export function addMovementFromHome() {
  pendingAction = (api) => api.addWhenUnlocked();
  location.hash = '#/balance';
}

// Balance avisa cuando abre una hoja o ventana: solo debe tapar la barra si se está viendo.
let overlayOpen = false;

window.onBalanceOverlay = (open) => {
  overlayOpen = open;
  document.body.classList.toggle('balance-overlay', open && !frame.classList.contains('hidden'));
};

export function showBalance(view, entering) {
  ensureFrame();
  frame.classList.remove('hidden');
  document.body.classList.toggle('balance-overlay', overlayOpen);
  if (!entering) return;
  const api = embed();
  if (api) {
    api.go(view);
    runPendingAction(api);
  } else {
    pendingView = view;
  }
}

export function hideBalance() {
  frame?.classList.add('hidden');
  document.body.classList.remove('balance-overlay');
}

export function addMovement() {
  embed()?.add();
}

let lastTheme = null;

// Solo repinta Balance si el tema ha cambiado de verdad.
export function refreshBalanceTheme() {
  const api = embed();
  const theme = document.documentElement.dataset.theme;
  if (!api || theme === lastTheme) return;
  lastTheme = theme;
  api.refreshTheme();
  api.refresh();
}

export function readBalanceData() {
  try {
    return JSON.parse(localStorage.getItem(DATA_KEY));
  } catch {
    return null;
  }
}

export function readSummary() {
  try {
    return JSON.parse(localStorage.getItem(SUMMARY_KEY));
  } catch {
    return null;
  }
}

// Si el resumen es de otro día, Balance se abre oculto para apuntar los pagos
// recurrentes pendientes y actualizar lo que se ve en Inicio.
export function refreshSummaryIfStale(today) {
  try {
    if (!localStorage.getItem(DATA_KEY)) return;
  } catch {
    return;
  }
  if (readSummary()?.day !== today) ensureFrame();
}
