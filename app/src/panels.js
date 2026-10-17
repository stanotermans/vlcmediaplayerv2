// Quick settings panel (in the player), Global Settings dialog and the other dialogs. Exposes window.Panels
(() => {
const { el, icon, toggle, select, segmented, swatches, slider, color, textInput, row, collapse, button, dialog } = UI;
const sec = (title, ...rows) => el('section.psec', {}, title ? el('h4', {}, t(title)) : null, ...rows);
const f1 = v => (+v).toFixed(1), f2 = v => (+v).toFixed(2), f3 = v => (+v).toFixed(3);
const px = v => `${v} px`;

const SHORTCUTS = [
  ['Play / pause', ['Space']], ['Fullscreen', ['F']], ['Seek backward / forward', ['←', '→']], ['Volume up / down', ['↑', '↓']],
  ['Previous / next', ['<', '>']], ['Show / hide queue', ['Q']], ['Previous / next frame', [',', '.']], ['Library / player', ['L']],
  ['Cycle subtitle track', ['V']], ['Snapshot', ['SHIFT', 'S']], ['Cycle audio track', ['B']], ['Record', ['SHIFT', 'R']],
  ['Stop', ['S']], ['Mute', ['M']], ['Hide interface', ['Ctrl', '\\']], ['Slower / faster / normal', ['[', ']', '=']],
  ['Subtitle delay − / +', ['G', 'H']], ['Seek 3 seconds', ['SHIFT', '← →']], ['Jump to 0–90%', ['0 – 9']], ['Open files', ['Ctrl', 'O']],
  ['Open folder', ['Ctrl', 'F']], ['Open network stream', ['Ctrl', 'N']], ['Media information', ['Ctrl', 'I']], ['Settings', ['Ctrl', 'P']],
  ['Show lyrics', ['Y']],   ['Interface size', ['Ctrl', '+ − 0']], ['Keyboard shortcuts', ['F1']], ['Quit VLC', ['Ctrl', 'Q']],
];
const keycaps = keys => el('span.keys', {}, ...keys.map((k, i) => [i && keys.length === 2 && !['SHIFT', 'Ctrl'].includes(keys[0]) ? el('span.kslash', {}, '/') : null, el('kbd.cap', {}, t(k))]));

const VIDEO_PRESETS = {
  '': ['Default', {}],
  vivid: ['Vivid', { brightness: 105, contrast: 115, saturate: 160, gamma: 1, sepia: 0, gray: false }],
  cinema: ['Cinema', { brightness: 95, contrast: 120, saturate: 85, gamma: 1.1, sepia: 0, gray: false }],
  bw: ['Black & white', { brightness: 100, contrast: 115, saturate: 0, gray: true, sepia: 0 }],
  warm: ['Warm', { brightness: 103, contrast: 105, saturate: 115, hue: -10, sepia: 15, gray: false }],
  vintage: ['Vintage', { brightness: 98, contrast: 90, saturate: 70, sepia: 45, grain: 4, gray: false }],
};
function applyVideoPreset(k) {
  const base = JSON.parse(JSON.stringify(S.DEFAULTS.vf)), cur = S.get('vf');
  const keep = { crop: cur.crop, rotate: cur.rotate, zoom: cur.zoom, mirror: cur.mirror };
  S.set('vf', Object.assign(base, VIDEO_PRESETS[k][1], keep));
}

/* ---------- reusable blocks ---------- */
function eqBlock(vertical) {
  const sliders = [slider({ label: 'Preamp', min: -8, max: 20, step: 0.1, binding: 'eq.0', fmt: v => f1(v) + ' dB', box: !vertical, vertical })]
    .concat(FX.BAND_LABELS.map((l, i) => slider({ label: l, min: -20, max: 20, step: 0.1, binding: `eq.${i + 1}`, fmt: v => f1(v) + ' dB', box: !vertical, vertical })));
  sliders.forEach(s => s.addEventListener('input', () => { if (S.get('eqPreset') !== 'custom') S.set('eqPreset', 'custom'); if (!S.get('eqOn')) S.set('eqOn', true); }));
  return vertical ? el('div.eqv', {}, sliders) : el('div', {}, sliders);
}
const presetOpts = () => [...Object.entries(FX.EQ_PRESETS).map(([k, v]) => [k, v[0]]), ['custom', 'Custom']];
const eqPresetSelect = () => select(presetOpts, 'eqPreset', v => { if (v !== 'custom') { FX.setPreset(v); S.set('eqOn', true); } });
const compBlock = () => [
  slider({ label: 'Threshold', min: -60, max: 0, step: 0.5, binding: 'comp.threshold', fmt: v => f1(v) + ' dB' }),
  slider({ label: 'Ratio', min: 1, max: 20, step: 0.5, binding: 'comp.ratio', fmt: v => f1(v) + ' : 1' }),
  slider({ label: 'Knee', min: 0, max: 40, step: 0.5, binding: 'comp.knee', fmt: v => f1(v) + ' dB' }),
  slider({ label: 'Attack', min: 1, max: 500, step: 1, binding: 'comp.attack', fmt: v => f1(v) + ' ms' }),
  slider({ label: 'Release', min: 10, max: 1000, step: 5, binding: 'comp.release', fmt: v => f1(v) + ' ms' }),
  slider({ label: 'Make-up gain', min: 0, max: 24, step: 0.5, binding: 'comp.makeup', fmt: v => f1(v) + ' dB' }),
];
const reverbBlock = () => ['size:Size', 'width:Width', 'wet:Wet', 'dry:Dry', 'damp:Damp'].map(s => { const [k, l] = s.split(':'); return slider({ label: l, min: 0, max: 10, step: 0.1, binding: 'reverb.' + k, fmt: f1, ticks: 10 }); });
const widenBlock = () => [
  slider({ label: 'Delay', min: 1, max: 100, step: 1, binding: 'widen.delay', fmt: v => f1(v) + ' ms' }),
  slider({ label: 'Feedback', min: 0, max: 0.9, step: 0.01, binding: 'widen.feedback', fmt: v => f1(v * 100) + ' %', ticks: 8 }),
  slider({ label: 'Crossfeed', min: 0, max: 0.8, step: 0.01, binding: 'widen.crossfeed', fmt: v => f1(v * 100) + ' %', ticks: 8 }),
  slider({ label: 'Dry mix', min: 0, max: 1, step: 0.01, binding: 'widen.dry', fmt: v => f1(v * 100) + ' %', ticks: 8 }),
];
function cropBlock() {
  let linkV = false, linkH = false;
  const field = (lbl, k, pair, getLink) => {
    const i = el('input.cropin', { type: 'number', min: 0, max: 2000 });
    const draw = () => { if (document.activeElement !== i) i.value = S.get('vf.crop.' + k); };
    i.addEventListener('change', () => { const v = Math.max(0, +i.value || 0); S.set('vf.crop.' + k, v); if (getLink()) S.set('vf.crop.' + pair, v); });
    S.on(p => { if (p.startsWith('vf')) draw(); }); draw();
    return el('label.cropf', {}, el('span', {}, lbl), i, el('span.unit', {}, 'px'));
  };
  const link = (get, set) => { const b = el('button.ibtn.link', { type: 'button', html: icon('link'), title: t('Link') }); b.onclick = () => { set(!get()); b.classList.toggle('on', get()); }; return b; };
  return el('div.cropgrid', {},
    field('Top', 't', 'b', () => linkV), field('Bottom', 'b', 't', () => linkV), link(() => linkV, v => linkV = v),
    field('Left', 'l', 'r', () => linkH), field('Right', 'r', 'l', () => linkH), link(() => linkH, v => linkH = v));
}

/* ---------- quick panel ---------- */
function quickPanel(App) {
  const panel = UI.$('#settings');
  const tabs = [['playback', 'Playback', 'playback'], ['video', 'Video', 'video'], ['audio', 'Audio', 'audio'], ['subs', 'Subtitles', 'subtitle']];
  const head = el('div.qtabs', {}, tabs.map(([k, l, ic]) => el('button.qtab', { type: 'button', dataset: { tab: k }, html: icon(ic) + `<span data-i18n="${l}">${t(l)}</span>`, onclick: () => show(k) })));
  const body = el('div.qbody');
  const presetBox = el('div.qpreset');
  const foot = el('div.qfoot', {}, presetBox, el('button.qadv', { type: 'button', html: icon('settings') + `<span data-i18n="Open advanced settings">${t('Open advanced settings')}</span>`, onclick: () => { hide(); openSettings(App, current === 'subs' ? 'subtitles' : current); } }));
  panel.replaceChildren(head, body, foot);
  let current = 'playback';
  const build = {
    playback: () => [sec('Defaults',
      slider({ label: 'Speed', min: 0.25, max: 4, step: 0.05, binding: { get: () => App.video.playbackRate, set: v => App.video.playbackRate = v, path: '_rate' }, fmt: v => f2(v) + '×', box: true }),
      row('Repeat', select([['off', 'Off'], ['one', 'Current'], ['all', 'All']], 'repeat')),
      row('Shuffle', toggle('shuffle')),
      row('Autoplay next item', toggle('autoNext')),
      row('Skip interval', select([[5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min']], 'jump')),
      row('Resume where you left off', toggle('resume'))),
      sec('Decoding', row('Always convert with ffmpeg', toggle('forceTx', () => App.reloadSource()), { info: 'Use this if video or audio stutters or is missing.' })),
    ],
    video: () => [sec('Picture',
      row('Aspect ratio', select([['', 'Default'], ['fill', 'Fill (crop)'], ['stretch', 'Stretch']], 'aspect')),
      row('Rotate', select([[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']], 'vf.rotate')),
      row('Zoom', select([[1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']], 'vf.zoom')),
      row('Mirror', toggle('vf.mirror')),
      row('Crop', el('span')), cropBlock()),
      sec('Filters',
        slider({ label: 'Brightness', min: 0, max: 200, binding: 'vf.brightness', fmt: v => v + '%' }),
        slider({ label: 'Contrast', min: 0, max: 200, binding: 'vf.contrast', fmt: v => v + '%' }),
        slider({ label: 'Saturation', min: 0, max: 300, binding: 'vf.saturate', fmt: v => v + '%', ticks: 2 }),
        collapse([
          slider({ label: 'Hue', min: -180, max: 180, binding: 'vf.hue', fmt: v => v + '°', center: true }),
          slider({ label: 'Gamma', min: 0.1, max: 3, step: 0.01, binding: 'vf.gamma', fmt: f2, ticks: 9 }),
          slider({ label: 'Sharpen', min: 0, max: 2, step: 0.05, binding: 'vf.sharpen', fmt: f2, ticks: 4 }),
          slider({ label: 'Film grain', min: 0, max: 10, step: 0.5, binding: 'vf.grain', fmt: f1, ticks: 10 }),
        ]),
        collapse([
          row('Negative', toggle('vf.negate')), row('Posterize', toggle('vf.posterize')), row('Grayscale', toggle('vf.gray')),
          slider({ label: 'Sepia intensity', min: 0, max: 100, binding: 'vf.sepia', fmt: v => v + '%', ticks: 2 }),
        ], { offLabel: 'Color effects', onLabel: 'Collapse color effects' })),
    ],
    audio: () => [sec('Defaults',
      row('Audio track', select(() => App.audioTracks(), { get: () => App.audioTrack(), set: v => App.setAudioTrack(+v), path: '_atrack' })),
      slider({ label: 'Volume boost', min: 0, max: 200, binding: 'gain', fmt: v => v + '%', ticks: 2 })),
      sec('Equalizer', row('Equalizer', toggle('eqOn')), row('Preset', eqPresetSelect()), collapse(eqBlock(false))),
      sec('Effects',
        row('Compressor', toggle('compOn')), collapse(compBlock()),
        row('Spatial audio (reverb)', toggle('reverbOn')), collapse(reverbBlock()),
        row('Stereo widening', toggle('widenOn')), collapse(widenBlock())),
    ],
    subs: () => [sec('Defaults',
      row('Subtitle track', select(() => App.subTracks(), { get: () => App.subActive(), set: v => App.selectSub(+v), path: '_strack' })),
      row('Preferred language', textInput('subLang', 'e.g. en, nl')),
      row('Load file', button('.srt / .ass / .vtt…', () => App.loadSubFile()))),
      sec('Synchronization',
        slider({ label: 'Subtitle delay', min: -10, max: 10, step: 0.05, binding: { get: () => App.sub.delay, set: v => App.sub.delay = v, path: '_subdelay' }, fmt: v => f3(v) + ' s', box: true, center: true }),
        el('div.scale', {}, el('span', {}, '−10 s'), el('span', {}, '0 s'), el('span', {}, '+10 s')),
        slider({ label: 'Subtitle speed', min: 0.5, max: 2, step: 0.001, binding: { get: () => App.sub.speed, set: v => App.sub.speed = v, path: '_subspeed' }, fmt: f3, box: true }),
        slider({ label: 'Duration factor', min: 0, max: 5, step: 0.05, binding: { get: () => App.sub.dur, set: v => App.sub.dur = v, path: '_subdur' }, fmt: v => f3(v) + ' s', box: true })),
      sec('Appearance',
        row('Font', fontSelect()),
        slider({ label: 'Size', min: 50, max: 250, binding: 'subSize', fmt: v => v + '%' }),
        row('Text color', color('subColor')), row('Outline color', color('subOutline')),
        slider({ label: 'Background', min: 0, max: 100, binding: 'subBg', fmt: v => v + '%' })),
    ],
  };
  const presets = {
    playback: null,
    video: () => row('Preset', select(Object.entries(VIDEO_PRESETS).map(([k, v]) => [k, v[0]]), { get: () => panel._vp || '', set: v => { panel._vp = v; applyVideoPreset(v); }, path: '_vp' })),
    audio: () => row('Preset', eqPresetSelect()),
    subs: () => row('Preset', select([['', 'Default'], ['big', 'Large and yellow'], ['cinema', 'Cinema'], ['clean', 'No background']], { get: () => panel._sp || '', set: v => { panel._sp = v; subPreset(v); }, path: '_sp' })),
  };
  function show(tab) {
    current = tab; panel.dataset.tab = tab;
    UI.$$('.qtab', head).forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    body.replaceChildren(...build[tab]());
    presetBox.replaceChildren(presets[tab] ? presets[tab]() : el('span'));
    body.scrollTop = 0;
  }
  function hide() { panel.classList.remove('show'); }
  function toggleTab(tab) {
    if (panel.classList.contains('show') && (!tab || tab === current)) return hide();
    panel.classList.add('show'); show(tab || current);
  }
  show('playback');
  return { toggle: toggleTab, hide, refresh: () => panel.classList.contains('show') && show(current) };
}
/* ---------- subtitle fonts: your own font files, a few defaults and every font installed on the system ---------- */
const FONTS = ['Segoe UI', 'Inter', 'Arial', 'Verdana', 'Tahoma', 'Georgia', 'Trebuchet MS', 'Consolas', 'Comic Sans MS'];
let systemFonts = [];
function loadSystemFonts() {
  return loadSystemFonts.p || (loadSystemFonts.p = (async () => {
    try { if (window.queryLocalFonts) systemFonts = [...new Set((await queryLocalFonts()).map(f => f.family))].sort((a, b) => a.localeCompare(b)); } catch {}
  })());
}
function fontOptions() {
  const seen = new Set(), out = [];
  const add = n => { if (n && !seen.has(n)) { seen.add(n); out.push([n, n]); } };
  S.get('customFonts').forEach(f => add(f.name)); FONTS.forEach(add); systemFonts.forEach(add); add(S.get('subFont'));
  return out;
}
function fontSelect() { const s = select(fontOptions, 'subFont'); loadSystemFonts().then(() => s.isConnected && s.refresh()); return s; }
// Font files the user added live in userData/fonts and are registered with the page at startup.
async function loadCustomFont(f) {
  try { const buf = await api.readFont(f.file); if (!buf) return false; const face = new FontFace(f.name, buf); await face.load(); document.fonts.add(face); return true; } catch { return false; }
}
S.get('customFonts').forEach(loadCustomFont);
async function addFontFiles() {
  const added = await api.addFonts(), ok = [];
  for (const f of added) { if (await loadCustomFont(f)) ok.push(f); else { api.removeFont(f.file); window.App?.osd(t('Not a valid font file: {name}', { name: f.name })); } }
  if (!ok.length) return;
  S.set('customFonts', [...S.get('customFonts'), ...ok]);
  S.set('subFont', ok[0].name);
}
function removeFontFile(f) {
  S.set('customFonts', S.get('customFonts').filter(x => x.file !== f.file));
  api.removeFont(f.file);
  if (S.get('subFont') === f.name) S.set('subFont', 'Segoe UI');
}
function customFontList() {
  const list = el('div.folderlist');
  const draw = () => {
    const fs = S.get('customFonts');
    list.replaceChildren(...(fs.length ? fs.map(f => el('div.folderitem', {}, el('span', { html: icon('subtitle') }), el('span.fp', { title: f.file, style: { fontFamily: `"${f.name}"` } }, f.name),
      el('button.ibtn', { type: 'button', title: t('Remove'), html: icon('trash'), onclick: () => removeFontFile(f) })))
      : [el('p.note', {}, t('Add .ttf, .otf or .woff files to use them for subtitles. They are copied into the app, so you can delete the originals.'))]));
  };
  S.on(k => k === 'customFonts' && list.isConnected && draw()); draw();
  return list;
}
function subPreset(k) {
  const P = { '': ['Segoe UI', 100, '#ffffff', '#0c0c0c', 60], big: ['Segoe UI', 150, '#ffe14d', '#000000', 0], cinema: ['Georgia', 115, '#f0f0f0', '#000000', 0], clean: ['Arial', 100, '#ffffff', '#000000', 0] }[k];
  if (!P) return;
  ['subFont', 'subSize', 'subColor', 'subOutline', 'subBg'].forEach((key, i) => S.set(key, P[i]));
}

/* ---------- Global Settings dialog ---------- */
const CATS = [
  ['App'], ['general', 'General', 'general'], ['interface', 'Interface', 'pointer'], ['privacy', 'Privacy', 'shield'], ['controls', 'Controls', 'keyboard'],
  ['Media'], ['playback', 'Playback', 'play'], ['video', 'Video', 'video'], ['audio', 'Audio', 'audio'], ['subtitles', 'Subtitles', 'subtitle'], ['library', 'Library', 'library'],
  ['System'], ['network', 'Network', 'network'], ['performance', 'Performance', 'general'], ['recording', 'Recording', 'record'], ['extensions', 'Extensions', 'puzzle'],
];
const TITLES = { about: 'About', general: 'Global settings', interface: 'Interface', privacy: 'Privacy', controls: 'Controls', playback: 'Playback', video: 'Video', audio: 'Audio defaults', subtitles: 'Subtitles', library: 'Library', network: 'Network', performance: 'Performance', recording: 'Recording', extensions: 'Extensions' };

function pages(App) {
  const P = App.paths;
  const folderRow = (label, key, fallback) => {
    const inp = el('input.txt.path', { readonly: true });
    const draw = () => inp.value = S.get(key) || fallback;
    S.on(k => k === key && draw()); draw();
    return row(label, el('div.pathrow', {}, inp, button('Browse', async () => { const f = await api.chooseFolder(t(label)); if (f) S.set(key, f); }, 'ghost'), button('Open', () => api.openPath(S.get(key) || fallback), 'ghost')));
  };
  return {
    general: () => [
      sec('Appearance',
        row('Interface language', select(I18N.LANGS, { get: () => I18N.lang(), set: v => I18N.set(v), path: 'language' })),
        row('Theme', segmented([['dark', 'Dark'], ['light', 'Light'], ['system', 'System']], 'theme')),
        slider({ label: 'Interface size', min: 75, max: 150, step: 5, binding: 'uiScale', fmt: v => v + '%', ticks: 2 }),
        row('Accent color', swatches(S.ACCENTS, 'accent'))),
      sec('Startup',
        row('Show confirmation and error dialogs', toggle('confirmDialogs'), { info: 'Ask for confirmation before deleting or clearing.' }),
        row('Check for updates automatically', toggle('autoUpdate')),
        row('Show welcome screen again', button('Start onboarding', () => { UI.$('.dlg-layer')?.querySelector('.dlg')?._close(null); App.showOnboarding(); }, 'ghost'))),
      sec('Diagnostics',
        row('Developer mode', toggle('devMode', v => api.devtools(v)), { info: 'Opens the developer tools.' }),
        row('Save a log', toggle('logOn', () => App.applyLog()), { info: 'Write ffmpeg and playback messages to a file.' }),
        (() => { const inp = el('input.txt.path', { readonly: true }); const d = () => inp.value = S.get('logFile') || P.log; S.on(k => k === 'logFile' && d()); d();
          return row('Log file', el('div.pathrow', {}, inp, button('Browse', async () => { const f = await api.saveLogAs(); if (f) { S.set('logFile', f); App.applyLog(); } }, 'ghost'))); })(),
        row('Log details', select([['error', 'Errors only'], ['info', 'All']], 'logLevel', () => App.applyLog()))),
    ],
    interface: () => [
      sec('Layout',
        row('Sidebar with labels', toggle('navExpanded')),
        row('Call the music section "Audio"', toggle('audioLabel')),
        (() => {                                                     // stored by the main process: applies when the window is created
          const info = App.appInfo || {};
          if (info.platform === 'win32') return row('Rounded window corners', el('span.note', {}, t('Set by Windows')), { info: 'Windows 11 rounds window corners automatically.' });
          let on = !!info.roundedCorners;
          return row('Rounded window corners', toggle({ get: () => on, set: async v => { on = v; info.roundedCorners = v; if (await api.setWindowPref('roundedCorners', v)) App.osd('Restart the app to apply this'); }, path: '_rounded' }), { info: 'Takes effect after restarting the app.' });
        })(),
        row('Hide sidebar while media plays', toggle('autoHideSide'), { info: 'Gives videos and music the full width. The sidebar button (Q) brings it back.' }),
        row('Resize window to the video', toggle('fitWindow'), { info: "Matches the window to the video's shape when a new video starts, up to 70% of the screen." }),
        row('Show mini player while browsing', toggle('miniPlayer')),
        row('Show preview when hovering the timeline', toggle('seekPreview')),
        row('Show thumbnails', toggle('showThumbs')),
        row('Dim watched items', toggle('dimWatched')),
        row('Show ffmpeg label in player', toggle('showBadge'))),
      sec('Music player',
        row('Background', segmented([['blur', 'Blur'], ['gradient', 'Gradient'], ['black', 'Black'], ['stage', 'Default']], 'audioBg'), { info: 'Blur and gradient use the colors of the album cover.' }),
        slider({ label: 'Background dimming', min: 0, max: 90, step: 5, binding: 'audioBgDim', fmt: v => v + '%' }),
        slider({ label: 'Cover size', min: 15, max: 100, step: 5, binding: 'coverSize', fmt: v => v + '%' }),
        el('p.note', {}, t('Press Y or use the button in the corner of the player to switch between the cover and the lyrics.'))),
      sec('Player controls',
        row('Previous / next', toggle('ctl.prevnext')), row('Play / pause', toggle('ctl.play')),
        row('Time', toggle('ctl.time')), row('Volume', toggle('ctl.volume')),
        row('Audio', toggle('ctl.audio')), row('Subtitles', toggle('ctl.subs')),
        row('Settings', toggle('ctl.settings')), row('Library / player', toggle('ctl.library')),
        el('p.note', {}, t('Hidden controls still work with the keyboard. Press F1 for all shortcuts.'))),
      sec('Fullscreen',
        slider({ label: 'Hide cursor and controls after', min: 1, max: 10, step: 0.5, binding: 'hideCursorDelay', fmt: v => f1(v) + ' s' })),
    ],
    privacy: () => [
      sec('History',
        row('Remember recently played', toggle('rememberRecent'), { info: 'When off, nothing you played is kept after a restart: no recent list, no watched marks and no files you only opened.' }),
        row('Remember playback position', toggle('resume')),
        row('Clear recent items', button('Clear', async () => { if (await UI.confirm('Clear recent?', 'The list of recently played media will be emptied.', 'Clear')) App.clearRecent(); }, 'ghost')),
        row('Clear playback positions', button('Clear', async () => { if (await UI.confirm('Clear positions?', 'All saved playback positions and watched marks will be cleared.', 'Clear')) App.clearPositions(); }, 'ghost')),
        row('Clear thumbnail cache', button('Clear', async () => { await api.clearThumbs(); App.osd('Thumbnail cache cleared'); }, 'ghost')),
        row('Clear network history', button('Clear', () => { S.set('networkHistory', []); App.osd('Network history cleared'); }, 'ghost'))),
      sec('Data', el('p.note', {}, t('VLC does not collect any data. Everything is stored locally on this computer.'))),
    ],
    controls: () => [
      sec('Keyboard shortcuts', el('div.kbtable', {}, SHORTCUTS.map(([l, k]) => el('div.kbrow', { dataset: { search: t(l) } }, el('span', {}, t(l)), keycaps(k))))),
      sec('Mouse',
        row('Scroll wheel in player', select([['volume', 'Volume'], ['seek', 'Seek'], ['none', 'Nothing']], { get: () => S.get('wheel') || 'volume', set: v => S.set('wheel', v), path: 'wheel' })),
        row('Double-click in player', select([['fullscreen', 'Fullscreen'], ['play', 'Play / pause']], { get: () => S.get('dblclick') || 'fullscreen', set: v => S.set('dblclick', v), path: 'dblclick' }))),
    ],
    playback: () => [
      sec('Defaults',
        row('Repeat', select([['off', 'Off'], ['one', 'Current'], ['all', 'All']], 'repeat')),
        row('Shuffle', toggle('shuffle')),
        row('Autoplay next item', toggle('autoNext')),
        row('Resume where you left off', toggle('resume')),
        row('Skip interval', select([[5, '5 seconds'], [10, '10 seconds'], [30, '30 seconds'], [60, '1 minute']], 'jump'))),
    ],
    video: () => [
      sec('Playback mode',
        row('Default aspect ratio', select([['', 'Default'], ['fill', 'Fill (crop)'], ['stretch', 'Stretch']], 'aspect')),
        row('Always convert with ffmpeg', toggle('forceTx'), { info: 'Use this if a file does not play correctly.' })),
      sec('Snapshots',
        row('Format', select([['png', 'PNG'], ['jpg', 'JPG']], 'snapshotFormat')),
        folderRow('Folder', 'snapshotDir', P.snapshots)),
      sec('Filters', el('div.btnrow', {}, button('Reset video filters', () => { FX.resetVideo(); App.osd('Video filters reset'); }, 'ghost'))),
    ],
    audio: () => [
      sec('Effects',
        row('Equalizer', toggle('eqOn'), { info: '10-band equalizer with preamp.' }),
        row('Equalizer preset', eqPresetSelect()),
        collapse(eqBlock(true), { open: true, onLabel: 'Close equalizer', offLabel: 'Open equalizer' }),
        row('Compressor', toggle('compOn'), { info: 'Evens out quiet and loud passages.' }), collapse(compBlock()),
        row('Spatial audio', toggle('reverbOn'), { info: 'Adds reverb, as if you are in a room.' }), collapse(reverbBlock()),
        row('Stereo widening', toggle('widenOn')), collapse(widenBlock())),
      sec('Volume', slider({ label: 'Volume boost', min: 0, max: 200, binding: 'gain', fmt: v => v + '%', ticks: 2 })),
    ],
    subtitles: () => [
      sec('Tracks and languages',
        row('Load subtitles automatically', toggle('subAuto'), { info: 'Loads .srt/.ass files with the same name as the video.' }),
        row('Preferred language', textInput('subLang', 'e.g. en, nl'), { info: 'Embedded subtitles in this language are selected automatically.' })),
      sec('Appearance',
        row('Font', fontSelect(), { info: 'Your own fonts, followed by every font installed on this computer.' }),
        slider({ label: 'Size', min: 50, max: 250, binding: 'subSize', fmt: v => v + '%' }),
        row('Text color', color('subColor')), row('Outline color', color('subOutline')),
        slider({ label: 'Background opacity', min: 0, max: 100, binding: 'subBg', fmt: v => v + '%' }),
        el('div.subpreview', {}, el('span', {}, t('Subtitle preview')))),
      sec('Lyrics',
        row('Load lyrics (.lrc) automatically', toggle('lrcAuto'), { info: 'Loads a .lrc file with the same name as the song, also when subtitles are not loaded automatically.' }),
        row('Show lyrics full-screen for music', toggle('lyricsView'), { info: 'Shows the lyrics large, following the song. Off: lyrics appear as subtitles. For videos, .lrc files are always shown as subtitles.' })),
      sec('Your fonts', customFontList(), el('div.btnrow', {}, button('Add font file…', addFontFiles, 'primary'))),
    ],
    library: () => {
      const list = el('div.folderlist');
      const draw = () => {
        const f = S.get('mediaFolders');
        list.replaceChildren(...(f.length ? f.map(p => el('div.folderitem', {}, el('span', { html: icon('folder') }), el('span.fp', { title: p }, p),
          el('button.ibtn', { type: 'button', title: t('Open'), html: icon('open'), onclick: () => api.openPath(p) }),
          el('button.ibtn', { type: 'button', title: t('Remove'), html: icon('trash'), onclick: async () => { if (await UI.confirm('Remove folder?', `${p}\n\n${t('The files themselves will not be deleted.')}`, 'Remove')) App.removeFolder(p); } })))
          : [el('p.note', {}, t('No media folders yet. Add a folder to see your videos and music in the library automatically.'))]));
      };
      S.on(k => k === 'mediaFolders' && list.isConnected && draw()); draw();
      return [sec('Media folders', list, el('div.btnrow', {}, button('Add folder', async () => { const f = await api.chooseFolder(t('Choose media folder')); if (f) App.addFolder(f); }, 'primary'), button('Rescan', () => App.rescan(), 'ghost')))];
    },
    network: () => {
      const h = S.get('networkHistory');
      return [sec('Streams', row('Open network stream', button('Open…', () => { UI.$('.dlg-layer .dlg')?._close(null); openNetwork(App); }, 'ghost')),
        el('div.histlist', {}, h.length ? h.map(u => el('div.histitem', {}, el('span', { html: icon('link') }), el('span.fp', { title: u }, u), el('button.ibtn', { type: 'button', html: icon('play'), title: t('Play'), onclick: () => App.addSources([u]) }))) : el('p.note', {}, t('No streams opened yet.'))))];
    },
    performance: () => [
      sec('Converting with ffmpeg',
        row('Quality', select([['fast', 'Fast (less CPU)'], ['balanced', 'Balanced'], ['quality', 'High quality']], 'txQuality', () => App.reloadSource()), { info: 'Only for files the app needs to convert (such as .avi or AC3 audio).' }),
        row('Maximum resolution', select([[1280, '720p'], [1920, '1080p'], [2560, '1440p'], [3840, '4K']], 'txMaxW', () => App.reloadSource()))),
      sec('Library', row('Generate thumbnails', toggle('thumbs'))),
    ],
    recording: () => [
      sec('Recording',
        folderRow('Recording folder', 'recDir', P.recordings),
        row('Include audio', toggle('recAudio')),
        el('p.note', {}, t('Press R (or Shift+R) during playback to record. Recordings are saved as .webm.'))),
    ],
    about: () => {
      const info = App.appInfo || {};
      const status = el('p.upd-status');
      const actions = el('div.btnrow');
      const draw = U => {
        const pct = Math.round((U.progress || 0) * 100);
        status.textContent = ({
          idle: '', checking: t('Checking for updates…'),
          latest: t('You have the latest version ({v}).', { v: 'v' + (U.info ? U.info.current : info.version) }),
          available: t('Version {v} is available.', { v: 'v' + (U.info && U.info.latest) }),
          downloading: t('Downloading update… {p}%', { p: pct }),
          installing: t('The update is being installed. The app will restart.'),
          downloaded: t('The update has been downloaded.'),
          page: t('Version {v} is available.', { v: 'v' + (U.info && U.info.latest) }),
          error: t('Could not check for updates.') + (U.error ? ' (' + U.error + ')' : ''),
        })[U.state] || '';
        status.className = 'upd-status ' + U.state;
        actions.replaceChildren(...[
          button('Check for updates', () => App.update.check(true), 'ghost'),
          U.state === 'available' ? button(App.update.label(), () => App.update.install(), 'primary') : null].filter(Boolean));
      };
      App.update.on(draw); draw(App.update.get());
      const link = (label, url, ic) => el('button.linkbtn', { type: 'button', html: icon(ic || 'link') + `<span>${UI.esc(t(label))}</span>`, onclick: () => api.openExternal(url) });
      const keepAlive = el('div.about');
      new MutationObserver((_, o) => { if (!keepAlive.isConnected) { App.update.off(draw); o.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
      return [keepAlive,
        el('div.about-head', {}, el('img.about-icon', { src: '../build/icon.png', alt: '' }),
          el('div', {}, el('h2', {}, 'VLC Redesign'), el('p.about-ver', {}, t('Version {v}', { v: info.version || '' }) + ` · ${info.platform || ''} ${info.arch || ''}${info.portable ? ' · portable' : ''}`))),
        el('p.about-note', {}, t('Unofficial fan project. Not made by or affiliated with VideoLAN, the makers of VLC media player.')),
        sec('Updates', row('Check for updates automatically', toggle('autoUpdate')), status, actions),
        sec('Credits',
          row('Design', el('span.about-val', {}, 'Juxtopposed – “I Redesigned VLC After 25 Years”')),
          el('div.btnrow', {}, link('Watch the video', 'https://www.youtube.com/watch?v=ERFeOgqk324', 'play'), link('Figma file', 'https://www.figma.com/design/7fsD7tE4rIOTEfaLAAQiDY/VLC-Redesign--Community-')),
          row('Code', el('span.about-val', {}, '© 2026 Stan Otermans · ' + t('MIT license'))),
          row('Built with', el('span.about-val', {}, `Electron ${info.electron || ''} · Chromium ${info.chrome || ''} · FFmpeg (LGPL/GPL)`))),
        sec('Links', el('div.btnrow', {},
          link('GitHub', 'https://github.com/stanotermans/vlcmediaplayerv2', 'github'),
          link('Website', 'https://stanotermans.github.io/vlcmediaplayerv2/'),
          link('Report a problem', 'https://github.com/stanotermans/vlcmediaplayerv2/issues'))),
        el('p.note', {}, t('"VLC" and the VLC cone logo are trademarks of VideoLAN.'))];
    },
    extensions: () => [sec('Extensions', el('div.empty-ext', {}, el('span', { html: icon('puzzle', 'icon big') }), el('p', {}, t('No extensions installed.')), el('p.note', {}, t('Extensions will be supported in a later version.'))))],
  };
}

function openSettings(App, cat = 'general') {
  if (cat === 'subs') cat = 'subtitles';
  const P = pages(App);
  const nav = el('nav.gnav');
  const content = el('div.gcontent');
  const title = el('span.gtitle');
  const search = el('input.gsearch', { type: 'search', placeholder: t('Search') });
  let current = cat;
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    UI.$$('.gnav button', nav).forEach(b => b.classList.toggle('on', !q && b.dataset.cat === current));
    if (!q) { title.textContent = t(TITLES[current]); content.replaceChildren(...P[current]()); content.scrollTop = 0; return; }
    title.textContent = t('Search: "{q}"', { q: search.value.trim() });
    const all = [];
    for (const [k] of CATS) if (P[k]) {
      const nodes = P[k]();
      const holder = el('div', {}, nodes);
      UI.$$('.frow, .srow-slider, .kbrow', holder).forEach(r => { const txt = (r.dataset.search || r.textContent).toLowerCase(); r.style.display = txt.includes(q) ? '' : 'none'; });
      UI.$$('.psec', holder).forEach(s => { const vis = UI.$$('.frow, .srow-slider, .kbrow', s).some(r => r.style.display !== 'none'); s.style.display = vis ? '' : 'none'; });
      if (UI.$$('.psec', holder).some(s => s.style.display !== 'none')) all.push(el('h3.gcat', {}, t(TITLES[k])), holder);
    }
    content.replaceChildren(...(all.length ? all : [el('p.note', {}, t('Nothing found.'))]));
  };
  for (const c of CATS) {
    if (c.length === 1) { nav.append(el('div.ghead', {}, t(c[0]))); continue; }
    nav.append(el('button', { type: 'button', dataset: { cat: c[0] }, html: icon(c[2]) + `<span>${t(c[1])}</span>`, onclick: () => { search.value = ''; current = c[0]; draw(); } }));
  }
  search.addEventListener('input', draw);
  // (i) About pinned at the bottom of the sidebar
  nav.append(el('button.gabout', { type: 'button', dataset: { cat: 'about' }, html: icon('info') + `<span>${t('About')}</span>`, onclick: () => { search.value = ''; current = 'about'; draw(); } }));
  const box = el('div.gwrap', {}, el('div.gside', {}, el('div.gsearchwrap', { html: icon('search') }, search), nav), el('div.gmain', {}, el('div.gtop', {}, title), content));
  draw();
  return dialog({ title: '', body: box, buttons: [], width: 980, cls: 'global' });
}

/* ---------- other dialogs ---------- */
async function openNetwork(App) {
  const urls = el('textarea.txt.area', { placeholder: t('e.g. https://www.example.com/stream.m3u8'), rows: 5 });
  const name = el('input.txt.wide', { placeholder: t('e.g. Favorite TV channels') });
  const body = el('div.formcol', {},
    el('label.flabel', {}, t('Network URL')), el('p.hint', {}, t('You can enter multiple links, one per line.')), urls,
    el('label.flabel', {}, t('Playlist name') + ' ', el('span.opt', {}, t('(optional)'))), el('p.hint', {}, t('The playlist will be saved and shown with this name.')), name);
  // VLC's "Show more options": play another media synchronously (its audio replaces the stream's audio)
  const syncOn = el('input', { type: 'checkbox' }), sync = el('input.txt.wide', { placeholder: t('File or URL, e.g. an audio track or dub') });
  const more = el('div.formcol.moreopts', { style: { display: 'none' } },
    el('label.chk', {}, syncOn, el('span', {}, t('Play another media synchronously'))),
    el('p.hint', {}, t('Plays the audio of this file or URL together with the stream, for example a separate audio track.')),
    el('div.pathrow', {}, sync, button('Browse', async () => { const f = await api.chooseFile(t('Play another media synchronously')); if (f) { sync.value = f; syncOn.checked = true; } }, 'ghost')));
  sync.addEventListener('input', () => { syncOn.checked = !!sync.value.trim(); });
  const moreBtn = el('button.linkbtn', { type: 'button' }, t('Show more options'));
  moreBtn.onclick = () => { const open = more.style.display === 'none'; more.style.display = open ? '' : 'none'; moreBtn.textContent = t(open ? 'Show fewer options' : 'Show more options'); };
  body.append(moreBtn, more);
  const r = await dialog({ title: 'Open network stream', body, width: 560, buttons: [{ label: 'Cancel', value: null }, { label: 'Open', primary: true, value: () => ({ urls: urls.value, name: name.value, extra: syncOn.checked ? sync.value.trim() : '' }) }] });
  if (!r) return;
  const list = r.urls.split(/\s+/).map(s => s.trim()).filter(u => /^(https?|rtsp|rtmp|mms):\/\//i.test(u));
  if (!list.length) return App.osd('No valid URL entered');
  S.set('networkHistory', [...list, ...S.get('networkHistory').filter(u => !list.includes(u))].slice(0, 30));
  if (r.name.trim()) App.createPlaylist(r.name.trim(), list);
  App.addSources(list, r.extra ? { extra: r.extra } : {});
}
async function newPlaylist(App) {
  let cover = null, files = [];
  const name = el('input.txt.wide', { placeholder: t('e.g. Favorite songs') });
  const coverBtn = el('button.cover', { type: 'button', html: icon('plus'), title: t('Choose cover') });
  coverBtn.onclick = async () => { const f = await api.chooseFile(t('Cover image'), ['png', 'jpg', 'jpeg', 'webp', 'gif']); if (f) { cover = await api.readImage(f); coverBtn.style.backgroundImage = `url("${cover}")`; coverBtn.classList.add('has'); } };
  const drop = el('div.dropzone', {}, el('p', {}, t('Drag files here or click to choose them')), el('span.ibtn', { html: icon('plus') }));
  const listEl = el('div.droplist');
  const refresh = () => { listEl.replaceChildren(...files.map(f => el('div', {}, f.split(/[\\/]/).pop()))); drop.classList.toggle('filled', files.length > 0); };
  drop.onclick = async () => { const p = await api.openFiles(); files.push(...p.filter(x => !files.includes(x))); refresh(); };
  drop.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); const p = await api.expand([...e.dataTransfer.files].map(f => api.pathFor(f)).filter(Boolean)); files.push(...p.filter(x => !files.includes(x))); refresh(); });
  const body = el('div.formcol', {},
    el('label.flabel', {}, t('Playlist details')), el('div.plhead', {}, el('div', {}, el('p.hint', {}, t('The playlist will be saved and shown with this name and cover.')), name), coverBtn),
    el('label.flabel', {}, t('Select files')), el('p.hint', {}, t('These files will be added to the playlist.')), drop, listEl);
  const r = await dialog({ title: 'New playlist', body, width: 560, buttons: [{ label: 'Cancel', value: null }, { label: 'Save', primary: true, value: () => name.value.trim() || t('New playlist') }] });
  if (!r) return null;
  return App.createPlaylist(r, files, cover, true);
}
function shortcuts() {
  const half = Math.ceil(SHORTCUTS.length / 2);
  const col = list => el('div.kbcol', {}, list.map(([l, k]) => el('div.kbrow', {}, el('span', {}, t(l)), keycaps(k))));
  return dialog({ title: 'Keyboard shortcuts', width: 820, body: el('div.kbgrid', {}, col(SHORTCUTS.slice(0, half)), col(SHORTCUTS.slice(half))), buttons: [{ label: 'Close', primary: true, value: true }] });
}

window.Panels = { quickPanel, openSettings, openNetwork, newPlaylist, shortcuts, SHORTCUTS, keycaps };
})();
