/* Fret & Key — move "My songs" between devices: transcribe on the PC with the AI engine, open the file on the phone.
   A .fretkey file holds the songs exactly as saved (chords, timings, edits, key changes, track volume) plus their
   recordings and sheet music, so the phone plays back the PC's transcription unchanged.

   Layout:  "FRETKEY1" | uint32 LE header length | UTF-8 JSON header | file data
   header:  { app, format, exported, songs: [ { song, files: { audio?, sheet? } } ] }
            each file: { offset, length, type, name } with offset counted from the start of the file data */
(function () {
  'use strict';
  const FK = window.FK;
  const MAGIC = 'FRETKEY1';
  const enc = new TextEncoder();

  async function exportSongs(songs) {
    const header = { app: 'fret-and-key', format: 1, exported: new Date().toISOString(), songs: [] };
    const parts = [];
    let offset = 0;
    const add = (blob, fallbackName) => {
      if (!blob) return undefined;
      const entry = { offset, length: blob.size, type: blob.type || '', name: blob.name || fallbackName };
      parts.push(blob);
      offset += blob.size;
      return entry;
    };
    for (const s of songs) {
      const song = Object.assign({}, s);
      delete song._debug;
      const audio = s.hasAudio ? await FK.audioStore.get(s.id).catch(() => null) : null;
      const sheet = await FK.audioStore.get(s.id + ':sheet').catch(() => null);
      header.songs.push({ song, files: { audio: add(audio, s.t), sheet: add(sheet, s.t + ' sheet') } });
    }
    const json = enc.encode(JSON.stringify(header));
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, json.length, true);
    return new Blob([enc.encode(MAGIC), len, json, ...parts], { type: 'application/octet-stream' });
  }

  /* read without loading the whole file into memory: big exports stay light on a phone */
  async function readHeader(file) {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (head.length < 12 || new TextDecoder().decode(head.subarray(0, 8)) !== MAGIC) throw new Error('That isn’t a Fret & Key song file.');
    const n = new DataView(head.buffer).getUint32(8, true);
    if (12 + n > file.size) throw new Error('That song file is incomplete — export it again.');
    let header;
    try { header = JSON.parse(await file.slice(12, 12 + n).text()); } catch (e) { throw new Error('That song file is damaged — export it again.'); }
    if (!header || header.app !== 'fret-and-key' || !Array.isArray(header.songs)) throw new Error('That isn’t a Fret & Key song file.');
    if (header.format > 1) throw new Error('That file comes from a newer Fret & Key — update this app first.');
    return { header, base: 12 + n };
  }

  const sameSong = (a, b) => a.t === b.t && a.a === b.a && Math.abs((a.duration || 0) - (b.duration || 0)) < 1.5;

  async function importFile(file) {
    const { header, base } = await readHeader(file);
    const piece = (f) => {
      if (!f) return null;
      if (base + f.offset + f.length > file.size) throw new Error('That song file is incomplete — export it again.');
      return new File([file.slice(base + f.offset, base + f.offset + f.length)], f.name || 'track', { type: f.type || '' });
    };
    let added = 0, updated = 0;
    const done = [];
    // oldest first, so the list ends up in the same order as on the other device
    for (const item of header.songs.slice().reverse()) {
      const song = item.song;
      if (!song || !song.id || !Array.isArray(song.sections)) continue;
      const audio = piece(item.files && item.files.audio);
      const sheet = piece(item.files && item.files.sheet);
      // the same song transcribed separately here (e.g. on the phone) is replaced by the imported version
      const existing = FK.mySongs.list().find((x) => x.id === song.id || sameSong(x, song));
      if (existing) { if (existing.id !== song.id) FK.mySongs.remove(existing.id); updated++; } else added++;
      if (audio) await FK.audioStore.put(song.id, audio);
      if (sheet) await FK.audioStore.put(song.id + ':sheet', sheet);
      song.hasAudio = !!audio && song.hasAudio !== false;
      FK.mySongs.save(song);
      if (!FK.mySongs.list().some((x) => x.id === song.id)) throw new Error('This device’s storage is full — delete a few songs and try again.');
      done.push(song);
    }
    if (!done.length) throw new Error('No songs were found in that file.');
    return { added, updated, songs: done.reverse() };
  }

  const fileName = (songs) => {
    const base = songs.length === 1 ? songs[0].t : `Fret and Key songs (${songs.length})`;
    return base.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) + '.fretkey';
  };

  /* hand the file to the user: desktop app → Save dialog; phone → share sheet (Save to Files, AirDrop…); else download */
  async function save(blob, name) {
    if (FK.platform.desktop && window.pywebview) {
      const r = await fetch('/api/save-file?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || 'Could not save the file.');
      return j.saved ? { saved: j.saved } : { cancelled: true };
    }
    const file = new File([blob], name, { type: 'application/octet-stream' });
    if (FK.platform.mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return { shared: true }; }
      catch (e) { if (e.name === 'AbortError') return { cancelled: true }; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return { downloaded: true };
  }

  FK.transfer = {
    isSongFile: (f) => /\.fretkey$/i.test(f.name || ''),
    exportSongs, importFile, save, fileName,
  };
})();
