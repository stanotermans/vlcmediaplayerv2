// Persistent preferences + theme/accent handling. Exposes window.S
(() => {
const KEY = 'vlcx-settings';
const DEFAULTS = {
  // general
  onboarded: false, language: '', theme: 'dark', accent: '#f28c1b',
  confirmDialogs: true, autoUpdate: true, lastUpdateCheck: 0, skipVersion: '', devMode: false, logOn: false, logFile: '', logLevel: 'error',
  // interface
  uiScale: 100, keys: {}, startView: 'videos', audioLabel: false, audioBg: 'blur', audioBgDim: 65, coverSize: 40, ctl: { prevnext: true, play: true, time: true, volume: true, audio: true, subs: true, settings: true, library: true },
  navExpanded: false, autoHideSide: true, fitWindow: true, miniPlayer: true, seekPreview: true, showThumbs: true, hideCursorDelay: 2.5, dimWatched: true, showBadge: true,
  // privacy
  rememberRecent: true, resume: true,
  // playback
  speed: 1, jump: 10, repeat: 'off', shuffle: false, autoNext: true, volume: 0.8,
  // video
  aspect: '', forceTx: false, snapshotFormat: 'png', snapshotDir: '',
  vf: { hue: 0, brightness: 100, contrast: 100, saturate: 100, gamma: 1, sharpen: 0, grain: 0, negate: false, posterize: false, gray: false, sepia: 0,
        crop: { t: 0, b: 0, l: 0, r: 0 }, rotate: 0, zoom: 1, mirror: false },
  // audio
  eqOn: false, eqPreset: 'flat', eq: [12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  compOn: false, comp: { threshold: -11, knee: 5, ratio: 4, attack: 25, release: 100, makeup: 7 },
  reverbOn: false, reverb: { size: 8, width: 10, wet: 4, dry: 5, damp: 5 },
  widenOn: false, widen: { delay: 20, feedback: 0.2, crossfeed: 0.3, dry: 0.8 },
  gain: 100,
  // subtitles
  subAuto: true, subLang: '', lrcAuto: true, lyricsView: true, customFonts: [], subFont: 'Segoe UI', subSize: 100, subColor: '#ffffff', subOutline: '#0c0c0c', subBg: 60,
  // library
  mediaFolders: [],
  // network
  networkHistory: [],
  // performance
  txQuality: 'balanced', txMaxW: 1920, thumbs: true,
  // recording
  recDir: '', recAudio: true,
};
const clone = v => JSON.parse(JSON.stringify(v));
let data;
try { data = Object.assign(clone(DEFAULTS), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { data = clone(DEFAULTS); }
for (const k of ['vf', 'comp', 'reverb', 'widen', 'ctl']) data[k] = Object.assign(clone(DEFAULTS[k]), data[k]);
data.vf.crop = Object.assign({ t: 0, b: 0, l: 0, r: 0 }, data.vf.crop);

const listeners = [];
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }, 150); };

// get('vf.crop.t') style paths
function get(path) { return path.split('.').reduce((o, k) => o == null ? o : o[k], data); }
function set(path, value) {
  const keys = path.split('.'); let o = data;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
  save();
  listeners.forEach(fn => { try { fn(path, value); } catch (e) { console.error(e); } });
}
const on = fn => listeners.push(fn);
function reset(path) { set(path, clone(path.split('.').reduce((o, k) => o[k], DEFAULTS))); }

/* ---------- theme + accent ---------- */
const ACCENTS = ['#f28c1b', '#d4472f', '#b08f27', '#24a148', '#1f9bb5', '#2f62d6', '#8b3cf0', '#e0479e', '#b8b8b8'];
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = data.theme === 'system' ? (mq.matches ? 'dark' : 'light') : data.theme;
  const root = document.documentElement;
  root.dataset.theme = t;
  root.style.setProperty('--accent', data.accent);
  // readable text on the accent (light grey accent needs dark text)
  const n = parseInt(data.accent.slice(1), 16), lum = (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
  root.style.setProperty('--on-accent', lum > 0.6 ? '#111' : '#fff');
}
mq.addEventListener('change', applyTheme);
on(k => { if (k === 'theme' || k === 'accent') applyTheme(); });
applyTheme();

window.S = { get, set, on, reset, DEFAULTS, ACCENTS, applyTheme, all: () => data };
})();
