/* Fret & Key — read sheet music in the browser (no Python needed; this is what the phone app uses).
   A port of engine/sheet.py with the same result shape:
     { source, title, composer, meter, key, tempo, derived, warnings[],
       measures: [ { n, beats, chords: [ { sym, beat } ], rehearsal } ] }
   Supported: MusicXML (.musicxml/.xml/.mxl), MuseScore (.mscz/.mscx), MIDI (.mid/.midi) and PDFs exported from
   notation software. Scans and photos need optical music recognition, which only the desktop AI engine has. */
(function () {
  'use strict';
  const FK = window.FK;

  /* ---------------- chord symbols ---------------- */
  const CHORD_RE = /^[A-G](b|#)?(maj|min|m|dim|aug|sus|add|M|alt|ø|o|\+|-|\d|b|#|\(|\)|,|\/(?=\d))*(\/[A-G](b|#)?)?$/;
  const GLYPHS = [['¨', 'b'], ['♭', 'b'], ['♯', '#'], ['‹', 'm'], ['–', 'm'], ['−', 'm'], ['^', 'maj'], ['∆', 'maj'], ['Δ', 'maj'], ['ø', 'm7b5'], ['Ø', 'm7b5'], ['°', 'dim'], ['º', 'dim']];
  const all = (s, a, b) => s.split(a).join(b);

  /* a printed chord symbol (various notation fonts) -> plain ASCII like Ebm9, Bb7#5, Dm7b5, D/F# */
  function normaliseSymbol(text) {
    let t = String(text || '').trim().replace(/\s+/g, '');
    if (!t || !'ABCDEFG'.includes(t[0])) return null;
    GLYPHS.forEach(([a, b]) => { t = all(t, a, b); });
    t = all(all(all(t, 'min', 'm'), 'Maj', 'maj'), 'mmaj', 'mMaj');
    t = t.replace(/\((.*?)\)/g, '$1');       // 7(#5) -> 7#5, m7(b5) -> m7b5
    t = all(t, ',', '');
    t = t.replace(/^([A-G][b#]?)-(?=\d|$)/, '$1m'); // C-7 -> Cm7
    t = t.replace(/^([A-G][b#]?)\+$/, '$1aug');
    t = all(t, 'm7b5m7b5', 'm7b5').replace(/(m7b5)7/, '$1'); // ø7 -> m7b5
    t = t.replace(/^([A-G][b#]?)maj$/, '$1maj7');   // C^ -> Cmaj7
    return CHORD_RE.test(t) ? t : null;
  }

  const KIND = {
    major: '', minor: 'm', augmented: 'aug', diminished: 'dim', 'dominant-seventh': '7', dominant: '7',
    'major-seventh': 'maj7', 'minor-seventh': 'm7', 'diminished-seventh': 'dim7', 'augmented-seventh': '7#5',
    'half-diminished-seventh': 'm7b5', 'half-diminished': 'm7b5', 'minor-major-seventh': 'mMaj7', 'major-minor': 'mMaj7',
    'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '9', 'major-ninth': 'maj9', 'minor-ninth': 'm9',
    'dominant-11th': '11', 'major-11th': 'maj9', 'minor-11th': 'm11', 'dominant-13th': '13', 'major-13th': 'maj9',
    'minor-13th': 'm11', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4', 'suspended-fourth-seventh': '7sus4',
    power: '5', 'augmented-major-seventh': 'maj7#5',
  };
  const TEMPLATES = { '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11],
    m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], sus4: [0, 5, 7], sus2: [0, 2, 7], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9] };
  const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = (alter) => (alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter));

  /* best chord symbol for a 12-bin pitch-class weight vector */
  function identify(w, bassPc) {
    const tot = w.reduce((a, b) => a + b, 0) || 1;
    let best = null;
    for (let root = 0; root < 12; root++) {
      for (const suf in TEMPLATES) {
        const iv = TEMPLATES[suf];
        const pcs = new Set(iv.map((i) => (root + i) % 12));
        let inside = 0;
        pcs.forEach((p) => { inside += w[p]; });
        inside /= tot;
        const score = inside - 0.8 * (1 - inside) - (iv.length > 3 ? 0.06 : 0) + (root === bassPc ? 0.12 : 0) + 0.15 * w[root] / tot;
        if (!best || score > best[2]) best = [root, suf, score];
      }
    }
    return best && best[2] > 0.25 ? NAMES[best[0]] + best[1] : null;
  }

  /* Krumhansl–Kessler key finding over duration-weighted pitch classes */
  const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function findKey(w) {
    if (!w || w.reduce((a, b) => a + b, 0) <= 0) return null;
    const corr = (prof, t) => {
      const xs = w, ys = prof.map((_, i) => prof[(i - t + 12) % 12]);
      const mx = xs.reduce((a, b) => a + b) / 12, my = ys.reduce((a, b) => a + b) / 12;
      let n = 0, dx = 0, dy = 0;
      for (let i = 0; i < 12; i++) { n += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
      return n / Math.sqrt(dx * dy || 1);
    };
    let best = null;
    for (let t = 0; t < 12; t++) {
      [['major', KK_MAJ], ['minor', KK_MIN]].forEach(([mode, prof]) => {
        const c = corr(prof, t);
        if (!best || c > best.c) best = { c, pc: t, mode };
      });
    }
    return { tonic: NAMES[best.pc], mode: best.mode };
  }
  const FIFTHS_MAJOR = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];

  /* meter in beats per bar, compound time counted in dotted beats */
  function meterOf(num, den) {
    if (!num || !den) return 4;
    if (den === 8 && [6, 9, 12].includes(num)) return num / 3;
    return den !== 4 ? Math.max(1, Math.round(num * 4 / den)) : num;
  }
  const quartersPerBeat = (num, den) => (num && den ? 4 / den * (den === 8 && [6, 9, 12].includes(num) ? 3 : 1) : 1);

  /* ---------------- zip (.mxl, .mscz) ---------------- */
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('That file looks damaged (not a valid compressed score).');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      files[name] = { method, data: u8.subarray(start, start + csize) };
      p += 46 + nlen + xlen + clen;
    }
    return {
      names: Object.keys(files),
      async text(name) {
        const f = files[name];
        if (!f) return null;
        if (f.method === 0) return dec.decode(f.data);
        if (f.method !== 8) throw new Error('Unsupported compression in this score file.');
        if (typeof DecompressionStream === 'undefined') throw new Error('This device can’t unpack compressed scores — export uncompressed MusicXML (.musicxml) instead.');
        const stream = new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return dec.decode(await new Response(stream).arrayBuffer());
      },
    };
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('That score file could not be read (invalid XML).');
    return doc;
  }
  const kids = (el, tag) => (el ? Array.from(el.children).filter((c) => c.tagName === tag) : []);
  const kid = (el, tag) => kids(el, tag)[0] || null;
  const txt = (el, tag, dflt) => { const k = tag ? kid(el, tag) : el; return k && k.textContent.trim() !== '' ? k.textContent.trim() : dflt; };
  const num = (el, tag, dflt) => { const v = parseFloat(txt(el, tag, '')); return isFinite(v) ? v : dflt; };

  /* ---------------- MusicXML ---------------- */
  function timewiseToPartwise(doc) {
    // rare: <score-timewise> stores parts inside measures; regroup them part by part
    const parts = {};
    kids(doc.documentElement, 'measure').forEach((m) => kids(m, 'part').forEach((p) => {
      const id = p.getAttribute('id');
      const mm = doc.createElement('measure');
      Array.from(m.attributes).forEach((a) => mm.setAttribute(a.name, a.value));
      Array.from(p.childNodes).forEach((c) => mm.appendChild(c.cloneNode(true)));
      (parts[id] = parts[id] || []).push(mm);
    }));
    return Object.values(parts);
  }

  /* walk a part: per measure, its chord symbols, notes (sounding pitch), barline marks, time/key/tempo */
  function readPart(measureEls) {
    let div = 1, ts = null, transpose = 0;
    return measureEls.map((m, i) => {
      const out = { n: parseInt(m.getAttribute('number'), 10), idx: i, harmonies: [], notes: [], marks: {}, len: 0, ts: null, fifths: null, tempo: null, rehearsal: null };
      if (!isFinite(out.n)) out.n = i + 1;
      let cur = 0, maxPos = 0, lastStart = 0;
      Array.from(m.children).forEach((el) => {
        const tag = el.tagName;
        if (tag === 'attributes') {
          div = num(el, 'divisions', div);
          const t = kid(el, 'time');
          if (t && kid(t, 'beats')) { ts = { num: parseInt(txt(t, 'beats'), 10), den: parseInt(txt(t, 'beat-type'), 10) }; if (!out.ts) out.ts = ts; }
          const k = kid(el, 'key');
          if (k && kid(k, 'fifths')) out.fifths = { fifths: num(k, 'fifths', 0), mode: txt(k, 'mode', 'major') };
          const tr = kid(el, 'transpose');
          if (tr) transpose = num(tr, 'chromatic', 0) + 12 * num(tr, 'octave-change', 0);
        } else if (tag === 'harmony') {
          const pos = cur + num(el, 'offset', 0);
          out.harmonies.push({ el, q: pos / div });
        } else if (tag === 'note') {
          if (kid(el, 'grace')) return;
          const d = num(el, 'duration', 0);
          const isChord = !!kid(el, 'chord');
          const start = isChord ? lastStart : cur;
          const p = kid(el, 'pitch');
          if (p) {
            const midi = 12 * (num(p, 'octave', 4) + 1) + STEP_PC[txt(p, 'step', 'C')] + num(p, 'alter', 0) + transpose;
            out.notes.push({ midi, q0: start / div, q1: (start + d) / div });
          }
          if (!isChord) { lastStart = cur; cur += d; }
          maxPos = Math.max(maxPos, start + d);
        } else if (tag === 'backup') cur -= num(el, 'duration', 0);
        else if (tag === 'forward') { cur += num(el, 'duration', 0); maxPos = Math.max(maxPos, cur); }
        else if (tag === 'barline') {
          const rep = kid(el, 'repeat');
          if (rep) {
            if (rep.getAttribute('direction') === 'forward') out.marks.forward = true;
            else { out.marks.backward = true; out.marks.times = parseInt(rep.getAttribute('times'), 10) || 2; }
          }
          const end = kid(el, 'ending');
          if (end) {
            const nums = [];
            (end.getAttribute('number') || '').split(/[,\s]+/).forEach((s) => {
              const r = /^(\d+)-(\d+)$/.exec(s);
              if (r) for (let x = +r[1]; x <= +r[2]; x++) nums.push(x);
              else if (/^\d+$/.test(s)) nums.push(+s);
            });
            const type = end.getAttribute('type');
            if (type === 'start') out.marks.endingStart = nums.length ? nums : [1];
            else out.marks.endingStop = true;
          }
        } else if (tag === 'direction' || tag === 'sound') {
          const snd = tag === 'sound' ? el : kid(el, 'sound');
          if (snd) {
            if (snd.getAttribute('tempo') && out.tempo == null) out.tempo = parseFloat(snd.getAttribute('tempo'));
            if (snd.getAttribute('dacapo') === 'yes') out.marks.dc = true;
            if (snd.getAttribute('dalsegno')) out.marks.ds = true;
            if (snd.getAttribute('segno')) out.marks.segno = true;
            if (snd.getAttribute('fine')) out.marks.fine = true;
            if (snd.getAttribute('tocoda')) out.marks.tocoda = true;
            if (snd.getAttribute('coda')) out.marks.coda = true;
          }
          if (tag === 'direction') {
            el.querySelectorAll('metronome').forEach((mm) => {
              if (out.tempo != null) return;
              const pm = num(mm, 'per-minute', null);
              const unit = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 }[txt(mm, 'beat-unit', 'quarter')] || 1;
              if (pm) out.tempo = pm * unit * (kid(mm, 'beat-unit-dot') ? 1.5 : 1);
            });
            el.querySelectorAll('rehearsal').forEach((r) => { out.rehearsal = out.rehearsal || r.textContent.trim() || null; });
            el.querySelectorAll('segno').forEach(() => { out.marks.segno = true; });
            el.querySelectorAll('coda').forEach(() => { out.marks.coda = true; });
            el.querySelectorAll('words').forEach((w) => {
              const s = w.textContent.trim();
              if (/^D\.?\s?C\.?(\s|$)|da capo/i.test(s)) out.marks.dc = true;
              else if (/^D\.?\s?S\.?(\s|$)|dal segno/i.test(s)) out.marks.ds = true;
              else if (/^fine$/i.test(s)) out.marks.fine = true;
              else if (/^to coda/i.test(s)) out.marks.tocoda = true;
            });
          }
        }
      });
      out.len = Math.max(maxPos, cur) / div;
      out.ts = out.ts || ts;
      return out;
    });
  }

  /* unfold repeats, first/second endings and D.C./D.S. (al Fine / al Coda) into a play order of measure indices */
  function playOrder(marks) {
    const n = marks.length;
    // ending regions; neighbouring regions form one group (1st, 2nd, ... ending)
    const regions = [];
    let open = null;
    marks.forEach((m, i) => {
      if (m.endingStart) { open = { start: i, end: i, nums: m.endingStart }; regions.push(open); }
      if (open) open.end = i;
      if (m.endingStop) open = null;
    });
    regions.forEach((r, k) => { const nx = regions[k + 1]; r.last = !(nx && nx.start === r.end + 1); });
    const endingOf = new Array(n).fill(null);
    regions.forEach((r) => { for (let i = r.start; i <= r.end; i++) endingOf[i] = r; });
    const segno = marks.findIndex((m) => m.segno);
    const coda = marks.findIndex((m, k) => m.coda && k > 0);
    const order = [];
    const done = new Set();
    let i = 0, start = 0, pass = 1, endingSeen = -1, jumped = false;
    while (i < n && order.length < 4096) {
      const m = marks[i], e = endingOf[i];
      if (m.forward && i !== start) { start = i; pass = 1; }
      // moving on past a group of endings starts a fresh repeat section
      if (!e && endingSeen >= 0 && i > endingSeen) { start = i; pass = 1; endingSeen = -1; }
      if (e) {
        endingSeen = Math.max(endingSeen, i);
        // after a D.C./D.S. jump the last ending is taken
        if (jumped ? !e.last : !e.nums.includes(pass)) { i++; continue; }
      }
      order.push(i);
      if (jumped && m.fine) break;
      if (jumped && m.tocoda && coda > i) { i = coda; continue; }
      if (m.backward && !done.has(i) && !jumped) {
        if (pass < (m.times || 2)) { pass++; i = start; continue; }
        done.add(i); pass = 1; start = i + 1;
      }
      if ((m.dc || m.ds) && !jumped) { jumped = true; i = m.ds && segno >= 0 ? segno : 0; start = i; pass = 1; endingSeen = -1; continue; }
      i++;
    }
    return order;
  }

  function harmonySymbol(h) {
    const root = kid(h, 'root');
    if (!root) return null;
    const rootName = txt(root, 'root-step', 'C') + acc(num(root, 'root-alter', 0));
    const kindEl = kid(h, 'kind');
    const kindVal = kindEl ? kindEl.textContent.trim() : 'major';
    if (kindVal === 'none') return null;
    let kind = KIND[kindVal];
    if (kind == null) return normaliseSymbol(rootName + ((kindEl && kindEl.getAttribute('text')) || ''));
    const mods = [];
    kids(h, 'degree').forEach((d) => {
      const deg = num(d, 'degree-value', 0), alt = num(d, 'degree-alter', 0), type = txt(d, 'degree-type', 'add');
      if ((type === 'alter' || type === 'add') && [5, 9, 11, 13].includes(deg)) mods.push((alt < 0 ? 'b' : alt > 0 ? '#' : '') + deg);
    });
    if (kind === '7' && mods.length) kind = '7' + mods[0];
    let sym = rootName + kind;
    const bass = kid(h, 'bass');
    if (bass) {
      const b = txt(bass, 'bass-step', null);
      if (b) {
        const bn = b + acc(num(bass, 'bass-alter', 0));
        if (bn !== rootName) sym += '/' + bn;
      }
    }
    return sym;
  }

  function fromMusicXML(doc, source) {
    const warnings = [];
    const root = doc.documentElement;
    let partEls;
    if (root.tagName === 'score-timewise') partEls = timewiseToPartwise(doc);
    else if (root.tagName === 'score-partwise') partEls = kids(root, 'part').map((p) => kids(p, 'measure'));
    else throw new Error('That XML file isn’t MusicXML.');
    if (!partEls.length || !partEls[0].length) throw new Error('No music was found in that score.');
    const parts = partEls.map(readPart);
    const work = kid(root, 'work');
    const title = (work && txt(work, 'work-title', null)) || txt(root, 'movement-title', null);
    let composer = null;
    root.querySelectorAll('identification > creator').forEach((c) => { if (!composer && (c.getAttribute('type') || '') === 'composer') composer = c.textContent.trim() || null; });

    // marks: union across parts (repeat barlines are usually written in every part)
    const len = Math.min(...parts.map((p) => p.length));
    const marks = Array.from({ length: len }, (_, i) => Object.assign({}, ...parts.map((p) => p[i].marks)));
    let order;
    try { order = playOrder(marks); } catch (e) { order = marks.map((_, i) => i); warnings.push('Repeats couldn’t be unfolded — chords follow the written order.'); }
    if (!order.length) order = marks.map((_, i) => i);

    const first = parts[0];
    const ts0 = (first.find((m) => m.ts) || {}).ts || null;
    const meter = meterOf(ts0 && ts0.num, ts0 && ts0.den);
    const qpb = quartersPerBeat(ts0 && ts0.num, ts0 && ts0.den);
    let tempo = null;
    for (const p of parts) { const m = p.find((x) => x.tempo); if (m) { tempo = m.tempo; break; } }

    let bestPart = null, bestN = 0;
    parts.forEach((p) => { const nh = p.reduce((a, m) => a + m.harmonies.length, 0); if (nh > bestN) { bestN = nh; bestPart = p; } });
    const derived = bestN === 0;
    const measures = [];
    const pcw = new Array(12).fill(0);
    parts.forEach((p) => p.forEach((m) => m.notes.forEach((nt) => { pcw[((nt.midi % 12) + 12) % 12] += nt.q1 - nt.q0; })));
    if (!derived) {
      order.forEach((i) => {
        const m = bestPart[i];
        const chords = [];
        m.harmonies.forEach((h) => {
          const sym = harmonySymbol(h.el);
          if (sym) chords.push({ sym, beat: Math.round(h.q / qpb * 2) / 2 });
        });
        measures.push({ n: m.n, beats: meter, chords, rehearsal: first[i].rehearsal || null });
      });
    } else {
      // no symbols written: derive the harmony from the notes of every part, two segments per bar
      order.forEach((i) => {
        const m = first[i];
        const dur = Math.max(...parts.map((p) => p[i].len)) || meter * qpb;
        const halves = [new Array(12).fill(0), new Array(12).fill(0)];
        const bass = [null, null];
        parts.forEach((p) => p[i].notes.forEach((nt) => {
          [[0, dur / 2], [dur / 2, dur]].forEach(([a, b], h) => {
            const ov = Math.min(b, nt.q1) - Math.max(a, nt.q0);
            if (ov <= 1e-6) return;
            halves[h][((nt.midi % 12) + 12) % 12] += ov;
            if (bass[h] == null || nt.midi < bass[h]) bass[h] = nt.midi;
          });
        }));
        const chords = [];
        [0, 1].forEach((h) => {
          const sym = halves[h].some((x) => x > 0) ? identify(halves[h], bass[h] != null ? ((bass[h] % 12) + 12) % 12 : null) : null;
          if (sym && (!chords.length || chords[chords.length - 1].sym !== sym)) chords.push({ sym, beat: h === 0 ? 0 : meter / 2 });
        });
        measures.push({ n: m.n, beats: meter, chords, rehearsal: m.rehearsal || null });
      });
      warnings.push('No chord symbols were written, so the chords were worked out from the notes.');
    }
    let key = findKey(pcw);
    if (!key) {
      const f = (first.find((m) => m.fifths) || {}).fifths;
      if (f) key = { tonic: FIFTHS_MAJOR[FK.clamp(Math.round(f.fifths), -7, 7) + 7], mode: 'major' };
    }
    return { source, title, composer, meter, key, tempo, derived, warnings, measures };
  }

  async function readMusicXML(file) {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
    let text;
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
      const z = await unzip(buf);
      let path = null;
      const container = await z.text('META-INF/container.xml');
      if (container) { const rf = parseXml(container).querySelector('rootfile'); if (rf) path = rf.getAttribute('full-path'); }
      path = path || z.names.find((n) => /\.(musicxml|xml)$/i.test(n) && !/^META-INF\//.test(n));
      text = path && (await z.text(path));
      if (!text) throw new Error('No MusicXML score was found inside that .mxl file.');
    } else text = await file.text();
    return fromMusicXML(parseXml(text), 'musicxml');
  }

  /* ---------------- MuseScore ---------------- */
  const DURS = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 };
  function tpcName(tpc) {
    const letter = 'FCGDAEB'[(((tpc + 1) % 7) + 7) % 7];
    const a = Math.floor((tpc + 1) / 7) - 2;
    return letter + acc(a);
  }
  async function readMuseScore(file) {
    let text;
    if (/\.mscz$/i.test(file.name)) {
      const z = await unzip(await file.arrayBuffer());
      const name = z.names.find((n) => /\.mscx$/i.test(n));
      if (!name) throw new Error('No score was found inside that .mscz file.');
      text = await z.text(name);
    } else text = await file.text();
    const doc = parseXml(text);
    const score = doc.documentElement.querySelector('Score') || doc.documentElement;
    let title = null, composer = null;
    score.querySelectorAll('metaTag').forEach((mt) => {
      if (mt.getAttribute('name') === 'workTitle' && mt.textContent.trim()) title = mt.textContent.trim();
      if (mt.getAttribute('name') === 'composer' && mt.textContent.trim() && !composer) composer = mt.textContent.trim();
    });
    let best = null, bestN = -1;
    kids(score, 'Staff').forEach((st) => { const n = st.getElementsByTagName('Harmony').length; if (n > bestN) { best = st; bestN = n; } });
    let meter = 4;
    const measures = [];
    kids(best, 'Measure').forEach((m, i) => {
      const chords = [];
      let rehearsal = null;
      const voice = kid(m, 'voice') || m;
      let pos = 0;
      Array.from(voice.children).forEach((el) => {
        const tag = el.tagName;
        if (tag === 'TimeSig') {
          const n = parseInt(txt(el, 'sigN', '4'), 10), d = parseInt(txt(el, 'sigD', '4'), 10);
          meter = d === 8 && [6, 9, 12].includes(n) ? Math.floor(n / 3) : d === 4 ? n : Math.max(1, Math.round(n * 4 / d));
        } else if (tag === 'Harmony') {
          const r = txt(el, 'root', null);
          if (r == null) return;
          let sym = tpcName(parseInt(r, 10)) + (txt(el, 'name', '') || '');
          const b = txt(el, 'base', null);
          if (b != null) sym += '/' + tpcName(parseInt(b, 10));
          sym = normaliseSymbol(sym);
          if (sym) chords.push({ sym, beat: Math.round(pos * 2) / 2 });
        } else if (tag === 'RehearsalMark') {
          rehearsal = el.textContent.trim() || null;
        } else if (tag === 'Chord' || tag === 'Rest') {
          const dt = txt(el, 'durationType', 'quarter');
          if (dt === 'measure') { pos = meter; return; }
          let d = DURS[dt] || 1;
          d *= 2 - Math.pow(0.5, parseInt(txt(el, 'dots', '0'), 10));
          pos += d;
        }
      });
      measures.push({ n: i + 1, beats: meter, chords, rehearsal });
    });
    return { source: 'musescore', title, composer, meter, key: null, tempo: null, derived: false,
      warnings: ['MuseScore repeats aren’t unfolded — export MusicXML from MuseScore for repeats.'], measures };
  }

  /* ---------------- MIDI ---------------- */
  function parseMidi(buf) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    const str = (p, n) => String.fromCharCode(...u8.subarray(p, p + n));
    if (str(0, 4) !== 'MThd') throw new Error('That isn’t a standard MIDI file.');
    const ntracks = dv.getUint16(10), division = dv.getUint16(12);
    if (division & 0x8000) throw new Error('SMPTE-timed MIDI files aren’t supported — export with musical (PPQ) timing.');
    let p = 8 + dv.getUint32(4);
    const notes = [], tempos = [], sigs = [], keys = [];
    let title = null;
    for (let t = 0; t < ntracks && p < u8.length; t++) {
      if (str(p, 4) !== 'MTrk') break;
      const end = p + 8 + dv.getUint32(p + 4);
      p += 8;
      let tick = 0, status = 0;
      const onAt = {};
      const vlq = () => { let v = 0, b; do { b = u8[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80 && p < end); return v; };
      while (p < end) {
        tick += vlq();
        let b = u8[p];
        if (b & 0x80) { status = b; p++; } else if (!status) break;
        const type = status & 0xf0, ch = status & 0x0f;
        if (status === 0xff) {
          const meta = u8[p++], len = vlq(), d = p;
          if (meta === 0x51 && len === 3) tempos.push({ tick, bpm: 60000000 / ((u8[d] << 16) | (u8[d + 1] << 8) | u8[d + 2]) });
          else if (meta === 0x58 && len >= 2) sigs.push({ tick, num: u8[d], den: Math.pow(2, u8[d + 1]) });
          else if (meta === 0x59 && len === 2) keys.push({ sf: (u8[d] << 24) >> 24, mi: u8[d + 1] });
          else if (meta === 0x03 && t === 0 && !title) title = new TextDecoder().decode(u8.subarray(d, d + len)).trim() || null;
          p = d + len;
          status = 0;
        } else if (status === 0xf0 || status === 0xf7) { p += vlq(); status = 0; }
        else if (type === 0x90 || type === 0x80) {
          const note = u8[p], vel = u8[p + 1];
          p += 2;
          const k = ch * 128 + note;
          if (type === 0x90 && vel > 0) (onAt[k] = onAt[k] || []).push(tick);
          else if (onAt[k] && onAt[k].length) { const t0 = onAt[k].shift(); if (ch !== 9 && tick > t0) notes.push({ midi: note, t0, t1: tick }); }
        } else if (type === 0xc0 || type === 0xd0) p += 1;
        else p += 2;
      }
      p = end;
    }
    return { division, notes, tempos, sigs, keys, title };
  }
  async function readMidi(file) {
    const mid = parseMidi(await file.arrayBuffer());
    if (!mid.notes.length) throw new Error('That MIDI file has no notes (drum tracks are ignored).');
    const D = mid.division;
    const sigs = mid.sigs.length ? mid.sigs.slice().sort((a, b) => a.tick - b.tick) : [{ tick: 0, num: 4, den: 4 }];
    if (sigs[0].tick > 0) sigs.unshift({ tick: 0, num: 4, den: 4 });
    const lastTick = Math.max(...mid.notes.map((n) => n.t1));
    // bar lines from the time signatures (a change takes effect at the next bar line)
    const bars = [];
    let tick = 0, si = 0;
    while (tick < lastTick && bars.length < 5000) {
      while (si + 1 < sigs.length && sigs[si + 1].tick <= tick) si++;
      const s = sigs[si];
      const len = Math.round(D * 4 * s.num / s.den);
      bars.push({ t0: tick, t1: tick + len, beats: meterOf(s.num, s.den) });
      tick += len;
    }
    const pcw = new Array(12).fill(0);
    mid.notes.forEach((n) => { pcw[n.midi % 12] += (n.t1 - n.t0) / D; });
    const measures = bars.map((b, i) => {
      const mid2 = (b.t0 + b.t1) / 2;
      const halves = [new Array(12).fill(0), new Array(12).fill(0)];
      const bass = [null, null];
      mid.notes.forEach((n) => {
        if (n.t1 <= b.t0 || n.t0 >= b.t1) return;
        [[b.t0, mid2], [mid2, b.t1]].forEach(([a, c], h) => {
          const ov = Math.min(c, n.t1) - Math.max(a, n.t0);
          if (ov <= 0) return;
          halves[h][n.midi % 12] += ov / D;
          if (bass[h] == null || n.midi < bass[h]) bass[h] = n.midi;
        });
      });
      const chords = [];
      [0, 1].forEach((h) => {
        const sym = halves[h].some((x) => x > 0) ? identify(halves[h], bass[h] != null ? bass[h] % 12 : null) : null;
        if (sym && (!chords.length || chords[chords.length - 1].sym !== sym)) chords.push({ sym, beat: h === 0 ? 0 : b.beats / 2 });
      });
      return { n: i + 1, beats: b.beats, chords, rehearsal: null };
    });
    const tempo = mid.tempos.length ? Math.round(mid.tempos.slice().sort((a, b) => a.tick - b.tick)[0].bpm * 100) / 100 : null;
    return { source: 'midi', title: mid.title, composer: null, meter: meterOf(sigs[0].num, sigs[0].den), key: findKey(pcw), tempo, derived: true,
      warnings: ['MIDI has no chord symbols — chords were worked out from the notes.', 'No chord symbols were written, so the chords were worked out from the notes.'], measures };
  }

  /* ---------------- PDF (vector, from notation software) ---------------- */
  let pdfjsP = null;
  function pdfjs() {
    if (!pdfjsP) {
      const base = new URL('vendor/pdfjs/', document.baseURI).href;
      pdfjsP = import(base + 'pdf.min.mjs').then((lib) => { lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs'; return lib; });
    }
    return pdfjsP;
  }
  const RANGE_RE = /^(\d+)\s*[–-]\s*(\d+)$/;
  const TIMESIG = { 24: 2, 34: 3, 44: 4, 54: 5, 22: 2, 32: 3, 68: 2, 98: 3, 128: 4, 64: 3 };
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  /* lines and rectangles drawn on a page, in top-left page coordinates (like PyMuPDF's get_drawings) */
  async function pageDrawings(lib, page, vt) {
    const ops = await page.getOperatorList();
    const O = lib.OPS;
    const lines = [], rects = [];
    let ctm = vt;
    const stack = [];
    for (let k = 0; k < ops.fnArray.length; k++) {
      const fn = ops.fnArray[k], args = ops.argsArray[k];
      if (fn === O.save) stack.push(ctm);
      else if (fn === O.restore) ctm = stack.pop() || vt;
      else if (fn === O.transform) ctm = mul(ctm, args);
      else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (args && args[0]) ctm = mul(ctm, args[0]); }
      else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || vt;
      else if (fn === O.constructPath) {
        const [pops, c] = args;
        let j = 0, cx = 0, cy = 0, sx = 0, sy = 0;
        for (const op of pops) {
          if (op === O.moveTo) { cx = sx = c[j++]; cy = sy = c[j++]; }
          else if (op === O.lineTo) {
            const x = c[j++], y = c[j++];
            const a = ap(ctm, cx, cy), b = ap(ctm, x, y);
            lines.push([a[0], a[1], b[0], b[1]]);
            cx = x; cy = y;
          } else if (op === O.curveTo) { j += 4; cx = c[j++]; cy = c[j++]; }
          else if (op === O.curveTo2 || op === O.curveTo3) { j += 2; cx = c[j++]; cy = c[j++]; }
          else if (op === O.rectangle) {
            const x = c[j++], y = c[j++], w = c[j++], h = c[j++];
            const pts = [ap(ctm, x, y), ap(ctm, x + w, y), ap(ctm, x, y + h), ap(ctm, x + w, y + h)];
            const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
            rects.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
          } else if (op === O.closePath) { cx = sx; cy = sy; }
        }
      }
    }
    return { lines, rects };
  }

  /* merge horizontally adjacent spans on the same line (superscript chord extensions) */
  function tokens(spans) {
    const s2 = spans.slice().sort((a, b) => a.page - b.page || Math.round(a.y / 6) - Math.round(b.y / 6) || a.x0 - b.x0);
    const out = [];
    s2.forEach((s) => {
      const last = out[out.length - 1];
      if (last && last.page === s.page && last.font === s.font && Math.abs(last.y - s.y) < s.size * 0.8 && s.x0 - last.x1 >= 0 && s.x0 - last.x1 < s.size * 0.35) {
        last.text += s.text; last.x1 = s.x1; return;
      }
      out.push(Object.assign({}, s));
    });
    return out;
  }

  async function readPdf(file) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: false }).promise;
    const warnings = [];
    const allSpans = [], systems = [];
    let title = null, bestSize = 0;
    for (let pno = 0; pno < doc.numPages; pno++) {
      const page = await doc.getPage(pno + 1);
      const vp = page.getViewport({ scale: 1 });
      const vt = vp.transform;
      const tc = await page.getTextContent();
      const spans = [];
      tc.items.forEach((it) => {
        const text = (it.str || '').trim();
        if (!text) return;
        const m = mul(vt, it.transform);
        const size = Math.hypot(m[2], m[3]);
        const x0 = m[4], base = m[5];
        const w = it.width * Math.hypot(vt[0], vt[1]);
        const s = { text, font: it.fontName, size, x0, x1: x0 + w, y: base - 0.35 * size, page: pno };
        spans.push(s);
        if (pno === 0 && size > bestSize && text.length > 2) { bestSize = size; title = text; }
      });
      // stacked time-signature digits come through as separate spans: join them ("4" over "4" -> "44")
      spans.filter((s) => /^\d{1,2}$/.test(s.text) && s.size >= 18).forEach((a) => {
        const b = spans.find((s) => s !== a && /^\d{1,2}$/.test(s.text) && Math.abs(s.x0 - a.x0) < a.size * 0.4 && s.y - a.y > a.size * 0.3 && s.y - a.y < a.size * 1.6);
        if (b) spans.push({ text: a.text + b.text, font: a.font, size: a.size, x0: a.x0, x1: Math.max(a.x1, b.x1), y: (a.y + b.y) / 2, page: pno, ts: true });
      });
      allSpans.push(...spans);
      const { lines, rects } = await pageDrawings(lib, page, vt);
      // bar lines: vertical strokes
      const verts = [];
      lines.forEach(([x0, y0, x1, y1]) => { if (Math.abs(x0 - x1) < 0.6 && Math.abs(y0 - y1) > 10) verts.push([x0, Math.min(y0, y1), Math.max(y0, y1)]); });
      rects.forEach(([x0, y0, x1, y1]) => { if (x1 - x0 < 3 && y1 - y0 > 10) verts.push([(x0 + x1) / 2, y0, y1]); });
      // staves: five evenly spaced long horizontal lines (thin filled rectangles count too)
      const hl = new Map();
      const addH = (y, x0, x1) => {
        y = Math.round(y * 10) / 10;
        let key = y;
        for (const k of hl.keys()) if (Math.abs(k - y) < 0.8) { key = k; break; }
        const [a0, a1] = hl.get(key) || [x0, x1];
        hl.set(key, [Math.min(a0, x0), Math.max(a1, x1)]);
      };
      lines.forEach(([x0, y0, x1, y1]) => { if (Math.abs(y0 - y1) < 0.6 && Math.abs(x0 - x1) > 60) addH((y0 + y1) / 2, Math.min(x0, x1), Math.max(x0, x1)); });
      rects.forEach(([x0, y0, x1, y1]) => { if (y1 - y0 < 1.5 && x1 - x0 > 60) addH((y0 + y1) / 2, x0, x1); });
      const ys = Array.from(hl.keys()).sort((a, b) => a - b);
      const staves = [];
      let i = 0;
      while (i + 4 < ys.length) {
        const g = ys.slice(i, i + 5);
        const gaps = [0, 1, 2, 3].map((j) => g[j + 1] - g[j]);
        if (Math.max(...gaps) - Math.min(...gaps) < 1.2 && gaps[0] > 2 && gaps[0] < 12) {
          staves.push([g[0], g[4], Math.min(...g.map((y) => hl.get(y)[0])), Math.max(...g.map((y) => hl.get(y)[1]))]);
          i += 5;
        } else i += 1;
      }
      staves.forEach(([y0, y1, sx0, sx1]) => {
        const xs = Array.from(new Set(verts.filter((v) => Math.abs(v[1] - y0) < 1.6 && Math.abs(v[2] - y1) < 1.6).map((v) => Math.round(v[0] * 10) / 10))).sort((a, b) => a - b);
        const merged = [];
        xs.forEach((x) => { if (merged.length && x - merged[merged.length - 1] < 5) merged[merged.length - 1] = x; else merged.push(x); });
        if (!merged.length || merged[merged.length - 1] < sx1 - 8) merged.push(sx1);
        systems.push({ page: pno, y0, y1, start: sx0, bars: merged });
      });
    }
    if (!systems.length) return null;
    // which font carries the chord symbols?
    const byFont = {};
    tokens(allSpans.filter((s) => !s.ts)).forEach((t) => { (byFont[t.font] = byFont[t.font] || []).push(t); });
    const fonts = Object.keys(byFont).filter((f) => {
      const ok = byFont[f].filter((t) => normaliseSymbol(t.text)).length;
      return ok >= 2 && ok / byFont[f].length >= 0.6;
    });
    const chordTokens = fonts.flatMap((f) => byFont[f].filter((t) => normaliseSymbol(t.text)));
    if (!chordTokens.length) warnings.push('No chord symbols found in this PDF.');
    // printed bar numbers / multi-bar rests / time signatures
    const smallNumbers = allSpans.filter((t) => /^\d+$/.test(t.text) && t.size < 13);
    const ranges = allSpans.filter((t) => RANGE_RE.test(t.text)).map((t) => [t, RANGE_RE.exec(t.text)]);
    const timesigs = allSpans.filter((t) => TIMESIG[t.text] && t.size >= 18);
    // measures per system
    const sysm = systems.map((s) => {
      const edges = [s.start].concat(s.bars);
      const cells = [];
      for (let k = 0; k + 1 < edges.length; k++) if (edges[k + 1] - edges[k] > 12) cells.push([edges[k], edges[k + 1]]);
      const printed = smallNumbers.filter((t) => t.page === s.page && t.x0 < s.start + 25 && t.y >= s.y0 - 30 && t.y <= s.y0 + 2);
      const startNo = printed.length ? parseInt(printed.reduce((a, b) => (Math.abs(b.y - s.y0) < Math.abs(a.y - s.y0) ? b : a)).text, 10) : null;
      const count = cells.map(([a, b]) => {
        const r = ranges.find(([t]) => t.page === s.page && (t.x0 + t.x1) / 2 >= a && (t.x0 + t.x1) / 2 <= b && t.y >= s.y0 - 25 && t.y <= s.y1 + 25);
        return r ? parseInt(r[1][2], 10) - parseInt(r[1][1], 10) + 1 : 1;
      });
      return { sys: s, cells, count, startNo };
    });
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    // number the bars: forward from printed numbers, backward from the next system's number when missing
    sysm.forEach((sm, i) => {
      if (sm.startNo != null) return;
      const nxt = i + 1 < sysm.length ? sysm[i + 1].startNo : null;
      if (nxt != null) sm.startNo = nxt - sum(sm.count);
      else if (i > 0) sm.startNo = sysm[i - 1].startNo + sum(sysm[i - 1].count);
      else sm.startNo = 1;
    });
    const measures = new Map();
    let meter = 4;
    sysm.forEach((sm) => {
      const s = sm.sys;
      let n = sm.startNo;
      sm.cells.forEach(([a, b], ci) => {
        const ts = timesigs.filter((t) => t.page === s.page && t.x0 >= a - 4 && t.x0 <= b && t.y >= s.y0 - 5 && t.y <= s.y1 + 5);
        if (ts.length) meter = TIMESIG[ts[ts.length - 1].text];
        for (let k = 0; k < sm.count[ci]; k++) if (!measures.has(n + k)) measures.set(n + k, { n: n + k, beats: meter, chords: [], rehearsal: null });
        n += sm.count[ci];
      });
    });
    // place chord symbols: the staff just below them, then the bar by x position
    chordTokens.forEach((t) => {
      const cand = sysm.filter((sm) => sm.sys.page === t.page && sm.sys.y0 - t.y >= 0 && sm.sys.y0 - t.y <= 45);
      if (!cand.length) return;
      const sm = cand.reduce((a, b) => (b.sys.y0 - t.y < a.sys.y0 - t.y ? b : a));
      const x = t.x0 + 3; // symbols printed right at a bar line belong to the new bar
      let n = sm.startNo;
      for (let ci = 0; ci < sm.cells.length; ci++) {
        const [a, b] = sm.cells[ci];
        if (x >= a - 6 && x < b) {
          const meas = measures.get(n);
          if (meas) {
            // notes start a little after the bar line; written chords sit on beats
            const width = Math.max(1, b - a);
            const rel = Math.max(0, (x - 3 - (a + 0.07 * width)) / (0.9 * width));
            const beat = Math.min(meas.beats - 1, Math.round(rel * meas.beats));
            meas.chords.push({ sym: normaliseSymbol(t.text), beat, _x: x });
          }
          break;
        }
        n += sm.count[ci];
      }
    });
    const out = [];
    Array.from(measures.keys()).sort((a, b) => a - b).forEach((n) => {
      const m = measures.get(n);
      if (n < 1 && !m.chords.length) return;
      m.chords.sort((a, b) => a._x - b._x);
      const dedup = [];
      m.chords.forEach((c) => {
        delete c._x;
        if (dedup.length && dedup[dedup.length - 1].beat >= c.beat) c.beat = Math.min(m.beats - 0.5, dedup[dedup.length - 1].beat + 1);
        dedup.push(c);
      });
      out.push({ n, beats: m.beats, chords: dedup, rehearsal: null });
    });
    if (ranges.length) warnings.push('Multi-bar rests were counted from their printed ranges.');
    return { source: 'pdf', title, composer: null, meter: out.length ? out[0].beats : 4, key: null, tempo: null, derived: false, warnings, measures: out };
  }

  /* ---------------- entry point ---------------- */
  const IMAGE_RE = /\.(png|jpe?g|tiff?|bmp|webp|heic)$/i;
  FK.sheet = {
    normaliseSymbol,
    /* can this file be read here, without the desktop AI engine? */
    supports: (name) => /\.(musicxml|xml|mxl|mid|midi|mscz|mscx|pdf)$/i.test(name),
    async read(file, onProgress = () => {}) {
      const name = file.name || '';
      onProgress(0.05, 'Reading the sheet music');
      if (/\.(musicxml|xml|mxl)$/i.test(name)) return readMusicXML(file);
      if (/\.(mid|midi)$/i.test(name)) return readMidi(file);
      if (/\.(mscz|mscx)$/i.test(name)) return readMuseScore(file);
      if (/\.pdf$/i.test(name)) {
        onProgress(0.1, 'Reading the PDF');
        const res = await readPdf(file);
        if (res && res.measures.some((m) => m.chords.length)) return res;
        throw new Error('No chord symbols could be read from this PDF. If it’s a scan or photo of printed music, it needs the desktop app’s AI engine (optical music recognition). PDFs exported from notation software, MusicXML and MIDI work here.');
      }
      if (IMAGE_RE.test(name)) {
        throw new Error(FK.platform.desktop
          ? 'Photos and scans of sheet music need the AI engine (optical music recognition) — run “Install AI engine.bat” once.'
          : 'Photos and scans of sheet music need optical music recognition, which only the desktop app’s AI engine can do. Use a PDF exported from notation software, MusicXML, MuseScore or MIDI here.');
      }
      throw new Error('Unsupported sheet-music file: ' + name);
    },
  };
})();
