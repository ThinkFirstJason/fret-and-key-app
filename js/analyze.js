/* Fret & Key — "My songs": transcription orchestration (local AI engine + built-in engine + sheet music),
   audio storage and song building */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const mod = T.mod;
  const SR = 11025;

  /* ---------------- IndexedDB audio store ---------------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open('fretandkey', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('audio');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('audio', mode);
      const r = fn(t.objectStore('audio'));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    });
  };
  FK.audioStore = {
    put: (id, blob) => tx('readwrite', (s) => s.put(blob, id)),
    get: (id) => tx('readonly', (s) => s.get(id)),
    del: (id) => tx('readwrite', (s) => s.delete(id)),
  };

  FK.mySongs = {
    list: () => FK.store.get('mysongs', []),
    save(song) {
      const list = FK.mySongs.list().filter((s) => s.id !== song.id);
      list.unshift(song);
      FK.store.set('mysongs', list);
    },
    remove(id) {
      FK.store.set('mysongs', FK.mySongs.list().filter((s) => s.id !== id));
      FK.audioStore.del(id).catch(() => {});
    },
  };

  /* ---------------- local engine (Python, GPU) ---------------- */
  let statusP = null;
  FK.engine = {
    status(force) {
      // the phone/web app has no local server: everything runs in the browser
      if (!FK.platform.desktop) return Promise.resolve(null);
      if (!statusP || force) statusP = fetch('/api/engine', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      return statusP;
    },
    acoustidKey: () => FK.store.get('acoustid-key', ''),
    setAcoustidKey: (k) => FK.store.set('acoustid-key', (k || '').trim()),
  };

  async function pollJob(id, onProgress, lo, hi) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 400));
      const j = await (await fetch('/api/job/' + id, { cache: 'no-store' })).json();
      if (j.state === 'running') onProgress(lo + (hi - lo) * j.progress, j.stage);
      else if (j.state === 'done') return j.result;
      else throw new Error(j.error || 'The analysis engine stopped unexpectedly.');
    }
  }
  const unb64 = (o) => { const bin = atob(o.data); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Float32Array(u8.buffer); };

  /* ---------------- decoding ---------------- */
  async function decode(file, onProgress) {
    onProgress(0.01, 'Reading the audio file');
    const buf = await file.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    let audio;
    try { audio = await ctx.decodeAudioData(buf); }
    catch (e) { throw new Error('This audio format could not be decoded. Try MP3, WAV, M4A/AAC, OGG or FLAC.'); }
    finally { ctx.close && ctx.close(); }
    return audio;
  }
  async function render(audio, rate, channels) {
    const off = new OfflineAudioContext(channels, Math.max(1, Math.ceil(audio.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start();
    return off.startRendering();
  }

  function runWorker(payload, transfer, onProgress, lo, hi) {
    return new Promise((resolve, reject) => {
      const w = new Worker('js/analyze-worker.js');
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(lo + m.p * (hi - lo), m.stage);
        else if (m.type === 'result') { w.terminate(); resolve(m.result); }
        else if (m.type === 'error') { w.terminate(); reject(new Error(m.message)); }
      };
      w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Analysis failed')); };
      w.postMessage(payload, transfer);
    });
  }

  /* ---------------- sheet music → beat slots ---------------- */
  const QUALS = ['m', '', 'dim', 'aug', 'm6', '6', 'm7', 'mMaj7', 'maj7', '7', 'dim7', 'm7b5', 'sus2', 'sus4'];
  const QIV = [[0, 3, 7], [0, 4, 7], [0, 3, 6], [0, 4, 8], [0, 3, 7, 9], [0, 4, 7, 9], [0, 3, 7, 10], [0, 3, 7, 11], [0, 4, 7, 11], [0, 4, 7, 10], [0, 3, 6, 9], [0, 3, 6, 10], [0, 2, 7], [0, 5, 7]];
  /* closest analysis state (root*14 + quality) for any chord symbol, e.g. Ebm9 -> Ebm7, Bb7#5 -> Bb7 */
  function symToState(sym) {
    const c = T.parseChord(sym);
    if (!c) return null;
    const pcs = new Set(c.def.degs.map((d) => mod(d.semi)));
    let best = 1, bs = -1;
    QIV.forEach((iv, q) => {
      const s = new Set(iv);
      let inter = 0;
      s.forEach((x) => { if (pcs.has(x)) inter++; });
      const thirdOK = (pcs.has(3) && s.has(3)) || (pcs.has(4) && s.has(4)) || (!pcs.has(3) && !pcs.has(4));
      const score = inter / (s.size + pcs.size - inter) + (thirdOK ? 0.5 : 0) + (q <= 1 ? 0.02 : 0);
      if (score > bs) { bs = score; best = q; }
    });
    return c.rootPc * 14 + best;
  }
  function sheetSlots(sheet) {
    const slots = [], measureStarts = [];
    let current = null, emptyRun = 0;
    sheet.measures.forEach((m) => {
      measureStarts.push(slots.length);
      const beats = Math.max(1, Math.round(m.beats || sheet.meter || 4));
      if (m.chords.length) emptyRun = 0; else emptyRun++;
      // a chord carries on through a few empty bars, but long unlabelled stretches stay unwritten
      if (emptyRun > 2) current = null;
      for (let b = 0; b < beats; b++) {
        const c = m.chords.filter((x) => x.beat <= b + 0.25).pop();
        if (c && (b === Math.floor(c.beat) || !current || current.sym !== c.sym)) {
          const st = symToState(c.sym);
          if (st != null) current = { state: st, sym: c.sym };
        }
        // chords merely carried over (or guessed by optical recognition) are weaker evidence than written ones
        slots.push(current ? { ...current, measure: m.n, carried: !m.chords.length || sheet.source === 'omr' } : null);
      }
    });
    return { slots, measureStarts, meter: sheet.meter };
  }

  /* a library chart behaves like sheet music when AcoustID recognises the song */
  function libraryAsSheet(lib) {
    const meter = lib.beats || 4;
    const measures = [];
    let n = 1;
    (lib.sections || []).forEach((sec) => {
      let pos = 0, cur = null;
      sec.c.trim().split(/\s+/).forEach((tok) => {
        const [sym, b] = tok.split(':');
        let beats = b ? +b : meter;
        while (beats > 0) {
          if (!cur) { cur = { n: n++, beats: meter, chords: [], rehearsal: null }; measures.push(cur); pos = 0; }
          if (!cur.chords.length || cur.chords[cur.chords.length - 1].sym !== sym) cur.chords.push({ sym, beat: pos });
          const take = Math.min(beats, meter - pos);
          pos += take; beats -= take;
          if (pos >= meter) cur = null;
        }
      });
    });
    return { source: 'library', title: lib.t, composer: lib.a, meter, key: { tonic: lib.key, mode: lib.mode }, tempo: lib.bpm, measures, warnings: [] };
  }
  const norm = (s) => (s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]|-.*remaster.*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  /* ---------------- naming & song building ---------------- */
  function nameIn(pc, keyPc, mode) {
    const sn = T.scaleNotes(keyPc, mode === 'major' ? 'major' : 'minor');
    const hit = sn.find((n) => n.pc === pc);
    if (hit) return hit.name;
    return (T.keySignature(keyPc, mode).count > 0 ? T.SHARP_NAMES : T.FLAT_NAMES)[pc];
  }
  function commonLoop(labels) {
    const counts = new Map();
    for (let i = 0; i + 4 <= labels.length; i++) {
      const g = labels.slice(i, i + 4);
      if (new Set(g).size < 2) continue;
      const k = g.join(' ');
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let best = null, bc = 1;
    counts.forEach((c, k) => { if (c > bc) { bc = c; best = k; } });
    return best ? { chords: best, count: bc } : null;
  }
  const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const titleFrom = (name) => {
    const title = name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'My song';
    const parts = title.split(' - ');
    return parts.length > 1 ? { t: parts.slice(1).join(' - '), a: parts[0] } : { t: title, a: 'My upload' };
  };
  const newId = () => 'my-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function buildFromAudio(name, res, extra) {
    const regions = res.regions.length ? res.regions : [{ pc: 0, mode: 'major', startBar: 0, endBar: res.bars, start: 0, end: res.duration }];
    const longest = regions.reduce((a, r) => (r.end - r.start > a.end - a.start ? r : a), regions[0]);
    const home = longest.end - longest.start > 1.5 * (regions[0].end - regions[0].start) ? longest : regions[0];
    const regionAt = (bar) => regions.find((r) => bar >= r.startBar && bar < r.endBar) || regions[regions.length - 1];
    const segments = [], sections = [];
    let cur = null;
    res.segments.forEach((sg) => {
      if (sg.root == null) return;
      const reg = regionAt(sg.bar);
      const sym = sg.sym || nameIn(sg.root, reg.pc, reg.mode) + sg.s;
      if (!T.parseChord(sym, true)) return;
      if (!cur || cur.reg !== reg || (sg.bar - cur.startBar >= 8 && sg.pos === 0)) {
        cur = { reg, startBar: sg.bar, start: sg.start, tokens: [] };
        sections.push(cur);
      }
      const prevSeg = segments[segments.length - 1];
      if (prevSeg && prevSeg.sym === sym && Math.abs(prevSeg.end - sg.start) < 0.02 && cur.tokens.length) {
        prevSeg.end = +sg.end.toFixed(3); prevSeg.beats += sg.beats;
        if (sg.src === 'both') prevSeg.src = 'both';
        cur.tokens[cur.tokens.length - 1] = `${sym}:${prevSeg.beats}`;
        return;
      }
      cur.tokens.push(`${sym}:${sg.beats}`);
      cur.endBar = sg.bar;
      segments.push({ sym, beats: sg.beats, start: +sg.start.toFixed(3), end: +sg.end.toFixed(3), conf: sg.conf, bar: sg.bar, pos: sg.pos, src: sg.src || null });
    });
    const keyChanges = regions.slice(1).map((r) => ({ time: +r.start.toFixed(2), bar: r.startBar + 1, key: T.keyRootName(r.pc, r.mode), mode: r.mode }));
    const loop = commonLoop(segments.map((x) => x.sym));
    const names = titleFrom(name);
    return Object.assign({
      id: newId(), user: true, hasAudio: true, t: names.t, a: names.a,
      key: T.keyRootName(home.pc, home.mode), mode: home.mode, bpm: Math.round(res.bpm), beats: res.meter,
      startKey: T.keyRootName(regions[0].pc, regions[0].mode), startMode: regions[0].mode,
      sections: sections.map((x) => ({ n: `Bars ${x.startBar + 1}–${x.endBar + 1} · ${mmss(x.start)}`, c: x.tokens.join(' '), key: T.keyRootName(x.reg.pc, x.reg.mode), mode: x.reg.mode })),
      segments, keyChanges, duration: res.duration, tuning: res.tuning,
      loop: loop ? loop.chords : null,
      analysis: Object.assign({ meter: res.meter, bars: res.bars, keys: regions.length, version: 3 }, res.report),
      tags: 'my songs upload',
      note: 'Automatically transcribed from your recording. Chords with a dotted outline are the ones the checks were least sure about — use Edit to fix anything that sounds off.',
      added: Date.now(),
    }, extra || {});
  }

  function buildFromSheet(name, sheet) {
    const chords = [];
    sheet.measures.forEach((m) => m.chords.forEach((c) => chords.push(T.parseChord(c.sym, true))));
    let key = sheet.key && sheet.key.tonic ? { pc: T.pcOf(sheet.key.tonic), mode: sheet.key.mode === 'minor' ? 'minor' : 'major' } : null;
    const det = T.detectKey(chords.filter(Boolean));
    if (det[0] && (!key || sheet.derived)) key = { pc: det[0].pc, mode: det[0].mode };
    if (!key) key = { pc: 0, mode: 'major' };
    const sections = [];
    let cur = null, last = null, emptyRun = 0;
    sheet.measures.forEach((m) => {
      const beats = m.beats || sheet.meter || 4;
      if (!m.chords.length) {
        emptyRun++;
        // a written chord carries on for a couple of empty bars; longer unwritten stretches are left as gaps
        if (last && cur && emptyRun <= 2) { cur.tokens.push(`${last}:${beats}`); cur.to = m.n; cur.count++; }
        else { last = null; cur = null; }
        return;
      }
      emptyRun = 0;
      if (!cur || m.rehearsal || cur.count >= 8) { cur = { from: m.n, to: m.n, tokens: [], count: 0, label: m.rehearsal }; sections.push(cur); }
      cur.to = m.n; cur.count++;
      m.chords.forEach((c, j) => {
        const next = m.chords[j + 1] ? m.chords[j + 1].beat : beats;
        const len = Math.max(0.5, next - c.beat);
        if (j === 0 && c.beat > 0 && last) cur.tokens.push(`${last}:${c.beat}`);
        cur.tokens.push(`${c.sym}:${len}`);
        last = c.sym;
      });
    });
    const names = sheet.title ? { t: sheet.title, a: sheet.composer || 'Sheet music' } : titleFrom(name);
    return {
      id: newId(), user: true, hasAudio: false, t: names.t, a: names.a,
      key: T.keyRootName(key.pc, key.mode), mode: key.mode, bpm: Math.round(sheet.tempo || 100), beats: sheet.meter || 4,
      sections: sections.filter((s) => s.tokens.length).map((s) => ({ n: (s.label ? s.label + ' · ' : '') + `Bars ${s.from}–${s.to}`, c: s.tokens.join(' ') })),
      analysis: { version: 3, sheetOnly: true, source: sheet.source, derived: !!sheet.derived, warnings: sheet.warnings || [] },
      tags: 'my songs sheet music',
      note: sheet.derived ? 'Chords were worked out from the written notes (the sheet had no chord symbols).' : 'Read from your sheet music. Add the recording too and the chords get lined up with it.',
      added: Date.now(),
    };
  }

  /* ---------------- main entry ---------------- */
  FK.transcribe = async function ({ audio: audioFile, sheet: sheetFile }, onProgress = () => {}) {
    const status = await FK.engine.status();
    const aiOK = !!(status && status.ai && status.ai.available);
    let sheet = null, identity = null;
    const sources = [];

    if (sheetFile) {
      if (status && status.sheet) {
        onProgress(0.01, 'Uploading the sheet music');
        const r = await fetch('/api/sheet?name=' + encodeURIComponent(sheetFile.name), { method: 'POST', body: sheetFile });
        sheet = await pollJob((await r.json()).job, onProgress, 0.01, audioFile ? 0.12 : 0.95);
      } else {
        // no AI engine (or the phone app): MusicXML, MuseScore, MIDI and notation-software PDFs are read in the browser
        sheet = await FK.sheet.read(sheetFile, (p, s) => onProgress(p * (audioFile ? 0.12 : 0.95), s));
      }
      sources.push('sheet:' + sheet.source);
    }
    if (!audioFile) {
      if (!sheet.measures.some((m) => m.chords.length)) throw new Error('No chords could be read from that sheet music.');
      onProgress(1, 'Done');
      return buildFromSheet(sheetFile.name, sheet);
    }

    const base = sheet ? 0.12 : 0;
    const audio = await decode(audioFile, (p, s) => onProgress(base + p, s));
    let ai = null, samples;
    if (aiOK) {
      onProgress(base + 0.02, 'Preparing audio for the AI engine');
      const st = await render(audio, 44100, 2);
      const L = st.getChannelData(0), R = st.getChannelData(1);
      const inter = new Float32Array(L.length * 2);
      for (let i = 0; i < L.length; i++) { inter[2 * i] = L[i]; inter[2 * i + 1] = R[i]; }
      const headers = { 'Content-Type': 'application/octet-stream', 'X-Channels': '2', 'X-Rate': '44100' };
      if (FK.engine.acoustidKey()) headers['X-AcoustID-Key'] = FK.engine.acoustidKey();
      const r = await fetch('/api/analyze', { method: 'POST', body: inter.buffer, headers });
      const res = await pollJob((await r.json()).job, onProgress, base + 0.04, base + 0.55 * (1 - base));
      ai = {
        beats: res.beats, downbeats: res.downbeats, chordHop: res.chordHop, chordProbs: unb64(res.chordProbs),
        bassHop: res.bassHop, bass: unb64(res.bass),
      };
      samples = unb64(res.clean);
      identity = res.identity;
      sources.push('ai', 'dsp');
    } else {
      onProgress(base + 0.04, 'Preparing audio');
      samples = (await render(audio, SR, 1)).getChannelData(0).slice(0);
      sources.push('dsp');
    }
    if (samples.length < SR * 5) throw new Error('That clip is too short — use at least 5 seconds of music.');

    // recognised song with a chart in the library → use it like sheet music
    let reference = null;
    if (!sheet && identity && identity.title) {
      const lib = FK.SONGS.find((s) => norm(s.t) === norm(identity.title));
      if (lib) { sheet = libraryAsSheet(lib); reference = lib.t; sources.push('library'); }
    }
    if (identity && identity.title) sources.push('acoustid');
    const payload = { samples, ai, sheet: sheet ? sheetSlots(sheet) : null, debug: !!FK.debugTranscribe };
    const transfer = [samples.buffer].concat(ai ? [ai.chordProbs.buffer, ai.bass.buffer] : []);
    const lo = aiOK ? base + 0.55 * (1 - base) : base + 0.05;
    const res = await runWorker(payload, transfer, onProgress, lo, 0.99);
    const extra = { sources, identity: identity && identity.title ? identity : null, reference };
    const song = buildFromAudio(audioFile.name, res, extra);
    if (res.debug) song._debug = res.debug;
    if (identity && identity.title && identity.score > 0.5) { song.t = identity.title; if (identity.artist) song.a = identity.artist; }
    else if (sheet && sheet.title && sheet.source !== 'library') { song.t = sheet.title; if (sheet.composer) song.a = sheet.composer; }
    if (sheet) song.note = 'Chords come from your sheet music, lined up with the recording; bars the sheet leaves unwritten were filled in from the audio.';
    if (reference) song.note = `Recognised as “${reference}” — the library chart was lined up with your recording and checked against it.`;
    return song;
  };

  FK.analyzeFile = async function (files, onProgress = () => {}) {
    const song = await FK.transcribe(files, onProgress);
    if (files.audio) await FK.audioStore.put(song.id, files.audio);
    FK.mySongs.save(song);
    return song;
  };
})();
