// Recorte de la portada: se mueve con un dedo y se acerca con dos o con la barra.
import { closeSheet, openSheet, showToast } from '../ui.js';

const FRAME_W = 200;
const FRAME_H = 300;
const OUTPUT_SCALE = 1.5; // 300 × 450 px: suficiente para verla nítida y que ocupe poco
const QUALITY = 0.8;
const MAX_ZOOM = 4;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('imagen no válida'));
    };
    img.src = url;
  });
}

// `done` recibe la imagen recortada como texto (data URL).
export async function cropCover(file, done) {
  let loaded;
  try {
    loaded = await loadImage(file);
  } catch {
    showToast('No se pudo abrir esa imagen');
    return;
  }
  const { img, url } = loaded;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const base = Math.max(FRAME_W / iw, FRAME_H / ih);
  let zoom = 1;
  let x = (FRAME_W - iw * base) / 2;
  let y = (FRAME_H - ih * base) / 2;

  openSheet('Recortar portada', `
    <div class="crop-frame" data-frame style="width:${FRAME_W}px;height:${FRAME_H}px">
      <img src="${url}" alt="" draggable="false">
    </div>
    <input class="crop-zoom" data-zoom type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="Acercar">
    <div class="small muted" style="text-align:center;margin-bottom:14px">Arrastra la foto para encuadrarla.</div>
    <button class="primary-btn" data-ok style="margin:0;width:100%">Usar foto</button>
    <button class="gym-action" data-cancel style="width:100%;margin-top:8px">Cancelar</button>`, (sheet) => {
    const frame = sheet.querySelector('[data-frame]');
    const shown = frame.querySelector('img');
    const slider = sheet.querySelector('[data-zoom]');
    const pointers = new Map();
    let pinch = null;

    const paint = () => {
      const scale = base * zoom;
      x = Math.min(0, Math.max(FRAME_W - iw * scale, x));
      y = Math.min(0, Math.max(FRAME_H - ih * scale, y));
      shown.style.width = `${iw * scale}px`;
      shown.style.transform = `translate(${x}px, ${y}px)`;
    };
    // El punto central del marco se queda donde está al acercar.
    const zoomTo = (next) => {
      const before = base * zoom;
      zoom = Math.min(MAX_ZOOM, Math.max(1, next));
      const after = base * zoom;
      x = FRAME_W / 2 - ((FRAME_W / 2 - x) * after) / before;
      y = FRAME_H / 2 - ((FRAME_H / 2 - y) * after) / before;
      slider.value = zoom;
      paint();
    };
    const spread = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    frame.addEventListener('pointerdown', (e) => {
      frame.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) pinch = { distance: spread(), zoom };
    });
    frame.addEventListener('pointermove', (e) => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      if (pointers.size === 1) {
        x += e.clientX - last.x;
        y += e.clientY - last.y;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) zoomTo((pinch.zoom * spread()) / pinch.distance);
      else paint();
    });
    const release = (e) => {
      pointers.delete(e.pointerId);
      pinch = null;
    };
    frame.addEventListener('pointerup', release);
    frame.addEventListener('pointercancel', release);
    slider.addEventListener('input', () => zoomTo(Number(slider.value)));

    const finish = (result) => {
      closeSheet();
      URL.revokeObjectURL(url);
      if (result) done(result);
    };
    sheet.querySelector('[data-cancel]').onclick = () => finish(null);
    sheet.querySelector('[data-ok]').onclick = () => {
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_W * OUTPUT_SCALE;
      canvas.height = FRAME_H * OUTPUT_SCALE;
      const scale = base * zoom;
      canvas.getContext('2d').drawImage(
        img,
        -x / scale,
        -y / scale,
        FRAME_W / scale,
        FRAME_H / scale,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      finish(canvas.toDataURL('image/jpeg', QUALITY));
    };
    paint();
  });
}
