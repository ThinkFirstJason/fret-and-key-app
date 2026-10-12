/* Fret & Key — boot */
(function () {
  'use strict';
  const FK = window.FK;
  // optional deep link: #tab or #tab:mode (e.g. #chords:piano)
  const m = /^#(\w+)(?::(guitar|piano))?$/.exec(location.hash);
  if (m) { FK.state.tab = m[1]; if (m[2]) FK.state.mode = m[2]; }
  FK.initApp();
  if (FK.spotify && FK.spotify.handleRedirect) FK.spotify.handleRedirect();

  if (FK.platform.desktop) return;

  /* phone/web app: work offline once installed, and keep your songs */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // a release downloaded last time: switch to it now, while the app is just opening
      if (reg.waiting && navigator.serviceWorker.controller && performance.now() < 8000) {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        reg.waiting.postMessage('skip-waiting');
        return;
      }
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          // a new version is ready; it takes over the next time the app is opened (never mid-song)
          if (w.state === 'installed' && navigator.serviceWorker.controller) FK.toast('Update downloaded — it’ll be used next time you open the app.');
        });
      });
    }).catch(() => { /* offline support is a bonus */ });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  /* iPhone Safari: explain how to install it as an app (full screen, its own icon, offline) */
  const tip = document.getElementById('installTip');
  if (tip && FK.platform.ios && !FK.platform.standalone && !FK.store.get('install-tip-closed', false)) {
    tip.innerHTML = `<span>Install Fret &amp; Key: tap <b>Share</b> <svg viewBox="0 0 24 24" aria-label="Share"><path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9"/></svg> then <b>Add to Home Screen</b>.</span><button aria-label="Close">✕</button>`;
    tip.hidden = false;
    tip.querySelector('button').addEventListener('click', () => { tip.hidden = true; FK.store.set('install-tip-closed', true); });
  }
})();
