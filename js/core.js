/* Fret & Key — core helpers: namespace, events, storage, DOM/SVG utilities */
(function () {
  'use strict';
  const FK = (window.FK = window.FK || {});

  /* where we're running: the desktop app (served by main.py, with the optional AI engine) or the phone/web app */
  const ua = navigator.userAgent;
  FK.platform = {
    desktop: location.hostname === '127.0.0.1' && location.port === '47321',
    ios: /iP(hone|od|ad)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1),
    touch: window.matchMedia('(pointer: coarse)').matches,
    standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    midi: !!navigator.requestMIDIAccess,
  };
  FK.platform.mobile = !FK.platform.desktop && (FK.platform.ios || FK.platform.touch);
  document.documentElement.classList.toggle('is-mobile', FK.platform.mobile);
  document.documentElement.classList.toggle('is-standalone', FK.platform.standalone);

  const listeners = {};
  FK.on = (ev, fn) => {
    (listeners[ev] = listeners[ev] || []).push(fn);
    return () => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); };
  };
  FK.emit = (ev, ...args) => {
    (listeners[ev] || []).slice().forEach((fn) => {
      try { fn(...args); } catch (e) { console.error(e); }
    });
  };

  FK.store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('fk:' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('fk:' + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
    del(key) {
      try { localStorage.removeItem('fk:' + key); } catch (e) { /* storage unavailable */ }
    },
  };

  FK.$ = (sel, root = document) => root.querySelector(sel);
  FK.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  FK.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  FK.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  FK.lerp = (a, b, t) => a + (b - a) * t;
  FK.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  FK.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const SVGNS = 'http://www.w3.org/2000/svg';
  FK.svg = (tag, attrs = {}, parent) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  /* Closed (or open) Catmull-Rom spline through points -> cubic Bezier path data */
  FK.smoothPath = (pts, closed = true) => {
    const n = pts.length;
    const f = (v) => v.toFixed(1);
    const P = (i) => pts[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
    }
    return d + (closed ? 'Z' : '');
  };

  /* Mirror a top-half outline (listed from neck side around to tail, y<0) into a full closed outline */
  FK.mirrorOutline = (top) => top.concat(top.slice(1, -1).reverse().map(([x, y]) => [x, -y]));

  let toastTimer;
  FK.toast = (msg) => {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  };

  FK.isTyping = () => {
    const a = document.activeElement;
    return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
  };
})();
