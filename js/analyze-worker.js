/*
 * Fret & Key — chord transcription worker (v3).
 * Input: { samples: mono Float32Array @ 11025 Hz,
 *          ai?:    { beats, downbeats, chordHop, chordProbs (F×170), bassHop, bass (F×12) }  // local GPU models
 *          sheet?: { slots: [{ state, sym } | null per beat], meter }                       // aligned sheet music }
 *
 *  1. Beat grid: neural beats/downbeats when available, else onset tempo + DP beat tracker and a
 *     meter/downbeat search verified against the harmony
 *  2. Eighth-note grid, so pushed/syncopated chord changes are possible (they cost a little more)
 *  3. Evidence per eighth: AI chord probabilities + built-in chroma reading (drum-free) + bass line
 *  4. Keys per bar (catches modulations) → chords → keys again → chords again
 *  5. Checks: fit, soft timing, repeated sections agree, AI/built-in agreement, final key pass
 *  6. Sheet music (optional): aligned to the recording; written chords win, unwritten bars come from audio
 */
'use strict';
const SR = 11025;

/* ---------------- DSP helpers ---------------- */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, half = len >> 1;
    for (let k = 0; k < half; k++) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      for (let i = k; i < n; i += len) {
        const b = i + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[i] - tr; im[b] = im[i] - ti; re[i] += tr; im[i] += ti;
      }
    }
  }
}
function hann(n) { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n); return w; }
function stft(x, N, hop, maxBin, progress) {
  const win = hann(N);
  const frames = Math.max(1, Math.floor((x.length - N) / hop) + 1);
  const out = new Array(frames);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < N; i++) { re[i] = (x[off + i] || 0) * win[i]; im[i] = 0; }
    fft(re, im);
    const m = new Float32Array(maxBin);
    for (let k = 0; k < maxBin; k++) m[k] = Math.hypot(re[k], im[k]);
    out[f] = m;
    if (progress && f % 150 === 0) progress(f / frames);
  }
  return out;
}
function median(buf, n) {
  for (let i = 1; i < n; i++) { const v = buf[i]; let j = i - 1; while (j >= 0 && buf[j] > v) { buf[j + 1] = buf[j]; j--; } buf[j + 1] = v; }
  return buf[n >> 1];
}
function hpss(spec, L, progress) {
  const T = spec.length, K = spec[0].length, h = L >> 1;
  const buf = new Float32Array(L);
  const H = spec.map(() => new Float32Array(K));
  for (let k = 0; k < K; k++) {
    for (let t = 0; t < T; t++) {
      let n = 0;
      for (let d = -h; d <= h; d++) { const tt = t + d; if (tt >= 0 && tt < T) buf[n++] = spec[tt][k]; }
      H[t][k] = median(buf, n);
    }
    if (progress && k % 60 === 0) progress((0.5 * k) / K);
  }
  const out = new Array(T);
  for (let t = 0; t < T; t++) {
    const s = spec[t], o = new Float32Array(K);
    for (let k = 0; k < K; k++) {
      let n = 0;
      for (let d = -h; d <= h; d++) { const kk = k + d; if (kk >= 0 && kk < K) buf[n++] = s[kk]; }
      const p = median(buf, n), hh = H[t][k];
      o[k] = s[k] * ((hh * hh) / (hh * hh + p * p + 1e-12));
    }
    out[t] = o;
    if (progress && t % 200 === 0) progress(0.5 + (0.5 * t) / T);
  }
  return out;
}
const midiOf = (f) => 69 + 12 * Math.log2(f / 440);
const HARM = [[12, 0.5], [19, 0.35], [24, 0.25], [28, 0.15], [31, 0.1]];
function semitoneSpectra(spec, N, lo, hi, tuning) {
  const binHz = SR / N, map = [];
  for (let k = 1; k < spec[0].length; k++) {
    const midi = midiOf(k * binHz) - tuning, near = Math.round(midi);
    if (near < lo || near > hi) continue;
    map.push({ k, m: near, w: Math.pow(Math.cos(Math.PI * (midi - near)), 2) });
  }
  return spec.map((fr) => {
    const lin = new Float32Array(hi + 1);
    for (const b of map) { const v = fr[b.k] * b.w; if (v > lin[b.m]) lin[b.m] = v; }
    for (let p = lo; p <= hi; p++) {
      const a0 = lin[p];
      if (a0 > 0) for (const [iv, g] of HARM) if (p + iv <= hi) lin[p + iv] = Math.max(0, lin[p + iv] - a0 * g);
    }
    return lin;
  });
}
function cosine(a, b) {
  let s = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return s / (Math.sqrt(x * y) || 1);
}
function normalise(v) { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); }

/* ---------------- music knowledge ---------------- */
const KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function ksCorr(ch, keyIdx) {
  const r = keyIdx >> 1, prof = keyIdx & 1 ? KS_MIN : KS_MAJ;
  let mx = 0, my = 0;
  for (let i = 0; i < 12; i++) { mx += ch[(i + r) % 12]; my += prof[i]; }
  mx /= 12; my /= 12;
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < 12; i++) { const vx = ch[(i + r) % 12] - mx, vy = prof[i] - my; n += vx * vy; dx += vx * vx; dy += vy * vy; }
  return n / Math.sqrt(dx * dy || 1);
}
const DIA = [];
for (let key = 0; key < 24; key++) {
  const pc = key >> 1, minor = key & 1;
  const sc = (minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map((s) => (s + pc) % 12);
  const q = new Array(12).fill(null);
  sc.forEach((r, i) => {
    const t = (sc[(i + 2) % 7] - r + 12) % 12, f = (sc[(i + 4) % 7] - r + 12) % 12;
    q[r] = t === 4 && f === 7 ? 'maj' : t === 3 && f === 7 ? 'min' : 'dim';
  });
  DIA.push({ pc, minor, q, dom: (pc + 7) % 12 });
}

/* chord vocabulary — same order as the BTC model (index = root*14 + quality) */
const TYPES = [
  { s: 'm', iv: [0, 3, 7], pen: 0, q: 'min' },
  { s: '', iv: [0, 4, 7], pen: 0, q: 'maj' },
  { s: 'dim', iv: [0, 3, 6], pen: 0.08, q: 'dim' },
  { s: 'aug', iv: [0, 4, 8], pen: 0.1, q: 'aug' },
  { s: 'm6', iv: [0, 3, 7, 9], pen: 0.09, q: 'min' },
  { s: '6', iv: [0, 4, 7, 9], pen: 0.09, q: 'maj' },
  { s: 'm7', iv: [0, 3, 7, 10], pen: 0.06, q: 'min' },
  { s: 'mMaj7', iv: [0, 3, 7, 11], pen: 0.11, q: 'min' },
  { s: 'maj7', iv: [0, 4, 7, 11], pen: 0.07, q: 'maj' },
  { s: '7', iv: [0, 4, 7, 10], pen: 0.06, q: 'maj' },
  { s: 'dim7', iv: [0, 3, 6, 9], pen: 0.1, q: 'dim' },
  { s: 'm7b5', iv: [0, 3, 6, 10], pen: 0.09, q: 'dim' },
  { s: 'sus2', iv: [0, 2, 7], pen: 0.09, q: 'sus' },
  { s: 'sus4', iv: [0, 5, 7], pen: 0.08, q: 'sus' },
];
const NQ = TYPES.length;
const STATES = [];
for (let r = 0; r < 12; r++) for (const t of TYPES) {
  const v = new Float32Array(12);
  t.iv.forEach((iv, i) => (v[(r + iv) % 12] = i === 0 ? 1 : i === 3 ? 0.7 : 0.9));
  const nrm = Math.hypot(...v);
  for (let i = 0; i < 12; i++) v[i] /= nrm;
  STATES.push({ root: r, s: t.s, q: t.q, pen: t.pen, v, pcs: new Set(t.iv.map((x) => (x + r) % 12)) });
}
const S = STATES.length, NST = S;
function fits(state, key) {
  if (state === NST) return true;
  const st = STATES[state], d = DIA[key], dq = d.q[st.root];
  if (dq == null) return false;
  if (st.q === 'sus') return true;
  if (dq === st.q) return true;
  return !!(d.minor && st.root === d.dom && st.q === 'maj');
}
const triadOf = (st) => (st === NST ? 'N' : STATES[st].root + STATES[st].q);

/* ---------------- analysis ---------------- */
function analyse({ samples: x, ai, sheet }) {
  const post = (p, stage) => self.postMessage({ type: 'progress', p, stage });
  const dur = x.length / SR;
  const report = { merged: 0, keyFixed: 0, snapped: 0, repeatFixed: 0, anticipations: 0, agree: 0, sheetChords: 0, sheetDisagree: 0, audioFilled: 0 };

  /* ---- onset envelope (needed for accents even when beats come from the AI) ---- */
  post(0.01, 'Listening for the beat');
  const oN = 512, oHop = 128, ofr = SR / oHop;
  const oSpec = stft(x, oN, oHop, 200, (p) => post(0.01 + p * 0.07, 'Listening for the beat'));
  const onset = new Float32Array(oSpec.length);
  let prev = null;
  oSpec.forEach((m, t) => {
    let s = 0;
    const cur = new Float32Array(m.length);
    for (let k = 1; k < m.length; k++) { cur[k] = Math.log1p(m[k] * 10); if (prev) s += Math.max(0, cur[k] - prev[k]); }
    onset[t] = s; prev = cur;
  });
  const lw = Math.round(ofr * 0.4), env = new Float32Array(onset.length);
  let acc = 0;
  for (let t = 0; t < onset.length; t++) {
    acc += onset[t];
    if (t >= lw) acc -= onset[t - lw];
    env[t] = Math.max(0, onset[t] - acc / Math.min(t + 1, lw));
  }
  let mean = 0, sd = 0;
  env.forEach((v) => (mean += v)); mean /= env.length || 1;
  env.forEach((v) => (sd += (v - mean) * (v - mean))); sd = Math.sqrt(sd / (env.length || 1)) || 1;
  for (let t = 0; t < env.length; t++) env[t] /= sd;

  /* ---- 1. beat grid ---- */
  let bts, bpm, downbeats = null;
  if (ai && ai.beats && ai.beats.length > 8) {
    post(0.09, 'Using the neural beat tracker');
    bts = ai.beats.slice();
    downbeats = ai.downbeats || [];
    const per = [];
    for (let d = 1; d < downbeats.length; d++) per.push(bts.filter((b) => b >= downbeats[d - 1] - 0.02 && b < downbeats[d] - 0.02).length);
    per.sort((a, b) => a - b);
    const perBar = per.length ? per[per.length >> 1] : 4;
    const gaps0 = bts.slice(1).map((b, i) => b - bts[i]).sort((a, b) => a - b);
    const bpm0 = 60 / gaps0[gaps0.length >> 1];
    if (perBar === 6 || perBar === 8 || bpm0 > 160) {
      // the tracker followed eighth notes: keep every other beat (in step with the first downbeat) and let the
      // harmony-based bar finder place the bar lines
      const first = downbeats.length ? bts.findIndex((b) => Math.abs(b - downbeats[0]) < 0.05) : 0;
      bts = bts.filter((_, i) => (((i - Math.max(0, first)) % 2) + 2) % 2 === 0);
      downbeats = null;
    }
    const gaps = bts.slice(1).map((b, i) => b - bts[i]).sort((a, b) => a - b);
    bpm = 60 / gaps[gaps.length >> 1];
  } else {
    post(0.09, 'Estimating tempo');
    const minLag = Math.floor((ofr * 60) / 200), maxLag = Math.ceil((ofr * 60) / 55);
    const TT = env.length;
    const acf = new Float32Array(2 * maxLag + 4);
    for (let L = minLag - 1; L < acf.length; L++) {
      let s = 0;
      for (let t = 0; t + L < TT; t++) s += env[t] * env[t + L];
      acf[L] = s / Math.max(1, TT - L);
    }
    let bestL = minLag, bestV = -Infinity;
    for (let L = minLag; L <= maxLag; L++) {
      const b = (60 * ofr) / L;
      const v = (acf[L] + 0.5 * (acf[2 * L] || 0)) * Math.exp(-0.5 * Math.pow(Math.log2(b / 120) / 0.9, 2));
      if (v > bestV) { bestV = v; bestL = L; }
    }
    if ((60 * ofr) / bestL > 150) {
      let L2 = bestL * 2, v2 = -Infinity;
      for (let L = bestL * 2 - 2; L <= Math.min(acf.length - 2, bestL * 2 + 2); L++) if (acf[L] > v2) { v2 = acf[L]; L2 = L; }
      if (v2 > 0.5 * acf[bestL]) bestL = L2;
    }
    const a0 = acf[bestL - 1], b0 = acf[bestL], c0 = acf[bestL + 1], den = a0 - 2 * b0 + c0;
    const period = bestL + (den ? (0.5 * (a0 - c0)) / den : 0);
    bpm = (60 * ofr) / period;
    post(0.12, 'Tracking beats');
    const cum = new Float32Array(TT), back = new Int32Array(TT).fill(-1);
    for (let t = 0; t < TT; t++) {
      let best = 0, bi = -1;
      for (let p = Math.max(0, Math.round(t - 2 * period)); p <= Math.round(t - period / 2); p++) {
        const sc = cum[p] - 100 * Math.pow(Math.log((t - p) / period), 2);
        if (bi < 0 || sc > best) { best = sc; bi = p; }
      }
      cum[t] = env[t] + (bi >= 0 ? best : 0);
      back[t] = bi;
    }
    let end = TT - 1, endV = -Infinity;
    for (let t = Math.max(0, TT - Math.round(period)); t < TT; t++) if (cum[t] > endV) { endV = cum[t]; end = t; }
    const bf = [];
    for (let t = end; t >= 0; t = back[t]) { bf.push(t); if (back[t] < 0) break; }
    bf.reverse();
    bts = bf.map((f) => (f * oHop + oN / 2) / SR);
  }
  const P = 60 / bpm;
  if (bts.length < 2) { bts = []; for (let t = 0; t < dur; t += P) bts.push(t); }
  while (bts[0] - P > 0.05) bts.unshift(bts[0] - P);
  while (bts[bts.length - 1] + P < dur - 0.05) bts.push(bts[bts.length - 1] + P);
  const bounds = bts.concat(dur);
  const B = bounds.length - 1;

  /* ---- eighth-note grid ---- */
  const U = 2 * B;
  const ub = new Float64Array(U + 1);
  for (let i = 0; i < B; i++) { ub[2 * i] = bounds[i]; ub[2 * i + 1] = (bounds[i] + bounds[i + 1]) / 2; }
  ub[U] = dur;

  /* ---- 2. clean harmonic analysis (built-in engine) ---- */
  post(0.14, 'Analysing frequencies');
  const N = 4096, hop = 512;
  const raw = stft(x, N, hop, Math.ceil((2100 * N) / SR), (p) => post(0.14 + p * 0.1, 'Analysing frequencies'));
  const binHz = SR / N;
  let sx = 0, sy = 0;
  for (let f = 0; f < raw.length; f += 2) {
    const m = raw[f];
    for (let k = Math.ceil(100 / binHz); k < Math.min(m.length - 1, 1500 / binHz); k++) {
      if (m[k] > m[k - 1] && m[k] >= m[k + 1] && m[k] > 1e-3) {
        const d = (0.5 * (m[k - 1] - m[k + 1])) / (m[k - 1] - 2 * m[k] + m[k + 1] || 1);
        const midi = midiOf((k + d) * binHz), ang = 2 * Math.PI * (midi - Math.round(midi));
        sx += m[k] * Math.cos(ang); sy += m[k] * Math.sin(ang);
      }
    }
  }
  const tuning = Math.atan2(sy, sx) / (2 * Math.PI);
  const energy = raw.map((m) => { let e = 0; for (let k = 0; k < m.length; k++) e += m[k] * m[k]; return Math.sqrt(e); });
  const harm = hpss(raw, 31, (p) => post(0.25 + p * 0.2, 'Separating harmony from drums'));
  const trebleSemis = semitoneSpectra(harm, N, 33, 96, tuning);
  post(0.46, 'Listening to the bass');
  const BN = 8192;
  const BHOP = 1024;
  const bassSemis = semitoneSpectra(hpss(stft(x, BN, BHOP, Math.ceil((320 * BN) / SR)), 13), BN, 28, 55, tuning);
  let gT = 1e-9, gB = 1e-9;
  trebleSemis.forEach((l) => { for (let p = 33; p <= 96; p++) if (l[p] > gT) gT = l[p]; });
  bassSemis.forEach((l) => { for (let p = 28; p <= 55; p++) if (l[p] > gB) gB = l[p]; });
  const chroma = trebleSemis.map((l) => { const c = new Float32Array(12); for (let p = 43; p <= 96; p++) c[p % 12] += Math.log1p((l[p] / gT) * 400); return c; });
  const bassC = bassSemis.map((l) => { const c = new Float32Array(12); for (let p = 28; p <= 55; p++) c[p % 12] += Math.log1p((l[p] / gB) * 400) * (p <= 47 ? 1.3 : 1); return c; });

  /* ---- per-eighth features ---- */
  post(0.52, 'Lining up with the beat');
  const tc = [], tb = [], te = [];
  for (let u = 0; u < U; u++) {
    const c = new Float32Array(12), bs = new Float32Array(12);
    let n = 0, e = 0, nb = 0;
    const j0 = Math.max(0, Math.ceil((ub[u] * SR - N / 2) / hop)), j1 = Math.floor((ub[u + 1] * SR - N / 2) / hop);
    for (let j = j0; j <= j1 && j < chroma.length; j++) { for (let p = 0; p < 12; p++) c[p] += chroma[j][p]; e += energy[j]; n++; }
    if (!n) { const j = Math.min(chroma.length - 1, Math.max(0, Math.round((((ub[u] + ub[u + 1]) / 2) * SR - N / 2) / hop))); for (let p = 0; p < 12; p++) c[p] = chroma[j][p]; e = energy[j]; n = 1; }
    const k0 = Math.max(0, Math.ceil((ub[u] * SR - BN / 2) / BHOP)), k1 = Math.floor((ub[u + 1] * SR - BN / 2) / BHOP);
    for (let k = k0; k <= k1 && k < bassC.length; k++) { for (let p = 0; p < 12; p++) bs[p] += bassC[k][p]; nb++; }
    if (!nb) { const k = Math.min(bassC.length - 1, Math.max(0, Math.round((((ub[u] + ub[u + 1]) / 2) * SR - BN / 2) / BHOP))); for (let p = 0; p < 12; p++) bs[p] = bassC[k][p]; }
    tc.push(c); tb.push(bs); te.push(e / n);
  }
  const emax = Math.max(...te, 1e-9);
  const quiet = te.map((e) => e / emax < 0.04);

  /* ---- 3. evidence ---- */
  post(0.56, ai ? 'Combining AI and built-in evidence' : 'Weighing chord evidence');
  const trebleSim = new Float32Array(U * S), bassSim = new Float32Array(U * S);
  for (let u = 0; u < U; u++) {
    const c = tc[u];
    const m = c.reduce((s2, v) => s2 + v, 0) / 12;
    const cc = c.map((v) => Math.max(0, v - m * 0.5));
    const nrm = Math.hypot(...cc) || 1;
    const bmax = Math.max(...tb[u]) || 1, bsum = tb[u].reduce((s2, v) => s2 + v, 0) || 1;
    for (let k = 0; k < S; k++) {
      const st = STATES[k];
      let sim = 0;
      for (let p = 0; p < 12; p++) sim += (cc[p] / nrm) * st.v[p];
      trebleSim[u * S + k] = sim - st.pen;
      bassSim[u * S + k] = 0.3 * (tb[u][st.root] / bmax) + 0.4 * (tb[u][st.root] / bsum);
    }
  }
  // AI chord probabilities per eighth (log), and the separated bass line
  let aiLog = null, aiBass = null;
  if (ai && ai.chordProbs) {
    aiLog = new Float32Array(U * (S + 1));
    const F = ai.chordProbs.length / 170;
    for (let u = 0; u < U; u++) {
      const f0 = Math.max(0, Math.floor(ub[u] / ai.chordHop)), f1 = Math.min(F - 1, Math.max(f0, Math.ceil(ub[u + 1] / ai.chordHop) - 1));
      const n = f1 - f0 + 1;
      for (let k = 0; k < S; k++) {
        let p = 0;
        for (let f = f0; f <= f1; f++) p += ai.chordProbs[f * 170 + k];
        aiLog[u * (S + 1) + k] = Math.log(p / n + 1e-4);
      }
      let pn = 0;
      for (let f = f0; f <= f1; f++) pn += ai.chordProbs[f * 170 + 168] + ai.chordProbs[f * 170 + 169];
      aiLog[u * (S + 1) + S] = Math.log(pn / n + 1e-4);
    }
    if (ai.bass) {
      const Fb = ai.bass.length / 12;
      aiBass = new Float32Array(U * 12);
      for (let u = 0; u < U; u++) {
        const f0 = Math.max(0, Math.floor(ub[u] / ai.bassHop)), f1 = Math.min(Fb - 1, Math.max(f0, Math.ceil(ub[u + 1] / ai.bassHop) - 1));
        let mx = 1e-9;
        for (let p = 0; p < 12; p++) { let v = 0; for (let f = f0; f <= f1; f++) v += ai.bass[f * 12 + p]; aiBass[u * 12 + p] = v; if (v > mx) mx = v; }
        for (let p = 0; p < 12; p++) aiBass[u * 12 + p] /= mx;
      }
    }
  }

  /* metrical classes per eighth: 0 downbeat, 1 half-bar, 2 other beat, 3 push (eighth before 0/1), 4 other off-beat */
  let M = 4, phase = 0;
  const posOfBeat = (Mm, ph) => { const pz = new Int8Array(B); for (let i = 0; i < B; i++) pz[i] = (((i - ph) % Mm) + Mm) % Mm; return pz; };
  const classes = (pz, Mm) => {
    const cl = new Int8Array(U);
    for (let u = 0; u < U; u++) {
      const i = u >> 1;
      if (u % 2 === 0) cl[u] = pz[i] === 0 ? 0 : Mm === 4 && pz[i] === 2 ? 1 : 2;
      else { const nxt = pz[(i + 1) % B]; cl[u] = i + 1 < B && (nxt === 0 || (Mm === 4 && nxt === 2)) ? 3 : 4; }
    }
    return cl;
  };
  const CHANGE = ai && ai.chordProbs ? [-1.0, -1.5, -2.0, -2.2, -2.8] : [-1.0, -2.0, -3.2, -3.6, -4.6];
  const sims = new Float32Array(U * S);
  const buildEvidence = (cl) => {
    for (let u = 0; u < U; u++) {
      const w = cl[u] === 0 ? 0.85 : cl[u] === 1 ? 0.45 : 0.2;
      let anchor = u;
      while (anchor > 0 && cl[anchor] > 1) anchor--;
      for (let k = 0; k < S; k++) {
        let v = trebleSim[u * S + k] + w * bassSim[u * S + k] + (anchor !== u ? 0.35 * bassSim[anchor * S + k] : 0);
        if (aiBass) v += 0.25 * w * aiBass[u * 12 + STATES[k].root] + (anchor !== u ? 0.15 * aiBass[anchor * 12 + STATES[k].root] : 0);
        sims[u * S + k] = v;
      }
    }
  };
  const simOf = (u, st) => (st === NST ? (quiet[u] ? 1 : 0.2) : sims[u * S + st]);
  const emitOf = (u, k, keys) => {
    if (k === NST) return aiLog ? 4 * (quiet[u] ? 1 : 0.1) + 0.9 * aiLog[u * (S + 1) + S] : quiet[u] ? 20 : 6;
    const keyB = keys && fits(k, keys[u]) ? 0.045 : 0;
    return aiLog ? 5 * (sims[u * S + k] + keyB) + 1.2 * aiLog[u * (S + 1) + k] : 14 * (sims[u * S + k] + keyB);
  };
  function decodeRaw(cl, keys) {
    let score = new Float32Array(S + 1);
    for (let k = 0; k <= S; k++) score[k] = emitOf(0, k, keys);
    const bp = [];
    for (let u = 1; u < U; u++) {
      const change = CHANGE[cl[u]];
      let bi = 0;
      for (let k = 1; k <= S; k++) if (score[k] > score[bi]) bi = k;
      const ns = new Float32Array(S + 1), ptr = new Int16Array(S + 1);
      for (let k = 0; k <= S; k++) {
        const stay = score[k], chg = score[bi] + change;
        if (stay >= chg) { ns[k] = stay + emitOf(u, k, keys); ptr[k] = k; } else { ns[k] = chg + emitOf(u, k, keys); ptr[k] = bi; }
      }
      bp.push(ptr); score = ns;
    }
    let k = 0;
    for (let q = 1; q <= S; q++) if (score[q] > score[k]) k = q;
    const best = score[k];
    const lab = new Int16Array(U);
    lab[U - 1] = k;
    for (let u = U - 2; u >= 0; u--) lab[u] = k = bp[u][k];
    return { lab, score: best };
  }

  /* ---- bars ---- */
  post(0.62, 'Finding the bar lines');
  if (downbeats && downbeats.length >= 2) {
    // neural downbeats: meter = typical beats per bar; phase = beat nearest the first downbeat
    const near = (t) => { let bi = 0; for (let i = 0; i < B; i++) if (Math.abs(bounds[i] - t) < Math.abs(bounds[bi] - t)) bi = i; return bi; };
    const idx = downbeats.map(near);
    const counts = {};
    idx.slice(1).forEach((v, i) => { const d = v - idx[i]; if (d >= 2 && d <= 7) counts[d] = (counts[d] || 0) + 1; });
    M = +Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 4;
    if (M !== 3 && M !== 4) M = M === 6 ? 3 : 4;
    const ph = {};
    idx.forEach((v) => { const p = v % M; ph[p] = (ph[p] || 0) + 1; });
    phase = +Object.keys(ph).sort((a, b) => ph[b] - ph[a])[0];
    buildEvidence(classes(posOfBeat(M, phase), M));
  } else {
    // try every meter/phase and keep the bar lines that explain the chord changes best
    const tn0 = tc.map((c) => normalise(Array.from(c)));
    const nov = new Float32Array(B);
    for (let i = 1; i < B; i++) nov[i] = 1 - cosine(tn0[2 * i - 1], tn0[2 * i]);
    const accent = new Float32Array(B);
    for (let i = 0; i < B; i++) { const f = Math.round((bounds[i] * SR - oN / 2) / oHop); let mx = 0; for (let d = -2; d <= 2; d++) if (env[f + d] > mx) mx = env[f + d]; accent[i] = mx; }
    const amax = Math.max(...accent, 1e-9);
    let best = -Infinity;
    for (const Mm of [4, 3]) for (let ph = 0; ph < Mm; ph++) {
      const cl = classes(posOfBeat(Mm, ph), Mm);
      buildEvidence(cl);
      let ns = 0, n = 0;
      for (let i = ph; i < B; i += Mm) { ns += nov[i] + 0.25 * (accent[i] / amax); n++; }
      const total = decodeRaw(cl, null).score + 6 * (n ? ns / n : 0) * Math.sqrt(U);
      if (total > best) { best = total; M = Mm; phase = ph; }
    }
    buildEvidence(classes(posOfBeat(M, phase), M));
  }
  const pos = posOfBeat(M, phase);
  const cls = classes(pos, M);
  const bars = [];
  if (phase > 0) bars.push([0, 2 * phase]);
  for (let s = phase; s < B; s += M) bars.push([2 * s, Math.min(U, 2 * (s + M))]);
  const barOf = new Int32Array(U);
  bars.forEach(([s, e], b) => { for (let u = s; u < e; u++) barOf[u] = b; });

  /* ---- keys ---- */
  const tn = tc.map((c) => normalise(Array.from(c))), bn = tb.map((c) => normalise(Array.from(c)));
  const barChroma = bars.map(([s, e]) => {
    const v = new Float32Array(12);
    for (let u = s; u < e; u++) { const w = te[u] / emax; for (let p = 0; p < 12; p++) v[p] += tn[u][p] * w + 0.5 * bn[u][p] * w; }
    return v;
  });
  const win8 = (b) => [Math.max(0, b - 3), Math.min(bars.length - 1, b + 4)];
  function keyRegions(labels) {
    const nb = bars.length;
    let firstSt = null, lastSt = null;
    if (labels) {
      for (let u = 0; u < U; u++) if (labels[u] !== NST) { firstSt = labels[u]; break; }
      for (let u = U - 1; u >= 0; u--) if (labels[u] !== NST) { lastSt = labels[u]; break; }
    }
    const isTonic = (st, k) => st != null && st !== NST && STATES[st].root === DIA[k].pc && STATES[st].q === (DIA[k].minor ? 'min' : 'maj');
    const E = [];
    for (let b = 0; b < nb; b++) {
      const [w0, w1] = win8(b);
      const ch = new Float32Array(12);
      for (let q = w0; q <= w1; q++) for (let p = 0; p < 12; p++) ch[p] += barChroma[q][p];
      const row = new Float32Array(24);
      for (let k = 0; k < 24; k++) {
        let sc = 8 * ksCorr(ch, k);
        if (labels) {
          let fit = 0, n = 0, tonic = 0;
          for (let u = bars[w0][0]; u < bars[w1][1]; u++) {
            if (labels[u] === NST) continue;
            n++;
            if (fits(labels[u], k)) fit++;
            if (cls[u] === 0 && isTonic(labels[u], k)) tonic++;
          }
          if (n) sc += 6 * (fit / n) + Math.min(1.2, 0.3 * tonic);
          if (b < 8 && isTonic(firstSt, k)) sc += 1.6;
          if (b >= nb - 8 && isTonic(lastSt, k)) sc += 0.8;
        }
        row[k] = sc;
      }
      E.push(row);
    }
    const CH = -9;
    let score = E[0].slice();
    const bp = [];
    for (let b = 1; b < nb; b++) {
      let bi = 0;
      for (let k = 1; k < 24; k++) if (score[k] > score[bi]) bi = k;
      const ns = new Float32Array(24), ptr = new Int8Array(24);
      for (let k = 0; k < 24; k++) {
        if (score[k] >= score[bi] + CH) { ns[k] = score[k] + E[b][k]; ptr[k] = k; } else { ns[k] = score[bi] + CH + E[b][k]; ptr[k] = bi; }
      }
      bp.push(ptr); score = ns;
    }
    let k = 0;
    for (let q = 1; q < 24; q++) if (score[q] > score[k]) k = q;
    const path = new Array(nb);
    path[nb - 1] = k;
    for (let b = nb - 2; b >= 0; b--) path[b] = k = bp[b][k];
    for (let pass = 0; pass < 8; pass++) {
      const runs = [];
      path.forEach((kk, b) => { const r = runs[runs.length - 1]; if (r && r.k === kk) r.e = b + 1; else runs.push({ k: kk, s: b, e: b + 1 }); });
      if (runs.length < 2) break;
      const short = runs.findIndex((r) => r.e - r.s < 8);
      if (short < 0) break;
      const r = runs[short], L = runs[short - 1], R = runs[short + 1];
      const sum = (kk) => { let s = 0; for (let b = r.s; b < r.e; b++) s += E[b][kk]; return s; };
      const to = !L ? R.k : !R ? L.k : sum(L.k) >= sum(R.k) ? L.k : R.k;
      for (let b = r.s; b < r.e; b++) path[b] = to;
    }
    if (labels) {
      for (let b = 1; b < nb; b++) {
        if (path[b] === path[b - 1]) continue;
        const oldK = path[b - 1], newK = path[b];
        const firstChord = (q) => { for (let u = bars[q][0]; u < bars[q][1]; u++) if (labels[u] !== NST) return labels[u]; return NST; };
        let target = b;
        for (let q = Math.max(1, b - 2); q <= Math.min(nb - 1, b + 2); q++) {
          const c = firstChord(q);
          if (c !== NST && fits(c, newK) && !fits(c, oldK)) { target = q; break; }
        }
        if (target > b) for (let q = b; q < target; q++) path[q] = oldK; else for (let q = target; q < b; q++) path[q] = newK;
        b = Math.max(b, target);
      }
    }
    return path;
  }
  const eighthKeys = (barKeys) => { const out = new Int8Array(U); for (let u = 0; u < U; u++) out[u] = barKeys[barOf[u]]; return out; };
  const decode = (keys) => decodeRaw(cls, keys).lab;
  const segsOf = (lab) => {
    const out = [];
    for (let u = 0; u < U; u++) { const l = out[out.length - 1]; if (l && l.st === lab[u]) l.b = u + 1; else out.push({ st: lab[u], a: u, b: u + 1 }); }
    return out;
  };
  const sumSim = (a, b, st) => { let s = 0; for (let u = a; u < b; u++) s += emitOf(u, st, null); return s; };
  const margin = (u, st) => {
    if (st === NST) return 0;
    let second = -Infinity;
    for (let k = 0; k < S; k++) if (k !== st && sims[u * S + k] > second) second = sims[u * S + k];
    return sims[u * S + st] - second;
  };

  /* ---- 4. passes ---- */
  post(0.66, 'Pass 1 · mapping keys');
  let barKeys = keyRegions(null);
  post(0.7, 'Pass 1 · reading chords');
  let lab = decode(eighthKeys(barKeys));
  post(0.74, 'Pass 2 · re-checking keys against the chords');
  barKeys = keyRegions(lab);
  post(0.78, 'Pass 2 · reading chords again');
  let keys = eighthKeys(barKeys);
  lab = decode(keys);

  /* ---- 5. checks ---- */
  post(0.81, 'Check 1 · do the chords fit the music?');
  const fitCheck = () => {
    const sg = segsOf(lab);
    for (let s = 0; s < sg.length; s++) {
      const g = sg[s], L = sg[s - 1], R = sg[s + 1], len = g.b - g.a;
      if (g.st === NST) continue;
      const set = (st, kind) => { for (let u = g.a; u < g.b; u++) lab[u] = st; g.st = st; report[kind]++; };
      if (!R && L && len <= 3 && L.st !== NST) { set(L.st, 'merged'); continue; }
      if (L && R && L.st === R.st && len <= 3 && cls[g.a] !== 0) { if (sumSim(g.a, g.b, L.st) >= sumSim(g.a, g.b, g.st) - 0.6 * len) { set(L.st, 'merged'); continue; } }
      if (len <= 2 && (L || R)) {
        const cand = [L, R].filter(Boolean).map((n) => n.st);
        const best = cand.reduce((a, b) => (sumSim(g.a, g.b, a) >= sumSim(g.a, g.b, b) ? a : b));
        if (sumSim(g.a, g.b, best) >= sumSim(g.a, g.b, g.st) - 0.5 * len) { set(best, 'merged'); continue; }
      }
      if (!fits(g.st, keys[g.a])) {
        let alt = -1, altS = -Infinity;
        for (let k = 0; k < S; k++) if (fits(k, keys[g.a]) && STATES[k].root === STATES[g.st].root) { const v = sumSim(g.a, g.b, k); if (v > altS) { altS = v; alt = k; } }
        if (alt >= 0 && altS >= sumSim(g.a, g.b, g.st) - 0.4 * len) set(alt, 'keyFixed');
      }
    }
  };
  fitCheck();

  post(0.84, 'Check 2 · timing (bar lines preferred, pushes allowed)');
  {
    const sg = segsOf(lab);
    for (let s = 1; s < sg.length; s++) {
      const A = sg[s - 1], Bs = sg[s], u = Bs.a;
      if (cls[u] <= 1) continue;
      // compare both boundary positions over the same stretch of music
      const scoreAt = (x, lo, hi) => { let t = 0; for (let q = lo; q < hi; q++) t += emitOf(q, q < x ? A.st : Bs.st, keys); return t; };
      let bestJ = -1, bestS = -Infinity;
      for (let j = u - 2; j <= u + 2; j++) {
        if (j <= A.a || j >= Bs.b || cls[j] >= cls[u]) continue;
        const lo = Math.min(u, j), hi = Math.max(u, j);
        const sc = scoreAt(j, lo, hi) - scoreAt(u, lo, hi);
        if (sc > bestS) { bestS = sc; bestJ = j; }
      }
      // soft: only move when the evidence is essentially tied
      if (bestJ >= 0 && bestS >= 0) {
        for (let q = Math.min(u, bestJ); q < Math.max(u, bestJ); q++) lab[q] = q < bestJ ? A.st : Bs.st;
        Bs.a = bestJ; A.b = bestJ;
        report.snapped++;
      }
    }
  }

  post(0.88, 'Check 3 · do repeated sections agree?');
  {
    const full = bars.map(([s, e], b) => ({ b, s, e })).filter((x2) => x2.e - x2.s === 2 * M);
    const feat = full.map((x2) => {
      const v = [];
      for (let p = 0; p < 12; p++) v.push(barChroma[x2.b][p]);
      for (let p = 0; p < 12; p++) { let t = 0; for (let u = x2.s; u < x2.e; u++) t += bn[u][p]; v.push(t * 0.7); }
      return v;
    });
    const parent = full.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < full.length; i++) for (let j = i + 1; j < full.length; j++) if (cosine(feat[i], feat[j]) > 0.93) parent[find(i)] = find(j);
    const groups = {};
    full.forEach((x2, i) => (groups[find(i)] = groups[find(i)] || []).push(x2));
    Object.values(groups).forEach((g) => {
      if (g.length < 3) return;
      const tally = new Map();
      g.forEach((x2) => {
        const pat = Array.from(lab.slice(x2.s, x2.e)).join(',');
        let w = 0;
        for (let u = x2.s; u < x2.e; u++) w += Math.max(0.01, simOf(u, lab[u]));
        tally.set(pat, (tally.get(pat) || 0) + w);
      });
      let best = null, bw = -1;
      tally.forEach((w, p) => { if (w > bw) { bw = w; best = p; } });
      const bpat = best.split(',').map(Number);
      g.forEach((x2) => {
        const cur = Array.from(lab.slice(x2.s, x2.e)).join(',');
        if (cur === best || tally.get(cur) * 2 > bw) return;
        let curS = 0, altS = 0;
        for (let u = x2.s; u < x2.e; u++) { curS += emitOf(u, lab[u], keys); altS += emitOf(u, bpat[u - x2.s], keys); }
        if (altS >= curS - 0.4 * M) { for (let u = x2.s; u < x2.e; u++) lab[u] = bpat[u - x2.s]; report.repeatFixed++; }
      });
    });
  }
  fitCheck();

  post(0.91, 'Check 4 · final key check');
  barKeys = keyRegions(lab);
  keys = eighthKeys(barKeys);

  /* ---- 6. sheet music alignment ---- */
  let src = null, sheetSym = null;
  if (sheet && sheet.slots && sheet.slots.length) {
    post(0.93, 'Aligning the sheet music to the recording');
    const J = sheet.slots.length;
    const beatEv = (i, st) => emitOf(2 * i, st, keys) + emitOf(2 * i + 1, st, keys);
    const bestAudio = new Float32Array(B);
    for (let i = 0; i < B; i++) { let m = -Infinity; for (let k = 0; k <= S; k++) { const v = beatEv(i, k); if (v > m) m = v; } bestAudio[i] = m; }
    // states 0..J-1 = sheet beats, J = "not in the sheet" (vamps, solos, cut sections)
    const starts = sheet.measureStarts || [0];
    const emitJ = (i, j) => { const sl = sheet.slots[j]; return sl ? beatEv(i, sl.state) : bestAudio[i] - 1.5; };
    const OFF = J;
    let sc = new Float32Array(J + 1).fill(-1e9);
    for (const j of starts.slice(0, 3)) sc[j] = emitJ(0, j);
    sc[OFF] = bestAudio[0] - 3;
    const bpA = [];
    for (let i = 1; i < B; i++) {
      let bestS = 0;
      for (let j = 1; j <= J; j++) if (sc[j] > sc[bestS]) bestS = j;
      const ns = new Float32Array(J + 1).fill(-1e9), ptr = new Int32Array(J + 1).fill(-1);
      const offer = (j, v, from) => { if (v > ns[j]) { ns[j] = v; ptr[j] = from; } };
      for (let j = 0; j < J; j++) {
        if (sc[j] <= -1e8) continue;
        offer(j + 1 < J ? j + 1 : OFF, sc[j], j);        // advance one beat
        offer(j, sc[j] - 2.5, j);                         // hold (slower)
        if (j + 2 < J) offer(j + 2, sc[j] - 2.5, j);      // skip (faster)
      }
      offer(OFF, sc[OFF] - 0.2, OFF);
      for (const j of starts) offer(j, sc[bestS] - 6, bestS); // jump to a bar start (repeats, D.S., cuts)
      offer(OFF, sc[bestS] - 6, bestS);
      for (let j = 0; j <= J; j++) if (ns[j] > -1e8) ns[j] += j === OFF ? bestAudio[i] - 1.5 : emitJ(i, j);
      bpA.push(ptr); sc = ns;
    }
    let j = 0;
    for (let q = 1; q <= J; q++) if (sc[q] > sc[j]) j = q;
    const path = new Int32Array(B);
    path[B - 1] = j;
    for (let i = B - 2; i >= 0; i--) path[i] = j = bpA[i][j];
    src = new Array(U).fill('audio');
    sheetSym = new Array(U).fill(null);
    for (let i = 0; i < B; i++) {
      const sl = path[i] < J ? sheet.slots[path[i]] : null;
      if (!sl) { report.audioFilled++; continue; }
      for (const u of [2 * i, 2 * i + 1]) {
        const agree = triadOf(lab[u]) === triadOf(sl.state) || lab[u] === sl.state;
        if (sl.carried && !agree) { report.audioFilled++; continue; } // only carried over, and the recording disagrees
        lab[u] = sl.state; sheetSym[u] = sl.sym; src[u] = agree ? 'both' : 'sheet';
      }
    }
    // a written change may be pushed an eighth early in the performance
    for (let u = 2; u < U; u += 2) {
      if (sheetSym[u] && sheetSym[u] !== sheetSym[u - 1] && sheetSym[u - 1]) {
        if (emitOf(u - 1, lab[u], keys) > emitOf(u - 1, lab[u - 1], keys) + 0.8) { lab[u - 1] = lab[u]; sheetSym[u - 1] = sheetSym[u]; src[u - 1] = src[u]; report.anticipations++; }
      }
    }
  }

  /* ---- output ---- */
  post(0.97, 'Writing the chord chart');
  const segments = [];
  for (let u = 0; u < U;) {
    let v = u + 1;
    while (v < U && lab[v] === lab[u] && (!sheetSym || sheetSym[v] === sheetSym[u])) v++;
    const st = lab[u] === NST ? null : STATES[lab[u]];
    let mg = 0, aiP = 0, aiTop = 0, dspTop = 0;
    for (let q = u; q < v; q++) {
      mg += margin(q, lab[u]);
      if (aiLog) {
        aiP += Math.exp(aiLog[q * (S + 1) + lab[u]]);
        let bk = 0;
        for (let k = 1; k <= S; k++) if (aiLog[q * (S + 1) + k] > aiLog[q * (S + 1) + bk]) bk = k;
        if (triadOf(bk) === triadOf(lab[u])) aiTop++;
      }
      let bd = 0;
      for (let k = 1; k < S; k++) if (sims[q * S + k] > sims[q * S + bd]) bd = k;
      if (triadOf(bd) === triadOf(lab[u])) dspTop++;
    }
    const len = v - u;
    mg /= len; aiP /= len;
    let conf;
    if (!st) conf = 1;
    else if (aiLog) {
      const agreeFrac = (aiTop + dspTop) / (2 * len);
      conf = Math.max(0, Math.min(1, 0.25 + 0.45 * agreeFrac + 0.5 * aiP + mg * 2));
      if (aiTop / len > 0.5 && dspTop / len > 0.5) report.agree++;
    } else conf = Math.max(0, Math.min(1, 0.45 + mg * 6));
    const source = src ? (src.slice(u, v).includes('sheet') ? 'sheet' : src.slice(u, v).includes('both') ? 'both' : 'audio') : null;
    if (source === 'both' || source === 'sheet') { report.sheetChords++; if (source === 'sheet') report.sheetDisagree++; }
    if (source === 'both' || source === 'sheet') conf = Math.max(conf, source === 'both' ? 0.95 : 0.75);
    if (cls[u] === 3) report.anticipations++;
    segments.push({
      root: st ? st.root : null, s: st ? st.s : null, sym: sheetSym ? sheetSym[u] : null,
      beats: len / 2, start: ub[u], end: ub[v], bar: barOf[u], pos: pos[u >> 1] + (u % 2) / 2, key: keys[u],
      conf: +conf.toFixed(2), src: source,
    });
    u = v;
  }
  const regions = [];
  barKeys.forEach((k, b) => {
    const r = regions[regions.length - 1];
    if (r && r.k === k) { r.endBar = b + 1; r.end = ub[bars[b][1]]; }
    else regions.push({ k, pc: DIA[k].pc, mode: DIA[k].minor ? 'minor' : 'major', startBar: b, endBar: b + 1, start: ub[bars[b][0]], end: ub[bars[b][1]] });
  });
  report.unsure = segments.filter((s2) => s2.root != null && s2.conf < 0.45).length;
  report.chords = segments.filter((s2) => s2.root != null).length;
  report.engine = ai ? 'ai+dsp' : 'dsp';
  let debug = null;
  if (self.FK_DEBUG) {
    const top = (arr, u, n) => { let b = 0; for (let k = 1; k < n; k++) if (arr[u * n + k] > arr[u * n + b]) b = k; return b; };
    const nm = (k) => (k >= S ? 'N' : ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][STATES[k].root] + STATES[k].s);
    debug = [];
    for (let u = 0; u < Math.min(U, 40); u++) debug.push(`${ub[u].toFixed(2)} c${cls[u]} ai=${aiLog ? nm(top(aiLog, u, S + 1)) : '-'} dsp=${nm(top(sims, u, S))} -> ${nm(lab[u])}`);
  }
  post(1, 'Done');
  return { bpm, meter: M, bars: bars.length, beats: bts, tuning, regions, segments, duration: dur, report, debug };
}

self.onmessage = (e) => {
  self.FK_DEBUG = !!e.data.debug;
  try { self.postMessage({ type: 'result', result: analyse(e.data) }); }
  catch (err) { self.postMessage({ type: 'error', message: String((err && err.stack) || err) }); }
};
