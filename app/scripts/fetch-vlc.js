// Fetches libVLC (VLC's engine) for the "VLC" playback engine on Windows: the official VLC build from VideoLAN,
// checked against VideoLAN's own SHA-256, trimmed to what the app needs, into app/vendor/vlc (git-ignored).
// Usage: node scripts/fetch-vlc.js   (run from app/; the release workflow does this before packaging)
// Left out: the VLC interface (Qt, skins, Lua), streaming output, and the DVD plugins, because those contain
// libdvdcss (decryption of copy-protected DVDs). DVDs keep playing through the Classic engine.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const VERSION = '3.0.24';
const BASE = `https://download.videolan.org/pub/videolan/vlc/${VERSION}/win64/vlc-${VERSION}-win64.zip`;
const OUT = path.join(__dirname, '..', 'vendor', 'vlc');
const SKIP_DIRS = ['gui', 'lua', 'control', 'visualization', 'video_splitter', 'services_discovery', 'stream_out', 'access_output', 'mux'];
const SKIP_FILES = /^lib(dvdread|dvdnav)_plugin\.dll$/i;

function get(url) {
  return new Promise((res, rej) => https.get(url, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(get(new URL(r.headers.location, url).href));
    if (r.statusCode !== 200) return rej(new Error(`${url}: HTTP ${r.statusCode}`));
    const parts = []; r.on('data', d => parts.push(d)); r.on('end', () => res(Buffer.concat(parts))); r.on('error', rej);
  }).on('error', rej));
}
function copyTree(from, to, filter) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (!filter(a, e)) continue;
    if (e.isDirectory()) copyTree(a, b, filter); else fs.copyFileSync(a, b);
  }
}
const sizeOf = d => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? sizeOf(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);

(async () => {
  if (process.platform !== 'win32') { console.log('fetch-vlc: only needed on Windows for now'); return; }
  if (fs.existsSync(path.join(OUT, 'libvlc.dll')) && fs.readFileSync(path.join(OUT, 'VERSION'), 'utf8').trim() === VERSION) { console.log('libVLC', VERSION, 'already in', OUT); return; }
  console.log('downloading', BASE);
  const [zip, sum] = await Promise.all([get(BASE), get(BASE + '.sha256')]);
  const want = sum.toString().trim().split(/\s+/)[0].toLowerCase(), have = crypto.createHash('sha256').update(zip).digest('hex');
  if (want !== have) throw new Error(`checksum mismatch: expected ${want}, got ${have}`);
  console.log('checksum ok', have);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vlc-'));
  fs.writeFileSync(path.join(tmp, 'vlc.zip'), zip);
  execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', 'vlc.zip'], { cwd: tmp });   // Windows' own tar reads zip files
  const src = path.join(tmp, `vlc-${VERSION}`);
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  for (const f of ['libvlc.dll', 'libvlccore.dll']) fs.copyFileSync(path.join(src, f), path.join(OUT, f));
  fs.copyFileSync(path.join(src, 'COPYING.txt'), path.join(OUT, 'COPYING-VLC.txt'));
  copyTree(path.join(src, 'plugins'), path.join(OUT, 'plugins'), (p, e) =>
    e.isDirectory() ? !SKIP_DIRS.includes(e.name) : /\.dll$/i.test(e.name) && !SKIP_FILES.test(e.name));
  execFileSync(path.join(src, 'vlc-cache-gen.exe'), [path.join(OUT, 'plugins')]);   // plugins.dat: faster start
  fs.writeFileSync(path.join(OUT, 'VERSION'), VERSION + '\n');
  fs.writeFileSync(path.join(OUT, 'README.txt'), `libVLC ${VERSION} from the official VLC build (${BASE}), trimmed for VLC Redesign.\n` +
    'VLC and libVLC are made by VideoLAN and licensed under the LGPL 2.1 or later (some plugins GPL); see COPYING-VLC.txt.\n' +
    'Source code: https://download.videolan.org/pub/videolan/vlc/' + VERSION + '/\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('libVLC', VERSION, 'ready in', OUT, (sizeOf(OUT) / 1e6).toFixed(1), 'MB');
})().catch(e => { console.error(e.message); process.exit(1); });
