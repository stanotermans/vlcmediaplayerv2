// VLC Media Player (redesign) – Electron main process
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const unpacked = p => p && p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
// Bundled ffmpeg/ffprobe where available; otherwise (e.g. *BSD, or a distro build) the system's ffmpeg on PATH.
const bundled = (load) => { try { const p = unpacked(load()); return p && fs.existsSync(p) ? p : null; } catch { return null; } };
const FFMPEG = process.env.VLCX_FFMPEG || bundled(() => require('ffmpeg-static')) || 'ffmpeg';
const FFPROBE = process.env.VLCX_FFPROBE || bundled(() => require('ffprobe-static').path) || 'ffprobe';

const MEDIA_EXT = /\.(mp4|m4v|mkv|webm|mov|avi|wmv|flv|mpg|mpeg|ts|m2ts|mts|3gp|ogv|vob|divx|mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|ac3|dts|mka|ape|aiff?)$/i;
const SUB_EXT = /\.(srt|vtt|ass|ssa|sub)$/i;
const MIME = { mp4:'video/mp4', m4v:'video/mp4', mov:'video/mp4', webm:'video/webm', mkv:'video/webm', ogv:'video/ogg',
  mp3:'audio/mpeg', m4a:'audio/mp4', aac:'audio/aac', flac:'audio/flac', wav:'audio/wav', ogg:'audio/ogg', oga:'audio/ogg', opus:'audio/ogg' };

let win = null;
let pendingPaths = [];
const TOKEN = crypto.randomBytes(16).toString('hex');
let PORT = 0;

/* ---------------- single instance + "open with" ---------------- */
const argPaths = argv => argv.slice(app.isPackaged ? 1 : 2).filter(a => !a.startsWith('-') && fs.existsSync(a)).map(a => path.resolve(a));
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

async function probe(src) {
  const out = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', src], { timeout: 20000 });
  if (!out) return null;
  let j; try { j = JSON.parse(out); } catch { return null; }
  const S = j.streams || [];
  const v = S.find(s => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const tag = s => (s.tags && (s.tags.title || s.tags.language)) || '';
  return {
    duration: +(j.format && j.format.duration) || 0,
    format: (j.format && j.format.format_name) || '',
    vcodec: v ? v.codec_name : null, pix: v ? v.pix_fmt : null, width: v ? v.width : 0, height: v ? v.height : 0,
    audio: S.filter(s => s.codec_type === 'audio').map((s, i) => ({ i, codec: s.codec_name, label: tag(s) || `Spoor ${i + 1}`, lang: s.tags && s.tags.language, ch: s.channels })),
    subs: S.filter(s => s.codec_type === 'subtitle').map((s, i) => ({ i, codec: s.codec_name, label: tag(s) || `Ondertitel ${i + 1}`, lang: s.tags && s.tags.language })),
    cover: S.some(s => s.disposition && s.disposition.attached_pic),
  };
}

// Last video keyframe at or before `ss` – stream copy can only start on a keyframe
async function keyframe(src, ss) {
  const out = await run(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,flags',
    '-read_intervals', `${Math.max(0, ss - 20)}%${ss + 0.05}`, '-of', 'csv=p=0', src], { timeout: 15000 });
  if (!out) return null;
  const times = out.split(/\r?\n/).filter(l => /,K/.test(l)).map(parseFloat).filter(t => isFinite(t) && t <= ss + 0.05);
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
    { name: 'Alle bestanden', extensions: ['*'] }] });
  return r.canceled ? [] : expand(r.filePaths);
});
ipcMain.handle('open-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? [] : expand(r.filePaths);
});
ipcMain.handle('open-subtitle', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Ondertitels', extensions: ['srt', 'vtt', 'ass', 'ssa'] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('expand', (_e, paths) => expand(paths));
ipcMain.handle('exists', (_e, paths) => paths.filter(p => /^https?:/i.test(p) || fs.existsSync(p)));
ipcMain.handle('probe', (_e, src) => probe(src));
ipcMain.handle('keyframe', (_e, src, ss) => keyframe(src, ss));
ipcMain.handle('thumb',(_e, src, at) => thumbnail(src, at));
ipcMain.handle('subs', (_e, src, idx) => subtitles(src, idx));
ipcMain.handle('sibling-subs', (_e, file) => siblingSubs(file));
ipcMain.handle('snapshot', (_e, dataUrl, name, dir) => {
  dir = dir || path.join(app.getPath('pictures'), 'VLC');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return file;
});
ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('open-path', (_e, p) => { fs.mkdirSync(p, { recursive: true }); return shell.openPath(p); });
ipcMain.handle('paths', () => ({
  videos: app.getPath('videos'), music: app.getPath('music'), pictures: app.getPath('pictures'),
  recordings: path.join(app.getPath('videos'), 'VLC'), snapshots: path.join(app.getPath('pictures'), 'VLC'),
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
ipcMain.on('win', (_e, act) => {
  if (!win) return;
  if (act === 'min') win.minimize();
  else if (act === 'max') win.isMaximized() ? win.unmaximize() : win.maximize();
  else if (act === 'close') win.close();
});
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
