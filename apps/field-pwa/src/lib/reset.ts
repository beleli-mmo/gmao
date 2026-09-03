/**
 * Réinitialisation complète de l'app installée sur le téléphone.
 * Sert de porte de secours quand un ancien service worker sert un vieux
 * bundle cassé et ne se met plus à jour tout seul.
 *
 *  - désinscrit tous les service workers
 *  - vide tous les caches (Cache Storage)
 *  - supprime les bases locales PouchDB (référentiel + archive DI)
 *  - efface la session
 *  - recharge la page depuis le réseau
 */
export async function resetApp(): Promise<void> {
  // 1. service workers
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }

  // 2. Cache Storage (assets précédemment mis en cache par Workbox)
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }

  // 3. bases locales PouchDB (IndexedDB) — elles se re-remplissent au prochain login
  try {
    if (window.indexedDB) {
      for (const name of ['_pouch_gmao_ref', '_pouch_gmao_tickets']) {
        indexedDB.deleteDatabase(name);
      }
    }
  } catch {
    /* ignore */
  }

  // 4. session
  try {
    localStorage.removeItem('gmao.session');
  } catch {
    /* ignore */
  }

  // 5. recharge (cache-buster pour contourner un éventuel cache HTTP)
  location.replace(`${location.origin}${location.pathname}?r=${Date.now()}`);
}
