// Mapa SVG sin dependencias: las formas ya vienen proyectadas en data/world.json.
const NS = 'http://www.w3.org/2000/svg';
const MAX_ZOOM = 16;
const DOT_PX = 3.2;
const DOT_PX_FAR = 2.1;
const CITY_PX = 2.4;
const DOT_TAP_PX = 18;
const TERRITORY_DOTS_ZOOM = 2.6;
const TAP_SLOP_PX = 6;

const svgEl = (name, attrs = {}) => {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

export function createMap(host, world, { onSelect, onHover }) {
  const svg = svgEl('svg', {
    role: 'img',
    'aria-label': 'Mapa del mundo con tus países marcados. La pestaña Países ofrece la misma información en forma de lista.',
  });
  const defs = svgEl('defs');
  const hatch = svgEl('pattern', {
    id: 'hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)',
  });
  hatch.append(svgEl('rect', { width: 5, height: 5, class: 'hatch-bg' }), svgEl('rect', { width: 2, height: 5, class: 'hatch-line' }));
  defs.append(hatch);
  const root = svgEl('g');
  root.append(svgEl('path', { d: world.grid, class: 'grid' }));

  const shapes = new Map(); // código -> elementos (forma y/o punto)
  const dots = [];
  for (const c of world.countries) {
    if (!c.d) continue;
    const p = svgEl('path', { d: c.d, class: 'land' });
    p.dataset.c = c.c;
    root.append(p);
    shapes.set(c.c, [p]);
  }
  for (const c of world.countries) {
    if (!c.p) continue;
    const el = svgEl('circle', { cx: c.p[0], cy: c.p[1], class: 'land dot' });
    el.dataset.c = c.c;
    root.append(el);
    dots.push({ el, code: c.c, x: c.p[0], y: c.p[1], sovereign: !!c.s, visible: true });
    shapes.set(c.c, [...(shapes.get(c.c) || []), el]);
  }
  const cityLayer = svgEl('g', { class: 'cities' });
  root.append(cityLayer);
  svg.append(defs, root);
  host.append(svg);

  let vw = 1;
  let vh = 1;
  let fit = 1; // escala que muestra el mapa entero
  const view = { s: 1, x: 0, y: 0 };
  let ready = false;
  let tween = 0;

  const paint = () => {
    const minX = vw - world.w * view.s;
    const minY = vh - world.h * view.s;
    view.x = minX >= 0 ? minX / 2 : Math.min(0, Math.max(minX, view.x));
    view.y = minY >= 0 ? minY / 2 : Math.min(0, Math.max(minY, view.y));
    root.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.s})`);
    const zoomed = view.s > fit * TERRITORY_DOTS_ZOOM;
    const r = (zoomed ? DOT_PX : DOT_PX_FAR) / view.s;
    for (const d of dots) {
      d.visible = d.sovereign || zoomed;
      d.el.setAttribute('r', r);
      d.el.style.display = d.visible ? '' : 'none';
    }
    for (const el of cityLayer.children) el.setAttribute('r', CITY_PX / view.s);
  };

  const clampScale = (s) => Math.min(fit * MAX_ZOOM, Math.max(fit, s));

  const zoomAt = (s, px, py) => {
    const next = clampScale(s);
    view.x = px - ((px - view.x) / view.s) * next;
    view.y = py - ((py - view.y) / view.s) * next;
    view.s = next;
    paint();
  };

  const animate = (to) => {
    cancelAnimationFrame(tween);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Object.assign(view, to);
      paint();
      return;
    }
    const from = { ...view };
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 280);
      const e = 1 - (1 - t) ** 3;
      view.s = from.s + (to.s - from.s) * e;
      view.x = from.x + (to.x - from.x) * e;
      view.y = from.y + (to.y - from.y) * e;
      paint();
      if (t < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  };

  const centered = (s, cx, cy) => ({ s, x: vw / 2 - cx * s, y: vh / 2 - cy * s });
  // En pantallas altas el mapa arranca más cerca para no dejar media pantalla de océano.
  const start = () => centered(Math.max(fit, (vh * 0.62) / world.h), world.w * 0.53, world.h * 0.46);

  const measure = () => {
    const box = host.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const ratio = ready ? view.s / fit : 1;
    vw = box.width;
    vh = box.height;
    fit = Math.min(vw / world.w, vh / world.h);
    if (ready) {
      view.s = fit * ratio;
    } else {
      ready = true;
      Object.assign(view, start());
    }
    paint();
  };
  new ResizeObserver(measure).observe(host);

  const local = (e) => {
    const box = svg.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top];
  };

  // Los puntos de países pequeños tienen prioridad y un área de toque mayor que su dibujo.
  const hit = (e) => {
    const [px, py] = local(e);
    let best = null;
    let bestDist = DOT_TAP_PX;
    for (const d of dots) {
      if (!d.visible) continue;
      const dist = Math.hypot(d.x * view.s + view.x - px, d.y * view.s + view.y - py);
      if (dist < bestDist) { best = d.code; bestDist = dist; }
    }
    return best || document.elementFromPoint(e.clientX, e.clientY)?.dataset?.c || null;
  };

  const pointers = new Map();
  let pinch = null;
  let moved = 0;
  let last = null;

  svg.addEventListener('pointerdown', (e) => {
    cancelAnimationFrame(tween);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) {
      moved = 0;
      last = local(e);
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), s: view.s };
      moved = Infinity;
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') onHover(hit(e), e);
      return;
    }
    // La captura se pide aquí y no al pulsar: con captura, elementFromPoint seguiría funcionando,
    // pero así un toque simple nunca altera el destino del evento.
    if (!svg.hasPointerCapture(e.pointerId)) svg.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      zoomAt(pinch.s * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.dist), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      return;
    }
    if (!last) return;
    moved += Math.hypot(p[0] - last[0], p[1] - last[1]);
    if (moved < TAP_SLOP_PX) return;
    view.x += p[0] - last[0];
    view.y += p[1] - last[1];
    last = p;
    paint();
    onHover(null);
  });

  const release = (e) => {
    const tapped = e.type === 'pointerup' && pointers.size === 1 && moved < TAP_SLOP_PX;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    last = pointers.size === 1 ? [...pointers.values()][0] : null;
    if (tapped) {
      const code = hit(e);
      if (code) onSelect(code);
    }
  };
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);
  svg.addEventListener('pointerleave', () => onHover(null));
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [px, py] = local(e);
    zoomAt(view.s * Math.exp(-e.deltaY * 0.0016), px, py);
  }, { passive: false });

  const zoomBy = (f) => {
    const cx = (vw / 2 - view.x) / view.s;
    const cy = (vh / 2 - view.y) / view.s;
    animate(centered(clampScale(view.s * f), cx, cy));
  };

  let highlighted = [];
  return {
    measure,
    zoomIn: () => zoomBy(1.8),
    zoomOut: () => zoomBy(1 / 1.8),
    showAll: () => animate(centered(fit, world.w / 2, world.h / 2)),
    render(statuses) {
      for (const [code, els] of shapes) {
        const st = statuses.get(code);
        for (const el of els) {
          el.classList.toggle('visited', st === 'visited');
          el.classList.toggle('wish', st === 'wish');
        }
      }
    },
    /** Dibuja las ciudades visitadas que tienen coordenadas. */
    renderCities(cities) {
      cityLayer.replaceChildren(...cities.map((c) => svgEl('circle', {
        cx: c.x, cy: c.y, r: CITY_PX / view.s, class: 'city',
      })));
    },
    focus(code) {
      const els = shapes.get(code);
      if (!els) return;
      this.clearFocus();
      highlighted = els;
      els.forEach((el) => el.classList.add('selected'));
      const box = els[0].getBBox();
      const w = Math.max(box.width, world.w * 0.03);
      const h = Math.max(box.height, world.h * 0.03);
      const s = Math.max(fit * 1.6, Math.min((vw * 0.55) / w, (vh * 0.55) / h, fit * 10));
      animate(centered(s, box.x + box.width / 2, box.y + box.height / 2));
    },
    clearFocus() {
      highlighted.forEach((el) => el.classList.remove('selected'));
      highlighted = [];
    },
  };
}
