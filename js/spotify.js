/*
 * Fret & Key — Spotify integration
 *  1. Embed player (Spotify iFrame API) — no login needed; plays previews, or full tracks if the
 *     user signs in inside the player. We can play/pause/seek it from our UI.
 *  2. Optional "Connect Spotify" (OAuth PKCE in the system browser, user supplies their own Client ID) for track search and
 *     for controlling playback on the user's active Spotify device (Premium required by Spotify).
 */
(function () {
  'use strict';
  const FK = window.FK;
  const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
  const AUTH = 'https://accounts.spotify.com/authorize';
  const TOKEN = 'https://accounts.spotify.com/api/token';
  const API = 'https://api.spotify.com/v1';

  let tok = FK.store.get('sp-token', null);
  const listeners = [];
  const emit = () => listeners.forEach((fn) => fn());

  // Desktop: Spotify redirects the system browser to /callback and main.py stores the result for the app to collect.
  // Phone/web app: there's no local server, so the login happens in the app window and comes straight back to the app.
  const redirectUri = () => (FK.platform.desktop ? location.origin + '/callback' : location.origin + location.pathname);
  const clientId = () => FK.store.get('sp-client', '');

  function b64url(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function randomString(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[x % 62]).join('');
  }

  /* open a URL in the user's normal browser (never navigate the app window away) */
  function openExternal(url) {
    const api = window.pywebview && window.pywebview.api;
    if (api && api.open_url) return api.open_url(url);
    window.open(url, '_blank', 'noopener');
    return Promise.resolve(true);
  }

  let pending = null; // { state, verifier, timer, started }

  async function login() {
    const id = clientId();
    if (!id) throw new Error('Add your Spotify Client ID first.');
    if (!/^[0-9a-f]{32}$/i.test(id)) throw new Error('That doesn’t look like a Spotify Client ID (32 letters and numbers from your app’s dashboard page).');
    if (!crypto.subtle) throw new Error(FK.platform.desktop ? 'Spotify login only works inside the Fret & Key app (launch it with main.py).' : 'Spotify login needs the app to be opened over https.');
    cancelLogin();
    const verifier = randomString(64);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = randomString(16);
    const p = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: redirectUri(), code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state, show_dialog: 'true' });
    if (!FK.platform.desktop) {
      FK.store.set('sp-pending', { state, verifier, started: Date.now() });
      location.assign(AUTH + '?' + p.toString());
      return;
    }
    await fetch('/api/spotify-callback').catch(() => {}); // clear any stale result
    pending = { state, verifier, started: Date.now() };
    pending.timer = setInterval(poll, 1000);
    emit();
    await openExternal(AUTH + '?' + p.toString());
  }

  function cancelLogin() {
    if (pending) clearInterval(pending.timer);
    pending = null;
    emit();
  }

  async function poll() {
    if (!pending) return;
    if (Date.now() - pending.started > 5 * 60 * 1000) { cancelLogin(); FK.toast('Spotify login timed out — press Connect to try again.'); return; }
    let res;
    try { res = await (await fetch('/api/spotify-callback', { cache: 'no-store' })).json(); } catch (e) { return; }
    if (!pending || !res || (!res.code && !res.error)) return;
    const { state, verifier } = pending;
    cancelLogin();
    if (res.error) { FK.toast(res.error === 'access_denied' ? 'Spotify connection was cancelled.' : 'Spotify said: ' + res.error); return; }
    if (res.state !== state) { FK.toast('Spotify login didn’t match this request — please try again.'); return; }
    try {
      await tokenRequest({ client_id: clientId(), grant_type: 'authorization_code', code: res.code, redirect_uri: redirectUri(), code_verifier: verifier });
      FK.toast('Spotify connected ✓');
    } catch (e) {
      FK.toast(e.message);
    }
  }

  async function tokenRequest(params) {
    const r = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
    if (!r.ok) {
      let msg = 'Spotify token error (' + r.status + ')';
      try { const j = await r.json(); if (j.error_description || j.error) msg = 'Spotify: ' + (j.error_description || j.error); } catch (e) { /* no body */ }
      throw new Error(msg);
    }
    const j = await r.json();
    tok = { access: j.access_token, refresh: j.refresh_token || (tok && tok.refresh), expires: Date.now() + (j.expires_in - 60) * 1000 };
    FK.store.set('sp-token', tok);
    emit();
    return tok;
  }

  /* Phone/web app: Spotify sends the login back to the app page. (Older desktop builds did that too; just tidy up.) */
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    if (!q.get('code') && !q.get('error')) return;
    history.replaceState(null, '', location.pathname + location.hash);
    const wait = FK.store.get('sp-pending', null);
    FK.store.del('sp-pending');
    if (FK.platform.desktop || !wait) return;
    if (q.get('error')) { FK.toast(q.get('error') === 'access_denied' ? 'Spotify connection was cancelled.' : 'Spotify said: ' + q.get('error')); return; }
    if (q.get('state') !== wait.state) { FK.toast('Spotify login didn’t match this request — please try again.'); return; }
    try {
      await tokenRequest({ client_id: clientId(), grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(), code_verifier: wait.verifier });
      FK.toast('Spotify connected ✓');
    } catch (e) { FK.toast(e.message); }
  }

  async function access() {
    if (!tok) return null;
    if (Date.now() < tok.expires) return tok.access;
    if (!tok.refresh) return null;
    try { await tokenRequest({ client_id: clientId(), grant_type: 'refresh_token', refresh_token: tok.refresh }); return tok.access; } catch (e) { logout(); return null; }
  }

  async function api(path, opts = {}) {
    const a = await access();
    if (!a) throw new Error('Not connected to Spotify');
    const r = await fetch(API + path, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + a, 'Content-Type': 'application/json' }, opts.headers || {}) }));
    if (r.status === 204) return null;
    if (!r.ok) {
      let msg = 'Spotify error ' + r.status;
      try { const j = await r.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* no body */ }
      const err = new Error(msg); err.status = r.status; throw err;
    }
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }

  function logout() { tok = null; FK.store.del('sp-token'); emit(); }

  /* ---------------- Embed (iFrame API) ---------------- */
  let iframeApi = null, apiPromise = null, controller = null, ctrlPromise = null, currentUri = null;
  const embedListeners = [];
  let lastState = { isPaused: true, position: 0, duration: 0 };

  function loadApi() {
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      window.onSpotifyIframeApiReady = (IFrameAPI) => { iframeApi = IFrameAPI; resolve(IFrameAPI); };
      const s = document.createElement('script');
      s.src = 'https://open.spotify.com/embed/iframe-api/v1';
      s.async = true;
      s.onerror = () => reject(new Error('Could not load the Spotify player (offline or blocked).'));
      document.head.appendChild(s);
    });
    return apiPromise;
  }

  async function mountEmbed(el, uri) {
    const IFrameAPI = await loadApi();
    if (controller && el.contains(controller._fkEl)) {
      if (uri !== currentUri) { controller.loadUri(uri); currentUri = uri; }
      return controller;
    }
    el.innerHTML = '';
    const target = document.createElement('div');
    el.appendChild(target);
    ctrlPromise = new Promise((resolve) => {
      IFrameAPI.createController(target, { uri, width: '100%', height: 152 }, (ctrl) => {
        controller = ctrl;
        controller._fkEl = el.querySelector('iframe') || el.firstChild;
        currentUri = uri;
        ctrl.addListener('playback_update', (e) => { lastState = e.data; embedListeners.forEach((fn) => fn(e.data)); });
        resolve(ctrl);
      });
    });
    return ctrlPromise;
  }

  function parseUri(input) {
    if (!input) return null;
    const s = input.trim();
    let m = /spotify:track:([A-Za-z0-9]{22})/.exec(s);
    if (m) return 'spotify:track:' + m[1];
    m = /open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]{22})/.exec(s);
    if (m) return 'spotify:track:' + m[1];
    return null;
  }

  FK.spotify = {
    redirectUri, clientId,
    setClientId(id) { FK.store.set('sp-client', (id || '').trim()); emit(); },
    connected: () => !!tok,
    onChange(fn) { listeners.push(fn); },
    login, logout, handleRedirect, parseUri, cancelLogin,
    waiting: () => !!pending,
    async search(q) {
      const j = await api('/search?' + new URLSearchParams({ q, type: 'track', limit: '10' }));
      return (j.tracks.items || []).map((t) => ({ id: t.id, uri: t.uri, name: t.name, artists: t.artists.map((a) => a.name).join(', '), image: (t.album.images.slice(-1)[0] || {}).url, url: t.external_urls.spotify, duration: t.duration_ms }));
    },
    /* Spotify deprecated audio-features for new apps (Nov 2024); try it, but expect it to fail. */
    async features(id) {
      try { return await api('/audio-features/' + id); } catch (e) { return null; }
    },
    async devicePlay(uri) { return api('/me/player/play', { method: 'PUT', body: JSON.stringify(uri ? { uris: [uri] } : {}) }); },
    async devicePause() { return api('/me/player/pause', { method: 'PUT' }); },
    async deviceState() { return api('/me/player'); },
    embed: {
      mount: mountEmbed,
      ready: () => !!controller,
      uri: () => currentUri,
      play() { if (!controller) return; if (!lastState.position) controller.play(); else controller.resume(); },
      pause() { if (controller) controller.pause(); },
      toggle() { if (controller) controller.togglePlay(); },
      seek(sec) { if (controller) controller.seek(sec); },
      restart() { if (controller) { controller.seek(0); controller.resume(); } },
      /* rebuild the player, e.g. after logging in so it switches from previews to full tracks */
      reset() { if (controller) controller.destroy(); controller = null; currentUri = null; lastState = { isPaused: true, position: 0, duration: 0 }; emit(); },
      onUpdate(fn) { embedListeners.push(fn); },
      state: () => lastState,
    },
  };
})();
