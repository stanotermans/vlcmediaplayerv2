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
  frame: (src, at, w) => inv('frame', src, at, w),
  clearThumbs: () => inv('clear-thumbs'),
  readImage: p => inv('read-image', p),
  subs: (src, idx) => inv('subs', src, idx),
  siblingSubs: file => inv('sibling-subs', file),
  snapshot: (dataUrl, name, dir) => inv('snapshot', dataUrl, name, dir),
  recStart: (dir, name) => inv('rec-start', dir, name),
  recChunk: (file, buf) => inv('rec-chunk', file, buf),
  recStop: file => inv('rec-stop', file),
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
let vlc = null, vlcBuf = null, gl = null, glProg = null, glTex = [], glSize = '', drawnFrames = 0;
function vlcGL(canvas) {
  gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });   // kept for snapshots and the mini player
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  glProg = gl.createProgram();
  gl.attachShader(glProg, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p; out vec2 uv; void main(){ uv = vec2((p.x+1.)/2., (1.-p.y)/2.); gl_Position = vec4(p,0,1); }'));
  // BT.709 limited range YUV → RGB; crop leaves out the decoder's padding rows
  gl.attachShader(glProg, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision mediump float; in vec2 uv; uniform sampler2D Y,U,V; uniform vec2 crop; out vec4 c;\n' +
    'void main(){ vec2 t=uv*crop; float y=(texture(Y,t).r-.0625)*1.164, u=texture(U,t).r-.5, v=texture(V,t).r-.5; c=vec4(y+1.793*v, y-.213*u-.533*v, y+2.112*u, 1.); }'));
  gl.linkProgram(glProg); gl.useProgram(glProg);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(glProg, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  ['Y', 'U', 'V'].forEach((n, i) => {
    glTex[i] = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, glTex[i]);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.uniform1i(gl.getUniformLocation(glProg, n), i);
  });
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
}
function vlcDraw() {
  requestAnimationFrame(vlcDraw);
  const f = vlc.frame();
  if (f.slot < 0 || f.frames === drawnFrames) return vlc.done();
  drawnFrames = f.frames;
  const W = f.width, H = f.height, s = vlc.state(), VW = s.width || W, VH = s.height || H, c = gl.canvas;
  if (glSize !== W + 'x' + H) {
    glSize = W + 'x' + H;
    [[W, H], [W / 2, H / 2], [W / 2, H / 2]].forEach(([w, h], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null); });
  }
  const o = f.offset, ys = W * H, cs = ys / 4;
  [[o, W, H], [o + ys, W / 2, H / 2], [o + ys + cs, W / 2, H / 2]].forEach(([off, w, h], i) => {
    gl.activeTexture(gl.TEXTURE0 + i); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(vlcBuf, off, w * h));
  });
  vlc.done();
  if (c.width !== VW || c.height !== VH) { c.width = VW; c.height = VH; }   // the canvas has the video's own size; CSS scales it
  gl.uniform2f(gl.getUniformLocation(glProg, 'crop'), VW / W, VH / H);
  gl.viewport(0, 0, VW, VH); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
contextBridge.exposeInMainWorld('vlcEngine', {
  available: () => !!vlcPaths,
  // start(canvasId) → libVLC version; allocates the frame buffer (3 slots of up to 4K plus padding rows)
  start: id => {
    if (!vlc) {
      vlc = require(vlcPaths.mod); vlcBuf = new ArrayBuffer(4096 * 2304 * 3 / 2 * 3);
      vlc.version = vlc.init(vlcPaths.dir, vlcBuf);
      vlcGL(document.getElementById(id)); requestAnimationFrame(vlcDraw);
    }
    return vlc.version;
  },
  open: (target, isLocation, startMs) => { drawnFrames = 0; return vlc.open(target, !!isLocation, startMs || 0); },
  play: () => vlc.play(), pause: () => vlc.pause(), stop: () => vlc.stop(), seek: ms => vlc.seek(ms),
  rate: r => vlc.rate(r), volume: v => vlc.volume(Math.round(v)), mute: b => vlc.mute(!!b),
  state: () => vlc.state(),
  audioTracks: () => { const a = vlc.audioTracks(); return { list: [...a], current: a.current }; },
  setAudioTrack: id => vlc.setAudioTrack(id), noSpu: () => vlc.noSpu(), nextFrame: () => vlc.nextFrame(),
});
