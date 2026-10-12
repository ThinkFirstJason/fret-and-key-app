/* Fret & Key — app core: state, stage (shared instrument view), tabs, input */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const mod = T.mod;
  const $ = FK.$, $$ = FK.$$;

  const S = (FK.state = Object.assign({ mode: 'guitar', tab: 'scales', labels: 'note', theme: 'dark' }, FK.store.get('ui', {})));
  FK.saveState = () => FK.store.set('ui', { mode: S.mode, tab: S.tab, labels: S.labels, theme: S.theme });
  FK.panels = {};

  FK.markerLabel = (m) => (S.labels === 'note' ? m.note : S.labels === 'interval' ? m.interval : '');

  /* Degree label ("R", "b3", "#11") -> colour class d1..d7 */
  FK.degCls = (label) => {
    if (!label || label === 'R' || label === '1') return 'd1';
    const n = parseInt(String(label).replace(/[^0-9]/g, ''), 10);
    if (!n) return 'd1';
    return 'd' + (((n - 1) % 7) + 1);
  };
  FK.ivLabel = (deg) => T.pretty(deg === '1' ? 'R' : deg);

  /* ---------------- Stage ---------------- */
  const pill = () => $('#nowPill');
  let pillTimer;
  const stage = (FK.stage = {
    setInfo({ eyebrow, title, sub, hint }) {
      if (eyebrow != null) $('#stageEyebrow').textContent = eyebrow;
      if (title != null) $('#stageTitle').innerHTML = title;
      if (sub != null) $('#stageSub').innerHTML = sub;
      if (hint != null) $('#stageHint').textContent = hint;
    },
    setLegend(items) {
      $('#legend').innerHTML = (items || []).map((it) => `<span><i style="background:var(--${it.cls})"></i>${it.label}</span>`).join('');
    },
    degreeLegend(notes) {
      const seen = new Set();
      stage.setLegend(notes.filter((n) => { const c = FK.degCls(n.deg); if (seen.has(c)) return false; seen.add(c); return true; })
        .map((n) => ({ cls: FK.degCls(n.deg), label: `${FK.ivLabel(n.deg)} · ${T.pretty(n.name)}` })));
    },
    /* notes: [{pc, name, deg}] -> markers on both instruments */
    pcMap(notes, extra = {}) {
      const map = new Map();
      notes.forEach((n) => {
        if (map.has(n.pc)) return;
        map.set(n.pc, Object.assign({ note: T.pretty(n.name), interval: FK.ivLabel(n.deg), cls: FK.degCls(n.deg), root: n.deg === '1' || n.deg === 'R' }, extra));
      });
      return map;
    },
    guitarFromMap(map, opts = {}) {
      return FK.guitar.positionsOf(new Set(map.keys()), opts).map((p) => Object.assign({ s: p.s, f: p.f, midi: p.midi }, map.get(p.pc)));
    },
    pianoFromMap(map) {
      const { lo, hi } = FK.piano.range();
      const out = [];
      for (let m = lo; m <= hi; m++) if (map.has(mod(m))) out.push(Object.assign({ midi: m }, map.get(mod(m))));
      return out;
    },
    showNotes(notes, opts = {}) {
      const map = stage.pcMap(notes);
      FK.guitar.setWindow(opts.window || null);
      FK.guitar.setMarkers(stage.guitarFromMap(map));
      FK.piano.setMarkers(stage.pianoFromMap(map));
    },
    clear() { FK.guitar.setWindow(null); FK.guitar.setMarkers([]); FK.piano.setMarkers([]); },
    refreshLabels() { FK.guitar.refreshLabels(); FK.piano.refreshLabels(); },

    /* play a midi note on the current instrument, flashing the matching position */
    play(midi, opts = {}) {
      const inst = opts.inst || S.mode;
      FK.audio.playMidi(midi, { inst, when: opts.when, dur: opts.dur, vel: opts.vel });
      if (opts.visual === false) return;
      const vis = () => stage.visual(midi, opts.pos, inst);
      if (opts.when) setTimeout(vis, Math.max(0, (opts.when - FK.audio.now()) * 1000)); else vis();
    },
    visual(midi, pos, inst = S.mode) {
      if (inst === 'guitar') {
        const p = pos || stage.bestPos(midi);
        if (p) FK.guitar.flash(p.s, p.f);
      } else FK.piano.flash(midi);
      stage.pill(midi);
      FK.emit('note-played', midi);
    },
    bestPos(midi, near) {
      const tun = FK.guitar.tuning();
      const F = FK.guitar.config().frets;
      let best = null, bs = 1e9;
      tun.forEach((o, s) => {
        const f = midi - o;
        if (f < 0 || f > F) return;
        const score = near ? Math.abs(f - near.f) + Math.abs(s - near.s) * 0.4 : f + (s === tun.length - 1 ? 0 : 0.1);
        if (score < bs) { bs = score; best = { s, f }; }
      });
      return best;
    },
    pill(midi) {
      const p = pill();
      p.textContent = T.pretty(T.midiName(midi, false)) + (mod(midi) === 1 || mod(midi) === 3 || mod(midi) === 6 || mod(midi) === 8 || mod(midi) === 10 ? ' / ' + T.pretty(T.midiName(midi, true)) : '');
      p.classList.add('show');
      clearTimeout(pillTimer);
      pillTimer = setTimeout(() => p.classList.remove('show'), 1300);
    },
  });

  /* ---------------- Transport: one thing plays at a time ---------------- */
  let transport = null;
  FK.setTransport = (handle, onStop) => {
    FK.stopTransport();
    transport = { handle, onStop };
    syncAwake();
  };
  FK.stopTransport = () => {
    if (!transport) return;
    const t = transport;
    transport = null;
    try { t.handle && t.handle.stop && t.handle.stop(); } catch (e) { /* ignore */ }
    if (t.onStop) t.onStop();
    syncAwake();
  };

  /* keep the laptop awake while something plays, and for a while after the last note from your instrument */
  let lastInput = 0, awakeSent = null;
  const INPUT_AWAKE_MS = 5 * 60 * 1000;
  function syncAwake() {
    const on = !!transport || Date.now() - lastInput < INPUT_AWAKE_MS;
    const api = window.pywebview && window.pywebview.api;
    if (on === awakeSent || !api || !api.keep_awake) return;
    awakeSent = on;
    api.keep_awake(on).catch(() => { awakeSent = null; });
  }
  FK.on('input-note', (e) => { if (e.on) { lastInput = Date.now(); if (awakeSent !== true) syncAwake(); } });
  setInterval(syncAwake, 30000);
  window.addEventListener('pywebviewready', syncAwake);
  FK.isPlaying = () => !!transport;

  /* ---------------- Tabs & mode ---------------- */
  function showTab(tab, opts = {}) {
    if (!FK.panels[tab]) tab = 'scales';
    if (S.tab !== tab) FK.stopTransport();
    S.tab = tab;
    FK.saveState();
    $$('#tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === tab));
    const panel = FK.panels[tab];
    if (!panel._inited) { panel.init($('#panel-' + tab)); panel._inited = true; }
    panel.show();
    if (opts.scroll) $('#tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    FK.emit('tab', tab);
  }
  FK.showTab = showTab;

  function setMode(mode) {
    S.mode = mode;
    FK.saveState();
    document.body.classList.toggle('mode-guitar', mode === 'guitar');
    document.body.classList.toggle('mode-piano', mode === 'piano');
    $$('.mode-switch button').forEach((b) => b.setAttribute('aria-selected', b.dataset.mode === mode ? 'true' : 'false'));
    $('#stageHint').textContent = mode === 'guitar' ? 'Tap any fret to hear it' : 'Tap a key — or play with your computer keyboard (A–K)';
    FK.emit('mode', mode);
    const panel = FK.panels[S.tab];
    if (panel && panel._inited) (panel.onMode || panel.show).call(panel, mode);
  }
  FK.setMode = setMode;

  function setTheme(theme) {
    S.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    FK.saveState();
  }

  function zoomLabel() {
    const z = FK.guitar.config().view === 'zoom';
    $('#zoomBtn').innerHTML = z
      ? '<svg viewBox="0 0 24 24"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg><span>Full guitar</span>'
      : '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6M11 8v6"/></svg><span>Close-up</span>';
  }

  /* ---------------- Hero staff: shows the notes you play ---------------- */
  const heroNotes = [];
  function drawHeroStaff() {
    const g = $('.hero-notes');
    if (!g) return;
    const stepY = (midi) => {
      const name = T.SHARP_NAMES[mod(midi)];
      const letter = T.LETTERS.indexOf(name[0]);
      const oct = Math.floor(midi / 12) - 1;
      const dia = oct * 7 + letter;
      const e4 = 4 * 7 + 2;
      return 115 - (dia - e4) * 10;
    };
    const colors = ['var(--d1)', 'var(--d3)', 'var(--d5)', 'var(--d7)', 'var(--d6)', 'var(--d2)'];
    g.innerHTML = heroNotes.map((m, i) => {
      let y = stepY(m);
      while (y < 0) y += 70;
      while (y > 150) y -= 70;
      const x = 120 + i * 34;
      const sharp = T.SHARP_NAMES[mod(m)].length > 1;
      const up = y > 75;
      const col = colors[i % colors.length];
      let ledger = '';
      if (y >= 135) for (let ly = 135; ly <= y; ly += 20) ledger += `<line x1="${x - 14}" y1="${ly}" x2="${x + 14}" y2="${ly}" stroke="var(--line-2)"/>`;
      if (y <= 15) for (let ly = 15; ly >= y; ly -= 20) ledger += `<line x1="${x - 14}" y1="${ly}" x2="${x + 14}" y2="${ly}" stroke="var(--line-2)"/>`;
      return `<g class="hn" style="animation-delay:${i * 0.25}s">${ledger}${sharp ? `<text x="${x - 20}" y="${y + 6}" style="font-family:var(--font-music);font-size:20px;fill:${col}">♯</text>` : ''}<ellipse cx="${x}" cy="${y}" rx="9.5" ry="7" transform="rotate(-20 ${x} ${y})" fill="${col}"/><line x1="${up ? x + 8.5 : x - 8.5}" y1="${y}" x2="${up ? x + 8.5 : x - 8.5}" y2="${up ? y - 46 : y + 46}" stroke="${col}"/></g>`;
    }).join('');
  }
  function pushHeroNote(m) {
    heroNotes.push(m);
    while (heroNotes.length > 11) heroNotes.shift();
    drawHeroStaff();
  }

  /* ---------------- Computer keyboard ---------------- */
  const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16, "'": 17 };
  let kbOct = 60;
  const held = new Set();

  function onKey(e) {
    if (FK.isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.key === ' ') { e.preventDefault(); FK.emit('space'); return; }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { FK.emit('arrow', e.key === 'ArrowLeft' ? -1 : 1, e); return; }
    if (S.mode !== 'piano') return;
    if (k === 'z') { kbOct = Math.max(24, kbOct - 12); FK.toast('Keyboard octave: C' + (kbOct / 12 - 1)); return; }
    if (k === 'x') { kbOct = Math.min(96, kbOct + 12); FK.toast('Keyboard octave: C' + (kbOct / 12 - 1)); return; }
    if (k in KEYMAP && !held.has(k)) {
      held.add(k);
      const midi = kbOct + KEYMAP[k];
      stage.play(midi, { inst: 'piano' });
      FK.emit('inst-click', { midi, inst: 'piano' });
    }
  }

  /* ---------------- volume: master slider + mixer ---------------- */
  const CHANNELS = [
    ['master', 'Master', 'Everything Fret & Key plays', 1],
    ['inst', 'Instruments', 'Guitar & keys sounds, MIDI playback, backing chords', 1],
    ['click', 'Metronome', 'Clicks and count-ins', 1],
    ['tracks', 'Your recordings', 'All uploaded tracks (each song also has its own slider)', 2],
  ];
  function initMixer() {
    const vol = $('#volume'), mixer = $('#mixer'), btn = $('#mixerBtn'), mute = $('#muteBtn');
    let unmuteTo = FK.audio.getLevel('master') || 0.9;
    const pct = (v) => Math.round(v * 100) + '%';
    const sync = () => {
      const m = FK.audio.getLevel('master');
      vol.value = m;
      mute.classList.toggle('muted', m === 0);
      CHANNELS.forEach(([k]) => {
        const r = mixer.querySelector(`[data-mix="${k}"]`);
        if (r && document.activeElement !== r) r.value = FK.audio.getLevel(k);
        const o = mixer.querySelector(`[data-mixout="${k}"]`);
        if (o) o.textContent = pct(FK.audio.getLevel(k));
      });
    };
    mixer.innerHTML = `<div class="row"><b>Mixer</b><span class="spacer"></span><button class="btn small ghost" data-mixreset>Reset</button></div>` +
      CHANNELS.map(([k, label, hint, max]) => `<label class="mix-row"><span><b>${label}</b><small>${hint}</small></span>
        <input type="range" min="0" max="${max}" step="0.01" data-mix="${k}"><output data-mixout="${k}"></output></label>`).join('') +
      `<p class="muted" style="font-size:11.5px;margin:6px 0 0">The Spotify player has its own volume inside it.</p>`;
    vol.addEventListener('input', () => { FK.audio.setLevel('master', +vol.value); if (+vol.value > 0) unmuteTo = +vol.value; sync(); });
    mute.addEventListener('click', (e) => {
      e.preventDefault();
      const m = FK.audio.getLevel('master');
      if (m > 0) { unmuteTo = m; FK.audio.setLevel('master', 0); } else FK.audio.setLevel('master', unmuteTo || 0.9);
      sync();
    });
    mixer.addEventListener('input', (e) => {
      const k = e.target.dataset.mix;
      if (k) { FK.audio.setLevel(k, +e.target.value); if (k === 'master' && +e.target.value > 0) unmuteTo = +e.target.value; sync(); }
    });
    mixer.addEventListener('click', (e) => {
      if (e.target.closest('[data-mixreset]')) { [['master', 0.9], ['inst', 0.8], ['click', 0.7], ['tracks', 1]].forEach(([k, v]) => FK.audio.setLevel(k, v)); sync(); }
    });
    btn.addEventListener('click', () => { mixer.hidden = !mixer.hidden; btn.classList.toggle('on', !mixer.hidden); sync(); });
    document.addEventListener('pointerdown', (e) => { if (!mixer.hidden && !e.target.closest('.mixer-wrap')) { mixer.hidden = true; btn.classList.remove('on'); } });
    sync();
  }

  /* ---------------- init ---------------- */
  FK.initApp = function () {
    setTheme(S.theme || 'dark');
    FK.guitar.mount($('#guitarHost'));
    FK.piano.mount($('#pianoHost'));

    const handleClick = (ev) => {
      stage.play(ev.midi, { inst: ev.inst, pos: ev.s != null ? { s: ev.s, f: ev.f } : null });
      FK.emit('inst-click', ev);
    };
    FK.guitar.onClick(handleClick);
    FK.piano.onClick(handleClick);
    FK.on('note-played', pushHeroNote);

    $$('.mode-switch button').forEach((b) => b.addEventListener('click', () => { FK.audio.init(); setMode(b.dataset.mode); }));
    $$('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    $('#themeBtn').addEventListener('click', () => setTheme(S.theme === 'dark' ? 'light' : 'dark'));
    initMixer();

    const seg = $('#labelSeg');
    const syncSeg = () => $$('button', seg).forEach((b) => b.classList.toggle('on', b.dataset.label === S.labels));
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      S.labels = b.dataset.label;
      FK.saveState();
      syncSeg();
      stage.refreshLabels();
    });
    syncSeg();

    zoomLabel();
    $('#zoomBtn').addEventListener('click', () => {
      FK.guitar.set({ view: FK.guitar.config().view === 'zoom' ? 'full' : 'zoom' });
      zoomLabel();
    });
    $('#flipBtn').addEventListener('click', () => {
      FK.guitar.set({ flip: !FK.guitar.config().flip });
      FK.toast(FK.guitar.config().flip ? 'Low string on top (tab view)' : 'Low string on the bottom (player view)');
    });
    $('#customizeBtn').addEventListener('click', () => showTab('customize', { scroll: true }));
    FK.on('guitar-config', () => { zoomLabel(); const p = FK.panels[S.tab]; if (p && p._inited && p.onInstrumentChange) p.onInstrumentChange(); else if (p && p._inited) p.show(); });
    FK.on('piano-config', () => { const p = FK.panels[S.tab]; if (p && p._inited) (p.onInstrumentChange || p.show).call(p); });

    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
    document.addEventListener('pointerdown', () => FK.audio.init(), { once: true });

    // background circle ticks
    const ticks = $('.deco-ticks');
    if (ticks) {
      let html = '';
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const r1 = 190, r2 = i % 5 === 0 ? 172 : 182;
        html += `<line x1="${200 + Math.cos(a) * r1}" y1="${200 + Math.sin(a) * r1}" x2="${200 + Math.cos(a) * r2}" y2="${200 + Math.sin(a) * r2}"/>`;
      }
      ticks.innerHTML = html;
    }
    [60, 64, 67, 72, 71, 67, 74, 72].forEach((m) => heroNotes.push(m));
    drawHeroStaff();

    setMode(S.mode);
    showTab(S.tab);
    if (FK.initInput) FK.initInput();
  };

  /* ---------------- Voicing with voice-leading (progressions, songs) ---------------- */
  FK.voice = {
    guitar(rootPc, suffix, bassPc, prev) {
      const vs = FK.guitar.findVoicings(rootPc, suffix, { bassPc, limit: 8 });
      if (!vs.length) return null;
      if (!prev || prev.minF == null) return vs.slice().sort((a, b) => b.score - a.score)[0];
      let best = vs[0], bs = 1e9;
      vs.forEach((v) => {
        const sc = Math.abs(v.minF - prev.minF) * 1.2 - v.score * 0.35;
        if (sc < bs) { bs = sc; best = v; }
      });
      return best;
    },
    piano(rootPc, suffix, bassPc, prev) {
      const def = T.chordDef(suffix) || T.chordDef('');
      const pcs = [...new Set(def.degs.map((d) => mod(rootPc + d.semi)))];
      const cands = [];
      for (let k = 0; k < pcs.length; k++) {
        const order = pcs.slice(k).concat(pcs.slice(0, k));
        for (let start = 52; start <= 64; start++) {
          if (mod(start) !== order[0]) continue;
          const ms = [start];
          for (let i = 1; i < order.length; i++) {
            let m = ms[i - 1] + 1;
            while (mod(m) !== order[i]) m++;
            ms.push(m);
          }
          cands.push(ms);
        }
      }
      let best = cands[0];
      if (prev && prev.rh) {
        let bs = 1e9;
        cands.forEach((c) => {
          const a = c.slice().sort((x, y) => x - y), b = prev.rh.slice().sort((x, y) => x - y);
          let d = 0;
          for (let i = 0; i < Math.max(a.length, b.length); i++) d += Math.abs((a[Math.min(i, a.length - 1)]) - (b[Math.min(i, b.length - 1)]));
          d += Math.abs(a[0] - 58) * 0.15;
          if (d < bs) { bs = d; best = c; }
        });
      } else {
        best = cands.find((c) => mod(c[0]) === rootPc) || cands[0];
      }
      const bass = 36 + mod((bassPc != null ? bassPc : rootPc) - 0);
      return { rh: best, bass: bass > 47 ? bass - 12 : bass, midis: [bass > 47 ? bass - 12 : bass].concat(best) };
    },
    /* resolve a voicing for the current instrument */
    get(chord, prev) {
      return FK.state.mode === 'guitar'
        ? FK.voice.guitar(chord.rootPc, chord.suffix, chord.bassPc, prev)
        : FK.voice.piano(chord.rootPc, chord.suffix, chord.bassPc, prev);
    },
    /* draw a chord voicing on the stage, optionally over ghosted scale tones */
    show(chord, v, ghostNotes) {
      const cn = T.chordNotes(chord.root || T.rootNameFor(chord.rootPc, false), chord.suffix);
      const map = stage.pcMap(cn);
      const bassInfo = (pc) => map.get(pc) || { note: T.pretty(T.rootNameFor(pc, false)), interval: 'B', cls: 'd6' };
      const gmap = ghostNotes ? stage.pcMap(ghostNotes, { ghost: true }) : null;
      FK.guitar.setWindow(null);
      if (FK.state.mode === 'guitar') {
        const tun = FK.guitar.tuning();
        let list = [];
        if (gmap) list = stage.guitarFromMap(gmap);
        if (v) {
          const chordPos = v.frets.map((f, s) => (f < 0 ? null : Object.assign({ s, f }, bassInfo(mod(tun[s] + f))))).filter(Boolean);
          const keys = new Set(chordPos.map((p) => p.s + ':' + p.f));
          list = list.filter((p) => !keys.has(p.s + ':' + p.f)).concat(chordPos);
        }
        FK.guitar.setMarkers(list);
      } else {
        let list = gmap ? stage.pianoFromMap(gmap) : [];
        if (v) {
          const set = new Set(v.midis);
          list = list.filter((p) => !set.has(p.midi)).concat(v.midis.map((m) => Object.assign({ midi: m }, bassInfo(mod(m)))));
        }
        FK.piano.setMarkers(list);
      }
    },
    play(v, opts = {}) {
      if (!v) return;
      FK.audio.playChord(v.midis, Object.assign({ inst: FK.state.mode, dur: opts.dur || 2.4 }, opts));
      if (opts.flash !== false) {
        const delay = opts.when ? Math.max(0, (opts.when - FK.audio.now()) * 1000) : 0;
        setTimeout(() => {
          if (FK.state.mode === 'guitar' && v.frets) v.frets.forEach((f, s) => { if (f >= 0) FK.guitar.flash(s, f); });
          else v.midis.forEach((m) => FK.piano.flash(m));
          FK.emit('note-played', Math.min(...v.midis));
        }, delay);
      }
    },
  };

  /* ---------------- Shared UI helpers ---------------- */
  FK.ui = {
    rootGrid(selectedPc, minorish) {
      return T.ROOT_LABELS.map((lab, pc) => {
        const name = T.pretty(T.rootNameFor(pc, minorish));
        return `<button data-pc="${pc}" class="${pc === selectedPc ? 'on' : ''}" title="${lab}">${name}</button>`;
      }).join('');
    },
    icon: {
      play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
      stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
      pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.5" height="14" rx="1.5"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.5"/></svg>',
      left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
      right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
      shuffle: '<svg viewBox="0 0 24 24"><path d="M3 7h3c5 0 7 10 12 10h3M3 17h3c2 0 3.4-1.5 4.6-3.4M14 7.4C15 7 16.4 7 18 7h3M18 4l3 3-3 3M18 14l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    },
    staff(accidentals) {
      // treble-clef key signature
      const SHARP_POS = { F: 'F5', C: 'C5', G: 'G5', D: 'D5', A: 'A4', E: 'E5', B: 'B4' };
      const FLAT_POS = { B: 'B4', E: 'E5', A: 'A4', D: 'D5', G: 'G4', C: 'C5', F: 'F4' };
      const yOf = (n) => { const dia = (+n[1]) * 7 + T.LETTERS.indexOf(n[0]); return 90 - (dia - (4 * 7 + 2)) * 7; };
      let s = '<svg viewBox="0 0 260 120" class="staff-svg" aria-label="Key signature">';
      for (let i = 0; i < 5; i++) s += `<line x1="4" y1="${34 + i * 14}" x2="256" y2="${34 + i * 14}"/>`;
      s += '<text x="8" y="96" class="clef">𝄞</text>';
      accidentals.forEach((a, i) => {
        const sharp = a.endsWith('#');
        const pos = (sharp ? SHARP_POS : FLAT_POS)[a[0]];
        s += `<text x="${78 + i * 18}" y="${yOf(pos) - (sharp ? 0 : 5)}" class="acc">${sharp ? '♯' : '♭'}</text>`;
      });
      return s + '</svg>';
    },
  };
})();
