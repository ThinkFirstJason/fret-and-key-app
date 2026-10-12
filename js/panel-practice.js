/* Fret & Key — Practice: ear training, fretboard/keyboard drills, theory quizzes, metronome */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const mod = T.mod;
  const $ = FK.$, $$ = FK.$$;
  const I = () => FK.ui.icon;

  const st = Object.assign({ drill: 'intervals', ivSet: 'basic', ivDir: 'up', chordSet: 'basic', bpm: 90, beats: 4 }, FK.store.get('practice', {}));
  const save = () => FK.store.set('practice', st);
  const best = FK.store.get('best', {});
  let el = null, area = null;
  let score = { ok: 0, total: 0, streak: 0 };
  let current = null;
  let locked = false;

  const IV_SONGS = ['Unison', 'Jaws', 'Happy Birthday', 'Greensleeves', 'When the Saints', 'Here Comes the Bride', 'The Simpsons', 'Star Wars', 'The Entertainer', 'My Bonnie', 'Star Trek', 'Take On Me', 'Over the Rainbow'];
  const DRILLS = [
    { id: 'intervals', icon: '👂', name: 'Interval Ear Trainer', desc: 'Hear two notes — name the distance.', color: 'var(--coral)' },
    { id: 'chordq', icon: '🎧', name: 'Chord Quality', desc: 'Major, minor, diminished, 7th… by ear.', color: 'var(--violet)' },
    { id: 'finder', icon: '🎯', name: 'Note Finder', desc: 'Find the note on your instrument.', color: 'var(--teal)' },
    { id: 'namer', icon: '🔤', name: 'Name That Note', desc: 'A dot lights up — what note is it?', color: 'var(--amber)' },
    { id: 'keysig', icon: '♯', name: 'Key Signatures', desc: 'Read the sharps & flats, name the key.', color: 'var(--sky)' },
    { id: 'inkey', icon: 'IV', name: 'Chords in a Key', desc: '“What’s the vi chord in E♭?”', color: 'var(--pink)' },
    { id: 'metronome', icon: '⏱', name: 'Metronome', desc: 'Steady time with tap tempo.', color: 'var(--d4)' },
  ];

  function init(root) {
    el = root;
    el.innerHTML = `
      <div class="card c-teal"><div class="eyebrow"><span class="num">01</span> Choose a drill</div><div class="drill-grid" data-role="drills"></div></div>
      <div class="card c-amber" style="margin-top:20px"><div class="drill-area" data-role="area"></div></div>`;
    area = $('[data-role=area]', el);
    el.addEventListener('click', onClick);
    FK.on('inst-click', onInstClick);
  }

  function renderDrills() {
    $('[data-role=drills]', el).innerHTML = DRILLS.map((d) => `<button class="drill-card ${d.id === st.drill ? 'on' : ''}" data-drill="${d.id}" style="--dc:${d.color}"><div class="di">${d.icon}</div><h4>${d.name}</h4><p>${d.desc}</p>${best[d.id] ? `<div class="best">Best streak: ${best[d.id]}</div>` : ''}</button>`).join('');
  }

  function scoreboard() {
    return `<div class="scoreboard"><div class="score"><b>${score.ok}/${score.total}</b><span>Correct</span></div><div class="score"><b>${score.streak}</b><span>Streak</span></div><div class="score"><b>${best[st.drill] || 0}</b><span>Best</span></div></div>`;
  }

  function mark(ok) {
    score.total++;
    if (ok) { score.ok++; score.streak++; if (score.streak > (best[st.drill] || 0)) { best[st.drill] = score.streak; FK.store.set('best', best); } }
    else score.streak = 0;
    const sb = $('.scoreboard', area);
    if (sb) sb.outerHTML = scoreboard();
  }

  function feedback(ok, msg) {
    const f = $('[data-role=fb]', area);
    if (f) { f.className = 'feedback ' + (ok ? 'good' : 'bad'); f.innerHTML = msg; }
  }

  function header(title, controls = '') {
    return `<div class="row" style="align-items:flex-start"><div><h3>${title}</h3></div><span class="spacer"></span>${scoreboard()}</div>${controls ? `<div class="row" style="margin-top:12px">${controls}</div>` : ''}`;
  }

  /* ---------------- drills ---------------- */
  const IV_SETS = { basic: [3, 4, 5, 7, 12], medium: [2, 3, 4, 5, 7, 9, 12], all: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

  function intervalsDrill() {
    const set = IV_SETS[st.ivSet];
    area.innerHTML = header('Interval Ear Trainer', `
      <div class="seg" data-set="iv">${Object.keys(IV_SETS).map((k) => `<button data-ivset="${k}" class="${st.ivSet === k ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <div class="seg">${[['up', 'Ascending'], ['down', 'Descending'], ['harm', 'Together']].map(([v, l]) => `<button data-ivdir="${v}" class="${st.ivDir === v ? 'on' : ''}">${l}</button>`).join('')}</div>`) +
      `<div class="prompt">What interval is this?</div><div class="row"><button class="btn primary" data-act="replay">${I().play}<span>Play again</span></button><button class="btn" data-act="next">Skip →</button></div>
      <div class="answers">${set.map((s) => `<button data-ans="${s}">${T.INTERVALS[s].name}<small>${T.INTERVALS[s].short}</small></button>`).join('')}</div><div class="feedback" data-role="fb"></div>`;
    const semi = FK.pick(set);
    const low = 52 + Math.floor(Math.random() * 14);
    current = { semi, low, play() { const a = low, b = low + semi; if (st.ivDir === 'harm') FK.audio.playChord([a, b], { inst: FK.state.mode, strum: 0 }); else { const [x, y] = st.ivDir === 'up' ? [a, b] : [b, a]; FK.audio.playMidi(x, { inst: FK.state.mode, dur: 0.9 }); FK.audio.playMidi(y, { inst: FK.state.mode, when: FK.audio.now() + 0.7, dur: 1.2 }); } },
      check(ans) { const ok = +ans === semi; return { ok, msg: ok ? `✓ ${T.INTERVALS[semi].name} — think “${IV_SONGS[semi]}”` : `✗ It was a <b>${T.INTERVALS[semi].name}</b> (${T.pretty(T.midiName(low))} → ${T.pretty(T.midiName(low + semi))}) — think “${IV_SONGS[semi]}”`, correct: String(semi) }; } };
    FK.stage.setInfo({ eyebrow: 'Practice', title: 'Interval Ear Trainer', sub: 'Listen first — the answer appears on the instrument after you guess' });
    FK.stage.clear();
    setTimeout(() => current.play(), 250);
  }
  function revealInterval() {
    const { low, semi } = current;
    const ms = [low, low + semi];
    if (FK.state.mode === 'piano') FK.piano.setMarkers(ms.map((m, i) => ({ midi: m, note: T.pretty(T.SHARP_NAMES[mod(m)]), interval: i ? T.INTERVALS[semi].short : 'R', cls: i ? 'd5' : 'd1', root: !i })));
    else { let p = null; const pos = ms.map((m) => (p = FK.stage.bestPos(m, p))); FK.guitar.setMarkers(pos.filter(Boolean).map((q, i) => ({ s: q.s, f: q.f, note: T.pretty(T.SHARP_NAMES[mod(ms[i])]), interval: i ? T.INTERVALS[semi].short : 'R', cls: i ? 'd5' : 'd1', root: !i }))); }
  }

  const CQ_SETS = { basic: ['', 'm'], triads: ['', 'm', 'dim', 'aug'], sevenths: ['maj7', '7', 'm7', 'm7b5'], all: ['', 'm', 'dim', 'aug', 'sus4', 'maj7', '7', 'm7', 'm7b5', 'dim7'] };
  function chordqDrill() {
    const set = CQ_SETS[st.chordSet];
    area.innerHTML = header('Chord Quality', `<div class="seg">${Object.keys(CQ_SETS).map((k) => `<button data-cqset="${k}" class="${st.chordSet === k ? 'on' : ''}">${k === 'basic' ? 'Major vs minor' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>`) +
      `<div class="prompt">What kind of chord is this?</div><div class="row"><button class="btn primary" data-act="replay">${I().play}<span>Play again</span></button><button class="btn" data-act="next">Skip →</button></div>
      <div class="answers">${set.map((s) => `<button data-ans="${s}">${T.chordDef(s).name}<small>${s === '' ? 'maj' : T.chordDef(s).display}</small></button>`).join('')}</div><div class="feedback" data-role="fb"></div>`;
    const suffix = FK.pick(set);
    const rootPc = Math.floor(Math.random() * 12);
    const base = 50 + mod(rootPc - 2);
    const ms = T.chordDef(suffix).degs.map((d) => base + d.semi);
    current = { suffix, rootPc, ms,
      play() { FK.audio.playChord(ms, { inst: FK.state.mode, strum: 0.09, dur: 1.4 }); FK.audio.playChord(ms, { inst: FK.state.mode, when: FK.audio.now() + 0.9, dur: 2 }); },
      check(ans) { const ok = ans === suffix; const lab = T.chordLabel(T.rootNameFor(rootPc, false), suffix); return { ok, msg: ok ? `✓ ${T.chordDef(suffix).name} (${lab})` : `✗ That was <b>${T.chordDef(suffix).name}</b> — ${lab}`, correct: suffix }; } };
    FK.stage.setInfo({ eyebrow: 'Practice', title: 'Chord Quality', sub: 'Major sounds bright, minor dark, diminished tense, augmented dreamy' });
    FK.stage.clear();
    setTimeout(() => current.play(), 250);
  }

  function finderDrill() {
    const gtr = FK.state.mode === 'guitar';
    const pc = Math.floor(Math.random() * 12);
    const name = T.pretty(T.ROOT_LABELS[pc]);
    let s = null;
    if (gtr) s = Math.floor(Math.random() * FK.guitar.tuning().length);
    const strName = gtr ? T.pretty(T.SHARP_NAMES[mod(FK.guitar.tuning()[s])]) : '';
    area.innerHTML = header('Note Finder') + `<div class="prompt">Find <em>${name}</em>${gtr ? ` on the <em>${strName}</em> string <span class="muted" style="font-size:.6em">(${['lowest', '2nd', '3rd', '4th', '5th', '6th', '7th'][s]} string)</span>` : ' anywhere on the keyboard'}</div>
      <p class="muted">Click it on the ${gtr ? 'fretboard' : 'keyboard'} above.</p><div class="row"><button class="btn" data-act="next">Skip →</button><button class="btn ghost" data-act="show">Show me</button></div><div class="feedback" data-role="fb"></div>`;
    current = { pc, s, inst: true };
    FK.stage.setInfo({ eyebrow: 'Practice · Note Finder', title: `Find ${name}`, sub: gtr ? `On the ${strName} string` : 'Any octave counts' });
    FK.stage.clear();
    FK.stage.setLegend([]);
  }

  function namerDrill() {
    const gtr = FK.state.mode === 'guitar';
    let midi, marker;
    if (gtr) {
      const tun = FK.guitar.tuning();
      const s = Math.floor(Math.random() * tun.length), f = Math.floor(Math.random() * 13);
      midi = tun[s] + f; marker = { s, f, note: '?', interval: '?', cls: 'd3' };
      FK.guitar.setWindow(null); FK.guitar.setMarkers([marker]);
    } else {
      const { lo, hi } = FK.piano.range();
      midi = lo + Math.floor(Math.random() * (hi - lo + 1));
      FK.piano.setMarkers([{ midi, note: '?', interval: '?', cls: 'd3' }]);
    }
    area.innerHTML = header('Name That Note') + `<div class="prompt">What note is lit up?</div><div class="row"><button class="btn" data-act="hear">${I().play}<span>Hear it</span></button><button class="btn" data-act="next">Skip →</button></div>
      <div class="answers">${T.ROOT_LABELS.map((l, pc) => `<button data-ans="${pc}">${l}</button>`).join('')}</div><div class="feedback" data-role="fb"></div>`;
    current = { midi, check(ans) { const ok = +ans === mod(midi); return { ok, msg: ok ? `✓ ${T.pretty(T.midiName(midi))}` : `✗ It's <b>${T.ROOT_LABELS[mod(midi)]}</b> (${T.pretty(T.midiName(midi))})`, correct: String(mod(midi)) }; } };
    FK.stage.setInfo({ eyebrow: 'Practice', title: 'Name That Note', sub: 'Tip: count up from the nearest open string or C' });
    FK.stage.setLegend([]);
  }

  function keysigDrill() {
    const minor = Math.random() < 0.35;
    const k = FK.pick(T.CIRCLE);
    const pc = minor ? k.minorPc : k.pc;
    const mode = minor ? 'minor' : 'major';
    const sig = T.keySignature(pc, mode);
    const opts = FK.shuffle([pc].concat(FK.shuffle(T.CIRCLE.map((c) => (minor ? c.minorPc : c.pc)).filter((x) => x !== pc)).slice(0, 3)));
    area.innerHTML = header('Key Signatures') + `<div class="prompt">Which ${mode} key has this signature?</div>${FK.ui.staff(sig.accidentals)}
      <div class="answers">${opts.map((o) => `<button data-ans="${o}">${T.keyName(o, mode)}</button>`).join('')}</div><div class="feedback" data-role="fb"></div><div class="row"><button class="btn" data-act="next">Skip →</button></div>`;
    current = { check(ans) { const ok = +ans === pc; return { ok, msg: (ok ? '✓ ' : '✗ It\'s <b>' + T.keyName(pc, mode) + '</b> — ') + `${sig.text}${sig.accidentals.length ? ' (' + sig.accidentals.map(T.pretty).join(' ') + ')' : ''}. Relative ${minor ? 'major' : 'minor'}: ${minor ? T.keyName(mod(pc + 3), 'major') : T.keyName(mod(pc + 9), 'minor')}.`, correct: String(pc) }; },
      after() { FK.stage.showNotes(T.scaleNotes(pc, mode === 'major' ? 'major' : 'minor')); FK.stage.setInfo({ eyebrow: 'Practice · answer', title: T.keyName(pc, mode), sub: sig.text }); } };
    FK.stage.setInfo({ eyebrow: 'Practice', title: 'Key Signatures', sub: 'Sharps: last sharp + half step. Flats: second-to-last flat.' });
    FK.stage.clear();
  }

  function inkeyDrill() {
    const mode = Math.random() < 0.7 ? 'major' : 'minor';
    const k = FK.pick(T.CIRCLE.filter((c) => c.pc !== 6));
    const pc = mode === 'major' ? k.pc : k.minorPc;
    const dia = T.diatonicChords(pc, mode === 'major' ? 'major' : 'minor');
    const i = Math.floor(Math.random() * 7);
    const target = dia[i];
    const opts = FK.shuffle([target.label].concat(FK.shuffle(dia.filter((d, j) => j !== i).map((d) => d.label)).slice(0, 3)));
    area.innerHTML = header('Chords in a Key') + `<div class="prompt">What is the <em>${target.roman}</em> chord in <em>${T.keyName(pc, mode)}</em>?</div>
      <div class="answers">${opts.map((o) => `<button data-ans="${o}">${o}</button>`).join('')}</div><div class="feedback" data-role="fb"></div><div class="row"><button class="btn" data-act="next">Skip →</button></div>`;
    current = { check(ans) { const ok = ans === target.label; return { ok, msg: (ok ? '✓ ' : `✗ It's <b>${target.label}</b>. `) + `${T.keyName(pc, mode)}: ` + dia.map((d) => `${d.roman} ${d.label}`).join(' · '), correct: target.label }; },
      after() { const v = FK.voice.get(target); FK.voice.show(target, v, T.scaleNotes(pc, mode === 'major' ? 'major' : 'minor')); FK.voice.play(v); } };
    FK.stage.setInfo({ eyebrow: 'Practice', title: 'Chords in a Key', sub: mode === 'major' ? 'Major keys: I ii iii IV V vi vii°' : 'Minor keys: i ii° III iv v VI VII' });
    FK.stage.clear();
  }

  /* ---------------- metronome ---------------- */
  let metro = null, taps = [];
  function metronomeDrill() {
    area.innerHTML = `<div class="row"><h3>Metronome</h3></div>
      <div class="metro" style="max-width:520px;margin:10px auto 0">
        <div class="metro-bpm" data-role="mbpm">${st.bpm}<small>BPM</small></div>
        <div class="pendulum"><div data-role="pend"></div></div>
        <div class="beat-dots" data-role="mdots">${Array.from({ length: st.beats }, () => '<i></i>').join('')}</div>
        <div class="range-row"><button class="arrow-btn" data-act="m-">−</button><input type="range" min="30" max="260" value="${st.bpm}" data-role="mrange"><button class="arrow-btn" data-act="m+">+</button></div>
        <div class="row" style="justify-content:center">
          <div class="seg">${[2, 3, 4, 5, 6, 7].map((n) => `<button data-beats="${n}" class="${st.beats === n ? 'on' : ''}">${n}/4</button>`).join('')}</div>
        </div>
        <div class="row" style="justify-content:center"><button class="btn primary" data-act="mstart">${metro ? I().stop + '<span>Stop</span>' : I().play + '<span>Start</span>'}</button><button class="btn" data-act="tap">Tap tempo</button></div>
        <p class="muted" style="text-align:center;font-size:13px">${tempoName(st.bpm)}</p>
      </div>`;
    $('[data-role=mrange]', area).addEventListener('input', (e) => setBpm(+e.target.value));
    FK.stage.setInfo({ eyebrow: 'Practice', title: 'Metronome', sub: 'Play your scales from the Scales tab along with the click' });
  }
  function tempoName(b) { return b < 60 ? 'Largo — very slow' : b < 76 ? 'Adagio — slow' : b < 108 ? 'Andante / Moderato — walking pace' : b < 140 ? 'Allegro — fast & bright' : b < 180 ? 'Vivace — lively' : 'Presto — very fast'; }
  function setBpm(b) {
    st.bpm = FK.clamp(Math.round(b), 30, 260); save();
    const lab = $('[data-role=mbpm]', area); if (lab) lab.innerHTML = st.bpm + '<small>BPM</small>';
    const r = $('[data-role=mrange]', area); if (r) r.value = st.bpm;
    if (metro) metro.setBpm(st.bpm);
  }
  function startMetro() {
    if (metro) { FK.stopTransport(); return; }
    const events = [];
    for (let b = 0; b < st.beats; b++) events.push({ beat: b, play: (w) => FK.audio.click(w, b === 0), ui: () => {
      $$('[data-role=mdots] i', area).forEach((d, i) => { d.classList.toggle('on', i === b); d.classList.toggle('accent', i === 0); });
      const p = $('[data-role=pend]', area);
      if (p) { p.style.transition = `transform ${60 / st.bpm}s ease-in-out`; p.style.transform = `rotate(${b % 2 ? -24 : 24}deg)`; }
    } });
    metro = FK.audio.sequence({ bpm: st.bpm, events, totalBeats: st.beats, loop: true });
    FK.setTransport(metro, () => { metro = null; if (st.drill === 'metronome' && FK.state.tab === 'practice') metronomeDrill(); });
    metronomeDrill();
  }

  /* ---------------- flow ---------------- */
  const RUN = { intervals: intervalsDrill, chordq: chordqDrill, finder: finderDrill, namer: namerDrill, keysig: keysigDrill, inkey: inkeyDrill, metronome: metronomeDrill };
  function start() { locked = false; current = null; RUN[st.drill](); }

  function answer(btn) {
    if (locked || !current || !current.check) return;
    locked = true;
    const r = current.check(btn.dataset.ans);
    btn.classList.add(r.ok ? 'good' : 'bad');
    if (!r.ok) { const c = $$('[data-ans]', area).find((b) => b.dataset.ans === r.correct); if (c) c.classList.add('good'); }
    mark(r.ok);
    feedback(r.ok, r.msg);
    if (st.drill === 'intervals') revealInterval();
    if (current.after) current.after();
    setTimeout(start, r.ok ? 1300 : 2600);
  }

  function onInstClick(ev) {
    if (FK.state.tab !== 'practice' || st.drill !== 'finder' || !current || locked) return;
    // a played note (MIDI / audio) can't tell us the string, so only the note itself is checked
    const ok = mod(ev.midi) === current.pc && (ev.inst === 'piano' || ev.source === 'input' || current.s == null || ev.s === current.s);
    const lab = T.pretty(T.midiName(ev.midi));
    if (ev.inst === 'guitar' && ev.s != null) FK.guitar.setMarkers([{ s: ev.s, f: ev.f, note: T.pretty(T.SHARP_NAMES[mod(ev.midi)]), interval: '', cls: ok ? 'good' : 'bad' }]);
    else if (ev.inst === 'piano') FK.piano.setMarkers([{ midi: ev.midi, note: T.pretty(T.SHARP_NAMES[mod(ev.midi)]), interval: '', cls: ok ? 'good' : 'bad' }]);
    mark(ok);
    if (ok) { locked = true; feedback(true, `✓ ${lab}${ev.inst === 'guitar' && ev.f != null ? ` — fret ${ev.f}` : ''}`); setTimeout(start, 1100); }
    else feedback(false, `✗ That's ${lab}. Try again!`);
  }

  function showAnswer() {
    if (!current) return;
    const map = new Map([[current.pc, { note: T.pretty(T.ROOT_LABELS[current.pc]), interval: 'R', cls: 'd1', root: true }]]);
    if (FK.state.mode === 'guitar') FK.guitar.setMarkers(FK.stage.guitarFromMap(map).filter((m) => current.s == null || m.s === current.s));
    else FK.piano.setMarkers(FK.stage.pianoFromMap(map));
    score.streak = 0;
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.dataset.drill) { FK.stopTransport(); st.drill = b.dataset.drill; save(); score = { ok: 0, total: 0, streak: 0 }; renderDrills(); start(); return; }
    if (b.dataset.ans != null) return answer(b);
    if (b.dataset.ivset) { st.ivSet = b.dataset.ivset; save(); start(); return; }
    if (b.dataset.ivdir) { st.ivDir = b.dataset.ivdir; save(); start(); return; }
    if (b.dataset.cqset) { st.chordSet = b.dataset.cqset; save(); start(); return; }
    if (b.dataset.beats) { st.beats = +b.dataset.beats; save(); if (metro) { FK.stopTransport(); startMetro(); } else metronomeDrill(); return; }
    const a = b.dataset.act;
    if (a === 'replay' && current) current.play();
    else if (a === 'next') start();
    else if (a === 'show') showAnswer();
    else if (a === 'hear' && current) FK.stage.play(current.midi);
    else if (a === 'mstart') startMetro();
    else if (a === 'm-') setBpm(st.bpm - 1);
    else if (a === 'm+') setBpm(st.bpm + 1);
    else if (a === 'tap') {
      const now = performance.now();
      taps = taps.filter((t) => now - t < 2500).concat(now);
      if (taps.length >= 2) { const gaps = taps.slice(1).map((t, i) => t - taps[i]); setBpm(60000 / (gaps.reduce((x, y) => x + y, 0) / gaps.length)); }
    }
  }

  function show() {
    if (!el) return;
    renderDrills();
    if (!(st.drill === 'metronome' && metro)) start();
  }

  FK.panels.practice = { init, show, onInstrumentChange() { if (st.drill === 'finder' || st.drill === 'namer') start(); } };
})();
