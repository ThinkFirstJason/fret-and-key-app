/* Fret & Key — music theory engine: notes, spelling, scales, chords, keys, roman numerals */
(function () {
  'use strict';
  const FK = (window.FK = window.FK || {});

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const ROOT_LABELS = ['C', 'C♯/D♭', 'D', 'E♭', 'E', 'F', 'F♯/G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const DEG_SEMI = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12, 9: 14, 11: 17, 13: 21 };

  const INTERVALS = [
    { short: 'P1', name: 'Unison' }, { short: 'm2', name: 'Minor 2nd' }, { short: 'M2', name: 'Major 2nd' },
    { short: 'm3', name: 'Minor 3rd' }, { short: 'M3', name: 'Major 3rd' }, { short: 'P4', name: 'Perfect 4th' },
    { short: 'TT', name: 'Tritone' }, { short: 'P5', name: 'Perfect 5th' }, { short: 'm6', name: 'Minor 6th' },
    { short: 'M6', name: 'Major 6th' }, { short: 'm7', name: 'Minor 7th' }, { short: 'M7', name: 'Major 7th' },
    { short: 'P8', name: 'Octave' },
  ];
  const SEMI_LABEL = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];

  const mod = (n, m = 12) => ((n % m) + m) % m;

  function parseDegree(d) {
    const m = /^(bb|b|##|#)?(\d+)$/.exec(d);
    if (!m) throw new Error('Bad degree ' + d);
    const acc = { bb: -2, b: -1, '#': 1, '##': 2 }[m[1]] || 0;
    const n = +m[2];
    return { semi: DEG_SEMI[n] + acc, letter: (n - 1) % 7, n, num: ((n - 1) % 7) + 1, label: d };
  }

  function pcOf(name) {
    const m = /^([A-Ga-g])((?:#|b|x|♯|♭)*)/.exec(String(name).trim());
    if (!m) return null;
    let pc = LETTER_PC[LETTERS.indexOf(m[1].toUpperCase())];
    for (const ch of m[2]) pc += ch === '#' || ch === '♯' ? 1 : ch === 'x' ? 2 : -1;
    return mod(pc);
  }

  const accStr = (n) => (n === 0 ? '' : n > 0 ? '#'.repeat(n) : 'b'.repeat(-n));

  /* Turn ASCII accidentals into proper glyphs for display */
  function pretty(s) {
    return String(s)
      .replace(/([A-G])bb/g, '$1♭♭')
      .replace(/([A-G])b/g, '$1♭')
      .replace(/\bbb(\d)/g, '♭♭$1')
      .replace(/b(\d)/g, '♭$1')
      .replace(/##/g, '♯♯')
      .replace(/#/g, '♯');
  }

  /* Spell degrees from a root, using one letter per scale step */
  function spellDegrees(rootName, degs) {
    const rp = pcOf(rootName);
    const L = LETTERS.indexOf(rootName[0].toUpperCase());
    return degs.map((d) => {
      const D = typeof d === 'string' ? parseDegree(d) : d;
      const li = (L + D.letter) % 7;
      const target = mod(rp + D.semi);
      let diff = mod(target - LETTER_PC[li]);
      if (diff > 6) diff -= 12;
      if (Math.abs(diff) > 2) return MAJOR_NAMES[target];
      return LETTERS[li] + accStr(diff);
    });
  }

  function midiName(midi, flats) {
    const names = flats ? FLAT_NAMES : SHARP_NAMES;
    return names[mod(midi)] + (Math.floor(midi / 12) - 1);
  }
  function nameToMidi(n) {
    const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(n.trim());
    if (!m) return null;
    return pcOf(m[1]) + (parseInt(m[2], 10) + 1) * 12;
  }

  /* ---------------- Scales ---------------- */
  const SCALES = [
    { id: 'major', name: 'Major (Ionian)', group: 'Essentials', f: '1 2 3 4 5 6 7', mood: 'Bright · stable · resolved',
      desc: 'The foundation of Western harmony. Every other scale is usually described as an alteration of this one.' },
    { id: 'minor', name: 'Natural Minor (Aeolian)', group: 'Essentials', f: '1 2 b3 4 5 b6 b7', mood: 'Dark · emotional · reflective',
      desc: 'The relative minor of the major scale — same notes, starting on the 6th degree. Rock ballads, pop and film music live here.' },
    { id: 'majPent', name: 'Major Pentatonic', group: 'Essentials', f: '1 2 3 5 6', mood: 'Sweet · open · country',
      desc: 'Five notes with no half-steps, so nothing clashes. Fantastic for melodies and solos over major chords.' },
    { id: 'minPent', name: 'Minor Pentatonic', group: 'Essentials', f: '1 b3 4 5 b7', mood: 'Bluesy · rock · gritty',
      desc: 'The rock & blues workhorse. “Box 1” of this scale is the first lead pattern most guitarists learn.' },
    { id: 'blues', name: 'Blues', group: 'Essentials', f: '1 b3 4 b5 5 b7', mood: 'Raw · soulful',
      desc: 'Minor pentatonic plus the ♭5 “blue note”. Use the ♭5 as a passing tone for instant attitude.' },
    { id: 'majBlues', name: 'Major Blues', group: 'Essentials', f: '1 2 b3 3 5 6', mood: 'Happy blues · country',
      desc: 'Major pentatonic plus a ♭3 that slides into the major 3rd — classic country, Allman Brothers and swing.' },
    { id: 'dorian', name: 'Dorian', group: 'Modes', f: '1 2 b3 4 5 6 b7', mood: 'Minor but hopeful',
      desc: 'Minor with a bright natural 6th. Think Santana, funk grooves, “Oye Como Va” and “So What”.' },
    { id: 'phrygian', name: 'Phrygian', group: 'Modes', f: '1 b2 b3 4 5 b6 b7', mood: 'Spanish · dark · metal',
      desc: 'Minor with a ♭2 right above the root. That half-step gives flamenco and metal their tension.' },
    { id: 'lydian', name: 'Lydian', group: 'Modes', f: '1 2 3 #4 5 6 7', mood: 'Dreamy · floating',
      desc: 'Major with a raised 4th. Film composers love it for wonder and flight (think Spielberg scores).' },
    { id: 'mixolydian', name: 'Mixolydian', group: 'Modes', f: '1 2 3 4 5 6 b7', mood: 'Bluesy major · rock',
      desc: 'Major with a ♭7 — the sound of dominant chords, classic rock riffs and Celtic tunes.' },
    { id: 'locrian', name: 'Locrian', group: 'Modes', f: '1 b2 b3 4 b5 b6 b7', mood: 'Unstable · tense',
      desc: 'Its tonic chord is diminished, so it rarely works as a home key — but it fits m7♭5 chords perfectly.' },
    { id: 'harmMinor', name: 'Harmonic Minor', group: 'Minor family', f: '1 2 b3 4 5 b6 7', mood: 'Exotic · classical',
      desc: 'Natural minor with a raised 7th, giving a strong pull to the root and an exotic gap between ♭6 and 7.' },
    { id: 'melMinor', name: 'Melodic Minor (jazz)', group: 'Minor family', f: '1 2 b3 4 5 6 7', mood: 'Smooth · jazzy',
      desc: 'Minor 3rd with a major-scale top half. The parent of many jazz sounds like Lydian dominant and altered.' },
    { id: 'phrygDom', name: 'Phrygian Dominant', group: 'Exotic', f: '1 b2 3 4 5 b6 b7', mood: 'Middle-Eastern · flamenco',
      desc: 'The 5th mode of harmonic minor — a major 3rd with a ♭2. Hugely popular in metal and Spanish music.' },
    { id: 'lydDom', name: 'Lydian Dominant', group: 'Exotic', f: '1 2 3 #4 5 6 b7', mood: 'Bright with bite',
      desc: 'Mixolydian with a ♯4 (the “Simpsons theme” sound). Great over 7♯11 chords.' },
    { id: 'hungMinor', name: 'Hungarian Minor', group: 'Exotic', f: '1 2 b3 #4 5 b6 7', mood: 'Gypsy · dramatic',
      desc: 'Harmonic minor with a raised 4th — two augmented 2nds make it dramatic and theatrical.' },
    { id: 'wholeTone', name: 'Whole Tone', group: 'Symmetric', f: '1 2 3 #4 #5 b7', mood: 'Dreamlike · ambiguous',
      desc: 'Only whole steps, so there is no sense of “home”. Debussy and dream sequences.' },
    { id: 'dimWH', name: 'Diminished (W–H)', group: 'Symmetric', f: '1 2 b3 4 b5 b6 6 7', mood: 'Tense · symmetric',
      desc: 'Alternating whole and half steps. Fits diminished 7th chords.' },
    { id: 'dimHW', name: 'Diminished (H–W)', group: 'Symmetric', f: '1 b2 b3 3 #4 5 6 b7', mood: 'Jazzy tension',
      desc: 'Alternating half and whole steps — the go-to sound over 7♭9 dominant chords.' },
    { id: 'altered', name: 'Altered (Super Locrian)', group: 'Symmetric', f: '1 b2 #2 3 b5 #5 b7', mood: 'Maximum tension',
      desc: 'Every possible alteration of a dominant chord. Used over V7 right before resolving.' },
    { id: 'hirajoshi', name: 'Hirajoshi', group: 'World', f: '1 2 b3 5 b6', mood: 'Japanese · haunting',
      desc: 'A Japanese pentatonic scale with a koto-like, haunting character.' },
    { id: 'inSen', name: 'In Sen', group: 'World', f: '1 b2 4 5 b7', mood: 'Sparse · meditative',
      desc: 'A Japanese pentatonic with a ♭2. Spacious and mysterious.' },
    { id: 'chromatic', name: 'Chromatic', group: 'World', f: '1 b2 2 b3 3 4 b5 5 b6 6 b7 7', mood: 'All 12 notes',
      desc: 'Every semitone. Useful for warm-ups and seeing the whole layout of the instrument.' },
  ];
  SCALES.forEach((s) => {
    s.degs = s.f.split(' ').map(parseDegree);
    s.minorish = s.f.includes('b3') && !/(^| )3( |$)/.test(s.f);
  });
  const SCALE_MAP = Object.fromEntries(SCALES.map((s) => [s.id, s]));

  function rootNameFor(pc, minorish) {
    return (minorish ? MINOR_NAMES : MAJOR_NAMES)[mod(pc)];
  }

  function scaleNotes(rootPc, id, rootName) {
    const sc = SCALE_MAP[id];
    const rn = rootName || rootNameFor(rootPc, sc.minorish);
    const names = id === 'chromatic' ? sc.degs.map((d) => (sc.minorish ? MINOR_NAMES : MAJOR_NAMES)[mod(rootPc + d.semi)]) : spellDegrees(rn, sc.degs);
    return sc.degs.map((d, i) => ({ pc: mod(rootPc + d.semi), name: names[i], deg: d.label, num: d.num, semi: d.semi }));
  }

  /* ---------------- Chords ---------------- */
  const CHORDS = [
    { s: '', name: 'Major', f: '1 3 5', group: 'Triads', desc: 'Root, major 3rd, perfect 5th. Bright and stable — the “home” sound of major keys.' },
    { s: 'm', name: 'Minor', f: '1 b3 5', group: 'Triads', desc: 'Lower the 3rd by a half-step and major turns sad, serious or moody.' },
    { s: 'dim', name: 'Diminished', f: '1 b3 b5', group: 'Triads', desc: 'Two stacked minor 3rds. Tense and unstable; it wants to resolve.' },
    { s: 'aug', name: 'Augmented', f: '1 3 #5', group: 'Triads', desc: 'Two stacked major 3rds. Eerie and suspenseful, often used as a passing chord.' },
    { s: 'sus2', name: 'Suspended 2nd', f: '1 2 5', group: 'Sus & Power', desc: 'The 3rd is replaced with the 2nd: open, airy, neither major nor minor.' },
    { s: 'sus4', name: 'Suspended 4th', f: '1 4 5', group: 'Sus & Power', desc: 'The 3rd is replaced by the 4th, which usually resolves back down to the 3rd.' },
    { s: '5', name: 'Power chord', f: '1 5', group: 'Sus & Power', desc: 'Just root and 5th (often with the octave). The backbone of rock and metal; works through distortion.' },
    { s: '7sus4', name: 'Dominant 7 sus4', f: '1 4 5 b7', group: 'Sus & Power', desc: 'A dominant 7th with a suspended 4th — a softer, modern V chord.' },
    { s: 'maj7', name: 'Major 7th', f: '1 3 5 7', group: 'Sevenths', desc: 'Major triad plus a major 7th. Lush, dreamy, jazzy and neo-soul.' },
    { s: '7', name: 'Dominant 7th', f: '1 3 5 b7', group: 'Sevenths', desc: 'Major triad plus a ♭7. Bluesy and restless; the V7 chord pulls hard toward the tonic.' },
    { s: 'm7', name: 'Minor 7th', f: '1 b3 5 b7', group: 'Sevenths', desc: 'Minor triad plus ♭7. Smooth and mellow — the ii chord in jazz ii–V–I.' },
    { s: 'm7b5', name: 'Half-diminished', f: '1 b3 b5 b7', group: 'Sevenths', desc: 'Diminished triad plus ♭7 (ø7). The ii chord in minor-key ii–V–i progressions.' },
    { s: 'dim7', name: 'Diminished 7th', f: '1 b3 b5 bb7', group: 'Sevenths', desc: 'Stacked minor 3rds all the way up. Symmetric — it repeats every 3 frets.' },
    { s: 'mMaj7', name: 'Minor-major 7th', f: '1 b3 5 7', group: 'Sevenths', desc: 'Minor triad with a major 7th. The spy-movie / film-noir chord.' },
    { s: '6', name: 'Major 6th', f: '1 3 5 6', group: 'Sixths & Adds', desc: 'Major triad plus the 6th. Sweet, vintage, swing-era sound.' },
    { s: 'm6', name: 'Minor 6th', f: '1 b3 5 6', group: 'Sixths & Adds', desc: 'Minor triad plus the major 6th — a dorian, bittersweet colour.' },
    { s: 'add9', name: 'Add 9', f: '1 3 5 9', group: 'Sixths & Adds', desc: 'A major triad with the 9th added (no 7th). Shimmering and modern.' },
    { s: 'madd9', name: 'Minor add 9', f: '1 b3 5 9', group: 'Sixths & Adds', desc: 'Minor triad with an added 9th — emotional and cinematic.' },
    { s: '6add9', name: '6/9', f: '1 3 5 6 9', group: 'Sixths & Adds', opt: '5', desc: 'Major with both 6th and 9th. A sophisticated, resolved jazz tonic.' },
    { s: '9', name: 'Dominant 9th', f: '1 3 5 b7 9', group: 'Extended', opt: '5', desc: 'Dominant 7th plus the 9th. Funk and R&B staple.' },
    { s: 'maj9', name: 'Major 9th', f: '1 3 5 7 9', group: 'Extended', opt: '5', desc: 'Major 7th plus the 9th — lush and glossy.' },
    { s: 'm9', name: 'Minor 9th', f: '1 b3 5 b7 9', group: 'Extended', opt: '5', desc: 'Minor 7th plus the 9th. Smooth soul and neo-soul favourite.' },
    { s: '11', name: 'Dominant 11th', f: '1 3 5 b7 9 11', group: 'Extended', opt: '3 5 9', desc: 'Usually played without the 3rd, so it sounds like a big sus chord.' },
    { s: 'm11', name: 'Minor 11th', f: '1 b3 5 b7 9 11', group: 'Extended', opt: '5 9', desc: 'Open, modal and spacious — great for dorian grooves.' },
    { s: '13', name: 'Dominant 13th', f: '1 3 5 b7 9 13', group: 'Extended', opt: '5 9', desc: 'Dominant 7th with the 13th on top. Classic jazz and funk sound.' },
    { s: '7b9', name: '7♭9', f: '1 3 5 b7 b9', group: 'Altered', opt: '5', desc: 'Dominant with a flat 9 — dark tension that resolves strongly to minor.' },
    { s: '7#9', name: '7♯9 (“Hendrix”)', f: '1 3 5 b7 #9', group: 'Altered', opt: '5', desc: 'The “Purple Haze” chord: major 3rd and minor 3rd (as ♯9) at once.' },
    { s: '7b5', name: '7♭5', f: '1 3 b5 b7', group: 'Altered', desc: 'Dominant with a flattened 5th — a tritone-rich jazz sound.' },
    { s: '7#5', name: '7♯5 (aug 7)', f: '1 3 #5 b7', group: 'Altered', desc: 'Augmented triad plus ♭7. Pushes strongly to the next chord.' },
    { s: '7#11', name: '7♯11', f: '1 3 5 b7 #11', group: 'Altered', opt: '5', desc: 'Lydian-dominant colour — bright and modern.' },
    { s: 'maj7#5', name: 'Maj7♯5', f: '1 3 #5 7', group: 'Altered', desc: 'Augmented major 7th — appears as the III chord of harmonic & melodic minor.' },
  ];
  CHORDS.forEach((c) => {
    c.degs = c.f.split(' ').map(parseDegree);
    const opt = c.opt ? c.opt.split(' ') : c.degs.length >= 4 ? ['5'] : [];
    c.optional = opt;
    c.display = pretty(c.s === '6add9' ? '6/9' : c.s);
  });
  const CHORD_MAP = Object.fromEntries(CHORDS.map((c) => [c.s, c]));
  const ALIASES = {
    M: '', maj: '', major: '', min: 'm', '-': 'm', mi: 'm', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', ma7: 'maj7',
    min7: 'm7', '-7': 'm7', mi7: 'm7', 'ø': 'm7b5', 'ø7': 'm7b5', 'm7(b5)': 'm7b5', o: 'dim', '°': 'dim', o7: 'dim7', '°7': 'dim7',
    '+': 'aug', '+7': '7#5', aug7: '7#5', sus: 'sus4', '7sus': '7sus4', add2: 'add9', madd2: 'madd9', mmaj7: 'mMaj7', 'm(maj7)': 'mMaj7',
    '69': '6add9', '6/9': '6add9', dom7: '7', '7+5': '7#5', '7-5': '7b5', '7-9': '7b9', '7+9': '7#9', maj7: 'maj7',
  };

  function chordDef(suffix) {
    return CHORD_MAP[suffix] || CHORD_MAP[ALIASES[suffix]] || null;
  }

  function chordNotes(rootName, suffix) {
    const def = chordDef(suffix);
    const names = spellDegrees(rootName, def.degs);
    const rp = pcOf(rootName);
    return def.degs.map((d, i) => ({ pc: mod(rp + d.semi), name: names[i], deg: d.label === '1' ? 'R' : d.label, num: d.num, semi: d.semi }));
  }

  function chordLabel(rootName, suffix) {
    const def = chordDef(suffix);
    return pretty(rootName) + (def ? def.display : pretty(suffix));
  }

  /* Parse a chord symbol like "F#m7b5", "D/F#", "Bb6/9" */
  function parseChord(sym, strict) {
    if (!sym) return null;
    let s = String(sym).trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace('6/9', '69');
    const m = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/.exec(s);
    if (!m) return null;
    let suffix = m[2];
    let def = chordDef(suffix);
    if (!def && strict) return null;
    if (!def) {
      // graceful fallback: guess the closest family
      const low = suffix.toLowerCase();
      if (/^(m|min)(?!aj)/.test(suffix)) def = CHORD_MAP[/7/.test(low) ? 'm7' : 'm'];
      else if (/dim/.test(low)) def = CHORD_MAP.dim;
      else if (/sus/.test(low)) def = CHORD_MAP.sus4;
      else if (/maj7|M7/.test(suffix)) def = CHORD_MAP.maj7;
      else if (/7|9|13/.test(low)) def = CHORD_MAP['7'];
      else def = CHORD_MAP[''];
    }
    const root = m[1];
    const bass = m[3] || null;
    return {
      sym: s, root, rootPc: pcOf(root), suffix: def.s, def,
      bass, bassPc: bass ? pcOf(bass) : null,
      label: chordLabel(root, def.s) + (bass ? '/' + pretty(bass) : ''),
    };
  }

  function triadClass(defOrSuffix) {
    const def = typeof defOrSuffix === 'string' ? chordDef(defOrSuffix) : defOrSuffix;
    const f = ' ' + def.f + ' ';
    if (f.includes(' 3 ') && f.includes(' #5 ')) return 'aug';
    if (f.includes(' b3 ') && f.includes(' b5 ')) return 'dim';
    if (f.includes(' 3 ')) return 'maj';
    if (f.includes(' b3 ')) return 'min';
    return 'any';
  }

  /* ---------------- Keys, diatonic harmony, roman numerals ---------------- */
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const MINOR_QUALITIES = ['m', 'm7', 'dim', 'm7b5', 'dim7', 'mMaj7', 'm6', 'm9', 'madd9', 'm11'];
  const TRIAD_BY_INT = { '4,7': '', '3,7': 'm', '3,6': 'dim', '4,8': 'aug', '4,6': '7b5', '2,7': 'sus2', '5,7': 'sus4' };
  const SEVENTH_BY_INT = {
    '4,7,11': 'maj7', '4,7,10': '7', '3,7,10': 'm7', '3,6,10': 'm7b5', '3,6,9': 'dim7',
    '3,7,11': 'mMaj7', '4,8,11': 'maj7#5', '4,8,10': '7#5',
  };

  function romanSuffix(suffix) {
    switch (suffix) {
      case '': case 'm': return '';
      case 'dim': return '°';
      case 'm7b5': return 'ø7';
      case 'dim7': return '°7';
      case 'aug': return '+';
      case '7#5': return '+7';
      case 'maj7#5': return '+maj7';
      case 'mMaj7': return '(maj7)';
      default: return pretty(suffix.replace(/^m(?!aj)/, ''));
    }
  }

  function romanBase(numeral, suffix) {
    return MINOR_QUALITIES.includes(suffix) ? numeral.toLowerCase() : numeral;
  }

  function diatonicChords(keyPc, scaleId = 'major', sevenths = false, rootName) {
    const notes = scaleNotes(keyPc, scaleId, rootName);
    if (notes.length !== 7) return [];
    return notes.map((n, i) => {
      const i3 = mod(notes[(i + 2) % 7].pc - n.pc);
      const i5 = mod(notes[(i + 4) % 7].pc - n.pc);
      const i7 = mod(notes[(i + 6) % 7].pc - n.pc);
      let suffix = TRIAD_BY_INT[i3 + ',' + i5] ?? '';
      if (sevenths) suffix = SEVENTH_BY_INT[i3 + ',' + i5 + ',' + i7] ?? suffix;
      return {
        rootPc: n.pc, root: n.name, suffix, degree: i,
        name: n.name + suffix, label: chordLabel(n.name, suffix),
        roman: romanBase(ROMAN[i], suffix) + romanSuffix(suffix),
      };
    });
  }

  const MAJOR_TABLE = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'];
  const MINOR_TABLE = ['I', '♭II', 'II', 'III', '♮III', 'IV', '♭V', 'V', 'VI', '♮VI', 'VII', '♮VII'];
  const MODE_SCALE = { major: 'major', minor: 'minor', dorian: 'dorian', mixolydian: 'mixolydian', lydian: 'lydian', phrygian: 'phrygian', locrian: 'locrian', harmonic: 'harmMinor' };

  function isMinorMode(mode) {
    const sc = SCALE_MAP[MODE_SCALE[mode] || 'major'];
    return sc.minorish;
  }

  function romanFor(chordRootPc, suffix, keyPc, mode = 'major') {
    const iv = mod(chordRootPc - keyPc);
    const table = isMinorMode(mode) ? MINOR_TABLE : MAJOR_TABLE;
    let numeral = table[iv];
    // the leading-tone diminished chord in minor is conventionally written vii° without an accidental
    if (table === MINOR_TABLE && iv === 11 && ['dim', 'dim7', 'm7b5'].includes(suffix)) numeral = 'VII';
    const acc = numeral.replace(/[IV]+/, '');
    const core = numeral.replace(/[♭♯♮]/, '');
    return acc + romanBase(core, suffix) + romanSuffix(suffix);
  }

  function keyName(pc, mode = 'major') {
    const minor = isMinorMode(mode);
    const n = pretty(rootNameFor(pc, minor));
    if (mode === 'major') return n + ' major';
    if (mode === 'minor') return n + ' minor';
    return n + ' ' + mode;
  }
  function keyRootName(pc, mode = 'major') { return rootNameFor(pc, isMinorMode(mode)); }

  /* Parse a roman numeral progression token in a key: "bVII", "ii7", "V7", "vii°", "iiø7" */
  function parseRoman(tok, keyPc, mode = 'major') {
    const m = /^([b#♭♯]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|ø|\+)?(maj7|7)?$/.exec(tok);
    if (!m) return null;
    const minorKey = isMinorMode(mode);
    const up = m[2].toUpperCase();
    const idx = ROMAN.indexOf(up);
    const scaleId = minorKey ? 'minor' : 'major';
    const sc = scaleNotes(keyPc, scaleId);
    let pc = sc[idx].pc;
    let name = sc[idx].name;
    const acc = m[1].replace('♭', 'b').replace('♯', '#');
    if (acc) {
      pc = mod(pc + (acc === 'b' ? -1 : 1));
      const letter = name[0];
      const diff = mod(pc - LETTER_PC[LETTERS.indexOf(letter)]);
      const d = diff > 6 ? diff - 12 : diff;
      name = Math.abs(d) <= 2 ? letter + accStr(d) : MAJOR_NAMES[pc];
    }
    const lower = m[2] === m[2].toLowerCase();
    let suffix = lower ? 'm' : '';
    if (m[3] === '°') suffix = m[4] === '7' ? 'dim7' : 'dim';
    else if (m[3] === 'ø') suffix = 'm7b5';
    else if (m[3] === '+') suffix = m[4] === '7' ? '7#5' : 'aug';
    else if (m[4] === 'maj7') suffix = lower ? 'mMaj7' : 'maj7';
    else if (m[4] === '7') suffix = lower ? 'm7' : '7';
    return { rootPc: pc, root: name, suffix, label: chordLabel(name, suffix), roman: tok };
  }

  /* Rank likely keys for a list of parsed chords */
  function detectKey(chords, all) {
    const list = chords.filter(Boolean);
    if (!list.length) return [];
    const results = [];
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const mode of ['major', 'minor']) {
        const dia = diatonicChords(tonic, mode);
        const scalePcs = new Set(dia.map((d) => d.rootPc));
        let score = 0;
        list.forEach((c) => {
          const q = triadClass(c.def);
          const d = dia.find((x) => x.rootPc === c.rootPc);
          if (d) {
            score += 1;
            const dq = triadClass(d.suffix);
            if (q === 'any' || q === dq) score += 1;
            else if (mode === 'minor' && mod(c.rootPc - tonic) === 7 && q === 'maj') score += 1.4;
            else score -= 0.4;
          } else {
            score -= 0.6;
          }
          if (!scalePcs.has(c.rootPc)) score -= 0.2;
        });
        const tonicQ = mode === 'major' ? 'maj' : 'min';
        const isTonic = (c) => c.rootPc === tonic && (triadClass(c.def) === tonicQ || triadClass(c.def) === 'any');
        if (isTonic(list[0])) score += 1.6;
        if (isTonic(list[list.length - 1])) score += 1.1;
        score += list.filter(isTonic).length * 0.35;
        results.push({ pc: tonic, mode, score, name: keyName(tonic, mode) });
      }
    }
    results.sort((a, b) => b.score - a.score);
    const max = results[0].score;
    const perfect = list.length * 2 + 3;
    return results.slice(0, all ? 24 : 4).map((r) => ({ ...r, confidence: Math.max(0, Math.min(1, r.score / perfect)), best: r.score === max }));
  }

  /* ---------------- Key signatures & circle ---------------- */
  const SIG_COUNT = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
  const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

  function keySignature(pc, mode = 'major') {
    const majPc = isMinorMode(mode) ? mod(pc + 3) : pc;
    const name = MAJOR_NAMES[majPc];
    const n = SIG_COUNT[name];
    return {
      count: n, majorName: name,
      accidentals: n > 0 ? SHARP_ORDER.slice(0, n).map((x) => x + '#') : FLAT_ORDER.slice(0, -n).map((x) => x + 'b'),
      text: n === 0 ? 'No sharps or flats' : n > 0 ? `${n} sharp${n > 1 ? 's' : ''}` : `${-n} flat${n < -1 ? 's' : ''}`,
    };
  }

  const CIRCLE = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5].map((pc, i) => {
    const minorPc = mod(pc + 9);
    const majorLabel = pc === 6 ? 'F♯/G♭' : pretty(MAJOR_NAMES[pc]);
    const minorLabel = minorPc === 3 ? 'E♭m/D♯m' : pretty(MINOR_NAMES[minorPc]) + 'm';
    const sig = keySignature(pc, 'major');
    return { i, pc, minorPc, majorLabel, minorLabel, sig };
  });

  const SEMI_STEP = { 1: 'H', 2: 'W', 3: 'W+H', 4: 'M3' };
  function stepPattern(id) {
    const s = SCALE_MAP[id];
    const semis = s.degs.map((d) => d.semi).concat(12);
    const out = [];
    for (let i = 1; i < semis.length; i++) out.push(SEMI_STEP[semis[i] - semis[i - 1]] || semis[i] - semis[i - 1] + 'st');
    return out;
  }

  FK.theory = {
    LETTERS, LETTER_PC, MAJOR_NAMES, MINOR_NAMES, SHARP_NAMES, FLAT_NAMES, ROOT_LABELS, INTERVALS, SEMI_LABEL,
    SCALES, SCALE_MAP, CHORDS, CHORD_MAP, CIRCLE, MODE_SCALE,
    mod, parseDegree, pcOf, pretty, spellDegrees, midiName, nameToMidi, rootNameFor,
    scaleNotes, stepPattern, chordDef, chordNotes, chordLabel, parseChord, triadClass,
    diatonicChords, romanFor, keyName, keyRootName, isMinorMode, parseRoman, detectKey, keySignature,
    midiFreq: (m) => 440 * Math.pow(2, (m - 69) / 12),
  };
})();
