/* Fret & Key — customizable SVG keyboard with interactive keys */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const svg = FK.svg;
  const mod = T.mod;

  const RANGES = {
    '25': { name: '25 keys · 2 octaves', lo: 48, hi: 72 },
    '37': { name: '37 keys · 3 octaves', lo: 48, hi: 84 },
    '49': { name: '49 keys · 4 octaves', lo: 36, hi: 84 },
    '61': { name: '61 keys · 5 octaves', lo: 36, hi: 96 },
    '88': { name: '88 keys · full grand', lo: 21, hi: 108 },
  };
  const STYLES = {
    grand: { name: 'Concert Grand', sub: 'Gloss black & gold', case: '#0f0f12', accent: '#d4af61', felt: '#8e1b2b', keys: 'white', tone: 'grand' },
    upright: { name: 'Walnut Upright', sub: 'Warm wood & brass', case: '#6a4127', accent: '#e0b96a', felt: '#6e1a25', keys: 'ivory', tone: 'upright', wood: true },
    stage: { name: 'Stage Red', sub: 'Gigging stage piano', case: '#c8232c', accent: '#ffffff', felt: '#161616', keys: 'white', tone: 'epiano' },
    synth: { name: 'Synth Workstation', sub: 'Knobs, wheels & OLED', case: '#23262d', accent: '#46e0c4', felt: '#0d0f12', keys: 'white', tone: 'synth' },
    vintage: { name: 'Vintage Electric', sub: 'Tolex & silver nameplate', case: '#1c1b1b', accent: '#d8d8d8', felt: '#a5121b', keys: 'white', tone: 'epiano' },
    organ: { name: 'Tonewheel Organ', sub: 'Drawbars & wood cheeks', case: '#5a3a22', accent: '#f3ead7', felt: '#111', keys: 'white', tone: 'organ', wood: true },
  };
  const KEY_STYLES = { white: 'Classic white', ivory: 'Vintage ivory', inverted: 'Inverted (black naturals)' };
  const DEFAULTS = { style: 'grand', range: '37', keys: 'auto', caseColor: '', felt: '' };

  let cfg = Object.assign({}, DEFAULTS, FK.store.get('piano', {}));
  let host = null, root = null, P = null, markerLayer = null;
  let markers = [];
  const clickHandlers = [];
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(mod(m));

  function keyColors() {
    const k = cfg.keys === 'auto' ? STYLES[cfg.style].keys : cfg.keys;
    if (k === 'ivory') return { white: '#f5ead0', white2: '#e3d3ad', black: '#1a1714', black2: '#3b342c' };
    if (k === 'inverted') return { white: '#1e1e22', white2: '#0c0c0e', black: '#f4f2ec', black2: '#cfcbc0', inverted: true };
    return { white: '#fdfdfb', white2: '#e6e6e2', black: '#141416', black2: '#3a3a40' };
  }

  function layout() {
    const r = RANGES[cfg.range] || RANGES['37'];
    let lo = r.lo, hi = r.hi;
    if (isBlack(lo)) lo--;
    if (isBlack(hi)) hi++;
    const ww = 44, wh = 232, bw = 27, bh = 148;
    const st = STYLES[cfg.style];
    const cheekL = cfg.style === 'synth' ? 96 : 34;
    const cheekR = 34, top = 96, felt = 7, bottom = 18;
    const keys = [];
    let wi = 0;
    for (let m = lo; m <= hi; m++) {
      if (!isBlack(m)) { keys.push({ m, black: false, x: cheekL + wi * ww, w: ww }); wi++; }
    }
    const OFF = { 1: -3, 3: 3, 6: -4, 8: 0, 10: 4 };
    for (let m = lo; m <= hi; m++) {
      if (isBlack(m)) {
        const left = keys.find((k) => k.m === m - 1);
        if (!left) continue;
        keys.push({ m, black: true, x: left.x + ww - bw / 2 + OFF[mod(m)], w: bw });
      }
    }
    const width = cheekL + wi * ww + cheekR;
    const keyTop = top + felt;
    return { lo, hi, ww, wh, bw, bh, cheekL, cheekR, top, felt, bottom, keys, width, height: keyTop + wh + bottom, keyTop, st };
  }

  function render() {
    if (!host) return;
    P = layout();
    const { width, height, top, felt, keyTop, wh, bh, cheekL, cheekR, keys, st } = P;
    const caseColor = cfg.caseColor || st.case;
    const feltColor = cfg.felt || st.felt;
    const kc = keyColors();
    const shade = FK.guitar ? FK.guitar.shade : (c) => c;

    host.innerHTML = '';
    root = svg('svg', { class: 'piano-svg', viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Interactive piano keyboard' }, host);
    const d = svg('defs', {}, root);
    d.innerHTML = `
      <linearGradient id="p-case" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(caseColor, 0.18)}"/><stop offset=".55" stop-color="${caseColor}"/><stop offset="1" stop-color="${shade(caseColor, -0.4)}"/></linearGradient>
      <linearGradient id="p-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".4" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="p-white" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${kc.white2}"/><stop offset=".08" stop-color="${kc.white}"/><stop offset=".92" stop-color="${kc.white}"/><stop offset="1" stop-color="${kc.white2}"/></linearGradient>
      <linearGradient id="p-black" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${kc.black}"/><stop offset=".85" stop-color="${kc.black2}"/><stop offset=".86" stop-color="${kc.black}"/><stop offset="1" stop-color="${kc.black}"/></linearGradient>
      <linearGradient id="p-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f7f9"/><stop offset=".5" stop-color="#b9c0c8"/><stop offset="1" stop-color="#6f7780"/></linearGradient>
      <radialGradient id="p-knob" cx=".4" cy=".35"><stop offset="0" stop-color="#6a6d74"/><stop offset=".7" stop-color="#1f2024"/><stop offset="1" stop-color="#050506"/></radialGradient>
      <filter id="p-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.06" numOctaves="4" seed="5"/><feColorMatrix values="0 0 0 0 0.12  0 0 0 0 0.06  0 0 0 0 0.02  1.8 0 0 0 -0.65"/><feComposite in2="SourceAlpha" operator="in"/></filter>
      <filter id="p-tolex" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.6 0 0 0 -0.25"/><feComposite in2="SourceAlpha" operator="in"/></filter>
      <filter id="p-shadow" x="-5%" y="-5%" width="110%" height="130%"><feGaussianBlur stdDeviation="10"/></filter>`;

    svg('rect', { x: 8, y: 20, width: width - 16, height: height - 10, rx: 20, fill: '#000', opacity: 0.5, filter: 'url(#p-shadow)' }, root);
    // case
    svg('rect', { x: 0, y: 0, width, height, rx: 16, fill: 'url(#p-case)' }, root);
    if (st.wood) svg('rect', { x: 0, y: 0, width, height, rx: 16, fill: '#fff', filter: 'url(#p-grain)', opacity: 0.9 }, root);
    if (cfg.style === 'vintage') svg('rect', { x: 0, y: 0, width, height, rx: 16, fill: '#fff', filter: 'url(#p-tolex)', opacity: 0.12 }, root);
    svg('rect', { x: 0, y: 0, width, height: top, rx: 16, fill: 'url(#p-gloss)' }, root);
    drawPanel(width, top, caseColor);
    if (cfg.style === 'organ') {
      svg('rect', { x: 0, y: 0, width: cheekL, height, rx: 14, fill: '#7a4c2a' }, root);
      svg('rect', { x: width - cheekR, y: 0, width: cheekR, height, rx: 14, fill: '#7a4c2a' }, root);
      svg('rect', { x: 0, y: 0, width: cheekL, height, rx: 14, fill: '#fff', filter: 'url(#p-grain)' }, root);
      svg('rect', { x: width - cheekR, y: 0, width: cheekR, height, rx: 14, fill: '#fff', filter: 'url(#p-grain)' }, root);
    }
    // felt strip
    svg('rect', { x: cheekL - 2, y: top, width: width - cheekL - cheekR + 4, height: felt + 4, fill: feltColor }, root);
    // keys bed
    svg('rect', { x: cheekL - 2, y: keyTop, width: width - cheekL - cheekR + 4, height: wh + 2, fill: '#0b0b0c' }, root);

    const keyLayer = svg('g', { class: 'keys' }, root);
    keys.filter((k) => !k.black).forEach((k) => {
      const g = svg('g', { class: 'key white' + (kc.inverted ? ' inv' : ''), 'data-m': k.m }, keyLayer);
      svg('rect', { x: k.x + 1, y: keyTop, width: k.w - 2, height: wh, rx: 5, class: 'key-face', fill: 'url(#p-white)' }, g);
      svg('rect', { x: k.x + 1, y: keyTop, width: k.w - 2, height: wh, rx: 5, class: 'key-tint' }, g);
      if (mod(k.m) === 0) svg('text', { x: k.x + k.w / 2, y: keyTop + wh - 12, class: 'key-c' + (kc.inverted ? ' inv' : '') }, g).textContent = 'C' + (Math.floor(k.m / 12) - 1);
    });
    keys.filter((k) => k.black).forEach((k) => {
      const g = svg('g', { class: 'key black' + (kc.inverted ? ' inv' : ''), 'data-m': k.m }, keyLayer);
      svg('rect', { x: k.x, y: keyTop - 2, width: k.w, height: bh, rx: 4, class: 'key-face', fill: 'url(#p-black)' }, g);
      svg('rect', { x: k.x + 4, y: keyTop + 2, width: k.w - 8, height: bh - 26, rx: 3, fill: '#fff', opacity: kc.inverted ? 0.25 : 0.07, 'pointer-events': 'none' }, g);
      svg('rect', { x: k.x, y: keyTop - 2, width: k.w, height: bh, rx: 4, class: 'key-tint' }, g);
    });
    // cheeks over the key ends
    if (cfg.style !== 'organ') {
      svg('rect', { x: 0, y: top - 6, width: cheekL, height: height - top + 6, rx: 12, fill: 'url(#p-case)' }, root);
      svg('rect', { x: width - cheekR, y: top - 6, width: cheekR, height: height - top + 6, rx: 12, fill: 'url(#p-case)' }, root);
    }
    if (cfg.style === 'synth') {
      [[26, 'Pitch'], [62, 'Mod']].forEach(([x, label]) => {
        svg('rect', { x: x - 11, y: keyTop + 30, width: 22, height: 120, rx: 8, fill: '#0b0c0f', stroke: '#3a3e47' }, root);
        svg('rect', { x: x - 9, y: keyTop + (label === 'Pitch' ? 76 : 108), width: 18, height: 28, rx: 5, fill: '#5d626d' }, root);
        svg('text', { x, y: keyTop + 170, class: 'p-small', fill: '#8a919d' }, root).textContent = label;
      });
    }
    // front lip
    svg('rect', { x: cheekL - 2, y: keyTop + wh, width: width - cheekL - cheekR + 4, height: 6, fill: 'rgba(0,0,0,.4)' }, root);

    markerLayer = svg('g', { class: 'markers' }, root);
    drawMarkers(true);
    drawLive();
  }

  /* keys being played right now (MIDI / audio input) */
  let liveKeys = [];
  function drawLive() {
    if (!root) return;
    const marked = new Set(markers.filter((m) => !m.ghost).map((m) => mod(m.midi)));
    root.querySelectorAll('.key.live').forEach((k) => k.classList.remove('live', 'in', 'out'));
    liveKeys.forEach((m) => {
      const el = root.querySelector(`.key[data-m="${m}"]`);
      if (!el) return;
      el.classList.add('live');
      if (marked.size) el.classList.add(marked.has(mod(m)) ? 'in' : 'out');
    });
  }

  function drawPanel(width, top, caseColor) {
    const st = STYLES[cfg.style];
    const g = svg('g', { class: 'p-panel' }, root);
    const accent = st.accent;
    const mid = width / 2;
    if (cfg.style === 'grand' || cfg.style === 'upright') {
      svg('line', { x1: 40, y1: top - 14, x2: width - 40, y2: top - 14, stroke: accent, 'stroke-opacity': 0.55, 'stroke-width': 1.5 }, g);
      const t = svg('text', { x: mid, y: top / 2 + 8, class: 'p-logo serif', fill: accent }, g);
      t.textContent = 'FRET & KEY';
      svg('text', { x: mid, y: top / 2 + 26, class: 'p-small', fill: accent, opacity: 0.7 }, g).textContent = cfg.style === 'grand' ? 'CONCERT GRAND · MODEL D' : 'UPRIGHT · EST. 2026';
      if (cfg.style === 'upright') {
        [mid - 220, mid + 220].forEach((x) => svg('path', { d: `M${x - 40},${top / 2} q20,-18 40,0 t40,0`, fill: 'none', stroke: accent, 'stroke-opacity': 0.6, 'stroke-width': 2 }, g));
      }
    } else if (cfg.style === 'stage') {
      svg('text', { x: 46, y: top / 2 + 10, class: 'p-logo bold', fill: '#fff' }, g).textContent = 'FRET&KEY';
      svg('text', { x: 48, y: top / 2 + 28, class: 'p-small', fill: '#fff', opacity: 0.75 }, g).textContent = 'STAGE 88';
      svg('rect', { x: mid - 70, y: 22, width: 140, height: 44, rx: 6, fill: '#1b0a0b', stroke: '#5a1215' }, g);
      svg('text', { x: mid, y: 50, class: 'p-lcd', id: 'pianoLcd' }, g).textContent = 'GRAND · 01';
      for (let i = 0; i < 6; i++) {
        const x = mid + 120 + i * 46;
        if (x > width - 50) break;
        svg('circle', { cx: x, cy: 44, r: 13, fill: 'url(#p-knob)', stroke: '#000' }, g);
        svg('line', { x1: x, y1: 44, x2: x + 6, y2: 34, stroke: '#fff', 'stroke-width': 2 }, g);
      }
      for (let i = 0; i < 4; i++) svg('rect', { x: mid - 260 + i * 34, y: 34, width: 24, height: 18, rx: 3, fill: i === 0 ? '#ff4d4d' : '#3a0d0f' }, g);
    } else if (cfg.style === 'synth') {
      svg('text', { x: 30, y: 40, class: 'p-logo bold', fill: accent }, g).textContent = 'FRET&KEY';
      svg('text', { x: 31, y: 58, class: 'p-small', fill: '#9aa3b2' }, g).textContent = 'WORKSTATION · XK-9';
      svg('rect', { x: mid - 90, y: 16, width: 180, height: 60, rx: 6, fill: '#05060a', stroke: '#3a3f4a' }, g);
      let dpath = `M${mid - 80},46`;
      for (let x = 0; x <= 160; x += 4) dpath += ` L${mid - 80 + x},${46 - Math.sin(x / 10) * 16 * Math.exp(-x / 140)}`;
      svg('path', { d: dpath, fill: 'none', stroke: accent, 'stroke-width': 2 }, g);
      const colors = ['#46e0c4', '#9b7bff', '#ff7a59', '#ffc857'];
      for (let i = 0; i < 8; i++) {
        const x = mid + 130 + i * 40;
        if (x > width - 50) break;
        svg('circle', { cx: x, cy: 46, r: 12, fill: 'url(#p-knob)' }, g);
        svg('circle', { cx: x, cy: 46, r: 14.5, fill: 'none', stroke: colors[i % 4], 'stroke-width': 2, 'stroke-dasharray': `${18 + i * 6} 100`, transform: `rotate(130 ${x} 46)` }, g);
      }
      for (let i = 0; i < 5; i++) {
        const x = mid - 300 + i * 30;
        if (x < 200) continue;
        svg('rect', { x: x - 3, y: 18, width: 6, height: 56, rx: 3, fill: '#0b0c0f' }, g);
        svg('rect', { x: x - 9, y: 26 + ((i * 13) % 34), width: 18, height: 10, rx: 2, fill: '#c9ced8' }, g);
      }
    } else if (cfg.style === 'vintage') {
      svg('rect', { x: mid - 120, y: 22, width: 240, height: 46, rx: 6, fill: 'url(#p-metal)', stroke: '#555' }, g);
      svg('text', { x: mid, y: 52, class: 'p-logo script', fill: '#1b1b1b' }, g).textContent = 'Fret&Key Mark I';
      [70, 115].forEach((x) => { svg('circle', { cx: x, cy: 46, r: 14, fill: 'url(#p-knob)' }, g); svg('line', { x1: x, y1: 46, x2: x - 5, y2: 35, stroke: '#ddd', 'stroke-width': 2 }, g); });
    } else if (cfg.style === 'organ') {
      const cols = ['#7a3b1f', '#7a3b1f', '#f3ead7', '#f3ead7', '#111', '#f3ead7', '#111', '#111', '#f3ead7'];
      const pulls = [8, 8, 6, 0, 3, 0, 0, 0, 2];
      cols.forEach((c, i) => {
        const x = mid - 180 + i * 40;
        svg('rect', { x: x - 9, y: 8, width: 18, height: 30 + pulls[i] * 6, rx: 3, fill: c, stroke: 'rgba(0,0,0,.4)' }, g);
        svg('rect', { x: x - 11, y: 30 + pulls[i] * 6, width: 22, height: 12, rx: 3, fill: c, stroke: 'rgba(0,0,0,.4)' }, g);
      });
      svg('text', { x: 60, y: top / 2 + 8, class: 'p-logo serif', fill: accent }, g).textContent = 'FRET & KEY';
    }
  }

  function keyOf(m) { return P && P.keys.find((k) => k.m === m); }

  function drawMarkers(animate) {
    if (!root) return;
    root.querySelectorAll('.key').forEach((k) => { k.removeAttribute('data-deg'); k.classList.remove('hl', 'ghost'); });
    markerLayer.innerHTML = '';
    markers.forEach((mk, idx) => {
      const k = keyOf(mk.midi);
      if (!k) return;
      const el = root.querySelector(`.key[data-m="${mk.midi}"]`);
      if (el && !mk.ghost) { el.classList.add('hl'); el.setAttribute('data-deg', mk.cls || ''); }
      if (el && mk.ghost) el.classList.add('ghost');
      const x = k.x + k.w / 2;
      const y = k.black ? P.keyTop + P.bh - 22 : P.keyTop + P.wh - 42;
      const r = k.black ? 11 : 15;
      const g = svg('g', { class: `mk ${mk.cls || ''}${mk.ghost ? ' ghost' : ''}${mk.dim ? ' dim' : ''}`, transform: `translate(${x},${y})`, 'data-m': mk.midi }, markerLayer);
      const inner = svg('g', { class: 'mk-in' + (animate ? ' pop' : ''), style: animate ? `animation-delay:${Math.min(idx * 10, 380)}ms` : null }, g);
      svg('circle', { r: mk.ghost ? r * 0.5 : r, class: 'mk-c' }, inner);
      if (mk.root && !mk.ghost) svg('circle', { r: r + 3.5, class: 'mk-ring' }, inner);
      const label = FK.markerLabel ? FK.markerLabel(mk) : mk.note;
      if (label && !mk.ghost) {
        const t = svg('text', { class: 'mk-t', y: 0.5, 'font-size': (label.length > 2 ? r * 0.72 : r * 0.92).toFixed(1) }, inner);
        t.textContent = label;
      }
    });
  }

  function flash(m) {
    if (!root) return;
    const el = root.querySelector(`.key[data-m="${m}"]`);
    if (el) {
      el.classList.add('down');
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove('down'), 260);
    }
    const mk = markerLayer.querySelector(`.mk[data-m="${m}"]`);
    if (mk) {
      mk.classList.remove('hit');
      requestAnimationFrame(() => mk.classList.add('hit'));
      clearTimeout(mk._t);
      mk._t = setTimeout(() => mk.classList.remove('hit'), 420);
    }
    const lcd = root.querySelector('#pianoLcd');
    if (lcd) lcd.textContent = T.midiName(m) + ' · ' + (FK.audio.PTONES[FK.audio.getTone('piano')] || {}).name;
  }

  function onPointer(e) {
    const k = e.target.closest && e.target.closest('.key');
    if (!k) return;
    e.preventDefault();
    const m = +k.dataset.m;
    clickHandlers.forEach((fn) => fn({ midi: m, inst: 'piano' }));
  }

  FK.piano = {
    RANGES, STYLES, KEY_STYLES, DEFAULTS,
    mount(el) { host = el; host.addEventListener('pointerdown', onPointer); render(); },
    config: () => Object.assign({}, cfg),
    set(partial) { cfg = Object.assign({}, cfg, partial); FK.store.set('piano', cfg); render(); FK.emit('piano-config', cfg); },
    reset() { cfg = Object.assign({}, DEFAULTS); FK.store.set('piano', cfg); render(); FK.emit('piano-config', cfg); },
    range: () => (P ? { lo: P.lo, hi: P.hi } : { lo: 48, hi: 84 }),
    setMarkers(list) { markers = list || []; drawMarkers(true); drawLive(); },
    refreshLabels() { drawMarkers(false); },
    flash,
    setLive(ms) { liveKeys = ms || []; drawLive(); },
    markedPcs: () => new Set(markers.filter((m) => !m.ghost).map((m) => mod(m.midi))),
    onClick(fn) { clickHandlers.push(fn); },
    defaultTone: () => STYLES[cfg.style].tone,
  };
})();
