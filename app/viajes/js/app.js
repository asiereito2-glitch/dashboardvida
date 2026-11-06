import { cityFromCatalog, createStore, daysByYear, daysUntil, todayISO, tripDays } from './store.js';
import { createMap } from './map.js';

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const pct = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const utc = (iso) => new Date(`${iso}T00:00:00Z`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const CONTINENTS = ['África', 'Antártida', 'Asia', 'Europa', 'Norteamérica', 'Oceanía', 'Sudamérica'];
const SPLASH_MS = 1100;
const CITY_LIST_MAX = 40;

function hideSplash() {
  const el = $('#splash');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    el.classList.add('done');
    setTimeout(() => el.remove(), 350);
  }, still ? 0 : Math.max(0, SPLASH_MS - performance.now()));
}

const loadJSON = (url) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(r.status);
  return r.json();
});

let world;
let catalog;
try {
  [world, catalog] = await Promise.all([loadJSON('data/world.json'), loadJSON('data/cities.json')]);
} catch {
  $('#hero').innerHTML = '<p>No se pudo cargar el mapa. Recarga la página con conexión.</p>';
  hideSplash();
  throw new Error('datos no disponibles');
}

const countries = world.countries;
const byCode = new Map(countries.map((c) => [c.c, c]));
const sovereign = countries.filter((c) => c.s);
const store = createStore(countries, catalog);

let tab = 'mapa';
let listFilter = 'all';
let listQuery = '';
let installPrompt = null;
let regionsOpen = false;

/* Hoja inferior: se integra con el historial para que «atrás» la cierre en Android. */
const sheet = $('#sheet');
const sheetBody = $('#sheet-body');
let afterClose = null;
let lockedSheet = false;

function openSheet(html, { lock = false, label = 'Detalle', keepScroll = false } = {}) {
  const scroll = sheet.scrollTop;
  sheetBody.innerHTML = html;
  sheet.setAttribute('aria-label', label);
  lockedSheet = lock;
  if (!sheet.open) {
    sheet.showModal();
    history.pushState({ sheet: true }, '');
  }
  sheet.scrollTop = keepScroll ? scroll : 0;
}

function closeSheet(then) {
  afterClose = then || null;
  if (history.state?.sheet) history.back();
  else finishClose();
}

function finishClose() {
  if (sheet.open) sheet.close();
  map.clearFocus();
  const cb = afterClose;
  afterClose = null;
  cb?.();
}

window.addEventListener('popstate', finishClose);
sheet.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });
sheet.addEventListener('click', (e) => { if (e.target === sheet && !lockedSheet) closeSheet(); });

const confirmDialog = $('#confirm');
function ask(message, yesLabel) {
  $('#confirm-text').textContent = message;
  $('#confirm-yes').textContent = yesLabel;
  confirmDialog.showModal();
  return new Promise((resolve) => {
    const done = (value) => {
      confirmDialog.close();
      $('#confirm-yes').onclick = null;
      $('#confirm-no').onclick = null;
      confirmDialog.oncancel = null;
      resolve(value);
    };
    $('#confirm-yes').onclick = () => done(true);
    $('#confirm-no').onclick = () => done(false);
    confirmDialog.oncancel = (e) => { e.preventDefault(); done(false); };
  });
}

let toastTimer = 0;
function toast(message, undo) {
  const el = $('#toast');
  el.replaceChildren(message);
  if (undo) {
    const b = document.createElement('button');
    b.textContent = 'Deshacer';
    b.onclick = () => { undo(); el.hidden = true; };
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 7000 : 3500);
}

/* Cálculos compartidos */
function summary() {
  const statuses = store.statusMap();
  const visited = countries.filter((c) => statuses.get(c.c) === 'visited');
  const wish = countries.filter((c) => statuses.get(c.c) === 'wish');
  const visitedSov = visited.filter((c) => c.s);
  return {
    statuses,
    visitedSov,
    territories: visited.length - visitedSov.length,
    wish,
    share: (visitedSov.length / sovereign.length) * 100,
    continents: new Set(visited.map((c) => c.r)),
  };
}

const flags = (codes) => codes.map((c) => byCode.get(c)?.f || '').join(' ');
const names = (codes) => codes.map((c) => byCode.get(c)?.n).filter(Boolean).join(', ');

/** Porcentaje de regiones visitadas, o null si el país no se divide en regiones. */
function coverageOf(code, cov) {
  const total = catalog[code]?.r.length || 0;
  if (total < 2) return null;
  const done = cov.get(code)?.regions.size || 0;
  return { done, total, percent: done ? Math.max(1, Math.round((done / total) * 100)) : 0 };
}

const fuzzy = (name, q) => {
  const f = fold(name);
  if (f.startsWith(q)) return 0;
  return f.includes(q) ? 1 : 2;
};

/** Ciudades de los países dados. Sin texto, las más pobladas de cada país (el catálogo ya va ordenado). */
function searchCities(query, codes, skip) {
  const q = fold(query.trim());
  const hits = [];
  for (const code of codes) {
    const found = [];
    (catalog[code]?.c || []).forEach((row, i) => {
      const rank = q ? fuzzy(row[0], q) : 0;
      if (rank < 2 && !skip(code, row[0])) found.push({ code, i, row, rank });
    });
    hits.push(...(q ? found : found.slice(0, Math.ceil(CITY_LIST_MAX / codes.length))));
  }
  return hits.sort((a, b) => a.rank - b.rank).slice(0, CITY_LIST_MAX);
}

function cityOptions(query, codes, action, picked) {
  const name = query.trim();
  const taken = (code, n) => picked.some((c) => c.c === code && fold(c.n) === fold(n));
  const hits = searchCities(name, codes, taken);
  const multi = codes.length > 1;
  const found = hits.map(({ code, i, row }) => {
    const region = catalog[code].r[row[1]];
    const where = [multi ? byCode.get(code).n : '', region].filter(Boolean).join(' · ');
    return `<li><button type="button" data-action="${action}" data-code="${code}" data-i="${i}">
      <span>${esc(row[0])}</span>${where ? `<small>${esc(where)}</small>` : ''}</button></li>`;
  });
  const exact = hits.some((h) => fold(h.row[0]) === fold(name));
  const custom = name.length >= 2 && !exact
    ? codes.filter((code) => !taken(code, name)).slice(0, 3).map((code) => `<li><button type="button" data-action="${action}" data-code="${code}" data-name="${esc(name)}">
        <span>Añadir «${esc(name)}»</span>${multi ? `<small>${esc(byCode.get(code).n)}</small>` : ''}</button></li>`)
    : [];
  return [...found, ...custom].join('');
}

/** Pinta las opciones de un buscador de ciudades; la lista solo se abre con el campo activo. */
function showCityList(input, list, html) {
  const wasHidden = list.hidden;
  list.innerHTML = html;
  list.hidden = !html || document.activeElement !== input;
  if (!list.hidden && wasHidden) {
    list.scrollTop = 0;
    list.scrollIntoView({ block: 'nearest' });
  }
}

const cityFromAction = ({ code, i, name }) => (i !== undefined
  ? cityFromCatalog(catalog, code, catalog[code].c[Number(i)])
  : { n: name, c: code, r: null });

/** Enter en un buscador elige la primera opción en lugar de enviar el formulario. */
function enterPicksFirst(input, list) {
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (input.value.trim()) list.querySelector('button')?.click();
  });
}

function dateRange(t) {
  if (t.start === t.end) return dateFmt.format(utc(t.start));
  if (t.start.slice(0, 4) === t.end.slice(0, 4)) {
    return `${dayFmt.format(utc(t.start))} – ${dateFmt.format(utc(t.end))}`;
  }
  return `${dateFmt.format(utc(t.start))} – ${dateFmt.format(utc(t.end))}`;
}

function tripBadge(t) {
  const today = todayISO();
  if (t.start > today) {
    const n = daysUntil(t.start);
    return `<span class="badge">${n === 1 ? 'Mañana' : `En ${n} días`}</span>`;
  }
  if (t.end >= today) return '<span class="badge on">En curso</span>';
  return '';
}

/* Vista: mapa */
const map = createMap($('#map'), world, {
  onSelect: (code) => openCountry(code),
  onHover: (code, e) => {
    const tip = $('#map-tip');
    $('#map').style.cursor = code ? 'pointer' : '';
    if (!code) { tip.hidden = true; return; }
    const box = $('#map-panel').getBoundingClientRect();
    tip.textContent = byCode.get(code)?.n || '';
    tip.style.left = `${e.clientX - box.left + 14}px`;
    tip.style.top = `${e.clientY - box.top + 14}px`;
    tip.hidden = false;
  },
});

function renderHero() {
  const s = summary();
  const n = s.visitedSov.length;
  $('#hero').innerHTML = `
    <div class="hero-count"><h1>${n}</h1><p>de ${sovereign.length} países</p></div>
    <p class="hero-side"><b>${pct.format(s.share)} %</b> del mundo<br>
      <b>${s.continents.size}</b> de ${CONTINENTS.length} continentes</p>
    <div class="progress" role="img" aria-label="${pct.format(s.share)} % del mundo"><i style="width:${s.share}%"></i></div>`;
  const cities = [...store.coverage().values()].flatMap((e) => [...e.cities.values()]);
  $('#legend').innerHTML = `
    <span><i class="swatch visited"></i>Visitado · ${n}</span>
    <span><i class="swatch wish"></i>Quiero ir · ${s.wish.length}</span>
    <span><i class="swatch city"></i>Ciudad · ${cities.length}</span>`;
  map.render(s.statuses);
  map.renderCities(cities.filter((c) => Number.isFinite(c.x)));
}

const search = $('#map-search');
const results = $('#map-results');
function renderResults() {
  const q = fold(search.value.trim());
  const hits = q ? countries.filter((c) => fold(c.n).includes(q)).slice(0, 6) : [];
  results.hidden = !q;
  results.innerHTML = hits.length
    ? hits.map((c) => `<li><button data-action="find" data-code="${c.c}"><span class="flag">${c.f}</span>${esc(c.n)}</button></li>`).join('')
    : '<li class="none">Sin resultados</li>';
}
search.addEventListener('input', renderResults);
$('#zoom-in').onclick = () => map.zoomIn();
$('#zoom-out').onclick = () => map.zoomOut();
$('#zoom-fit').onclick = () => map.showAll();

/* Vista: viajes */
function tripCard(t) {
  const detail = [plural(tripDays(t), 'día', 'días'), t.cities.slice(0, 3).map((c) => c.n).join(', ')].filter(Boolean).join(' · ');
  return `<li><button class="trip" data-action="trip" data-id="${esc(t.id)}">
    <span class="trip-flags">${flags(t.countries.slice(0, 4))}</span>
    <span class="trip-main"><strong>${esc(t.title)}</strong>
      <small>${dateRange(t)}</small><small>${esc(detail)}</small></span>
    ${tripBadge(t)}${t.rating ? `<span class="score" role="img" aria-label="Nota ${t.rating} de 10">${t.rating}</span>` : ''}
  </button></li>`;
}

function renderTrips() {
  const today = todayISO();
  const trips = [...store.state.trips].sort((a, b) => b.start.localeCompare(a.start));
  const upcoming = trips.filter((t) => t.start > today).reverse();
  const past = trips.filter((t) => t.start <= today);
  const years = [...new Set(past.map((t) => t.start.slice(0, 4)))];
  const groups = years.map((y) => `<h2>${y}</h2><ul class="trips">${past.filter((t) => t.start.startsWith(y)).map(tripCard).join('')}</ul>`);
  const body = trips.length
    ? `${upcoming.length ? `<h2>Próximos</h2><ul class="trips">${upcoming.map(tripCard).join('')}</ul>` : ''}${groups.join('')}`
    : `<div class="empty"><h2>Aún no hay viajes</h2>
        <p>Guarda fechas, ciudades y con quién fuiste. Los países del viaje se marcan solos en el mapa.</p>
        ${store.isEmpty ? '<button class="btn" data-action="demo">Ver con datos de ejemplo</button>' : ''}</div>`;
  $('#view-viajes').innerHTML = `<div class="page">
    <header class="page-head"><h1>Viajes</h1><button class="btn primary" data-action="new-trip">Nuevo viaje</button></header>
    ${body}</div>`;
}

/* Vista: países */
function countryRow(c, statuses, cov) {
  const st = statuses.get(c.c);
  const locked = store.lockReason(c.c);
  const nCities = cov.get(c.c)?.cities.size || 0;
  const known = coverageOf(c.c, cov);
  const seen = st === 'visited' && known ? known.percent : null;
  return `<li class="country-row">
    <button class="country-open" data-action="country" data-code="${c.c}">
      <span class="flag">${c.f}</span><span class="name">${esc(c.n)}</span>
      ${st === 'wish' ? '<span class="badge">Quiero ir</span>' : ''}
      ${nCities ? `<small>${plural(nCities, 'ciudad', 'ciudades')}</small>` : ''}
      ${c.s ? '' : '<small>Territorio</small>'}
      ${seen === null ? '' : `<span class="row-pct" aria-label="${seen} % visto">${seen} %</span>`}
    </button>
    <button class="tick ${st === 'visited' ? 'on' : ''}" data-action="${locked ? 'country' : 'toggle'}" data-code="${c.c}"
      aria-pressed="${st === 'visited'}" aria-label="${esc(c.n)}: visitado">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12.5 4 4 8-9"/></svg>
    </button>
    ${seen ? `<i class="row-bar" style="width:${seen}%"></i>` : ''}
  </li>`;
}

function renderCountryList() {
  const { statuses } = summary();
  const cov = store.coverage();
  const q = fold(listQuery.trim());
  const match = (c) => (!q || fold(c.n).includes(q))
    && (listFilter === 'all' || statuses.get(c.c) === listFilter);
  const html = CONTINENTS.map((r) => {
    const all = countries.filter((c) => c.r === r);
    const shown = all.filter(match);
    if (!shown.length) return '';
    const sov = all.filter((c) => c.s);
    const done = sov.filter((c) => statuses.get(c.c) === 'visited').length;
    return `<h2>${r}${sov.length ? ` <small>${done} de ${sov.length}</small>` : ''}</h2>
      <ul class="countries">${shown.map((c) => countryRow(c, statuses, cov)).join('')}</ul>`;
  }).join('');
  const emptyText = q ? 'Ningún país coincide con la búsqueda.'
    : listFilter === 'wish' ? 'Abre un país y márcalo como «Quiero ir» para verlo aquí.'
      : 'Marca tu primer país con el botón de la derecha.';
  $('#country-list').innerHTML = html || `<p class="empty">${emptyText}</p>`;
}

function renderCountries() {
  const seg = [['all', 'Todos'], ['visited', 'Visitados'], ['wish', 'Quiero ir']];
  $('#view-paises').innerHTML = `<div class="page">
    <header class="page-head"><h1>Países</h1></header>
    <div class="list-tools">
      <input id="list-search" type="search" placeholder="Buscar país" aria-label="Buscar país" value="${esc(listQuery)}" autocomplete="off">
      <div class="segmented" role="group" aria-label="Filtrar países">
        ${seg.map(([v, l]) => `<button data-action="filter" data-value="${v}" aria-pressed="${listFilter === v}">${l}</button>`).join('')}
      </div>
    </div>
    <div id="country-list"></div></div>`;
  $('#list-search').addEventListener('input', (e) => { listQuery = e.target.value; renderCountryList(); });
  renderCountryList();
}

/* Vista: resumen */
function yearBars(years) {
  if (!years.size) return '<p class="muted">Aparecerá cuando registres tu primer viaje.</p>';
  const now = Number(todayISO().slice(0, 4));
  const first = Math.max(Math.min(...years.keys()), now - 11);
  const rows = [];
  for (let y = first; y <= now; y += 1) rows.push([y, years.get(y) || 0]);
  const max = Math.max(...rows.map((r) => r[1]));
  const bars = rows.map(([y, v]) => `<div class="bar-col" tabindex="0" data-tip="${y}: ${plural(v, 'día', 'días')}">
      <span class="bar-value">${v === max ? v : ''}</span>
      <i style="height:${v ? Math.max((v / max) * 100, 2) : 0}%"></i><span class="bar-year">${String(y).slice(2)}</span>
    </div>`).join('');
  const table = rows.map(([y, v]) => `<tr><th>${y}</th><td>${v}</td></tr>`).join('');
  return `<div class="bars" aria-hidden="false">${bars}</div>
    <table class="sr-only"><caption>Días de viaje por año</caption>${table}</table>`;
}

function renderSummary() {
  const s = summary();
  const { trips, settings } = store.state;
  const days = daysByYear(trips);
  const done = store.pastTrips();
  const longest = done.reduce((a, t) => (!a || tripDays(t) > tripDays(a) ? t : a), null);
  const rated = done.filter((t) => t.rating);
  const best = rated.reduce((a, t) => (!a || t.rating > a.rating ? t : a), null);
  const average = rated.length ? rated.reduce((sum, t) => sum + t.rating, 0) / rated.length : null;
  const cov = store.coverage();
  const nCities = [...cov.values()].reduce((sum, e) => sum + e.cities.size, 0);
  const depth = [...cov.keys()]
    .map((code) => ({ c: byCode.get(code), known: coverageOf(code, cov) }))
    .filter((d) => d.known?.done)
    .sort((a, b) => b.known.percent - a.known.percent || a.c.n.localeCompare(b.c.n, 'es'));
  const pending = s.visitedSov.filter((c) => catalog[c.c]?.r.length > 1 && !coverageOf(c.c, cov).done).length;
  const depthList = depth.map(({ c, known }) => `<li><button class="meter-row" data-action="country" data-code="${c.c}">
      <span><span class="flag">${c.f}</span> ${esc(c.n)}</span>
      <span class="meter-n">${known.percent} % · ${known.done} de ${known.total}</span>
      <span class="meter"><i style="width:${known.percent}%"></i></span></button></li>`).join('');
  const tiles = [
    [s.visitedSov.length, s.territories ? `países y ${plural(s.territories, 'territorio', 'territorios')}` : 'países'],
    [`${pct.format(s.share)} %`, 'del mundo'],
    [done.length, done.length === 1 ? 'viaje' : 'viajes'],
    [days.total, days.total === 1 ? 'día de viaje' : 'días de viaje'],
    [nCities, nCities === 1 ? 'ciudad' : 'ciudades'],
    [average ? pct.format(average) : '–', 'nota media'],
  ];
  const meters = CONTINENTS.filter((r) => r !== 'Antártida').map((r) => {
    const all = sovereign.filter((c) => c.r === r);
    const n = all.filter((c) => s.statuses.get(c.c) === 'visited').length;
    return `<li><span>${r}</span><span class="meter-n">${n} de ${all.length}</span>
      <div class="meter"><i style="width:${(n / all.length) * 100}%"></i></div></li>`;
  }).join('');
  const themes = [['auto', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']];
  const backup = settings.lastBackup ? `Última copia: ${dateFmt.format(utc(settings.lastBackup))}.` : 'Aún no has hecho ninguna copia.';
  const standalone = true; // ya está dentro de la app instalada
  $('#view-resumen').innerHTML = `<div class="page">
    <header class="page-head"><h1>Resumen</h1></header>
    ${store.storageOk ? '' : '<p class="warn">Este navegador no está guardando tus datos. Exporta una copia antes de cerrar.</p>'}
    <div class="tiles">${tiles.map(([v, l]) => `<div class="tile"><b>${v}</b><span>${esc(l)}</span></div>`).join('')}</div>
    ${longest ? `<p class="muted">Viaje más largo: <strong>${esc(longest.title)}</strong>, ${plural(tripDays(longest), 'día', 'días')}.</p>` : ''}
    ${best ? `<p class="muted">Mejor nota: <strong>${esc(best.title)}</strong>, ${best.rating} de 10.</p>` : ''}
    <h2>Cuánto conoces de cada país</h2>
    ${depth.length ? `<ul class="meters">${depthList}</ul>` : '<p class="muted">Añade ciudades o regiones a un país para ver qué parte conoces.</p>'}
    ${depth.length && pending ? `<p class="muted">${plural(pending, 'país visitado aún sin regiones', 'países visitados aún sin regiones')}.</p>` : ''}
    <h2>Países por continente</h2><ul class="meters">${meters}</ul>
    <h2>Días de viaje por año</h2>${yearBars(days.years)}
    <h2>Ajustes</h2>
    <div class="setting"><label for="home">País de residencia</label>
      <select id="home"><option value="">Sin indicar</option>
        ${sovereign.map((c) => `<option value="${c.c}" ${settings.home === c.c ? 'selected' : ''}>${esc(c.n)}</option>`).join('')}
      </select></div>
    <div class="setting"><span>Tema</span><div class="segmented" role="group" aria-label="Tema">
      ${themes.map(([v, l]) => `<button data-action="theme" data-value="${v}" aria-pressed="${settings.theme === v}">${l}</button>`).join('')}
    </div></div>
    <h2>Tus datos</h2>
    <p class="muted">Se guardan solo en este dispositivo. Si borras los datos del navegador o cambias de móvil, los recuperas con una copia. ${backup}</p>
    <div class="row-wrap">
      <button class="btn" data-action="export">Exportar copia</button>
      <label class="btn" tabindex="0">Importar copia<input id="import-file" type="file" accept="application/json,.json" hidden></label>
      <button class="btn danger-text" data-action="reset">Borrar todo</button>
    </div>
    ${standalone ? '' : `<h2>Instalar</h2>
      ${installPrompt ? '<button class="btn primary" data-action="install">Instalar Huella</button>'
        : '<p class="muted">En iPhone: Compartir → Añadir a pantalla de inicio. En Android: menú del navegador → Instalar app.</p>'}`}
    <div class="signature"><svg class="logo" viewBox="40 40 432 432" aria-hidden="true"><use href="#huella-mark"/></svg><span>Huella</span></div>
    <p class="credits">Mapa, regiones y ciudades: Natural Earth. Países: world-countries (ODbL). Las fronteras y la lista de ${sovereign.length} países son convenciones de esos datos, no una postura política.</p>
  </div>`;
  $('#home').addEventListener('change', (e) => store.setSetting('home', e.target.value || null));
  $('#import-file').addEventListener('change', importFile);
}

/* Fichas */
function placesSection(code, cov) {
  const entry = cov.get(code);
  const cities = entry ? [...entry.cities.values()] : [];
  const known = coverageOf(code, cov);
  const regions = catalog[code]?.r || [];
  const manual = store.state.regions[code] || [];
  const fromCities = new Set(cities.map((c) => c.r).filter(Boolean));
  const chips = cities.map((c) => (c.fromTrip
    ? `<span class="chip still">${esc(c.n)}</span>`
    : `<button class="chip" data-action="place-remove" data-code="${code}" data-name="${esc(c.n)}" aria-label="Quitar ${esc(c.n)}">${esc(c.n)} ×</button>`)).join('');
  const boxes = regions.map((r) => {
    const byCity = fromCities.has(r);
    const on = byCity || manual.includes(r);
    return `<li><label><input type="checkbox" data-action="region-toggle" data-code="${code}" data-name="${esc(r)}"
      ${on ? 'checked' : ''} ${byCity ? 'disabled' : ''}><span>${esc(r)}</span></label></li>`;
  }).join('');
  return `
    <h3>Qué conoces</h3>
    ${known ? `<div class="coverage">
      <b>${known.percent} %</b><span>${known.done} de ${known.total} regiones</span>
      <div class="meter"><i style="width:${known.percent}%"></i></div>
    </div>` : ''}
    <div class="chips">${chips}</div>
    <input id="place-search" type="search" placeholder="Añadir ciudad" aria-label="Añadir ciudad en este país" autocomplete="off">
    <ul id="place-results" class="results inline" hidden></ul>
    ${known ? `<details id="region-box" ${regionsOpen ? 'open' : ''}>
      <summary>Marcar regiones sin ciudad</summary><ul class="region-list">${boxes}</ul>
    </details>` : ''}`;
}

function openCountry(code, { keepScroll = false } = {}) {
  const c = byCode.get(code);
  const st = store.statusMap().get(code) || null;
  const locked = store.lockReason(code);
  const planned = !locked && st === 'wish' && !store.state.marks[code];
  const trips = store.tripsFor(code);
  const options = [['visited', 'Visitado'], ['wish', 'Quiero ir'], ['', 'Sin marcar']];
  if (!keepScroll) regionsOpen = false;
  openSheet(`
    <header class="sheet-head">
      <span class="sheet-flag">${c.f}</span>
      <div><h2>${esc(c.n)}</h2><p>${c.r}${c.s ? '' : ' · Territorio'}</p></div>
      <button class="close" data-action="close" aria-label="Cerrar">×</button>
    </header>
    <div class="segmented wide" role="group" aria-label="Estado de ${esc(c.n)}">
      ${options.map(([v, l]) => `<button data-action="mark" data-code="${code}" data-value="${v}"
        aria-pressed="${(st || '') === v}" ${locked || planned ? 'disabled' : ''}>${l}</button>`).join('')}
    </div>
    ${locked ? `<p class="muted">${esc(locked)}</p>` : ''}
    ${planned ? '<p class="muted">Tienes un viaje previsto. Pasará a visitado cuando empiece.</p>' : ''}
    ${placesSection(code, store.coverage())}
    ${trips.length ? `<h3>Viajes</h3><ul class="trips">${trips.map(tripCard).join('')}</ul>` : ''}
    <div class="row-end"><button class="btn" data-action="new-trip" data-code="${code}">Añadir viaje aquí</button></div>
  `, { label: c.n, keepScroll });
  const input = $('#place-search');
  const list = $('#place-results');
  const refresh = () => showCityList(input, list, cityOptions(input.value, [code], 'place-add', store.state.places));
  input.addEventListener('input', refresh);
  input.addEventListener('focus', refresh);
  input.addEventListener('click', refresh);
  enterPicksFirst(input, list);
  $('#region-box')?.addEventListener('toggle', (e) => { regionsOpen = e.target.open; });
}

function openTrip(id) {
  const t = store.state.trips.find((x) => x.id === id);
  if (!t) return;
  const chips = t.countries.map((c) => `<button class="chip" data-action="country" data-code="${c}"><span class="flag">${byCode.get(c)?.f}</span>${esc(byCode.get(c)?.n)}</button>`).join('');
  openSheet(`
    <header class="sheet-head">
      <div><h2>${esc(t.title)}</h2><p>${dateRange(t)} · ${plural(tripDays(t), 'día', 'días')}</p></div>
      <button class="close" data-action="close" aria-label="Cerrar">×</button>
    </header>
    ${tripBadge(t)}
    ${t.rating ? `<p class="grade"><b>${t.rating}</b><span>de 10</span></p>` : ''}
    <div class="chips">${chips}</div>
    ${t.cities.length ? `<h3>Ciudades</h3><p>${esc(t.cities.map((c) => c.n).join(', '))}</p>` : ''}
    ${t.companions.length ? `<h3>Con quién</h3><p>${esc(t.companions.join(', '))}</p>` : ''}
    ${t.notes ? `<h3>Notas</h3><p class="notes">${esc(t.notes)}</p>` : ''}
    <div class="row-end">
      <button class="btn danger-text" data-action="delete-trip" data-id="${esc(t.id)}">Eliminar</button>
      <button class="btn primary" data-action="edit-trip" data-id="${esc(t.id)}">Editar</button>
    </div>
  `, { label: t.title });
}

let draftCountries = [];
let draftCities = [];
let draftRating = null;

function renderDraftCities() {
  const input = $('#draft-city');
  input.disabled = !draftCountries.length;
  input.placeholder = draftCountries.length ? 'Escribe para añadir' : 'Añade antes un país';
  $('#draft-city-chips').innerHTML = draftCities.map((c, i) => `<button type="button" class="chip" data-action="draft-city-remove" data-i="${i}"
    aria-label="Quitar ${esc(c.n)}">${esc(c.n)} ×</button>`).join('');
  showCityList(input, $('#draft-city-results'), cityOptions(input.value, draftCountries, 'draft-city-add', draftCities));
}

function syncRating() {
  const box = $('#rating-box');
  const start = $('#trip-form').start.value;
  box.hidden = !!start && start > todayISO();
  box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.value) === draftRating)));
}

function renderDraftChips() {
  $('#draft-chips').innerHTML = draftCountries.map((c) => `<button type="button" class="chip" data-action="draft-remove" data-code="${c}"
    aria-label="Quitar ${esc(byCode.get(c).n)}"><span class="flag">${byCode.get(c).f}</span>${esc(byCode.get(c).n)} ×</button>`).join('');
}

function renderDraftResults() {
  const box = $('#draft-results');
  const q = fold($('#draft-search').value.trim());
  const hits = q ? countries.filter((c) => fold(c.n).includes(q) && !draftCountries.includes(c.c)).slice(0, 5) : [];
  box.hidden = !hits.length;
  box.innerHTML = hits.map((c) => `<li><button type="button" data-action="draft-add" data-code="${c.c}"><span class="flag">${c.f}</span>${esc(c.n)}</button></li>`).join('');
}

function openTripForm(id, presetCountry) {
  const t = store.state.trips.find((x) => x.id === id);
  draftCountries = t ? [...t.countries] : presetCountry ? [presetCountry] : [];
  draftCities = t ? [...t.cities] : [];
  draftRating = t?.rating || null;
  const scale = Array.from({ length: 10 }, (_, i) => i + 1);
  openSheet(`
    <form id="trip-form" data-id="${esc(t?.id || '')}" novalidate>
      <header class="sheet-head">
        <h2>${t ? 'Editar viaje' : 'Nuevo viaje'}</h2>
        <button type="button" class="close" data-action="close" aria-label="Cerrar">×</button>
      </header>
      <label>Países
        <input id="draft-search" type="search" placeholder="Escribe para añadir" autocomplete="off">
      </label>
      <ul id="draft-results" class="results inline" hidden></ul>
      <div id="draft-chips" class="chips"></div>
      <div class="two">
        <label>Inicio <input name="start" type="date" required value="${esc(t?.start || '')}"></label>
        <label>Fin <input name="end" type="date" value="${esc(t?.end || '')}" min="${esc(t?.start || '')}"></label>
      </div>
      <label>Título <input name="title" maxlength="200" placeholder="Si lo dejas vacío, usaré los países" value="${esc(t?.title || '')}"></label>
      <label>Ciudades <input id="draft-city" type="search" autocomplete="off"></label>
      <ul id="draft-city-results" class="results inline" hidden></ul>
      <div id="draft-city-chips" class="chips"></div>
      <fieldset id="rating-box" class="rating">
        <legend>Nota</legend>
        <div class="rate-row">${scale.map((n) => `<button type="button" data-action="rate" data-value="${n}" aria-pressed="false" aria-label="Nota ${n}">${n}</button>`).join('')}</div>
      </fieldset>
      <label>Con quién <input name="companions" placeholder="Separado por comas" value="${esc(t?.companions.join(', ') || '')}"></label>
      <label>Notas <textarea name="notes" rows="3" maxlength="5000">${esc(t?.notes || '')}</textarea></label>
      <p id="trip-error" class="error" role="alert" hidden></p>
      <div class="row-end">
        <button type="button" class="btn" data-action="close">Cancelar</button>
        <button class="btn primary">Guardar</button>
      </div>
    </form>`, { lock: true, label: t ? 'Editar viaje' : 'Nuevo viaje' });
  renderDraftChips();
  renderDraftCities();
  syncRating();
  $('#draft-search').addEventListener('input', renderDraftResults);
  enterPicksFirst($('#draft-search'), $('#draft-results'));
  $('#draft-city').addEventListener('input', renderDraftCities);
  $('#draft-city').addEventListener('focus', renderDraftCities);
  $('#draft-city').addEventListener('click', renderDraftCities);
  enterPicksFirst($('#draft-city'), $('#draft-city-results'));
  const form = $('#trip-form');
  form.start.addEventListener('change', () => {
    form.end.min = form.start.value;
    if (!form.end.value || form.end.value < form.start.value) form.end.value = form.start.value;
    syncRating();
  });
  form.addEventListener('submit', submitTrip);
}

function submitTrip(e) {
  e.preventDefault();
  const f = e.target;
  const list = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);
  const start = f.start.value;
  const end = f.end.value || start;
  const fail = (msg) => { const el = $('#trip-error'); el.textContent = msg; el.hidden = false; };
  if (!draftCountries.length) return fail('Añade al menos un país.');
  if (!start) return fail('Indica la fecha de inicio.');
  if (end < start) return fail('La fecha de fin no puede ser anterior al inicio.');
  const trip = {
    id: f.dataset.id || crypto.randomUUID(),
    title: f.title.value.trim() || names(draftCountries),
    start,
    end,
    countries: draftCountries,
    cities: draftCities,
    companions: list(f.companions.value),
    notes: f.notes.value.trim(),
    rating: start > todayISO() ? null : draftRating,
  };
  store.saveTrip(trip);
  requestPersistence();
  openTrip(trip.id);
}

/* Copias de seguridad */
function exportBackup() {
  const url = URL.createObjectURL(new Blob([store.exportJSON()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `huella-copia-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Copia exportada');
}

async function importFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let backup;
  try {
    backup = store.parseBackup(await file.text());
  } catch {
    toast('No se pudo leer el archivo. ¿Es una copia de Huella?');
    return;
  }
  if (!store.isEmpty && !await ask('La copia sustituirá todos tus datos actuales.', 'Sustituir')) return;
  store.applyBackup(backup);
  toast('Copia importada');
}

function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}

function applyTheme() {
  window.huellaEmbed.refreshTheme(); // el tema lo decide la app
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  document.querySelector('meta[name=theme-color]').content = paper;
}

/* Acciones */
const actions = {
  close: () => closeSheet(),
  country: ({ code }) => openCountry(code),
  find({ code }) {
    search.value = '';
    results.hidden = true;
    map.focus(code);
    openCountry(code);
  },
  toggle({ code }) {
    const next = store.state.marks[code] === 'visited' ? null : 'visited';
    store.setMark(code, next);
    requestPersistence();
  },
  mark({ code, value }) {
    store.setMark(code, value || null);
    requestPersistence();
    openCountry(code);
  },
  filter({ value }) {
    listFilter = value;
    renderCountries();
  },
  theme({ value }) {
    store.setSetting('theme', value);
    applyTheme();
  },
  trip: ({ id }) => openTrip(id),
  'new-trip': ({ code }) => openTripForm(null, code),
  'edit-trip': ({ id }) => openTripForm(id),
  async 'delete-trip'({ id }) {
    const t = store.state.trips.find((x) => x.id === id);
    if (!t || !await ask(`¿Eliminar «${t.title}»?`, 'Eliminar')) return;
    closeSheet(() => {
      const undo = store.removeTrip(id);
      toast('Viaje eliminado', undo);
    });
  },
  'draft-add'({ code }) {
    draftCountries.push(code);
    $('#draft-search').value = '';
    renderDraftResults();
    renderDraftChips();
    renderDraftCities();
    $('#draft-search').focus();
  },
  'draft-remove'({ code }) {
    draftCountries = draftCountries.filter((c) => c !== code);
    draftCities = draftCities.filter((c) => c.c !== code);
    renderDraftChips();
    renderDraftCities();
  },
  'draft-city-add'(data) {
    draftCities.push(cityFromAction(data));
    $('#draft-city').value = '';
    renderDraftCities();
    $('#draft-city').focus();
  },
  'draft-city-remove'({ i }) {
    draftCities.splice(Number(i), 1);
    renderDraftCities();
  },
  rate({ value }) {
    const n = Number(value);
    draftRating = draftRating === n ? null : n;
    syncRating();
  },
  'place-add'(data) {
    store.addPlace(cityFromAction(data));
    requestPersistence();
    openCountry(data.code, { keepScroll: true });
    $('#place-search').focus();
  },
  'place-remove'({ code, name }) {
    store.removePlace(code, name);
    openCountry(code, { keepScroll: true });
  },
  'region-toggle'({ code, name }) {
    store.toggleRegion(code, name);
    requestPersistence();
    openCountry(code, { keepScroll: true });
  },
  demo: () => store.loadDemo(),
  export: exportBackup,
  async reset() {
    if (await ask('Se borrarán todos tus viajes y marcas de este dispositivo. No se puede deshacer.', 'Borrar todo')) {
      store.reset();
      toast('Datos borrados');
    }
  },
  async install() {
    installPrompt?.prompt();
    await installPrompt?.userChoice;
    installPrompt = null;
    renderSummary();
  },
};

function closeCityLists(target) {
  for (const [inputId, listId] of [['place-search', 'place-results'], ['draft-city', 'draft-city-results']]) {
    const list = document.getElementById(listId);
    const active = document.activeElement?.id === inputId;
    if (list && !active && !target.closest(`#${listId}`)) list.hidden = true;
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) actions[el.dataset.action]?.(el.dataset);
  if (!e.target.closest('.map-search')) results.hidden = true;
  closeCityLists(e.target);
});

/* Navegación */
const renderers = { mapa: () => {}, viajes: renderTrips, paises: renderCountries, resumen: renderSummary };

function route() {
  const name = location.hash.replace('#/', '');
  tab = renderers[name] ? name : 'mapa';
  for (const key of Object.keys(renderers)) $(`#view-${key}`).hidden = key !== tab;
  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  renderers[tab]();
  if (tab === 'mapa') map.measure();
}

window.addEventListener('hashchange', route);
store.subscribe(() => {
  renderHero();
  // En Países solo se repinta la lista para no perder el foco de la búsqueda.
  if (tab === 'paises') renderCountryList();
  else renderers[tab]();
});
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (tab === 'resumen') renderSummary();
});

applyTheme();
hideSplash();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
renderHero();
route();

