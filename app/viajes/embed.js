// Puente entre Huella y la app que la contiene.
(() => {
  const root = document.documentElement;
  const host = window.parent;

  function refreshTheme() {
    const hostRoot = host.document.documentElement;
    root.dataset.theme = hostRoot.dataset.theme || 'light';
    root.style.setProperty('--app-sheet', host.getComputedStyle(hostRoot).getPropertyValue('--sheet'));
  }

  window.huellaEmbed = {
    refreshTheme,
    setSafeBottom: (value) => root.style.setProperty('--safe-b', value),
    // Dirección completa: esta función se llama desde la app y una relativa saldría de su página.
    go: (view) => location.replace(`${location.href.split('#')[0]}#/${view}`),
  };
  refreshTheme();

  // Las ventanas de Huella ocupan la pantalla: la barra de la app no debe taparlas.
  document.addEventListener('DOMContentLoaded', () => {
    const dialogs = [...document.querySelectorAll('dialog')];
    const report = () => host.onTravelOverlay?.(dialogs.some((d) => d.open));
    const watcher = new MutationObserver(report);
    dialogs.forEach((d) => watcher.observe(d, { attributes: true, attributeFilter: ['open'] }));
    host.onTravelReady?.();
  });
})();
