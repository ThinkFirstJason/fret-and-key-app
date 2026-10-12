/* Fret & Key — instrument input panel (MIDI + audio interface), live readout and play-checks */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const mod = T.mod;
  const $ = FK.$;
  const esc = FK.esc;

  let panel, hud, btn, dot, open = false, lastDevices = '';

  function deviceSig() { const l = FK.input.live; return JSON.stringify([l.midiInputs, l.audioInputs, FK.input.cfg.midiOn, FK.input.cfg.audioOn, l.error]); }

  function render() {
    const { cfg, live } = FK.input;
    lastDevices = deviceSig();
    panel.innerHTML = `
      <div class="row"><h4 style="margin:0">Play your instrument</h4><span class="spacer"></span><button class="btn small ghost" data-in="close">✕</button></div>
      <p class="muted" style="font-size:13px;margin:6px 0 0">What you play lights up on the ${FK.state.mode === 'guitar' ? 'fretboard' : 'keyboard'} and is checked against the scale, chord or song on screen.</p>
      ${live.error ? `<div class="note-box" style="border-color:var(--pink)">${esc(live.error)}</div>` : ''}
      ${FK.platform.mobile || !FK.platform.midi ? '' : `<div class="eyebrow">MIDI keyboard / guitar</div>
      <label class="switch"><input type="checkbox" data-in="midi" ${cfg.midiOn ? 'checked' : ''}> Listen to MIDI</label>
      ${cfg.midiOn ? `<div class="row" style="margin-top:8px">
        <select data-in="midi-dev" style="flex:1;min-width:180px">${live.midiInputs.length ? `<option value="">All MIDI devices</option>${live.midiInputs.map((d) => `<option value="${esc(d.id)}" ${cfg.midiId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}` : '<option>No MIDI devices found — plug one in</option>'}</select>
        <label class="switch"><input type="checkbox" data-in="midi-sound" ${cfg.midiSound ? 'checked' : ''}> Play sound</label></div>` : ''}`}
      <div class="eyebrow">${FK.platform.mobile ? 'Microphone' : 'Audio interface / microphone'}</div>
      <label class="switch"><input type="checkbox" data-in="audio" ${cfg.audioOn ? 'checked' : ''}> Listen to audio input</label>
      ${cfg.audioOn ? `
        <div class="row" style="margin-top:8px">
          <select data-in="audio-dev" style="flex:1;min-width:180px">${live.audioInputs.map((d) => `<option value="${esc(d.id)}" ${cfg.audioId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('') || '<option>Default input</option>'}</select>
          <div class="seg" title="Which input of the interface your instrument is plugged into">${[['left', 'In 1'], ['right', 'In 2'], ['mix', 'Both']].map(([v, l]) => `<button data-in-ch="${v}" class="${cfg.channel === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        </div>
        <div class="row" style="margin-top:10px">
          <div class="seg">${[['auto', 'Auto'], ['notes', 'Single notes'], ['chords', 'Chords']].map(([v, l]) => `<button data-in-mode="${v}" class="${cfg.mode === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="spacer"></span>
        </div>
        <div class="range-row" style="margin-top:10px"><span class="muted" style="font-size:13px">Sensitivity</span><input type="range" data-in="gate" min="0.002" max="0.06" step="0.001" value="${0.062 - cfg.gate}"><div class="level"><i data-in="level"></i></div></div>
        <div class="tuner" data-in="tuner"></div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">Tip: turn off amp effects (distortion, chorus) for the best note detection. A direct guitar input works better than a microphone.</p>` : ''}`;
    renderLive();
  }

  function renderLive() {
    const { live, cfg } = FK.input;
    const lv = panel && panel.querySelector('[data-in=level]');
    if (lv) lv.style.width = Math.round(live.level * 100) + '%';
    const tuner = panel && panel.querySelector('[data-in=tuner]');
    if (tuner) {
      const p = live.pitch;
      tuner.innerHTML = p ? `<b>${T.pretty(T.midiName(p.midi))}</b><div class="cents"><i style="left:${50 + p.cents}%" class="${Math.abs(p.cents) <= 5 ? 'ok' : ''}"></i></div><span>${p.cents > 0 ? '+' : ''}${p.cents}¢ · ${p.freq.toFixed(1)} Hz</span>`
        : live.chord ? `<b>${live.chord.label}</b><span>chord</span>` : '<span class="muted">Play something…</span>';
    }
    // floating readout on the instrument
    const active = FK.input.active();
    hud.hidden = !active;
    dot.classList.toggle('on', active);
    if (!active) return;
    const held = Array.from(live.notes.keys()).sort((a, b) => a - b);
    const marked = markedPcs();
    let fit = '';
    if (held.length && marked.size) {
      const inn = held.filter((m) => marked.has(mod(m))).length;
      fit = inn === held.length ? '<span class="fit ok">✓ on the chart</span>' : `<span class="fit bad">✗ ${T.pretty(T.SHARP_NAMES[mod(held.find((m) => !marked.has(mod(m))))])} isn't on the chart</span>`;
    }
    const icon = cfg.audioOn ? '🎸' : '🎹';
    const noteTxt = live.pitch && cfg.audioOn ? `${T.pretty(T.midiName(live.pitch.midi))} <small>${live.pitch.cents > 0 ? '+' : ''}${live.pitch.cents}¢</small>` : held.length ? held.map((m) => T.pretty(T.midiName(m))).join(' ') : '<span class="muted">listening…</span>';
    hud.innerHTML = `<span class="hud-i">${icon}</span><span>${noteTxt}</span>${live.chord ? `<span class="hud-chord">${live.chord.label}</span>` : ''}${fit}<span class="hud-level"><i style="width:${Math.round(live.level * 100)}%"></i></span>`;
  }

  function markedPcs() {
    return FK.state.mode === 'guitar' ? FK.guitar.markedPcs() : FK.piano.markedPcs();
  }

  /* chord tab: celebrate when the player plays the chord on screen */
  let lastPraise = '';
  function checkChordTab() {
    if (FK.state.tab !== 'chords' || !FK.panels.chords.current) return;
    const cur = FK.panels.chords.current();
    const key = cur.rootPc + cur.suffix;
    if (FK.input.matches(cur.rootPc, cur.suffix)) {
      if (lastPraise !== key) { lastPraise = key; FK.toast('✓ Nice — that’s ' + cur.label + '!'); }
    } else if (!FK.input.live.notes.size && !FK.input.live.chord) lastPraise = '';
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.in === 'close') return toggle(false);
    if (b.dataset.inCh) { FK.input.setAudio(true, { channel: b.dataset.inCh }).then(render); return; }
    if (b.dataset.inMode) { FK.input.setMode(b.dataset.inMode); render(); }
  }
  async function onChange(e) {
    const t = e.target;
    if (t.dataset.in === 'midi') { await FK.input.setMidi(t.checked); render(); }
    else if (t.dataset.in === 'midi-dev') { await FK.input.setMidi(true, t.value); }
    else if (t.dataset.in === 'midi-sound') FK.input.setMidiSound(t.checked);
    else if (t.dataset.in === 'audio') { panel.querySelector('[data-in=audio]').disabled = true; await FK.input.setAudio(t.checked); render(); }
    else if (t.dataset.in === 'audio-dev') { await FK.input.setAudio(true, { audioId: t.value }); render(); }
  }
  function onInput(e) {
    if (e.target.dataset.in === 'gate') FK.input.setGate(0.062 - +e.target.value);
  }

  function toggle(on) {
    open = on == null ? !open : on;
    panel.hidden = !open;
    btn.classList.toggle('on', open);
    if (open) { FK.input.listAudio(); render(); }
  }

  FK.initInput = function () {
    panel = $('#inputPanel'); hud = $('#inputHud'); btn = $('#inputBtn'); dot = $('#inputDot');
    btn.addEventListener('click', () => toggle());
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
    panel.addEventListener('input', onInput);
    FK.input.onChange(() => {
      if (open && deviceSig() !== lastDevices) render(); else if (open) renderLive(); else renderLive();
      checkChordTab();
    });
    FK.on('mode', () => { if (open) render(); });
    FK.input.init().then(renderLive);
  };
})();
