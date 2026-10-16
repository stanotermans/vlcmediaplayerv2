// VLC Redesign (unofficial VLC-style media player) – Electron main process
const { app, BrowserWindow, ipcMain, dialog, shell, net, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const unpacked = p => p && p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
// Bundled ffmpeg where available; otherwise (e.g. *BSD, or a distro build) the system's ffmpeg on PATH.
// Media info is read with `ffmpeg -i` as well, so no separate ffprobe binary is shipped (smaller download).
const bundled = (load) => { try { const p = unpacked(load()); return p && fs.existsSync(p) ? p : null; } catch { return null; } };
const FFMPEG = process.env.VLCX_FFMPEG || bundled(() => require('ffmpeg-static')) || 'ffmpeg';
const REPO = 'stanotermans/vlcmediaplayerv2';

const MEDIA_EXT = /\.(mp4|m4v|mkv|webm|mov|avi|wmv|flv|mpg|mpeg|ts|m2ts|mts|3gp|ogv|vob|divx|mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|ac3|dts|mka|ape|aiff?)$/i;
const SUB_EXT = /\.(srt|vtt|ass|ssa|sub)$/i;
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
  if (fs.existsSync(legacy)) app.setPath('userData', legacy);
}
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', (_e, argv) => {
  const p = argPaths(argv);
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); if (p.length) win.webContents.send('open-paths', expand(p)); }
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
  if (ss) args.push('-ss', String(ss));
  args.push('-i', src, '-map', '0:V:0?', '-map', `0:a:${a}?`);
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
    if (st.isDirectory() && depth < 6) {
      let entries = []; try { entries = fs.readdirSync(p); } catch {}
      out.push(...expand(entries.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(e => path.join(p, e)), depth + 1));
    } else if (st.isFile() && (MEDIA_EXT.test(p) || (depth === 0 && SUB_EXT.test(p)))) out.push(p);
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
  const txt = await runErr(FFMPEG, ['-hide_banner', '-nostdin', '-i', src]);
  const head = /Input #0, (.+?), from /.exec(txt);
  if (!head) return null;
  const dm = /Duration: (\d+):(\d+):([\d.]+)/.exec(txt);
  const streams = []; let cur = null;
  for (const line of txt.split(/\r?\n/)) {
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
  };
}

// Last video keyframe at or before `ss` – stream copy can only start on a keyframe.
// Decodes only keyframes (-skip_frame nokey) in the 20 s before `ss` and reads their timestamps from showinfo.
async function keyframe(src, ss) {
  const start = Math.max(0, ss - 20);
  const txt = await runErr(FFMPEG, ['-hide_banner', '-nostdin', '-skip_frame', 'nokey', '-ss', String(start), '-t', String(ss - start + 0.1), '-copyts', '-i', src,
    '-map', '0:v:0', '-vf', 'showinfo', '-an', '-sn', '-f', 'null', '-'], 15000);
  const times = [...txt.matchAll(/pts_time:\s*([\d.]+)/g)].map(m => parseFloat(m[1])).filter(t => isFinite(t) && t <= ss + 0.05);
  return times.length ? Math.max(...times) : null;
}

const thumbDir =() => { const d = path.join(app.getPath('userData'), 'thumbs'); fs.mkdirSync(d, { recursive: true }); return d; };
async function thumbnail(src, at) {
  let key = src; try { key += fs.statSync(src).mtimeMs; } catch {}
  const file = path.join(thumbDir(), crypto.createHash('md5').update(key).digest('hex') + '.jpg');
  if (fs.existsSync(file)) return 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64');
  const buf = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-ss', String(at || 0), '-i', src, '-frames:v', '1',
    '-vf', 'scale=320:-2', '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', 'pipe:1'], { encoding: 'buffer', timeout: 20000 });
  if (!buf || !buf.length) return null;
  try { fs.writeFileSync(file, buf); } catch {}
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

// Any text subtitle (srt/ass/vtt or an embedded stream) → WebVTT text
async function subtitles(src, streamIndex) {
  const args = ['-hide_banner', '-loglevel', 'error', '-i', src];
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
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [
    { name: 'Media', extensions: ['mp4','m4v','mkv','webm','mov','avi','wmv','flv','mpg','mpeg','ts','m2ts','mts','3gp','ogv','vob','mp3','m4a','aac','flac','wav','ogg','opus','wma','ac3','mka'] },
    { name: mt('All files'), extensions: ['*'] }] });
  return r.canceled ? [] : expand(r.filePaths);
});
ipcMain.handle('open-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? [] : expand(r.filePaths);
});
ipcMain.handle('open-subtitle', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: mt('Subtitles'), extensions: ['srt', 'vtt', 'ass', 'ssa'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('expand', (_e, paths) => expand(paths));
ipcMain.handle('exists', (_e, paths) => paths.filter(p => /^https?:/i.test(p) || fs.existsSync(p)));
ipcMain.handle('probe', (_e, src) => probe(src));
ipcMain.handle('keyframe', (_e, src, ss) => keyframe(src, ss));
// One video frame at time `at` for the timeline hover preview (formats the hidden <video> can't decode).
ipcMain.handle('frame', async (_e, src, at, w) => {
  const buf = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, at)), '-i', src, '-frames:v', '1',
    '-vf', `scale=${Math.round(w) || 320}:-2`, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '6', 'pipe:1'], { encoding: 'buffer', timeout: 8000 });
  return buf && buf.length ? 'data:image/jpeg;base64,' + buf.toString('base64') : null;
});
ipcMain.handle('thumb',(_e, src, at) => thumbnail(src, at));
ipcMain.handle('subs', (_e, src, idx) => subtitles(src, idx));
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
  const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('choose-file', async (_e, title, exts) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters: exts ? [{ name: title, extensions: exts }] : [] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('save-log-as', async () => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'vlc-log.txt', filters: [{ name: 'Log', extensions: ['txt', 'log'] }] });
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
ipcMain.on('set-lang', (_e, l) => { LANG = String(l || 'en'); });
ipcMain.on('win', (_e, act) => {
  if (!win) return;
  if (act === 'min') win.minimize();
  else if (act === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (act === 'close') win.close();
});
// Resize the window so the video area matches the video's aspect ratio (VLC-style).
// chromeW/chromeH = window size minus the video area. Small videos are scaled up to 720 px wide;
// the window is never larger than 70% of the screen it is on.
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
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: mt('Fonts'), extensions: ['ttf', 'otf', 'woff', 'woff2'] }] });
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
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 420,
    frame: false, backgroundColor: '#141414', show: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => win.webContents.send('maximized', true));
  win.on('unmaximize', () => win.webContents.send('maximized', false));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}

app.whenReady().then(async () => {
  pendingPaths = argPaths(process.argv);
  await startServer();
  createWindow();
});
app.on('window-all-closed', () => { for (const p of active) try { p.kill('SIGKILL'); } catch {} app.quit(); });
