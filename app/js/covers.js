// Portadas de los libros. Van en IndexedDB porque en localStorage no cabrían junto al resto de datos.
// Se cargan en memoria al abrir la app, así se pintan y se copian sin esperar.
const DB_NAME = 'habitos-covers';
const STORE = 'covers';

const cache = new Map();
let dbPromise = null;

function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function write(action) {
  try {
    const db = await openDb();
    action(db.transaction(STORE, 'readwrite').objectStore(STORE));
  } catch (err) {
    console.error('No se pudo guardar la portada', err);
  }
}

export async function loadCovers() {
  try {
    const db = await openDb();
    const store = db.transaction(STORE).objectStore(STORE);
    await new Promise((resolve, reject) => {
      const request = store.openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        cache.set(cursor.key, cursor.value);
        cursor.continue();
      };
    });
  } catch (err) {
    console.error('No se pudieron leer las portadas', err);
  }
}

export const getCover = (id) => cache.get(id) || null;

export function setCover(id, dataUrl) {
  cache.set(id, dataUrl);
  write((store) => store.put(dataUrl, id));
}

export function deleteCover(id) {
  cache.delete(id);
  write((store) => store.delete(id));
}

export const allCovers = () => Object.fromEntries(cache);

export function replaceCovers(covers) {
  cache.clear();
  Object.entries(covers).forEach(([id, dataUrl]) => cache.set(id, dataUrl));
  write((store) => {
    store.clear();
    cache.forEach((dataUrl, id) => store.put(dataUrl, id));
  });
}
