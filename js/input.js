/* Fret & Key — live instrument input: MIDI devices and audio interfaces (pitch + chord detection) */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const mod = T.mod;

  const cfg = Object.assign({ midiOn: false, midiId: '', midiSound: true, audioOn: false, audioId: '', channel: 'mix', mode: 'auto', gate: 0.012 }, FK.store.get('input', {}));
  // the phone app has no MIDI input
  const midiAllowed = FK.platform.midi && !FK.platform.mobile;
  if (!midiAllowed) cfg.midiOn = false;
  const save = () => FK.store.set('input', cfg);
  const listeners = [];
  const emitState = () => listeners.forEach((fn) => fn(live));

  /* what the player is doing right now */
  const live = {
    notes: new Map(),   // midi -> { vel, source }
    pitch: null,        // { midi, cents, freq } from audio
    chord: null,        // { rootPc, suffix, label, conf } from audio or MIDI notes
    level: 0,
    midiInputs: [],
    audioInputs: [],
    error: null,
  };

  /* ---------------- shared note handling ---------------- */
  function noteOn(midi, vel, source) {
    live.notes.set(midi, { vel, source });
    afterNote(() => {
      FK.emit('input-note', { midi, vel, on: true, source });
      FK.emit('inst-click', { midi, inst: FK.state.mode, source: 'input' });
    }, source);
  }
  function noteOff(midi, source) {
    if (!live.notes.has(midi)) return;
    live.notes.delete(midi);
    afterNote(() => FK.emit('input-note', { midi, on: false, source }), source);
  }
  /* MIDI notes come in bursts (a chord is several messages a millisecond apart). Redrawing the instruments and
     panels after each one held the next note back, so MIDI updates are batched into one pass per frame — the
     sound has already started by then. Audio input stays synchronous: its loop draws its own chord display. */
  const uiQueue = [];
  let uiFrame = null;
  function afterNote(emit, source) {
    if (source !== 'midi') { emit(); flushUi(); return; }
    uiQueue.push(emit);
    if (uiFrame) return;
    uiFrame = document.hidden ? { timer: setTimeout(flushUi, 0) } : { raf: requestAnimationFrame(flushUi) };
  }
  function flushUi() {
    if (uiFrame) { if (uiFrame.raf) cancelAnimationFrame(uiFrame.raf); else clearTimeout(uiFrame.timer); uiFrame = null; }
    uiQueue.splice(0).forEach((fn) => fn());
    showOnInstrument();
    updateChordFromNotes();
    emitState();
  }
  function showOnInstrument() {
    const ms = Array.from(live.notes.keys()).sort((a, b) => a - b);
    FK.piano.setLive(ms);
    FK.guitar.setLive(guitarPositions(ms));
  }
  // audio and MIDI don't say which string — show each note where it's easiest to reach from the last one
  let lastPos = null;
  function guitarPositions(ms) {
    const tun = FK.guitar.tuning(), F = FK.guitar.config().frets;
    const win = FK.guitar.getWindow();
    const used = new Set();
    return ms.map((m) => {
      let best = null, bs = 1e9;
      tun.forEach((open, s) => {
        const f = m - open;
        if (f < 0 || f > F || used.has(s)) return;
        let sc = f * 0.3;
        if (win) sc += f < win.start || f > win.start + win.size - 1 ? 6 : 0;
        if (lastPos) sc += Math.abs(f - lastPos.f) * 0.6;
        if (sc < bs) { bs = sc; best = { s, f }; }
      });
      if (best) { used.add(best.s); lastPos = best; }
      return best;
    }).filter(Boolean);
  }

  /* chord from the notes being held (MIDI, or several audio notes) */
  const QUALS = [['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]], ['m7', [0, 3, 7, 10]], ['dim', [0, 3, 6]], ['aug', [0, 4, 8]],
    ['sus4', [0, 5, 7]], ['sus2', [0, 2, 7]], ['m7b5', [0, 3, 6, 10]], ['dim7', [0, 3, 6, 9]], ['6', [0, 4, 7, 9]], ['m6', [0, 3, 7, 9]], ['add9', [0, 2, 4, 7]], ['5', [0, 7]]];
  function nameChord(pcs, bassPc) {
    const set = new Set(pcs);
    if (set.size < 2) return null;
    let best = null;
    for (let r = 0; r < 12; r++) {
      if (!set.has(r)) continue;
      for (const [suf, iv] of QUALS) {
        const need = iv.map((x) => mod(r + x));
        const hit = need.filter((p) => set.has(p)).length;
        const extra = set.size - hit;
        if (hit < need.length) continue;
        const score = need.length * 2 - extra * 2.5 + (r === bassPc ? 1.5 : 0) - (suf === '5' ? 1.5 : 0);
        if (!best || score > best.score) best = { rootPc: r, suffix: suf, score };
      }
    }
    if (!best) return null;
    const root = T.rootNameFor(best.rootPc, best.suffix.startsWith('m') && !best.suffix.startsWith('maj'));
    const slash = bassPc != null && bassPc !== best.rootPc ? '/' + T.pretty(T.rootNameFor(bassPc, false)) : '';
    return { rootPc: best.rootPc, suffix: best.suffix, label: T.chordLabel(root, best.suffix) + slash, conf: 1 };
  }
  function updateChordFromNotes() {
    const ms = Array.from(live.notes.keys()).sort((a, b) => a - b);
    const c = ms.length >= 2 ? nameChord(ms.map((m) => mod(m)), mod(ms[0])) : null;
    if (c) setChord(c, 'notes');
    else if (!audioChordActive) setChord(null);
  }
  let lastChordKey = '';
  function setChord(c, from) {
    const key = c ? c.label : '';
    live.chord = c;
    if (key !== lastChordKey) { lastChordKey = key; if (c) FK.emit('input-chord', Object.assign({ from }, c)); }
  }

  /* ---------------- MIDI ---------------- */
  let midiAccess = null;
  const sounding = new Map();
  let sustain = false;
  const sustained = new Set();
  async function startMidi() {
    try {
      midiAccess = midiAccess || (await navigator.requestMIDIAccess({ sysex: false }));
    } catch (e) { live.error = 'MIDI is not available: ' + e.message; emitState(); return; }
    // open the audio device now, so the first key you press doesn't wait for it
    if (cfg.midiSound) FK.audio.init();
    const refresh = () => {
      live.midiInputs = Array.from(midiAccess.inputs.values()).map((i) => ({ id: i.id, name: i.name }));
      midiAccess.inputs.forEach((inp) => { inp.onmidimessage = cfg.midiOn && (!cfg.midiId || cfg.midiId === inp.id) ? onMidi : null; });
      emitState();
    };
    midiAccess.onstatechange = refresh;
    refresh();
  }
  function stopMidi() {
    if (midiAccess) midiAccess.inputs.forEach((inp) => { inp.onmidimessage = null; });
    Array.from(live.notes.entries()).filter(([, v]) => v.source === 'midi').forEach(([m]) => noteOff(m, 'midi'));
  }
  function release(m) {
    const v = sounding.get(m);
    if (v && v.stop && FK.audio.ctx) v.stop(FK.audio.ctx.currentTime);
    sounding.delete(m);
  }
  function onMidi(e) {
    const [st, d1, d2] = e.data;
    const type = st & 0xf0;
    if (type === 0x90 && d2 > 0) {
      if (cfg.midiSound) {
        release(d1);
        sounding.set(d1, FK.audio.playMidi(d1, { inst: FK.state.mode, vel: 0.25 + (d2 / 127) * 0.75, dur: 12, live: true }));
      }
      sustained.delete(d1);
      noteOn(d1, d2 / 127, 'midi');
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      if (sustain) sustained.add(d1); else release(d1);
      noteOff(d1, 'midi');
    } else if (type === 0xb0 && d1 === 64) {
      sustain = d2 >= 64;
      if (!sustain) { sustained.forEach(release); sustained.clear(); }
    }
  }

  /* ---------------- audio interface ---------------- */
  let actx = null, stream = null, analyser = null, raf = 0, timeBuf = null, freqBuf = null;
  let audioChordActive = false;
  async function listAudio() {
    try {
      const d = await navigator.mediaDevices.enumerateDevices();
      live.audioInputs = d.filter((x) => x.kind === 'audioinput' && x.deviceId !== 'communications').map((x) => ({ id: x.deviceId, name: x.label || 'Audio input' }));
    } catch (e) { live.audioInputs = []; }
    emitState();
  }
  async function startAudio() {
    stopAudio();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: cfg.audioId ? { exact: cfg.audioId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } },
      });
    } catch (e) { live.error = 'Could not open the audio input: ' + e.message; cfg.audioOn = false; save(); emitState(); return; }
    await listAudio();
    actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    if (actx.state === 'suspended') await actx.resume().catch(() => {});
    const src = actx.createMediaStreamSource(stream);
    analyser = actx.createAnalyser();
    analyser.fftSize = 8192;
    analyser.smoothingTimeConstant = 0;
    if (cfg.channel === 'mix') src.connect(analyser);
    else {
      const split = actx.createChannelSplitter(2);
      src.connect(split);
      split.connect(analyser, cfg.channel === 'right' ? 1 : 0);
    }
    timeBuf = new Float32Array(analyser.fftSize);
    freqBuf = new Float32Array(analyser.frequencyBinCount);
    live.error = null;
    // a timer rather than requestAnimationFrame, so listening continues when the window is hidden or minimised
    raf = setInterval(loop, 33);
  }
  function stopAudio() {
    clearInterval(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (actx) actx.close();
    stream = actx = analyser = null;
    live.pitch = null; live.level = 0;
    if (audioNote != null) { noteOff(audioNote, 'audio'); audioNote = null; }
    audioChordActive = false;
    emitState();
  }

  /* McLeod pitch method on a 2× decimated window: fast and robust for guitar, bass, voice and keys */
  function detectPitch(buf, sr) {
    const n = 2048, dec = new Float32Array(n);
    const off = buf.length - 2 * n;
    for (let i = 0; i < n; i++) dec[i] = (buf[off + 2 * i] + buf[off + 2 * i + 1]) * 0.5;
    const rate = sr / 2;
    const minLag = Math.floor(rate / 1400), maxLag = Math.min(n >> 1, Math.ceil(rate / 38));
    const nsdf = new Float32Array(maxLag + 1);
    for (let tau = minLag; tau <= maxLag; tau++) {
      let ac = 0, m = 0;
      for (let i = 0; i < n - tau; i++) { ac += dec[i] * dec[i + tau]; m += dec[i] * dec[i] + dec[i + tau] * dec[i + tau]; }
      nsdf[tau] = m > 0 ? (2 * ac) / m : 0;
    }
    // first peak after the first zero crossing that reaches 90% of the highest peak
    let maxV = 0;
    const peaks = [];
    let pos = false;
    for (let tau = minLag + 1; tau < maxLag; tau++) {
      if (nsdf[tau - 1] < 0 && nsdf[tau] >= 0) pos = true;
      if (pos && nsdf[tau] > nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1]) { peaks.push(tau); if (nsdf[tau] > maxV) maxV = nsdf[tau]; }
    }
    const tau = peaks.find((t) => nsdf[t] >= 0.9 * maxV);
    if (!tau || maxV < 0.6) return null;
    const a = nsdf[tau - 1], b = nsdf[tau], c = nsdf[tau + 1], den = a - 2 * b + c;
    const t = tau + (den ? (0.5 * (a - c)) / den : 0);
    let freq = rate / t;
    if (freq > 380) freq = refineHigh(buf, sr, freq) || freq;
    const midiF = 69 + 12 * Math.log2(freq / 440);
    const midi = Math.round(midiF);
    return { freq, midi, cents: Math.round((midiF - midi) * 100), clarity: maxV };
  }

  /* high notes have few samples per cycle after decimation — re-check at full rate (also catches octave slips) */
  function refineHigh(buf, sr, guess) {
    const n = 2048, off = buf.length - n;
    const lo = Math.floor(sr / Math.min(1800, guess * 2.2)), hi = Math.ceil(sr / (guess * 0.45));
    let best = 0, bestTau = 0;
    const nsdf = new Float32Array(hi + 2);
    for (let tau = lo; tau <= hi + 1; tau++) {
      let ac = 0, m = 0;
      for (let i = 0; i < n - tau; i++) { const a = buf[off + i], b = buf[off + i + tau]; ac += a * b; m += a * a + b * b; }
      nsdf[tau] = m > 0 ? (2 * ac) / m : 0;
    }
    for (let tau = lo + 1; tau <= hi; tau++) if (nsdf[tau] > nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1] && nsdf[tau] > best) { best = nsdf[tau]; bestTau = tau; }
    // prefer the shortest period that is almost as strong (the true fundamental, not a sub-octave)
    for (let tau = lo + 1; tau < bestTau; tau++) if (nsdf[tau] > nsdf[tau - 1] && nsdf[tau] >= nsdf[tau + 1] && nsdf[tau] >= 0.92 * best) { bestTau = tau; break; }
    if (!bestTau) return null;
    const a = nsdf[bestTau - 1], b = nsdf[bestTau], c = nsdf[bestTau + 1], den = a - 2 * b + c;
    return sr / (bestTau + (den ? (0.5 * (a - c)) / den : 0));
  }

  /* chroma from the spectrum (fundamental region weighted, overtones damped) → chord templates */
  function detectChord(spec, sr, fft) {
    const binHz = sr / fft;
    const lin = new Float32Array(12);
    const ampAt = (k) => Math.pow(10, spec[k] / 20);
    let total = 0;
    const lo = Math.ceil(70 / binHz), hi = Math.floor(1300 / binHz);
    for (let k = lo; k <= hi; k++) {
      const v = ampAt(k);
      if (v < 1e-4 || !(spec[k] > spec[k - 1] && spec[k] >= spec[k + 1])) continue;
      const midiF = 69 + 12 * Math.log2((k * binHz) / 440);
      const w = Math.pow(Math.cos(Math.PI * (midiF - Math.round(midiF))), 2) * (k * binHz < 500 ? 1 : 0.6);
      lin[mod(Math.round(midiF))] += v * w;
      total += v * w;
    }
    if (total <= 0) return null;
    const norm = Array.from(lin, (v) => v / total);
    let best = null;
    for (let r = 0; r < 12; r++) for (const [suf, iv] of QUALS.slice(0, 10)) {
      const inside = iv.reduce((s, x) => s + norm[mod(r + x)], 0);
      // a 7th must be clearly present — overtones of the 3rd and 5th easily fake one
      const sev = iv.length > 3 ? norm[mod(r + iv[3])] : 0;
      const score = inside - (1 - inside) * 0.9 - (iv.length > 3 ? (sev > 0.12 ? 0.06 : 0.2) : 0) + norm[r] * 0.25;
      if (!best || score > best.score) best = { rootPc: r, suffix: suf, score, inside };
    }
    const strong = norm.filter((v) => v > 0.08).length;
    return best && best.inside > 0.62 && strong >= 3 ? best : null;
  }

  let audioNote = null, stableMidi = null, stableCount = 0, chordStable = null, chordCount = 0, frame = 0;
  function loop() {
    if (!analyser) return;
    frame++;
    analyser.getFloatTimeDomainData(timeBuf);
    let rms = 0;
    for (let i = timeBuf.length - 4096; i < timeBuf.length; i++) rms += timeBuf[i] * timeBuf[i];
    rms = Math.sqrt(rms / 4096);
    live.level = Math.min(1, rms * 8);
    const gate = cfg.gate;
    if (rms < gate) {
      if (audioNote != null && rms < gate * 0.6) { noteOff(audioNote, 'audio'); audioNote = null; }
      if (audioChordActive && rms < gate * 0.6) { audioChordActive = false; setChord(null); }
      live.pitch = null; stableCount = 0; chordCount = 0;
      emitState();
      return;
    }
    const sr = actx.sampleRate;
    let chord = null;
    if (cfg.mode !== 'notes') {
      analyser.getFloatFrequencyData(freqBuf);
      chord = detectChord(freqBuf, sr, analyser.fftSize);
    }
    if (chord && cfg.mode !== 'notes') {
      const key = chord.rootPc + chord.suffix;
      chordCount = key === chordStable ? chordCount + 1 : 1;
      chordStable = key;
      if (chordCount >= 3) {
        audioChordActive = true;
        const root = T.rootNameFor(chord.rootPc, chord.suffix.startsWith('m') && !chord.suffix.startsWith('maj'));
        setChord({ rootPc: chord.rootPc, suffix: chord.suffix, label: T.chordLabel(root, chord.suffix), conf: chord.inside }, 'audio');
        if (audioNote != null) { noteOff(audioNote, 'audio'); audioNote = null; }
        live.pitch = null;
        const pcs = new Set(QUALS.find(([s]) => s === chord.suffix)[1].map((x) => mod(chord.rootPc + x)));
        FK.piano.setLive(Array.from(pcs).map((p) => 48 + p + (p < 4 ? 12 : 0)));
        emitState();
        return;
      }
    }
    if (cfg.mode === 'chords') { emitState(); return; }
    // in auto mode a chord that is still settling shouldn't be mistaken for a single (often octave-wrong) note
    if (chord && cfg.mode === 'auto') { live.pitch = null; emitState(); return; }
    const p = detectPitch(timeBuf, sr);
    live.pitch = p;
    if (p) {
      stableCount = p.midi === stableMidi ? stableCount + 1 : 1;
      stableMidi = p.midi;
      if (stableCount >= 2 && p.midi !== audioNote) {
        if (audioNote != null) noteOff(audioNote, 'audio');
        audioNote = p.midi;
        audioChordActive = false;
        noteOn(p.midi, Math.min(1, rms * 10), 'audio');
      }
    }
    emitState();
  }

  /* ---------------- public ---------------- */
  FK.input = {
    live, cfg,
    onChange(fn) { listeners.push(fn); },
    async setMidi(on, id) {
      if (!midiAllowed) on = false;
      cfg.midiOn = on; if (id != null) cfg.midiId = id; save();
      if (on) await startMidi(); else stopMidi();
      if (on && midiAccess) midiAccess.onstatechange();
      emitState();
    },
    setMidiSound(on) { cfg.midiSound = on; save(); },
    async setAudio(on, opts = {}) {
      Object.assign(cfg, opts); cfg.audioOn = on; save();
      if (on) await startAudio(); else stopAudio();
      emitState();
    },
    setMode(m) { cfg.mode = m; save(); },
    setGate(g) { cfg.gate = g; save(); },
    listAudio,
    active: () => cfg.midiOn || cfg.audioOn,
    _detect: { pitch: (buf, sr) => detectPitch(buf, sr), chord: (spec, sr, n) => detectChord(spec, sr, n), midi: (bytes) => onMidi({ data: bytes }) },
    nameChord,
    /* does what's being played match a chord? */
    matches(rootPc, suffix) {
      const want = new Set(T.chordDef(suffix).degs.map((d) => mod(rootPc + d.semi)));
      if (live.chord) {
        if (live.chord.rootPc === rootPc && T.triadClass(T.chordDef(live.chord.suffix) || T.chordDef('')) === T.triadClass(T.chordDef(suffix))) return true;
      }
      const held = Array.from(live.notes.keys()).map((m) => mod(m));
      return held.length >= 2 && held.every((p) => want.has(p)) && held.includes(rootPc);
    },
    async init() {
      if (cfg.midiOn) await startMidi();
      if (cfg.audioOn) await startAudio();
      if (!navigator.mediaDevices) return;
      navigator.mediaDevices.addEventListener('devicechange', listAudio);
    },
  };
})();
