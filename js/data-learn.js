/*
 * Fret & Key — lessons & glossary.
 * Interactive buttons inside lessons:
 *   data-notes="C4 E4 G4" [data-how="chord"]   play notes (in sequence, or together)
 *   data-chord="C:maj7"                         show + play a chord (root:suffix)
 *   data-scale="A:minPent"                      show + play a scale (root:scale id)
 *   data-prog="C:major:I V vi IV"               play a progression
 */
(function () {
  'use strict';
  const FK = window.FK;
  const h = (attrs, label) => `<button class="hear" ${attrs}>${label}</button>`;
  const notes = (n, label, how) => h(`data-notes="${n}"${how ? ` data-how="${how}"` : ''}`, label);
  const chord = (c, label) => h(`data-chord="${c}"`, label);
  const scale = (s, label) => h(`data-scale="${s}"`, label);
  const prog = (p, label) => h(`data-prog="${p}"`, label);

  FK.LESSONS = [
    {
      id: 'alphabet', title: 'The musical alphabet', icon: 'A',
      lead: 'Western music uses just 12 different notes. Everything else — every scale, chord and song — is a pattern built from them.',
      body: `
        <h3>Seven letters, twelve notes</h3>
        <p>The natural notes are named with the letters <strong>A B C D E F G</strong>, then the pattern repeats. Between most of them sits an extra note, named with a <strong>sharp (♯)</strong> or <strong>flat (♭)</strong>: C♯ is the same pitch as D♭. Two names for one pitch are called <em>enharmonic</em>.</p>
        <p>${notes('C4 C#4 D4 D#4 E4 F4 F#4 G4 G#4 A4 A#4 B4 C5', 'Hear all 12 notes (chromatic scale)')}</p>
        <div class="callout tip"><strong>The two “missing” black keys.</strong> There is no note between <strong>E–F</strong> or <strong>B–C</strong>. On a piano you can see it: those pairs of white keys have no black key between them. Every pattern you learn later depends on this quirk.</div>
        <h3>Octaves</h3>
        <p>After 12 notes you arrive back at the same letter, but higher — an <strong>octave</strong>. The two notes vibrate at a 2:1 ratio and sound like the “same note”. We number octaves so we can tell them apart: middle C is <strong>C4</strong>.</p>
        <p>${notes('C3 C4 C5', 'C3 → C4 → C5')} ${notes('A3 A4', 'A3 + A4 together', 'chord')}</p>
        <h3>Find them on your instrument</h3>
        <p><strong>Piano:</strong> C is always the white key just left of a group of two black keys. <strong>Guitar:</strong> each fret raises a note by one of those 12 steps; the 12th fret is the octave of the open string, which is why the neck pattern repeats there.</p>`,
    },
    {
      id: 'steps', title: 'Half steps & whole steps', icon: '½',
      lead: 'The distance between two notes is measured in steps — the ruler of music.',
      body: `
        <h3>The half step (semitone)</h3>
        <p>A <strong>half step</strong> is the smallest distance: one fret on guitar, or the very next key (black or white) on piano. ${notes('E4 F4', 'E → F')} ${notes('B3 C4', 'B → C')} ${notes('F#4 G4', 'F♯ → G')}</p>
        <h3>The whole step (tone)</h3>
        <p>A <strong>whole step</strong> is two half steps: two frets, or skipping one key. ${notes('C4 D4', 'C → D')} ${notes('E4 F#4', 'E → F♯')}</p>
        <div class="callout"><strong>Why this matters:</strong> every scale is just a recipe of whole (W) and half (H) steps. The major scale is <span class="formula-line">W W H W W W H</span> — start that recipe on any note and you get that note's major scale.</div>
        <p>${scale('C:major', 'C major (all white keys)')} ${scale('G:major', 'G major (needs one F♯)')}</p>`,
    },
    {
      id: 'intervals', title: 'Intervals', icon: '↕',
      lead: 'An interval is the distance between two notes — and each one has its own emotional colour.',
      body: `
        <table><thead><tr><th>Half steps</th><th>Interval</th><th>Sounds like</th><th></th></tr></thead><tbody>
          <tr><td>1</td><td>Minor 2nd</td><td>Jaws theme — tense</td><td>${notes('E4 F4', 'Hear')}</td></tr>
          <tr><td>2</td><td>Major 2nd</td><td>Happy Birthday (“Hap-py”)</td><td>${notes('C4 D4', 'Hear')}</td></tr>
          <tr><td>3</td><td>Minor 3rd</td><td>Greensleeves, Smoke on the Water — sad</td><td>${notes('A3 C4', 'Hear')}</td></tr>
          <tr><td>4</td><td>Major 3rd</td><td>When the Saints — bright</td><td>${notes('C4 E4', 'Hear')}</td></tr>
          <tr><td>5</td><td>Perfect 4th</td><td>Here Comes the Bride</td><td>${notes('C4 F4', 'Hear')}</td></tr>
          <tr><td>6</td><td>Tritone</td><td>The Simpsons, Maria — unstable</td><td>${notes('C4 F#4', 'Hear')}</td></tr>
          <tr><td>7</td><td>Perfect 5th</td><td>Star Wars, Twinkle Twinkle — open, strong</td><td>${notes('C4 G4', 'Hear')}</td></tr>
          <tr><td>8</td><td>Minor 6th</td><td>The Entertainer (opening leap)</td><td>${notes('E4 C5', 'Hear')}</td></tr>
          <tr><td>9</td><td>Major 6th</td><td>My Bonnie Lies Over the Ocean</td><td>${notes('C4 A4', 'Hear')}</td></tr>
          <tr><td>10</td><td>Minor 7th</td><td>Star Trek theme</td><td>${notes('C4 Bb4', 'Hear')}</td></tr>
          <tr><td>11</td><td>Major 7th</td><td>Take On Me (chorus leap)</td><td>${notes('C4 B4', 'Hear')}</td></tr>
          <tr><td>12</td><td>Octave</td><td>Somewhere Over the Rainbow</td><td>${notes('C4 C5', 'Hear')}</td></tr>
        </tbody></table>
        <div class="callout tip"><strong>Guitar shortcut:</strong> a perfect 5th is always the next string up, two frets higher (except across the G–B strings, which are tuned a major 3rd apart — add one fret there). That's the power-chord shape!</div>
        <p>Train your ear with the <strong>Interval Ear Trainer</strong> in the Practice tab.</p>`,
    },
    {
      id: 'major', title: 'The major scale', icon: '1',
      lead: 'Do-re-mi-fa-so-la-ti-do. The major scale is the reference point for almost everything else in music theory.',
      body: `
        <p>Recipe: <span class="formula-line">W W H W W W H</span> — or as numbers, <span class="formula-line">1 2 3 4 5 6 7</span>.</p>
        <p>${scale('C:major', 'Play C major')} ${scale('D:major', 'Play D major')} ${scale('E:major', 'Play E major')}</p>
        <h3>Scale degrees</h3>
        <p>We number the notes of the scale 1–7. Those numbers let us describe any other scale or chord by comparison: “a minor 3rd” or “a ♭3” simply means the 3rd degree of the major scale lowered by a half step.</p>
        <p>Each degree has a job. <strong>1</strong> (tonic) is home. <strong>5</strong> (dominant) is the strongest pull toward home. <strong>7</strong> (leading tone) is a half step below the tonic and practically begs to resolve upward. ${notes('C4 D4 E4 F4 G4 A4 B4', 'Stop on the 7th…')} ${notes('B4 C5', '…and resolve')}</p>
        <div class="callout"><strong>Guitar:</strong> open the Scales tab, pick Major, turn on “Focus a position” and step through the patterns with ← →. Each pattern is the same scale in a different spot on the neck.</div>`,
    },
    {
      id: 'minor', title: 'Minor scales', icon: 'm',
      lead: 'Lower three notes of the major scale and the mood changes completely.',
      body: `
        <h3>Natural minor</h3>
        <p><span class="formula-line">1 2 ♭3 4 5 ♭6 ♭7</span> — darker, more serious. ${scale('A:minor', 'A natural minor')}</p>
        <h3>Relative major & minor</h3>
        <p>A minor uses exactly the same notes as C major — just starting from A. Every major key has a <strong>relative minor</strong> on its 6th degree (3 half steps down). ${scale('C:major', 'C major')} ${scale('A:minor', 'A minor')}</p>
        <h3>Harmonic & melodic minor</h3>
        <p><strong>Harmonic minor</strong> raises the 7th, creating a strong leading tone and an exotic gap: ${scale('A:harmMinor', 'A harmonic minor')}. <strong>Melodic minor</strong> (jazz version) raises the 6th and 7th: ${scale('A:melMinor', 'A melodic minor')}.</p>
        <div class="callout tip">Most pop and rock “minor key” songs use natural minor but borrow a <strong>major V chord</strong> (from harmonic minor) for a stronger cadence: ${prog('A:minor:i iv V i', 'Am – Dm – E – Am')}</div>`,
    },
    {
      id: 'keys', title: 'Keys & key signatures', icon: '♯',
      lead: 'A key is a home base: a tonic note plus the scale built on it.',
      body: `
        <p>A song “in G major” mostly uses the notes of the G major scale and feels resolved on a G chord. Because G major needs one F♯, its <strong>key signature</strong> is one sharp.</p>
        <table><thead><tr><th>Sharps</th><th>Major key</th><th>Flats</th><th>Major key</th></tr></thead><tbody>
          <tr><td>0</td><td>C</td><td>1 (B♭)</td><td>F</td></tr>
          <tr><td>1 (F♯)</td><td>G</td><td>2</td><td>B♭</td></tr>
          <tr><td>2</td><td>D</td><td>3</td><td>E♭</td></tr>
          <tr><td>3</td><td>A</td><td>4</td><td>A♭</td></tr>
          <tr><td>4</td><td>E</td><td>5</td><td>D♭</td></tr>
          <tr><td>5</td><td>B</td><td>6</td><td>G♭</td></tr>
        </tbody></table>
        <div class="callout"><strong>Memory tricks.</strong> Sharps always appear in the order <strong>F C G D A E B</strong> (“Father Charles Goes Down And Ends Battle”); flats in reverse, <strong>B E A D G C F</strong>. For sharp keys, the key is a half step above the last sharp. For flat keys, it's the second-to-last flat.</div>
        <p>The <strong>Circle of Fifths</strong> tab shows all of this at a glance.</p>`,
    },
    {
      id: 'circle', title: 'The circle of fifths', icon: '◎',
      lead: 'Arrange the 12 keys by fifths and the whole system of keys clicks into place.',
      body: `
        <p>Start at C and keep going up a perfect 5th: C → G → D → A → E → B → F♯ … after 12 steps you are back at C. Each step clockwise adds one sharp; each step counter-clockwise adds one flat.</p>
        <h3>What it tells you</h3>
        <ul>
          <li><strong>Neighbours are related.</strong> Keys next to each other share 6 of 7 notes, so they're the smoothest keys to modulate to.</li>
          <li><strong>The I, IV and V chords of a key sit side by side.</strong> In C: F (IV) – C (I) – G (V). Their relative minors (ii, vi, iii) sit just inside.</li>
          <li><strong>Counter-clockwise is “going home”.</strong> Chords that move by descending 5ths (like ii → V → I) feel like gravity: ${prog('C:major:ii7 V7 Imaj7', 'Dm7 → G7 → Cmaj7')}</li>
        </ul>`,
    },
    {
      id: 'triads', title: 'Building triads', icon: '△',
      lead: 'Stack two thirds on top of a note and you have a chord.',
      body: `
        <p>A <strong>triad</strong> is a root, a 3rd and a 5th. Changing the size of those thirds gives the four triad qualities:</p>
        <table><thead><tr><th>Type</th><th>Formula</th><th>Sound</th><th></th></tr></thead><tbody>
          <tr><td>Major</td><td>1 3 5</td><td>Bright, stable</td><td>${chord('C:', 'C')}</td></tr>
          <tr><td>Minor</td><td>1 ♭3 5</td><td>Sad, serious</td><td>${chord('C:m', 'Cm')}</td></tr>
          <tr><td>Diminished</td><td>1 ♭3 ♭5</td><td>Tense, spooky</td><td>${chord('C:dim', 'C°')}</td></tr>
          <tr><td>Augmented</td><td>1 3 ♯5</td><td>Dreamlike, unresolved</td><td>${chord('C:aug', 'C+')}</td></tr>
        </tbody></table>
        <p>Suspended chords replace the 3rd: ${chord('D:sus2', 'Dsus2')} ${chord('D:sus4', 'Dsus4')} ${chord('D:', '→ D')}. Power chords drop the 3rd entirely: ${chord('E:5', 'E5')}</p>
        <div class="callout tip"><strong>Inversions:</strong> any chord tone can be in the bass. C/E (C with E in the bass) is the 1st inversion of C. Try the inversion buttons in the Chords tab on piano.</div>`,
    },
    {
      id: 'sevenths', title: 'Seventh chords & extensions', icon: '7',
      lead: 'Add one more third on top and chords get richer, jazzier and more directional.',
      body: `
        <table><thead><tr><th>Chord</th><th>Formula</th><th>Vibe</th><th></th></tr></thead><tbody>
          <tr><td>Major 7</td><td>1 3 5 7</td><td>Lush, dreamy</td><td>${chord('C:maj7', 'Cmaj7')}</td></tr>
          <tr><td>Dominant 7</td><td>1 3 5 ♭7</td><td>Bluesy, wants to resolve</td><td>${chord('G:7', 'G7')}</td></tr>
          <tr><td>Minor 7</td><td>1 ♭3 5 ♭7</td><td>Mellow, smooth</td><td>${chord('A:m7', 'Am7')}</td></tr>
          <tr><td>Half-diminished</td><td>1 ♭3 ♭5 ♭7</td><td>Dark, searching</td><td>${chord('B:m7b5', 'Bø7')}</td></tr>
          <tr><td>Diminished 7</td><td>1 ♭3 ♭5 𝄫7</td><td>Suspense, horror</td><td>${chord('B:dim7', 'B°7')}</td></tr>
        </tbody></table>
        <h3>Extensions: 9, 11, 13</h3>
        <p>Keep stacking thirds past the octave: the 9th is the 2nd an octave up, the 11th is the 4th, the 13th is the 6th. ${chord('C:maj9', 'Cmaj9')} ${chord('D:m9', 'Dm9')} ${chord('G:13', 'G13')} ${chord('E:7#9', 'E7♯9 (Hendrix)')}</p>
        <div class="callout">On guitar you rarely play every note of a big chord — the 5th (and often the root) gets dropped. The chord finder does this for you automatically.</div>`,
    },
    {
      id: 'diatonic', title: 'Chords in a key & Roman numerals', icon: 'IV',
      lead: 'Build a triad on every note of the scale and you get the seven chords that “belong” to a key.',
      body: `
        <p>In any major key the pattern is always the same:</p>
        <p class="formula-line">I &nbsp; ii &nbsp; iii &nbsp; IV &nbsp; V &nbsp; vi &nbsp; vii°</p>
        <p>Uppercase = major, lowercase = minor, ° = diminished. In C major that's C, Dm, Em, F, G, Am, B°. In G major: G, Am, Bm, C, D, Em, F♯°.</p>
        <p>${prog('C:major:I ii iii IV V vi vii°', 'Hear all seven in C')} ${prog('G:major:I ii iii IV V vi vii°', '…and in G')}</p>
        <h3>Why numerals?</h3>
        <p>Roman numerals describe a progression <strong>independently of key</strong>. “I–V–vi–IV” is the same song shape whether it's C–G–Am–F or D–A–Bm–G. Learn shapes as numerals and you can play any song in any key — that's exactly what the Transpose button in Songs does.</p>
        <h3>Function</h3>
        <ul><li><strong>Tonic</strong> (I, vi, iii) — home, rest.</li><li><strong>Subdominant</strong> (IV, ii) — moving away.</li><li><strong>Dominant</strong> (V, vii°) — tension that wants to go home.</li></ul>`,
    },
    {
      id: 'progressions', title: 'Common progressions', icon: '⟳',
      lead: 'A handful of progressions power thousands of hit songs. Recognise them and songs become easy to learn by ear.',
      body: `
        <ul>
          <li><strong>I – V – vi – IV</strong> — the pop anthem (Let It Be, With or Without You). ${prog('C:major:I V vi IV', 'Play in C')}</li>
          <li><strong>I – IV – V</strong> — rock & roll, blues, folk. ${prog('A:major:I IV V I', 'Play in A')}</li>
          <li><strong>I – vi – IV – V</strong> — 50s doo-wop (Stand By Me). ${prog('A:major:I vi IV V', 'Play in A')}</li>
          <li><strong>ii – V – I</strong> — the backbone of jazz. ${prog('C:major:ii7 V7 Imaj7 Imaj7', 'Play in C')}</li>
          <li><strong>i – ♭VII – ♭VI – V</strong> — the Andalusian cadence (Hit the Road Jack). ${prog('A:minor:i VII VI V', 'Play in Am')}</li>
          <li><strong>i – VI – III – VII</strong> — epic minor (Zombie, Despacito). ${prog('E:minor:i VI III VII', 'Play in Em')}</li>
          <li><strong>12-bar blues</strong> — I7 ×4, IV7 ×2, I7 ×2, V7, IV7, I7, V7. ${prog('A:major:I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 'Play in A')}</li>
        </ul>
        <p>Search the <strong>Songs</strong> tab for real examples and play along.</p>`,
    },
    {
      id: 'modes', title: 'The modes', icon: '◐',
      lead: 'Play the major scale starting from a different note and you get a new mode — same notes, new home, new mood.',
      body: `
        <table><thead><tr><th>Mode</th><th>Starts on</th><th>Formula</th><th>Mood</th><th></th></tr></thead><tbody>
          <tr><td>Ionian</td><td>1</td><td>1 2 3 4 5 6 7</td><td>Happy (= major)</td><td>${scale('C:major', 'C')}</td></tr>
          <tr><td>Dorian</td><td>2</td><td>1 2 ♭3 4 5 6 ♭7</td><td>Minor but hopeful</td><td>${scale('D:dorian', 'D')}</td></tr>
          <tr><td>Phrygian</td><td>3</td><td>1 ♭2 ♭3 4 5 ♭6 ♭7</td><td>Spanish, dark</td><td>${scale('E:phrygian', 'E')}</td></tr>
          <tr><td>Lydian</td><td>4</td><td>1 2 3 ♯4 5 6 7</td><td>Dreamy, floating</td><td>${scale('F:lydian', 'F')}</td></tr>
          <tr><td>Mixolydian</td><td>5</td><td>1 2 3 4 5 6 ♭7</td><td>Bluesy major</td><td>${scale('G:mixolydian', 'G')}</td></tr>
          <tr><td>Aeolian</td><td>6</td><td>1 2 ♭3 4 5 ♭6 ♭7</td><td>Sad (= minor)</td><td>${scale('A:minor', 'A')}</td></tr>
          <tr><td>Locrian</td><td>7</td><td>1 ♭2 ♭3 4 ♭5 ♭6 ♭7</td><td>Unstable</td><td>${scale('B:locrian', 'B')}</td></tr>
        </tbody></table>
        <div class="callout tip"><strong>Hear the mode, not the notes.</strong> A mode only sounds like itself over a chord that establishes its root. Compare D Dorian over a Dm drone vs C major over a C drone — same notes, very different feeling.</div>`,
    },
    {
      id: 'pentatonic', title: 'Pentatonic & blues scales', icon: '5',
      lead: 'Five-note scales are the fastest route to sounding good when you improvise.',
      body: `
        <p><strong>Minor pentatonic</strong> <span class="formula-line">1 ♭3 4 5 ♭7</span> ${scale('A:minPent', 'A minor pentatonic')}</p>
        <p><strong>Major pentatonic</strong> <span class="formula-line">1 2 3 5 6</span> ${scale('C:majPent', 'C major pentatonic')}</p>
        <p>They have no half steps, so there are no “clashy” notes. A minor pentatonic and C major pentatonic share the same 5 notes — like relative major and minor.</p>
        <p><strong>Blues scale</strong>: add the ♭5 “blue note” to minor pentatonic. ${scale('A:blues', 'A blues')}</p>
        <div class="callout"><strong>The 5 guitar boxes.</strong> In Scales, choose Minor Pentatonic, turn on “Focus a position” and click Pattern 1 to 5 — those are the famous five boxes. Learn box 1, then connect it to box 2, and soon the whole neck is open.</div>`,
    },
    {
      id: 'rhythm', title: 'Rhythm & time signatures', icon: '♩',
      lead: 'Notes are only half of music — when they happen matters just as much.',
      body: `
        <h3>Beat, tempo and bars</h3>
        <p>The <strong>beat</strong> is the pulse you tap your foot to. <strong>Tempo</strong> is how fast that pulse is, in beats per minute (BPM). Beats are grouped into <strong>bars</strong> (measures).</p>
        <h3>Time signatures</h3>
        <ul>
          <li><strong>4/4</strong> — four beats per bar. Most pop and rock. Count “1 2 3 4”.</li>
          <li><strong>3/4</strong> — three beats per bar. Waltzes. “1 2 3”.</li>
          <li><strong>6/8</strong> — two big beats, each split into three (“1-2-3 4-5-6”). House of the Rising Sun, Perfect.</li>
        </ul>
        <h3>Note values</h3>
        <table><thead><tr><th>Note</th><th>Beats in 4/4</th></tr></thead><tbody>
          <tr><td>Whole note 𝅝</td><td>4</td></tr><tr><td>Half note 𝅗𝅥</td><td>2</td></tr><tr><td>Quarter note ♩</td><td>1</td></tr><tr><td>Eighth note ♪</td><td>½</td></tr><tr><td>Sixteenth note 𝅘𝅥𝅯</td><td>¼</td></tr>
        </tbody></table>
        <div class="callout tip">Use the metronome in the Practice tab. Practise slowly enough to be perfect, then nudge the tempo up 4–8 BPM at a time.</div>`,
    },
    {
      id: 'fretboard', title: 'Navigating the guitar neck', icon: '🎸',
      lead: 'The guitar neck is a grid. Learn a few landmarks and you can find any note fast.',
      body: `
        <h3>Standard tuning</h3>
        <p>Low to high: <strong>E A D G B E</strong> (“Eddie Ate Dynamite, Good Bye Eddie”). ${notes('E2 A2 D3 G3 B3 E4', 'Hear the open strings')}</p>
        <p>Each string is a perfect 4th (5 frets) above the one below — except G→B, which is a major 3rd (4 frets). That's why you tune the B string at the 4th fret of G.</p>
        <h3>Landmarks</h3>
        <ul>
          <li>Learn the notes on the low E and A strings first — they're where your chord roots live.</li>
          <li>The <strong>12th fret</strong> is the octave: everything repeats.</li>
          <li><strong>Octave shapes:</strong> two strings up, two frets up (one extra fret when crossing the B string).</li>
        </ul>
        <h3>CAGED</h3>
        <p>The open chord shapes C, A, G, E and D can be slid up the neck as barre shapes. Together they tile the entire fretboard for any chord. Check the Chords tab: the different voicings it finds are mostly these CAGED shapes.</p>
        <div class="callout">Drill it: Practice → <strong>Note Finder</strong>.</div>`,
    },
    {
      id: 'piano', title: 'Finding your way on the piano', icon: '🎹',
      lead: 'The keyboard is the clearest picture of music theory ever built.',
      body: `
        <h3>The pattern of black keys</h3>
        <p>Black keys come in groups of <strong>two</strong> and <strong>three</strong>. C is just left of the two; F is just left of the three. Every other note follows from those.</p>
        <h3>Hand position & fingering</h3>
        <p>Fingers are numbered thumb = 1 to pinky = 5 on both hands. For a C major scale with the right hand: <strong>1 2 3 · 1 2 3 4 5</strong> — the thumb tucks under after E.</p>
        <p>${scale('C:major', 'C major — all white keys')}</p>
        <h3>Chord shapes</h3>
        <p>A root-position triad is three keys, skipping one between each: ${chord('C:', 'C')} ${chord('F:', 'F')} ${chord('G:', 'G')}. Use inversions so your hand barely moves: C (C-E-G) → F/C (C-F-A) → G/B (B-D-G).</p>
        <div class="callout tip">In piano mode, play with your computer keyboard: <strong>A S D F G H J K</strong> are the white keys, <strong>W E T Y U</strong> the black ones. <strong>Z</strong>/<strong>X</strong> shift the octave.</div>`,
    },
  ];

  FK.GLOSSARY = [
    ['Accidental', 'A sharp (♯), flat (♭) or natural (♮) sign that raises, lowers or cancels the alteration of a note.', 'Notation'],
    ['Arpeggio', 'Playing the notes of a chord one at a time instead of together.', 'Technique'],
    ['Augmented', 'Raised by a half step — an augmented 5th, or a triad with a major 3rd and ♯5.', 'Harmony'],
    ['Bar / Measure', 'A group of beats defined by the time signature. 4/4 has four beats per bar.', 'Rhythm'],
    ['Barre chord', 'A guitar chord where one finger presses several strings across a fret, making the shape movable.', 'Guitar'],
    ['BPM', 'Beats per minute — the tempo of a piece.', 'Rhythm'],
    ['Borrowed chord', 'A chord taken from the parallel key, e.g. iv (minor) in a major key — the Creep chord.', 'Harmony'],
    ['Bridge', 'A contrasting section of a song, usually after the second chorus. (Also the part of a guitar that anchors the strings.)', 'Form'],
    ['CAGED system', 'Map of the guitar neck built from the C, A, G, E and D open-chord shapes moved up the neck.', 'Guitar'],
    ['Cadence', 'A chord movement that ends a phrase. V→I is a perfect (authentic) cadence; IV→I is plagal (“Amen”).', 'Harmony'],
    ['Capo', 'A clamp across the guitar neck that raises every string, letting you play open shapes in other keys.', 'Guitar'],
    ['Chord', 'Three or more notes sounding together.', 'Harmony'],
    ['Chord progression', 'A sequence of chords — the harmonic backbone of a song.', 'Harmony'],
    ['Chromatic', 'Moving by half steps; using notes outside the key.', 'Scales'],
    ['Circle of fifths', 'The 12 keys arranged by perfect fifths, showing key signatures and key relationships.', 'Keys'],
    ['Consonance', 'Intervals or chords that sound stable and at rest (octaves, 5ths, 3rds).', 'Harmony'],
    ['Diatonic', 'Belonging to the key — using only the notes of its scale.', 'Keys'],
    ['Diminished', 'Lowered by a half step from minor/perfect; a triad of two minor 3rds (1 ♭3 ♭5).', 'Harmony'],
    ['Dissonance', 'Tense intervals or chords that want to resolve (2nds, 7ths, the tritone).', 'Harmony'],
    ['Dominant', 'The 5th degree of a scale, or the chord built on it (V). A dominant 7th chord is 1 3 5 ♭7.', 'Harmony'],
    ['Downbeat', 'The first beat of a bar — the strongest one.', 'Rhythm'],
    ['Drop D', 'Guitar tuning with the low E lowered to D for heavier riffs and easy power chords.', 'Guitar'],
    ['Enharmonic', 'Two names for the same pitch, like F♯ and G♭.', 'Notes'],
    ['Extension', 'Chord tones beyond the 7th: 9, 11 and 13.', 'Harmony'],
    ['Flat (♭)', 'Lowers a note by a half step.', 'Notation'],
    ['Fret', 'The metal strips on a guitar neck. Each fret is one half step.', 'Guitar'],
    ['Half step', 'The smallest interval in Western music: one fret, or adjacent piano keys. Also “semitone”.', 'Intervals'],
    ['Hammer-on', 'Sounding a note by striking a string with a fretting finger, without picking.', 'Guitar'],
    ['Interval', 'The distance between two notes.', 'Intervals'],
    ['Inversion', 'A chord with a note other than the root in the bass.', 'Harmony'],
    ['Key', 'The tonal centre of a piece — a tonic plus the scale built on it.', 'Keys'],
    ['Key signature', 'The sharps or flats at the start of the staff that define the key.', 'Notation'],
    ['Leading tone', 'The 7th degree of the major scale, a half step below the tonic.', 'Scales'],
    ['Legato', 'Smoothly connected notes.', 'Technique'],
    ['Major', 'A scale or chord with a major 3rd — bright and stable.', 'Harmony'],
    ['Melody', 'A sequence of single notes forming a musical line.', 'Form'],
    ['Minor', 'A scale or chord with a minor (♭) 3rd — darker.', 'Harmony'],
    ['Mode', 'A scale formed by starting the major scale on a different degree (Dorian, Lydian…).', 'Scales'],
    ['Modulation', 'Changing key within a piece.', 'Keys'],
    ['Octave', 'The interval of 12 half steps; same note name, double the frequency.', 'Intervals'],
    ['Open chord', 'A guitar chord that uses open (unfretted) strings, near the nut.', 'Guitar'],
    ['Parallel key', 'Major and minor keys with the same tonic (C major / C minor).', 'Keys'],
    ['Pentatonic', 'A five-note scale. Major and minor pentatonic are the most common.', 'Scales'],
    ['Perfect interval', 'Unison, 4th, 5th and octave — the most consonant intervals.', 'Intervals'],
    ['Power chord', 'Root + 5th (± octave). Not major or minor, works great with distortion.', 'Guitar'],
    ['Pull-off', 'Plucking a string with a fretting finger as you lift it, sounding a lower note.', 'Guitar'],
    ['Relative key', 'Major and minor keys sharing the same notes (C major / A minor).', 'Keys'],
    ['Resolution', 'Tension moving to rest — e.g. V7 going to I.', 'Harmony'],
    ['Riff', 'A short repeated musical phrase, often the hook of a rock song.', 'Form'],
    ['Root', 'The note a chord or scale is named after and built from.', 'Harmony'],
    ['Roman numerals', 'Labels for chords by scale degree (I, ii, V7…) independent of key.', 'Harmony'],
    ['Scale', 'An ordered set of notes within an octave, defined by its step pattern.', 'Scales'],
    ['Scale degree', 'A note’s number within a scale, 1–7.', 'Scales'],
    ['Sharp (♯)', 'Raises a note by a half step.', 'Notation'],
    ['Slash chord', 'A chord with a specific bass note, written chord/bass (e.g. D/F♯).', 'Harmony'],
    ['Staccato', 'Short, detached notes.', 'Technique'],
    ['Subdominant', 'The 4th degree of the scale, or the IV chord.', 'Harmony'],
    ['Suspended chord', 'A chord where the 3rd is replaced by the 2nd (sus2) or 4th (sus4).', 'Harmony'],
    ['Syncopation', 'Accenting off-beats or weak beats for rhythmic surprise.', 'Rhythm'],
    ['Tempo', 'The speed of the music, measured in BPM.', 'Rhythm'],
    ['Time signature', 'The two numbers that tell you how many beats are in a bar and which note gets the beat.', 'Rhythm'],
    ['Tonic', 'The 1st degree of the scale — home.', 'Keys'],
    ['Transpose', 'To move music to a different key, keeping all intervals the same.', 'Keys'],
    ['Triad', 'A three-note chord: root, 3rd and 5th.', 'Harmony'],
    ['Tritone', 'The interval of 6 half steps (augmented 4th / diminished 5th) — the most unstable interval.', 'Intervals'],
    ['Voicing', 'The specific arrangement of a chord’s notes — which octave, order and doublings.', 'Harmony'],
    ['Voice leading', 'Moving each note of one chord smoothly to the nearest note of the next.', 'Harmony'],
    ['Whole step', 'Two half steps: two frets, or skipping one key. Also “tone”.', 'Intervals'],
  ].map(([term, def, cat]) => ({ term, def, cat }));
})();
