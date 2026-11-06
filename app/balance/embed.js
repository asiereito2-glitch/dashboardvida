// Puente entre Balance y la app: este archivo se ejecuta después del script de Balance,
// así que puede usar sus funciones y su estado sin modificarlos.
(() => {
  const app = window.parent !== window ? window.parent : null;
  const SUMMARY_KEY = 'balance_summary';
  const READY_RETRY_MS = 100;

  // ---------- Tema: lo decide la app, no Balance ----------

  function appTheme() {
    try {
      return app?.document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  applyTheme = () => { document.documentElement.dataset.theme = appTheme(); };
  applyStyle = () => { document.documentElement.dataset.style = 'glass'; };
  applyTheme();
  applyStyle();

  // ---------- Resumen para Inicio, calculado con las propias funciones de Balance ----------

  function publishSummary() {
    if (!state.ready) return;
    const now = new Date();
    const today = todayIso();
    const month = txInMonth(now.getFullYear(), now.getMonth());
    const { income, expense, balance } = sumTx(month.filter((t) => !isExtra(t)));
    const spentToday = month
      .filter((t) => t.date === today && t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const summary = {
      day: today,
      income,
      expense,
      saved: balance,
      spentToday,
      netWorth: patrimonioTotal(),
      liquidity: accountGroupTotals().liquidez.amount,
      accounts: orderedAccounts().map((a) => ({ id: a.id, name: a.name, balance: accountBalance(a) })),
      currency: state.profile.currency,
      name: state.profile.displayName || '',
    };
    try {
      localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
    } catch (err) {
      console.error('No se pudo guardar el resumen de Balance', err);
    }
    app?.onBalanceSummary?.();
  }

  const originalRenderAll = renderAll;
  renderAll = function renderAllAndPublish() {
    originalRenderAll();
    publishSummary();
  };

  // ---------- Copia de seguridad: compartir, que es lo que funciona en iPhone ----------

  const originalExport = exportBackup;
  exportBackup = async function exportBackupShared() {
    const file = new File([JSON.stringify({
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      categories: state.categories,
      transactions: state.transactions,
      recurring: state.recurring,
      accounts: state.accounts,
      trips: state.trips,
    }, null, 2)], `balance-backup-${todayIso()}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    return originalExport();
  };

  // ---------- Avisar a la app cuando hay algo a pantalla completa ----------
  // Hojas y ventanas deben tapar la barra de la app. Con el PIN sigue visible: así se puede salir de Balance.

  const OVERLAYS = '.sheet.show, #modalwrap.show';
  let overlay = false;
  function reportOverlay() {
    const now = Boolean(document.querySelector(OVERLAYS));
    if (now === overlay) return;
    overlay = now;
    app?.onBalanceOverlay?.(now);
  }
  new MutationObserver(reportOverlay).observe(document.body, {
    attributes: true, attributeFilter: ['class'], subtree: true,
  });

  // ---------- Órdenes de la app ----------

  let addTimer = null;

  window.balanceEmbed = {
    go(view) {
      clearTimeout(addTimer); // cambiar de pantalla cancela un añadir pendiente
      closeAllForNavigation();
      if (state.ready) {
        state.homeSearch = null;
        setView(view);
        toTop();
      } else {
        state.view = view;
      }
    },
    add() { if (state.ready && !state.locked) openAddSheet(null); },
    // Desde Inicio: espera a que Balance arranque y a que se desbloquee el PIN, si lo hay.
    addWhenUnlocked() {
      clearTimeout(addTimer);
      if (!state.ready || state.locked) {
        addTimer = setTimeout(() => this.addWhenUnlocked(), READY_RETRY_MS);
        return;
      }
      openAddSheet(null);
    },
    // Pago copiado por el atajo de Apple Pay. Con PIN, Balance lo abre al desbloquear.
    // Sin texto válido, Balance muestra su cuadro para pegarlo a mano.
    pay(text) {
      if (!state.ready) {
        setTimeout(() => this.pay(text), READY_RETRY_MS);
        return;
      }
      const payment = text ? parsePaymentText(text) : null;
      if (!payment) {
        pastePayment();
      } else if (payAlreadyDone(payment.key)) {
        toast('Ese pago ya lo has apuntado');
      } else {
        _pendingPay = payment;
        openPendingPayment();
      }
    },
    refreshTheme() {
      applyTheme();
      syncColors();
    },
    setSafeBottom(px) {
      document.documentElement.style.setProperty('--safe-b', px);
    },
    refresh() { if (state.ready) renderAll(); },
  };

  function closeAllForNavigation() {
    document.querySelectorAll('.sheet.show').forEach((el) => el.classList.remove('show'));
    document.getElementById('scrim')?.classList.remove('show');
  }

  function syncColors() {
    if (!app) return;
    const css = app.getComputedStyle(app.document.documentElement);
    const root = document.documentElement.style;
    root.setProperty('--app-sheet', css.getPropertyValue('--sheet'));
    root.setProperty('--app-page', css.getPropertyValue('--bg'));
  }
  syncColors();

  app?.onBalanceReady?.();
  publishSummary(); // Balance puede haber arrancado ya antes de cargar este archivo
})();
