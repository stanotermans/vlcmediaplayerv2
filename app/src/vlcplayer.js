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
    this.version = window.vlcEngine.start('vlcView');
    this.classic = false;                                     // true while an item plays through the <video>
    this._src = ''; this._rate = 1; this._volume = 1; this._muted = false;
    this._reset();
    for (const t of MEDIA_EVENTS) el.addEventListener(t, e => { if (this.classic) this.dispatchEvent(new Event(t)); });
    // video filters, zoom, rotate, aspect and crop are styles on the <video>; the canvas takes the same ones
    const copy = () => { for (const k of ['filter', 'transform', 'objectFit', 'objectViewBox']) this.canvas.style[k] = el.style[k]; };
    new MutationObserver(copy).observe(el, { attributes: true, attributeFilter: ['style'] }); copy();
    this._show();
    this._timer = setInterval(() => this._poll(), 100);
  }
  _reset() { this._st = { state: 0, time: 0, length: 0, width: 0, height: 0, frames: 0 }; this._meta = false; this._ended = false; this._seekTo = null; this._error = null; this._playAt = 0; }
  _show() { this.media.style.visibility = this.classic ? '' : 'hidden'; this.canvas.style.display = this.classic ? 'none' : ''; }
  _fire(...types) { for (const t of types) this.dispatchEvent(new Event(t)); }
  // libVLC has no events here; its state is read 10× a second and turned into the usual media events
  _poll() {
    if (this.classic || !this._src) return;
    const prev = this._st, s = window.vlcEngine.state(); this._st = s;
    if (s.state !== prev.state) {
      if (s.state === ST.playing) this._fire('playing');
      if (s.state === ST.buffering || s.state === ST.opening) this._fire('waiting');
      if (s.state === ST.ended && !this._ended) { this._ended = true; this._fire('pause', 'ended'); }
      if (s.state === ST.error) { this._error = { code: 4, message: 'libVLC could not play this' }; this._fire('error'); }
    }
    if (s.length && s.length !== prev.length) this._fire('durationchange');
    // metadata: once the picture size is known, or for sound only once it has played a moment
    const video = s.width > 0, waited = s.state === ST.playing && Date.now() - this._playAt > 600;
    if (s.length && !this._meta && (video || waited)) { this._meta = true; this._fire('loadedmetadata', 'canplay'); }
    else if (this._meta && video && (s.width !== prev.width || s.height !== prev.height)) this._fire('resize', 'loadedmetadata');
    if (this._seekTo != null && (Math.abs(s.time - this._seekTo) < 1500 || s.frames > this._seekFrames + 1)) { this._seekTo = null; this._fire('seeked'); }
    if (s.state === ST.playing && s.time !== prev.time) this._fire('timeupdate');
  }

  // ---- the parts of HTMLMediaElement the app uses ----
  get src() { return this.classic ? this.media.src : this._src; }
  set src(v) { this.load(); this.vlcOpen(v); }
  getAttribute(k) { return k === 'src' ? this.src || null : this.media.getAttribute(k); }
  removeAttribute(k) { if (k === 'src') { this._src = ''; window.vlcEngine.stop(); this._reset(); this.media.removeAttribute('src'); } else this.media.removeAttribute(k); }
  load() { if (this.classic) this.media.load(); }
  // plays a path or URL with libVLC; startMs: begin there (resume)
  vlcOpen(target, startMs = 0) {
    if (this.classic) { this.classic = false; this.media.pause(); this.media.removeAttribute('src'); this.media.load(); this._show(); }
    this._reset(); this._src = target || '';
    if (!target) return;
    const isUrl = /^[a-z][a-z0-9+.-]+:\/\//i.test(target);
    window.vlcEngine.open(target, isUrl, startMs);
    window.vlcEngine.rate(this._rate); window.vlcEngine.volume(this._volume * 100); window.vlcEngine.mute(this._muted);
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
    if (this._ended && this._src) { this.vlcOpen(this._src); return Promise.resolve(); }   // play again after the end
    window.vlcEngine.play(); this._paused = false; this._fire('play'); return Promise.resolve();
  }
  pause() { if (this.classic) return this.media.pause(); window.vlcEngine.pause(); this._paused = true; this._fire('pause'); }
  get paused() { return this.classic ? this.media.paused : !this._src || this._paused || this._ended || this._st.state === ST.error; }
  get ended() { return this.classic ? this.media.ended : this._ended; }
  get currentTime() { return this.classic ? this.media.currentTime : this._seekTo != null ? this._seekTo / 1000 : this._st.time / 1000; }
  set currentTime(t) {
    if (this.classic) { this.media.currentTime = t; return; }
    const ms = Math.max(0, t * 1000);
    if (this._ended) { this.vlcOpen(this._src, ms); return; }
    this._seekTo = ms; this._seekFrames = this._st.frames; window.vlcEngine.seek(ms); this._fire('seeking', 'timeupdate');
  }
  get duration() { return this.classic ? this.media.duration : this._st.length ? this._st.length / 1000 : NaN; }
  get playbackRate() { return this.classic ? this.media.playbackRate : this._rate; }
  set playbackRate(r) { this._rate = r; if (this.classic) this.media.playbackRate = r; else { window.vlcEngine.rate(r); this._fire('ratechange'); } }
  get volume() { return this.classic ? this.media.volume : this._volume; }
  set volume(v) { this._volume = v; if (this.classic) this.media.volume = Math.min(1, v); else { window.vlcEngine.volume(v * 100); this._fire('volumechange'); } }
  get muted() { return this.classic ? this.media.muted : this._muted; }
  set muted(b) { this._muted = !!b; if (this.classic) this.media.muted = b; else { window.vlcEngine.mute(b); this._fire('volumechange'); } }
  get videoWidth() { return this.classic ? this.media.videoWidth : this._st.width; }
  get videoHeight() { return this.classic ? this.media.videoHeight : this._st.height; }
  get readyState() { return this.classic ? this.media.readyState : this._meta ? 4 : 0; }
  get error() { return this.classic ? this.media.error : this._error; }
  get buffered() { return this.classic ? this.media.buffered : { length: 0, start: () => 0, end: () => 0 }; }
  get seeking() { return this.classic ? this.media.seeking : this._seekTo != null; }
  get drawable() { return this.classic ? this.media : this.canvas; }                    // for drawImage (mini player, snapshot)
  get style() { return this.media.style; }
  get parentElement() { return this.media.parentElement; }
  getBoundingClientRect() { return (this.classic ? this.media : this.canvas).getBoundingClientRect(); }
  captureStream() { return this.classic ? this.media.captureStream() : this.canvas.captureStream(); }   // picture only for now
  requestPictureInPicture() { return this.classic ? this.media.requestPictureInPicture() : Promise.reject(new Error('Picture-in-picture comes later for the VLC engine')); }
  addEventListener(type, fn, opt) {
    if (INPUT_EVENTS.test(type)) { this.media.addEventListener(type, fn, opt); this.canvas.addEventListener(type, fn, opt); }
    else super.addEventListener(type, fn, opt);
  }
}
VlcVideo.available = () => !!(window.vlcEngine && window.vlcEngine.available());
window.VlcVideo = VlcVideo;
})();
