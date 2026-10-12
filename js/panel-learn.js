/* Fret & Key — Learn: interactive lessons + glossary */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const mod = T.mod;
  const $ = FK.$, $$ = FK.$$;

  const st = Object.assign({ lesson: 'alphabet', done: [], letter: null }, FK.store.get('learn', {}));
  const save = () => FK.store.set('learn', st);
  let el = null;

  function init(root) {
    el = root;
    el.innerHTML = `
      <div class="learn-layout">
        <div class="card c-violet" style="padding:14px"><div class="eyebrow" style="margin:4px 6px 10px">Lessons</div><nav class="lesson-nav" data-role="nav"></nav></div>
        <div class="stack">
          <article class="card lesson" data-role="lesson"></article>
          <div class="card c-amber">
            <div class="row"><h3>Glossary</h3><span class="spacer"></span><div class="search-box" style="min-width:260px;flex:1;max-width:420px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg><input type="search" data-role="gq" placeholder="Search ${FK.GLOSSARY.length} terms…"></div></div>
            <div class="az" data-role="az"></div>
            <div class="glossary-grid" data-role="glossary"></div>
          </div>
        </div>
      </div>`;
    el.addEventListener('click', onClick);
    $('[data-role=gq]', el).addEventListener('input', () => { st.letter = null; renderGlossary(); });
  }

  function renderNav() {
    $('[data-role=nav]', el).innerHTML = FK.LESSONS.map((l, i) => `<button data-lesson="${l.id}" class="${l.id === st.lesson ? 'on' : ''} ${st.done.includes(l.id) ? 'done' : ''}"><span class="ln">${st.done.includes(l.id) && l.id !== st.lesson ? '✓' : i + 1}</span>${l.title}</button>`).join('');
  }

  function renderLesson() {
    const i = FK.LESSONS.findIndex((l) => l.id === st.lesson);
    const l = FK.LESSONS[i] || FK.LESSONS[0];
    const prev = FK.LESSONS[i - 1], next = FK.LESSONS[i + 1];
    $('[data-role=lesson]', el).innerHTML = `
      <span class="eyebrow">Lesson ${i + 1} of ${FK.LESSONS.length}</span>
      <h2>${l.title}</h2><p class="lead">${l.lead}</p>${l.body}
      <div class="lesson-pager">
        ${prev ? `<button class="btn" data-lesson="${prev.id}">← ${prev.title}</button>` : '<span></span>'}
        ${next ? `<button class="btn primary" data-lesson="${next.id}" data-complete="${l.id}">Next: ${next.title} →</button>` : `<button class="btn primary" data-complete="${l.id}" data-goto="practice">Finish — go practise →</button>`}
      </div>`;
  }

  function renderGlossary() {
    const q = ($('[data-role=gq]', el).value || '').trim().toLowerCase();
    const letters = [...new Set(FK.GLOSSARY.map((g) => g.term[0].toUpperCase()))];
    $('[data-role=az]', el).innerHTML = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => `<button data-letter="${c}" class="${st.letter === c ? 'on' : ''}" ${letters.includes(c) ? '' : 'disabled'}>${c}</button>`).join('');
    const list = FK.GLOSSARY.filter((g) => (!q || (g.term + ' ' + g.def + ' ' + g.cat).toLowerCase().includes(q)) && (!st.letter || g.term[0].toUpperCase() === st.letter));
    $('[data-role=glossary]', el).innerHTML = list.map((g) => `<div class="term"><h4>${g.term}<span class="tcat">${g.cat}</span></h4><p>${g.def}</p></div>`).join('') || '<p class="muted">No matching terms.</p>';
  }

  /* --------- interactive buttons inside lessons --------- */
  function playNotes(spec, how) {
    const ms = spec.split(/\s+/).map(T.nameToMidi).filter((m) => m != null);
    if (!ms.length) return;
    const inst = FK.state.mode;
    const pcMap = new Map();
    ms.forEach((m) => pcMap.set(mod(m), { note: T.pretty(T.SHARP_NAMES[mod(m)]), interval: '', cls: mod(m) === mod(ms[0]) ? 'd1' : 'd5', root: mod(m) === mod(ms[0]) }));
    FK.guitar.setWindow(null);
    if (inst === 'guitar') {
      let prev = null;
      const pos = ms.map((m) => (prev = FK.stage.bestPos(m, prev) || prev));
      FK.guitar.setMarkers(pos.filter(Boolean).map((p) => Object.assign({ s: p.s, f: p.f }, pcMap.get(mod(FK.guitar.midiAt(p.s, p.f))))));
      if (how === 'chord') { FK.audio.playChord(ms, { inst }); pos.forEach((p) => p && FK.guitar.flash(p.s, p.f)); return; }
      seq(ms, pos);
    } else {
      FK.piano.setMarkers(ms.map((m) => Object.assign({ midi: m }, pcMap.get(mod(m)))));
      if (how === 'chord') { FK.audio.playChord(ms, { inst }); ms.forEach((m) => FK.piano.flash(m)); return; }
      seq(ms, []);
    }
    FK.stage.setInfo({ eyebrow: 'Lesson example', title: ms.map((m) => T.pretty(T.midiName(m))).join(' · '), sub: '' });
    FK.stage.setLegend([]);
  }
  function seq(ms, pos) {
    const handle = FK.audio.sequence({
      bpm: 200, totalBeats: ms.length + 1,
      events: ms.map((m, i) => ({ beat: i, play: (w) => FK.audio.playMidi(m, { inst: FK.state.mode, when: w, dur: 0.9 }), ui: () => FK.stage.visual(m, pos[i]) })),
      onEnd: () => FK.stopTransport(),
    });
    FK.setTransport(handle);
  }

  function playScale(spec) {
    const [root, id] = spec.split(':');
    const pc = T.pcOf(root);
    const ns = T.scaleNotes(pc, id, root);
    FK.stage.setInfo({ eyebrow: 'Lesson example · scale', title: `${T.pretty(root)} ${T.SCALE_MAP[id].name}`, sub: ns.map((n) => `<b>${T.pretty(n.name)}</b>`).join(' · ') });
    FK.stage.degreeLegend(ns);
    FK.stage.showNotes(ns);
    let base;
    if (FK.state.mode === 'piano') base = 60 + pc > 71 ? 48 + pc : 60 + pc;
    else { const tun = FK.guitar.tuning(); base = tun[0] + mod(pc - tun[0]); if (base < tun[0] + 3) base += 12; }
    const ms = ns.map((n) => base + n.semi).concat(base + 12);
    let prev = null;
    const pos = FK.state.mode === 'guitar' ? ms.map((m) => (prev = FK.stage.bestPos(m, prev) || prev)) : [];
    seq(ms, pos);
  }

  function playChordSpec(spec) {
    const [root, suffix] = spec.split(':');
    const c = { rootPc: T.pcOf(root), root, suffix };
    const v = FK.voice.get(c);
    FK.voice.show(c, v);
    FK.voice.play(v);
    const ns = T.chordNotes(root, suffix);
    FK.stage.setInfo({ eyebrow: 'Lesson example · chord', title: T.chordLabel(root, suffix), sub: ns.map((n) => `<b>${T.pretty(n.name)}</b> (${FK.ivLabel(n.deg)})`).join(' · ') });
    FK.stage.degreeLegend(ns);
  }

  function playProg(spec, btn) {
    const [root, mode, rn] = spec.split(':');
    const pc = T.pcOf(root);
    const chords = rn.split(' ').map((r) => T.parseRoman(r, pc, mode)).filter(Boolean);
    let prev = null;
    const vs = chords.map((c) => (prev = FK.voice.get(c, prev)));
    const ns = T.scaleNotes(pc, mode === 'major' ? 'major' : 'minor');
    btn.classList.add('playing');
    const handle = FK.audio.sequence({
      bpm: 110, totalBeats: chords.length * 2 + 1,
      events: chords.map((c, i) => ({
        beat: i * 2,
        play: (w, spb) => FK.voice.play(vs[i], { when: w, dur: spb * 2, flash: false }),
        ui: () => { FK.voice.show(c, vs[i], ns); FK.stage.setInfo({ eyebrow: `Lesson example · ${T.keyName(pc, mode)}`, title: `${c.label} <span class="muted" style="font-weight:600">${T.pretty(rn.split(' ')[i])}</span>`, sub: '' }); },
      })),
      onEnd: () => FK.stopTransport(),
    });
    FK.setTransport(handle, () => btn.classList.remove('playing'));
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.dataset.complete && !st.done.includes(b.dataset.complete)) { st.done.push(b.dataset.complete); save(); }
    if (b.dataset.goto) { FK.showTab(b.dataset.goto, { scroll: true }); return; }
    if (b.dataset.lesson) { st.lesson = b.dataset.lesson; save(); renderNav(); renderLesson(); $('[data-role=lesson]', el).scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (b.dataset.letter) { st.letter = st.letter === b.dataset.letter ? null : b.dataset.letter; $('[data-role=gq]', el).value = ''; renderGlossary(); return; }
    if (b.dataset.notes) return playNotes(b.dataset.notes, b.dataset.how);
    if (b.dataset.scale) return playScale(b.dataset.scale);
    if (b.dataset.chord) return playChordSpec(b.dataset.chord);
    if (b.dataset.prog) return playProg(b.dataset.prog, b);
  }

  function show() {
    if (!el) return;
    renderNav(); renderLesson(); renderGlossary();
    FK.stage.setInfo({ eyebrow: 'Learn', title: FK.LESSONS.find((l) => l.id === st.lesson).title, sub: 'Press the ▶ buttons in the lesson to hear and see each example' });
    FK.stage.setLegend([]);
  }

  FK.panels.learn = { init, show, onMode() { show(); } };
})();
