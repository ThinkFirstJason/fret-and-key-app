/* Fret & Key — customizable SVG guitar, interactive fretboard, chord voicing finder & diagrams */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const svg = FK.svg;
  const mod = T.mod;

  /* ---------------- Catalogues ---------------- */
  const TUNINGS = {
    standard: { name: 'Standard — E A D G B E', notes: [40, 45, 50, 55, 59, 64] },
    dropD: { name: 'Drop D — D A D G B E', notes: [38, 45, 50, 55, 59, 64] },
    halfDown: { name: 'Half-step down — E♭', notes: [39, 44, 49, 54, 58, 63] },
    dadgad: { name: 'DADGAD', notes: [38, 45, 50, 55, 57, 62] },
    openG: { name: 'Open G — D G D G B D', notes: [38, 43, 50, 55, 59, 62] },
    openD: { name: 'Open D — D A D F♯ A D', notes: [38, 45, 50, 54, 57, 62] },
    openE: { name: 'Open E — E B E G♯ B E', notes: [40, 47, 52, 56, 59, 64] },
    dropC: { name: 'Drop C — C G C F A D', notes: [36, 43, 48, 53, 57, 62] },
    seven: { name: '7-string — B E A D G B E', notes: [35, 40, 45, 50, 55, 59, 64] },
    bass4: { name: 'Bass 4-string — E A D G', notes: [28, 33, 38, 43] },
    bass5: { name: 'Bass 5-string — B E A D G', notes: [23, 28, 33, 38, 43] },
  };

  const STYLES = {
    strat: { name: 'S-Style', sub: 'Double-cut · 3 single coils', family: 'electric', overlap: 215, scale: 1.05, head: 'inline', tone: 'electric', headFace: 'neck' },
    tele: { name: 'T-Style', sub: 'Single-cut · twang machine', family: 'electric', overlap: 205, scale: 1.05, head: 'tele', tone: 'electric', headFace: 'neck' },
    lespaul: { name: 'Single-Cut', sub: 'Carved top · humbuckers', family: 'electric', overlap: 200, scale: 1.02, head: 'split', tone: 'overdrive', headFace: 'black' },
    sg: { name: 'Double-Horn', sub: 'Devil horns · rock', family: 'electric', overlap: 40, scale: 1.0, head: 'split', tone: 'overdrive', headFace: 'black' },
    dread: { name: 'Dreadnought', sub: 'Steel-string acoustic', family: 'acoustic', overlap: 175, scale: 1.15, head: 'split', tone: 'acoustic', headFace: 'dark' },
    classical: { name: 'Classical', sub: 'Nylon · slotted head', family: 'acoustic', overlap: 160, scale: 1.12, head: 'slotted', tone: 'nylon', headFace: 'rosewood' },
  };

  const BODIES = {
    strat: [[0, -80], [-30, -118], [-62, -160], [-40, -188], [10, -178], [80, -160], [160, -185], [260, -222], [360, -218], [440, -170], [480, -80], [488, 0], [480, 90], [440, 178], [360, 226], [260, 230], [170, 200], [100, 175], [30, 205], [-60, 215], [-110, 195], [-95, 165], [-50, 125], [0, 80]],
    tele: [[10, -85], [38, -112], [36, -150], [0, -172], [30, -198], [130, -198], [210, -188], [300, -212], [400, -214], [462, -180], [488, -100], [492, 0], [488, 100], [462, 180], [400, 214], [300, 212], [210, 190], [110, 202], [25, 200], [-22, 165], [-28, 120], [0, 85]],
    lespaul: [[10, -85], [40, -110], [35, -150], [0, -178], [40, -205], [120, -195], [190, -170], [280, -215], [380, -225], [455, -170], [490, -80], [495, 0], [488, 90], [450, 180], [370, 228], [270, 225], [190, 180], [110, 205], [30, 200], [-20, 165], [-30, 120], [0, 85]],
    sg: [[0, -80], [-40, -110], [-100, -150], [-70, -172], [10, -170], [90, -165], [170, -195], [280, -212], [370, -198], [430, -150], [455, -70], [460, 0], [455, 75], [430, 155], [370, 203], [280, 216], [170, 203], [90, 175], [20, 180], [-60, 178], [-105, 160], [-50, 115], [0, 80]],
    dread: FK.mirrorOutline([[2, -86], [6, -150], [30, -190], [110, -205], [195, -182], [265, -205], [360, -242], [455, -236], [522, -175], [546, -85], [549, 0]]),
    classical: FK.mirrorOutline([[4, -86], [8, -140], [45, -172], [125, -178], [195, -145], [255, -175], [345, -215], [440, -210], [500, -158], [520, -80], [523, 0]]),
  };

  const FINISHES = [
    { id: 'sunburst', name: '3-Tone Sunburst', type: 'burst', c: ['#f6b73c', '#b0421a', '#160904'] },
    { id: 'cherryburst', name: 'Cherry Burst', type: 'burst', c: ['#f0a25a', '#a4161a', '#2a0505'] },
    { id: 'honeyburst', name: 'Honey Burst', type: 'burst', c: ['#f7d27a', '#d48a2c', '#5a2a0c'] },
    { id: 'fiesta', name: 'Fiesta Red', type: 'solid', c: ['#e24a3b'] },
    { id: 'olympic', name: 'Olympic White', type: 'solid', c: ['#efe9da'] },
    { id: 'seafoam', name: 'Seafoam Green', type: 'solid', c: ['#8fd4bf'] },
    { id: 'sonic', name: 'Sonic Blue', type: 'solid', c: ['#9cc9df'] },
    { id: 'tvyellow', name: 'TV Yellow', type: 'solid', c: ['#e8cf6a'] },
    { id: 'black', name: 'Gloss Black', type: 'solid', c: ['#16161a'] },
    { id: 'lpb', name: 'Lake Placid Blue', type: 'metallic', c: ['#2c62b0'] },
    { id: 'goldtop', name: 'Gold Top', type: 'metallic', c: ['#cfa648'] },
    { id: 'candy', name: 'Candy Apple Red', type: 'metallic', c: ['#b3121f'] },
    { id: 'purple', name: 'Purple Sparkle', type: 'metallic', c: ['#6b3fc0'] },
    { id: 'butterscotch', name: 'Butterscotch', type: 'trans', c: ['#e8a947'] },
    { id: 'natural', name: 'Natural', type: 'trans', c: ['#ddb27a'] },
    { id: 'walnut', name: 'Walnut', type: 'trans', c: ['#7a4a26'] },
    { id: 'transblue', name: 'Trans Blue', type: 'trans', c: ['#3f7fc6'] },
  ];

  const BOARDS = {
    rosewood: { name: 'Rosewood', c1: '#5c3626', c2: '#3a2017', grain: 0.5 },
    ebony: { name: 'Ebony', c1: '#2b2421', c2: '#141010', grain: 0.25 },
    maple: { name: 'Maple', c1: '#f1d39d', c2: '#d6aa69', grain: 0.4 },
    roasted: { name: 'Roasted Maple', c1: '#c98b4d', c2: '#98602f', grain: 0.45 },
    pauferro: { name: 'Pau Ferro', c1: '#7c5035', c2: '#563321', grain: 0.45 },
  };
  const INLAYS = { dots: 'Dots', blocks: 'Blocks', trapezoid: 'Trapezoids', sharks: 'Shark fins', none: 'None' };
  const INLAY_MATS = {
    pearl: { name: 'Pearl', fill: '#f4efe4', shimmer: true },
    abalone: { name: 'Abalone', fill: '#72c8bd', shimmer: true },
    black: { name: 'Black', fill: '#151313' },
    gold: { name: 'Gold', fill: '#e2bd62' },
    glow: { name: 'Luminlay', fill: '#9dffc8', glow: true },
  };
  const PICKGUARDS = {
    white: { name: 'White', fill: '#f3f1ea', edge: '#c9c3b6' },
    parchment: { name: 'Parchment', fill: '#e6d9bb', edge: '#bba985' },
    black: { name: 'Black', fill: '#19191b', edge: '#5a5a5e' },
    mint: { name: 'Mint', fill: '#d5e6d2', edge: '#a9bfa6' },
    tortoise: { name: 'Tortoise', fill: '#2c0f06', edge: '#d9c9a8', spots: '#b8561a' },
    pearloid: { name: 'Pearloid', fill: '#f2efe9', edge: '#c9c3b6', shimmer: true },
    red: { name: 'Red', fill: '#a3161b', edge: '#e8dccb' },
    none: { name: 'None' },
  };
  const HARDWARE = {
    chrome: { name: 'Chrome', a: '#fbfcfd', b: '#a7b0ba', c: '#5d6670' },
    gold: { name: 'Gold', a: '#fff3c4', b: '#d6a93e', c: '#87601a' },
    black: { name: 'Black', a: '#6a6d73', b: '#2c2e33', c: '#0f1012' },
  };
  const HEAD_FACES = { auto: 'Auto', neck: 'Natural wood', match: 'Match body', black: 'Gloss black' };

  const DEFAULTS = {
    style: 'strat', finish: 'sunburst', customType: 'solid', customColor: '#2ec4b6', customColor2: '#0b3b4a',
    pickguard: 'white', board: 'rosewood', inlay: 'dots', inlayMat: 'pearl', hardware: 'chrome',
    tuning: 'standard', frets: 22, lefty: false, flip: false, binding: false, headFace: 'auto', view: 'full',
  };

  let cfg = Object.assign({}, DEFAULTS, FK.store.get('guitar', {}));
  let host = null, root = null, G = null;
  let markerLayer, hitLayer, artLayer, windowRect, numLayer, liveLayer;
  let liveList = [];
  let markers = [];
  let win = null;
  const clickHandlers = [];

  /* ---------------- Colour helpers ---------------- */
  function hexToRgb(h) {
    const x = h.replace('#', '');
    const v = parseInt(x.length === 3 ? x.split('').map((c) => c + c).join('') : x, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
    return '#' + [f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
  }
  function lum(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function finishOf(c) {
    if (c.finish === 'custom') return { id: 'custom', name: 'Custom', type: c.customType, c: [c.customColor, shade(c.customColor, -0.45), c.customColor2] };
    return FINISHES.find((f) => f.id === c.finish) || FINISHES[0];
  }

  /* ---------------- Geometry ---------------- */
  function tuningNotes() { return (TUNINGS[cfg.tuning] || TUNINGS.standard).notes; }

  function geometry() {
    const st = STYLES[cfg.style];
    const tun = tuningNotes();
    const n = tun.length;
    const F = cfg.frets;
    const s = st.scale;
    const nutX = 214;
    const boardLen = 1180;
    const real = (k) => 1 - Math.pow(2, -k / 12);
    const Fe = F + 0.5;
    const fx = (k) => nutX + boardLen * (0.6 * real(k) / real(Fe) + 0.4 * k / Fe);
    const boardEnd = fx(Fe);
    const halfNut = 24 + n * 13;
    const halfEnd = halfNut * 1.19;
    const half = (x) => halfNut + (halfEnd - halfNut) * FK.clamp((x - nutX) / (boardEnd - nutX), 0, 1.5);
    const inset = 12;
    const sy0 = (i, x) => { const h = half(x) - inset; return n === 1 ? 0 : h - (2 * h * i) / (n - 1); };
    const sy = (i, x) => (cfg.flip ? -sy0(i, x) : sy0(i, x));
    const cx = (k) => (k === 0 ? nutX - 30 : (fx(k - 1) + fx(k)) / 2);
    const bodyX = boardEnd - st.overlap * s;
    const pts = BODIES[cfg.style];
    const bodyMaxX = Math.max(...pts.map((p) => p[0]));
    const bodyMaxY = Math.max(...pts.map((p) => Math.abs(p[1])));
    const W = bodyX + bodyMaxX * s + 40;
    const H = Math.max(bodyMaxY * s, halfEnd + 60) + 34;
    const spacing = n > 1 ? (2 * (halfNut - inset)) / (n - 1) : 30;
    return { st, tun, n, F, s, nutX, fx, boardEnd, halfNut, halfEnd, half, sy0, sy, cx, bodyX, W, H, spacing, pts, inset };
  }

  /* ---------------- Rendering ---------------- */
  function defs(el) {
    const d = svg('defs', {}, el);
    const hw = HARDWARE[cfg.hardware];
    const lg = (id, stops, attrs = {}) => {
      const g = svg('linearGradient', Object.assign({ id, x1: 0, y1: 0, x2: 0, y2: 1 }, attrs), d);
      stops.forEach(([o, c, op]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': op == null ? 1 : op }, g));
      return g;
    };
    const rg = (id, stops, attrs = {}) => {
      const g = svg('radialGradient', Object.assign({ id }, attrs), d);
      stops.forEach(([o, c, op]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': op == null ? 1 : op }, g));
      return g;
    };
    lg('g-hw', [[0, hw.a], [0.45, hw.b], [1, hw.c]]);
    lg('g-hwx', [[0, hw.c], [0.5, hw.a], [1, hw.b]], { x2: 1, y2: 0 });
    const fin = finishOf(cfg);
    if (fin.type === 'burst') rg('g-finish', [[0, fin.c[0]], [0.42, fin.c[0]], [0.74, fin.c[1]], [1, fin.c[2]]], { cx: 0.6, cy: 0.5, r: 0.62 });
    else if (fin.type === 'metallic') lg('g-finish', [[0, shade(fin.c[0], 0.35)], [0.45, fin.c[0]], [1, shade(fin.c[0], -0.45)]], { x2: 1, y2: 1 });
    else if (fin.type === 'trans') rg('g-finish', [[0, shade(fin.c[0], 0.15)], [0.7, fin.c[0]], [1, shade(fin.c[0], -0.35)]], { cx: 0.58, cy: 0.5, r: 0.65 });
    else lg('g-finish', [[0, shade(fin.c[0], 0.08)], [1, shade(fin.c[0], -0.12)]]);
    lg('g-gloss', [[0, '#fff', 0.32], [0.35, '#fff', 0.05], [0.6, '#000', 0], [1, '#000', 0.25]], { x2: 0.4, y2: 1 });
    rg('g-vignette', [[0.6, '#000', 0], [1, '#000', 0.38]], { cx: 0.55, cy: 0.5, r: 0.6 });
    const b = BOARDS[cfg.board];
    lg('g-board', [[0, b.c2], [0.5, b.c1], [1, b.c2]]);
    lg('g-fretwire', [[0, '#8f959c'], [0.5, '#f5f7f9'], [1, '#7c828a']], { x2: 1, y2: 0 });
    rg('g-hole', [[0, '#050302'], [0.8, '#120a05'], [1, '#2a1a0e']]);
    lg('g-pickup', [[0, '#3a3a3e'], [1, '#111113']]);
    rg('g-knob-amber', [[0, '#ffe08a'], [0.6, '#d9962a'], [1, '#7a4a0c']], { cx: 0.4, cy: 0.35 });
    rg('g-knob-white', [[0, '#ffffff'], [0.7, '#ebe7dc'], [1, '#b9b3a6']], { cx: 0.4, cy: 0.35 });
    rg('g-knob-black', [[0, '#5b5b60'], [0.7, '#1e1e21'], [1, '#050505']], { cx: 0.4, cy: 0.35 });
    rg('g-knob-hw', [[0, hw.a], [0.6, hw.b], [1, hw.c]], { cx: 0.4, cy: 0.35 });

    const filt = (id, inner, extra = {}) => {
      const f = svg('filter', Object.assign({ id, x: '-10%', y: '-10%', width: '120%', height: '120%' }, extra), d);
      f.innerHTML = inner;
      return f;
    };
    filt('g-grain', '<feTurbulence type="fractalNoise" baseFrequency="0.005 0.07" numOctaves="4" seed="4"/><feColorMatrix values="0 0 0 0 0.16  0 0 0 0 0.08  0 0 0 0 0.03  1.7 0 0 0 -0.62"/><feComposite in2="SourceAlpha" operator="in"/>');
    filt('g-boardgrain', '<feTurbulence type="fractalNoise" baseFrequency="0.0035 0.11" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 0.06  0 0 0 0 0.03  0 0 0 0 0.01  1.8 0 0 0 -0.7"/><feComposite in2="SourceAlpha" operator="in"/>');
    filt('g-sparkle', '<feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="2"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  6 0 0 0 -4.6"/><feComposite in2="SourceAlpha" operator="in"/>');
    filt('g-spots', '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0.72  0 0 0 0 0.33  0 0 0 0 0.08  2.4 0 0 0 -1.1"/><feComposite in2="SourceAlpha" operator="in"/>');
    filt('g-pearl', '<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="11"/><feColorMatrix values="0.6 0.2 0 0 0.3  0 0.7 0.2 0 0.25  0.3 0 0.7 0 0.3  0 0 0 0 0.55"/><feComposite in2="SourceAlpha" operator="in"/>');
    filt('g-glow', '<feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>', { x: '-50%', y: '-50%', width: '200%', height: '200%' });
    filt('g-shadow', '<feGaussianBlur stdDeviation="14"/>', { x: '-20%', y: '-30%', width: '140%', height: '160%' });
    return d;
  }

  function headFaceColor() {
    const st = STYLES[cfg.style];
    const mode = cfg.headFace === 'auto' ? st.headFace : cfg.headFace;
    if (mode === 'match') { const f = finishOf(cfg); return f.type === 'burst' ? f.c[2] : f.c[0]; }
    if (mode === 'black') return '#151314';
    if (mode === 'dark') return '#1f1712';
    if (mode === 'rosewood') return '#5a3524';
    const b = BOARDS[cfg.board];
    return cfg.board === 'maple' || cfg.board === 'roasted' ? b.c1 : '#e2bb83';
  }

  function headstockShape(type, nutX, h) {
    const X = (dx) => nutX - dx;
    if (type === 'inline') return [[X(0), -h], [X(40), -h - 2], [X(95), -h + 2], [X(150), -h - 6], [X(185), -h - 14], [X(205), -h + 6], [X(200), h + 20], [X(175), h + 42], [X(130), h + 46], [X(80), h + 30], [X(30), h + 10], [X(0), h]];
    if (type === 'tele') return [[X(0), -h], [X(60), -h + 4], [X(170), -h + 10], [X(196), -h + 18], [X(206), 0], [X(200), h + 30], [X(160), h + 44], [X(60), h + 30], [X(0), h]];
    if (type === 'slotted') return [[X(0), -h - 4], [X(178), -h - 6], [X(196), -h - 18], [X(212), -h + 10], [X(203), 0], [X(212), h - 10], [X(196), h + 18], [X(178), h + 6], [X(0), h + 4]];
    return [[X(0), -h], [X(30), -h - 14], [X(100), -h - 28], [X(180), -h - 32], [X(198), -h - 12], [X(186), -8], [X(200), 0], [X(186), 8], [X(198), h + 12], [X(180), h + 32], [X(100), h + 28], [X(30), h + 14], [X(0), h]];
  }

  function posts(type, nutX, h, n) {
    // returns post positions (unflipped coords), index = string number (0 = lowest)
    const out = [];
    if (type === 'inline' || type === 'tele') {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : i / (n - 1);
        out.push({ x: nutX - 42 - t * 140, y: h * 0.55 - t * 6, side: 1 });
      }
    } else {
      const bassCount = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const bass = i < bassCount;
        const j = bass ? i : n - 1 - i;
        const cnt = bass ? bassCount : n - bassCount;
        const step = cnt > 3 ? 36 : 48;
        out.push({ x: nutX - 48 - j * step, y: (bass ? 1 : -1) * h * (0.64 - j * 0.08), side: bass ? 1 : -1 });
      }
    }
    return out;
  }

  function render() {
    if (!host) return;
    G = geometry();
    const { st, tun, n, F, s, nutX, fx, boardEnd, halfNut, halfEnd, half, sy0, sy, cx, bodyX, W, H } = G;
    const hw = HARDWARE[cfg.hardware];
    const X = (x) => (cfg.lefty ? W - x : x);
    G.X = X;

    host.innerHTML = '';
    root = svg('svg', { class: 'gtr-svg', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Interactive guitar fretboard' }, host);
    defs(root);

    // ---- shadow
    const shadow = svg('g', { class: 'gtr-shadow', filter: 'url(#g-shadow)', opacity: 0.55, transform: (cfg.lefty ? `translate(${W},0) scale(-1,1) ` : '') + 'translate(10,22)' }, root);
    svg('path', { d: FK.smoothPath(G.pts), transform: `translate(${bodyX},0) scale(${s},${cfg.flip ? -s : s})`, fill: '#000' }, shadow);
    svg('path', { d: `M${nutX - 205},${-halfNut - 10} L${boardEnd},${-halfEnd} L${boardEnd},${halfEnd} L${nutX - 205},${halfNut + 10}Z`, fill: '#000' }, shadow);

    artLayer = svg('g', { class: 'gtr-art', transform: cfg.lefty ? `translate(${W},0) scale(-1,1)` : null }, root);

    // ---- body
    const fin = finishOf(cfg);
    const body = svg('g', { class: 'gtr-body', transform: `translate(${bodyX},0) scale(${s},${cfg.flip ? -s : s})` }, artLayer);
    const bodyD = FK.smoothPath(G.pts);
    svg('path', { d: bodyD, fill: 'url(#g-finish)' }, body);
    if (fin.type === 'trans' || fin.id === 'honeyburst') svg('path', { d: bodyD, fill: '#fff', filter: 'url(#g-grain)', opacity: 0.85 }, body);
    if (fin.type === 'metallic') svg('path', { d: bodyD, fill: '#fff', filter: 'url(#g-sparkle)', opacity: 0.55 }, body);
    svg('path', { d: bodyD, fill: 'url(#g-vignette)' }, body);
    if (cfg.binding || st.family === 'acoustic') svg('path', { d: bodyD, fill: 'none', stroke: '#efe4c8', 'stroke-width': 5 / s * 1.2 }, body);
    svg('path', { d: bodyD, fill: 'none', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 2.2 / s }, body);

    const hU = halfEnd / s;
    const d0 = st.overlap + 18;
    const poleY = (i) => sy0(i, boardEnd + 150) / s;
    drawBodyDetails(body, cfg.style, { hU, d0, s, n, poleY, hw, fin });
    svg('path', { d: bodyD, fill: 'url(#g-gloss)', 'pointer-events': 'none' }, body);

    // ---- headstock
    const head = svg('g', { class: 'gtr-head', transform: cfg.flip ? 'scale(1,-1)' : null }, artLayer);
    const hpts = headstockShape(st.head, nutX, halfNut);
    const hd = FK.smoothPath(hpts);
    const face = headFaceColor();
    svg('path', { d: hd, fill: face }, head);
    if (st.head === 'slotted' || face === '#e2bb83' || cfg.board === 'maple' || cfg.board === 'roasted') svg('path', { d: hd, fill: '#fff', filter: 'url(#g-boardgrain)', opacity: 0.6 }, head);
    svg('path', { d: hd, fill: 'url(#g-gloss)' }, head);
    svg('path', { d: hd, fill: 'none', stroke: 'rgba(0,0,0,.5)', 'stroke-width': 2 }, head);
    if (st.head === 'slotted') {
      svg('rect', { x: nutX - 172, y: -halfNut + 14, width: 128, height: halfNut - 26, rx: 8, fill: '#140c08' }, head);
      svg('rect', { x: nutX - 172, y: 12, width: 128, height: halfNut - 26, rx: 8, fill: '#140c08' }, head);
    }
    if (st.head === 'split') {
      const trc = `M${nutX - 6},-14 L${nutX - 50},-10 Q${nutX - 66},0 ${nutX - 50},10 L${nutX - 6},14Z`;
      svg('path', { d: trc, fill: '#111', stroke: '#e9e4d8', 'stroke-width': 1.6 }, head);
    }
    const P = posts(st.head, nutX, halfNut, n);
    // headstock strings
    P.forEach((p, i) => {
      const y0 = sy0(i, nutX);
      svg('line', { x1: nutX, y1: y0, x2: p.x, y2: p.y, class: 'hstr', 'stroke-width': stringWidth(i, n, tun) * 0.9 }, head);
    });
    P.forEach((p) => {
      // tuner key outside the headstock edge
      const edge = p.side * (halfNut + (st.head === 'slotted' ? 16 : 30));
      if (st.head !== 'slotted') svg('line', { x1: p.x, y1: p.y, x2: p.x, y2: edge, stroke: 'url(#g-hwx)', 'stroke-width': 5 }, head);
      svg('rect', { x: p.x - 9, y: edge - (p.side > 0 ? 0 : 22), width: 18, height: 22, rx: 7, fill: st.family === 'acoustic' && st.head === 'slotted' ? '#efe7d4' : 'url(#g-hwx)', stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1 }, head);
      svg('circle', { cx: p.x, cy: p.y, r: st.head === 'slotted' ? 4 : 7, fill: 'url(#g-hw)', stroke: 'rgba(0,0,0,.5)', 'stroke-width': 1 }, head);
      svg('circle', { cx: p.x, cy: p.y, r: 2.4, fill: hw.c }, head);
    });
    if (st.head === 'slotted') {
      svg('rect', { x: nutX - 176, y: -halfNut - 30, width: 136, height: 16, rx: 3, fill: 'url(#g-hw)', opacity: 0.9 }, head);
      svg('rect', { x: nutX - 176, y: halfNut + 14, width: 136, height: 16, rx: 3, fill: 'url(#g-hw)', opacity: 0.9 }, head);
    }

    // ---- fretboard
    const board = svg('g', { class: 'gtr-board' }, artLayer);
    const bd = `M${nutX},${-halfNut} L${boardEnd},${-halfEnd} L${boardEnd},${halfEnd} L${nutX},${halfNut}Z`;
    svg('path', { d: bd, fill: 'url(#g-board)' }, board);
    svg('path', { d: bd, fill: '#fff', filter: 'url(#g-boardgrain)', opacity: BOARDS[cfg.board].grain + 0.3 }, board);
    if (cfg.binding || st.family === 'acoustic') {
      svg('line', { x1: nutX, y1: -halfNut + 1.5, x2: boardEnd, y2: -halfEnd + 1.5, stroke: '#f0e6cb', 'stroke-width': 3 }, board);
      svg('line', { x1: nutX, y1: halfNut - 1.5, x2: boardEnd, y2: halfEnd - 1.5, stroke: '#f0e6cb', 'stroke-width': 3 }, board);
    }
    drawInlays(board);
    for (let k = 1; k <= F; k++) {
      const x = fx(k), h = half(x) - 1;
      svg('line', { x1: x, y1: -h, x2: x, y2: h, stroke: 'rgba(0,0,0,.45)', 'stroke-width': 6 }, board);
      svg('line', { x1: x, y1: -h, x2: x, y2: h, stroke: 'url(#g-fretwire)', 'stroke-width': 3.6 }, board);
    }
    svg('rect', { x: nutX - 9, y: -halfNut - 1, width: 10, height: halfNut * 2 + 2, rx: 2, fill: '#efe7d3', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1 }, board);
    svg('path', { d: bd, fill: 'none', stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1.5 }, board);

    // position window (inside art so it mirrors with the neck)
    windowRect = svg('rect', { class: 'pos-window', rx: 10 }, artLayer);

    // ---- strings
    const strings = svg('g', { class: 'gtr-strings' }, artLayer);
    const bridgeX = bodyX + G.bridgeU * s;
    G.bridgeX = bridgeX;
    const nylon = st.head === 'slotted';
    for (let i = 0; i < n; i++) {
      const w = stringWidth(i, n, tun);
      const y1 = sy(i, nutX), y2 = sy(i, boardEnd);
      const yb = y1 + (y2 - y1) * ((bridgeX - nutX) / (boardEnd - nutX));
      const wound = tun[i] < 52 || (n <= 5 && i < n);
      const g = svg('g', { class: 'str', 'data-i': i }, strings);
      svg('line', { x1: nutX, y1, x2: bridgeX, y2: yb, stroke: 'rgba(0,0,0,.35)', 'stroke-width': w + 1.4, transform: 'translate(0,1.6)' }, g);
      const color = nylon && !wound ? '#f4efe2' : wound ? (nylon ? '#d9d6cf' : '#c9c2b2') : '#e8ebef';
      svg('line', { x1: nutX, y1, x2: bridgeX, y2: yb, stroke: color, 'stroke-width': w }, g);
      if (wound) svg('line', { x1: nutX, y1, x2: bridgeX, y2: yb, stroke: 'rgba(60,50,40,.45)', 'stroke-width': w, 'stroke-dasharray': '1 1.4' }, g);
    }

    // hit areas (mirrored with the art)
    hitLayer = svg('g', { class: 'gtr-hits' }, artLayer);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k <= F; k++) {
        const x0 = k === 0 ? nutX - 58 : fx(k - 1);
        const x1 = k === 0 ? nutX - 4 : fx(k);
        const yc = sy(i, (x0 + x1) / 2);
        svg('rect', { x: x0, y: yc - G.spacing / 2, width: x1 - x0, height: G.spacing, class: 'hit', 'data-s': i, 'data-f': k }, hitLayer);
      }
    }

    // ---- unmirrored overlays
    numLayer = svg('g', { class: 'fretnums' }, root);
    for (let k = 1; k <= F; k++) {
      const big = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(k);
      svg('text', { x: X(cx(k)), y: half(cx(k)) + 26, class: 'fretnum' + (big ? ' big' : '') }, numLayer).textContent = k;
    }
    // open-string note names at the nut
    const openLayer = svg('g', { class: 'open-names' }, root);
    for (let i = 0; i < n; i++) {
      svg('text', { x: X(nutX - 66), y: sy(i, nutX) + 4, class: 'open-name' }, openLayer).textContent = T.pretty(T.SHARP_NAMES[mod(tun[i])]);
    }
    if (st.head !== 'slotted') {
      const bx = st.head === 'split' ? nutX - 118 : nutX - 112;
      const by = st.head === 'split' ? 6 : (cfg.flip ? 1 : -1) * halfNut * 0.38 + 6;
      const brand = svg('text', { x: X(bx), y: by, class: 'brand-head', fill: lum(face) > 0.5 ? '#2a1b10' : '#e9cf8d' }, root);
      brand.textContent = 'Fret&Key';
    }

    markerLayer = svg('g', { class: 'markers' }, root);
    liveLayer = svg('g', { class: 'live-layer' }, root);

    applyView(false);
    drawWindow();
    drawMarkers(true);
    drawLive();
  }

  /* notes being played right now (MIDI / audio input) */
  function drawLive() {
    if (!liveLayer || !G) return;
    liveLayer.innerHTML = '';
    const r = Math.min(15, G.spacing * 0.43) + 5;
    liveList.forEach(({ s: str, f }) => {
      if (str >= G.n || f > G.F) return;
      const x = G.X(G.cx(f)), y = G.sy(str, G.cx(f));
      const inScale = markers.some((m) => m.s === str && m.f === f && !m.ghost) || markers.some((m) => !m.ghost && mod(FK.guitar.midiAt(m.s, m.f)) === mod(FK.guitar.midiAt(str, f)));
      const g = svg('g', { class: 'live-note' + (markers.length ? (inScale ? ' in' : ' out') : ''), transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` }, liveLayer);
      svg('circle', { r, class: 'live-ring' }, g);
      svg('circle', { r: r * 0.45, class: 'live-dot' }, g);
    });
  }

  function stringWidth(i, n, tun) {
    const bass = tun[0] < 36;
    const w = 1.15 + (n - 1 - i) * (bass ? 0.75 : 0.42);
    return bass ? w + 1.2 : w;
  }

  function drawInlays(board) {
    const { F, fx, half } = G;
    if (cfg.inlay === 'none') return;
    const mat = INLAY_MATS[cfg.inlayMat];
    const grp = svg('g', { class: 'inlays', filter: mat.glow ? 'url(#g-glow)' : null }, board);
    const singles = [3, 5, 7, 9, 15, 17, 19, 21];
    const doubles = [12, 24];
    for (let k = 1; k <= F; k++) {
      const isS = singles.includes(k), isD = doubles.includes(k);
      if (!isS && !isD) continue;
      const x0 = fx(k - 1), x1 = fx(k), xc = (x0 + x1) / 2, gap = x1 - x0, h = half(xc);
      const shapes = [];
      if (cfg.inlay === 'dots') {
        if (isD) { shapes.push(['circle', { cx: xc, cy: -h * 0.48, r: 9 }]); shapes.push(['circle', { cx: xc, cy: h * 0.48, r: 9 }]); }
        else shapes.push(['circle', { cx: xc, cy: 0, r: 10 }]);
      } else if (cfg.inlay === 'blocks') {
        const w = gap * 0.56, hh = h * 1.28;
        shapes.push(['rect', { x: xc - w / 2, y: -hh / 2, width: w, height: hh, rx: 2 }]);
      } else if (cfg.inlay === 'trapezoid') {
        const w = gap * 0.5, a = h * 0.72, b = h * 0.5;
        shapes.push(['path', { d: `M${xc - w / 2},${-a} L${xc + w / 2},${-b} L${xc + w / 2},${b} L${xc - w / 2},${a}Z` }]);
      } else if (cfg.inlay === 'sharks') {
        const w = gap * 0.62, a = h * 0.78;
        shapes.push(['path', { d: `M${xc - w / 2},${a} L${xc + w / 2},${a} L${xc + w / 2},${-a}Z` }]);
      }
      shapes.forEach(([tag, attrs]) => {
        svg(tag, Object.assign({ fill: mat.fill }, attrs), grp);
        if (mat.shimmer) svg(tag, Object.assign({ fill: '#fff', filter: 'url(#g-pearl)' }, attrs), grp);
      });
    }
  }

  /* All in body units (body group is translated + scaled) */
  function drawBodyDetails(g, style, o) {
    const { hU, d0, s, n, poleY, fin } = o;
    const pgOn = cfg.pickguard !== 'none';
    const pg = PICKGUARDS[cfg.pickguard];
    const pickguard = (pts) => {
      if (!pgOn) return;
      const d = FK.smoothPath(pts);
      svg('path', { d, fill: pg.fill, stroke: pg.edge, 'stroke-width': 3 / s }, g);
      if (pg.spots) svg('path', { d, fill: '#fff', filter: 'url(#g-spots)' }, g);
      if (pg.shimmer) svg('path', { d, fill: '#fff', filter: 'url(#g-pearl)', opacity: 0.8 }, g);
      svg('path', { d, fill: 'none', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1 / s }, g);
    };
    const coverColor = pgOn && lum(pg.fill || '#000') < 0.4 ? '#1b1b1d' : '#f1ede2';
    const len = 2 * hU + 20;
    const singleCoil = (x, angle = 0, cover = coverColor) => {
      const grp = svg('g', { transform: `rotate(${angle} ${x} 0)` }, g);
      svg('rect', { x: x - 11, y: -len / 2, width: 22, height: len, rx: 11, fill: cover, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1.2 / s }, grp);
      for (let i = 0; i < n; i++) svg('circle', { cx: x, cy: poleY(i), r: 2.6, fill: 'url(#g-hw)' }, grp);
    };
    const humbucker = (x, chromeCover) => {
      svg('rect', { x: x - 30, y: -len / 2 - 8, width: 60, height: len + 16, rx: 6, fill: '#1d1c1c', stroke: 'rgba(255,255,255,.15)', 'stroke-width': 1 / s }, g);
      if (chromeCover) {
        svg('rect', { x: x - 24, y: -len / 2, width: 48, height: len, rx: 4, fill: 'url(#g-hwx)' }, g);
        for (let i = 0; i < n; i++) svg('circle', { cx: x - 9, cy: poleY(i), r: 2.6, fill: 'rgba(0,0,0,.35)' }, g);
      } else {
        svg('rect', { x: x - 24, y: -len / 2, width: 23, height: len, rx: 9, fill: 'url(#g-pickup)' }, g);
        svg('rect', { x: x + 1, y: -len / 2, width: 23, height: len, rx: 9, fill: 'url(#g-pickup)' }, g);
        for (let i = 0; i < n; i++) {
          svg('circle', { cx: x - 12.5, cy: poleY(i), r: 2.6, fill: 'url(#g-hw)' }, g);
          svg('circle', { cx: x + 12.5, cy: poleY(i), r: 2.4, fill: '#8b9097' }, g);
        }
      }
    };
    const knob = (x, y, kind = 'hw', r = 13) => {
      svg('circle', { cx: x + 1.5, cy: y + 2, r: r + 1, fill: 'rgba(0,0,0,.35)' }, g);
      svg('circle', { cx: x, cy: y, r, fill: `url(#g-knob-${kind})`, stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1 / s }, g);
      svg('circle', { cx: x, cy: y, r: r * 0.45, fill: 'none', stroke: 'rgba(0,0,0,.18)', 'stroke-width': 1 / s }, g);
    };
    const tom = (x) => {
      svg('rect', { x: x - 7, y: -hU - 18, width: 14, height: 2 * hU + 36, rx: 5, fill: 'url(#g-hwx)', stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1 / s }, g);
      for (let i = 0; i < n; i++) svg('rect', { x: x - 4, y: poleY(i) - 3, width: 8, height: 6, rx: 1.5, fill: 'url(#g-hw)' }, g);
    };
    const stopbar = (x) => {
      svg('rect', { x: x - 8, y: -hU - 14, width: 16, height: 2 * hU + 28, rx: 8, fill: 'url(#g-hwx)', stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1 / s }, g);
    };

    if (style === 'strat') {
      pickguard([[0, -hU - 6], [d0 - 60, -hU - 12], [d0 + 40, -hU - 16], [d0 + 110, -hU - 22], [d0 + 175, -hU - 48], [d0 + 222, -hU - 82], [d0 + 240, -hU - 58], [d0 + 205, -hU - 16], [d0 + 142, -hU + 4], [d0 + 138, hU + 12], [d0 + 160, hU + 40], [d0 + 120, hU + 72], [d0 + 20, hU + 62], [d0 - 60, hU + 76], [-70, hU + 100], [-100, hU + 84], [-60, hU + 40], [0, hU + 6]]);
      singleCoil(d0 + 14); singleCoil(d0 + 58); singleCoil(d0 + 104, -9);
      svg('rect', { x: d0 + 146, y: -hU - 14, width: 40, height: 2 * hU + 28, rx: 4, fill: 'url(#g-hwx)', stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1 / s }, g);
      for (let i = 0; i < n; i++) svg('rect', { x: d0 + 160, y: poleY(i) - 4.5, width: 18, height: 9, rx: 2, fill: 'url(#g-hw)', stroke: 'rgba(0,0,0,.3)', 'stroke-width': 0.6 / s }, g);
      const kk = lum(pg.fill || '#fff') < 0.4 ? 'black' : 'white';
      knob(d0 + 150, -hU - 34, kk); knob(d0 + 186, -hU - 48, kk); knob(d0 + 216, -hU - 70, kk);
      svg('rect', { x: d0 + 100, y: -hU - 22, width: 26, height: 7, rx: 3.5, fill: '#111', transform: `rotate(-24 ${d0 + 113} ${-hU - 18})` }, g);
      svg('circle', { cx: d0 + 108, cy: -hU - 16, r: 5, fill: kk === 'black' ? '#222' : '#f3efe4', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1 / s }, g);
      G.bridgeU = d0 + 168;
    } else if (style === 'tele') {
      pickguard([[0, -hU - 6], [d0 - 30, -hU - 10], [d0 + 36, -hU - 10], [d0 + 46, -hU + 8], [d0 + 46, hU + 14], [d0 + 12, hU + 54], [d0 - 90, hU + 72], [-20, hU + 98], [-30, hU + 60], [0, hU + 6]]);
      svg('rect', { x: d0 + 2, y: -len / 2 + 4, width: 26, height: len - 8, rx: 11, fill: 'url(#g-hwx)', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1 / s }, g);
      svg('rect', { x: d0 + 70, y: -hU - 26, width: 130, height: 2 * hU + 52, rx: 10, fill: 'url(#g-hwx)', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1.2 / s }, g);
      singleCoil(d0 + 100, -8, '#151515');
      for (let p = 0; p < Math.ceil(n / 2); p++) {
        const a = poleY(p * 2), b = poleY(Math.min(n - 1, p * 2 + 1));
        svg('rect', { x: d0 + 150, y: Math.min(a, b) - 6, width: 24, height: Math.abs(b - a) + 12, rx: 5, fill: 'url(#g-hw)', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 0.8 / s }, g);
      }
      for (let i = 0; i < n; i++) svg('circle', { cx: d0 + 190, cy: poleY(i), r: 3, fill: '#333' }, g);
      const cp = svg('g', { transform: `rotate(-14 ${d0 + 170} ${hU + 70})` }, g);
      svg('rect', { x: d0 + 90, y: hU + 52, width: 165, height: 36, rx: 18, fill: 'url(#g-hwx)', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1 / s }, cp);
      svg('rect', { x: d0 + 108, y: hU + 66, width: 22, height: 8, rx: 4, fill: '#111' }, cp);
      [d0 + 168, d0 + 228].forEach((x) => {
        svg('circle', { cx: x, cy: hU + 70, r: 14, fill: 'url(#g-knob-hw)', stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1 / s }, cp);
        svg('circle', { cx: x, cy: hU + 70, r: 10, fill: 'none', stroke: 'rgba(0,0,0,.25)', 'stroke-dasharray': '1.5 1.5', 'stroke-width': 1.4 }, cp);
      });
      G.bridgeU = d0 + 190;
    } else if (style === 'lespaul') {
      if (pgOn) pickguard([[d0 - 24, -hU - 6], [d0 + 92, -hU - 8], [d0 + 112, -hU - 30], [d0 + 72, -hU - 64], [d0 - 10, -hU - 60], [d0 - 42, -hU - 30]]);
      const chrome = fin.id === 'goldtop' || cfg.hardware === 'gold';
      humbucker(d0 + 24, chrome); humbucker(d0 + 108, chrome);
      tom(d0 + 150); stopbar(d0 + 186);
      knob(d0 + 156, -hU - 42, 'amber'); knob(d0 + 210, -hU - 26, 'amber'); knob(d0 + 176, -hU - 92, 'amber'); knob(d0 + 230, -hU - 76, 'amber');
      svg('circle', { cx: 38, cy: -158, r: 13, fill: '#f0eadb', stroke: 'rgba(0,0,0,.4)', 'stroke-width': 1 / s }, g);
      svg('circle', { cx: 38, cy: -158, r: 4.5, fill: 'url(#g-hw)' }, g);
      G.bridgeU = d0 + 186;
    } else if (style === 'sg') {
      pickguard([[-20, -hU - 6], [10, -hU - 18], [d0 + 80, -hU - 26], [d0 + 160, -hU - 24], [d0 + 196, -hU - 10], [d0 + 196, hU + 10], [d0 + 150, hU + 40], [d0 + 70, hU + 70], [d0 - 10, hU + 104], [-62, hU + 92], [-44, hU + 40], [-20, hU + 6]]);
      humbucker(d0 + 40, false); humbucker(d0 + 130, false);
      tom(d0 + 172); stopbar(d0 + 208);
      knob(d0 + 218, -hU - 40, 'black'); knob(d0 + 268, -hU - 24, 'black'); knob(d0 + 238, -hU - 88, 'black'); knob(d0 + 288, -hU - 72, 'black');
      G.bridgeU = d0 + 208;
    } else if (style === 'dread') {
      const hx = d0 + 52;
      if (pgOn) pickguard([[hx - 30, 60], [hx + 30, 58], [hx + 78, 86], [hx + 82, 140], [hx + 40, 168], [hx - 15, 150], [hx - 44, 104]]);
      [[64, '#2a1a0e', 0], [60, '#e9dcc0', 0], [57, '#1b120b', 0], [54, '#e9dcc0', 0]].forEach(([r, c]) => svg('circle', { cx: hx, cy: 0, r, fill: c }, g));
      svg('circle', { cx: hx, cy: 0, r: 51, fill: 'url(#g-hole)' }, g);
      const bx = d0 + 196;
      svg('path', { d: FK.smoothPath([[bx, -hU - 50], [bx + 20, -hU - 62], [bx + 42, -hU - 48], [bx + 40, 0], [bx + 42, hU + 48], [bx + 20, hU + 62], [bx, hU + 50], [bx - 4, 0]]), fill: '#1f140e', stroke: 'rgba(0,0,0,.5)', 'stroke-width': 1 / s }, g);
      svg('line', { x1: bx + 10, y1: -hU - 8, x2: bx + 13, y2: hU + 8, stroke: '#f3ecdc', 'stroke-width': 3.2 }, g);
      for (let i = 0; i < n; i++) svg('circle', { cx: bx + 26, cy: poleY(i), r: 3.6, fill: '#f3ecdc', stroke: 'rgba(0,0,0,.4)', 'stroke-width': 0.6 / s }, g);
      G.bridgeU = bx + 26;
    } else if (style === 'classical') {
      const hx = d0 + 50;
      const rings = ['#3a2412', '#c9a46a', '#0e5c4a', '#d9c49a', '#7a2d1a', '#d9c49a', '#0e5c4a', '#c9a46a', '#3a2412'];
      rings.forEach((c, i) => svg('circle', { cx: hx, cy: 0, r: 66 - i * 1.8, fill: c }, g));
      svg('circle', { cx: hx, cy: 0, r: 49, fill: 'url(#g-hole)' }, g);
      const bx = d0 + 182;
      svg('rect', { x: bx, y: -hU - 62, width: 46, height: 2 * hU + 124, rx: 10, fill: '#3a2216', stroke: 'rgba(0,0,0,.5)', 'stroke-width': 1 / s }, g);
      svg('line', { x1: bx + 8, y1: -hU - 6, x2: bx + 8, y2: hU + 6, stroke: '#f3ecdc', 'stroke-width': 3.2 }, g);
      svg('rect', { x: bx + 22, y: -hU - 10, width: 18, height: 2 * hU + 20, rx: 3, fill: '#e2cfa3' }, g);
      for (let i = 0; i < n; i++) svg('path', { d: `M${bx + 22},${poleY(i)} q8,-5 16,0`, fill: 'none', stroke: '#f4efe2', 'stroke-width': 1.6 }, g);
      G.bridgeU = bx + 30;
    }
  }

  /* ---------------- View / window / markers ---------------- */
  let vbAnim = null;
  function targetViewBox() {
    const { nutX, boardEnd, halfEnd, W, H } = G;
    let x, y, w, h;
    if (cfg.view === 'zoom') { x = nutX - 82; w = boardEnd - nutX + 96; y = -halfEnd - 20; h = 2 * halfEnd + 62; }
    else { x = 0; y = -H; w = W; h = 2 * H; }
    if (cfg.lefty) x = W - (x + w);
    return [x, y, w, h];
  }
  function applyView(animate) {
    if (!root) return;
    const to = targetViewBox();
    host.classList.toggle('zoomed', cfg.view === 'zoom');
    if (!animate || !root.getAttribute('viewBox')) { root.setAttribute('viewBox', to.join(' ')); return; }
    const from = root.getAttribute('viewBox').split(' ').map(Number);
    const t0 = performance.now();
    cancelAnimationFrame(vbAnim);
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 450);
      const e = 1 - Math.pow(1 - p, 3);
      root.setAttribute('viewBox', from.map((v, i) => v + (to[i] - v) * e).join(' '));
      if (p < 1) vbAnim = requestAnimationFrame(step);
    };
    vbAnim = requestAnimationFrame(step);
  }

  function drawWindow() {
    if (!windowRect) return;
    if (!win) { windowRect.setAttribute('display', 'none'); return; }
    const { fx, nutX, halfEnd, F } = G;
    const a = win.start, b = Math.min(F, win.start + win.size - 1);
    const x0 = a === 0 ? nutX - 58 : fx(a - 1) - 2;
    const x1 = fx(b) + 2;
    windowRect.removeAttribute('display');
    windowRect.setAttribute('x', x0);
    windowRect.setAttribute('width', x1 - x0);
    windowRect.setAttribute('y', -halfEnd - 8);
    windowRect.setAttribute('height', 2 * halfEnd + 16);
  }

  function inWindow(f) { return !win || (f >= win.start && f <= win.start + win.size - 1); }

  function drawMarkers(animate) {
    if (!markerLayer) return;
    markerLayer.innerHTML = '';
    const { cx, sy, X, spacing } = G;
    const r = Math.min(15, spacing * 0.43);
    markers.forEach((m, idx) => {
      if (m.s >= G.n || m.f > G.F) return;
      const x = X(cx(m.f)), y = sy(m.s, cx(m.f));
      const dim = m.ghost || (win && !inWindow(m.f));
      const grp = svg('g', { class: `mk ${m.cls || ''}${dim ? ' dim' : ''}${m.ghost ? ' ghost' : ''}`, transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`, 'data-k': m.s + ':' + m.f }, markerLayer);
      const inner = svg('g', { class: 'mk-in' + (animate ? ' pop' : ''), style: animate ? `animation-delay:${Math.min(idx * 6, 380)}ms` : null }, grp);
      const rr = m.ghost ? r * 0.55 : r;
      svg('circle', { r: rr, class: 'mk-c' }, inner);
      if (m.root && !m.ghost) svg('circle', { r: rr + 3.5, class: 'mk-ring' }, inner);
      const label = FK.markerLabel ? FK.markerLabel(m) : m.note;
      if (label && !m.ghost) {
        const t = svg('text', { class: 'mk-t', y: 0.5, 'font-size': (label.length > 2 ? r * 0.78 : r * 0.98).toFixed(1) }, inner);
        t.textContent = label;
      }
    });
  }

  function flash(s, f) {
    if (!root) return;
    const strEl = root.querySelector(`.str[data-i="${s}"]`);
    if (strEl) {
      strEl.classList.remove('vib');
      void strEl.getBBox;
      requestAnimationFrame(() => strEl.classList.add('vib'));
      clearTimeout(strEl._t);
      strEl._t = setTimeout(() => strEl.classList.remove('vib'), 900);
    }
    const mk = markerLayer && markerLayer.querySelector(`.mk[data-k="${s}:${f}"]`);
    if (mk) {
      mk.classList.remove('hit');
      requestAnimationFrame(() => mk.classList.add('hit'));
      clearTimeout(mk._t);
      mk._t = setTimeout(() => mk.classList.remove('hit'), 420);
    } else if (G) {
      const x = G.X(G.cx(f)), y = G.sy(s, G.cx(f));
      const ping = svg('circle', { cx: x, cy: y, r: 12, class: 'ping' }, markerLayer);
      setTimeout(() => ping.remove(), 650);
    }
  }

  /* ---------------- Interaction ---------------- */
  function onPointer(e) {
    const t = e.target.closest && e.target.closest('.hit');
    if (!t) return;
    e.preventDefault();
    const s = +t.dataset.s, f = +t.dataset.f;
    const midi = tuningNotes()[s] + f;
    clickHandlers.forEach((fn) => fn({ s, f, midi, inst: 'guitar' }));
  }

  /* ---------------- Voicing finder ---------------- */
  function findVoicings(rootPc, suffix, opts = {}) {
    const def = T.chordDef(suffix);
    if (!def) return [];
    const tun = tuningNotes();
    const n = tun.length;
    const pcs = new Map();
    def.degs.forEach((d) => { const pc = mod(rootPc + d.semi); if (!pcs.has(pc)) pcs.set(pc, d.label === '1' ? 'R' : d.label); });
    const optional = new Set(def.optional.map((o) => mod(rootPc + T.parseDegree(o).semi)));
    const required = [...pcs.keys()].filter((pc) => !optional.has(pc));
    const bassPc = opts.bassPc != null ? opts.bassPc : rootPc;
    const anyBass = !!opts.anyBass;
    const maxFret = Math.min(opts.maxFret || 15, cfg.frets);
    const power = pcs.size <= 2;
    const minStrings = power ? 2 : n >= 6 ? 4 : 3;
    const seen = new Set();
    const res = [];
    const evaluate = (frets) => {
      const key = frets.join(',');
      if (seen.has(key)) return;
      seen.add(key);
      const sounding = [];
      frets.forEach((f, i) => { if (f >= 0) sounding.push(i); });
      if (sounding.length < minStrings) return;
      const first = sounding[0], last = sounding[sounding.length - 1];
      let interior = 0;
      for (let i = first; i <= last; i++) if (frets[i] < 0) interior++;
      if (interior > 1) return;
      const bass = mod(tun[first] + frets[first]);
      if (!anyBass && bass !== bassPc) return;
      const present = new Set(sounding.map((i) => mod(tun[i] + frets[i])));
      for (const r of required) if (!present.has(r)) return;
      const fretted = sounding.filter((i) => frets[i] > 0);
      let minF = 99, maxF = 0;
      fretted.forEach((i) => { minF = Math.min(minF, frets[i]); maxF = Math.max(maxF, frets[i]); });
      if (fretted.length && maxF - minF > 3) return;
      let barre = null;
      if (fretted.length > 4) {
        const atMin = fretted.filter((i) => frets[i] === minF);
        const from = atMin[0], to = atMin[atMin.length - 1];
        for (let i = from; i <= to; i++) if (frets[i] < minF) return;
        const fingers = 1 + fretted.filter((i) => frets[i] > minF).length;
        if (fingers > 4) return;
        barre = { fret: minF, from, to };
      }
      const opens = sounding.filter((i) => frets[i] === 0).length;
      let score = sounding.length * 2 - interior * 3;
      score -= (fretted.length ? minF : 0) * 0.22;
      if (!fretted.length || minF <= 4) score += opens * 0.5;
      if (bass === rootPc) score += 1;
      if (power && sounding.length > 3) score -= (sounding.length - 3) * 2.5;
      if (last < n - 1) score -= (n - 1 - last) * 1.1;
      score += present.size * 0.4;
      if (barre) score -= 0.6;
      res.push({ frets, score, minF: fretted.length ? minF : 0, barre });
    };
    for (let base = 1; base <= Math.max(1, maxFret - 2); base++) {
      const hi = Math.min(base + 3, maxFret);
      const options = tun.map((open) => {
        const o = [-1];
        if (pcs.has(mod(open))) o.push(0);
        for (let f = base; f <= hi; f++) if (pcs.has(mod(open + f))) o.push(f);
        return o;
      });
      const cur = new Array(n);
      const rec = (i) => {
        if (i === n) { evaluate(cur.slice()); return; }
        for (const f of options[i]) { cur[i] = f; rec(i + 1); }
      };
      rec(0);
    }
    res.sort((a, b) => b.score - a.score);
    const out = [];
    const buckets = {};
    for (const v of res) {
      const b = Math.floor(v.minF / 3);
      buckets[b] = (buckets[b] || 0) + 1;
      if (buckets[b] > 2) continue;
      out.push(v);
      if (out.length >= (opts.limit || 8)) break;
    }
    out.sort((a, b) => a.minF - b.minF || b.score - a.score);
    if (!out.length && !anyBass) return findVoicings(rootPc, suffix, Object.assign({}, opts, { anyBass: true }));
    out.forEach((v) => { v.labels = v.frets.map((f, i) => (f < 0 ? null : pcs.get(mod(tun[i] + f)))); v.midis = v.frets.map((f, i) => (f < 0 ? null : tun[i] + f)).filter((m) => m != null); });
    return out;
  }

  function diagram(v, opts = {}) {
    const tun = tuningNotes();
    const n = tun.length;
    const fretted = v.frets.filter((f) => f > 0);
    const maxF = fretted.length ? Math.max(...fretted) : 0;
    const minF = fretted.length ? Math.min(...fretted) : 0;
    const base = maxF <= 4 ? 1 : minF;
    const rows = 4;
    const W = 112, H = 136, pl = 22, pr = 14, pt = 30, fh = 22;
    const sp = (W - pl - pr) / (n - 1);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="cd-svg" aria-label="Chord diagram">`;
    if (base === 1) s += `<rect x="${pl - 1}" y="${pt - 5}" width="${W - pl - pr + 2}" height="5" rx="1.5" class="cd-nut"/>`;
    else s += `<text x="${pl - 6}" y="${pt + fh / 2 + 4}" class="cd-base" text-anchor="end">${base}</text>`;
    for (let r = 0; r <= rows; r++) s += `<line x1="${pl}" y1="${pt + r * fh}" x2="${W - pr}" y2="${pt + r * fh}" class="cd-fret"/>`;
    for (let i = 0; i < n; i++) s += `<line x1="${pl + i * sp}" y1="${pt}" x2="${pl + i * sp}" y2="${pt + rows * fh}" class="cd-str" stroke-width="${(1 + (n - 1 - i) * 0.25).toFixed(2)}"/>`;
    if (v.barre && v.barre.to > v.barre.from) {
      const y = pt + (v.barre.fret - base + 0.5) * fh;
      s += `<rect x="${pl + v.barre.from * sp - 8}" y="${y - 8}" width="${(v.barre.to - v.barre.from) * sp + 16}" height="16" rx="8" class="cd-barre"/>`;
    }
    v.frets.forEach((f, i) => {
      const x = pl + i * sp;
      if (f < 0) s += `<text x="${x}" y="${pt - 10}" class="cd-x" text-anchor="middle">×</text>`;
      else if (f === 0) s += `<circle cx="${x}" cy="${pt - 14}" r="4.5" class="cd-o${v.labels && v.labels[i] === 'R' ? ' root' : ''}"/>`;
      else {
        const y = pt + (f - base + 0.5) * fh;
        const lab = v.labels ? v.labels[i] : '';
        s += `<circle cx="${x}" cy="${y}" r="8.5" class="cd-dot${lab === 'R' ? ' root' : ''}"/>`;
        if (opts.labels !== false && lab) s += `<text x="${x}" y="${y + 3.4}" class="cd-lab" text-anchor="middle">${T.pretty(lab)}</text>`;
      }
    });
    s += '</svg>';
    return s;
  }

  function silhouette(style, color) {
    const pts = BODIES[style];
    const st = STYLES[style];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs) - 160, maxX = Math.max(...xs) + 10, maxY = Math.max(...ys.map(Math.abs)) + 10;
    const neckEnd = st.overlap + 10;
    return `<svg viewBox="${minX} ${-maxY} ${maxX - minX} ${maxY * 2}" class="sil"><path d="${FK.smoothPath(pts)}" fill="${color}"/><rect x="${minX + 10}" y="-30" width="${neckEnd - minX - 10}" height="60" rx="6" fill="currentColor" opacity=".55"/>${st.family === 'acoustic' ? `<circle cx="${st.overlap + 70}" cy="0" r="58" fill="rgba(0,0,0,.55)"/>` : ''}</svg>`;
  }

  /* ---------------- Public API ---------------- */
  FK.guitar = {
    TUNINGS, STYLES, FINISHES, BOARDS, INLAYS, INLAY_MATS, PICKGUARDS, HARDWARE, HEAD_FACES, DEFAULTS,
    mount(el) {
      host = el;
      host.addEventListener('pointerdown', onPointer);
      render();
    },
    config: () => Object.assign({}, cfg),
    set(partial, opts = {}) {
      const viewOnly = Object.keys(partial).length === 1 && 'view' in partial;
      cfg = Object.assign({}, cfg, partial);
      if (!TUNINGS[cfg.tuning]) cfg.tuning = 'standard';
      FK.store.set('guitar', cfg);
      if (viewOnly) applyView(true);
      else render();
      if (!opts.silent) FK.emit('guitar-config', cfg);
    },
    reset() { cfg = Object.assign({}, DEFAULTS); FK.store.set('guitar', cfg); render(); FK.emit('guitar-config', cfg); },
    tuning: tuningNotes,
    midiAt: (s, f) => tuningNotes()[s] + f,
    setMarkers(list) { markers = list || []; drawMarkers(true); drawLive(); },
    refreshLabels() { drawMarkers(false); },
    setWindow(w) { win = w; drawWindow(); drawMarkers(false); },
    getWindow: () => win,
    flash,
    setLive(list) { liveList = list || []; drawLive(); },
    markedPcs: () => new Set(markers.filter((m) => !m.ghost).map((m) => mod(tuningNotes()[m.s] + m.f))),
    onClick(fn) { clickHandlers.push(fn); },
    positionsOf(pcSet, opts = {}) {
      const tun = tuningNotes();
      const out = [];
      const maxF = opts.maxFret != null ? opts.maxFret : cfg.frets;
      for (let s = 0; s < tun.length; s++) for (let f = 0; f <= maxF; f++) if (pcSet.has(mod(tun[s] + f))) out.push({ s, f, midi: tun[s] + f, pc: mod(tun[s] + f) });
      return out;
    },
    findVoicings, diagram, silhouette, shade,
    defaultTone: () => STYLES[cfg.style].tone,
    finishOf: () => finishOf(cfg),
  };
})();
