/* Fret & Key — Web Audio engine: plucked-string guitar, synthesized keys, metronome, scheduler */
(function () {
  'use strict';
  const FK = (window.FK = window.FK || {});
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  let ctx = null, bus, liveBus, comp, master, wet, instGain, clickGain, trackGain;
  // mixer: master = whole program; inst = guitar/keys/MIDI sounds; click = metronome; tracks = your recordings
  const legacy = FK.store.get('volume', null);
  const levels = Object.assign({ master: 0.9, inst: legacy != null ? legacy : 0.8, click: 0.7, tracks: 1 }, FK.store.get('mix', {}));
  const mediaNodes = new WeakMap();
  const voices = new Set();
  const chains = {};

  function init() {
    if (ctx) {
      // iPhone also "interrupts" the context (calls, Siri, switching apps)
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume();
      return ctx;
    }
    // iPhone: play through the ring/silent switch like a music app
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = levels.master;
    instGain = ctx.createGain(); instGain.gain.value = levels.inst;
    clickGain = ctx.createGain(); clickGain.gain.value = levels.click;
    trackGain = ctx.createGain(); trackGain.gain.value = levels.tracks;
    instGain.connect(master); clickGain.connect(master); trackGain.connect(master);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    bus = ctx.createGain();
    const rev = ctx.createConvolver();
    rev.buffer = impulse(2.4, 3);
    wet = ctx.createGain();
    wet.gain.value = 0.16;
    bus.connect(comp);
    bus.connect(rev); rev.connect(wet); wet.connect(comp);
    comp.connect(instGain); master.connect(ctx.destination);
    // live notes (MIDI) skip the compressor, whose built-in lookahead delays everything by ~6 ms;
    // a soft limiter with no lookahead keeps big chords from clipping instead
    liveBus = ctx.createGain();
    const limit = ctx.createWaveShaper();
    const curve = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) {
      const x = (i / 2047.5) - 1, a = Math.abs(x);
      curve[i] = a < 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4));
    }
    limit.curve = curve; limit.oversample = 'none';
    liveBus.connect(limit); limit.connect(instGain);
    liveBus.connect(rev);
    loadSamples(pianoTone());
    return ctx;
  }

  function impulse(sec, decay) {
    const sr = ctx.sampleRate, len = Math.floor(sr * sec);
    const b = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function track(voice) {
    voices.add(voice);
    setTimeout(() => voices.delete(voice), (voice.end - ctx.currentTime + 0.5) * 1000);
    return voice;
  }

  /* ---------------- Guitar: Karplus–Strong ---------------- */
  const GTONES = {
    acoustic: { name: 'Steel acoustic', bright: 0.55, t60: 3.2, pick: 0.14, gain: 0.95 },
    nylon: { name: 'Nylon classical', bright: 0.26, t60: 2.6, pick: 0.2, gain: 1.1 },
    electric: { name: 'Clean electric', bright: 0.68, t60: 4.4, pick: 0.11, gain: 0.85 },
    overdrive: { name: 'Overdriven', bright: 0.72, t60: 5.2, pick: 0.1, gain: 0.6 },
  };
  const KS_SR = 24000;
  const ksCache = new Map();

  function ksBuffer(midi, toneId) {
    const key = toneId + ':' + midi;
    if (ksCache.has(key)) return ksCache.get(key);
    const T = GTONES[toneId];
    const sr = KS_SR;
    const f = freq(midi);
    const t60 = T.t60 * Math.max(0.45, 1.25 - (midi - 40) / 55);
    const dur = Math.min(t60 * 1.05, 4.6);
    const len = Math.floor(sr * dur);
    const out = new Float32Array(len);
    const p = sr / f - 0.5;
    const N = Math.ceil(p) + 1;
    const a = 0.08 + T.bright * 0.85;
    let lp = 0;
    const exc = new Float32Array(N);
    for (let i = 0; i < N; i++) { lp += a * (Math.random() * 2 - 1 - lp); exc[i] = lp; }
    const pk = Math.max(1, Math.round(N * T.pick));
    let mean = 0;
    for (let i = 0; i < N; i++) { out[i] = exc[i] - (i >= pk ? exc[i - pk] * 0.9 : 0); mean += out[i]; }
    mean /= N;
    for (let i = 0; i < N; i++) out[i] -= mean;
    const R = Math.pow(0.001, 1 / (f * t60));
    for (let n = N; n < len; n++) {
      const d = n - p;
      const i0 = Math.floor(d);
      const fr = d - i0;
      const s1 = out[i0] + (out[i0 + 1] - out[i0]) * fr;
      const s0 = out[i0 - 1] + (out[i0] - out[i0 - 1]) * fr;
      out[n] = R * 0.5 * (s1 + s0);
    }
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    const g = 0.6 / (peak || 1);
    const fade = Math.min(len, 1800);
    for (let i = 0; i < len; i++) {
      let v = out[i] * g;
      if (i < 24) v *= i / 24;
      if (i > len - fade) v *= (len - i) / fade;
      out[i] = v;
    }
    const buf = ctx.createBuffer(1, len, sr);
    buf.copyToChannel ? buf.copyToChannel(out, 0) : buf.getChannelData(0).set(out);
    if (ksCache.size > 70) ksCache.delete(ksCache.keys().next().value);
    ksCache.set(key, buf);
    return buf;
  }

  function guitarChain(toneId, out) {
    const key = toneId + (out === liveBus ? ':live' : '');
    if (chains[key]) return chains[key];
    const nodes = [];
    const biq = (type, f, gain = 0, q = 1) => {
      const b = ctx.createBiquadFilter();
      b.type = type; b.frequency.value = f; b.gain.value = gain; b.Q.value = q;
      nodes.push(b); return b;
    };
    if (toneId === 'acoustic') {
      biq('peaking', 110, 4, 1.2); biq('peaking', 2600, 2, 0.8); biq('highshelf', 5200, 2);
    } else if (toneId === 'nylon') {
      biq('peaking', 150, 3, 1); biq('lowpass', 3600, 0, 0.6);
    } else if (toneId === 'electric') {
      biq('highpass', 70, 0, 0.7); biq('peaking', 1200, 1.5, 0.8); biq('lowpass', 5600, 0, 0.7);
    } else {
      biq('highpass', 90, 0, 0.7);
      const pre = ctx.createGain(); pre.gain.value = 5; nodes.push(pre);
      const ws = ctx.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < 2048; i++) { const x = (i / 1023.5) - 1; curve[i] = Math.tanh(x * 2.6); }
      ws.curve = curve; ws.oversample = '2x'; nodes.push(ws);
      biq('peaking', 800, 3, 0.9); biq('lowpass', 3800, 0, 0.8);
      const post = ctx.createGain(); post.gain.value = 0.32; nodes.push(post);
    }
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    nodes[nodes.length - 1].connect(out);
    chains[key] = nodes[0];
    return nodes[0];
  }

  function playGuitar(midi, when, dur, vel, toneId, dest) {
    const T = GTONES[toneId] || GTONES.acoustic;
    const buf = ksBuffer(midi, toneId);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const level = vel * T.gain;
    g.gain.value = level;
    src.connect(g); g.connect(guitarChain(toneId, dest));
    src.start(when);
    let end = when + buf.duration;
    if (dur && dur < buf.duration) {
      g.gain.setValueAtTime(level, when + dur);
      g.gain.setTargetAtTime(0, when + dur, 0.07);
      end = when + dur + 0.5;
      src.stop(end);
    }
    return track({ end, stop: (t) => { try { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.03); src.stop(t + 0.2); } catch (e) { /* already stopped */ } } });
  }

  /* ---------------- Keys: grand, electric piano, organ, synth ---------------- */
  const PTONES = {
    grand: { name: 'Grand piano', sampled: true },
    upright: { name: 'Upright piano', sampled: true },
    synthpiano: { name: 'Synth piano' },
    epiano: { name: 'Electric piano' },
    organ: { name: 'Drawbar organ' },
    synth: { name: 'Analog synth' },
  };

  /* ---------------- Sampled pianos ---------------- */
  // recordings of real instruments (ui/samples, see CREDITS.txt). Only the piano in use is loaded; until a note's
  // sample has arrived, that note uses the synth piano instead
  const sampled = {};
  let sampleIndex = null;
  function loadSamples(toneId) {
    if (!ctx || sampled[toneId] || !PTONES[toneId] || !PTONES[toneId].sampled) return;
    const set = (sampled[toneId] = { layers: [] });
    sampleIndex = sampleIndex || fetch('samples/pianos.json').then((r) => r.json());
    sampleIndex.then((idx) => {
      set.layers = idx[toneId].layers.map((l) => ({ maxVel: l.maxVel, gain: l.gain, notes: l.notes.map(([m, file]) => ({ m, file, buf: null })) }));
      // the middle of the keyboard first — that's what gets played most
      const queue = set.layers.flatMap((l) => l.notes).sort((a, b) => Math.abs(a.m - 62) - Math.abs(b.m - 62));
      const next = () => {
        const n = queue.shift();
        if (!n) return;
        fetch(`samples/${toneId}/${n.file}`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b))
          .then((buf) => { n.buf = buf; }).catch(() => {}).finally(next);
      };
      for (let k = 0; k < 4; k++) next();
    }).catch(() => { delete sampled[toneId]; sampleIndex = null; });
  }
  function pickSample(toneId, midi, vel) {
    const set = sampled[toneId];
    if (!set || !set.layers.length) return null;
    const layer = set.layers.find((l) => vel <= l.maxVel) || set.layers[set.layers.length - 1];
    let best = null;
    for (const n of layer.notes) if (n.buf && (!best || Math.abs(n.m - midi) < Math.abs(best.m - midi))) best = n;
    return best && Math.abs(best.m - midi) <= 3 ? { layer, n: best } : null;
  }
  function playSampled({ layer, n }, midi, when, dur, vel, dest) {
    const src = ctx.createBufferSource();
    src.buffer = n.buf;
    src.playbackRate.value = Math.pow(2, (midi - n.m) / 12);
    const g = ctx.createGain();
    const level = layer.gain * Math.pow(Math.min(1, vel / layer.maxVel), 1.3);
    g.gain.value = level;
    src.connect(g); g.connect(dest);
    src.start(when);
    const len = n.buf.duration / src.playbackRate.value;
    let end = when + len;
    if (dur && dur < len) {
      // the damper coming down
      g.gain.setValueAtTime(level, when + dur);
      g.gain.setTargetAtTime(0, when + dur, 0.09);
      end = when + dur + 0.6;
      src.stop(end);
    }
    return track({ end, stop: (t) => { try { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.09); src.stop(t + 0.6); } catch (e) { /* already stopped */ } } });
  }

  function playKeys(midi, when, dur, vel, toneId, dest) {
    if (PTONES[toneId] && PTONES[toneId].sampled) {
      const s = pickSample(toneId, midi, vel);
      if (s) return playSampled(s, midi, when, dur, vel, dest);
      loadSamples(toneId);
      toneId = 'synthpiano';
    }
    const f = freq(midi);
    const out = ctx.createGain();
    out.connect(dest);
    const oscs = [];
    const osc = (type, fr, dest, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = fr; o.detune.value = detune;
      o.connect(dest); o.start(when); oscs.push(o); return o;
    };
    let end;
    if (toneId === 'synthpiano') {
      const B = 0.00032;
      const base = Math.max(0.35, 2.1 - (midi - 21) / 48);
      const bright = Math.max(0.25, 1 - (midi - 30) / 80) * (0.6 + vel * 0.5);
      const hold = dur ? Math.min(dur, base * 3) : base * 3;
      end = when + hold + 0.4;
      for (let k = 1; k <= 9; k++) {
        const fk = k * f * Math.sqrt(1 + B * k * k);
        if (fk > 15000) break;
        const amp = (vel * 0.22 * Math.pow(k, -1.15) * (k === 1 ? 1 : bright)) / (k > 5 ? 1.6 : 1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(amp, when + 0.004);
        g.gain.setTargetAtTime(0, when + 0.004, base / (1 + 0.42 * (k - 1)));
        g.gain.setTargetAtTime(0, when + hold, 0.09);
        g.connect(out);
        osc('sine', fk, g);
        if (k <= 3) osc('sine', fk, g, 1.6);
      }
      const n = ctx.createBufferSource();
      const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.04), ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
      n.buffer = nb;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(6000, f * 6); bp.Q.value = 1.2;
      const ng = ctx.createGain(); ng.gain.value = vel * 0.05;
      n.connect(bp); bp.connect(ng); ng.connect(out); n.start(when);
    } else if (toneId === 'epiano') {
      const hold = dur ? Math.min(dur, 3.5) : 3;
      end = when + hold + 0.5;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.32, when + 0.005);
      amp.gain.setTargetAtTime(0, when + 0.005, 1.1);
      amp.gain.setTargetAtTime(0, when + hold, 0.12);
      amp.connect(out);
      const carrier = osc('sine', f, amp);
      const modG = ctx.createGain();
      modG.gain.setValueAtTime(f * 2.2 * vel, when);
      modG.gain.setTargetAtTime(f * 0.25, when, 0.35);
      osc('sine', f, modG).connect(modG);
      modG.connect(carrier.frequency);
      const bell = ctx.createGain();
      bell.gain.setValueAtTime(vel * 0.05, when);
      bell.gain.setTargetAtTime(0, when, 0.18);
      bell.connect(out);
      osc('sine', f * 7.1, bell);
    } else if (toneId === 'organ') {
      const hold = dur || 1.2;
      end = when + hold + 0.2;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.16, when + 0.012);
      amp.gain.setValueAtTime(vel * 0.16, when + hold);
      amp.gain.linearRampToValueAtTime(0, when + hold + 0.06);
      amp.connect(out);
      [[0.5, 0.55], [1, 1], [2, 0.65], [3, 0.35], [4, 0.28], [6, 0.12]].forEach(([r, a]) => {
        const g = ctx.createGain(); g.gain.value = a; g.connect(amp);
        osc('sine', f * r, g);
      });
    } else {
      const hold = dur || 1.2;
      end = when + hold + 0.5;
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.Q.value = 6;
      flt.frequency.setValueAtTime(Math.min(16000, f * 10 + 1800), when);
      flt.frequency.setTargetAtTime(Math.min(8000, f * 2.2 + 300), when, 0.25);
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(0, when);
      amp.gain.linearRampToValueAtTime(vel * 0.13, when + 0.012);
      amp.gain.setTargetAtTime(vel * 0.08, when + 0.012, 0.25);
      amp.gain.setTargetAtTime(0, when + hold, 0.15);
      flt.connect(amp); amp.connect(out);
      osc('sawtooth', f, flt, -7); osc('sawtooth', f, flt, 7); osc('square', f / 2, flt, 0);
    }
    oscs.forEach((o) => o.stop(end + 0.3));
    return track({ end, stop: (t) => { try { out.gain.setTargetAtTime(0, t, 0.03); oscs.forEach((o) => o.stop(t + 0.25)); } catch (e) { /* already stopped */ } } });
  }

  /* ---------------- Public API ---------------- */
  const tones = { guitar: FK.store.get('gtone', null), piano: FK.store.get('ptone', null) };

  const pianoTone = () => tones.piano || (FK.piano ? FK.piano.defaultTone() : 'grand');
  FK.on('piano-config', () => loadSamples(pianoTone()));

  function inst(opts) { return (opts && opts.inst) || (FK.state && FK.state.mode) || 'guitar'; }

  function playMidi(midi, opts = {}) {
    init();
    // live: a note from your instrument — start it now, not on the 10 ms safety margin used for clicks
    const when = opts.when || ctx.currentTime + (opts.live ? 0 : 0.01);
    const dest = opts.live ? liveBus : bus;
    const vel = opts.vel == null ? 0.85 : opts.vel;
    const which = inst(opts);
    if (which === 'piano') return playKeys(midi, when, opts.dur, vel, opts.tone || pianoTone(), dest);
    const auto = FK.guitar && FK.guitar.defaultTone ? FK.guitar.defaultTone() : 'acoustic';
    return playGuitar(midi, when, opts.dur, vel, opts.tone || tones.guitar || auto, dest);
  }

  function playChord(midis, opts = {}) {
    init();
    const which = inst(opts);
    const when = opts.when || ctx.currentTime + 0.02;
    const sorted = midis.slice().sort((a, b) => a - b);
    if (opts.up === false) sorted.reverse();
    const strum = opts.strum != null ? opts.strum : which === 'guitar' ? 0.028 : 0.006;
    sorted.forEach((m, i) => playMidi(m, { ...opts, inst: which, when: when + i * strum, vel: (opts.vel || 0.75) * (0.92 + Math.random() * 0.1) }));
  }

  function click(when, accent) {
    init();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = accent ? 1760 : 1180;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(accent ? 0.22 : 0.13, when + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
    o.connect(hp); hp.connect(g); g.connect(clickGain);
    o.start(when); o.stop(when + 0.07);
  }

  function stopAll() {
    if (!ctx) return;
    const t = ctx.currentTime;
    voices.forEach((v) => v.stop(t));
    voices.clear();
  }

  /*
   * Lookahead scheduler. events: [{ beat, play(whenSec, secPerBeat), ui() }], sorted by beat.
   * Returns a handle with stop(), setBpm(), and running flag.
   */
  function sequence({ bpm, events, totalBeats, loop = false, onEnd, onLoop, startDelay = 0.08 }) {
    init();
    let spb = 60 / bpm;
    let base = ctx.currentTime + startDelay;
    let idx = 0;
    const timers = new Set();
    const handle = { running: true };
    const later = (fn, delayMs) => {
      const id = setTimeout(() => { timers.delete(id); if (handle.running) fn(); }, Math.max(0, delayMs));
      timers.add(id);
    };
    function tick() {
      if (!handle.running) return;
      const now = ctx.currentTime;
      for (;;) {
        if (idx >= events.length) {
          if (loop && events.length) {
            base += totalBeats * spb;
            idx = 0;
            if (onLoop) later(onLoop, (base - now) * 1000);
            continue;
          }
          const endT = base + totalBeats * spb;
          later(() => { handle.running = false; clearInterval(timer); if (onEnd) onEnd(); }, (endT - now) * 1000);
          clearInterval(timer);
          return;
        }
        const ev = events[idx];
        const t = base + ev.beat * spb;
        if (t > now + 0.15) break;
        if (ev.play) ev.play(Math.max(t, now), spb);
        if (ev.ui) later(ev.ui, (t - now) * 1000);
        idx++;
      }
    }
    const timer = setInterval(tick, 25);
    tick();
    handle.stop = () => {
      handle.running = false;
      clearInterval(timer);
      timers.forEach(clearTimeout);
      timers.clear();
    };
    handle.setBpm = (b) => {
      const now = ctx.currentTime;
      const beatNow = (now - base) / spb;
      spb = 60 / b;
      base = now - beatNow * spb;
    };
    return handle;
  }

  FK.audio = {
    init, playMidi, playChord, click, stopAll, sequence,
    GTONES, PTONES,
    get ctx() { return ctx; },
    now: () => (init(), ctx.currentTime),
    setLevel(name, v) {
      levels[name] = v;
      FK.store.set('mix', levels);
      const node = { master, inst: instGain, click: clickGain, tracks: trackGain }[name];
      if (node) FK.audio.ramp(node.gain, v);
      FK.emit('mix', levels);
    },
    getLevel: (name) => levels[name],
    /* smooth, glitch-free level change. Cancels anything pending first: chained setTargetAtTime calls can get
       stuck in WebView2 when the first one lands at time 0. */
    ramp(param, v) {
      if (!ctx) { param.value = v; return; }
      const t = ctx.currentTime;
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(v, t + 0.04);
    },
    /* read-only tap on the final output (level meters, tests) */
    tap() { init(); const a = ctx.createAnalyser(); a.fftSize = 2048; master.connect(a); return a; },
    /* legacy names: the instrument level */
    setVolume(v) { FK.audio.setLevel('inst', v); },
    getVolume: () => levels.inst,
    /* route an <audio> element (your recordings) through the mixer; returns its own gain (per-track volume, up to 2×) */
    attachMedia(el) {
      init();
      if (mediaNodes.has(el)) return mediaNodes.get(el);
      const src = ctx.createMediaElementSource(el);
      const g = ctx.createGain();
      src.connect(g); g.connect(trackGain);
      mediaNodes.set(el, g);
      return g;
    },
    setTone(which, id) { tones[which] = id; FK.store.set(which === 'piano' ? 'ptone' : 'gtone', id); if (which === 'piano') loadSamples(pianoTone()); },
    getTone(which) { return tones[which] || (which === 'piano' ? pianoTone() : (FK.guitar ? FK.guitar.defaultTone() : 'acoustic')); },
    isAutoTone: (which) => !tones[which],
    warm(midis, toneId) { init(); midis.forEach((m) => ksBuffer(m, toneId)); },
  };
})();
