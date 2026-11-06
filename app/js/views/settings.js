// Ajustes: copias de seguridad, categorías y borrado de datos.
import {
  deleteCategory, exportJson, importJson, markBackupDone, resetAll, save, state, uid, updateCategory,
} from '../store.js';
import { onDayLabel, todayKey } from '../dates.js';
import { getPhoto, savePhoto } from '../appearance.js';
import {
  ATTRIBUTES, attributeOfCategory, computeXp, gameEnabled, levelInfo,
} from '../game.js';
import { icons } from '../icons.js';
import {
  closeSheet, confirmSheet, esc, openSheet, showToast,
} from '../ui.js';

let notice = null; // mensaje breve tras exportar/importar
const RELOAD_DELAY_MS = 900;

function balanceMovements() {
  try {
    return JSON.parse(localStorage.getItem('balance_app_local_v1'))?.transactions?.length || 0;
  } catch {
    return 0;
  }
}

function importMessage(text) {
  try {
    const movements = JSON.parse(text).balance?.transactions?.length;
    if (movements !== undefined) return `Se sustituirán todos tus datos, también Balance (la copia trae ${movements} ${movements === 1 ? 'movimiento' : 'movimientos'}).`;
  } catch {
    // Si el archivo no es válido, se avisa al intentar importarlo.
  }
  return 'Se sustituirán tus hábitos, tareas, metas y ánimo. Balance no cambia.';
}

async function exportBackup() {
  const name = `habitos-copia-${todayKey()}.json`;
  const file = new File([exportJson()], name, { type: 'application/json' });
  // En iPhone, compartir el archivo permite guardarlo en Archivos o enviarlo.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function openCategorySheet(category) {
  const isNew = !category;
  const data = category ? { ...category } : { name: '', emoji: '🏷️' };
  let attribute = attributeOfCategory(category?.id);
  openSheet(isNew ? 'Nueva categoría' : 'Editar categoría', `
    <div class="name-row">
      <input class="text-input" data-cat-emoji maxlength="8" value="${esc(data.emoji)}"
        style="flex:none;width:60px;height:52px;text-align:center;font-size:24px;padding:0">
      <input class="text-input" data-cat-name maxlength="30" placeholder="Nombre" value="${esc(data.name)}" style="height:52px">
    </div>
    ${gameEnabled() ? `
      <p class="small muted" style="margin:16px 0 8px">Atributo que sube con sus hábitos</p>
      <div class="attr-chips">
        ${ATTRIBUTES.map((a) => `
          <button data-attr="${a.id}" class="${a.id === attribute ? 'on' : ''}">${a.emoji} ${a.label}</button>`).join('')}
      </div>` : ''}
    <div class="option-list" style="margin-top:16px">
      <button data-cat-save style="justify-content:center;font-weight:600">Guardar</button>
      ${isNew ? '' : '<button data-cat-delete style="justify-content:center;color:var(--red)">Eliminar categoría</button>'}
    </div>`, (sheet) => {
    sheet.querySelectorAll('[data-attr]').forEach((b) => {
      b.onclick = () => {
        attribute = b.dataset.attr;
        sheet.querySelectorAll('[data-attr]').forEach((x) => x.classList.toggle('on', x === b));
      };
    });
    sheet.querySelector('[data-cat-save]').onclick = () => {
      const name = sheet.querySelector('[data-cat-name]').value.trim();
      const emoji = sheet.querySelector('[data-cat-emoji]').value.trim() || '🏷️';
      if (!name) return;
      closeSheet();
      if (isNew) {
        state.categories.push({ id: uid(), name, emoji, attribute });
        save();
      } else {
        updateCategory(category.id, { name, emoji, attribute });
      }
    };
    sheet.querySelector('[data-cat-delete]')?.addEventListener('click', () => {
      const used = state.habits.filter((h) => h.categoryId === category.id).length;
      confirmSheet('Eliminar categoría',
        used ? `${used} hábito${used === 1 ? '' : 's'} quedará${used === 1 ? '' : 'n'} sin categoría.` : `Se eliminará "${category.name}".`,
        'Eliminar', () => deleteCategory(category.id));
    });
  });
}

export function renderSettings(root, params, entering) {
  if (entering) notice = null;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const counts = [
    plural(state.habits.length, 'hábito', 'hábitos'),
    plural(state.todos.length, 'tarea', 'tareas'),
    plural(Object.keys(state.moods).length, 'día de ánimo', 'días de ánimo'),
    plural(Object.keys(state.body.weights).length, 'registro de peso', 'registros de peso'),
    plural(Object.keys(state.body.sleep).length, 'noche', 'noches'),
    plural(balanceMovements(), 'movimiento', 'movimientos'),
  ].join(' · ');

  const generalTab = `
    <div class="settings-group-title">Tú</div>
    <div class="card settings-group">
      <label class="field-row"><span>Tu nombre</span>
        <input class="num-input name-input" data-user-name maxlength="30" placeholder="Para saludarte" value="${esc(state.settings.name || '')}"></label>
    </div>

    <div class="settings-group-title">Pantallas</div>
    <div class="card settings-group">
      <div class="option-list" style="margin-bottom:16px">
        <button data-customize-home><span style="font-size:20px">🏠</span><span class="grow">Personalizar Inicio</span>${icons.chevronRight}</button>
      </div>
      <label class="switch-row">
        <span class="grow">
          <span style="display:block">Mostrar tareas</span>
          <span class="small muted">Si lo desactivas, se ocultan sin borrarse.</span>
        </span>
        <input type="checkbox" class="switch" data-show-todos ${state.settings.showTodos ? 'checked' : ''}>
      </label>
      <label class="switch-row" style="margin-top:16px">
        <span class="grow">
          <span style="display:block">Modo juego</span>
          <span class="small muted">Experiencia, niveles y atributos. Si lo apagas, no se pierde nada.</span>
        </span>
        <input type="checkbox" class="switch" data-game-mode ${state.settings.gameMode ? 'checked' : ''}>
      </label>
    </div>`;

  const dataTab = `
    <div class="settings-group-title">Copia de seguridad</div>
    <div class="card settings-group">
      <p class="small muted" style="margin:0 0 12px">Tus datos se guardan solo en este dispositivo. La copia incluye todo: hábitos, tareas, metas, ánimo, peso, sueño y Balance.</p>
      <p class="small muted" style="margin:0 0 12px">${state.settings.lastBackupOn ? `Última copia: ${onDayLabel(state.settings.lastBackupOn)}.` : 'Aún no has hecho ninguna copia.'}</p>
      <div class="small muted" style="margin-bottom:12px">${counts}</div>
      <div class="option-list">
        <button data-export><span style="font-size:20px">📤</span><span class="grow">Exportar copia</span>${icons.chevronRight}</button>
        <button data-import><span style="font-size:20px">📥</span><span class="grow">Importar copia</span>${icons.chevronRight}</button>
      </div>
      <input type="file" accept="application/json,.json" data-file hidden>
    </div>

    <div class="settings-group-title">Zona peligrosa</div>
    <div class="card settings-group">
      <div class="option-list">
        <button data-reset style="color:var(--red)"><span style="font-size:20px">🗑️</span><span class="grow">Borrar todos los datos</span></button>
      </div>
    </div>`;

  const categoriesTab = `
    <div class="card settings-group">
      <div class="option-list">
        ${state.categories.map((c) => `
          <button data-cat="${c.id}">
            <span style="font-size:20px">${esc(c.emoji)}</span>
            <span class="grow">${esc(c.name)}</span>
            ${gameEnabled() ? `<span class="small muted">${ATTRIBUTES.find((a) => a.id === attributeOfCategory(c.id)).emoji}</span>` : ''}
            <span class="small muted">${state.habits.filter((h) => h.categoryId === c.id).length || ''}</span>
            ${icons.chevronRight}
          </button>`).join('')}
        <button data-cat-new><span style="font-size:20px">➕</span><span class="grow">Nueva categoría</span></button>
      </div>
    </div>`;

  const theme = state.settings.theme === 'dark' ? 'dark' : 'light';
  const wallpaper = state.settings.wallpaper || 'warm';
  const photo = getPhoto();
  const wallOption = (id, label, style = '') => `
    <button class="wall-option ${wallpaper === id ? 'on' : ''}" data-wall="${id}">
      <span class="wall-preview ${id}" ${style}></span>${label}
    </button>`;

  const lookTab = `
    <div class="settings-group-title">Tema</div>
    <div class="card settings-group">
      <div class="segmented two">
        <button data-theme-opt="light" class="${theme === 'light' ? 'on' : ''}">Claro</button>
        <button data-theme-opt="dark" class="${theme === 'dark' ? 'on' : ''}">Oscuro</button>
      </div>
    </div>

    <div class="settings-group-title">Fondo</div>
    <div class="card settings-group">
      <div class="wall-grid">
        ${wallOption('warm', 'Cálido')}
        ${wallOption('sand', 'Arena')}
        ${wallOption('sage', 'Salvia')}
      </div>
      <div class="option-list" style="margin-top:14px">
        ${photo ? `<button data-wall="photo" class="${wallpaper === 'photo' ? 'on' : ''}"><span style="font-size:20px">🖼️</span><span class="grow">Usar mi foto</span></button>` : ''}
        <button data-photo-pick><span style="font-size:20px">📷</span><span class="grow">${photo ? 'Cambiar foto' : 'Poner una foto mía'}</span>${icons.chevronRight}</button>
      </div>
      <input type="file" accept="image/*" data-photo-file hidden>
      <p class="small muted" style="margin:12px 0 0">La foto se difumina y se guarda solo en este dispositivo: no entra en las copias de seguridad.</p>
    </div>`;

  const tab = params.tab || 'general';
  const tabs = {
    general: { title: 'Ajustes', html: generalTab },
    categories: { title: 'Categorías', html: categoriesTab },
    look: { title: 'Apariencia', html: lookTab },
    data: { title: 'Datos', html: dataTab },
  };

  root.innerHTML = `
    <header class="page-header"><h1 class="page-title">${tabs[tab].title}</h1></header>
    ${notice ? `<div class="notice ${notice.error ? 'error' : ''}">${esc(notice.text)}</div>` : ''}
    ${tabs[tab].html}`;

  const rerender = () => renderSettings(root, params, false);

  root.querySelector('[data-customize-home]')?.addEventListener('click', () => { location.hash = '#/settings/home'; });
  root.querySelector('[data-user-name]')?.addEventListener('change', (e) => {
    state.settings.name = e.target.value.trim();
    save();
  });
  root.querySelector('[data-show-todos]')?.addEventListener('change', (e) => {
    state.settings.showTodos = e.target.checked;
    save();
  });
  root.querySelector('[data-game-mode]')?.addEventListener('change', (e) => {
    state.settings.gameMode = e.target.checked;
    // Al activarlo no se celebran de golpe los niveles ganados con el historial previo.
    if (e.target.checked) state.settings.lastLevelSeen = levelInfo(computeXp().total).level;
    save();
  });

  root.querySelectorAll('[data-theme-opt]').forEach((b) => {
    b.onclick = () => { state.settings.theme = b.dataset.themeOpt; save(); };
  });
  root.querySelectorAll('[data-wall]').forEach((b) => {
    b.onclick = () => { state.settings.wallpaper = b.dataset.wall; save(); };
  });
  const photoInput = root.querySelector('[data-photo-file]');
  root.querySelector('[data-photo-pick]')?.addEventListener('click', () => photoInput.click());
  if (photoInput) photoInput.onchange = async () => {
    const file = photoInput.files[0];
    if (!file) return;
    if (await savePhoto(file)) {
      state.settings.wallpaper = 'photo';
      save();
    } else {
      notice = { text: 'No se pudo usar esa foto.', error: true };
      rerender();
    }
  };

  root.querySelector('[data-export]')?.addEventListener('click', async () => {
    if (await exportBackup()) {
      notice = { text: 'Copia exportada.' };
      markBackupDone();
    }
  });

  const fileInput = root.querySelector('[data-file]');
  root.querySelector('[data-import]')?.addEventListener('click', () => fileInput.click());
  if (fileInput) fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const text = await file.text();
    fileInput.value = ''; // permite volver a elegir el mismo archivo
    confirmSheet('Importar copia', importMessage(text), 'Importar', () => {
      try {
        if (importJson(text)) {
          // Balance y Viajes tienen que volver a arrancar con los datos restaurados.
          showToast('Copia importada');
          setTimeout(() => location.reload(), RELOAD_DELAY_MS);
          return;
        }
        notice = { text: 'Copia importada correctamente.' };
      } catch (err) {
        notice = { text: err instanceof SyntaxError ? 'El archivo no es un JSON válido.' : err.message, error: true };
      }
      rerender();
    });
  };

  root.querySelectorAll('[data-cat]').forEach((b) => {
    b.onclick = () => openCategorySheet(state.categories.find((c) => c.id === b.dataset.cat));
  });
  root.querySelector('[data-cat-new]')?.addEventListener('click', () => openCategorySheet(null));

  root.querySelector('[data-reset]')?.addEventListener('click', () => {
    confirmSheet('Borrar todos los datos', 'Se eliminarán hábitos, tareas, metas, ánimo, peso y sueño. Balance y Viajes no se tocan: se borran desde sus propios ajustes.', 'Borrar todo', () => {
      resetAll();
      notice = { text: 'Datos borrados.' };
      rerender();
    });
  });
}
