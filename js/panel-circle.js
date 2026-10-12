/* Fret & Key — Circle of fifths */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const mod = T.mod;
  const $ = FK.$, $$ = FK.$$;
  const I = () => FK.ui.icon;

  const st = Object.assign({ pc: 0, mode: 'major', sevenths: false, tempo: 96 }, FK.store.get('circle', {}));
  const save = () => FK.store.set('circle', st);
  let el = null, rot = 0, chordFocus = null, playingProg = null;

  const PROGS = {
    major: [
      { name: 'Pop anthem', rn: 'I V vi IV', eg: 'Let It Be · With or Without You · Someone Like You' },
      { name: '50s doo-wop', rn: 'I vi IV V', eg: 'Stand By Me · Every Breath You Take' },
      { name: 'Rock & roll', rn: 'I IV V I', eg: 'Twist and Shout · La Bamba · Wild Thing' },
      { name: 'Jazz ii–V–I', rn: 'ii7 V7 Imaj7 Imaj7', eg: 'The cornerstone of jazz harmony' },
      { name: 'Sensitive', rn: 'vi IV I V', eg: 'The pop anthem, started on the minor chord' },
      { name: 'Mixolydian rock', rn: 'I bVII IV I', eg: 'Sweet Home Alabama · Back in Black' },
      { name: 'Borrowed iv', rn: 'I III IV iv', eg: 'Creep — the minor iv is pure heartbreak' },
      { name: 'Pachelbel', rn: 'I V vi iii IV I IV V', eg: 'Canon in D and a thousand wedding songs' },
      { name: '12-bar blues', rn: 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', eg: 'Johnny B. Goode · Pride and Joy' },
    ],
    minor: [
      { name: 'Epic minor', rn: 'i VI III VII', eg: 'Zombie · Despacito' },
      { name: 'Andalusian cadence', rn: 'i VII VI V', eg: 'Hit the Road Jack · flamenco' },
      { name: 'Aeolian vamp', rn: 'i VII VI VII', eg: 'All Along the Watchtower' },
      { name: 'Minor plagal', rn: 'i iv v i', eg: 'Folk, classical, sea shanties' },
      { name: 'Minor ii–V–i', rn: 'iiø7 V7 i i', eg: 'Jazz in a minor key — note the major V7' },
      { name: 'Dark descent', rn: 'i VI iv V', eg: 'Film & game scores' },
      { name: 'Minor blues', rn: 'i7 i7 i7 i7 iv7 iv7 i7 i7 VI7 V7 i7 V7', eg: 'The Thrill Is Gone feel' },
    ],
  };

  function init(root) {
    el = root;
    el.innerHTML = `
      <div class="grid-2 wide-left">
        <div class="card c-violet circle-wrap">
          <div class="row" style="width:100%;margin-bottom:6px">
            <div class="seg"><button data-mode="major">Major keys</button><button data-mode="minor">Minor keys</button></div>
            <span class="spacer"></span>
            <span class="muted" style="font-size:13px">Clockwise = up a 5th · one more ♯ (or one less ♭)</span>
          </div>
          <div data-role="circle" style="width:100%"></div>
        </div>
        <div class="stack">
          <div class="card" data-role="key"></div>
          <div class="card c-teal" data-role="chords"></div>
        </div>
      </div>
      <div class="card c-amber" style="margin-top:20px" data-role="progs"></div>`;
    buildCircle();
    el.addEventListener('click', onClick);
    FK.on('space', () => { if (FK.state.tab === 'circle') { if (playingProg != null) FK.stopTransport(); else playProg(0); } });
  }

  function wedge(cx, cy, r0, r1, a0, a1) {
    const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    return `M${x0},${y0} A${r1},${r1} 0 0 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 0 0 ${x3},${y3}Z`;
  }

  function buildCircle() {
    const C = 300;
    const rad = (deg) => (deg * Math.PI) / 180;
    let s = `<svg viewBox="0 0 600 600" class="cof" role="img" aria-label="Circle of fifths"><g class="rot">`;
    T.CIRCLE.forEach((k, i) => {
      const a0 = rad(-90 + i * 30 - 15), a1 = rad(-90 + i * 30 + 15), am = rad(-90 + i * 30);
      const lp = (r) => [C + r * Math.cos(am), C + r * Math.sin(am)];
      const [mx, my] = lp(248), [nx, ny] = lp(173), [sx, sy] = lp(124), [rx, ry] = lp(276), [qx, qy] = lp(195);
      s += `<g class="wedge seg-maj" data-i="${i}" data-ring="major"><path d="${wedge(C, C, 205, 292, a0, a1)}"/>
        <g class="lbl"><text x="${mx}" y="${my}" class="t-maj">${k.majorLabel}</text></g>
        <g class="lbl"><text x="${rx}" y="${ry}" class="t-rn" data-rn="maj${i}"></text></g></g>`;
      s += `<g class="wedge seg-min" data-i="${i}" data-ring="minor"><path d="${wedge(C, C, 145, 205, a0, a1)}"/>
        <g class="lbl"><text x="${nx}" y="${ny}" class="t-min">${k.minorLabel}</text></g>
        <g class="lbl"><text x="${qx}" y="${qy}" class="t-rn" data-rn="min${i}"></text></g></g>`;
      const sig = k.sig.count === 0 ? '♮' : k.sig.count > 0 ? k.sig.count + '♯' : -k.sig.count + '♭';
      s += `<g class="wedge seg-sig"><path d="${wedge(C, C, 105, 145, a0, a1)}"/><g class="lbl"><text x="${sx}" y="${sy}" class="t-sig">${k.pc === 6 ? '6♯/6♭' : sig}</text></g></g>`;
    });
    s += `</g><circle cx="300" cy="300" r="103" class="hub"/><text x="300" y="290" class="center-name" data-role="cname"></text><text x="300" y="325" class="center-sub" data-role="csub"></text></svg>`;
    $('[data-role=circle]', el).innerHTML = s;
  }

  function selIndex() {
    return st.mode === 'major' ? T.CIRCLE.findIndex((k) => k.pc === st.pc) : T.CIRCLE.findIndex((k) => k.minorPc === st.pc);
  }

  function updateCircle() {
    const svgEl = $('.cof', el);
    const i = selIndex();
    let target = -i * 30;
    while (target - rot > 180) target -= 360;
    while (target - rot < -180) target += 360;
    rot = target;
    $('.rot', svgEl).style.transform = `rotate(${rot}deg)`;
    $$('.lbl', svgEl).forEach((l) => { l.style.transform = `rotate(${-rot}deg)`; });
    $$('.wedge', svgEl).forEach((w) => w.classList.remove('sel', 'dia', 'dim', 'min'));
    $$('[data-rn]', svgEl).forEach((t) => (t.textContent = ''));
    const idx = (d) => mod(i + d);
    const minor = st.mode === 'minor';
    const rnMaj = minor ? { '-1': 'VI', 0: 'III', 1: 'VII' } : { '-1': 'IV', 0: 'I', 1: 'V' };
    const rnMin = minor ? { '-1': 'iv', 0: 'i', 1: 'v' } : { '-1': 'ii', 0: 'vi', 1: 'iii' };
    [-1, 0, 1].forEach((d) => {
      const maj = $(`.seg-maj[data-i="${idx(d)}"]`, svgEl);
      const mn = $(`.seg-min[data-i="${idx(d)}"]`, svgEl);
      maj.classList.add('dia'); mn.classList.add('dia');
      $(`[data-rn="maj${idx(d)}"]`, svgEl).textContent = rnMaj[d];
      $(`[data-rn="min${idx(d)}"]`, svgEl).textContent = rnMin[d];
    });
    const dimW = $(`.seg-min[data-i="${idx(2)}"]`, svgEl);
    dimW.classList.add('dia', 'dim');
    $(`[data-rn="min${idx(2)}"]`, svgEl).textContent = minor ? 'ii°' : 'vii°';
    const sel = $(`.seg-${minor ? 'min' : 'maj'}[data-i="${i}"]`, svgEl);
    sel.classList.add('sel');
    if (minor) sel.classList.add('min');
    $('[data-role=cname]', svgEl).textContent = T.keyName(st.pc, st.mode).replace(' major', '').replace(' minor', 'm');
    $('[data-role=csub]', svgEl).textContent = T.keySignature(st.pc, st.mode).text;
  }

  function scaleNotes() { return T.scaleNotes(st.pc, st.mode === 'major' ? 'major' : 'minor'); }
  function diatonic() { return T.diatonicChords(st.pc, st.mode === 'major' ? 'major' : 'minor', st.sevenths); }

  function renderKey() {
    const sig = T.keySignature(st.pc, st.mode);
    const relPc = st.mode === 'major' ? mod(st.pc + 9) : mod(st.pc + 3);
    const relMode = st.mode === 'major' ? 'minor' : 'major';
    const parPc = st.pc;
    const parMode = relMode;
    const ns = scaleNotes();
    const up = T.CIRCLE[mod(selIndex() + 1)], down = T.CIRCLE[mod(selIndex() - 1)];
    $('[data-role=key]', el).innerHTML = `
      <div class="row" style="align-items:flex-start"><div><span class="eyebrow" style="margin:0 0 4px">Selected key</span><h3 style="font-size:30px;font-weight:800">${T.keyName(st.pc, st.mode)}</h3>
      <div class="muted" style="font-size:14px">${sig.text}${sig.accidentals.length ? ': ' + sig.accidentals.map(T.pretty).join(' ') : ''}</div></div></div>
      ${FK.ui.staff(sig.accidentals)}
      <div class="formula" style="margin-top:4px">${ns.map((n) => `<button class="deg ${FK.degCls(n.deg)}" data-note="${n.pc}"><b>${T.pretty(n.name)}</b><span>${n.num}</span></button>`).join('')}</div>
      <div class="row" style="margin-top:14px">
        <button class="btn small" data-go="${relPc}:${relMode}">Relative: ${T.keyName(relPc, relMode)}</button>
        <button class="btn small" data-go="${parPc}:${parMode}">Parallel: ${T.keyName(parPc, parMode)}</button>
        <button class="btn small" data-act="scale">Open scale →</button>
      </div>
      <p class="muted" style="font-size:13px;margin:12px 0 0">Neighbours: <b>${st.mode === 'major' ? up.majorLabel : up.minorLabel}</b> (dominant side, +1♯) and <b>${st.mode === 'major' ? down.majorLabel : down.minorLabel}</b> (subdominant side, +1♭) share 6 of 7 notes — the smoothest keys to modulate to.</p>`;
  }

  function renderChords() {
    const dia = diatonic();
    $('[data-role=chords]', el).innerHTML = `
      <div class="row"><h4 style="margin:0">Chords in this key</h4><span class="spacer"></span>
      <div class="seg"><button data-sev="0" class="${!st.sevenths ? 'on' : ''}">Triads</button><button data-sev="1" class="${st.sevenths ? 'on' : ''}">7ths</button></div></div>
      <div class="chips" style="margin-top:12px">${dia.map((c, i) => `<button class="chip ${chordFocus === i ? 'on' : ''}" data-chord="${i}"><span class="rn">${c.roman}</span><span class="cn">${c.label}</span></button>`).join('')}</div>
      <p class="muted" style="font-size:13px;margin:10px 0 0">${st.mode === 'major' ? 'Pattern: Major · minor · minor · Major · Major · minor · diminished.' : 'Pattern: minor · dim · Major · minor · minor · Major · Major. Many songs borrow a major V for a stronger pull home.'}</p>`;
  }

  function renderProgs() {
    const list = PROGS[st.mode];
    $('[data-role=progs]', el).innerHTML = `
      <div class="row"><h3>Famous progressions in ${T.keyName(st.pc, st.mode)}</h3><span class="spacer"></span>
      <div class="range-row" style="min-width:240px"><span class="muted" style="font-size:13px">Tempo</span><input type="range" min="60" max="160" data-role="tempo" value="${st.tempo}"><output>${st.tempo} bpm</output></div></div>
      <div class="prog-list" style="margin-top:14px">${list.map((p, i) => {
        const chords = p.rn.split(' ').map((r) => T.parseRoman(r, st.pc, st.mode));
        return `<button class="prog ${playingProg === i ? 'playing' : ''}" data-prog="${i}"><span class="play-ico">${playingProg === i ? I().stop : I().play}</span>
          <span class="pname">${p.name}<small>${p.eg}</small></span>
          <span class="pchords">${chords.map((c, j) => `<span data-pc-idx="${j}"><em>${T.pretty(p.rn.split(' ')[j])}</em>${c ? c.label : '?'}</span>`).join('')}</span></button>`;
      }).join('')}</div>`;
    const t = $('[data-role=tempo]', el);
    t.addEventListener('input', () => { st.tempo = +t.value; t.nextElementSibling.textContent = st.tempo + ' bpm'; save(); if (progHandle) progHandle.setBpm(st.tempo); });
  }

  function onClick(e) {
    const b = e.target.closest('button, .wedge');
    if (!b || !el.contains(b)) return;
    if (b.classList.contains('wedge') && b.dataset.ring) {
      const k = T.CIRCLE[+b.dataset.i];
      st.mode = b.dataset.ring;
      st.pc = st.mode === 'major' ? k.pc : k.minorPc;
      chordFocus = null;
      save(); FK.stopTransport(); show();
      FK.voice.play(FK.voice.get({ rootPc: st.pc, suffix: st.mode === 'major' ? '' : 'm' }));
      return;
    }
    if (b.dataset.mode) { const i = selIndex(); st.mode = b.dataset.mode; st.pc = st.mode === 'major' ? T.CIRCLE[i].pc : T.CIRCLE[i].minorPc; chordFocus = null; save(); show(); return; }
    if (b.dataset.go) { const [pc, mode] = b.dataset.go.split(':'); st.pc = +pc; st.mode = mode; chordFocus = null; save(); show(); return; }
    if (b.dataset.act === 'scale') { FK.panels.scales.open(st.pc, st.mode === 'major' ? 'major' : 'minor'); return; }
    if (b.dataset.sev != null) { st.sevenths = b.dataset.sev === '1'; save(); chordFocus = null; renderChords(); stageScale(); return; }
    if (b.dataset.note != null) {
      const pc = +b.dataset.note;
      const midi = FK.state.mode === 'piano' ? 60 + mod(pc - 0) : FK.guitar.tuning()[1] + mod(pc - FK.guitar.tuning()[1]);
      FK.stage.play(midi);
      return;
    }
    if (b.dataset.chord != null) {
      const i = +b.dataset.chord;
      chordFocus = chordFocus === i ? null : i;
      renderChords();
      if (chordFocus == null) { stageScale(); return; }
      const c = diatonic()[i];
      const v = FK.voice.get(c);
      FK.voice.show(c, v, scaleNotes());
      FK.voice.play(v);
      FK.stage.setInfo({ eyebrow: `Key of ${T.keyName(st.pc, st.mode)} · ${c.roman}`, title: c.label, sub: T.chordNotes(c.root, c.suffix).map((n) => `<b>${T.pretty(n.name)}</b>`).join(' · ') + ' &nbsp;— faded dots show the rest of the key' });
      return;
    }
    if (b.dataset.prog != null) {
      const i = +b.dataset.prog;
      if (playingProg === i) { FK.stopTransport(); return; }
      playProg(i);
    }
  }

  let progHandle = null;
  function playProg(i) {
    const p = PROGS[st.mode][i];
    const chords = p.rn.split(' ').map((r) => T.parseRoman(r, st.pc, st.mode)).filter(Boolean);
    const scale = scaleNotes();
    let prev = null;
    const vs = chords.map((c) => (prev = FK.voice.get(c, prev)));
    const beatsPer = chords.length > 8 ? 2 : 4;
    const events = [];
    chords.forEach((c, j) => {
      events.push({
        beat: j * beatsPer,
        play: (w, spb) => FK.voice.play(vs[j], { when: w, dur: spb * beatsPer * 0.95, flash: false }),
        ui: () => {
          FK.voice.show(c, vs[j], scale);
          if (vs[j]) {
            if (FK.state.mode === 'guitar' && vs[j].frets) vs[j].frets.forEach((f, s) => { if (f >= 0) FK.guitar.flash(s, f); });
            else vs[j].midis.forEach((m) => FK.piano.flash(m));
          }
          FK.stage.setInfo({ eyebrow: `${p.name} · ${T.keyName(st.pc, st.mode)}`, title: `${c.label} <span class="muted" style="font-weight:600">${T.pretty(p.rn.split(' ')[j])}</span>`, sub: 'Bright dots = chord tones · faded = the rest of the key' });
          $$('[data-pc-idx]', el).forEach((s) => s.classList.toggle('playing', s.closest('.prog').dataset.prog === String(i) && +s.dataset.pcIdx === j));
        },
      });
      for (let b = 1; b < beatsPer; b++) if (beatsPer === 4 && b === 2) events.push({ beat: j * beatsPer + b, play: (w, spb) => FK.voice.play(vs[j], { when: w, dur: spb * 1.9, flash: false, vel: 0.55 }) });
    });
    events.sort((a, b) => a.beat - b.beat);
    progHandle = FK.audio.sequence({ bpm: st.tempo, events, totalBeats: chords.length * beatsPer, loop: true });
    playingProg = i;
    FK.setTransport(progHandle, () => { playingProg = null; progHandle = null; if (FK.state.tab === 'circle') { renderProgs(); stageScale(); } });
    renderProgs();
  }

  function stageScale() {
    const ns = scaleNotes();
    FK.stage.setInfo({ eyebrow: 'Key', title: T.keyName(st.pc, st.mode), sub: ns.map((n) => `<b>${T.pretty(n.name)}</b>`).join(' · ') + ` &nbsp;·&nbsp; ${T.keySignature(st.pc, st.mode).text}` });
    FK.stage.degreeLegend(ns);
    FK.stage.showNotes(ns);
  }

  function show() {
    if (!el) return;
    $$('[data-mode]', el).forEach((b) => b.classList.toggle('on', b.dataset.mode === st.mode));
    updateCircle();
    renderKey();
    renderChords();
    renderProgs();
    if (chordFocus == null && playingProg == null) stageScale();
  }

  FK.panels.circle = {
    init, show,
    open(pc, mode) { st.pc = pc; st.mode = mode; chordFocus = null; save(); FK.showTab('circle', { scroll: true }); },
  };
})();
