/* Fret & Key — Scales panel */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const mod = T.mod;
  const $ = FK.$, $$ = FK.$$;
  const I = () => FK.ui.icon;

  const st = Object.assign({ rootPc: 9, id: 'minPent', win: true, start: 4, size: 5, tempo: 132, dir: 'updown', loop: false, octaves: 2, sevenths: false }, FK.store.get('scale', {}));
  const save = () => FK.store.set('scale', st);
  let el = null;
  let chordView = null; // diatonic chord currently overlaid

  const MODE_OFFSET = { major: 0, dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7, minor: 9, locrian: 11 };

  function notes() { return T.scaleNotes(st.rootPc, st.id); }
  function scale() { return T.SCALE_MAP[st.id]; }

  function init(root) {
    el = root;
    const groups = {};
    T.SCALES.forEach((s) => (groups[s.group] = groups[s.group] || []).push(s));
    el.innerHTML = `
      <div class="grid-2">
        <div class="card">
          <div class="eyebrow"><span class="num">01</span> Root note</div>
          <div class="root-grid" data-role="roots"></div>
          <div class="eyebrow"><span class="num">02</span> Scale</div>
          <select data-role="scale">${Object.entries(groups).map(([g, list]) => `<optgroup label="${g}">${list.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</optgroup>`).join('')}</select>
          <div class="guitar-only">
            <div class="eyebrow"><span class="num">03</span> Position on the neck</div>
            <div class="row" style="margin-bottom:10px">
              <label class="switch"><input type="checkbox" data-role="win"> Focus a position</label>
              <span class="spacer"></span>
              <select data-role="size" style="width:auto" title="Window size">
                ${[4, 5, 6, 7].map((n) => `<option value="${n}">${n} frets</option>`).join('')}
              </select>
            </div>
            <div class="pos-ctl">
              <button class="arrow-btn" data-role="prev" title="Move down the neck (←)">${I().left}</button>
              <div class="pos-label" data-role="poslabel"></div>
              <button class="arrow-btn" data-role="next" title="Move up the neck (→)">${I().right}</button>
            </div>
            <div class="chips" data-role="patterns" style="margin-top:10px"></div>
          </div>
          <div class="piano-only">
            <div class="eyebrow"><span class="num">03</span> Range</div>
            <div class="seg full" data-role="oct"><button data-v="1">1 octave</button><button data-v="2">2 octaves</button></div>
          </div>
          <div class="eyebrow"><span class="num">04</span> Play it</div>
          <div class="seg full" data-role="dir"><button data-v="up">Ascending</button><button data-v="down">Descending</button><button data-v="updown">Up &amp; down</button></div>
          <div class="range-row" style="margin-top:12px"><span class="muted" style="font-size:13px">Speed</span><input type="range" min="50" max="260" step="2" data-role="tempo"><output data-role="tempoOut"></output></div>
          <div class="row" style="margin-top:12px">
            <button class="btn primary" data-role="play">${I().play}<span>Play scale</span></button>
            <label class="switch"><input type="checkbox" data-role="loop"> Loop</label>
          </div>
        </div>
        <div class="stack">
          <div class="card c-teal" data-role="info"></div>
          <div class="card c-violet" data-role="harmony"></div>
        </div>
      </div>`;

    el.addEventListener('click', onClick);
    $('[data-role=scale]', el).addEventListener('change', (e) => { st.id = e.target.value; chordView = null; save(); show(); });
    $('[data-role=size]', el).addEventListener('change', (e) => { st.size = +e.target.value; save(); clampWin(); show(); });
    $('[data-role=win]', el).addEventListener('change', (e) => { st.win = e.target.checked; save(); show(); });
    $('[data-role=loop]', el).addEventListener('change', (e) => { st.loop = e.target.checked; save(); });
    const tempo = $('[data-role=tempo]', el);
    tempo.addEventListener('input', () => { st.tempo = +tempo.value; $('[data-role=tempoOut]', el).textContent = st.tempo + ' bpm'; save(); if (seq && seq.setBpm) seq.setBpm(st.tempo); });

    FK.on('arrow', (d, e) => { if (FK.state.tab !== 'scales' || FK.state.mode !== 'guitar') return; e.preventDefault(); move(d); });
    FK.on('space', () => { if (FK.state.tab === 'scales') togglePlay(); });
  }

  function clampWin() {
    const F = FK.guitar.config().frets;
    st.start = FK.clamp(st.start, 0, Math.max(0, F - st.size + 1));
  }
  function move(d) {
    if (!st.win) { st.win = true; }
    st.start += d;
    clampWin();
    save();
    show();
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    const role = b.dataset.role || b.parentElement.dataset.role;
    if (b.parentElement.dataset.role === 'roots') { st.rootPc = +b.dataset.pc; chordView = null; save(); show(); return; }
    if (role === 'prev') return move(-1);
    if (role === 'next') return move(1);
    if (b.parentElement.dataset.role === 'dir') { st.dir = b.dataset.v; save(); syncControls(); return; }
    if (b.parentElement.dataset.role === 'oct') { st.octaves = +b.dataset.v; save(); syncControls(); return; }
    if (role === 'play') return togglePlay();
    if (b.dataset.pattern != null) { st.win = true; st.start = +b.dataset.pattern; save(); show(); return; }
    if (b.dataset.degpc != null) {
      const pc = +b.dataset.degpc;
      let midi;
      if (FK.state.mode === 'piano') {
        const rootMidi = 60 + st.rootPc > 71 ? 48 + st.rootPc : 60 + st.rootPc;
        midi = rootMidi + mod(pc - st.rootPc);
      } else {
        const tun = FK.guitar.tuning();
        midi = nearestInWindow(pc) || tun[0] + mod(pc - tun[0]);
      }
      FK.stage.play(midi);
      return;
    }
    if (b.dataset.chord != null) {
      const i = +b.dataset.chord;
      chordView = chordView === i ? null : i;
      show();
      if (chordView != null) playDiatonic(i);
      return;
    }
    if (b.dataset.sev != null) { st.sevenths = b.dataset.sev === '1'; save(); chordView = null; show(); return; }
    if (b.dataset.goscale) { const [pc, id] = b.dataset.goscale.split(':'); st.rootPc = +pc; st.id = id; chordView = null; save(); show(); return; }
    if (b.dataset.gochord) { FK.panels.chords.open(+b.dataset.gochord.split(':')[0], b.dataset.gochord.split(':')[1]); }
  }

  function nearestInWindow(pc) {
    const tun = FK.guitar.tuning();
    const a = st.win ? st.start : 0, z = st.win ? st.start + st.size - 1 : 12;
    for (let s = 0; s < tun.length; s++) for (let f = a; f <= z; f++) if (mod(tun[s] + f) === pc) return tun[s] + f;
    return null;
  }

  function diatonic() { return T.diatonicChords(st.rootPc, st.id, st.sevenths, notes()[0].name); }

  function playDiatonic(i) {
    const c = diatonic()[i];
    if (!c) return;
    if (FK.state.mode === 'guitar') {
      const v = FK.guitar.findVoicings(c.rootPc, c.suffix, { limit: 6 })[0];
      if (v) FK.audio.playChord(v.midis, { inst: 'guitar' });
    } else {
      const base = 48 + mod(c.rootPc - 0);
      const def = T.chordDef(c.suffix);
      FK.audio.playChord(def.degs.map((d) => (base < 53 ? base + 12 : base) + d.semi), { inst: 'piano' });
    }
  }

  function patterns() {
    const tun = FK.guitar.tuning();
    const pcs = new Set(notes().map((n) => n.pc));
    const out = [];
    for (let f = 0; f <= 12; f++) if (pcs.has(mod(tun[0] + f))) out.push(f);
    return out.slice(0, 7).map((f, i) => ({ i, start: Math.max(0, f === 0 ? 0 : f - 1), from: f }));
  }

  function syncControls() {
    const sc = scale();
    $('[data-role=roots]', el).innerHTML = FK.ui.rootGrid(st.rootPc, sc.minorish);
    $('[data-role=scale]', el).value = st.id;
    $('[data-role=size]', el).value = st.size;
    $('[data-role=win]', el).checked = st.win;
    $('[data-role=loop]', el).checked = st.loop;
    $('[data-role=tempo]', el).value = st.tempo;
    $('[data-role=tempoOut]', el).textContent = st.tempo + ' bpm';
    $$('[data-role=dir] button', el).forEach((b) => b.classList.toggle('on', b.dataset.v === st.dir));
    $$('[data-role=oct] button', el).forEach((b) => b.classList.toggle('on', +b.dataset.v === st.octaves));
    const end = Math.min(FK.guitar.config().frets, st.start + st.size - 1);
    $('[data-role=poslabel]', el).textContent = st.win ? `Frets ${st.start}–${end}` : 'Whole neck';
    $('[data-role=patterns]', el).innerHTML = patterns().map((p) => `<button class="tag" data-pattern="${p.start}" style="cursor:pointer;${st.win && st.start === p.start ? 'border-color:var(--amber);color:var(--amber)' : ''}">Pattern ${p.i + 1} · fret ${p.from}</button>`).join('');
    const playing = FK.isPlaying() && seq;
    $('[data-role=play]', el).innerHTML = playing ? `${I().stop}<span>Stop</span>` : `${I().play}<span>Play scale</span>`;
  }

  function renderInfo() {
    const sc = scale();
    const ns = notes();
    const rootName = T.pretty(ns[0].name);
    const steps = T.stepPattern(st.id);
    let rel = '';
    if (st.id === 'major') {
      const r = mod(st.rootPc + 9);
      rel = `<button class="btn small" data-goscale="${r}:minor">Relative minor: ${T.pretty(T.rootNameFor(r, true))} minor</button> <button class="btn small" data-goscale="${st.rootPc}:majPent">${rootName} major pentatonic</button>`;
    } else if (st.id === 'minor') {
      const r = mod(st.rootPc + 3);
      rel = `<button class="btn small" data-goscale="${r}:major">Relative major: ${T.pretty(T.rootNameFor(r, false))} major</button> <button class="btn small" data-goscale="${st.rootPc}:minPent">${rootName} minor pentatonic</button>`;
    } else if (st.id === 'minPent' || st.id === 'blues') {
      const r = mod(st.rootPc + 3);
      rel = `<button class="btn small" data-goscale="${r}:majPent">Same notes: ${T.pretty(T.rootNameFor(r, false))} major pentatonic</button> <button class="btn small" data-goscale="${st.rootPc}:${st.id === 'blues' ? 'minPent' : 'blues'}">${st.id === 'blues' ? 'Drop the blue note' : 'Add the blue note'}</button>`;
    } else if (st.id === 'majPent') {
      const r = mod(st.rootPc + 9);
      rel = `<button class="btn small" data-goscale="${r}:minPent">Same notes: ${T.pretty(T.rootNameFor(r, true))} minor pentatonic</button>`;
    }
    if (MODE_OFFSET[st.id] != null && st.id !== 'major') {
      const parent = mod(st.rootPc - MODE_OFFSET[st.id]);
      rel += ` <button class="btn small" data-goscale="${parent}:major">Parent scale: ${T.pretty(T.rootNameFor(parent, false))} major</button>`;
    }
    $('[data-role=info]', el).innerHTML = `
      <div class="info-head"><div><h3>${rootName} ${sc.name}</h3><div class="mood" style="margin-top:6px">${sc.mood}</div></div></div>
      <p class="desc">${sc.desc}</p>
      <div class="eyebrow">Notes &amp; intervals <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">— tap to hear</span></div>
      <div class="formula">${ns.map((n) => `<button class="deg ${FK.degCls(n.deg)}" data-degpc="${n.pc}"><b>${T.pretty(n.name)}</b><span>${FK.ivLabel(n.deg)}</span></button>`).join('')}</div>
      <div class="steps">${steps.map((s) => `<span class="${s === 'H' ? 'H' : s.length > 1 ? 'big' : ''}">${s}</span>`).join('')}</div>
      ${rel ? `<div class="eyebrow">Related</div><div class="row">${rel}</div>` : ''}`;
  }

  function renderHarmony() {
    const box = $('[data-role=harmony]', el);
    const dia = diatonic();
    const ns = notes();
    if (!dia.length) {
      const rootName = T.pretty(ns[0].name);
      const fits = scale().minorish ? ['m7', 'm', '7#9'] : ['', '6', 'maj7', '7'];
      box.innerHTML = `<h4>Chords that fit</h4><p class="desc">${scale().name} isn't a 7-note scale, so it has no full set of diatonic chords. Try soloing with it over:</p>
        <div class="chips" style="margin-top:10px">${fits.filter((s) => T.chordDef(s)).map((s) => `<button class="chip" data-gochord="${st.rootPc}:${s}"><span class="rn">${s.includes('7') ? 'I7' : 'I'}</span><span class="cn">${rootName}${T.chordDef(s).display}</span></button>`).join('')}</div>`;
      return;
    }
    box.innerHTML = `
      <div class="row"><h4 style="margin:0">Chords built from this scale</h4><span class="spacer"></span>
        <div class="seg"><button data-sev="0" class="${!st.sevenths ? 'on' : ''}">Triads</button><button data-sev="1" class="${st.sevenths ? 'on' : ''}">7th chords</button></div></div>
      <p class="desc" style="font-size:14px">Stack every other note of the scale to build a chord on each degree. Tap one to hear it and see its tones inside the scale.</p>
      <div class="chips" style="margin-top:10px">${dia.map((c, i) => `<button class="chip ${chordView === i ? 'on' : ''}" data-chord="${i}"><span class="rn">${c.roman}</span><span class="cn">${c.label}</span></button>`).join('')}</div>
      ${chordView != null ? `<div class="row" style="margin-top:12px"><button class="btn small" data-gochord="${dia[chordView].rootPc}:${dia[chordView].suffix}">Open ${dia[chordView].label} in the chord explorer →</button></div>` : ''}`;
  }

  function show() {
    if (!el) return;
    clampWin();
    syncControls();
    renderInfo();
    renderHarmony();
    const sc = scale();
    const ns = notes();
    const title = `${T.pretty(ns[0].name)} ${sc.name}`;
    let map = FK.stage.pcMap(ns);
    if (chordView != null) {
      const c = diatonic()[chordView];
      const cn = T.chordNotes(c.root, c.suffix);
      const cm = FK.stage.pcMap(cn);
      ns.forEach((n) => { if (!cm.has(n.pc)) cm.set(n.pc, Object.assign({}, map.get(n.pc), { ghost: true })); });
      map = cm;
      FK.stage.setInfo({ eyebrow: 'Scale · chord tones', title: `${c.label} <span class="muted" style="font-weight:600">inside ${title}</span>`, sub: cn.map((n) => `<b>${T.pretty(n.name)}</b> (${FK.ivLabel(n.deg)})`).join(' · ') });
      FK.stage.degreeLegend(cn);
    } else {
      FK.stage.setInfo({ eyebrow: 'Scale', title, sub: ns.map((n) => `<b>${T.pretty(n.name)}</b>`).join(' · ') + ` &nbsp;·&nbsp; ${T.stepPattern(st.id).join('–')}` });
      FK.stage.degreeLegend(ns);
    }
    FK.guitar.setWindow(st.win ? { start: st.start, size: st.size } : null);
    FK.guitar.setMarkers(FK.stage.guitarFromMap(map));
    FK.piano.setMarkers(FK.stage.pianoFromMap(map));
  }

  /* ---------------- playback ---------------- */
  let seq = null;

  function buildSequence() {
    const ns = notes();
    const pcs = new Set(ns.map((n) => n.pc));
    let list = [];
    if (FK.state.mode === 'guitar') {
      const tun = FK.guitar.tuning();
      const F = FK.guitar.config().frets;
      if (st.win) {
        const pos = [];
        for (let s = 0; s < tun.length; s++) for (let f = st.start; f <= Math.min(F, st.start + st.size - 1); f++) if (pcs.has(mod(tun[s] + f))) pos.push({ s, f, midi: tun[s] + f });
        pos.sort((a, b) => a.midi - b.midi || a.s - b.s);
        const seen = new Set();
        list = pos.filter((p) => (seen.has(p.midi) ? false : seen.add(p.midi)));
      } else {
        let start = tun[0] + mod(st.rootPc - tun[0]);
        const semis = ns.map((n) => n.semi);
        const targets = [];
        for (let o = 0; o < 2; o++) semis.forEach((s) => targets.push(start + o * 12 + s));
        targets.push(start + 24);
        let prev = { s: 0, f: mod(st.rootPc - tun[0]) };
        list = targets.map((m) => {
          const p = FK.stage.bestPos(m, prev);
          if (p) prev = p;
          return p ? { s: p.s, f: p.f, midi: m } : null;
        }).filter(Boolean);
      }
    } else {
      const { lo, hi } = FK.piano.range();
      let start = 60 + mod(st.rootPc - 0);
      if (start + st.octaves * 12 > hi) start -= 12;
      if (start < lo) start += 12;
      for (let o = 0; o < st.octaves; o++) ns.forEach((n) => list.push({ midi: start + o * 12 + n.semi }));
      list.push({ midi: start + st.octaves * 12 });
    }
    if (st.dir === 'down') list.reverse();
    else if (st.dir === 'updown') list = list.concat(list.slice(0, -1).reverse());
    return list;
  }

  function setPlayingDeg(midi) {
    $$('.deg', el).forEach((d) => d.classList.toggle('playing', midi != null && +d.dataset.degpc === mod(midi)));
  }

  function togglePlay() {
    if (FK.isPlaying() && seq) { FK.stopTransport(); return; }
    chordView = null;
    show();
    const list = buildSequence();
    if (!list.length) { FK.toast('No scale notes inside this window — move it along the neck.'); return; }
    const inst = FK.state.mode;
    const events = list.map((n, i) => ({
      beat: i,
      play: (when, spb) => FK.audio.playMidi(n.midi, { inst, when, dur: inst === 'guitar' ? spb * 2.2 : spb * 0.95, vel: i === 0 || mod(n.midi) === st.rootPc ? 0.95 : 0.8 }),
      ui: () => { FK.stage.visual(n.midi, n.s != null ? { s: n.s, f: n.f } : null, inst); setPlayingDeg(n.midi); },
    }));
    seq = FK.audio.sequence({
      bpm: st.tempo, events, totalBeats: list.length + (st.loop ? 1 : 0.5), loop: st.loop,
      onEnd: () => { if (seq) FK.stopTransport(); },
    });
    FK.setTransport(seq, () => { seq = null; setPlayingDeg(null); syncControls(); });
    syncControls();
  }

  FK.panels.scales = {
    init, show,
    open(rootPc, id) { st.rootPc = rootPc; st.id = id; chordView = null; save(); FK.showTab('scales'); },
  };
})();
