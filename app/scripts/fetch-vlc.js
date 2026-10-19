// Fetches libVLC (VLC's engine) for the "VLC" playback engine from VideoLAN's official VLC builds, checked against
// VideoLAN's own SHA-256, trimmed to what the app needs, into app/vendor/vlc (git-ignored).
// Usage (from app/; the release workflow does this before packaging):
//   node scripts/fetch-vlc.js             Windows: the win64 zip → vendor/vlc/{libvlc.dll, libvlccore.dll, plugins/}
//   node scripts/fetch-vlc.js mac-arm64   macOS: VLC.app from the Apple Silicon or Intel dmg → vendor/vlc/{lib/,
//   node scripts/fetch-vlc.js mac-x64     plugins/} (needs hdiutil, so it runs on a Mac)
// Linux has no VideoLAN build: see build/vlc-linux/ (bundled in every Linux package).
// Left out: the VLC interface (Qt, skins, Lua), visualizations and service discovery. The DVD plugins (menus, like
// VLC) are kept; in VideoLAN's builds they contain libdvdcss, which reads copy-protected DVDs.
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const VERSION = '3.0.24';
const TARGET = process.argv[2] || (process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac-' + process.arch : '');
const SOURCES = {
  win: `https://download.videolan.org/pub/videolan/vlc/${VERSION}/win64/vlc-${VERSION}-win64.zip`,
  'mac-arm64': `https://download.videolan.org/pub/videolan/vlc/${VERSION}/macosx/vlc-${VERSION}-arm64.dmg`,
  'mac-x64': `https://download.videolan.org/pub/videolan/vlc/${VERSION}/macosx/vlc-${VERSION}-intel64.dmg`,
};
const BASE = SOURCES[TARGET];
const STAMP = `${VERSION} ${TARGET} with DVD and record`;   // written to vendor/vlc/VERSION; a different one fetches again
const OUT = path.join(__dirname, '..', 'vendor', 'vlc');
const SKIP_DIRS = ['gui', 'lua', 'control', 'visualization', 'video_splitter', 'services_discovery'];
// VLC's Record (the input's "record") saves through a few stream outputs, the muxers and the file output; the other
// streaming plugins are left out
const ONLY = { stream_out: /^libstream_out_(record|standard|es|dummy|duplicate)_plugin\./i, access_output: /^libaccess_output_file_plugin\./i };
const PLUGIN = /\.(dll|dylib)$/i;

function get(url) {
  return new Promise((res, rej) => https.get(url, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(get(new URL(r.headers.location, url).href));
    if (r.statusCode !== 200) return rej(new Error(`${url}: HTTP ${r.statusCode}`));
    const parts = []; r.on('data', d => parts.push(d)); r.on('end', () => res(Buffer.concat(parts))); r.on('error', rej);
  }).on('error', rej));
}
// downloads can fail now and then on build servers (DNS, resets): three tries
async function getRetry(url, tries = 3) {
  for (let i = 1; ; i++) {
    try { return await get(url); } catch (e) { if (i >= tries) throw e; console.log(`retrying ${url} (${e.message})`); await new Promise(r => setTimeout(r, 10000)); }
  }
}
function copyTree(from, to, filter) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (!filter(a, e)) continue;
    if (e.isDirectory()) copyTree(a, b, filter); else fs.copyFileSync(a, b);
  }
}
const keepPlugin = (p, e) => e.isDirectory() ? !SKIP_DIRS.includes(e.name) : PLUGIN.test(e.name) && (ONLY[path.basename(path.dirname(p))] || /./).test(e.name);
const sizeOf = d => fs.readdirSync(d, { withFileTypes: true }).reduce((s, e) => s + (e.isDirectory() ? sizeOf(path.join(d, e.name)) : e.isFile() ? fs.statSync(path.join(d, e.name)).size : 0), 0);

(async () => {
  if (!BASE) { console.log(`fetch-vlc: no VideoLAN build for "${TARGET}" (Linux: build/vlc-linux/)`); return; }
  if (fs.existsSync(path.join(OUT, 'VERSION')) && fs.readFileSync(path.join(OUT, 'VERSION'), 'utf8').trim() === STAMP) { console.log('libVLC', VERSION, TARGET, 'already in', OUT); return; }
  console.log('downloading', BASE);
  const [pkg, sum] = await Promise.all([getRetry(BASE), getRetry(BASE + '.sha256')]);
  const want = sum.toString().trim().split(/\s+/)[0].toLowerCase(), have = crypto.createHash('sha256').update(pkg).digest('hex');
  if (want !== have) throw new Error(`checksum mismatch: expected ${want}, got ${have}`);
  console.log('checksum ok', have);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vlc-'));
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  if (TARGET === 'win') {
    fs.writeFileSync(path.join(tmp, 'vlc.zip'), pkg);
    execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', 'vlc.zip'], { cwd: tmp });   // Windows' own tar reads zip files
    const src = path.join(tmp, `vlc-${VERSION}`);
    for (const f of ['libvlc.dll', 'libvlccore.dll']) fs.copyFileSync(path.join(src, f), path.join(OUT, f));
    fs.copyFileSync(path.join(src, 'COPYING.txt'), path.join(OUT, 'COPYING-VLC.txt'));
    copyTree(path.join(src, 'plugins'), path.join(OUT, 'plugins'), keepPlugin);
    execFileSync(path.join(src, 'vlc-cache-gen.exe'), [path.join(OUT, 'plugins')]);   // plugins.dat: faster start
  } else {
    // macOS: VLC.app/Contents/MacOS/{lib, plugins} from the dmg, in the same layout (the plugins find libvlccore in
    // ../lib); the dylibs keep VideoLAN's signatures
    fs.writeFileSync(path.join(tmp, 'vlc.dmg'), pkg);
    const mnt = path.join(tmp, 'mnt');
    execFileSync('hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mnt, path.join(tmp, 'vlc.dmg')], { stdio: 'ignore' });
    try {
      const mac = path.join(mnt, 'VLC.app', 'Contents', 'MacOS');
      fs.cpSync(path.join(mac, 'lib'), path.join(OUT, 'lib'), { recursive: true, verbatimSymlinks: true });
      copyTree(path.join(mac, 'plugins'), path.join(OUT, 'plugins'), (p, e) => e.name === 'plugins.dat' || keepPlugin(p, e));
      const copying = ['COPYING.txt', 'COPYING', 'VLC.app/Contents/Resources/COPYING'].map(f => path.join(mnt, f)).find(f => fs.existsSync(f));
      if (copying) fs.copyFileSync(copying, path.join(OUT, 'COPYING-VLC.txt'));
    } finally { execFileSync('hdiutil', ['detach', mnt, '-force'], { stdio: 'ignore' }); }
  }
  fs.writeFileSync(path.join(OUT, 'VERSION'), STAMP + '\n');
  fs.writeFileSync(path.join(OUT, 'README.txt'), `libVLC ${VERSION} from the official VLC build (${BASE}), trimmed for VLC Redesign.\n` +
    'VLC and libVLC are made by VideoLAN and licensed under the LGPL 2.1 or later (some plugins GPL); see COPYING-VLC.txt.\n' +
    'The DVD plugins (libdvdnav_plugin, libdvdread_plugin) include libdvdcss (GPL 2 or later,\n' +
    'https://www.videolan.org/developers/libdvdcss.html).\n' +
    'Source code: https://download.videolan.org/pub/videolan/vlc/' + VERSION + '/\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('libVLC', VERSION, TARGET, 'ready in', OUT, (sizeOf(OUT) / 1e6).toFixed(1), 'MB');
})().catch(e => { console.error(e.message); process.exit(1); });
