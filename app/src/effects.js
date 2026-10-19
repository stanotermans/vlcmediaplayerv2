// Audio graph (10-band EQ, compressor, reverb, stereo widener, boost) and video filters. Exposes window.FX
(() => {
const BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
const BAND_LABELS = ['60 Hz', '170 Hz', '310 Hz', '600 Hz', '1 KHz', '3 KHz', '6 KHz', '12 KHz', '14 KHz', '16 KHz'];
// VLC equalizer presets: [preamp, 10 bands]
const EQ_PRESETS = {
  flat: ['Flat', 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  classical: ['Classical', 12, 0, 0, 0, 0, 0, 0, -7.2, -7.2, -7.2, -9.6],
  club: ['Club', 6, 0, 0, 8, 5.6, 5.6, 5.6, 3.2, 0, 0, 0],
  dance: ['Dance', 5, 9.6, 7.2, 2.4, 0, 0, -5.6, -7.2, -7.2, 0, 0],
  fullbass: ['Full bass', 5, -8, 9.6, 9.6, 5.6, 1.6, -4, -8, -10.4, -11.2, -11.2],
  fullbasstreble: ['Bass & treble', 4, 7.2, 5.6, 0, -7.2, -4.8, 1.6, 8, 11.2, 12, 12],
  fulltreble: ['Full treble', 3, -9.6, -9.6, -9.6, -4, 2.4, 11.2, 16, 16, 16, 16.8],
  headphones: ['Headphones', 4, 4.8, 11.2, 5.6, -3.2, -2.4, 1.6, 4.8, 9.6, 12.8, 14.4],
  largehall: ['Large hall', 5, 10.4, 10.4, 5.6, 5.6, 0, -4.8, -4.8, -4.8, 0, 0],
  live: ['Live', 7, -4.8, 0, 4, 5.6, 5.6, 5.6, 4, 2.4, 2.4, 2.4],
  party: ['Party', 6, 7.2, 7.2, 0, 0, 0, 0, 0, 0, 7.2, 7.2],
  pop: ['Pop', 6, -1.6, 4.8, 7.2, 8, 5.6, 0, -2.4, -2.4, -1.6, -1.6],
  reggae: ['Reggae', 8, 0, 0, 0, -5.6, 0, 6.4, 6.4, 0, 0, 0],
  rock: ['Rock', 5, 8, 4.8, -5.6, -8, -3.2, 4, 8.8, 11.2, 11.2, 11.2],
  ska: ['Ska', 6, -2.4, -4.8, -4, 0, 4, 5.6, 8.8, 9.6, 11.2, 9.6],
  soft: ['Soft', 5, 4.8, 1.6, 0, -2.4, 0, 4, 8, 9.6, 11.2, 12],
  softrock: ['Soft rock', 6, 4, 4, 2.4, 0, -4, -5.6, -3.2, 0, 2.4, 8.8],
  techno: ['Techno', 5, 8, 5.6, 0, -5.6, -4.8, 0, 8, 9.6, 9.6, 8.8],
};
const dB = v => Math.pow(10, v / 20);

let video, ctx, src, nodes;
// Channels of what is playing (2 = stereo, 6 = 5.1, 8 = 7.1, #44). The output keeps them when surround is on;
// the compressor, widener and reverb of Web Audio only work in stereo, so in surround they are wrapped below.
let chans = 2, wrap = [];
function attach(v) { video = v; applyVideo(); if (needsGraph()) ensure(); }

function ensure() {
  if (ctx) return true;
  try {
    ctx = new AudioContext();
    src = ctx.createMediaElementSource(video);
    const g = () => ctx.createGain();
    nodes = {
      pre: g(),
      eq: BANDS.map((f, i) => { const b = ctx.createBiquadFilter(); b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking'; b.frequency.value = f; b.Q.value = 1.1; return b; }),
      comp: ctx.createDynamicsCompressor(), makeup: g(),
      // stereo widener: split → per-channel delay with feedback and negative crossfeed
      wIn: g(), wOut: g(), wDry: g(), split: ctx.createChannelSplitter(2), merge: ctx.createChannelMerger(2),
      dl: ctx.createDelay(1), dr: ctx.createDelay(1), fbl: g(), fbr: g(), xl: g(), xr: g(),
      // reverb
      rIn: g(), rOut: g(), rWet: g(), rDry: g(), conv: ctx.createConvolver(),
      boost: g(),
      // audio delay (#55; ms, later only: Chromium cannot play the sound ahead of the picture)
      avDelay: ctx.createDelay(2),
    };
    const n = nodes;
    n.wIn.connect(n.wDry); n.wDry.connect(n.wOut);
    n.wIn.connect(n.split);
    n.split.connect(n.dl, 0); n.split.connect(n.dr, 1);
    n.dl.connect(n.fbl); n.fbl.connect(n.dl); n.dr.connect(n.fbr); n.fbr.connect(n.dr);
    n.dl.connect(n.merge, 0, 0); n.dr.connect(n.merge, 0, 1);
    n.dl.connect(n.xr); n.xr.connect(n.merge, 0, 1); n.dr.connect(n.xl); n.xl.connect(n.merge, 0, 0);
    n.merge.connect(n.wOut);
    n.rIn.connect(n.rDry); n.rDry.connect(n.rOut);
    n.rIn.connect(n.conv); n.conv.connect(n.rWet); n.rWet.connect(n.rOut);
    for (let i = 0; i < n.eq.length - 1; i++) n.eq[i].connect(n.eq[i + 1]);
    n.comp.connect(n.makeup);
    rewire(); applyAudio();
    video.addEventListener('play', () => ctx.resume());
    return true;
  } catch (e) { console.error('audio graph', e); return false; }
}
function needsGraph() {
  const s = S.all();
  return s.eqOn || s.compOn || s.reverbOn || s.widenOn || s.gain !== 100 || s.audioDelay > 0;
}
// Surround through a stereo-only effect: front left/right go through it, the other channels pass by unchanged.
function frontOnly(tail, inNode, outNode, nch) {
  const sp = ctx.createChannelSplitter(nch), mg = ctx.createChannelMerger(nch), in2 = ctx.createChannelMerger(2), out2 = ctx.createChannelSplitter(2);
  tail.connect(sp); sp.connect(in2, 0, 0); sp.connect(in2, 1, 1); in2.connect(inNode);
  outNode.connect(out2); out2.connect(mg, 0, 0); out2.connect(mg, 1, 1);
  for (let c = 2; c < nch; c++) sp.connect(mg, c, c);
  wrap.push(sp, mg, in2, out2);
  return mg;
}
// Surround compressor: one compressor per channel pair (front, centre + LFE, sides, backs) with the same settings
function pairComp(tail, nch) {
  const sp = ctx.createChannelSplitter(nch), mg = ctx.createChannelMerger(nch);
  tail.connect(sp); wrap.push(sp, mg);
  for (let c = 0; c < nch; c += 2) {
    const in2 = ctx.createChannelMerger(2), comp = ctx.createDynamicsCompressor(), out2 = ctx.createChannelSplitter(2);
    sp.connect(in2, c, 0); if (c + 1 < nch) sp.connect(in2, c + 1, 1);
    in2.connect(comp); comp.connect(out2); out2.connect(mg, 0, c); if (c + 1 < nch) out2.connect(mg, 1, c + 1);
    wrap.push(in2, comp, out2); nodes.comps.push(comp);
  }
  return mg;
}
function rewire() {
  if (!ctx) return;
  const n = nodes, s = S.all(), nch = S.get('surround') === false ? 2 : chans;
  src.disconnect(); n.pre.disconnect(); n.eq[n.eq.length - 1].disconnect(); n.makeup.disconnect(); n.wOut.disconnect(); n.rOut.disconnect(); n.boost.disconnect(); n.comp.disconnect(); n.avDelay.disconnect();
  for (const w of wrap) w.disconnect(); wrap = []; n.comps = [n.comp];
  n.comp.connect(n.makeup);
  ctx.destination.channelCount = Math.max(2, Math.min(nch, ctx.destination.maxChannelCount || 2));   // fewer speakers: mixed down here ctx.destination.channelInterpretation = 'speakers';
  let tail = src;
  const to = node => { tail.connect(node); tail = node; };
  if (s.eqOn) { to(n.pre); tail.connect(n.eq[0]); tail = n.eq[n.eq.length - 1]; }
  if (s.compOn) { if (nch > 2) { tail = pairComp(tail, nch); to(n.makeup); } else { tail.connect(n.comp); tail = n.makeup; } }
  if (s.widenOn) { if (nch > 2) tail = frontOnly(tail, n.wIn, n.wOut, nch); else { tail.connect(n.wIn); tail = n.wOut; } }
  if (s.reverbOn) { if (nch > 2) tail = frontOnly(tail, n.rIn, n.rOut, nch); else { tail.connect(n.rIn); tail = n.rOut; } }
  if (s.audioDelay > 0) to(n.avDelay);
  to(n.boost);
  n.boost.connect(ctx.destination);
  applyAudio();
}
// Called for every file / audio track with its channel count
// srcChans: channels in the file. With surround off, a surround file that plays without conversion goes through
// the audio graph as well, so that it really comes out as stereo.
function setChannels(c, srcChans) {
  if (S.get('surround') === false && srcChans > 2 && !ctx) ensure();
  c = Math.max(1, Math.min(8, c || 2)); if (c === chans) return; chans = c; rewire();
}
let irKey = '';
function impulse(size, damp, width) {
  const key = [size, damp, width].join();
  if (key === irKey) return; irKey = key;
  const len = Math.max(0.15, size * 0.45) * ctx.sampleRate, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const decay = 1.5 + damp * 0.6;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const corr = c === 1 ? (1 - width / 10) : 0;   // narrow = correlated channels
      const r = Math.random() * 2 - 1;
      d[i] = (corr ? (buf.getChannelData(0)[i] * corr + r * (1 - corr)) : r) * Math.pow(1 - i / len, decay);
    }
  }
  nodes.conv.buffer = buf;
}
function applyAudio() {
  if (!ctx) return;
  const n = nodes, s = S.all(), t = ctx.currentTime;
  n.pre.gain.setTargetAtTime(dB(s.eq[0] - 12), t, 0.02);
  n.eq.forEach((b, i) => b.gain.setTargetAtTime(s.eq[i + 1], t, 0.02));
  const c = s.comp;
  for (const k of n.comps || [n.comp]) { k.threshold.value = c.threshold; k.knee.value = c.knee; k.ratio.value = c.ratio; k.attack.value = c.attack / 1000; k.release.value = c.release / 1000; }
  n.makeup.gain.value = dB(c.makeup);
  const w = s.widen;
  n.dl.delayTime.value = 0; n.dr.delayTime.value = w.delay / 1000;
  n.fbl.gain.value = 0; n.fbr.gain.value = Math.min(0.9, w.feedback);
  n.xl.gain.value = -w.crossfeed; n.xr.gain.value = -w.crossfeed; n.wDry.gain.value = w.dry;
  const r = s.reverb;
  impulse(r.size, r.damp, r.width);
  n.rWet.gain.value = r.wet / 10; n.rDry.gain.value = r.dry / 10;
  n.boost.gain.setTargetAtTime(s.gain / 100, t, 0.02);
  n.avDelay.delayTime.setValueAtTime(Math.max(0, s.audioDelay || 0) / 1000, t);
}
S.on(path => {
  if (path === 'surround' && ctx) rewire();
  if (path === 'audioDelay') { if (!ctx && needsGraph()) ensure(); if (ctx) rewire(); }
  if (/^(eq|comp|reverb|widen|gain|eqOn|compOn|reverbOn|widenOn)/.test(path)) {
    if (!ctx && needsGraph()) ensure();
    if (ctx) { if (/On$/.test(path)) rewire(); applyAudio(); }
  }
  if (path.startsWith('vf') || path === 'aspect') applyVideo();
});
function setPreset(key) {
  const p = EQ_PRESETS[key]; if (!p) return;
  S.set('eqPreset', key); S.set('eq', p.slice(1));
}

/* ---------- video filters ---------- */
const svgNS = 'http://www.w3.org/2000/svg';
let svgReady = false;
function svgDefs() {
  if (svgReady) return; svgReady = true;
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', 0); svg.setAttribute('height', 0); svg.style.position = 'absolute';
  svg.innerHTML = `<filter id="fx-gamma" color-interpolation-filters="sRGB"><feComponentTransfer>
      <feFuncR type="gamma" exponent="1"/><feFuncG type="gamma" exponent="1"/><feFuncB type="gamma" exponent="1"/></feComponentTransfer></filter>
    <filter id="fx-sharp"><feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 0 0 0 1 0 0 0 0"/></filter>
    <filter id="fx-poster" color-interpolation-filters="sRGB"><feComponentTransfer>
      <feFuncR type="discrete" tableValues="0 .25 .5 .75 1"/><feFuncG type="discrete" tableValues="0 .25 .5 .75 1"/><feFuncB type="discrete" tableValues="0 .25 .5 .75 1"/></feComponentTransfer></filter>`;
  document.body.append(svg);
}
function filterString() {
  const v = S.get('vf'); svgDefs();
  const parts = [];
  if (v.gamma !== 1) { document.querySelectorAll('#fx-gamma feFuncR,#fx-gamma feFuncG,#fx-gamma feFuncB').forEach(f => f.setAttribute('exponent', (1 / v.gamma).toFixed(3))); parts.push('url(#fx-gamma)'); }
  if (v.sharpen > 0) { const k = v.sharpen / 2; document.querySelector('#fx-sharp feConvolveMatrix').setAttribute('kernelMatrix', `0 ${-k} 0 ${-k} ${1 + 4 * k} ${-k} 0 ${-k} 0`); parts.push('url(#fx-sharp)'); }
  if (v.posterize) parts.push('url(#fx-poster)');
  if (v.brightness !== 100) parts.push(`brightness(${v.brightness}%)`);
  if (v.contrast !== 100) parts.push(`contrast(${v.contrast}%)`);
  if (v.saturate !== 100) parts.push(`saturate(${v.saturate}%)`);
  if (v.hue) parts.push(`hue-rotate(${v.hue}deg)`);
  if (v.sepia) parts.push(`sepia(${v.sepia}%)`);
  if (v.gray) parts.push('grayscale(1)');
  if (v.negate) parts.push('invert(1)');
  return parts.join(' ') || 'none';
}
let grainCanvas, grainRaf;
function grain(level) {
  const wrap = document.getElementById('player');
  if (!level) { if (grainCanvas) { grainCanvas.remove(); grainCanvas = null; cancelAnimationFrame(grainRaf); } return; }
  if (!grainCanvas) {
    grainCanvas = document.createElement('canvas'); grainCanvas.id = 'grain'; grainCanvas.width = 256; grainCanvas.height = 256;
    wrap.insertBefore(grainCanvas, document.getElementById('subs'));
    const g = grainCanvas.getContext('2d'), img = g.createImageData(256, 256);
    const loop = () => { for (let i = 0; i < img.data.length; i += 4) { const x = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = x; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); grainRaf = setTimeout(() => requestAnimationFrame(loop), 40); };
    loop();
  }
  grainCanvas.style.opacity = (level / 10 * 0.35).toFixed(3);
}
function applyVideo() {
  if (!video) return;
  const v = S.get('vf'), a = S.get('aspect');
  video.style.filter = filterString();
  video.style.objectFit = a === 'fill' ? 'cover' : a === 'stretch' ? 'fill' : 'contain';
  const c = v.crop;
  video.style.objectViewBox = (c.t || c.b || c.l || c.r) ? `inset(${c.t}px ${c.r}px ${c.b}px ${c.l}px)` : '';
  video.style.transform = `rotate(${v.rotate}deg) scale(${v.zoom * (v.mirror ? -1 : 1)},${v.zoom})`;
  grain(v.grain);
}
function resetVideo() { S.set('vf', JSON.parse(JSON.stringify(S.DEFAULTS.vf))); }

window.FX = { attach, ensure, setChannels, get ctx() { return ctx; }, get out() { return nodes && nodes.boost; }, applyAudio, applyVideo, filterString, setPreset, resetVideo, BANDS, BAND_LABELS, EQ_PRESETS };
})();
