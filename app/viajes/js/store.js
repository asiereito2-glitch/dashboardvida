// Estado de la app y datos derivados. Todo vive en este dispositivo (localStorage).
const KEY = 'huella.v1';
const MAX_NOTES = 5000;

const empty = () => ({
  version: 2,
  marks: {},
  trips: [],
  places: [], // ciudades añadidas directamente a un país, sin viaje
  regions: {}, // regiones marcadas a mano: { código: [nombres] }
  settings: { theme: 'auto', home: null, lastBackup: null },
});

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const texts = (v) => (Array.isArray(v) ? v.map((x) => text(x)).filter(Boolean).slice(0, 100) : []);
const sameName = (a, b) => a.toLocaleLowerCase('es') === b.toLocaleLowerCase('es');

/** Convierte una fila de data/cities.json en una ciudad autónoma. */
export const cityFromCatalog = (catalog, code, row) => {
  const [n, region, x, y] = row;
  return { n, c: code, r: catalog[code]?.r[region] ?? null, x, y };
};

/** Acepta una ciudad guardada o, de copias antiguas, un simple nombre dentro de un viaje. */
function toCity(value, tripCountries, { validCodes, catalog }) {
  if (typeof value === 'string') {
    const name = text(value);
    if (!name) return null;
    for (const code of tripCountries) {
      const row = catalog[code]?.c.find((e) => sameName(e[0], name));
      if (row) return cityFromCatalog(catalog, code, row);
    }
    return tripCountries.length ? { n: name, c: tripCountries[0], r: null } : null;
  }
  if (!value || !validCodes.has(value.c) || !text(value.n)) return null;
  const city = {
    n: text(value.n),
    c: value.c,
    r: catalog[value.c]?.r.includes(value.r) ? value.r : null,
  };
  if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
    city.x = value.x;
    city.y = value.y;
  }
  return city;
}

/** Normaliza datos externos (copias importadas o almacenamiento antiguo). Lanza si no son válidos. */
export function sanitize(raw, ctx) {
  if (!raw || typeof raw !== 'object' || !raw.marks || typeof raw.marks !== 'object' || !Array.isArray(raw.trips)) {
    throw new Error('El archivo no es una copia de Huella.');
  }
  const { validCodes, catalog } = ctx;
  const out = empty();
  for (const [code, mark] of Object.entries(raw.marks)) {
    if (validCodes.has(code) && (mark === 'visited' || mark === 'wish')) out.marks[code] = mark;
  }
  for (const t of raw.trips) {
    if (!t || !isDate(t.start)) continue;
    const countries = [...new Set(Array.isArray(t.countries) ? t.countries : [])].filter((c) => validCodes.has(c));
    out.trips.push({
      id: text(t.id, 64) || crypto.randomUUID(),
      title: text(t.title),
      start: t.start,
      end: isDate(t.end) && t.end >= t.start ? t.end : t.start,
      countries,
      cities: (Array.isArray(t.cities) ? t.cities : []).map((v) => toCity(v, countries, ctx)).filter(Boolean),
      companions: texts(t.companions),
      notes: text(t.notes, MAX_NOTES),
      rating: Number.isInteger(t.rating) && t.rating >= 1 && t.rating <= 10 ? t.rating : null,
    });
  }
  if (Array.isArray(raw.places)) out.places = raw.places.map((v) => toCity(v, [], ctx)).filter(Boolean);
  for (const [code, names] of Object.entries(raw.regions && typeof raw.regions === 'object' ? raw.regions : {})) {
    const valid = Array.isArray(names) ? names.filter((n) => catalog[code]?.r.includes(n)) : [];
    if (valid.length) out.regions[code] = [...new Set(valid)];
  }
  const s = raw.settings || {};
  if (['auto', 'light', 'dark'].includes(s.theme)) out.settings.theme = s.theme;
  if (validCodes.has(s.home)) out.settings.home = s.home;
  if (isDate(s.lastBackup)) out.settings.lastBackup = s.lastBackup;
  return out;
}

export function createStore(countries, catalog) {
  const ctx = { validCodes: new Set(countries.map((c) => c.c)), catalog };
  const listeners = new Set();
  let state = empty();
  let storageOk = true;

  try {
    const saved = localStorage.getItem(KEY);
    if (saved) state = sanitize(JSON.parse(saved), ctx);
  } catch {
    storageOk = false;
  }

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageOk = true;
    } catch {
      storageOk = false;
    }
    listeners.forEach((fn) => fn());
  };

  const pastTrips = () => state.trips.filter((t) => t.start <= todayISO());

  /** Ciudades y regiones conocidas por país. Las de viajes futuros aún no cuentan. */
  const coverage = () => {
    const out = new Map();
    const entry = (code) => {
      if (!out.has(code)) out.set(code, { cities: new Map(), regions: new Set() });
      return out.get(code);
    };
    const add = (city, fromTrip) => {
      const e = entry(city.c);
      const key = city.n.toLocaleLowerCase('es');
      const prev = e.cities.get(key);
      e.cities.set(key, { ...prev, ...city, fromTrip: fromTrip || !!prev?.fromTrip });
      if (city.r) e.regions.add(city.r);
    };
    state.places.forEach((city) => add(city, false));
    pastTrips().forEach((t) => t.cities.forEach((city) => add(city, true)));
    for (const [code, names] of Object.entries(state.regions)) names.forEach((n) => entry(code).regions.add(n));
    return out;
  };

  return {
    subscribe: (fn) => listeners.add(fn),
    get state() { return state; },
    get storageOk() { return storageOk; },
    get isEmpty() {
      return !state.trips.length && !Object.keys(state.marks).length
        && !state.places.length && !Object.keys(state.regions).length;
    },
    pastTrips,
    coverage,

    /** 'visited' | 'wish' por país. Un viaje futuro cuenta como «quiero ir», no como visitado. */
    statusMap() {
      const out = new Map();
      for (const t of state.trips) {
        if (t.start > todayISO()) t.countries.forEach((c) => out.set(c, 'wish'));
      }
      for (const [c, m] of Object.entries(state.marks)) out.set(c, m);
      for (const t of pastTrips()) t.countries.forEach((c) => out.set(c, 'visited'));
      for (const code of coverage().keys()) out.set(code, 'visited');
      if (state.settings.home) out.set(state.settings.home, 'visited');
      return out;
    },
    /** Motivo por el que un país sigue visitado aunque se quite la marca manual. */
    lockReason(code) {
      if (state.settings.home === code) return 'Es tu país de residencia. Puedes cambiarlo en Resumen.';
      const n = pastTrips().filter((t) => t.countries.includes(code)).length;
      if (n) return `${n === 1 ? 'Está en 1 viaje' : `Está en ${n} viajes`}. Para desmarcarlo, quítalo del viaje.`;
      if (coverage().has(code)) return 'Tienes ciudades o regiones aquí. Para desmarcarlo, quítalas.';
      return null;
    },
    tripsFor: (code) => state.trips
      .filter((t) => t.countries.includes(code))
      .sort((a, b) => b.start.localeCompare(a.start)),

    setMark(code, mark) {
      if (mark) state.marks[code] = mark; else delete state.marks[code];
      save();
    },
    addPlace(city) {
      if (state.places.some((p) => p.c === city.c && sameName(p.n, city.n))) return;
      state.places.push(city);
      save();
    },
    removePlace(code, name) {
      state.places = state.places.filter((p) => !(p.c === code && sameName(p.n, name)));
      save();
    },
    toggleRegion(code, name) {
      const list = state.regions[code] || [];
      const next = list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
      if (next.length) state.regions[code] = next; else delete state.regions[code];
      save();
    },
    saveTrip(trip) {
      const i = state.trips.findIndex((t) => t.id === trip.id);
      if (i >= 0) state.trips[i] = trip; else state.trips.push(trip);
      save();
    },
    /** Elimina un viaje y devuelve la función que lo restaura. */
    removeTrip(id) {
      const i = state.trips.findIndex((t) => t.id === id);
      if (i < 0) return () => {};
      const [trip] = state.trips.splice(i, 1);
      save();
      return () => { state.trips.splice(i, 0, trip); save(); };
    },
    setSetting(key, value) { state.settings[key] = value; save(); },

    exportJSON() {
      state.settings.lastBackup = todayISO();
      save();
      return JSON.stringify({ app: 'huella', exportedAt: new Date().toISOString(), ...state }, null, 2);
    },
    /** Valida una copia sin aplicarla. Lanza si no es válida. */
    parseBackup: (json) => sanitize(JSON.parse(json), ctx),
    applyBackup(next) {
      next.settings.theme = state.settings.theme;
      state = next;
      save();
    },
    reset() {
      const { theme } = state.settings;
      state = empty();
      state.settings.theme = theme;
      save();
    },
    loadDemo() {
      const year = Number(todayISO().slice(0, 4));
      const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
      const trip = (title, start, end, list, cities, companions, rating) => ({
        id: crypto.randomUUID(),
        title,
        start,
        end,
        countries: list,
        cities,
        companions,
        rating,
        notes: 'Viaje de ejemplo.',
      });
      state = sanitize({
        marks: { FRA: 'visited', DEU: 'visited', ISL: 'wish', NZL: 'wish' },
        places: [{ n: 'Nueva York', c: 'USA', r: 'Nueva York', x: 622, y: 242.7 }],
        trips: [
          trip('Lisboa y Oporto', `${year - 3}-04-12`, `${year - 3}-04-18`, ['PRT'], ['Lisboa', 'Oporto'], ['Ana'], 8),
          trip('Ruta por Italia', `${year - 2}-08-02`, `${year - 2}-08-15`, ['ITA', 'VAT'], ['Roma', 'Florencia', 'Nápoles'], ['Ana', 'Leo'], 9),
          trip('Japón en otoño', `${year - 1}-10-20`, `${year - 1}-11-05`, ['JPN'], ['Tokio', 'Kioto', 'Osaka'], [], 10),
          trip('Marruecos', `${year}-03-08`, `${year}-03-14`, ['MAR'], ['Marrakech', 'Fez'], ['Leo'], 7),
          trip('México y Guatemala', `${year}-06-01`, `${year}-06-24`, ['MEX', 'GTM'], ['Oaxaca', 'Antigua'], [], 9),
          trip('Perú', inDays(40), inDays(54), ['PER'], ['Cuzco', 'Lima'], ['Ana'], null),
        ],
        settings: state.settings,
      }, ctx);
      save();
    },
  };
}

const dayNum = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 864e5);
const isoFromDay = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
export const tripDays = (t) => dayNum(t.end) - dayNum(t.start) + 1;
export const daysUntil = (iso) => dayNum(iso) - dayNum(todayISO());

/** Días distintos de viaje hasta hoy, por año. Los viajes solapados no se cuentan dos veces. */
export function daysByYear(trips) {
  const today = dayNum(todayISO());
  const seen = new Set();
  for (const t of trips) {
    for (let d = dayNum(t.start); d <= Math.min(dayNum(t.end), today); d += 1) seen.add(d);
  }
  const years = new Map();
  for (const d of seen) {
    const y = Number(isoFromDay(d).slice(0, 4));
    years.set(y, (years.get(y) || 0) + 1);
  }
  return { total: seen.size, years };
}
