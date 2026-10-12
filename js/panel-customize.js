/* Fret & Key — Customize the guitar and piano */
(function () {
  'use strict';
  const FK = window.FK;
  const $ = FK.$, $$ = FK.$$;
  let el = null;

  const pills = (key, entries, cur, swatch) => `<div class="pill-opts" data-key="${key}">${entries.map(([v, label, color]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${swatch && color ? `<i style="background:${color}"></i>` : ''}${label}</button>`).join('')}</div>`;

  function init(root) {
    el = root;
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
  }

  function finishSwatch(f) {
    if (f.type === 'burst') return `radial-gradient(circle at 55% 50%, ${f.c[0]} 25%, ${f.c[1]} 60%, ${f.c[2]})`;
    if (f.type === 'metallic') return `linear-gradient(135deg, ${FK.guitar.shade(f.c[0], 0.4)}, ${f.c[0]} 50%, ${FK.guitar.shade(f.c[0], -0.45)})`;
    if (f.type === 'trans') return `repeating-linear-gradient(100deg, ${f.c[0]} 0 6px, ${FK.guitar.shade(f.c[0], -0.12)} 6px 9px)`;
    return f.c[0];
  }

  function guitarUI() {
    const G = FK.guitar, c = G.config();
    const fin = G.finishOf();
    const silColor = fin.type === 'burst' ? fin.c[1] : fin.c[0];
    const tone = FK.audio.isAutoTone('guitar') ? 'auto' : FK.audio.getTone('guitar');
    return `
      <div class="cust-grid">
        <div class="card">
          <div class="eyebrow"><span class="num">01</span> Body style</div>
          <div class="opt-grid" data-key="style">${Object.entries(G.STYLES).map(([id, s]) => `<button class="opt-card ${c.style === id ? 'on' : ''}" data-v="${id}">${G.silhouette(id, silColor)}<b>${s.name}</b><small>${s.sub}</small></button>`).join('')}</div>
          <div class="eyebrow"><span class="num">02</span> Finish</div>
          <div class="swatches" data-key="finish">${G.FINISHES.map((f) => `<button class="swatch ${c.finish === f.id ? 'on' : ''}" data-v="${f.id}" title="${f.name}" style="background:${finishSwatch(f)}"></button>`).join('')}
            <button class="swatch ${c.finish === 'custom' ? 'on' : ''}" data-v="custom" title="Custom colour" style="background:conic-gradient(#ff6b57,#ffcf56,#9ad65b,#2ec4b6,#4cc9f0,#a08bff,#ff5fa2,#ff6b57)"></button></div>
          <div class="swatch-label">${fin.name}</div>
          ${c.finish === 'custom' ? `<div class="row" style="margin-top:10px">
            <label class="field">Colour<input type="color" data-cfg="customColor" value="${c.customColor}"></label>
            <label class="field">Burst edge<input type="color" data-cfg="customColor2" value="${c.customColor2}"></label>
            <label class="field">Type<select data-cfg="customType" style="height:38px">${[['solid', 'Solid gloss'], ['metallic', 'Metallic'], ['burst', 'Burst'], ['trans', 'Transparent (wood grain)']].map(([v, l]) => `<option value="${v}" ${c.customType === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>` : ''}
          <div class="eyebrow"><span class="num">03</span> Pickguard</div>
          ${pills('pickguard', Object.entries(G.PICKGUARDS).map(([k, v]) => [k, v.name, v.fill || 'transparent']), c.pickguard, true)}
          <div class="eyebrow">Headstock face</div>
          ${pills('headFace', Object.entries(G.HEAD_FACES), c.headFace)}
        </div>
        <div class="card c-teal">
          <div class="eyebrow"><span class="num">04</span> Fretboard</div>
          ${pills('board', Object.entries(G.BOARDS).map(([k, v]) => [k, v.name, v.c1]), c.board, true)}
          <div class="eyebrow">Inlays</div>
          ${pills('inlay', Object.entries(G.INLAYS), c.inlay)}
          <div class="eyebrow">Inlay material</div>
          ${pills('inlayMat', Object.entries(G.INLAY_MATS).map(([k, v]) => [k, v.name, v.fill]), c.inlayMat, true)}
          <div class="row" style="margin-top:12px"><label class="switch"><input type="checkbox" data-cfg="binding" ${c.binding ? 'checked' : ''}> Cream binding</label></div>
          <div class="eyebrow"><span class="num">05</span> Hardware</div>
          ${pills('hardware', Object.entries(G.HARDWARE).map(([k, v]) => [k, v.name, v.b]), c.hardware, true)}
        </div>
        <div class="card c-violet">
          <div class="eyebrow"><span class="num">06</span> Setup</div>
          <label class="field">Tuning<select data-cfg="tuning">${Object.entries(G.TUNINGS).map(([k, v]) => `<option value="${k}" ${c.tuning === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
          <label class="field" style="margin-top:12px">Frets<select data-cfg="frets">${[12, 15, 19, 20, 21, 22, 24].map((n) => `<option value="${n}" ${c.frets === n ? 'selected' : ''}>${n} frets</option>`).join('')}</select></label>
          <div class="row" style="margin-top:14px;gap:18px">
            <label class="switch"><input type="checkbox" data-cfg="lefty" ${c.lefty ? 'checked' : ''}> Left-handed</label>
            <label class="switch"><input type="checkbox" data-cfg="flip" ${c.flip ? 'checked' : ''}> Low string on top</label>
          </div>
          <div class="eyebrow"><span class="num">07</span> Sound</div>
          ${pills('gtone', [['auto', 'Match the body']].concat(Object.entries(FK.audio.GTONES).map(([k, v]) => [k, v.name])), tone)}
          <div class="row" style="margin-top:14px"><button class="btn small" data-act="test-g">▶ Test strum</button></div>
          <div class="eyebrow">Presets</div>
          <div class="row">
            <button class="btn small" data-preset="vintage">’59 Burst</button>
            <button class="btn small" data-preset="surf">Surf Strat</button>
            <button class="btn small" data-preset="twang">Butterscotch T</button>
            <button class="btn small" data-preset="metal">Metal SG</button>
            <button class="btn small" data-preset="campfire">Campfire</button>
            <button class="btn small" data-preset="random">🎲 Surprise me</button>
            <button class="btn small ghost" data-act="reset-g">Reset</button>
          </div>
        </div>
      </div>`;
  }

  function pianoUI() {
    const P = FK.piano, c = P.config();
    const tone = FK.audio.isAutoTone('piano') ? 'auto' : FK.audio.getTone('piano');
    return `
      <div class="cust-grid">
        <div class="card c-violet">
          <div class="eyebrow"><span class="num">01</span> Instrument</div>
          <div class="opt-grid" data-key="pstyle">${Object.entries(P.STYLES).map(([id, s]) => `<button class="opt-card ${c.style === id ? 'on' : ''}" data-v="${id}"><div class="pmini" style="background:${s.case}">${'<i></i>'.repeat(9)}</div><b>${s.name}</b><small>${s.sub}</small></button>`).join('')}</div>
        </div>
        <div class="card c-teal">
          <div class="eyebrow"><span class="num">02</span> Colours</div>
          <div class="row">
            <label class="field">Case colour<input type="color" data-pcfg="caseColor" value="${c.caseColor || P.STYLES[c.style].case}"></label>
            <label class="field">Key felt<input type="color" data-pcfg="felt" value="${c.felt || P.STYLES[c.style].felt}"></label>
            <button class="btn small ghost" data-act="pcolors" style="align-self:flex-end">Use style colours</button>
          </div>
          <div class="eyebrow">Keys</div>
          ${pills('pkeys', [['auto', 'Style default']].concat(Object.entries(P.KEY_STYLES)), c.keys)}
          <div class="eyebrow"><span class="num">03</span> Size</div>
          <select data-pcfg="range">${Object.entries(P.RANGES).map(([k, v]) => `<option value="${k}" ${c.range === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select>
        </div>
        <div class="card">
          <div class="eyebrow"><span class="num">04</span> Sound</div>
          ${pills('ptone', [['auto', 'Match the instrument']].concat(Object.entries(FK.audio.PTONES).map(([k, v]) => [k, v.name])), tone)}
          <div class="row" style="margin-top:14px"><button class="btn small" data-act="test-p">▶ Test chord</button><button class="btn small ghost" data-act="reset-p">Reset piano</button></div>
          <p class="muted" style="font-size:13px;margin-top:14px">Tip: play with your computer keyboard — <kbd>A</kbd>–<kbd>K</kbd> are white keys, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> black keys, <kbd>Z</kbd>/<kbd>X</kbd> change octave.</p>
        </div>
      </div>`;
  }

  const PRESETS = {
    vintage: { style: 'lespaul', finish: 'honeyburst', pickguard: 'parchment', board: 'rosewood', inlay: 'trapezoid', inlayMat: 'pearl', hardware: 'chrome', binding: true, headFace: 'auto' },
    surf: { style: 'strat', finish: 'seafoam', pickguard: 'tortoise', board: 'rosewood', inlay: 'dots', inlayMat: 'pearl', hardware: 'chrome', binding: false, headFace: 'match' },
    twang: { style: 'tele', finish: 'butterscotch', pickguard: 'black', board: 'maple', inlay: 'dots', inlayMat: 'black', hardware: 'chrome', binding: false, headFace: 'neck' },
    metal: { style: 'sg', finish: 'black', pickguard: 'black', board: 'ebony', inlay: 'sharks', inlayMat: 'glow', hardware: 'black', binding: true, headFace: 'black' },
    campfire: { style: 'dread', finish: 'natural', pickguard: 'tortoise', board: 'rosewood', inlay: 'dots', inlayMat: 'abalone', hardware: 'gold', binding: true, headFace: 'auto' },
  };

  function randomPreset() {
    const G = FK.guitar;
    const pick = (o) => FK.pick(Object.keys(o));
    return { style: pick(G.STYLES), finish: FK.pick(G.FINISHES).id, pickguard: pick(G.PICKGUARDS), board: pick(G.BOARDS), inlay: pick(G.INLAYS), inlayMat: pick(G.INLAY_MATS), hardware: pick(G.HARDWARE), binding: Math.random() < 0.4 };
  }

  function testGuitar() {
    const v = FK.voice.guitar(4, '', null);
    if (v) FK.voice.play(v);
  }
  function testPiano() { FK.audio.playChord([48, 55, 64, 67, 72], { inst: 'piano', dur: 2.5 }); [48, 55, 64, 67, 72].forEach((m) => FK.piano.flash(m)); }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    const group = b.closest('[data-key]');
    if (group && b.dataset.v != null) {
      const key = group.dataset.key, v = b.dataset.v;
      if (key === 'gtone') { FK.audio.setTone('guitar', v === 'auto' ? null : v); render(); testGuitar(); return; }
      if (key === 'ptone') { FK.audio.setTone('piano', v === 'auto' ? null : v); render(); testPiano(); return; }
      if (key === 'pstyle') { FK.piano.set({ style: v, caseColor: '', felt: '' }); render(); return; }
      if (key === 'pkeys') { FK.piano.set({ keys: v }); render(); return; }
      FK.guitar.set({ [key]: v });
      render();
      if (key === 'style') testGuitar();
      return;
    }
    if (b.dataset.preset) { FK.guitar.set(b.dataset.preset === 'random' ? randomPreset() : PRESETS[b.dataset.preset]); render(); testGuitar(); return; }
    const a = b.dataset.act;
    if (a === 'test-g') testGuitar();
    else if (a === 'test-p') testPiano();
    else if (a === 'reset-g') { FK.guitar.reset(); FK.audio.setTone('guitar', null); render(); }
    else if (a === 'reset-p') { FK.piano.reset(); FK.audio.setTone('piano', null); render(); }
    else if (a === 'pcolors') { FK.piano.set({ caseColor: '', felt: '' }); render(); }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.cfg) {
      const k = t.dataset.cfg;
      const v = t.type === 'checkbox' ? t.checked : k === 'frets' ? +t.value : t.value;
      FK.guitar.set({ [k]: v });
      if (k === 'tuning') render();
    }
    if (t.dataset.pcfg) FK.piano.set({ [t.dataset.pcfg]: t.value });
  }
  let colorTimer;
  function onInput(e) {
    const t = e.target;
    if (t.type !== 'color') return;
    clearTimeout(colorTimer);
    colorTimer = setTimeout(() => {
      if (t.dataset.cfg) FK.guitar.set({ [t.dataset.cfg]: t.value, finish: 'custom' });
      if (t.dataset.pcfg) FK.piano.set({ [t.dataset.pcfg]: t.value });
    }, 60);
  }

  function render() {
    el.innerHTML = FK.state.mode === 'guitar' ? guitarUI() : pianoUI();
  }

  function show() {
    if (!el) return;
    render();
    showStage();
  }

  function showStage() {
    // show something pretty on the instrument while customizing
    const ns = FK.theory.scaleNotes(4, 'minPent');
    FK.stage.setInfo({ eyebrow: 'Customize', title: FK.state.mode === 'guitar' ? 'Build your guitar' : 'Build your keyboard', sub: 'Every change is saved automatically' });
    FK.stage.degreeLegend(ns);
    FK.stage.showNotes(ns, FK.state.mode === 'guitar' ? { window: { start: 0, size: 4 } } : undefined);
  }

  FK.panels.customize = { init, show, onInstrumentChange: showStage };
})();
