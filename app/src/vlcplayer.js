// The "VLC" playback engine (Settings → Playback → Engine). VlcVideo stands in for the page's <video> element:
// the same properties, methods and events, so the rest of the app works unchanged, while libVLC (through the
// preload's window.vlcEngine) does the playing and a canvas at the same spot shows the picture.
// Files libVLC is not set up for (DVDs: their plugins carry libdvdcss and are left out) play through the real
// <video> as before: playClassic() hands an item to it, and the events of whichever side plays are passed on.
(() => {
const MEDIA_EVENTS = ['play', 'playing', 'pause', 'ended', 'error', 'timeupdate', 'durationchange', 'loadedmetadata', 'canplay',
  'waiting', 'seeking', 'seeked', 'ratechange', 'volumechange', 'progress', 'emptied', 'loadstart', 'resize'];
const INPUT_EVENTS = /^(click|dblclick|contextmenu|wheel|mouse|pointer)/;
const ST = { idle: 0, opening: 1, buffering: 2, playing: 3, paused: 4, stopped: 5, ended: 6, error: 7 };

class VlcVideo extends EventTarget {
  constructor(el) {
    super();
    this.media = el;                                          // the real <video>: Classic items, audio effects
    this.isVlc = true;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'vlcView'; this.canvas.className = el.className;
    el.after(this.canvas);
    // passthrough (Settings → Audio): Dolby/DTS go to the receiver as they are; a libVLC start option
    this.version = window.vlcEngine.start('vlcView', S.get('passthrough') ? [navigator.userAgent.includes('Windows') ? '--mmdevice-passthrough=2' : '--spdif'] : []);   // Windows: WASAPI incl. HD formats; elsewhere VLC's S/PDIF option
    this.classic = false;                                     // true while an item plays through the <video>
    this._src = ''; this._rate = 1; this._volume = 1; this._muted = false;
    this._reset();
    for (const t of MEDIA_EVENTS) el.addEventListener(t, e => { if (this.classic) this.dispatchEvent(new Event(t)); });
    // video filters, zoom, rotate, aspect and crop are styles on the <video>; the canvas takes the same ones
    const copy = () => { for (const k of ['filter', 'transform', 'objectFit', 'objectViewBox']) this.canvas.style[k] = el.style[k]; };
    new MutationObserver(copy).observe(el, { attributes: true, attributeFilter: ['style'] }); copy();
    this._show();
    this._timer = setInterval(() => this._poll(), 100);
    S.on(k => {
      if (this.classic) return;
      if (k === 'gain') this._applyVolume();
      if (/^eq/.test(k)) this._applyEq();                            // VLC's equalizer changes live
      if (/^(comp|reverb|widen)/.test(k)) this._applyFx();            // VLC rebuilds its filters right away
      if (k === 'surround') window.vlcEngine.stereo(S.get('surround') === false);
      if (k === 'fastSeek') window.vlcEngine.fastSeek(S.get('fastSeek'));   // from the next file on
      if (k === 'audioDelay') window.vlcEngine.audioDelay(S.get('audioDelay'));
    });
    this._applyEq(); this._applyFx(); window.vlcEngine.stereo(S.get('surround') === false); window.vlcEngine.fastSeek(S.get('fastSeek')); window.vlcEngine.audioDelay(S.get('audioDelay'));
  }
  _reset() { this._st = { state: 0, time: 0, length: 0, width: 0, height: 0, frames: 0 }; this._meta = false; this._ended = false; this._seekTo = null; this._error = null; this._playAt = 0; this._clock = null; this._shown = 0; this._spuOff = false; this._title = null; this.dvdMenu = false; }
  // Audio settings → VLC. Equalizer: VLC's own 10 bands (the app's presets are VLC's). Compressor, spatial audio and
  // stereo widening: VLC's audio filters with the same settings (reverb's 0–10 sliders are VLC's 0–1).
  _applyEq() { window.vlcEngine.equalizer(S.get('eqOn') ? S.get('eq') : null); }
  _applyFx() {
    const f = [], o = [], c = S.get('comp'), r = S.get('reverb'), w = S.get('widen');
    if (S.get('compOn')) { f.push('compressor'); o.push(['compressor-threshold', 'f', c.threshold], ['compressor-ratio', 'f', c.ratio], ['compressor-knee', 'f', c.knee], ['compressor-attack', 'f', c.attack], ['compressor-release', 'f', c.release], ['compressor-makeup-gain', 'f', c.makeup]); }
    if (S.get('reverbOn')) { f.push('spatializer'); o.push(['spatializer-roomsize', 'f', r.size / 10], ['spatializer-width', 'f', r.width / 10], ['spatializer-wet', 'f', r.wet / 10], ['spatializer-dry', 'f', r.dry / 10], ['spatializer-damp', 'f', r.damp / 10]); }
    if (S.get('widenOn')) { f.push('stereo_widen'); o.push(['stereowiden-delay', 'f', w.delay], ['stereowiden-feedback', 'f', w.feedback], ['stereowiden-crossfeed', 'f', w.crossfeed], ['stereowiden-dry-mix', 'f', w.dry]); }
    window.vlcEngine.audioFx(f.join(':'), o);
  }
  _show() { this.media.style.visibility = this.classic ? '' : 'hidden'; this.canvas.style.display = this.classic ? 'none' : ''; }
  _fire(...types) { for (const t of types) this.dispatchEvent(new Event(t)); }
  // libVLC has no events here; its state is read 10× a second and turned into the usual media events
  _poll() {
    if (this.classic || !this._src) return;
    const prev = this._st, s = window.vlcEngine.state(), now = performance.now(); this._st = s;
    // A smooth clock for subtitles and the seek bar: it runs on by itself and follows libVLC's (coarse) time gently;
    // only a big difference (a seek, a stall) makes it jump
    if (s.state === ST.playing && !this._paused && this._seekTo == null) {
      if (!this._clock) this._clock = { t: s.time, at: now };
      else { const est = this._clock.t + (now - this._clock.at) * this._rate, diff = s.time - est; this._clock = { t: Math.abs(diff) > 700 ? s.time : est + diff * 0.15, at: now }; }
    } else this._clock = null;
    if (s.state !== prev.state) {
      if (s.state === ST.playing) {
        // the app draws subtitles itself (its own style, delay and size): libVLC must not burn embedded ones in
        // (on a DVD libVLC keeps them: its menus' buttons are subpictures too)
        if (!this._spuOff && !this.isDvd) { this._spuOff = true; if (this._imgSub != null) this.setImageSub(this._imgSub); else window.vlcEngine.noSpu(); }
        this._fire('playing');
      }
      if (s.state === ST.buffering || s.state === ST.opening) this._fire('waiting');
      if (s.state === ST.ended && !this._ended) { this._ended = true; this._fire('pause', 'ended'); }
      if (s.state === ST.error) { this._error = { code: 4, message: 'libVLC could not play this' }; this._fire('error'); }
    }
    if (s.length && s.length !== prev.length) this._fire('durationchange');
    // DVD: a menu (libVLC's title 0, or a title marked as menu) takes the arrow keys, Enter and clicks
    if (this.isDvd && s.title !== this._title && s.state === ST.playing) {
      this._title = s.title; const ts = window.vlcEngine.titles(), cur = ts[s.title];
      const menu = s.title === 0 || !!(cur && (cur.menu || cur.interactive));
      if (menu !== this.dvdMenu) { this.dvdMenu = menu; this._fire('dvdmenu'); }
      this._fire('dvdtitle');
    }
    // metadata: once the picture size is known, or for sound only once it has played a moment
    const video = s.width > 0, waited = s.state === ST.playing && Date.now() - this._playAt > 600;
    if (s.length && !this._meta && (video || waited)) { this._meta = true; this._fire('loadedmetadata', 'canplay'); }
    else if (this._meta && video && (s.width !== prev.width || s.height !== prev.height)) this._fire('resize', 'loadedmetadata');
    // a seek is done once libVLC's own time is there (until then currentTime reports the target); 4 s at most
    if (this._seekTo != null && (Math.abs(s.time - this._seekTo) < 600 || now - this._seekAt > 4000)) { this._seekTo = null; this._fire('seeked'); }
    if (s.state === ST.playing && s.time !== prev.time) this._fire('timeupdate');
  }

  // ---- the parts of HTMLMediaElement the app uses ----
  get src() { return this.classic ? this.media.src : this._src; }
  set src(v) { this.load(); this.vlcOpen(v); }
  getAttribute(k) { return k === 'src' ? this.src || null : this.media.getAttribute(k); }
  removeAttribute(k) { if (k === 'src') { this._src = ''; window.vlcEngine.stop(); this._reset(); this.media.removeAttribute('src'); } else this.media.removeAttribute(k); }
  load() { if (this.classic) this.media.load(); }
  // plays a path or URL with libVLC; startMs: begin there (resume); color: the media info's colour description
  vlcOpen(target, startMs = 0, color) {
    if (this.classic) { this.classic = false; this.media.pause(); this.media.removeAttribute('src'); this.media.load(); this._show(); }
    if ((target || '') !== this._src) { this._imgSub = null; this._spuMs = 0; }   // another file: no image subtitle chosen yet
    this._reset(); this._src = target || '';
    if (!target) return;
    const isUrl = /^[a-z][a-z0-9+.-]+:\/\//i.test(target);
    if (!isUrl && /^[a-z]:\//i.test(target)) target = target.replace(/\//g, '\\');   // libVLC wants C:\… (playlists may say C:/…)
    this._color = color; window.vlcEngine.open(target, isUrl, startMs, color);
    window.vlcEngine.rate(this._rate); this._applyVolume(); window.vlcEngine.mute(this._muted);
    this._playAt = Date.now(); this._paused = false;
    this._fire('emptied', 'loadstart', 'play');
  }
  // plays an item through the real <video> (DVDs; anything libVLC is not set up for)
  playClassic(url) {
    window.vlcEngine.stop(); this._src = ''; this._reset();
    this.classic = true; this._show();
    this.media.playbackRate = this._rate; this.media.volume = Math.min(1, this._volume); this.media.muted = this._muted;
    this.media.src = url;
  }
  play() {
    if (this.classic) return this.media.play();
    if (this._ended && this._src) { this.vlcOpen(this._src, 0, this._color); return Promise.resolve(); }   // play again after the end
    window.vlcEngine.play(); this._paused = false; this._fire('play'); return Promise.resolve();
  }
  pause() { if (this.classic) return this.media.pause(); window.vlcEngine.pause(); this._paused = true; this._fire('pause'); }
  get paused() { return this.classic ? this.media.paused : !this._src || this._paused || this._ended || this._st.state === ST.error; }
  get ended() { return this.classic ? this.media.ended : this._ended; }
  // libVLC's clock is read 10× a second; in between the time runs on, so subtitles and the seek bar move smoothly
  get currentTime() {
    if (this.classic) return this.media.currentTime;
    if (this._seekTo != null) return this._seekTo / 1000;
    const s = this._st;
    if (!this._clock) { this._shown = s.time; return s.time / 1000; }
    const v = Math.min(s.length || Infinity, this._clock.t + Math.min(400, (performance.now() - this._clock.at) * this._rate));
    if (v >= this._shown || this._shown - v > 700) this._shown = v;    // never a small step back while playing
    return this._shown / 1000;
  }
  set currentTime(t) {
    if (this.classic) { this.media.currentTime = t; return; }
    const ms = Math.max(0, t * 1000);
    if (this._ended) { this.vlcOpen(this._src, ms, this._color); return; }
    this._seekTo = ms; this._shown = ms; this._clock = null; this._seekAt = performance.now(); window.vlcEngine.seek(ms); this._fire('seeking', 'timeupdate');
  }
  get duration() { return this.classic ? this.media.duration : this._st.length ? this._st.length / 1000 : NaN; }
  get playbackRate() { return this.classic ? this.media.playbackRate : this._rate; }
  set playbackRate(r) { this._rate = r; if (this.classic) this.media.playbackRate = r; else { window.vlcEngine.rate(r); this._fire('ratechange'); } }
  get volume() { return this.classic ? this.media.volume : this._volume; }
  set volume(v) { this._volume = v; if (this.classic) this.media.volume = Math.min(1, v); else { this._applyVolume(); this._fire('volumechange'); } }
  // Volume boost (Settings → Audio, up to 200%) is libVLC's own volume above 100
  _applyVolume() { window.vlcEngine.volume(Math.min(200, this._volume * (S.get('gain') || 100))); }
  // audio track i (in the app's order) → libVLC's track id
  setAudioTrack(i) { const t = window.vlcEngine.audioTracks(), tr = t.list[i]; if (tr) window.vlcEngine.setAudioTrack(tr.id); return !!tr; }
  nextFrame() { window.vlcEngine.nextFrame(); this._paused = true; this._fire('pause'); }
  get muted() { return this.classic ? this.media.muted : this._muted; }
  set muted(b) { this._muted = !!b; if (this.classic) this.media.muted = b; else { window.vlcEngine.mute(b); this._fire('volumechange'); } }
  get videoWidth() { return this.classic ? this.media.videoWidth : Math.round(this._st.width * (this._st.sar || 1)); }   // shown width
  get videoHeight() { return this.classic ? this.media.videoHeight : this._st.height; }
  get readyState() { return this.classic ? this.media.readyState : this._meta ? 4 : 0; }
  get error() { return this.classic ? this.media.error : this._error; }
  get buffered() { return this.classic ? this.media.buffered : { length: 0, start: () => 0, end: () => 0 }; }
  get seeking() { return this.classic ? this.media.seeking : this._seekTo != null; }
  // VLC's Record: libVLC saves what plays, unchanged (picture, sound, subtitles), into dir; false if it could not
  record(on, dir) { return !this.classic && !!window.vlcEngine.record(on, dir); }
  // ---- image subtitles (PGS, VobSub, DVB): libVLC draws them into the picture, like VLC ----
  // k: the file's k-th subtitle track (stream order), -1 = none. False when libVLC does not know that track (yet).
  setImageSub(k) {
    if (this.classic) return false;
    if (k < 0) { this._imgSub = null; window.vlcEngine.setSpu(-1); return true; }
    const id = window.vlcEngine.spuTracks()[k];
    this._imgSub = k;
    if (id == null) return this._st.state !== ST.playing;     // not playing yet: chosen when it starts
    window.vlcEngine.setSpu(id); window.vlcEngine.spuDelay(this._spuMs || 0); return true;
  }
  // the app's subtitle delay (s; later is positive, like VLC) also moves image subtitles
  set subDelay(s) { const ms = Math.round((s || 0) * 1000); if (ms !== this._spuMs) { this._spuMs = ms; if (!this.classic && this._imgSub != null) window.vlcEngine.spuDelay(ms); } }
  // ---- DVD menus (VLC engine) ----
  get isDvd() { return !this.classic && /^dvd:/i.test(this._src || ''); }
  dvdNavigate(key) { const m = { Enter: 0, ArrowUp: 1, ArrowDown: 2, ArrowLeft: 3, ArrowRight: 4 }[key]; if (m == null) return false; window.vlcEngine.navigate(m); return true; }
  dvdMenuShow() { window.vlcEngine.menu(); }
  dvdTitle() { return this._title; }
  // a point on screen → the video's own pixels (the canvas is scaled with object-fit like the <video>)
  dvdMouse(clientX, clientY, click) {
    const c = this.canvas, r = c.getBoundingClientRect(), W = this._st.width, H = this._st.height;
    if (!W || !H || !r.width) return false;
    const fit = getComputedStyle(c).objectFit, cw = c.width, ch = c.height;
    let w = r.width, h = r.height;
    if (fit === 'contain' || fit === 'cover') { const k = (fit === 'contain' ? Math.min : Math.max)(r.width / cw, r.height / ch); w = cw * k; h = ch * k; }
    const x = (clientX - r.left - (r.width - w) / 2) / w * W, y = (clientY - r.top - (r.height - h) / 2) / h * H;
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    window.vlcEngine.mouse(x, y, click); return true;
  }
  get drawable() { return this.classic ? this.media : this.canvas; }                    // for drawImage (mini player, snapshot)
  get style() { return this.media.style; }
  get parentElement() { return this.media.parentElement; }
  getBoundingClientRect() { return (this.classic ? this.media : this.canvas).getBoundingClientRect(); }
  captureStream() { return this.classic ? this.media.captureStream() : this.canvas.captureStream(); }   // picture only for now
  // Picture-in-picture: the canvas as a live stream in a hidden <video>, which goes into the PiP window.
  // Play/pause in that window control libVLC; the sound keeps coming from libVLC.
  async requestPictureInPicture() {
    if (this.classic) return this.media.requestPictureInPicture();
    if (!this._pip) {
      const v = this._pip = document.createElement('video');
      v.muted = true; v.playsInline = true;
      Object.assign(v.style, { position: 'fixed', left: '-10px', top: '-10px', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
      document.body.append(v);
      v.addEventListener('pause', () => { if (document.pictureInPictureElement === v && !this.paused) this.pause(); });
      v.addEventListener('play', () => { if (document.pictureInPictureElement === v && this.paused) this.play(); });
      v.addEventListener('leavepictureinpicture', () => { v.pause(); v.srcObject = null; });
      this.addEventListener('pause', () => { if (!v.paused) v.pause(); });
      this.addEventListener('play', () => { if (v.srcObject && v.paused) v.play().catch(() => {}); });
    }
    this._pip.srcObject = this.canvas.captureStream();
    await this._pip.play();
    return this._pip.requestPictureInPicture();
  }
  addEventListener(type, fn, opt) {
    if (INPUT_EVENTS.test(type)) { this.media.addEventListener(type, fn, opt); this.canvas.addEventListener(type, fn, opt); }
    else super.addEventListener(type, fn, opt);
  }
}
VlcVideo.available = () => !!(window.vlcEngine && window.vlcEngine.available());
window.VlcVideo = VlcVideo;
})();
