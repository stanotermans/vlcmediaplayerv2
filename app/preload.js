const { contextBridge, ipcRenderer, webUtils, webFrame } = require('electron');
const inv = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('api', {
  info: () => inv('info'),
  paths: () => inv('paths'),
  openFiles: () => inv('open-files'),
  openFolder: () => inv('open-folder'),
  openSubtitle: src => inv('open-subtitle', src),
  chooseFolder: title => inv('choose-folder', title),
  chooseFile: (title, exts) => inv('choose-file', title, exts),
  expand: paths => inv('expand', paths),
  exists: paths => inv('exists', paths),
  probe: src => inv('probe', src),
  keyframe: (src, ss) => inv('keyframe', src, ss),
  thumb: (src, at) => inv('thumb', src, at),
  dvdTitles: src => inv('dvd-titles', src),
  defaultPlayer: () => inv('default-player'),
  saveText: o => inv('save-text', o),
  exportPlaylist: o => inv('export-playlist', o),
  openText: o => inv('open-text', o),
  setSoundfont: file => inv('set-soundfont', file),
  chooseSoundfont: () => inv('choose-soundfont'),
  frame: (src, at, w, background) => inv('frame', src, at, w, !!background),
  clearThumbs: () => inv('clear-thumbs'),
  readImage: p => inv('read-image', p),
  subs: (src, idx) => inv('subs', src, idx),
  siblingSubs: file => inv('sibling-subs', file),
  snapshot: (dataUrl, name, dir) => inv('snapshot', dataUrl, name, dir),
  recStart: (dir, name) => inv('rec-start', dir, name),
  recChunk: (file, buf) => inv('rec-chunk', file, buf),
  recStop: file => inv('rec-stop', file),
  recDir: dir => inv('rec-dir', dir),
  reveal: p => inv('reveal', p),
  openPath: p => inv('open-path', p),
  setLog: cfg => inv('set-log', cfg),
  saveLogAs: () => inv('save-log-as'),
  devtools: on => inv('devtools', on),
  pathFor: file => webUtils.getPathForFile(file),
  win: act => ipcRenderer.send('win', act),
  setLang: l => ipcRenderer.send('set-lang', l),
  systemLanguages: () => ipcRenderer.sendSync('system-languages'),
  quit: () => ipcRenderer.send('quit'),
  appInfo: () => inv('app-info'),
  openExternal: url => inv('open-external', url),
  updateCheck: () => inv('update-check'),
  updateInstall: info => inv('update-install', info),
  onUpdateProgress: cb => ipcRenderer.on('update-progress', (_e, p) => cb(p)),
  ready: () => ipcRenderer.send('ready'),
  onOpenPaths: cb => ipcRenderer.on('open-paths', (_e, p) => cb(p)),
  onMaximized: cb => ipcRenderer.on('maximized', (_e, m) => cb(m)),
  onSnapped: cb => ipcRenderer.on('snapped', (_e, s) => cb(s)),
  winGeometry: () => inv('win-geometry'),
  fitWindow: sizes => inv('fit-window', sizes),
  cover: src => inv('cover', src),
  lyrics: file => inv('lyrics', file),
  readPlaylist: file => inv('read-playlist', file),
  osStatus: () => inv('os-status'),
  osSearch: q => inv('os-search', q),
  osDownload: d => inv('os-download', d),
  osLogin: c => inv('os-login', c),
  osLogout: () => inv('os-logout'),
  openPlaylist: () => inv('open-playlist'),
  setWindowPref: (key, value) => inv('set-window-pref', key, value),
  setZoom: f => webFrame.setZoomFactor(Math.min(2, Math.max(0.5, +f || 1))),
  addFonts: () => inv('add-fonts'),
  readFont: file => inv('read-font', file),
  removeFont: file => inv('remove-font', file),
});

/* ---------- VLC engine (Windows): libVLC through the native vlcview module ----------
   Nothing is loaded until the page asks for it (Settings → Playback → Engine: VLC). Frames are drawn here, in the
   preload's world, with WebGL on a canvas in the page: the frame buffer never has to cross into the page. */
const vlcPaths = (() => {
  const path = require('path'), fs = require('fs');
  const mod = path.join(__dirname, 'native', 'vlcview', 'build', 'Release', 'vlcview.node').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  const dir = [path.join(process.resourcesPath || '', 'vlc'), path.join(__dirname, 'vendor', 'vlc')].find(d => fs.existsSync(path.join(d, 'libvlc.dll')));
  return process.platform === 'win32' && dir && fs.existsSync(mod) ? { mod, dir } : null;
})();
let vlc = null, vlcBuf = null, gl = null, glProg = null, glTex = [], glSize = '', drawnFrames = 0, glU = {};
// Colours of what is playing (from the media info): matrix 601/709/2020, full or limited range, transfer SDR/PQ/HLG
let vlcColor = { mtx: -1, full: 0, tf: 0 };
const FRAG = `#version 300 es
precision highp float; in vec2 uv; out vec4 c;
uniform sampler2D Y, U, V; uniform vec2 crop; uniform int deep, mtx, full, tf;
// one sample: 8-bit textures are filtered by the GPU; 10-bit ones hold 16-bit little-endian samples in RG8 texels
float smp(sampler2D t, vec2 p) {
  if (deep == 0) return texture(t, p).r;
  vec2 sz = vec2(textureSize(t, 0)), rg = texelFetch(t, ivec2(min(p * sz, sz - 1.)), 0).rg;
  return (rg.r * 255. + rg.g * 65280.) / 1023.;
}
vec3 pq(vec3 e) {   // SMPTE ST 2084 → light, relative to SDR white (203 cd/m²)
  vec3 p = pow(max(e, 0.), vec3(1. / 78.84375));
  return pow(max(p - .8359375, 0.) / (18.8515625 - 18.6875 * p), vec3(1. / .1593017578125)) * (10000. / 203.);
}
vec3 hlg(vec3 e) {  // ARIB STD-B67 → scene light, then a 1000 cd/m² display (system gamma 1.2)
  vec3 s = mix(e * e / 3., (exp((e - .55991073) / .17883277) + .28466892) / 12., step(.5, e));
  float ys = dot(s, vec3(.2627, .678, .0593));
  return s * pow(max(ys, 1e-6), .2) * (1000. / 203.);
}
void main() {
  vec2 t = uv * crop;
  float y = smp(Y, t), u = smp(U, t) - .5, v = smp(V, t) - .5;
  if (full == 0) { y = (y - .0625) / .8588; u /= .8784; v /= .8784; }
  vec3 rgb = mtx == 601 ? vec3(y + 1.402 * v, y - .344136 * u - .714136 * v, y + 1.772 * u)
           : mtx == 2020 ? vec3(y + 1.4746 * v, y - .16455 * u - .57135 * v, y + 1.8814 * u)
           : vec3(y + 1.5748 * v, y - .1873 * u - .4681 * v, y + 1.8556 * u);
  if (tf != 0) {    // HDR on a normal screen: light → BT.709 colours → tone mapping (white 203 cd/m², peak 1000) → gamma
    vec3 l = tf == 1 ? pq(rgb) : hlg(rgb);
    l = mat3(1.6605, -.1246, -.0182, -.5876, 1.1329, -.1006, -.0728, -.0083, 1.1187) * l;
    l = max(l, 0.);
    float m = max(max(l.r, l.g), l.b), w = 1000. / 203.;
    if (m > 0.) l *= (m * (1. + m / (w * w)) / (1. + m)) / m * 1.6;   // extended Reinhard on the brightest channel; 1.6 keeps mid-tones at SDR brightness
    rgb = pow(clamp(l, 0., 1.), vec3(1. / 2.2));
  }
  c = vec4(clamp(rgb, 0., 1.), 1.);
}`;
function vlcGL(canvas) {
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });   // kept for snapshots and the mini player
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('vlcview shader:', gl.getShaderInfoLog(s)); return s; };
  glProg = gl.createProgram();
  gl.attachShader(glProg, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p; out vec2 uv; void main(){ uv = vec2((p.x+1.)/2., (1.-p.y)/2.); gl_Position = vec4(p,0,1); }'));
  gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(glProg); gl.useProgram(glProg);
  for (const n of ['crop', 'deep', 'mtx', 'full', 'tf']) glU[n] = gl.getUniformLocation(glProg, n);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(glProg, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  ['Y', 'U', 'V'].forEach((n, i) => {
    glTex[i] = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, glTex[i]);
    for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.uniform1i(gl.getUniformLocation(glProg, n), i);
  });
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
}
function vlcDraw() {
  requestAnimationFrame(vlcDraw);
  const f = vlc.frame();
  if (f.slot < 0 || f.frames === drawnFrames) return vlc.done();
  drawnFrames = f.frames;
  const W = f.width, H = f.height, B = f.bytes, s = vlc.state(), VW = s.width || W, VH = s.height || H, c = gl.canvas;
  const deep = B === 2, fmt = deep ? [gl.RG8, gl.RG] : [gl.R8, gl.RED], filt = deep ? gl.NEAREST : gl.LINEAR;
  if (glSize !== W + 'x' + H + 'x' + B) {
    glSize = W + 'x' + H + 'x' + B;
    [[W, H], [W / 2, H / 2], [W / 2, H / 2]].forEach(([w, h], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], w, h, 0, fmt[1], gl.UNSIGNED_BYTE, null);
    });
  }
  const o = f.offset, ys = W * H * B, cs = ys / 4;
  [[o, W, H], [o + ys, W / 2, H / 2], [o + ys + cs, W / 2, H / 2]].forEach(([off, w, h], i) => {
    gl.activeTexture(gl.TEXTURE0 + i); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, fmt[1], gl.UNSIGNED_BYTE, new Uint8Array(vlcBuf, off, w * h * B));
  });
  vlc.done();
  // the canvas has the video's own size (wider or narrower for non-square pixels, like a 16:9 DVD); CSS scales it
  const CW = Math.round(VW * (s.sar > 0 ? s.sar : 1));
  if (c.width !== CW || c.height !== VH) { c.width = CW; c.height = VH; }
  gl.uniform2f(glU.crop, VW / W, VH / H);
  gl.uniform1i(glU.deep, deep ? 1 : 0);
  gl.uniform1i(glU.mtx, vlcColor.mtx > 0 ? vlcColor.mtx : VH <= 576 ? 601 : 709);   // unknown matrix: SD → 601, HD → 709
  gl.uniform1i(glU.full, vlcColor.full); gl.uniform1i(glU.tf, deep ? vlcColor.tf : 0);
  gl.viewport(0, 0, CW, VH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
// media-info colour names → shader settings; HDR (PQ/HLG) also asks libVLC for 10-bit frames
function colorOf(c = {}) {
  const m = c.matrix || '', tr = c.transfer || '';
  return { mtx: /2020/.test(m) ? 2020 : /709/.test(m) ? 709 : /470bg|170m|601|smpte240m/.test(m) ? 601 : -1, full: c.range === 'pc' ? 1 : 0,
    tf: tr === 'smpte2084' ? 1 : tr === 'arib-std-b67' ? 2 : 0 };
}
contextBridge.exposeInMainWorld('vlcEngine', {
  available: () => !!vlcPaths,
  // start(canvasId) → libVLC version; allocates the frame buffer (3 slots of up to 4K plus padding rows, 16-bit samples)
  // extraArgs: libVLC start options (passthrough)
  start: (id, extraArgs) => {
    if (!vlc) {
      vlc = require(vlcPaths.mod); vlcBuf = new ArrayBuffer(4096 * 2304 * 3 / 2 * 2 * 3);   // 3 slots of up to 4K, 10-bit
      // VLCX_VLC_ARGS: extra libVLC options for testing, separated by | (e.g. write the sound to a file)
      const testArgs = (process.env.VLCX_VLC_ARGS || '').split('|').filter(Boolean);
      vlc.version = vlc.init(vlcPaths.dir, vlcBuf, [...(extraArgs || []), ...testArgs]);
      vlcGL(document.getElementById(id)); requestAnimationFrame(vlcDraw);
    }
    return vlc.version;
  },
  // color: the media info's colour description (range, matrix, transfer)
  open: (target, isLocation, startMs, color, options) => { drawnFrames = 0; vlcColor = colorOf(color); return vlc.open(target, !!isLocation, startMs || 0, vlcColor.tf > 0, options || []); },
  equalizer: bands => vlc.equalizer(bands || null), stereo: b => vlc.stereo(!!b),
  audioFx: (filters, params) => vlc.audioFx(String(filters || ''), params || []),
  play: () => vlc.play(), pause: () => vlc.pause(), stop: () => vlc.stop(), seek: ms => vlc.seek(ms),
  rate: r => vlc.rate(r), volume: v => vlc.volume(Math.round(v)), mute: b => vlc.mute(!!b),
  state: () => vlc.state(),
  audioTracks: () => { const a = vlc.audioTracks(); return { list: [...a], current: a.current }; },
  setAudioTrack: id => vlc.setAudioTrack(id), noSpu: () => vlc.noSpu(), nextFrame: () => vlc.nextFrame(),
  // DVD menus: navigate(0 OK, 1 up, 2 down, 3 left, 4 right), menu() = the disc's menu, mouse(x, y, click) in video pixels
  navigate: m => vlc.navigate(m | 0), menu: () => vlc.menu(), mouse: (x, y, click) => vlc.mouse(+x, +y, !!click),
  titles: () => [...vlc.titles()], setTitle: i => vlc.setTitle(i | 0),
  // subtitles libVLC draws itself (image subtitles): ids in stream order, choose one (-1 none), delay in ms
  record: (on, dir) => vlc.record(!!on, String(dir || '')), fastSeek: b => vlc.fastSeek(!!b),
  spuTracks: () => [...vlc.spuTracks()], setSpu: id => vlc.setSpu(id | 0), spuDelay: ms => vlc.spuDelay(+ms || 0),
});
