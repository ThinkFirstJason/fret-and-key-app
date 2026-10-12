/* Fret & Key — Songs: key & progression lookup, play-along, Spotify */
(function () {
  'use strict';
  const FK = window.FK;
  const T = FK.theory;
  const mod = T.mod;
  const $ = FK.$, $$ = FK.$$;
  const I = () => FK.ui.icon;
  const esc = FK.esc;

  const st = Object.assign({ speed: 1, double: false, songId: 'Let It Be|The Beatles', transpose: 0, tempo: null, metro: true, backing: true, countIn: true, view: 'both', noodle: 'auto', section: 'all', linkSpotify: true, filter: 'all' }, FK.store.get('songs', {}));
  const save = () => FK.store.set('songs', Object.assign({}, st, { custom: undefined }));
  const uriMap = FK.store.get('song-uris', {});
  let el = null;
  let song = null;
  let spResults = [];
  let spQuery = '';
  let playing = null; // { handle, idx }
  let focus = null;    // chord index focused when idle
  let audioEl = null, raf = 0, editing = false, delArmed = false, busy = false;

  const songId = (s) => s.id || s.t + '|' + s.a;
  const norm = (s) => s.toLowerCase().replace(/\(.*?\)|\[.*?\]|-.*remaster.*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const COLORS = [['#5b3fd1', '#ff7a59'], ['#1b9c9a', '#4cc9f0'], ['#ff5fa2', '#ffc857'], ['#7b61ff', '#2ec4b6'], ['#ff7a59', '#ffc857'], ['#2c62b0', '#9b7bff']];
  const artColors = (s) => { let h = 0; for (const c of s.t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  // photos/scans need the desktop AI engine (optical music recognition)
  const SHEET_HINT = FK.platform.desktop ? 'PDF, MusicXML, MIDI, MuseScore, photo' : 'PDF, MusicXML, MIDI, MuseScore';
  const LIVE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><path d="M9.5 15.5l2.5-7 2.5 7M10.4 13h3.2"/></svg>';
  const initials = (s) => s.t.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  /* ---------------- model ---------------- */
  function modeScaleId(mode) { return T.MODE_SCALE[mode] || 'major'; }
  function keyPc() { return mod(T.pcOf(song.key) + st.transpose); }
  function nameInKey(pc, kpc = keyPc(), mode = song.mode) {
    const sn = T.scaleNotes(kpc, modeScaleId(mode));
    const hit = sn.find((n) => n.pc === pc);
    if (hit) return hit.name;
    const sig = T.keySignature(kpc, T.isMinorMode(mode) ? 'minor' : 'major');
    return (sig.count > 0 ? T.SHARP_NAMES : T.FLAT_NAMES)[pc];
  }
  function parseTokens(str) {
    return str.trim().split(/\s+/).filter(Boolean).map((tok) => {
      const [sym, b] = tok.split(':');
      const c = T.parseChord(sym);
      return c ? { c, beats: b ? +b : (song.beats || 4) } : null;
    }).filter(Boolean);
  }
  function chordFor(tok, kpc = keyPc(), mode = song.mode) {
    const c = tok.c;
    const rootPc = mod(c.rootPc + st.transpose);
    const bassPc = c.bassPc != null ? mod(c.bassPc + st.transpose) : null;
    const root = nameInKey(rootPc, kpc, mode);
    const label = T.chordLabel(root, c.suffix) + (bassPc != null ? '/' + T.pretty(nameInKey(bassPc, kpc, mode)) : '');
    return { rootPc, root, suffix: c.suffix, bassPc, label, roman: T.romanFor(rootPc, c.suffix, kpc, mode), beats: tok.beats, kpc, mode };
  }
  /* sections may carry their own key (key changes); otherwise they use the song's key */
  function sections() {
    return (song.sections || []).map((s, si) => {
      const kpc = s.key ? mod(T.pcOf(s.key) + st.transpose) : keyPc();
      const mode = s.mode || song.mode;
      return { name: s.n, si, kpc, mode, chords: parseTokens(s.c).map((t) => chordFor(t, kpc, mode)) };
    });
  }
  function noodleNotes(kpc = keyPc(), mode = song.mode) {
    let id = st.noodle;
    if (id === 'auto') id = mode === 'major' ? 'majPent' : mode === 'minor' ? 'minPent' : modeScaleId(mode);
    if (id === 'key') id = modeScaleId(mode);
    if (id === 'blues') id = T.isMinorMode(mode) ? 'blues' : 'majBlues';
    return { id, notes: T.scaleNotes(kpc, id, T.keyRootName(kpc, mode)) };
  }
  function srcAt(i) {
    const sg = song.segments;
    return sg && !song.edited && sg[i] ? sg[i].src || null : null;
  }
  function confAt(i) {
    const sg = song.segments;
    if (!sg || song.edited || !sg[i] || sg[i].conf == null) return 1;
    return sg[i].conf;
  }

  function allSongs() { return FK.mySongs.list().concat(FK.SONGS); }
  function findSong(id) { return allSongs().find((s) => songId(s) === id); }

  /* ---------------- layout ---------------- */
  function init(root) {
    el = root;
    el.innerHTML = `
      <div class="grid-2">
        <div class="stack">
          <div class="card c-sky">
            <div class="eyebrow"><span class="num">01</span> Find a song</div>
            <div class="search-box"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg>
              <input type="search" data-role="q" placeholder="Song, artist, key (e.g. “G major”) or style…" autocomplete="off"></div>
            <div class="row" style="margin-top:10px">
              <div class="seg" data-role="filter"><button data-f="all">All</button><button data-f="major">Major</button><button data-f="minor">Minor</button><button data-f="beginner">Beginner</button><button data-f="mine">My songs</button></div>
            </div>
            <div class="song-list" data-role="list"></div>
          </div>
          <div class="card c-amber">
            <div class="eyebrow"><span class="num">02</span> Add your own song</div>
            <p class="desc" style="margin:0 0 10px;font-size:14px">Add a recording, sheet music, or both. With both, the sheet's chords are lined up with the recording — the most accurate chart.</p>
            <div class="drop-pair">
              <label class="drop" data-role="drop" data-kind="audio">
                <input type="file" data-role="file" data-kind="audio" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,.aif,.aiff" hidden>
                <svg viewBox="0 0 24 24"><path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>
                <b>Recording</b><span data-role="slot-audio">MP3, WAV, M4A, OGG, FLAC</span>
              </label>
              <label class="drop" data-role="drop" data-kind="sheet">
                <input type="file" data-role="file" data-kind="sheet" accept=".pdf,.musicxml,.xml,.mxl,.mid,.midi,.mscz,.mscx,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp" hidden>
                <svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg>
                <b>Sheet music <small class="muted">(optional)</small></b><span data-role="slot-sheet">${SHEET_HINT}</span>
              </label>
            </div>
            <div class="row" style="margin-top:10px"><button class="btn primary small" data-act="transcribe" disabled>Transcribe</button><button class="btn small ghost" data-act="clear-slots">Clear</button><span class="spacer"></span><span class="engine-pill" data-role="engine">Checking engine…</span></div>
            <div data-role="upstatus"></div>
            <details class="sp-setup" ${FK.platform.desktop ? '' : 'hidden'}>
              <summary>Song recognition (AcoustID) — optional</summary>
              <p class="muted" style="font-size:13.5px">Identifies uploads automatically. Only an audio fingerprint is sent, never the audio. If the song is in the built-in library, its chart is lined up with your recording as a cross-check.</p>
              <ol><li>Sign in at <a href="https://acoustid.org/new-application" target="_blank" rel="noopener">acoustid.org/new-application</a> and register an application (any name).</li><li>Paste its API key here.</li></ol>
              <div class="row"><input type="text" data-role="acoustid" placeholder="AcoustID API key" style="flex:1;min-width:200px;height:36px"><button class="btn small" data-act="acoustid-save">Save</button></div>
            </details>
            <div class="transfer-box">
              <b>Move songs between devices</b>
              <p class="muted">${FK.platform.mobile
                ? 'Songs exported from Fret &amp; Key on your PC keep the PC’s AI-engine transcription and your edits. Save the <code>.fretkey</code> file to Files (iCloud Drive, OneDrive, Google Drive or an email attachment), then tap Import.'
                : 'Export your songs, then open the file on your phone: save it to iCloud Drive, OneDrive or Google Drive (or email it to yourself) and tap <b>Import songs</b> in the phone app. The phone plays back this transcription exactly, recording included.'}</p>
              <div class="row"><label class="btn small"><input type="file" data-role="import" ${FK.platform.ios ? '' : 'accept=".fretkey"'} multiple hidden>⇩ Import songs</label><button class="btn small" data-act="export-all">⇧ Export all my songs</button></div>
              <div data-role="xstatus"></div>
            </div>
          </div>
          <div class="card c-violet">
            <div class="eyebrow"><span class="num">03</span> What key is my song in?</div>
            <p class="desc" style="margin:0 0 10px;font-size:14px">Type the chords you know — we'll work out the key, the Roman numerals and the scale to play over it.</p>
            <input type="text" data-role="prog" placeholder="e.g.  Am F C G   or   D A Bm G">
            <div class="row" style="margin-top:10px"><button class="btn primary small" data-act="detect">Find the key</button><span class="muted" style="font-size:12.5px">Use : for beats, e.g. <code>C:2 G:2</code></span></div>
            <div data-role="detect"></div>
          </div>
        </div>
        <div class="stack">
          <div class="card" data-role="detail"></div>
          <div class="card c-green spotify-card" data-role="spotify"></div>
        </div>
      </div>`;
    const q = $('[data-role=q]', el);
    let t;
    q.addEventListener('input', () => {
      renderList();
      clearTimeout(t);
      t = setTimeout(spotifySearch, 450);
    });
    $('[data-role=prog]', el).addEventListener('keydown', (e) => { if (e.key === 'Enter') detect(); });
    $$('[data-role=drop]', el).forEach((drop) => {
      ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
      drop.addEventListener('drop', (e) => { e.preventDefault(); Array.from(e.dataTransfer.files).forEach((f) => addFile(f, drop.dataset.kind)); });
    });
    if (FK.platform.ios) $$('[data-role=file]', el).forEach((inp) => inp.removeAttribute('accept'));
    $('[data-role=import]', el).addEventListener('change', (e) => { const fs = Array.from(e.target.files); e.target.value = ''; importSongs(fs); });
    $$('[data-role=file]', el).forEach((inp) => inp.addEventListener('change', (e) => { Array.from(e.target.files).forEach((f) => addFile(f, inp.dataset.kind)); e.target.value = ''; }));
    $('[data-role=acoustid]', el).value = FK.engine.acoustidKey();
    FK.engine.status().then(showEngine);
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    FK.spotify.onChange(() => { if (FK.state.tab === 'songs') renderSpotify(); });
    FK.spotify.embed.onUpdate(onEmbedUpdate);
    FK.on('space', () => { if (live.open) liveToggle(); else if (FK.state.tab === 'songs') togglePlay(); });
    const rb = ribbonEl();
    rb.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.rb === 'live') { openLive(); return; }
      if (b.dataset.rb === 'toggle') { ribbonHidden = !ribbonHidden; FK.store.set('ribbon-hidden', ribbonHidden); renderRibbon(); return; }
      if (b.dataset.ri != null) chipClick(+b.dataset.ri);
    });
    FK.on('tab', () => renderRibbon());
    window.addEventListener('resize', () => { ribbonGo(ribbonIdx, false); if (live.open) liveRender(true); });
    initLive();
    if (FK.input) FK.input.onChange(ribbonCheckInput);

    song = (st.custom && songId(st.custom) === st.songId) ? st.custom : findSong(st.songId) || FK.SONGS[0];
  }

  function filtered() {
    const raw = ($('[data-role=q]', el).value || '').trim().toLowerCase();
    return allSongs().filter((s) => {
      if (st.filter === 'mine' && !s.user) return false;
      if (st.filter === 'major' && s.mode !== 'major') return false;
      if (st.filter === 'minor' && s.mode === 'major') return false;
      if (st.filter === 'beginner' && !/beginner/.test(s.tags)) return false;
      if (!raw) return true;
      const kn = T.keyName(T.pcOf(s.key), s.mode).toLowerCase().replace(/♯/g, '#').replace(/♭/g, 'b');
      const hay = (s.t + ' ' + s.a + ' ' + s.tags + ' ' + kn + ' ' + s.key.toLowerCase() + ' ' + s.mode).toLowerCase();
      return raw.split(/\s+/).every((w) => hay.includes(w.replace(/♯/g, '#').replace(/♭/g, 'b')));
    });
  }

  function songRow(s, opts = {}) {
    const [a1, a2] = artColors(s);
    const kpc = T.pcOf(s.key);
    const art = s.image ? `<img src="${esc(s.image)}" alt="">` : s.user ? '♪' : initials(s);
    return `<button class="song-item ${song && songId(song) === songId(s) ? 'on' : ''}" ${opts.sp != null ? `data-sp="${opts.sp}"` : `data-song="${esc(songId(s))}"`}>
      <span class="song-art" style="--a1:${a1};--a2:${a2}">${art}</span>
      <span><div class="song-t">${esc(s.t)}</div><div class="song-a">${esc(s.a)}</div></span>
      <span class="song-meta">${s.key ? `<span class="tag key ${T.isMinorMode(s.mode) ? 'minor' : ''}">${T.keyName(kpc, s.mode)}</span>` : '<span class="tag">Key ?</span>'}${s.bpm ? `<span class="bpm">${s.bpm} bpm</span>` : ''}</span></button>`;
  }

  function renderList() {
    $$('[data-role=filter] button', el).forEach((b) => b.classList.toggle('on', b.dataset.f === st.filter));
    const list = filtered();
    let html = '';
    list.forEach((s, i) => {
      if (s.user && i === 0) html += '<div class="list-head" style="margin-top:2px">♪ My songs</div>';
      if (!s.user && i > 0 && list[i - 1].user) html += '<div class="list-head">Library</div>';
      html += songRow(s);
    });
    html = html || (st.filter === 'mine' ? '<p class="muted" style="padding:8px">No songs of your own yet — drop an audio file into “Add your own song”.</p>' : '') || '<p class="muted" style="padding:8px">No songs in the library match. Try the Spotify results below, or type the chords into “What key is my song in?”.</p>';
    if (spResults.length) {
      html += `<div class="list-head"><span class="sp-dot"></span>From Spotify</div>` + spResults.map((r, i) => {
        const lib = matchLibrary(r);
        return songRow(lib ? Object.assign({}, lib, { image: r.image }) : { t: r.name, a: r.artists, image: r.image }, { sp: i });
      }).join('');
    } else if (!FK.spotify.connected() && $('[data-role=q]', el).value.trim().length > 2) {
      html += `<p class="muted" style="font-size:12.5px;padding:6px 8px">Connect Spotify (below) to search every song on Spotify too.</p>`;
    }
    $('[data-role=list]', el).innerHTML = html;
  }

  function matchLibrary(r) {
    const t = norm(r.name), a = norm(r.artists);
    return FK.SONGS.find((s) => norm(s.t) === t && (a.includes(norm(s.a).split(' ')[0]) || norm(s.a).includes(a.split(' ')[0])))
      || FK.SONGS.find((s) => norm(s.t) === t);
  }

  async function spotifySearch() {
    const q = $('[data-role=q]', el).value.trim();
    if (!FK.spotify.connected() || q.length < 3) { spResults = []; renderList(); return; }
    if (q === spQuery) return;
    spQuery = q;
    try { spResults = await FK.spotify.search(q); } catch (e) { spResults = []; if (e.status === 401) FK.spotify.logout(); }
    renderList();
  }

  /* ---------------- detail ---------------- */
  function capoHints() {
    if (FK.state.mode !== 'guitar' || !song.key) return '';
    const minor = T.isMinorMode(song.mode);
    const friendly = minor ? [9, 4, 2] : [0, 7, 2, 9, 4];
    const out = [];
    for (let capo = 0; capo <= 7; capo++) {
      const shapeKey = mod(keyPc() - capo);
      if (friendly.includes(shapeKey)) out.push({ capo, name: T.keyName(shapeKey, minor ? 'minor' : 'major') });
    }
    if (!out.length) return '';
    return `<span class="muted" style="font-size:13px">Easy shapes: ${out.slice(0, 3).map((o) => o.capo === 0 ? `<b>no capo</b> (${o.name})` : `<b>capo ${o.capo}</b> → play as ${o.name}`).join(' · ')}</span>`;
  }

  function renderDetail() {
    queueMicrotask(renderRibbon);
    const box = $('[data-role=detail]', el);
    if (!song) { box.innerHTML = '<p class="muted">Pick a song.</p>'; return; }
    const [a1, a2] = artColors(song);
    const known = !!song.key;
    const art = song.image ? `<img src="${esc(song.image)}" alt="">` : song.user ? '♪' : initials(song);
    let body = '';
    if (!known) {
      body = `<div class="note-box info">We don't have this one in the library yet${song.featureTried ? ' and Spotify no longer shares key data with new apps' : ''}. Set the key yourself (check a chord chart, or type a few chords into “What key is my song in?”) and you can still jam along.</div>
        <div class="row" style="margin-top:12px">
          <select data-role="setkey" style="width:auto">${T.ROOT_LABELS.map((l, pc) => `<option value="${pc}">${l}</option>`).join('')}</select>
          <select data-role="setmode" style="width:auto"><option value="major">major</option><option value="minor">minor</option><option value="dorian">dorian</option><option value="mixolydian">mixolydian</option></select>
          <input type="text" data-role="setchords" placeholder="Chords (optional) e.g. G D Em C" style="flex:1;min-width:200px">
          <button class="btn primary small" data-act="setkey">Use this</button>
        </div>`;
    } else {
      const secs = sections();
      const kname = T.keyName(keyPc(), song.mode);
      const rel = song.mode === 'major' ? T.keyName(mod(keyPc() + 9), 'minor') : song.mode === 'minor' ? T.keyName(mod(keyPc() + 3), 'major') : null;
      let idx = 0;
      body = `
        <div class="row" style="margin-top:14px">
          <span class="muted" style="font-size:13px">Transpose</span>
          <div class="seg"><button data-tr="-1">−</button><button class="on" style="min-width:58px;font-family:var(--font-mono)">${st.transpose > 0 ? '+' : ''}${st.transpose}</button><button data-tr="1">+</button></div>
          ${st.transpose ? '<button class="btn small ghost" data-tr="0">Reset</button>' : ''}
          ${capoHints()}
        </div>
        <div class="row" style="margin-top:12px"><button class="btn primary live-btn" data-act="live">${LIVE_ICON}<span>Chord screen</span></button><span class="muted" style="font-size:12.5px">Just the chords, as big as your screen: current, next and bar number.</span></div>
        ${song.user ? userTools() : ''}
        ${song.hasAudio ? recBlock() : ''}
        ${song.loop ? `<p class="muted" style="font-size:13px;margin:12px 0 0">Most repeated loop: <b style="color:var(--text)">${esc(song.loop.split(' ').map((x) => T.pretty(x)).join(' – '))}</b></p>` : ''}
        ${secs.map((s, n) => {
          const changed = n ? (s.kpc !== secs[n - 1].kpc || s.mode !== secs[n - 1].mode) : (s.kpc !== keyPc() || s.mode !== song.mode);
          const badge = changed ? `<span class="tag key key-change ${T.isMinorMode(s.mode) ? 'minor' : ''}">${n ? '→ Key change: ' : 'Key: '}${T.keyName(s.kpc, s.mode)}</span>` : '';
          return `<div class="section-block"><h5>${esc(s.name)} ${badge}</h5><div class="chips">${s.chords.map((c) => {
            const i = idx++;
            const nd = !/^[♭♯♮]/.test(c.roman) ? '' : ' nd';
            const unsure = confAt(i) < 0.4 ? ' unsure' : '';
            const from = srcAt(i);
            const srcCls = from ? ' src-' + from : '';
            const srcTip = from === 'both' ? ' · sheet music and audio agree' : from === 'sheet' ? ' · from the sheet music (the audio was unclear)' : from === 'audio' && song.analysis && song.analysis.sheetChords ? ' · not written in the sheet — from the audio' : '';
            return `<button class="chip${nd}${unsure}${srcCls} ${focus === i ? 'on' : ''}" data-ci="${i}" title="${c.beats} beat${c.beats === 1 ? '' : 's'}${unsure ? ' · low confidence — check this one' : ''}${srcTip}"><span class="rn">${c.roman}</span><span class="cn">${c.label}</span></button>`;
          }).join('')}</div></div>`;
        }).join('')}
        ${song.hasAudio ? '' : `<div class="transport">
          <button class="btn primary" data-act="play">${playing ? I().stop + '<span>Stop</span>' : I().play + '<span>Play along</span>'}</button>
          <div class="range-row" style="flex:1;min-width:180px"><input type="range" min="40" max="200" data-role="tempo" value="${st.tempo || song.bpm}"><output>${st.tempo || song.bpm} bpm</output></div>
          <div class="beat-dots" data-role="dots">${Array.from({ length: song.beats || 4 }, () => '<i></i>').join('')}</div>
          <div class="row" style="width:100%;gap:14px">
            <label class="switch"><input type="checkbox" data-opt="backing" ${st.backing ? 'checked' : ''}> Backing chords</label>
            <label class="switch"><input type="checkbox" data-opt="metro" ${st.metro ? 'checked' : ''}> Click</label>
            <label class="switch"><input type="checkbox" data-opt="countIn" ${st.countIn ? 'checked' : ''}> Count-in</label>
            <label class="switch"><input type="checkbox" data-opt="linkSpotify" ${st.linkSpotify ? 'checked' : ''}> Start Spotify too</label>
            ${secs.length > 1 ? `<select data-role="section" style="width:auto;height:36px"><option value="all">All sections</option>${secs.map((s) => `<option value="${s.si}" ${String(st.section) === String(s.si) ? 'selected' : ''}>Loop: ${esc(s.name)}</option>`).join('')}</select>` : ''}
          </div>
        </div>`}
        <div class="row" style="margin-top:12px">
          <span class="muted" style="font-size:13px">Noodle with</span>
          <div class="seg" data-role="noodle">${[['auto', 'Pentatonic'], ['key', 'Full key scale'], ['blues', 'Blues']].map(([v, l]) => `<button data-noodle="${v}" class="${st.noodle === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          <div class="seg" data-role="view">${[['both', 'Chord + scale'], ['chord', 'Chord only'], ['scale', 'Scale only']].map(([v, l]) => `<button data-view="${v}" class="${st.view === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        </div>
        ${song.note ? `<div class="note-box">💡 ${esc(song.note)}</div>` : ''}
        <p class="muted" style="font-size:12.5px;margin:12px 0 0">Key of <b>${kname}</b>${rel ? ` (relative ${rel})` : ''}. Pink numerals are chords borrowed from outside the key.</p>`;
    }
    box.innerHTML = `
      <div class="song-hero"><span class="song-art" style="--a1:${a1};--a2:${a2}">${art}</span>
        <div style="flex:1;min-width:200px"><h3>${esc(song.t)}</h3><div class="by">${esc(song.a)}</div>
          <div class="song-facts">${known ? `<span class="tag key ${T.isMinorMode(song.mode) ? 'minor' : ''}">Key: ${T.keyName(keyPc(), song.mode)}</span>` : '<span class="tag">Key unknown</span>'}
          ${song.bpm ? `<span class="tag">♩ ≈ ${song.bpm} bpm</span>` : ''}${song.beats === 3 ? '<span class="tag">3 beats / chord</span>' : ''}
          ${known ? `<span class="tag">Play over it: ${noodleNotes().notes[0] ? T.pretty(noodleNotes().notes[0].name) + ' ' + T.SCALE_MAP[noodleNotes().id].name : ''}</span>` : ''}</div>
        </div></div>${body}`;
    if (song.hasAudio && known) updateHead(audioEl && audioEl._id === song.id ? audioEl.currentTime : 0);
    if (!known && song.guessPc != null) { $('[data-role=setkey]', box).value = song.guessPc; $('[data-role=setmode]', box).value = song.guessMode || 'major'; }
  }

  /* ---------------- Spotify card ---------------- */
  function renderSpotify() {
    const box = $('[data-role=spotify]', el);
    box.style.display = song && song.user ? 'none' : '';
    if (song && song.user) { box.innerHTML = ''; return; }
    const uri = song && (song.uri || uriMap[songId(song)]);
    const connected = FK.spotify.connected();
    const searchUrl = 'https://open.spotify.com/search/' + encodeURIComponent(song ? song.t + ' ' + song.a : '');
    box.innerHTML = `
      <div class="sp-head"><svg class="sp-logo" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M6.5 9.3c3.8-1.1 8.1-.8 11.3 1M7 12.4c3.1-.9 6.6-.6 9.2.9M7.6 15.3c2.5-.6 5-.4 7 .8" stroke="#08130b" stroke-width="1.7" fill="none" stroke-linecap="round"/></svg>
        <h4 style="margin:0">Spotify</h4><span class="spacer"></span>${connected ? '<span class="tag" style="border-color:var(--spotify)">● Connected</span>' : ''}</div>
      <div class="sp-embed" data-role="embed">${uri ? 'Loading player…' : `<div style="padding:18px">No track linked yet for this song.</div>`}</div>
      ${uri ? `<div class="sp-controls">
          <button class="sp-big" data-act="sp-toggle" title="Play / pause">${FK.spotify.embed.state().isPaused === false ? I().pause : I().play}</button>
          <button class="btn small" data-act="sp-restart">⟲ From start</button>
          <div class="sp-progress"><i data-role="spbar"></i></div><span class="sp-time" data-role="sptime">0:00</span>
        </div>
        ${connected ? `<div class="row" style="margin-top:10px"><span class="muted" style="font-size:12.5px">Or control the Spotify app on your phone/computer (Premium):</span>
          <button class="btn small" data-act="dev-play">▶ Play there</button><button class="btn small" data-act="dev-pause">❚❚ Pause</button></div>` : ''}` : ''}
      <div class="row" style="margin-top:12px">
        ${connected && song ? `<button class="btn small spotify" data-act="sp-find">Find “${esc(song.t)}” on Spotify</button>` : `<a class="btn small" href="${searchUrl}" target="_blank" rel="noopener">Search Spotify ↗</a>`}
        <input type="url" data-role="splink" placeholder="…or paste a Spotify track link" style="flex:1;min-width:180px;height:34px">
        <button class="btn small" data-act="sp-link">Load</button>
      </div>
      <div data-role="spfind"></div>
      <details class="sp-setup" ${FK.spotify.waiting() ? 'open' : ''}>
        <summary>${connected ? 'Spotify connection' : 'Connect your Spotify account (optional)'}</summary>
        ${connected ? `<p class="muted" style="font-size:13.5px">You're connected — search above now includes all of Spotify.</p><button class="btn small" data-act="sp-logout">Disconnect</button>` : `
        <p class="muted" style="font-size:13.5px">The player above works without connecting (sign in inside the player for full songs, otherwise you get 30-second previews). Connecting adds search across all of Spotify and control of your Spotify app. Spotify requires each app install to use its own free developer key:</p>
        <ol>
          <li>Open the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">Spotify Developer Dashboard</a> and create an app (choose <b>Web API</b>).</li>
          <li>Under Redirect URIs add exactly <code>${esc(FK.spotify.redirectUri())}</code> and save.${FK.platform.desktop ? ' (If you added <code>http://127.0.0.1:47321/</code> before, replace it with this one.)' : ' (The desktop app uses its own address; you can list both.)'}</li>
          <li>Paste the app's Client ID here and press Connect. ${FK.platform.desktop ? 'Spotify’s login opens in your normal web browser — log in there, then come back here.' : 'You’ll go to Spotify’s login page and come straight back here.'}</li>
        </ol>
        ${FK.spotify.waiting() ? `<div class="note-box info" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span>⏳ Waiting for you to finish logging in to Spotify in your browser…</span><span class="spacer"></span><button class="btn small" data-act="sp-cancel">Cancel</button></div>`
          : `<div class="row"><input type="text" data-role="clientid" placeholder="Spotify Client ID" value="${esc(FK.spotify.clientId())}" style="flex:1;min-width:200px;height:36px"><button class="btn small spotify" data-act="sp-login">Connect</button></div>`}
        <p class="muted" style="font-size:12px">Your login token is stored only on this ${FK.platform.mobile ? 'device' : 'computer'}.</p>`}
      </details>`;
    if (uri) {
      FK.spotify.embed.mount($('[data-role=embed]', box), uri).catch((e) => { $('[data-role=embed]', box).innerHTML = `<div style="padding:18px">${esc(e.message)}</div>`; });
    }
  }

  function fmt(ms) { const s = Math.floor((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function onEmbedUpdate(d) {
    if (!el) return;
    const bar = $('[data-role=spbar]', el), tm = $('[data-role=sptime]', el), btn = $('[data-act=sp-toggle]', el);
    if (bar) bar.style.width = d.duration ? (100 * d.position / d.duration).toFixed(1) + '%' : '0';
    if (tm) tm.textContent = fmt(d.position) + ' / ' + fmt(d.duration);
    if (btn) btn.innerHTML = d.isPaused ? I().play : I().pause;
  }

  /* ---------------- stage ---------------- */
  function flatChords() { return sections().flatMap((s) => s.chords); }

  function stageIdle() {
    if (!song || !song.key) { FK.stage.setInfo({ eyebrow: 'Song', title: song ? esc(song.t) : 'Songs', sub: 'Set the key to see the scale' }); FK.stage.clear(); FK.stage.setLegend([]); return; }
    const nd = noodleNotes();
    if (focus != null) {
      const c = flatChords()[focus];
      if (c) { showChord(c, FK.voice.get(c)); return; }
    }
    FK.stage.setInfo({ eyebrow: `${song.t} · ${song.a}`, title: `Noodle in ${T.pretty(nd.notes[0].name)} ${T.SCALE_MAP[nd.id].name}`, sub: `Key of <b>${T.keyName(keyPc(), song.mode)}</b> · ` + nd.notes.map((n) => `<b>${T.pretty(n.name)}</b>`).join(' · ') });
    FK.stage.degreeLegend(nd.notes);
    FK.stage.showNotes(nd.notes);
  }

  function showChord(c, v) {
    const nd = noodleNotes(c.kpc, c.mode);
    const ghost = st.view === 'chord' ? null : nd.notes;
    if (st.view === 'scale') {
      const map = FK.stage.pcMap(nd.notes);
      const cpcs = new Set(T.chordNotes(c.root, c.suffix).map((n) => n.pc));
      map.forEach((val, pc) => { if (!cpcs.has(pc)) val.ghost = true; });
      FK.guitar.setWindow(null);
      FK.guitar.setMarkers(FK.stage.guitarFromMap(map));
      FK.piano.setMarkers(FK.stage.pianoFromMap(map));
    } else FK.voice.show(c, v, ghost);
    FK.stage.setInfo({ eyebrow: `${song.t} · ${T.keyName(c.kpc != null ? c.kpc : keyPc(), c.mode || song.mode)}`, title: `${c.label} <span class="muted" style="font-weight:600">${c.roman}</span>`, sub: T.chordNotes(c.root, c.suffix).map((n) => `<b>${T.pretty(n.name)}</b>`).join(' · ') + (st.view === 'both' ? ' &nbsp;— faded dots: notes to noodle with' : '') });
    FK.stage.degreeLegend(T.chordNotes(c.root, c.suffix));
  }

  /* ---------------- play-along ---------------- */
  function togglePlay(opts = {}) {
    if (playing) { FK.stopTransport(); return; }
    if (!song || !song.key) return;
    if (song.hasAudio) { playRecording(); return; }
    focus = null;
    const all = sections();
    const secs = all.filter((s) => st.section === 'all' || String(s.si) === String(st.section));
    const offsetOf = (si) => all.filter((s) => s.si < si).reduce((n, s) => n + s.chords.length, 0);
    const timeline = [];
    secs.forEach((s) => s.chords.forEach((c, j) => timeline.push({ c, globalIdx: offsetOf(s.si) + j })));
    if (!timeline.length) return;
    let prev = null;
    timeline.forEach((t) => { t.v = prev = FK.voice.get(t.c, prev); });
    const bpb = song.beats || 4;
    const count = st.countIn ? bpb : 0;
    // the first pass can start part-way through (resuming); after that the whole loop repeats
    let startAt = opts.from != null ? timeline.findIndex((t) => t.globalIdx >= opts.from) : 0;
    if (startAt < 0) startAt = 0;
    const phase = timeline.slice(0, startAt).reduce((n, t) => n + t.c.beats, 0) % bpb;
    const build = (list, countIn, phase0) => {
      const events = [];
      for (let b = 0; b < countIn; b++) events.push({ beat: b, play: (w) => FK.audio.click(w, b === 0), ui: () => beatDot(b, bpb, true) });
      let beat = countIn;
      list.forEach((t) => {
        const start = beat;
        events.push({
          beat: start,
          play: (w, spb) => { if (st.backing) FK.voice.play(t.v, { when: w, dur: spb * t.c.beats * 0.95, flash: false, vel: 0.7 }); },
          ui: () => { showChord(t.c, t.v); setActive(t.globalIdx, (t.c.beats * 60) / (st.tempo || song.bpm)); flashVoicing(t.v); },
        });
        if (t.c.beats >= 4) events.push({ beat: start + 2, play: (w, spb) => { if (st.backing) FK.voice.play(t.v, { when: w, dur: spb * 1.9, flash: false, vel: 0.45 }); } });
        beat += t.c.beats;
      });
      for (let bb = countIn; bb < Math.ceil(beat); bb++) {
        const inBar = (bb - countIn + phase0) % bpb;
        events.push({ beat: bb, play: (w) => { if (st.metro) FK.audio.click(w, inBar === 0); }, ui: () => beatDot(inBar, bpb) });
      }
      events.sort((a, b) => a.beat - b.beat);
      return { events, total: beat };
    };
    const firstPass = build(timeline.slice(startAt), count, phase);
    const loopPass = build(timeline, 0, 0);
    // first pass (with count-in) then loop the body
    const startLoop = () => {
      const h = FK.audio.sequence({ bpm: st.tempo || song.bpm, events: loopPass.events, totalBeats: loopPass.total, loop: true, startDelay: 0 });
      playing.handle = h;
    };
    const first = FK.audio.sequence({
      bpm: st.tempo || song.bpm, events: firstPass.events, totalBeats: firstPass.total, loop: false,
      onEnd: () => { if (playing && playing.handle === first) startLoop(); },
    });
    playing = { handle: first };
    live.idx = -1;
    live.from = timeline[startAt].globalIdx;
    if (st.linkSpotify && startAt === 0) {
      const startSp = () => {
        if (FK.spotify.embed.ready()) FK.spotify.embed.play();
        else if (FK.spotify.connected() && (song.uri || uriMap[songId(song)])) FK.spotify.devicePlay(song.uri || uriMap[songId(song)]).catch(() => {});
      };
      setTimeout(startSp, count * (60 / (st.tempo || song.bpm)) * 1000);
    }
    FK.setTransport({ stop: () => playing && playing.handle && playing.handle.stop() }, () => {
      // remember where we stopped so the chord screen can carry on from there
      if (live.idx >= 0) live.resume = live.idx;
      live.idx = -1;
      playing = null;
      if (st.linkSpotify && FK.spotify.embed.ready() && FK.spotify.embed.state().isPaused === false) FK.spotify.embed.pause();
      highlight(-1); beatDot(-1);
      if (FK.state.tab === 'songs') { renderDetail(); stageIdle(); }
    });
    renderDetail();
  }

  function flashVoicing(v) {
    if (!v) return;
    if (FK.state.mode === 'guitar' && v.frets) v.frets.forEach((f, s) => { if (f >= 0) FK.guitar.flash(s, f); });
    else v.midis.forEach((m) => FK.piano.flash(m));
    FK.emit('note-played', Math.min(...v.midis));
  }
  function chipClick(i) {
    const c = flatChords()[i];
    if (!c) return;
    if (song.hasAudio && playing && playing.audio) { const tl = recTimeline(); if (tl[i]) audioEl.currentTime = tl[i].start + 0.01; return; }
    if (!playing) {
      focus = focus === i ? null : i;
      $$('[data-ci]', el).forEach((x) => x.classList.toggle('on', +x.dataset.ci === focus));
      ribbonGo(focus == null ? 0 : focus);
    }
    const v = FK.voice.get(c);
    if (!playing) { if (focus == null) stageIdle(); else showChord(c, v); }
    FK.voice.play(v);
  }

  /* ---------------- up-next ribbon, floating over the instrument ---------------- */
  let ribbonIdx = -1, ribbonHidden = FK.store.get('ribbon-hidden', false), ribbonTimer = 0, ribbonTimed = null;
  const ribbonEl = () => document.getElementById('songRibbon');
  function renderRibbon() {
    const r = ribbonEl();
    if (!r) return;
    const chords = song && song.key ? flatChords() : [];
    const show = FK.state.tab === 'songs' && chords.length > 0;
    r.hidden = !show;
    document.getElementById('stage').classList.toggle('has-ribbon', show && !ribbonHidden);
    if (!show) return;
    r.classList.toggle('collapsed', ribbonHidden);
    r.innerHTML = `<div class="rb-head"><span class="rb-title">${ribbonHidden ? 'Chords' : 'Up next'}</span><span class="rb-count" data-rb="count"></span><span class="spacer"></span>
        <button class="rb-btn" data-rb="live" title="Chord screen: just the chords, full screen">${LIVE_ICON}</button>
        <button class="rb-btn" data-rb="toggle" title="${ribbonHidden ? 'Show the chord ribbon' : 'Hide the chord ribbon'}">${ribbonHidden ? '▾ show' : '▴'}</button></div>
      ${ribbonHidden ? '' : `<div class="rb-viewport"><div class="rb-track">${chords.map((c, i) => `<button class="chip rb-chip" data-ri="${i}" title="${c.beats} beat${c.beats === 1 ? '' : 's'}"><span class="rn">${c.roman}</span><span class="cn">${c.label}</span><span class="rb-beats">${c.beats}</span></button>`).join('')}</div></div>`}`;
    ribbonIdx = -1;
    ribbonGo(playing && activeChip ? +activeChip.dataset.ci : focus != null ? focus : 0, false);
  }
  function ribbonGo(i, animate = true) {
    const r = ribbonEl();
    if (!r || r.hidden || ribbonHidden) return;
    const track = r.querySelector('.rb-track'), vp = r.querySelector('.rb-viewport');
    if (!track) return;
    const chips = track.children;
    const idx = Math.max(0, Math.min(chips.length - 1, i));
    for (let k = 0; k < chips.length; k++) {
      chips[k].classList.toggle('past', k < idx && i >= 0 && !!playing);
      chips[k].classList.toggle('current', k === idx);
      chips[k].classList.toggle('next', k === idx + 1);
    }
    const target = chips[idx];
    const x = Math.max(0, Math.min(target.offsetLeft - vp.clientWidth * 0.18, track.scrollWidth - vp.clientWidth));
    track.style.transition = animate ? 'transform .45s cubic-bezier(.3,.7,.2,1)' : 'none';
    track.style.transform = `translateX(${-x}px)`;
    ribbonIdx = idx;
    updateCount();
  }
  function ribbonActivate(i, durSec) {
    const r = ribbonEl();
    if (!r) return;
    ribbonGo(i);
    const chip = r.querySelector(`[data-ri="${i}"]`);
    r.querySelectorAll('.rb-chip.playing').forEach((c) => { if (c !== chip) c.classList.remove('playing', 'timed', 'hit'); });
    if (!chip) return;
    chip.classList.add('playing');
    chip.classList.remove('timed', 'hit');
    chip.style.setProperty('--p', '0');
    cancelAnimationFrame(ribbonTimer);
    ribbonTimed = null;
    if (durSec) {
      chip.style.setProperty('--dur', durSec.toFixed(3) + 's');
      void chip.offsetWidth;
      chip.classList.add('timed');
      ribbonTimed = { t0: performance.now(), dur: durSec * 1000, beats: flatChords()[i].beats };
      const tickCount = () => { if (!ribbonTimed) return; updateCount(); ribbonTimer = requestAnimationFrame(tickCount); };
      tickCount();
    }
  }
  function ribbonFrac(f, beatsLeft) {
    const r = ribbonEl();
    const chip = r && r.querySelector('.rb-chip.playing');
    if (chip) chip.style.setProperty('--p', Math.max(0, Math.min(1, f)).toFixed(3));
    updateCount(beatsLeft);
  }
  function updateCount(beatsLeft) {
    const r = ribbonEl();
    const box = r && r.querySelector('[data-rb=count]');
    if (!box) return;
    const chords = flatChords();
    const next = chords[ribbonIdx + 1];
    if (beatsLeft == null && ribbonTimed) beatsLeft = ribbonTimed.beats * Math.max(0, 1 - (performance.now() - ribbonTimed.t0) / ribbonTimed.dur);
    if (!playing || beatsLeft == null) { box.innerHTML = next ? `then <b>${next.label}</b>` : ''; return; }
    const n = Math.max(1, Math.ceil(beatsLeft - 0.05));
    box.innerHTML = next ? `next <b>${next.label}</b> in <b class="rb-n">${n}</b> beat${n === 1 ? '' : 's'}` : 'last chord';
  }
  function ribbonCheckInput() {
    const r = ribbonEl();
    const chip = r && r.querySelector('.rb-chip.playing, .rb-chip.current');
    if (!chip || !FK.input || !FK.input.active()) return;
    const c = flatChords()[+chip.dataset.ri];
    if (c) chip.classList.toggle('hit', FK.input.matches(c.rootPc, c.suffix));
  }

  function highlight(i) {
    $$('[data-ci]', el).forEach((c) => { const on = +c.dataset.ci === i; c.classList.toggle('playing', on); if (!on) c.classList.remove('timed'); });
    if (i < 0) {
      activeChip = null;
      ribbonTimed = null;
      cancelAnimationFrame(ribbonTimer);
      const r = ribbonEl();
      if (r) r.querySelectorAll('.rb-chip').forEach((c) => c.classList.remove('playing', 'timed', 'hit', 'past'));
      ribbonGo(focus != null ? focus : 0);
    }
  }
  /* glowing chord box with a left-to-right fill showing time until the next chord */
  let activeChip = null;
  function setActive(i, durSec) {
    if (i >= 0) { live.idx = i; live.t0 = performance.now(); live.dur = (durSec || 0) * 1000; }
    highlight(i);
    ribbonActivate(i, durSec);
    activeChip = $(`[data-ci="${i}"]`, el);
    if (!activeChip) return;
    activeChip.classList.remove('timed');
    activeChip.style.setProperty('--p', '0');
    if (durSec) {
      activeChip.style.setProperty('--dur', durSec.toFixed(3) + 's');
      void activeChip.offsetWidth;
      activeChip.classList.add('timed');
    }
  }
  function setFrac(f, beatsLeft) {
    if (activeChip) activeChip.style.setProperty('--p', Math.max(0, Math.min(1, f)).toFixed(3));
    ribbonFrac(f, beatsLeft);
  }
  function beatDot(b, n, count) {
    const dots = $$('[data-role=dots] i', el);
    dots.forEach((d, i) => { d.classList.toggle('on', i === b); d.classList.toggle('accent', i === 0 || !!count); });
  }

  function tempoChanged(v) {
    st.tempo = v; save();
    if (playing && playing.handle && playing.handle.setBpm) playing.handle.setBpm(v);
  }

  /* ---------------- events ---------------- */
  function selectSong(s) {
    FK.stopTransport();
    song = s;
    st.songId = songId(s);
    st.transpose = 0; st.tempo = null; st.section = 'all'; focus = null;
    live.resume = 0;
    if (live.open) closeLive();
    st.custom = s.user || FK.SONGS.some((x) => songId(x) === songId(s)) ? null : s;
    editing = false; delArmed = false;
    FK.store.set('songs', st);
    renderList(); renderDetail(); renderSpotify(); stageIdle();
    if (s.hasAudio && FK.platform.mobile) ensureAudio(); // load it now so Play can start straight from the tap
    if (window.matchMedia('(max-width: 1080px)').matches) $('[data-role=detail]', el).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function selectSpotify(i) {
    const r = spResults[i];
    if (!r) return;
    const lib = matchLibrary(r);
    if (lib) {
      uriMap[songId(lib)] = r.uri; FK.store.set('song-uris', uriMap);
      selectSong(Object.assign({}, lib, { image: r.image, uri: r.uri }));
      return;
    }
    const s = { t: r.name, a: r.artists, image: r.image, uri: r.uri, bpm: null, sections: [] };
    selectSong(s);
    const f = await FK.spotify.features(r.id);
    if (f && f.key >= 0) {
      s.key = T.MAJOR_NAMES[f.key]; s.mode = f.mode === 1 ? 'major' : 'minor'; s.bpm = Math.round(f.tempo);
      s.note = 'Key and tempo from Spotify’s audio analysis — no chord chart in our library, so try the key’s common progressions below or type the chords in.';
      const prog = s.mode === 'major' ? ['I', 'V', 'vi', 'IV'] : ['i', 'VI', 'III', 'VII'];
      s.sections = [{ n: 'Common progression in this key (not from the song)', c: prog.map((r2) => T.parseRoman(r2, f.key, s.mode).label.replace(/♯/g, '#').replace(/♭/g, 'b')).join(' ') }];
    } else s.featureTried = true;
    if (song === s) { renderDetail(); stageIdle(); }
  }

  function detect() {
    const input = $('[data-role=prog]', el).value.trim();
    const box = $('[data-role=detect]', el);
    const chords = input.split(/[\s,|]+/).filter(Boolean).map((t) => T.parseChord(t.split(':')[0]));
    if (!chords.length || chords.some((c) => !c)) {
      box.innerHTML = `<p class="feedback bad">Couldn't read ${chords.length ? 'some of those chords' : 'that'} — use names like C, Am, F#m7, Bb, D/F#.</p>`;
      return;
    }
    const res = T.detectKey(chords);
    box.innerHTML = `<div style="margin-top:14px">${res.slice(0, 3).map((r, i) => `
      <div class="prog" style="cursor:default;margin-bottom:8px">
        <span class="tag key ${r.mode === 'minor' ? 'minor' : ''}" style="font-size:14px">${i === 0 ? '★ ' : ''}${r.name}</span>
        <span class="pchords">${chords.map((c) => `<span><em>${T.romanFor(c.rootPc, c.suffix, r.pc, r.mode)}</em>${c.label}</span>`).join('')}</span>
        <span class="spacer"></span><button class="btn small" data-load="${r.pc}:${r.mode}">Jam in ${T.pretty(T.keyRootName(r.pc, r.mode))}${r.mode === 'minor' ? 'm' : ''}</button>
      </div>`).join('')}
      <p class="muted" style="font-size:12.5px">Most likely first. A song that starts or ends on a chord usually lives in that chord's key.</p></div>`;
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.dataset.song) { const s = findSong(b.dataset.song); if (s) selectSong(Object.assign({}, s, uriMap[songId(s)] ? { uri: uriMap[songId(s)] } : {})); return; }
    if (b.dataset.sp != null) { selectSpotify(+b.dataset.sp); return; }
    if (b.dataset.seek != null) { seek(+b.dataset.seek + 0.01); return; }
    if (b.dataset.f) { st.filter = b.dataset.f; save(); renderList(); return; }
    if (b.dataset.tr != null) {
      st.transpose = b.dataset.tr === '0' ? 0 : FK.clamp(st.transpose + +b.dataset.tr, -11, 11);
      live.resume = 0;
      save(); FK.stopTransport(); renderDetail(); stageIdle(); return;
    }
    if (b.dataset.ci != null) { chipClick(+b.dataset.ci); return; }
    if (b.dataset.noodle) { st.noodle = b.dataset.noodle; save(); renderDetail(); if (!playing) stageIdle(); return; }
    if (b.dataset.view) { st.view = b.dataset.view; save(); renderDetail(); if (!playing) stageIdle(); return; }
    if (b.dataset.load) {
      const [pc, mode] = b.dataset.load.split(':');
      const input = $('[data-role=prog]', el).value.trim();
      selectSong({ t: 'My progression', a: 'Custom · ' + T.keyName(+pc, mode), key: T.keyRootName(+pc, mode), mode, bpm: 100, sections: [{ n: 'Progression', c: input.replace(/[,|]/g, ' ') }] });
      return;
    }
    const act = b.dataset.act;
    if (act === 'detect') detect();
    else if (act === 'play') togglePlay();
    else if (act === 'live') openLive();
    else if (act === 'setkey') {
      const pc = +$('[data-role=setkey]', el).value, mode = $('[data-role=setmode]', el).value;
      const chords = $('[data-role=setchords]', el).value.trim();
      song.key = T.keyRootName(pc, mode); song.mode = mode; song.bpm = song.bpm || 100;
      const prog = T.isMinorMode(mode) ? ['i', 'VI', 'III', 'VII'] : ['I', 'V', 'vi', 'IV'];
      song.sections = chords ? [{ n: 'Chords', c: chords }] : [{ n: 'Common progression in this key (not from the song)', c: prog.map((r) => T.parseRoman(r, pc, mode).label.replace(/♯/g, '#').replace(/♭/g, 'b')).join(' ') }];
      st.custom = song; FK.store.set('songs', st);
      renderDetail(); stageIdle();
    }
    else if (act === 'rec-toggle') togglePlay();
    else if (act === 'edit') { editing = !editing; delArmed = false; renderDetail(); }
    else if (act === 'edit-save') saveEdit();
    else if (act === 'reanalyse') reanalyse();
    else if (act === 'transcribe') handleFiles();
    else if (act === 'clear-slots') { slots.audio = slots.sheet = null; renderSlots(); }
    else if (act === 'export-all') exportSongs(FK.mySongs.list());
    else if (act === 'export-one') exportSongs([song]);
    else if (act === 'acoustid-save') { FK.engine.setAcoustidKey($('[data-role=acoustid]', el).value); FK.toast(FK.engine.acoustidKey() ? 'AcoustID key saved — new uploads will be identified' : 'AcoustID turned off'); }
    else if (act === 'delete') {
      if (!delArmed) { delArmed = true; b.textContent = 'Click again to delete'; b.classList.add('on'); return; }
      FK.stopTransport();
      FK.mySongs.remove(song.id);
      if (audioEl && audioEl._id === song.id) { audioEl.pause(); URL.revokeObjectURL(audioEl.src); audioEl = null; }
      FK.toast('Song deleted');
      selectSong(FK.SONGS[0]);
    }
    else if (act === 'sp-toggle') FK.spotify.embed.toggle();
    else if (act === 'sp-restart') FK.spotify.embed.restart();
    else if (act === 'dev-play') FK.spotify.devicePlay(song.uri || uriMap[songId(song)]).catch((err) => FK.toast(err.status === 404 ? 'Open Spotify on a device first, then try again.' : err.message));
    else if (act === 'dev-pause') FK.spotify.devicePause().catch((err) => FK.toast(err.message));
    else if (act === 'sp-link') {
      const uri = FK.spotify.parseUri($('[data-role=splink]', el).value);
      if (!uri) { FK.toast('That doesn’t look like a Spotify track link.'); return; }
      song.uri = uri; uriMap[songId(song)] = uri; FK.store.set('song-uris', uriMap);
      renderSpotify();
    }
    else if (act === 'sp-find') spotifyFind();
    else if (act === 'sp-pick') {
      const r = findResults[+b.dataset.i];
      song.uri = r.uri; song.image = song.image || r.image; uriMap[songId(song)] = r.uri; FK.store.set('song-uris', uriMap);
      renderSpotify(); renderDetail();
    }
    else if (act === 'sp-login') {
      FK.spotify.setClientId($('[data-role=clientid]', el).value);
      FK.spotify.login().catch((err) => FK.toast(err.message));
    }
    else if (act === 'sp-cancel') FK.spotify.cancelLogin();
    else if (act === 'sp-logout') { FK.spotify.logout(); spResults = []; renderList(); }
  }

  let findResults = [];
  async function spotifyFind() {
    const box = $('[data-role=spfind]', el);
    box.innerHTML = '<p class="muted" style="font-size:13px">Searching…</p>';
    try {
      findResults = await FK.spotify.search(`${song.t} ${song.a}`.replace(/\(.*?\)/g, ''));
      box.innerHTML = findResults.length ? `<div class="song-list" style="max-height:260px">${findResults.slice(0, 5).map((r, i) => `<button class="song-item" data-act="sp-pick" data-i="${i}"><span class="song-art">${r.image ? `<img src="${esc(r.image)}" alt="">` : '♪'}</span><span><div class="song-t">${esc(r.name)}</div><div class="song-a">${esc(r.artists)}</div></span><span class="tag">Use</span></button>`).join('')}</div>` : '<p class="muted">No results.</p>';
    } catch (err) { box.innerHTML = `<p class="feedback bad">${esc(err.message)}</p>`; }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.opt) { st[t.dataset.opt] = t.checked; save(); }
    if (t.dataset.role === 'speed') { st.speed = +t.value; save(); if (audioEl) audioEl.playbackRate = st.speed; }
    if (t.dataset.role === 'section') { st.section = t.value; save(); live.resume = 0; if (playing) { FK.stopTransport(); togglePlay(); } }
  }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.role === 'trackvol') { setTrackVol(+t.value); return; }
    if (t.dataset.role === 'tempo') { t.nextElementSibling.textContent = t.value + ' bpm'; tempoChanged(+t.value); }
  }

  /* ---------------- my songs: upload, recording playback, editing ---------------- */
  const slots = { audio: null, sheet: null };
  const AUDIO_RE = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|webm|aiff?)$/i;
  const SHEET_RE = /\.(pdf|musicxml|xml|mxl|mid|midi|mscz|mscx|png|jpe?g|tiff?|bmp|webp)$/i;
  function addFile(f, hint) {
    if (FK.transfer.isSongFile(f)) { importSongs([f]); return; }
    const kind = AUDIO_RE.test(f.name) || /^audio\//.test(f.type) ? 'audio' : SHEET_RE.test(f.name) ? 'sheet' : null;
    if (!kind) { FK.toast('“' + f.name + '” isn’t an audio or sheet-music file.'); return; }
    if (hint && kind !== hint) FK.toast(kind === 'audio' ? 'That’s a recording — added to the Recording slot.' : 'That’s sheet music — added to the Sheet music slot.');
    slots[kind] = f;
    renderSlots();
  }
  function renderSlots() {
    $('[data-role=slot-audio]', el).textContent = slots.audio ? '✓ ' + slots.audio.name : 'MP3, WAV, M4A, OGG, FLAC';
    $('[data-role=slot-sheet]', el).textContent = slots.sheet ? '✓ ' + slots.sheet.name : SHEET_HINT;
    $$('[data-role=drop]', el).forEach((d) => d.classList.toggle('filled', !!slots[d.dataset.kind]));
    $('[data-act=transcribe]', el).disabled = !(slots.audio || slots.sheet) || busy;
  }
  function showEngine(stt) {
    const pill = $('[data-role=engine]', el);
    if (!pill) return;
    if (!FK.platform.desktop) { pill.textContent = 'On-device engine'; pill.className = 'engine-pill'; pill.title = 'Transcription runs right here on your device; nothing is uploaded'; return; }
    if (stt && stt.ai && stt.ai.available) { pill.textContent = '⚡ AI engine · ' + stt.ai.device; pill.className = 'engine-pill on'; pill.title = 'Stem separation (Demucs) + chord model (BTC) + neural beat tracker, cross-checked by the built-in engine'; }
    else if (stt) { pill.textContent = 'Built-in engine only'; pill.className = 'engine-pill'; pill.title = (stt.ai && stt.ai.reason) || 'AI packages not installed'; }
    else { pill.textContent = 'Built-in engine (no sheet music)'; pill.className = 'engine-pill'; pill.title = 'Launch with “Fret and Key.bat” for the AI engine and sheet music'; }
  }

  async function handleFiles() {
    if (busy || !(slots.audio || slots.sheet)) return;
    const files = { audio: slots.audio, sheet: slots.sheet };
    const box = $('[data-role=upstatus]', el);
    busy = true;
    renderSlots();
    box.innerHTML = `<div class="up-prog"><div class="row"><b style="font-size:14px">${esc([files.audio && files.audio.name, files.sheet && files.sheet.name].filter(Boolean).join(' + '))}</b><span class="spacer"></span><span class="muted" data-role="upstage" style="font-size:13px">Starting…</span></div><div class="sp-progress" style="margin-top:8px"><i data-role="upbar"></i></div></div>`;
    try {
      const s = await FK.analyzeFile(files, (p, stage) => {
        const bar = $('[data-role=upbar]', el), lab = $('[data-role=upstage]', el);
        if (bar) bar.style.width = Math.round(p * 100) + '%';
        if (lab) lab.textContent = stage + '…';
      });
      if (files.sheet && files.audio) FK.audioStore.put(s.id + ':sheet', files.sheet).catch(() => {});
      slots.audio = slots.sheet = null;
      box.innerHTML = `<p class="feedback good">✓ Added “${esc(s.t)}” — ${T.keyName(T.pcOf(s.key), s.mode)}${s.hasAudio ? `, ≈${s.bpm} bpm, ${s.segments.length} chord changes` : ' · from sheet music'}.</p>`;
      if (st.filter !== 'mine') st.filter = 'all';
      selectSong(FK.mySongs.list().find((x) => x.id === s.id));
    } catch (err) {
      box.innerHTML = `<p class="feedback bad">${esc(err.message || 'Analysis failed')}</p>`;
    } finally { busy = false; renderSlots(); }
  }

  /* ---------------- moving songs between devices (.fretkey files) ---------------- */
  function xstatus(html) { const box = $('[data-role=xstatus]', el); if (box) box.innerHTML = html; }
  async function exportSongs(list) {
    if (!list.length) { FK.toast('No songs of your own to export yet.'); return; }
    xstatus(`<p class="muted" style="font-size:13px">Preparing ${list.length} song${list.length === 1 ? '' : 's'}…</p>`);
    try {
      const blob = await FK.transfer.exportSongs(list);
      const r = await FK.transfer.save(blob, FK.transfer.fileName(list));
      const mb = (blob.size / 1048576).toFixed(1) + ' MB';
      xstatus(r.cancelled ? '' : `<p class="feedback good">✓ Exported ${list.length} song${list.length === 1 ? '' : 's'} (${mb})${r.saved ? ` to <code>${esc(r.saved)}</code>` : ''}. Open it on your other device with <b>Import songs</b>.</p>`);
    } catch (err) { xstatus(`<p class="feedback bad">${esc(err.message || 'Export failed')}</p>`); }
  }
  async function importSongs(files) {
    if (!files.length) return;
    xstatus('<p class="muted" style="font-size:13px">Importing…</p>');
    let added = 0, updated = 0, first = null;
    try {
      for (const f of files) {
        const r = await FK.transfer.importFile(f);
        added += r.added; updated += r.updated;
        first = first || r.songs[0];
      }
      const parts = [added && `${added} new`, updated && `${updated} updated`].filter(Boolean).join(', ');
      xstatus(`<p class="feedback good">✓ Imported ${added + updated} song${added + updated === 1 ? '' : 's'} (${parts}).</p>`);
      if (st.filter !== 'mine') st.filter = 'all';
      selectSong(FK.mySongs.list().find((x) => x.id === first.id) || FK.mySongs.list()[0]);
    } catch (err) {
      xstatus(`<p class="feedback bad">${esc(err.message || 'Import failed')}</p>`);
      renderList();
    }
  }

  function recTimeline() {
    const chords = flatChords();
    if (song.segments && !song.edited && song.segments.length === chords.length) return chords.map((c, i) => ({ c, start: song.segments[i].start, end: song.segments[i].end }));
    const spb = 60 / (song.bpm || 100);
    let t = song.segments && song.segments[0] ? song.segments[0].start : 0;
    return chords.map((c) => { const s0 = t; t += c.beats * spb; return { c, start: s0, end: t }; });
  }
  const dur = () => song.duration || (recTimeline().slice(-1)[0] || { end: 1 }).end;

  function recBlock() {
    const D = dur();
    const blocks = recTimeline().map((x, i) => {
      const l = (100 * x.start) / D, w = Math.max(0.3, (100 * (x.end - x.start)) / D);
      return `<button class="rec-seg" data-seek="${x.start}" data-si="${i}" style="left:${l}%;width:${w}%;--h:${(x.c.rootPc * 30 + (x.c.suffix.startsWith('m') && !x.c.suffix.startsWith('maj') ? 15 : 0)) % 360}" title="${esc(x.c.label)} · ${fmt(x.start * 1000)}">${w > 3.2 ? esc(x.c.label) : ''}</button>`;
    }).join('');
    return `<div class="rec">
      <div class="row">
        <button class="sp-big rec-btn" data-act="rec-toggle" title="Play / pause (Space)">${playing && playing.audio ? I().pause : I().play}</button>
        <div><b style="font-size:14px">Your recording</b><div class="sp-time" data-role="rectime">0:00 / ${fmt(D * 1000)}</div></div>
        <span class="spacer"></span>
        <label class="muted" style="font-size:13px;display:flex;gap:8px;align-items:center">Speed <select data-role="speed" style="width:auto;height:34px">${[1, 0.9, 0.75, 0.6, 0.5].map((v) => `<option value="${v}" ${st.speed === v ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('')}</select></label>
        <label class="switch"><input type="checkbox" data-opt="double" ${st.double ? 'checked' : ''}> Play the chords too</label>
      </div>
      <div class="range-row track-vol" title="Volume of this recording (saved with the song). Above 100% boosts quiet recordings.">
        <span class="muted" style="font-size:13px">Track volume</span>
        <input type="range" min="0" max="2" step="0.01" data-role="trackvol" value="${trackVol()}">
        <output data-role="trackvolout">${Math.round(trackVol() * 100)}%</output>
      </div>
      <div class="rec-line" data-role="recline">${blocks}<i class="rec-head" data-role="rechead"></i></div>
      <p class="muted" style="font-size:12px;margin:8px 0 0">Click the timeline or a chord to jump there. Slowed-down playback keeps the original pitch.</p>
    </div>`;
  }

  function updateHead(t) {
    const h = $('[data-role=rechead]', el), tm = $('[data-role=rectime]', el);
    if (h) h.style.left = (100 * t) / dur() + '%';
    if (tm) tm.textContent = fmt(t * 1000) + ' / ' + fmt(dur() * 1000);
  }

  async function ensureAudio() {
    if (audioEl && audioEl._id === song.id) return audioEl;
    const id = song.id;
    const blob = await FK.audioStore.get(id);
    if (audioEl && audioEl._id === song.id) return audioEl; // loaded meanwhile (the song was opened twice)
    if (id !== song.id) return null; // another song was picked while this one loaded
    if (!blob) { FK.toast('The audio for this song is missing — add the file again.'); return null; }
    if (audioEl) { audioEl.pause(); URL.revokeObjectURL(audioEl.src); }
    audioEl = new Audio(URL.createObjectURL(blob));
    audioEl._id = id;
    audioEl.preservesPitch = true;
    if (FK.platform.mobile) {
      // phones play the file straight from the element: once it's routed through Web Audio, iPhone plays it silently
      // whenever the audio context was interrupted (e.g. by leaving the app to pick a .fretkey file to import)
      audioEl.playsInline = true;
      audioEl.preload = 'auto';
      directVol();
    } else {
      // through the app's mixer: per-track volume (up to 2×) → "Your recordings" → master
      audioEl._gain = FK.audio.attachMedia(audioEl);
      audioEl._gain.gain.value = trackVol();
    }
    return audioEl;
  }

  /* phone playback: the element's own volume (Android follows it; iPhone uses the hardware buttons only) */
  function directVol() {
    if (!audioEl || audioEl._gain) return;
    const v = trackVol() * FK.audio.getLevel('tracks') * FK.audio.getLevel('master');
    audioEl.volume = Math.max(0, Math.min(1, v));
  }
  FK.on('mix', directVol);

  async function playRecording() {
    // already loaded → start without waiting, so the phone still counts this as the tap that allows sound
    const a = audioEl && audioEl._id === song.id ? audioEl : await ensureAudio();
    if (!a) return;
    a.playbackRate = st.speed || 1;
    if (a.ended || a.currentTime >= dur() - 0.2) a.currentTime = 0;
    const tl = recTimeline();
    let prev = null;
    tl.forEach((x) => { x.v = prev = FK.voice.get(x.c, prev); });
    let last = -2;
    playing = { audio: true, handle: { stop() { a.pause(); cancelAnimationFrame(raf); } } };
    FK.setTransport(playing.handle, () => {
      playing = null; highlight(-1);
      if (FK.state.tab === 'songs') { renderDetail(); stageIdle(); }
    });
    try { FK.audio.init(); await a.play(); } catch (e) {
      FK.stopTransport();
      FK.toast(e && e.name === 'NotAllowedError' ? 'Tap play again to start the recording.' : 'Could not play this file.');
      return;
    }
    renderDetail();
    const tick = () => {
      if (!playing || !playing.audio) return;
      const t = a.currentTime;
      const i = tl.findIndex((x) => t >= x.start && t < x.end);
      if (i !== last) {
        last = i;
        setActive(i);
        $$('.rec-seg', el).forEach((s2) => { s2.classList.toggle('on', +s2.dataset.si === i); s2.style.setProperty('--p', '0'); });
        if (i >= 0) {
          showChord(tl[i].c, tl[i].v);
          flashVoicing(tl[i].v);
          if (st.double) FK.voice.play(tl[i].v, { flash: false, vel: 0.45, dur: Math.min(4, (tl[i].end - tl[i].start) / a.playbackRate) });
        }
      }
      if (i >= 0) {
        const f = (t - tl[i].start) / Math.max(0.01, tl[i].end - tl[i].start);
        setFrac(f, (tl[i].end - t) / (60 / (song.bpm || 100)));
        const seg = el.querySelector(`.rec-seg[data-si="${i}"]`);
        if (seg) seg.style.setProperty('--p', Math.max(0, Math.min(1, f)).toFixed(3));
      }
      updateHead(t);
      if (a.ended) { FK.stopTransport(); return; }
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function trackVol() { return song && song.volume != null ? song.volume : 1; }
  function setTrackVol(v) {
    song.volume = v;
    if (audioEl && audioEl._id === song.id) { if (audioEl._gain) FK.audio.ramp(audioEl._gain.gain, v); else directVol(); }
    const o = $('[data-role=trackvolout]', el);
    if (o) o.textContent = Math.round(v * 100) + '%';
    clearTimeout(setTrackVol.t);
    setTrackVol.t = setTimeout(() => { if (song.user) FK.mySongs.save(song); }, 300);
  }

  async function seek(t) {
    const a = await ensureAudio();
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(dur() - 0.05, t));
    updateHead(a.currentTime);
  }

  function userTools() {
    const an = song.analysis;
    let report = '';
    if (an && an.version < 3 && an.version >= 2 && song.hasAudio) {
      report = `<div class="note-box info">Transcribed with an earlier engine. <b>Re-analyse</b> to use the AI engine (stem separation, chord model, neural beats), off-beat changes and sheet-music support.</div>`;
    } else if (an && an.sheetOnly) {
      report = `<div class="report"><b>Read from sheet music (${esc(an.source || 'file')})</b>${(an.warnings || []).map((w) => `<span>• ${esc(w)}</span>`).join('')}<span>Add the recording too and the chords get lined up with it.</span></div>`;
    } else if (song.hasAudio && an && an.version >= 2) {
      const ch = song.keyChanges || [];
      const keyTxt = ch.length ? `${an.keys} keys (${T.keyName(T.pcOf(song.startKey || song.key), song.startMode || song.mode)}${ch.map((k) => ` → ${T.keyName(T.pcOf(k.key), k.mode)} at ${fmt(k.time * 1000)}`).join('')})` : 'no key changes';
      const src = song.sources || [];
      const engines = src.includes('ai') ? 'AI engine (Demucs stems + BTC chord model + neural beats) cross-checked by the built-in engine' : 'built-in engine';
      const sheetLine = an.sheetChords ? `<span>✓ ${an.sheetChords - an.sheetDisagree} chord${an.sheetChords - an.sheetDisagree === 1 ? '' : 's'} confirmed by sheet music and audio</span>${an.sheetDisagree ? `<span>• ${an.sheetDisagree} taken from the sheet where the audio was unclear</span>` : ''}<span>• ${an.audioFilled} beats not in the sheet, filled from the audio</span>` : '';
      report = `<div class="report"><b>Transcription checks</b>
        <span>✓ ${engines}</span>
        ${song.identity ? `<span>✓ Identified: ${esc(song.identity.title)}${song.identity.artist ? ' — ' + esc(song.identity.artist) : ''}</span>` : ''}
        ${song.reference ? `<span>✓ Cross-checked against the library chart</span>` : ''}
        ${sheetLine}
        ${src.includes('ai') && an.chords ? `<span>✓ AI and built-in engine agree on ${an.agree} of ${an.chords} chords</span>` : ''}
        ${an.anticipations ? `<span>✓ ${an.anticipations} pushed / off-beat change${an.anticipations === 1 ? '' : 's'} kept</span>` : ''}
        <span>✓ 2 full passes + 4 checks</span><span>✓ ${an.meter}/4 time · ${an.bars} bars</span><span>✓ ${keyTxt}</span>
        <span>✓ ${an.snapped} change${an.snapped === 1 ? '' : 's'} nudged onto the beat</span><span>✓ ${an.repeatFixed} bar${an.repeatFixed === 1 ? '' : 's'} matched to repeats</span>
        <span>✓ ${an.merged + an.keyFixed} weak chord${an.merged + an.keyFixed === 1 ? '' : 's'} corrected</span>
        ${an.unsure ? `<span class="warn">⚠ ${an.unsure} chord${an.unsure === 1 ? '' : 's'} still unsure (dotted outline)</span>` : '<span>✓ every chord passed</span>'}</div>`;
    } else if (song.hasAudio) {
      report = `<div class="note-box info">This song was transcribed with an earlier engine. Re-analyse it to use the AI engine, the eighth-note grid and the new checks.</div>`;
    }
    const row = `<div class="row" style="margin-top:12px"><button class="btn small" data-act="edit">${editing ? 'Close editor' : '✎ Edit song'}</button>
      ${song.hasAudio ? '<button class="btn small" data-act="reanalyse">⟲ Re-analyse</button>' : ''}<button class="btn small" data-act="export-one" title="Save this song (with its recording) as a file to open on another device">⇧ Export</button><button class="btn small ghost" data-act="delete">Delete</button>
      <span class="muted" style="font-size:12.5px">Fix anything that sounds off.</span></div><div data-role="reprog"></div>${report}`;
    if (!editing) return row;
    const kpc = T.pcOf(song.key);
    const text = sectionText();
    return row + `<div class="edit-box">
      <div class="row"><label class="field" style="flex:2;min-width:180px">Title<input type="text" data-ed="t" value="${esc(song.t)}"></label><label class="field" style="flex:2;min-width:160px">Artist<input type="text" data-ed="a" value="${esc(song.a)}"></label></div>
      <div class="row" style="margin-top:10px">
        <label class="field">Key<select data-ed="key" style="width:auto">${T.ROOT_LABELS.map((l, pc) => `<option value="${pc}" ${pc === kpc ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Mode<select data-ed="mode" style="width:auto">${['major', 'minor', 'dorian', 'mixolydian'].map((m) => `<option ${m === song.mode ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="field">BPM<input type="number" data-ed="bpm" min="30" max="260" value="${song.bpm}" style="width:90px"></label>
      </div>
      <label class="field" style="margin-top:10px">Chords — one section per line as <code>Name [key]: chords</code>; key is optional (e.g. <code>[Ebm]</code>), <code>:beats</code> after a chord sets its length
        <textarea data-ed="chords" rows="6" spellcheck="false" style="font-family:var(--font-mono);font-size:13px">${esc(text)}</textarea></label>
      <div class="row" style="margin-top:10px"><button class="btn primary small" data-act="edit-save">Save changes</button><span class="muted" style="font-size:12px">Changing the chords switches playback sync from the detected timings to the BPM grid.</span></div>
    </div>`;
  }

  function sectionText() {
    return (song.sections || []).map((x) => `${x.n}${x.key ? ` [${x.key}${x.mode === 'minor' ? 'm' : ''}]` : ''}: ${x.c}`).join('\n');
  }

  async function reanalyse() {
    if (busy) return;
    const blob = await FK.audioStore.get(song.id);
    if (!blob) { FK.toast('The audio for this song is missing — add the file again.'); return; }
    FK.stopTransport();
    busy = true;
    const box = $('[data-role=reprog]', el);
    box.innerHTML = `<div class="up-prog"><div class="row"><b style="font-size:14px">Re-analysing</b><span class="spacer"></span><span class="muted" data-role="restage" style="font-size:13px">Starting…</span></div><div class="sp-progress" style="margin-top:8px"><i data-role="rebar"></i></div></div>`;
    try {
      const sheetBlob = await FK.audioStore.get(song.id + ':sheet').catch(() => null);
      const files = { audio: new File([blob], (song.a !== 'My upload' ? song.a + ' - ' : '') + song.t, { type: blob.type }), sheet: sheetBlob ? new File([sheetBlob], sheetBlob.name || 'sheet', { type: sheetBlob.type }) : null };
      const fresh = await FK.transcribe(files, (p, stage) => {
        const bar = $('[data-role=rebar]', el), lab = $('[data-role=restage]', el);
        if (bar) bar.style.width = Math.round(p * 100) + '%';
        if (lab) lab.textContent = stage + '…';
      });
      const keep = { id: song.id, t: song.t, a: song.a, added: song.added, image: song.image };
      Object.keys(song).forEach((k) => delete song[k]);
      Object.assign(song, fresh, keep);
      FK.mySongs.save(song);
      FK.toast('Re-analysed ✓');
    } catch (err) { FK.toast(err.message || 'Analysis failed'); }
    busy = false;
    renderList(); renderDetail(); stageIdle();
  }

  function saveEdit() {
    const v = (k) => $(`[data-ed=${k}]`, el).value;
    const text = v('chords');
    const before = sectionText();
    const secs = text.split('\n').map((line) => line.trim()).filter(Boolean).map((line, i) => {
      const m = /^([^:]{1,60}?):\s+(.*)$/.exec(line);
      if (!m || T.parseChord(m[1].trim(), true)) return { n: 'Part ' + (i + 1), c: line };
      const sec = { n: m[1].trim(), c: m[2].trim() };
      const k = /\s*\[([A-G][#b]?)(m)?\]\s*$/.exec(sec.n);
      if (k) { sec.n = sec.n.slice(0, k.index).trim() || 'Part ' + (i + 1); sec.key = k[1]; sec.mode = k[2] ? 'minor' : 'major'; }
      return sec;
    }).filter((x) => x.c);
    const bad = secs.flatMap((x) => x.c.split(/\s+/)).filter((tok) => !T.parseChord(tok.split(':')[0], true));
    if (bad.length) { FK.toast('Couldn’t read: ' + bad.slice(0, 4).join(', ')); return; }
    const mode = v('mode');
    song.t = v('t').trim() || song.t;
    song.a = v('a').trim() || song.a;
    song.key = T.keyRootName(+v('key'), mode);
    song.mode = mode;
    song.bpm = FK.clamp(+v('bpm') || song.bpm, 30, 260);
    if (text.trim() !== before.trim()) { song.sections = secs; song.edited = true; }
    FK.mySongs.save(song);
    editing = false;
    FK.toast('Saved');
    renderList(); renderDetail(); stageIdle();
  }

  /* ---------------- chord screen: only the chord names, as big as the screen allows ---------------- */
  const live = { open: false, raf: 0, idx: -1, t0: 0, dur: 0, from: 0, resume: 0, shown: null, chords: [], bars: [], order: null, tl: null };
  const liveEl = () => document.getElementById('liveChords');

  /* bar (1-based) and beat within the bar where each chord starts */
  function liveBars(chords) {
    const meter = song.beats || 4;
    const sg = song.segments;
    const synced = song.hasAudio && sg && !song.edited && sg.length === chords.length;
    const out = [];
    let cum = 0;
    chords.forEach((c, i) => {
      if (synced && sg[i].bar != null) {
        let pos = sg[i].pos;
        if (pos == null) {
          // older transcriptions didn't keep the beat: carry on from the previous chord when it ran into this bar
          const p = out[i - 1];
          const carry = p ? p.pos + chords[i - 1].beats - meter * (sg[i].bar + 1 - p.bar) : 0;
          pos = carry >= 0 && carry < meter ? carry : 0;
        }
        out.push({ bar: sg[i].bar + 1, pos });
      } else out.push({ bar: Math.floor(cum / meter + 1e-6) + 1, pos: cum % meter });
      cum += c.beats;
    });
    return out;
  }
  /* the chords in the order they'll be played; play-along loops (a chosen section loops on its own) */
  function liveOrder(chords) {
    const every = chords.map((_, i) => i);
    if (song.hasAudio) return { list: every, loop: false };
    if (st.section === 'all') return { list: every, loop: true };
    let off = 0, list = [];
    sections().forEach((s) => { if (String(s.si) === String(st.section)) list = s.chords.map((_, j) => off + j); off += s.chords.length; });
    return { list: list.length ? list : every, loop: true };
  }
  function upcoming(i, n) {
    const { list, loop } = live.order;
    const k = list.indexOf(i);
    const out = [];
    for (let s = 1; s <= n; s++) {
      let j = k + s;
      if (j >= list.length) { if (!loop) break; j %= list.length; }
      if (list[j] === i && out.length) break;
      out.push(list[j]);
    }
    return out;
  }
  /* which chord is sounding and how far through it we are */
  function liveStatus() {
    if (song.hasAudio) {
      const tl = live.tl;
      const t = audioEl && audioEl._id === song.id ? audioEl.currentTime : 0;
      const i = tl.findIndex((x) => t >= x.start && t < x.end);
      if (i >= 0) return { i, frac: (t - tl[i].start) / Math.max(0.01, tl[i].end - tl[i].start) };
      // before the first chord or between chords: show what's coming
      let j = tl.findIndex((x) => x.start > t);
      if (j < 0) j = tl.length - 1;
      return { i: j, frac: 0, waiting: !!playing };
    }
    if (playing && live.idx >= 0) return { i: live.idx, frac: Math.min(1, (performance.now() - live.t0) / Math.max(1, live.dur)) };
    if (playing) return { i: live.from, frac: 0, waiting: true }; // count-in
    return { i: live.order.list.includes(live.resume) ? live.resume : live.order.list[0], frac: 0 };
  }

  /* largest font size at which the text fits its box */
  function fitText(span) {
    const box = span.parentElement;
    if (!box || !span.textContent) return;
    span.style.fontSize = '100px';
    const w = span.offsetWidth || 1, h = span.offsetHeight || 1;
    const size = Math.min((100 * box.clientWidth) / w, (100 * box.clientHeight) / h) * 0.94;
    span.style.fontSize = Math.max(14, Math.floor(size)) + 'px';
  }

  function liveRender(force) {
    const r = liveEl();
    if (!live.open || !r || !song) return;
    const s = liveStatus();
    const c = live.chords[s.i];
    if (!c) return;
    const meter = song.beats || 4;
    const info = live.bars[s.i];
    const into = info.pos + s.frac * c.beats;
    const bar = info.bar + Math.floor(into / meter + 1e-6);
    const beat = Math.floor(into + 1e-6) % meter;
    const q = (k) => r.querySelector(`[data-lv="${k}"]`);
    if (force || s.i !== live.shown) {
      live.shown = s.i;
      const next = upcoming(s.i, 4);
      q('now').textContent = c.label;
      q('n1').textContent = next.length ? live.chords[next[0]].label : '';
      q('n1bar').textContent = next.length ? 'bar ' + live.bars[next[0]].bar : '';
      q('later').innerHTML = next.slice(1).map((j) => `<span><b>${esc(live.chords[j].label)}</b><small>bar ${live.bars[j].bar}</small></span>`).join('');
      q('next').classList.toggle('empty', !next.length);
      fitText(q('now'));
      fitText(q('n1'));
      q('beats').innerHTML = Array.from({ length: meter }, () => '<i></i>').join('');
    }
    q('bar').textContent = bar;
    q('nowlab').textContent = s.waiting ? (song.hasAudio ? 'Up first' : 'Count-in') : 'Now';
    r.classList.toggle('waiting', !!s.waiting);
    q('prog').style.width = (100 * s.frac).toFixed(1) + '%';
    Array.from(q('beats').children).forEach((d, k) => d.classList.toggle('on', !s.waiting && !!playing && k === beat));
    const left = Math.max(1, Math.ceil(c.beats * (1 - s.frac) - 0.05));
    q('in').textContent = !q('next').classList.contains('empty') && playing && !s.waiting ? `in ${left} beat${left === 1 ? '' : 's'}` : '';
    const pb = q('play');
    const isOn = !!playing;
    if (pb._on !== isOn) { pb._on = isOn; pb.innerHTML = isOn ? I().pause : I().play; pb.setAttribute('aria-label', isOn ? 'Pause' : 'Play'); }
  }
  function liveLoop() {
    if (!live.open) return;
    liveRender(false);
    live.raf = requestAnimationFrame(liveLoop);
  }

  function initLive() {
    const r = liveEl();
    if (!r) return;
    r.innerHTML = `
      <div class="lv-top">
        <button class="lv-icon" data-lv="close" aria-label="Close the chord screen">${I().left}</button>
        <div class="lv-song"><b data-lv="title"></b><span data-lv="sub"></span></div>
        <div class="lv-bar"><small>Bar</small><b data-lv="bar">1</b></div>
      </div>
      <div class="lv-main">
        <div class="lv-now">
          <div class="lv-label"><span data-lv="nowlab">Now</span><span class="lv-beats" data-lv="beats"></span></div>
          <div class="lv-fit"><span class="lv-chord" data-lv="now"></span></div>
          <div class="lv-prog"><i data-lv="prog"></i></div>
        </div>
        <div class="lv-next" data-lv="next">
          <div class="lv-label"><span>Next <b data-lv="in"></b></span><span data-lv="n1bar"></span></div>
          <div class="lv-fit"><span class="lv-chord" data-lv="n1"></span></div>
          <div class="lv-later" data-lv="later"></div>
        </div>
      </div>
      <div class="lv-ctrl">
        <button class="lv-icon lv-restart" data-lv="restart" aria-label="Restart from the beginning"><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 108-8H7"/><path d="M9.5 1L6.5 4l3 3"/></svg><span>Restart</span></button>
        <button class="lv-play" data-lv="play" aria-label="Play">${I().play}</button>
        <span class="lv-spacer"></span>
      </div>`;
    r.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lv]');
      if (!b) return;
      if (b.dataset.lv === 'close') closeLive();
      else if (b.dataset.lv === 'play') liveToggle();
      else if (b.dataset.lv === 'restart') liveRestart();
    });
    document.addEventListener('keydown', (e) => { if (live.open && e.key === 'Escape') closeLive(); });
    window.addEventListener('orientationchange', () => setTimeout(() => liveRender(true), 250));
  }

  function openLive() {
    if (!song || !song.key) { FK.toast('Pick a song with chords first.'); return; }
    const chords = flatChords();
    if (!chords.length) { FK.toast('This song has no chords yet.'); return; }
    const r = liveEl();
    live.chords = chords;
    live.bars = liveBars(chords);
    live.order = liveOrder(chords);
    live.tl = song.hasAudio ? recTimeline() : null;
    if (!live.order.list.includes(live.resume)) live.resume = live.order.list[0];
    live.open = true;
    live.shown = null;
    r.querySelector('[data-lv="title"]').textContent = song.t;
    const kn = T.keyName(keyPc(), song.mode);
    r.querySelector('[data-lv="sub"]').textContent = `${song.a}${song.a.includes(kn) ? '' : ' · ' + kn}${song.bpm ? ` · ${st.tempo || song.bpm} bpm` : ''}`;
    r.hidden = false;
    document.body.classList.add('live-open');
    if (FK.wake) FK.wake.request();
    if (song.hasAudio) ensureAudio();
    cancelAnimationFrame(live.raf);
    requestAnimationFrame(() => { liveRender(true); liveLoop(); });
  }
  function closeLive() {
    live.open = false;
    cancelAnimationFrame(live.raf);
    const r = liveEl();
    if (r) r.hidden = true;
    document.body.classList.remove('live-open');
  }
  function liveToggle() {
    FK.audio.init();
    if (playing) { FK.stopTransport(); return; }
    if (song.hasAudio) togglePlay();
    else togglePlay({ from: live.resume });
  }
  async function liveRestart() {
    FK.audio.init();
    if (song.hasAudio) {
      await seek(0);
      if (!playing) togglePlay();
      return;
    }
    FK.stopTransport();
    live.resume = live.order.list[0];
    togglePlay({ from: live.resume });
  }

  function show() {
    if (!el) return;
    renderList(); renderDetail(); renderSpotify();
    if (!playing) stageIdle();
  }

  FK.panels.songs = { init, show, onMode() { if (playing) FK.stopTransport(); renderDetail(); stageIdle(); }, onInstrumentChange() { if (!playing) stageIdle(); } };
})();
