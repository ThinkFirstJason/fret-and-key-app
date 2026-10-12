/* Fret & Key — Chord explorer */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const mod = T.mod;
  const $ = FK.$, $$ = FK.$$;
  const I = () => FK.ui.icon;

  const st = Object.assign({ rootPc: 0, suffix: '', v: 0, inv: 0, allTones: false, bassPc: null }, FK.store.get('chord', {}));
  const save = () => FK.store.set('chord', st);
  let el = null;
  let voicings = [];

  const rootName = () => {
    const def = T.chordDef(st.suffix);
    return T.rootNameFor(st.rootPc, T.triadClass(def) === 'min' || T.triadClass(def) === 'dim');
  };

  function init(root) {
    el = root;
    const groups = {};
    T.CHORDS.forEach((c) => (groups[c.group] = groups[c.group] || []).push(c));
    el.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="eyebrow"><span class="num">01</span> Root</div>
          <div class="root-grid" data-role="roots"></div>
          <div class="eyebrow"><span class="num">02</span> Chord type</div>
          <div data-role="types">${Object.entries(groups).map(([g, list]) => `<div class="type-group"><h5>${g}</h5><div class="type-grid">${list.map((c) => `<button data-suffix="${c.s}" title="${c.name}">${c.s === '' ? 'maj' : c.display}</button>`).join('')}</div></div>`).join('')}</div>
          <div class="eyebrow"><span class="num">03</span> Bass note (slash chord)</div>
          <select data-role="bass"><option value="">Root in the bass</option>${T.ROOT_LABELS.map((l, pc) => `<option value="${pc}">/${l}</option>`).join('')}</select>
        </div>
        <div class="stack">
          <div class="card c-teal" data-role="info"></div>
          <div class="card c-sky" data-role="shapes"></div>
          <div class="card c-amber" data-role="keys"></div>
        </div>
      </div>`;
    el.addEventListener('click', onClick);
    $('[data-role=bass]', el).addEventListener('change', (e) => { st.bassPc = e.target.value === '' ? null : +e.target.value; st.v = 0; save(); show(); });
    FK.on('space', () => { if (FK.state.tab === 'chords') strum(); });
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.parentElement.dataset.role === 'roots') { st.rootPc = +b.dataset.pc; st.v = 0; save(); show(); strum(); return; }
    if (b.dataset.suffix != null) { st.suffix = b.dataset.suffix; st.v = 0; st.inv = 0; save(); show(); strum(); return; }
    if (b.dataset.v != null) { st.v = +b.dataset.v; save(); show(); strum(); return; }
    if (b.dataset.inv != null) { st.inv = +b.dataset.inv; save(); show(); strum(); return; }
    if (b.dataset.act === 'strum') return strum();
    if (b.dataset.act === 'arp') return arp();
    if (b.dataset.act === 'all') { st.allTones = !st.allTones; save(); show(); return; }
    if (b.dataset.key) { const [pc, mode] = b.dataset.key.split(':'); FK.panels.circle.open(+pc, mode); return; }
    if (b.dataset.degpc != null) { const m = midis().find((x) => mod(x) === +b.dataset.degpc); if (m) FK.stage.play(m, { pos: guitarPos(m) }); }
  }

  function notes() { return T.chordNotes(rootName(), st.suffix); }

  function pianoVoicing() {
    const def = T.chordDef(st.suffix);
    const semis = def.degs.map((d) => d.semi);
    const base = 52 + mod(st.rootPc - 4);
    let ms = semis.map((s) => base + s);
    const inv = Math.min(st.inv, ms.length - 1);
    for (let i = 0; i < inv; i++) { const x = ms.shift(); ms.push(x + 12); }
    const { hi, lo } = FK.piano.range();
    while (Math.max(...ms) > hi) ms = ms.map((m) => m - 12);
    while (Math.min(...ms) < lo) ms = ms.map((m) => m + 12);
    if (st.bassPc != null && st.bassPc !== st.rootPc) {
      const low = Math.min(...ms);
      let b = low - 12 + mod(st.bassPc - (low - 12));
      if (b >= low) b -= 12;
      if (b >= lo) ms.unshift(b);
    }
    return ms;
  }

  function midis() {
    if (FK.state.mode === 'piano') return pianoVoicing();
    const v = voicings[st.v];
    return v ? v.midis : [];
  }

  function strum() {
    const ms = midis();
    if (!ms.length) return;
    FK.audio.playChord(ms, { inst: FK.state.mode, dur: 2.6 });
    flashAll(ms);
  }
  function arp() {
    const ms = midis().slice().sort((a, b) => a - b);
    const seq = ms.concat(ms.slice(0, -1).reverse());
    const handle = FK.audio.sequence({
      bpm: 300, totalBeats: seq.length + 1,
      events: seq.map((m, i) => ({ beat: i, play: (w) => FK.audio.playMidi(m, { inst: FK.state.mode, when: w, dur: 1.2 }), ui: () => FK.stage.visual(m, guitarPos(m)) })),
      onEnd: () => FK.stopTransport(),
    });
    FK.setTransport(handle);
  }
  function guitarPos(m) {
    if (FK.state.mode !== 'guitar') return null;
    const v = voicings[st.v];
    if (!v) return null;
    const tun = FK.guitar.tuning();
    const s = v.frets.findIndex((f, i) => f >= 0 && tun[i] + f === m);
    return s >= 0 ? { s, f: v.frets[s] } : null;
  }
  function flashAll(ms) {
    const gap = FK.state.mode === 'guitar' ? 28 : 6;
    ms.slice().sort((a, b) => a - b).forEach((m, i) => setTimeout(() => {
      if (FK.state.mode === 'guitar') { const p = guitarPos(m); if (p) FK.guitar.flash(p.s, p.f); } else FK.piano.flash(m);
    }, i * gap));
    FK.emit('note-played', Math.min(...ms));
  }

  function keysContaining() {
    const out = [];
    for (const mode of ['major', 'minor']) {
      for (let k = 0; k < 12; k++) {
        [false, true].forEach((sev) => T.diatonicChords(k, mode, sev).forEach((c) => {
          if (c.rootPc === st.rootPc && c.suffix === st.suffix) out.push({ k, mode, roman: c.roman });
        }));
      }
    }
    return out;
  }

  function show() {
    if (!el) return;
    const def = T.chordDef(st.suffix);
    const rn = rootName();
    const slash = st.bassPc != null && st.bassPc !== st.rootPc;
    const label = T.chordLabel(rn, st.suffix) + (slash ? '/' + T.pretty(T.rootNameFor(st.bassPc, false)) : '');
    const ns = notes();
    voicings = FK.guitar.findVoicings(st.rootPc, st.suffix, { bassPc: st.bassPc, limit: 8 });
    if (st.v >= voicings.length) st.v = 0;

    $('[data-role=roots]', el).innerHTML = FK.ui.rootGrid(st.rootPc, T.triadClass(def) === 'min');
    $$('[data-suffix]', el).forEach((b) => b.classList.toggle('on', b.dataset.suffix === st.suffix));
    $('[data-role=bass]', el).value = st.bassPc == null ? '' : st.bassPc;

    $('[data-role=info]', el).innerHTML = `
      <div class="big-chord">${label}<small>${def.name}</small></div>
      <p class="desc">${def.desc}</p>
      <div class="formula">${ns.map((n) => `<button class="deg ${FK.degCls(n.deg)}" data-degpc="${n.pc}"><b>${T.pretty(n.name)}</b><span>${FK.ivLabel(n.deg)}</span></button>`).join('')}</div>
      <div class="row" style="margin-top:16px">
        <button class="btn primary" data-act="strum">${I().play}<span>${FK.state.mode === 'guitar' ? 'Strum' : 'Play'}</span></button>
        <button class="btn" data-act="arp">Arpeggiate</button>
        <span class="muted" style="font-size:13px">Formula <b style="font-family:var(--font-mono);color:var(--text-2)">${T.pretty(def.f.replace(/(^| )1( |$)/, '$1R$2'))}</b></span>
      </div>`;

    const shapes = $('[data-role=shapes]', el);
    if (FK.state.mode === 'guitar') {
      shapes.innerHTML = `
        <div class="row"><h4 style="margin:0">Guitar shapes</h4><span class="spacer"></span>
          <button class="btn small ${st.allTones ? 'on' : ''}" data-act="all">${st.allTones ? '✓ ' : ''}Every chord tone on the neck</button></div>
        ${voicings.length ? `<div class="voicings">${voicings.map((v, i) => `<button class="voicing ${i === st.v ? 'on' : ''}" data-v="${i}">${FK.guitar.diagram(v)}<div class="vlab">${v.minF <= 1 ? 'Open position' : 'Fret ' + v.minF}${v.barre ? ' · barre' : ''}</div></button>`).join('')}</div>`
          : '<p class="desc">No comfortable shape found in this tuning — try another tuning or a simpler chord.</p>'}
        <p class="muted" style="font-size:12.5px;margin:10px 0 0">Shapes are generated for your tuning (${FK.guitar.TUNINGS[FK.guitar.config().tuning].name}). × = don't play · ○ = open string · tap a shape to hear it.</p>`;
    } else {
      const max = def.degs.length;
      const names = ['Root position', '1st inversion', '2nd inversion', '3rd inversion', '4th inversion', '5th inversion'];
      shapes.innerHTML = `
        <h4>Piano voicing</h4>
        <p class="desc" style="font-size:14px">An inversion puts a different chord tone at the bottom. Same chord, different colour — and much smoother movement between chords.</p>
        <div class="seg" style="margin-top:10px;flex-wrap:wrap">${names.slice(0, max).map((n, i) => `<button data-inv="${i}" class="${i === Math.min(st.inv, max - 1) ? 'on' : ''}">${n}</button>`).join('')}</div>
        <p class="muted" style="font-size:13px;margin:12px 0 0">Keys: ${pianoVoicing().map((m) => `<b>${T.pretty(T.midiName(m, rn.includes('b')))}</b>`).join(' · ')}</p>`;
    }

    const ks = keysContaining();
    $('[data-role=keys]', el).innerHTML = `<h4>Where this chord lives</h4>
      ${ks.length ? `<p class="desc" style="font-size:14px">${T.chordLabel(rn, st.suffix)} occurs naturally in these keys — tap one to explore it on the circle of fifths.</p>
      <div class="keylist" style="margin-top:10px">${ks.map((k) => `<button data-key="${k.k}:${k.mode}"><b>${T.keyName(k.k, k.mode)}</b> · ${k.roman}</button>`).join('')}</div>`
      : `<p class="desc" style="font-size:14px">${T.chordLabel(rn, st.suffix)} doesn't occur naturally in any major or natural-minor key — it's a colour chord, usually borrowed, altered or used in passing.</p>`}`;

    // stage
    const map = FK.stage.pcMap(ns);
    FK.stage.setInfo({ eyebrow: 'Chord', title: `${label} <span class="muted" style="font-weight:600">${def.name}</span>`, sub: ns.map((n) => `<b>${T.pretty(n.name)}</b> (${FK.ivLabel(n.deg)})`).join(' · ') });
    FK.stage.degreeLegend(ns);
    FK.guitar.setWindow(null);
    const v = voicings[st.v];
    const bassMap = (pc) => map.get(pc) || { note: T.pretty(T.rootNameFor(pc, false)), interval: 'B', cls: 'd6' };
    if (st.allTones || !v) {
      const all = FK.stage.guitarFromMap(map);
      if (v) all.forEach((m) => { m.ghost = v.frets[m.s] !== m.f; });
      FK.guitar.setMarkers(all);
    } else {
      const tun = FK.guitar.tuning();
      FK.guitar.setMarkers(v.frets.map((f, s) => (f < 0 ? null : Object.assign({ s, f }, bassMap(mod(tun[s] + f))))).filter(Boolean));
    }
    FK.piano.setMarkers(pianoVoicing().map((m) => Object.assign({ midi: m }, bassMap(mod(m)))));
  }

  FK.panels.chords = {
    init, show,
    current: () => ({ rootPc: st.rootPc, suffix: st.suffix, label: T.chordLabel(rootName(), st.suffix) }),
    open(rootPc, suffix, bassPc = null) {
      const def = T.chordDef(suffix);
      st.rootPc = rootPc; st.suffix = def ? def.s : ''; st.bassPc = bassPc; st.v = 0; st.inv = 0;
      save(); FK.showTab('chords', { scroll: true }); strum();
    },
  };
})();
