// VLC Redesign (unofficial VLC-style media player) – Electron main process
const { app, BrowserWindow, ipcMain, dialog, shell, net, screen, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { fileURLToPath } = require('url');

const unpacked = p => p && p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
// Bundled ffmpeg where available; otherwise (e.g. *BSD, or a distro build) the system's ffmpeg on PATH.
// Media info is read with `ffmpeg -i` as well, so no separate ffprobe binary is shipped (smaller download).
const bundled = (load) => { try { const p = unpacked(load()); return p && fs.existsSync(p) ? p : null; } catch { return null; } };
const FFMPEG = process.env.VLCX_FFMPEG || bundled(() => require('ffmpeg-static')) || 'ffmpeg';
const REPO = 'stanotermans/vlcmediaplayerv2';

// Programmer files that share an extension with media (.ts = MPEG-TS video, but also TypeScript): never media.
const NOT_MEDIA = /\.d\.[cm]?ts$|[\\/]node_modules[\\/]|\.(spec|test|config|module|service|component|types?)\.ts$/i;
const PLAYLIST_EXT = /\.(m3u8?|xspf|pls)$/i;
// Extensions picked up when scanning folders. Files you open or drop yourself are always tried, whatever the
// extension: ffmpeg decides (#35). Old game/cutscene formats (TGV, Bink, Smacker, RoQ, VQA …) are included.
const MEDIA_EXT = /\.(mp4|m4v|mkv|webm|mov|qt|avi|wmv|asf|flv|f4v|mpg|mpeg|m2v|m2p|ts|m2ts|mts|tod|mod|3gp|3g2|ogv|ogm|vob|divx|xvid|mxf|nut|rm|rmvb|dv|amv|y4m|ivf|evo|wtv|tgv|bik|bk2|smk|roq|vqa|thp|mve|xmv|iso|mp3|mp2|mpa|m4a|m4b|aac|flac|wav|w64|ogg|oga|opus|spx|wma|ac3|dts|mka|ape|aiff?|wv|tta|mpc|tak|shn|amr|au|snd|caf|dsf|dff|ra|voc)$/i;
// DVDs: an .iso image or a VIDEO_TS folder (represented by its VIDEO_TS.IFO). Played with ffmpeg's dvdvideo demuxer
// (libdvdread/libdvdnav, no decryption: copy-protected retail DVDs do not play).
const DVD_RE = /(\.iso|[\\/]VIDEO_TS\.IFO)$/i;
const dvdInput = src => /\.iso$/i.test(src) ? src : path.dirname(src);   // the .iso file or the VIDEO_TS folder
const DVD_TITLE = new Map();                                       // src → main title (the longest one)
async function dvdTitle(src) {
  if (DVD_TITLE.has(src)) return DVD_TITLE.get(src);
  let best = 1, bestDur = -1;
  for (let t = 1; t <= 60; t++) {                                  // titles are numbered 1…n; stop at the first missing one
    const txt = await runErr(FFMPEG, ['-hide_banner', '-nostdin', '-f', 'dvdvideo', '-title', String(t), '-i', dvdInput(src)], 15000);
    if (!/Input #0/.test(txt)) break;
    const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(txt), d = m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
    if (d > bestDur) { best = t; bestDur = d; }
  }
  DVD_TITLE.set(src, best); return best;
}
// ffmpeg input arguments for a source, with optional input seek (works the same for DVDs and normal files)
function inArgs(src, ss) {
  const seek = ss ? ['-ss', String(ss)] : [];
  return DVD_RE.test(src) ? ['-f', 'dvdvideo', '-title', String(DVD_TITLE.get(src) || 1), ...seek, '-i', dvdInput(src)] : [...seek, '-i', src];
}
const SUB_EXT = /\.(srt|vtt|ass|ssa|sub|lrc)$/i;
const MIME = { mp4:'video/mp4', m4v:'video/mp4', mov:'video/mp4', webm:'video/webm', mkv:'video/webm', ogv:'video/ogg',
  mp3:'audio/mpeg', m4a:'audio/mp4', aac:'audio/aac', flac:'audio/flac', wav:'audio/wav', ogg:'audio/ogg', oga:'audio/ogg', opus:'audio/ogg' };

let win = null;
// The few strings the main process shows itself (file-dialog filters, default track names), per UI language.
let LANG = 'en';
const MT = {
  'All files': { nl: 'Alle bestanden', de: 'Alle Dateien', fr: 'Tous les fichiers', es: 'Todos los archivos', it: 'Tutti i file', pt: 'Todos os ficheiros' },
  'Subtitles': { nl: 'Ondertitels', de: 'Untertitel', fr: 'Sous-titres', es: 'Subtítulos', it: 'Sottotitoli', pt: 'Legendas' },
  'Track': { nl: 'Spoor', de: 'Spur', fr: 'Piste', es: 'Pista', it: 'Traccia', pt: 'Faixa' },
  'Subtitle': { nl: 'Ondertitel', de: 'Untertitel', fr: 'Sous-titre', es: 'Subtítulo', it: 'Sottotitolo', pt: 'Legenda' },
  'Open media': { nl: 'Media openen', de: 'Medien öffnen', fr: 'Ouvrir des médias', es: 'Abrir multimedia', it: 'Apri file multimediali', pt: 'Abrir multimédia' },
  'Add media folder': { nl: 'Mediamap toevoegen', de: 'Medienordner hinzufügen', fr: 'Ajouter un dossier de médias', es: 'Añadir carpeta multimedia', it: 'Aggiungi cartella multimediale', pt: 'Adicionar pasta multimédia' },
  'Open subtitle file': { nl: 'Ondertitelbestand openen', de: 'Untertiteldatei öffnen', fr: 'Ouvrir un fichier de sous-titres', es: 'Abrir archivo de subtítulos', it: 'Apri file di sottotitoli', pt: 'Abrir ficheiro de legendas' },
  'Add fonts': { nl: 'Lettertypen toevoegen', de: 'Schriftarten hinzufügen', fr: 'Ajouter des polices', es: 'Añadir fuentes', it: 'Aggiungi caratteri', pt: 'Adicionar tipos de letra' },
  'Save log': { nl: 'Logboek opslaan', de: 'Protokoll speichern', fr: 'Enregistrer le journal', es: 'Guardar registro', it: 'Salva registro', pt: 'Guardar registo' },
  'Select folder': { nl: 'Map kiezen', de: 'Ordner auswählen', fr: 'Choisir le dossier', es: 'Seleccionar carpeta', it: 'Seleziona cartella', pt: 'Selecionar pasta' },
  'Open': { nl: 'Openen', de: 'Öffnen', fr: 'Ouvrir', es: 'Abrir', it: 'Apri', pt: 'Abrir' },
  'Save': { nl: 'Opslaan', de: 'Speichern', fr: 'Enregistrer', es: 'Guardar', it: 'Salva', pt: 'Guardar' },
  'Media': { nl: 'Media', de: 'Medien', fr: 'Médias', es: 'Multimedia', it: 'File multimediali', pt: 'Multimédia' },
  'Import playlist': { nl: 'Afspeellijst importeren', de: 'Wiedergabeliste importieren', fr: 'Importer une playlist', es: 'Importar lista de reproducción', it: 'Importa playlist', pt: 'Importar lista de reprodução' },
  'Playlists': { nl: 'Afspeellijsten', de: 'Wiedergabelisten', fr: 'Playlists', es: 'Listas de reproducción', it: 'Playlist', pt: 'Listas de reprodução' },
  'Fonts': { nl: 'Lettertypen', de: 'Schriftarten', fr: 'Polices', es: 'Fuentes', it: 'Caratteri', pt: 'Tipos de letra' },
};
const mt = k => (MT[k] && MT[k][LANG]) || k;
let pendingPaths = [];
const TOKEN = crypto.randomBytes(16).toString('hex');
let PORT = 0;

/* ---------------- single instance + "open with" ---------------- */
const argPaths = argv => argv.slice(app.isPackaged ? 1 : 2).filter(a => !a.startsWith('-') && fs.existsSync(a)).map(a => path.resolve(a));
// Separate profile for development/testing (keeps your real library and settings untouched).
if (process.env.VLCX_USER_DATA) app.setPath('userData', process.env.VLCX_USER_DATA);
else {
  // keep using the settings/library folder of versions released as "VLC Media Player"
  const legacy = path.join(app.getPath('appData'), 'VLC Media Player');
  // Fixed folder name: the Linux packages use the internal name "vlc-redesign" (no space in /opt), which would
  // otherwise move the settings to ~/.config/vlc-redesign.
  app.setPath('userData', fs.existsSync(legacy) ? legacy : path.join(app.getPath('appData'), 'VLC Redesign'));
}
// Start in the language chosen in the app (saved by 'set-lang'), so built-in browser texts and, on Linux,
// the GTK file dialogs follow it instead of the system language. Windows' own file dialogs always use the
// Windows display language; there only the title and the confirm button can be set (see the dialogs below).
const BOOT_PREFS = (() => { try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window.json'), 'utf8')) || {}; } catch { return {}; } })();
const BOOT_LANG = BOOT_PREFS.lang || '';
// Hardware acceleration can be switched off (Settings → Performance), and is switched off automatically on Linux when
// the GPU can't draw the window (e.g. a VM without 3D: the first frame never arrives or the GPU process crashes).
const HW_ACCEL = BOOT_PREFS.hwAccel !== false;
if (!HW_ACCEL) app.disableHardwareAcceleration();
if (/^(en|nl|de|fr|es|it|pt)$/.test(BOOT_LANG)) {
  LANG = BOOT_LANG;
  app.commandLine.appendSwitch('lang', { en: 'en-US', pt: 'pt-PT' }[BOOT_LANG] || BOOT_LANG);
  if (process.platform === 'linux') process.env.LANGUAGE = BOOT_LANG;
}
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', (_e, argv) => {
  const p = argPaths(argv);
  if (win) { if (win.isMinimized()) win.restore(); if (!win.isVisible()) win.show(); win.focus(); if (p.length) win.webContents.send('open-paths', expand(p)); }
});

/* ---------------- local media server (127.0.0.1 + token) ---------------- */
const active = new Set();
function startServer() {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      resp.setHeader('Access-Control-Allow-Origin', '*');
      if (u.searchParams.get('t') !== TOKEN) { resp.writeHead(403); return resp.end(); }
      const src = u.searchParams.get('src');
      if (u.pathname === '/file') return serveFile(src, req, resp);
      if (u.pathname === '/stream') return serveStream(src, u.searchParams, req, resp);
      resp.writeHead(404); resp.end();
    });
    srv.listen(0, '127.0.0.1', () => { PORT = srv.address().port; res(); });
  });
}

function serveFile(file, req, resp) {
  let st; try { st = fs.statSync(file); } catch { resp.writeHead(404); return resp.end(); }
  const ext = path.extname(file).slice(1).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : st.size - 1;
    if (start >= st.size) { resp.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return resp.end(); }
    end = Math.min(end, st.size - 1);
    resp.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}` });
    fs.createReadStream(file, { start, end }).pipe(resp);
  } else {
    resp.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
    fs.createReadStream(file).pipe(resp);
  }
}

// Live transcode to fragmented MP4 (H.264/AAC) for formats Chromium can't play.
function serveStream(src, q, req, resp) {
  const ss = Math.max(0, +q.get('ss') || 0);
  const a = Math.max(0, +q.get('a') || 0);
  const vcopy = q.get('vcopy') === '1';
  const QUALITY = { fast: ['ultrafast', '24'], balanced: ['veryfast', '21'], quality: ['faster', '19'] };
  const [preset, crf] = QUALITY[q.get('q')] || QUALITY.balanced;
  const maxw = Math.max(640, Math.min(3840, +q.get('maxw') || 1920));
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  if (/^https?:/i.test(src)) args.push('-reconnect', '1', '-reconnect_streamed', '1');
  // a second input whose audio replaces the main audio (VLC's "play another media synchronously")
  const extra = q.get('extra'), useExtra = !!extra && (/^https?:/i.test(extra) || fs.existsSync(extra));
  args.push(...inArgs(src, ss));
  if (useExtra) { if (ss) args.push('-ss', String(ss)); args.push('-i', extra); }
  args.push('-map', '0:V:0?', '-map', useExtra ? '1:a:0?' : `0:a:${a}?`);
  if (vcopy) args.push('-c:v', 'copy');
  else args.push('-c:v', 'libx264', '-preset', preset, '-tune', 'zerolatency', '-crf', crf, '-g', '48', '-pix_fmt', 'yuv420p',
    '-vf', `scale=w='min(${maxw},iw)':h=-2`);
  args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-sn', '-dn',
    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
  const ff = spawn(FFMPEG, args, { windowsHide: true });
  active.add(ff);
  resp.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' });
  ff.stdout.pipe(resp);
  ff.stderr.on('data', d => log('error', '[ffmpeg] ' + String(d).trim()));
  log('info', `stream ${src} ss=${ss} a=${a} vcopy=${vcopy}`);
  const kill = () => { try { ff.kill('SIGKILL'); } catch {} active.delete(ff); };
  req.on('close', kill); ff.on('exit', () => { active.delete(ff); resp.end(); });
}

/* ---------------- optional log file (Settings → General → Diagnostics) ---------------- */
const LOG = { on: false, file: '', level: 'error' };
function log(level, msg) {
  if (level === 'error') console.error(msg);
  if (!LOG.on || !LOG.file || (LOG.level === 'error' && level !== 'error')) return;
  try { fs.appendFileSync(LOG.file, `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}\n`); } catch {}
}

/* ---------------- helpers ---------------- */
function run(bin, args, { maxBuffer = 64 * 1024 * 1024, encoding = 'utf8', timeout = 30000 } = {}) {
  return new Promise(res => execFile(bin, args, { maxBuffer, encoding, timeout, windowsHide: true }, (err, out) => res(err ? null : out)));
}

function expand(paths, depth = 0) {
  const out = [];
  for (const p of paths) {
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      const ifo = ['VIDEO_TS.IFO', 'video_ts.ifo'].map(f => /^video_ts$/i.test(path.basename(p)) ? path.join(p, f) : path.join(p, 'VIDEO_TS', f)).find(f => fs.existsSync(f));
      if (ifo) { out.push(ifo); continue; }                         // a DVD folder: one item instead of loose VOB files
    }
    if (st.isDirectory() && depth < 6) {
      let entries = []; try { entries = fs.readdirSync(p); } catch {}
      out.push(...expand(entries.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(e => path.join(p, e)), depth + 1));
    } else if (st.isFile() && !NOT_MEDIA.test(p) && (MEDIA_EXT.test(p) || depth === 0)) out.push(p);   // depth 0 = opened/dropped by you
  }
  return out;
}

// ffmpeg writes its diagnostics to stderr (and exits non-zero without an output file); we only need that text.
function runErr(bin, args, timeout = 20000) {
  return new Promise(res => execFile(bin, args, { maxBuffer: 16 * 1024 * 1024, encoding: 'utf8', timeout, windowsHide: true }, (_err, _out, errOut) => res(String(errOut || ''))));
}
const CHANNELS = { mono: 1, stereo: 2, '2.1': 3, '3.0': 3, quad: 4, '4.0': 4, '4.1': 5, '5.0': 5, '5.1': 6, '6.0': 6, '6.1': 7, '7.0': 7, '7.1': 8 };
// Media info parsed from `ffmpeg -i` (same shape the renderer used to get from ffprobe)
async function probe(src) {
  if (DVD_RE.test(src)) await dvdTitle(src);
  const txt = await runErr(FFMPEG, ['-hide_banner', '-nostdin', ...inArgs(src)]);
  const head = /Input #0, (.+?), from /.exec(txt);
  if (!head) return null;
  const dm = /Duration: (\d+):(\d+):([\d.]+)/.exec(txt);
  const streams = [], tags = {}; let cur = null, inStreams = false;
  for (const line of txt.split(/\r?\n/)) {
    const tg = !inStreams && /^\s{4}(album|artist|album_artist)\s*:\s*(.+)$/i.exec(line);
    if (tg && !tags[tg[1].toLowerCase()]) tags[tg[1].toLowerCase()] = tg[2].trim();
    if (/^\s*Stream #/.test(line)) inStreams = true;
    const m = /^\s*Stream #0:\d+(?:\[[^\]]*\])?(?:\(([^)]*)\))?: (Video|Audio|Subtitle|Data|Attachment): ([^\s,]+)(.*)$/.exec(line);
    if (m) { cur = { type: m[2].toLowerCase(), lang: m[1] && m[1] !== 'und' ? m[1] : undefined, codec: m[3].toLowerCase(), rest: m[4], title: '' }; streams.push(cur); continue; }
    if (/^\s*(Chapter|Input|Output) #/.test(line)) { cur = null; continue; }
    const t = cur && /^\s+title\s*:\s*(.+)$/.exec(line);
    if (t && !cur.title) cur.title = t[1].trim();
  }
  const isCover = s => /attached pic/.test(s.rest);
  const v = streams.find(s => s.type === 'video' && !isCover(s));
  const size = v && /(\d{2,5})x(\d{2,5})/.exec(v.rest);
  const pix = v && /,\s*([a-z][a-z0-9_]*)(?=[(,\s]|$)/.exec(v.rest);
  const channels = rest => { const c = /Hz, ([^,]+)/.exec(rest); if (!c) return undefined; const k = c[1].replace(/\(.*\)/, '').trim(); return CHANNELS[k] || parseInt(k) || undefined; };
  const label = s => s.title || s.lang || '';
  const aud = streams.filter(s => s.type === 'audio'), sub = streams.filter(s => s.type === 'subtitle');
  return {
    duration: dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]) : 0,
    format: head[1],
    vcodec: v ? v.codec : null, pix: pix ? pix[1] : null, width: size ? +size[1] : 0, height: size ? +size[2] : 0,
    audio: aud.map((s, i) => ({ i, codec: s.codec, label: label(s) || `${mt('Track')} ${i + 1}`, lang: s.lang, ch: channels(s.rest) })),
    subs: sub.map((s, i) => ({ i, codec: s.codec, label: label(s) || `${mt('Subtitle')} ${i + 1}`, lang: s.lang })),
    cover: streams.some(s => s.type === 'video' && isCover(s)),
    album: tags.album || '', artist: tags.artist || tags.album_artist || '',
  };
}

// Last video keyframe at or before `ss` – stream copy can only start on a keyframe.
// Decodes only keyframes (-skip_frame nokey) in the 20 s before `ss` and reads their timestamps from showinfo.
async function keyframe(src, ss) {
  const start = Math.max(0, ss - 20);
  const txt = await runErr(FFMPEG, ['-hide_banner', '-nostdin', '-skip_frame', 'nokey', '-t', String(ss - start + 0.1), '-copyts', ...inArgs(src, start),
    '-map', '0:v:0', '-vf', 'showinfo', '-an', '-sn', '-f', 'null', '-'], 15000);
  const times = [...txt.matchAll(/pts_time:\s*([\d.]+)/g)].map(m => parseFloat(m[1])).filter(t => isFinite(t) && t <= ss + 0.05);
  return times.length ? Math.max(...times) : null;
}

const thumbDir =() => { const d = path.join(app.getPath('userData'), 'thumbs'); fs.mkdirSync(d, { recursive: true }); return d; };
async function thumbnail(src, at) {
  let key = src; try { key += fs.statSync(src).mtimeMs; } catch {}
  const file = path.join(thumbDir(), crypto.createHash('md5').update(key).digest('hex') + '.jpg');
  if (fs.existsSync(file)) return 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64');
  const buf = await frameJpeg(src, at, 320, 5);
  if (!buf) return null;
  try { fs.writeFileSync(file, buf); } catch {}
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}
// One JPEG frame. at <= 0 means the cover art of a music file: seeking (-ss) there drops the
// attached picture in e.g. MP3, so read the first video stream from the start instead.
async function frameJpeg(src, at, w, q) {
  const input = at > 0 ? inArgs(src, at) : [...inArgs(src), '-map', '0:v:0'];
  const buf = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...input, '-frames:v', '1',
    '-vf', `scale='min(${w},iw)':-2`, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', String(q), 'pipe:1'], { encoding: 'buffer', timeout: 20000 });
  return buf && buf.length ? buf : null;
}
// Larger cover art for the music player; kept in memory only, so it works with thumbnails turned off.
async function coverArt(src) { const buf = await frameJpeg(src, 0, 800, 3); return buf ? 'data:image/jpeg;base64,' + buf.toString('base64') : null; }
// Playlist files: .m3u/.m3u8 (one entry per line), .pls (FileN=…) and .xspf (<location>…</location>).
// Relative entries are resolved against the playlist's folder; missing local files are skipped.
// A .m3u8 that is really an HLS stream (#EXT-X-… tags) is reported as { hls: true } and played as media.
function readPlaylist(file) {
  let text; try { if (fs.statSync(file).size > 5 << 20) return null; text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); } catch { return null; }
  const dir = path.dirname(file), ext = path.extname(file).toLowerCase();
  if (/^\.m3u8?$/.test(ext) && /#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/.test(text)) return { hls: true };
  const xml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  let entries = [], name = '';
  if (ext === '.xspf') {
    name = xml((/<playlist[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<trackList/i.exec(text) || [])[1] || '').trim();
    entries = [...text.matchAll(/<location>([\s\S]*?)<\/location>/gi)].map(m => xml(m[1]).trim());
  } else if (ext === '.pls') {
    entries = [...text.matchAll(/^\s*File\d+\s*=\s*(.+?)\s*$/gim)].map(m => m[1]);
  } else {
    const pl = /^#PLAYLIST:\s*(.+)$/m.exec(text); if (pl) name = pl[1].trim();
    entries = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  }
  const srcs = [];
  for (const e of entries) {
    let p = e;
    if (/^file:/i.test(p)) { try { p = fileURLToPath(p); } catch { continue; } }
    else if (/^[a-z][a-z0-9+.-]+:\/\//i.test(p)) { srcs.push(p); continue; }
    else p = path.resolve(dir, p.replace(/[\\/]/g, path.sep));   // also normalises absolute paths with mixed slashes
    if (fs.existsSync(p)) srcs.push(...expand([p]).filter(f => MEDIA_EXT.test(f)));
  }
  return { name: name || path.parse(file).name, srcs: [...new Set(srcs)], missing: entries.length - srcs.length };
}
// Lyrics (.lrc) as text; only .lrc files, at most 1 MB.
function readLyrics(file) {
  try { if (!/\.lrc$/i.test(file) || fs.statSync(file).size > 1 << 20) return null; return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); } catch { return null; }
}

// Any text subtitle (srt/ass/vtt or an embedded stream) → WebVTT text
async function subtitles(src, streamIndex) {
  const args = ['-hide_banner', '-loglevel', 'error', ...inArgs(src)];
  if (streamIndex != null) args.push('-map', `0:s:${streamIndex}`);
  args.push('-f', 'webvtt', 'pipe:1');
  if (/\.vtt$/i.test(src) && streamIndex == null) { try { return fs.readFileSync(src, 'utf8'); } catch {} }
  return run(FFMPEG, args, { timeout: 60000 });
}

function siblingSubs(file) {
  try {
    const dir = path.dirname(file), base = path.parse(file).name.toLowerCase();
    return fs.readdirSync(dir).filter(f => SUB_EXT.test(f) && f.toLowerCase().startsWith(base)).map(f => path.join(dir, f));
  } catch { return []; }
}

/* ---------------- IPC ---------------- */
ipcMain.handle('info', () => ({ port: PORT, token: TOKEN }));
ipcMain.handle('open-files', async () => {
  const r = await dialog.showOpenDialog(win, { title: mt('Open media'), buttonLabel: mt('Open'), properties: ['openFile', 'multiSelections'], filters: [
    { name: mt('Media'), extensions: ['iso', 'ifo', 'tgv', 'bik', 'bk2', 'smk', 'roq', 'vqa', 'mxf', 'rm', 'rmvb', 'asf', 'f4v', 'ogm', 'm2v', 'nut', 'dv', 'amv', 'wv', 'tta', 'mpc', 'amr', 'caf', 'dsf', 'mp2', 'm3u', 'm3u8', 'xspf', 'pls', 'mp4','m4v','mkv','webm','mov','avi','wmv','flv','mpg','mpeg','ts','m2ts','mts','3gp','ogv','vob','mp3','m4a','aac','flac','wav','ogg','opus','wma','ac3','mka'] },
    { name: mt('All files'), extensions: ['*'] }] });
  return r.canceled ? [] : expand(r.filePaths);
});
ipcMain.handle('open-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: mt('Add media folder'), buttonLabel: mt('Select folder'), properties: ['openDirectory'] });
  return r.canceled ? [] : expand(r.filePaths);
});
// Starts in the folder of the playing file (subtitles usually sit next to the video); otherwise the system default.
ipcMain.handle('open-subtitle', async (_e, src) => {
  const dir = typeof src === 'string' && !/^[a-z][a-z0-9+.-]+:\/\//i.test(src) ? path.resolve(path.dirname(src)) : null;
  const defaultPath = dir && fs.existsSync(dir) ? dir : undefined;
  const r = await dialog.showOpenDialog(win, { title: mt('Open subtitle file'), buttonLabel: mt('Open'), defaultPath, properties: ['openFile'], filters: [{ name: mt('Subtitles'), extensions: ['srt', 'vtt', 'ass', 'ssa', 'lrc'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('expand', (_e, paths) => expand(paths));
ipcMain.handle('exists', (_e, paths) => paths.filter(p => /^https?:/i.test(p) || fs.existsSync(p)));
ipcMain.handle('probe', (_e, src) => probe(src));
ipcMain.handle('keyframe', (_e, src, ss) => keyframe(src, ss));
// One video frame at time `at` for the timeline hover preview (formats the hidden <video> can't decode).
ipcMain.handle('frame', async (_e, src, at, w) => {
  const buf = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...inArgs(src, Math.max(0, at)), '-frames:v', '1',
    '-vf', `scale=${Math.round(w) || 320}:-2`, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '6', 'pipe:1'], { encoding: 'buffer', timeout: 8000 });
  return buf && buf.length ? 'data:image/jpeg;base64,' + buf.toString('base64') : null;
});
ipcMain.handle('thumb',(_e, src, at) => thumbnail(src, at));
ipcMain.handle('subs', (_e, src, idx) => subtitles(src, idx));
ipcMain.handle('read-playlist', (_e, file) => readPlaylist(file));
/* ---------------- online subtitles (OpenSubtitles.com REST API) ---------------- */
// The app's API key is written to keys.json by the release workflow from a GitHub secret (never committed);
// for development it can come from the OPENSUBTITLES_API_KEY environment variable.
const OS_KEY = (() => { if (process.env.OPENSUBTITLES_API_KEY) return process.env.OPENSUBTITLES_API_KEY.trim(); try { return (require('./keys.json').opensubtitles || '').trim(); } catch { return ''; } })();
const OS = { base: 'https://api.opensubtitles.com/api/v1', token: '', user: null };
const osFile = () => path.join(app.getPath('userData'), 'opensubtitles.json');
// Only the session token is kept (never the password), encrypted with the OS keychain when available.
function osLoad() {
  try {
    const j = JSON.parse(fs.readFileSync(osFile(), 'utf8'));
    const tok = j.enc && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(j.enc, 'base64')) : j.token;
    Object.assign(OS, { token: tok || '', user: j.user || null, base: j.base || OS.base });
  } catch {}
}
function osSave() {
  const j = { user: OS.user, base: OS.base };
  if (OS.token) { if (safeStorage.isEncryptionAvailable()) j.enc = safeStorage.encryptString(OS.token).toString('base64'); else j.token = OS.token; }
  try { fs.writeFileSync(osFile(), JSON.stringify(j)); } catch {}
}
async function osApi(method, route, body) {
  if (!OS_KEY) throw new Error('nokey');
  const headers = { 'Api-Key': OS_KEY, 'User-Agent': `VLC Redesign v${app.getVersion()}`, Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (OS.token && route !== '/login') headers.Authorization = 'Bearer ' + OS.token;
  const r = await net.fetch(OS.base + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) { const e = new Error((j && (j.message || j.errors && j.errors.join(', '))) || 'HTTP ' + r.status); e.status = r.status; e.data = j; throw e; }
  return j;
}
// OpenSubtitles file hash: size + 64-bit sums of the first and last 64 KB (finds subtitles synced to this exact file).
function osHash(file) {
  try {
    const size = fs.statSync(file).size, chunk = 65536; if (size < chunk) return null;
    const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(chunk * 2);
    fs.readSync(fd, buf, 0, chunk, 0); fs.readSync(fd, buf, chunk, chunk, size - chunk); fs.closeSync(fd);
    let h = BigInt(size); for (let i = 0; i < buf.length; i += 8) h = (h + buf.readBigUInt64LE(i)) & 0xffffffffffffffffn;
    return { hash: h.toString(16).padStart(16, '0'), size };
  } catch { return null; }
}
const osErr = e => ({ error: e.message === 'nokey' ? 'nokey' : e.status === 401 ? (/token/i.test(e.message) ? 'login' : 'auth') : e.status === 406 ? 'limit' : e.status === 429 ? 'busy' : 'network', message: e.message, reset: e.data && (e.data.reset_time_utc || e.data.reset_time) });
ipcMain.handle('os-status', () => ({ available: !!OS_KEY, user: OS.token ? OS.user : null }));
ipcMain.handle('os-search', async (_e, { query, langs, src }) => {
  try {
    const p = new URLSearchParams();
    const local = src && !/^[a-z][a-z0-9+.-]+:\/\//i.test(src) ? osHash(src) : null;
    if (local) p.set('moviehash', local.hash);
    if (query) p.set('query', String(query).slice(0, 200));
    if (langs) p.set('languages', String(langs).toLowerCase().split(/[,\s]+/).filter(Boolean).sort().join(','));
    p.set('order_by', 'download_count');
    const r = await osApi('GET', '/subtitles?' + p.toString());
    return { results: (r.data || []).filter(d => d.attributes && d.attributes.files && d.attributes.files.length).slice(0, 60).map(d => {
      const a = d.attributes, f = a.files[0];
      return { fileId: f.file_id, name: a.release || f.file_name || '', file: f.file_name || '', lang: a.language || '', downloads: a.download_count || 0,
        hi: !!a.hearing_impaired, match: !!a.moviehash_match, title: (a.feature_details && (a.feature_details.title || a.feature_details.movie_name)) || '', year: a.feature_details && a.feature_details.year };
    }) };
  } catch (e) { return osErr(e); }
});
ipcMain.handle('os-download', async (_e, { fileId, src, lang }) => {
  if (!OS.token) return { error: 'login' };                       // OpenSubtitles only allows downloads with a (free) account
  try {
    const r = await osApi('POST', '/download', { file_id: +fileId });
    if (!r || !r.link) return { error: 'network', message: r && r.message };
    const res = await net.fetch(r.link); if (!res.ok) return { error: 'network', message: 'HTTP ' + res.status };
    const data = Buffer.from(await res.arrayBuffer());
    const ext = (/\.(srt|vtt|ass|ssa|sub)$/i.exec(r.file_name || '') || [, 'srt'])[1].toLowerCase();
    const base = src && !/^[a-z][a-z0-9+.-]+:\/\//i.test(src) ? path.parse(src) : null;
    const name = `${base ? base.name : 'subtitle'}.${(lang || 'xx').toLowerCase()}.${ext}`;
    // next to the video when possible (picked up automatically next time), otherwise in the app's data folder
    const targets = [base && base.dir, path.join(app.getPath('userData'), 'subtitles')].filter(Boolean);
    for (const dir of targets) {
      try { fs.mkdirSync(dir, { recursive: true }); let out = path.join(dir, name), n = 1; while (fs.existsSync(out)) out = path.join(dir, name.replace(/(\.[^.]+)$/, `-${n++}$1`)); fs.writeFileSync(out, data); return { file: out, remaining: r.remaining, reset: r.reset_time_utc || r.reset_time }; } catch {}
    }
    return { error: 'write' };
  } catch (e) { return osErr(e); }
});
ipcMain.handle('os-login', async (_e, { username, password }) => {
  try {
    const r = await osApi('POST', '/login', { username, password });
    OS.token = r.token || ''; OS.user = r.user ? { name: r.user.username || username, allowed: r.user.allowed_downloads, vip: !!r.user.vip } : { name: username };
    if (r.base_url) OS.base = 'https://' + String(r.base_url).replace(/^https?:\/\//, '').replace(/\/+$/, '') + '/api/v1';
    osSave(); return { user: OS.user };
  } catch (e) { return osErr(e); }
});
ipcMain.handle('os-logout', async () => { try { if (OS.token) await osApi('DELETE', '/logout'); } catch {} Object.assign(OS, { token: '', user: null, base: 'https://api.opensubtitles.com/api/v1' }); try { fs.unlinkSync(osFile()); } catch {} return true; });

ipcMain.handle('open-playlist', async () => {
  const r = await dialog.showOpenDialog(win, { title: mt('Import playlist'), buttonLabel: mt('Open'), properties: ['openFile', 'multiSelections'], filters: [{ name: mt('Playlists'), extensions: ['m3u', 'm3u8', 'xspf', 'pls'] }] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('cover', (_e, src) => coverArt(src));
ipcMain.handle('lyrics', (_e, file) => readLyrics(file));
ipcMain.handle('sibling-subs', (_e, file) => siblingSubs(file));
ipcMain.handle('snapshot', (_e, dataUrl, name, dir) => {
  dir = dir || path.join(app.getPath('pictures'), 'VLC Redesign');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return file;
});
ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('open-path', (_e, p) => { fs.mkdirSync(p, { recursive: true }); return shell.openPath(p); });
ipcMain.handle('paths', () => ({
  videos: app.getPath('videos'), music: app.getPath('music'), pictures: app.getPath('pictures'),
  recordings: path.join(app.getPath('videos'), 'VLC Redesign'), snapshots: path.join(app.getPath('pictures'), 'VLC Redesign'),
  log: path.join(app.getPath('userData'), 'vlc-log.txt'),
}));
ipcMain.handle('choose-folder', async (_e, title) => {
  const r = await dialog.showOpenDialog(win, { title, buttonLabel: mt('Select folder'), properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('choose-file', async (_e, title, exts) => {
  const r = await dialog.showOpenDialog(win, { title, buttonLabel: mt('Open'), properties: ['openFile'], filters: exts ? [{ name: title, extensions: exts }] : [] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('save-log-as', async () => {
  const r = await dialog.showSaveDialog(win, { title: mt('Save log'), buttonLabel: mt('Save'), defaultPath: 'vlc-log.txt', filters: [{ name: 'Log', extensions: ['txt', 'log'] }] });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('set-log', (_e, cfg) => { Object.assign(LOG, cfg); log('info', 'logging ' + (LOG.on ? 'enabled' : 'disabled')); });
ipcMain.handle('devtools', (_e, on) => { if (!win) return; on ? win.webContents.openDevTools({ mode: 'detach' }) : win.webContents.closeDevTools(); });
ipcMain.handle('clear-thumbs', () => { try { fs.rmSync(thumbDir(), { recursive: true, force: true }); } catch {} return true; });
ipcMain.handle('read-image', (_e, p) => { try { const ext = path.extname(p).slice(1).toLowerCase().replace('jpg', 'jpeg'); return `data:image/${ext};base64,` + fs.readFileSync(p).toString('base64'); } catch { return null; } });
// recordings are streamed in chunks from the renderer's MediaRecorder
const recs = new Map();
ipcMain.handle('rec-start', (_e, dir, name) => { fs.mkdirSync(dir, { recursive: true }); const file = path.join(dir, name); recs.set(file, fs.openSync(file, 'w')); return file; });
ipcMain.handle('rec-chunk', (_e, file, buf) => { const fd = recs.get(file); if (fd != null) fs.writeSync(fd, Buffer.from(buf)); });
ipcMain.handle('rec-stop', (_e, file) => { const fd = recs.get(file); if (fd != null) { fs.closeSync(fd); recs.delete(file); } return file; });
ipcMain.on('quit', () => app.quit());

/* ---------------- about + updates (GitHub releases) ---------------- */
const SAFE_HOSTS = /^(github\.com|www\.youtube\.com|youtube\.com|www\.figma\.com|stanotermans\.github\.io|ffmpeg\.org|www\.electronjs\.org|www\.videolan\.org|opensource\.org)$/;
ipcMain.handle('open-external', (_e, url) => { try { const u = new URL(url); if (u.protocol === 'https:' && SAFE_HOSTS.test(u.hostname)) shell.openExternal(u.href); } catch {} });
const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;
ipcMain.handle('app-info', () => ({
  version: app.getVersion(), platform: process.platform, arch: process.arch, portable: isPortable(), appImage: !!process.env.APPIMAGE,
  electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node,
  roundedCorners: winPrefs().roundedCorners === true, hwAccel: HW_ACCEL, hwAuto: winPrefs().hwAuto || '', drawsRoundedCorners: ROUNDED && process.platform === 'linux',
}));
const cmpVer = (a, b) => { const x = String(a).replace(/^v/, '').split('.').map(n => parseInt(n) || 0), y = String(b).replace(/^v/, '').split('.').map(n => parseInt(n) || 0);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; };
function pickAsset(assets) {
  const find = re => (assets || []).find(a => re.test(a.name));
  if (process.platform === 'win32') return isPortable() ? { asset: find(/Portable-.*\.exe$/), mode: 'download' } : { asset: find(/Setup-.*x64\.exe$/), mode: 'install' };
  if (process.platform === 'darwin') return { asset: find(new RegExp(`mac-${process.arch}\\.dmg$`)), mode: 'download' };
  if (process.env.APPIMAGE) return { asset: find(/\.AppImage$/), mode: 'install' };
  return { asset: null, mode: 'page' };                    // .deb/.rpm/.pacman installs: update with the package manager
}
ipcMain.handle('update-check', async () => {
  const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'vlc-redesign', Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('GitHub ' + r.status);
  const j = await r.json();
  const latest = String(j.tag_name || '').replace(/^v/, '');
  const { asset, mode } = pickAsset(j.assets);
  return { current: app.getVersion(), latest, newer: cmpVer(latest, app.getVersion()) > 0, url: j.html_url, published: j.published_at,
    mode: asset ? mode : 'page', asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null };
});
ipcMain.handle('update-install', async (e, info) => {
  if (!info || !info.asset) { if (info && info.url) shell.openExternal(info.url); return { done: 'page' }; }
  const u = new URL(info.asset.url);
  if (u.protocol !== 'https:' || u.hostname !== 'github.com' || !u.pathname.startsWith(`/${REPO}/releases/download/`)) throw new Error('Unexpected download URL');
  const dir = info.mode === 'install' && process.platform === 'win32' ? app.getPath('temp')
    : info.mode === 'install' && process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : app.getPath('downloads');
  const file = path.join(dir, path.basename(info.asset.name));
  const r = await net.fetch(u.href, { headers: { 'User-Agent': 'vlc-redesign' } });
  if (!r.ok || !r.body) throw new Error('Download failed (' + r.status + ')');
  const total = +r.headers.get('content-length') || info.asset.size || 0;
  const out = fs.createWriteStream(file + '.part');
  let got = 0, lastSent = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise(res => out.once('drain', res));
    if (Date.now() - lastSent > 150) { lastSent = Date.now(); e.sender.send('update-progress', { got, total }); }
  }
  await new Promise(res => out.end(res));
  fs.renameSync(file + '.part', file);
  e.sender.send('update-progress', { got: total || got, total: total || got });
  if (info.mode === 'install' && process.platform === 'win32') {
    // silent NSIS update; --force-run starts the new version when it's done
    spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 400);
    return { done: 'installing' };
  }
  if (info.mode === 'install' && process.env.APPIMAGE) {
    fs.chmodSync(file, 0o755);
    if (path.resolve(file) !== path.resolve(process.env.APPIMAGE)) { try { fs.unlinkSync(process.env.APPIMAGE); } catch {} }
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 400);
    return { done: 'installing' };
  }
  if (process.platform === 'darwin') shell.openPath(file); else shell.showItemInFolder(file);
  return { done: 'downloaded', file };
});
// The system's preferred languages (macOS/Windows/Linux settings), independent of the languages bundled in the app.
ipcMain.on('system-languages', e => { try { e.returnValue = app.getPreferredSystemLanguages(); } catch { e.returnValue = []; } });
ipcMain.on('set-lang', (_e, l) => {
  LANG = String(l || 'en');
  const p = winPrefs(); if (p.lang !== LANG) { p.lang = LANG; try { fs.writeFileSync(winPrefsFile(), JSON.stringify(p)); } catch {} }
});
ipcMain.on('win', (_e, act) => {
  if (!win) return;
  if (act === 'min') win.minimize();
  else if (act === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (act === 'close') win.close();
});
// Resize the window so the video area matches the video's aspect ratio (VLC-style).
// chromeW/chromeH = window size minus the video area. Small videos are scaled up to 720 px wide;
// the window is never larger than 70% of the screen it is on.
// Window geometry in screen DIPs (also shown in Settings → ⓘ About on Linux, to diagnose tiling detection).
function winGeometry() {
  const b = win.getBounds(), d = screen.getDisplayMatching(b);
  return { bounds: b, workArea: d.workArea, size: d.size, scale: d.scaleFactor, maximized: win.isMaximized(), fullscreen: win.isFullScreen(),
    session: process.env.XDG_SESSION_TYPE || '', desktop: process.env.XDG_CURRENT_DESKTOP || '', ozone: app.commandLine.getSwitchValue('ozone-platform') || '' };
}
ipcMain.handle('win-geometry', () => (win ? winGeometry() : null));
ipcMain.handle('fit-window', (_e, { chromeW, chromeH, vw, vh }) => {
  if (!win || win.isMaximized() || win.isFullScreen() || !(vw > 0 && vh > 0)) return false;
  const b = win.getBounds(), wa = screen.getDisplayMatching(b).workArea;
  const [minW, minH] = win.getMinimumSize();
  const s = Math.min((wa.width * 0.7 - chromeW) / vw, (wa.height * 0.7 - chromeH) / vh, Math.max(1, 720 / vw));
  if (!(s > 0)) return false;
  const w = Math.max(minW, Math.round(chromeW + vw * s)), h = Math.max(minH, Math.round(chromeH + vh * s));
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const x = Math.round(Math.min(Math.max(cx - w / 2, wa.x), wa.x + wa.width - w));
  const y = Math.round(Math.min(Math.max(cy - h / 2, wa.y), wa.y + wa.height - h));
  win.setBounds({ x, y, width: w, height: h }, process.platform === 'darwin');
  return true;
});

/* ---------------- subtitle fonts added by the user (kept in userData/fonts) ---------------- */
const fontDir = () => { const d = path.join(app.getPath('userData'), 'fonts'); fs.mkdirSync(d, { recursive: true }); return d; };
const inFontDir = f => { const d = fontDir(), p = path.resolve(d, path.basename(String(f || ''))); return p.startsWith(d + path.sep) ? p : null; };
ipcMain.handle('add-fonts', async () => {
  const r = await dialog.showOpenDialog(win, { title: mt('Add fonts'), buttonLabel: mt('Open'), properties: ['openFile', 'multiSelections'], filters: [{ name: mt('Fonts'), extensions: ['ttf', 'otf', 'woff', 'woff2'] }] });
  if (r.canceled) return [];
  return r.filePaths.map(src => {
    const name = path.parse(src).name;
    let file = path.basename(src), n = 1;
    while (fs.existsSync(path.join(fontDir(), file))) file = `${name}-${n++}${path.extname(src)}`;
    fs.copyFileSync(src, path.join(fontDir(), file));
    return { name, file };
  });
});
ipcMain.handle('read-font', (_e, file) => { const p = inFontDir(file); return p && fs.existsSync(p) ? fs.readFileSync(p) : null; });
ipcMain.handle('remove-font', (_e, file) => { const p = inFontDir(file); if (p) try { fs.unlinkSync(p); } catch {} return true; });

ipcMain.on('ready', () => { if (pendingPaths.length) { win.webContents.send('open-paths', expand(pendingPaths)); pendingPaths = []; } });

/* ---------------- window ---------------- */
// Window options that only apply when the window is created (Settings → Interface → Rounded window corners).
// macOS and Windows 11 round frameless windows themselves; on Linux the app draws a transparent window
// and rounds it in CSS, so there it needs a restart to change.
const winPrefsFile = () => path.join(app.getPath('userData'), 'window.json');
const winPrefs = () => { try { return JSON.parse(fs.readFileSync(winPrefsFile(), 'utf8')); } catch { return {}; } };
let ROUNDED = false;                                             // rounded corners are active in the running window
ipcMain.handle('set-window-pref', (_e, key, value) => {
  if (!['roundedCorners', 'hwAccel'].includes(key)) return false;
  const p = winPrefs(); p[key] = !!value; if (key === 'hwAccel') delete p.hwAuto;
  try { fs.writeFileSync(winPrefsFile(), JSON.stringify(p)); } catch {}
  if (key === 'hwAccel') return HW_ACCEL !== !!value;              // true → restart needed to apply
  return process.platform !== 'win32' && ROUNDED !== !!value;
});
function restartWithoutGpu(why) {
  const p = winPrefs(); if (p.hwAccel === false) return;
  p.hwAccel = false; p.hwAuto = why; try { fs.writeFileSync(winPrefsFile(), JSON.stringify(p)); } catch {}
  log('error', 'restarting without hardware acceleration: ' + why);
  // an AppImage must be started again from the .AppImage file, not from its temporary mount
  app.relaunch(process.env.APPIMAGE ? { execPath: process.env.APPIMAGE, args: process.argv.slice(1) } : undefined);
  app.exit(0);
}
app.on('child-process-gone', (_e, d) => {
  if (d.type === 'GPU' && process.platform === 'linux' && HW_ACCEL && !['clean-exit', 'killed'].includes(d.reason)) restartWithoutGpu('GPU process ' + d.reason);
});
function createWindow() {
  const rounded = winPrefs().roundedCorners === true;
  ROUNDED = rounded && process.platform !== 'win32';               // Windows 11 always rounds; nothing to switch
  // Remember size, position and maximized state between starts (#34); only reuse a position that is still on a screen.
  const saved = winPrefs().window || {}, sb = saved.bounds;
  const onScreen = sb && screen.getAllDisplays().some(d => { const a = d.workArea; return sb.x < a.x + a.width - 80 && sb.x + sb.width > a.x + 80 && sb.y >= a.y - 20 && sb.y < a.y + a.height - 80; });
  const place = sb && sb.width >= 360 && sb.height >= 320 ? { width: sb.width, height: sb.height, ...(onScreen ? { x: sb.x, y: sb.y } : {}) } : { width: 1280, height: 800 };
  win = new BrowserWindow({
    ...place, minWidth: 360, minHeight: 320,                       // small enough for vertical videos
    frame: false, show: false,
    ...(ROUNDED && process.platform === 'linux' ? { transparent: true, backgroundColor: '#00000000' } : { backgroundColor: '#141414' }),
    ...(process.platform === 'darwin' ? { roundedCorners: rounded } : {}),
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  let shown = false;
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => { shown = true; win.show(); });
  win.on('close', () => {                                         // normal (not maximized/fullscreen) bounds + state
    try { const p = winPrefs(); p.window = { bounds: win.getNormalBounds(), maximized: win.isMaximized() || (win.isFullScreen() && !!(p.window && p.window.maximized)) }; fs.writeFileSync(winPrefsFile(), JSON.stringify(p)); } catch {}
  });
  // No first frame after 7 s: on Linux with hardware acceleration that is the GPU (e.g. a VM without 3D) → restart
  // once without it; otherwise just show the window anyway instead of leaving an invisible app running.
  setTimeout(() => {
    if (shown || !win || win.isDestroyed()) return;
    log('error', 'window: no first frame after 7 s' + (HW_ACCEL ? ' (hardware acceleration on)' : ''));
    if (process.platform === 'linux' && HW_ACCEL) return restartWithoutGpu('no first frame');
    win.show();
  }, 7000);
  win.on('maximize', () => win.webContents.send('maximized', true));
  win.on('unmaximize', () => win.webContents.send('maximized', false));
  // Snapped/tiled windows (e.g. GNOME split screen) are not "maximized", yet should get square corners (#18).
  // X11/Windows: the window touches work-area edges. Wayland gives no window position (always 0,0) and usually no
  // work area either (it equals the full screen, top bar included), and Electron does not expose xdg_toplevel's
  // tiled state (electron#48357). So there a window counts as tiled by its size, measured here in screen DIPs
  // (independent of the page zoom): 40–60 % or the full screen width, and the full height minus at most 80 px for
  // a top bar or dock.
  let snapped = null;
  const checkSnap = () => {
    if (!win || win.isDestroyed()) return;
    const g = winGeometry(), b = g.bounds, wa = g.workArea, sz = g.size, near = (a, c, t = 3) => Math.abs(a - c) <= t;
    const top = near(b.y, wa.y), bottom = near(b.y + b.height, wa.y + wa.height), left = near(b.x, wa.x), right = near(b.x + b.width, wa.x + wa.width);
    const byEdges = (top && bottom && (left || right)) || (left && right && (top || bottom));
    const fullH = b.height >= Math.min(wa.height, sz.height) - 80 && b.height <= sz.height + 2;
    const wFrac = b.width / Math.min(wa.width, sz.width), bySize = fullH && ((wFrac >= 0.4 && wFrac <= 0.6) || wFrac >= 0.97);
    const s = !g.maximized && !g.fullscreen && (byEdges || (process.platform === 'linux' && bySize));
    if (s !== snapped) { snapped = s; win.webContents.send('snapped', s); log('info', `window ${b.width}x${b.height} at ${b.x},${b.y}; screen ${sz.width}x${sz.height}; work area ${wa.width}x${wa.height} at ${wa.x},${wa.y}; snapped=${s}`); }
  };
  win.on('resize', checkSnap); win.on('move', checkSnap); win.on('maximize', checkSnap); win.on('unmaximize', checkSnap);
  win.webContents.on('did-finish-load', () => { snapped = null; checkSnap(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}

app.whenReady().then(async () => {
  osLoad();
  pendingPaths = argPaths(process.argv);
  await startServer();
  createWindow();
});
app.on('window-all-closed', () => { for (const p of active) try { p.kill('SIGKILL'); } catch {} app.quit(); });
