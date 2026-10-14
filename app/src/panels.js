// Quick settings panel (in the player), Global Settings dialog and the other dialogs. Exposes window.Panels
(() => {
const { el, icon, toggle, select, segmented, swatches, slider, color, textInput, row, collapse, button, dialog } = UI;
const sec = (title, ...rows) => el('section.psec', {}, title ? el('h4', {}, title) : null, ...rows);
const f1 = v => (+v).toFixed(1), f2 = v => (+v).toFixed(2), f3 = v => (+v).toFixed(3);
const px = v => `${v} px`;

const SHORTCUTS = [
  ['Afspelen / pauzeren', ['Spatie']], ['Volledig scherm', ['F']], ['Terug / vooruit spoelen', ['←', '→']], ['Volume omhoog / omlaag', ['↑', '↓']],
  ['Vorige / volgende', ['<', '>']], ['Wachtrij tonen / verbergen', ['Q']], ['Vorig / volgend frame', [',', '.']], ['Bibliotheek / speler', ['L']],
  ['Ondertitelspoor wisselen', ['V']], ['Momentopname', ['SHIFT', 'S']], ['Audiospoor wisselen', ['B']], ['Opnemen', ['SHIFT', 'R']],
  ['Stoppen', ['S']], ['Dempen', ['M']], ['Interface verbergen', ['Ctrl', '\\']], ['Langzamer / sneller / normaal', ['[', ']', '=']],
  ['Ondertitelvertraging − / +', ['G', 'H']], ['Spoelen 3 seconden', ['SHIFT', '← →']], ['Naar 0–90%', ['0 – 9']], ['Bestanden openen', ['Ctrl', 'O']],
  ['Map openen', ['Ctrl', 'F']], ['Netwerkstream openen', ['Ctrl', 'N']], ['Media-informatie', ['Ctrl', 'I']], ['Instellingen', ['Ctrl', 'P']],
  ['Sneltoetsen', ['F1']], ['VLC afsluiten', ['Ctrl', 'Q']],
];
const keycaps = keys => el('span.keys', {}, ...keys.map((k, i) => [i && keys.length === 2 && !['SHIFT', 'Ctrl'].includes(keys[0]) ? el('span.kslash', {}, '/') : null, el('kbd.cap', {}, k)]));

const VIDEO_PRESETS = {
  '': ['Standaard', {}],
  vivid: ['Levendig', { brightness: 105, contrast: 115, saturate: 160, gamma: 1, sepia: 0, gray: false }],
  cinema: ['Bioscoop', { brightness: 95, contrast: 120, saturate: 85, gamma: 1.1, sepia: 0, gray: false }],
  bw: ['Zwart-wit', { brightness: 100, contrast: 115, saturate: 0, gray: true, sepia: 0 }],
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
const presetOpts = () => [...Object.entries(FX.EQ_PRESETS).map(([k, v]) => [k, v[0]]), ['custom', 'Aangepast']];
const eqPresetSelect = () => select(presetOpts, 'eqPreset', v => { if (v !== 'custom') { FX.setPreset(v); S.set('eqOn', true); } });
const compBlock = () => [
  slider({ label: 'Drempel', min: -60, max: 0, step: 0.5, binding: 'comp.threshold', fmt: v => f1(v) + ' dB' }),
  slider({ label: 'Verhouding', min: 1, max: 20, step: 0.5, binding: 'comp.ratio', fmt: v => f1(v) + ' : 1' }),
  slider({ label: 'Knie', min: 0, max: 40, step: 0.5, binding: 'comp.knee', fmt: v => f1(v) + ' dB' }),
  slider({ label: 'Attack', min: 1, max: 500, step: 1, binding: 'comp.attack', fmt: v => f1(v) + ' ms' }),
  slider({ label: 'Release', min: 10, max: 1000, step: 5, binding: 'comp.release', fmt: v => f1(v) + ' ms' }),
  slider({ label: 'Make-up gain', min: 0, max: 24, step: 0.5, binding: 'comp.makeup', fmt: v => f1(v) + ' dB' }),
];
const reverbBlock = () => ['size:Grootte', 'width:Breedte', 'wet:Nat', 'dry:Droog', 'damp:Demping'].map(s => { const [k, l] = s.split(':'); return slider({ label: l, min: 0, max: 10, step: 0.1, binding: 'reverb.' + k, fmt: f1, ticks: 10 }); });
const widenBlock = () => [
  slider({ label: 'Vertraging', min: 1, max: 100, step: 1, binding: 'widen.delay', fmt: v => f1(v) + ' ms' }),
  slider({ label: 'Feedback', min: 0, max: 0.9, step: 0.01, binding: 'widen.feedback', fmt: v => f1(v * 100) + ' %', ticks: 8 }),
  slider({ label: 'Crossfeed', min: 0, max: 0.8, step: 0.01, binding: 'widen.crossfeed', fmt: v => f1(v * 100) + ' %', ticks: 8 }),
  slider({ label: 'Droge mix', min: 0, max: 1, step: 0.01, binding: 'widen.dry', fmt: v => f1(v * 100) + ' %', ticks: 8 }),
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
  const link = (get, set) => { const b = el('button.ibtn.link', { type: 'button', html: icon('link'), title: 'Koppelen' }); b.onclick = () => { set(!get()); b.classList.toggle('on', get()); }; return b; };
  return el('div.cropgrid', {},
    field('Boven', 't', 'b', () => linkV), field('Onder', 'b', 't', () => linkV), link(() => linkV, v => linkV = v),
    field('Links', 'l', 'r', () => linkH), field('Rechts', 'r', 'l', () => linkH), link(() => linkH, v => linkH = v));
}

/* ---------- quick panel ---------- */
function quickPanel(App) {
  const panel = UI.$('#settings');
  const tabs = [['playback', 'Afspelen', 'playback'], ['video', 'Video', 'video'], ['audio', 'Audio', 'audio'], ['subs', 'Ondertitels', 'subtitle']];
  const head = el('div.qtabs', {}, tabs.map(([k, l, ic]) => el('button.qtab', { type: 'button', dataset: { tab: k }, html: icon(ic) + `<span>${l}</span>`, onclick: () => show(k) })));
  const body = el('div.qbody');
  const presetBox = el('div.qpreset');
  const foot = el('div.qfoot', {}, presetBox, el('button.qadv', { type: 'button', html: icon('settings') + '<span>Geavanceerde instellingen openen</span>', onclick: () => { hide(); openSettings(App, current === 'subs' ? 'subtitles' : current); } }));
  panel.replaceChildren(head, body, foot);
  let current = 'playback';
  const build = {
    playback: () => [sec('Standaard',
      slider({ label: 'Snelheid', min: 0.25, max: 4, step: 0.05, binding: { get: () => App.video.playbackRate, set: v => App.video.playbackRate = v, path: '_rate' }, fmt: v => f2(v) + '×', box: true }),
      row('Herhalen', select([['off', 'Uit'], ['one', 'Huidige'], ['all', 'Alles']], 'repeat')),
      row('Willekeurig', toggle('shuffle')),
      row('Automatisch volgende afspelen', toggle('autoNext')),
      row('Doorspringen', select([[5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min']], 'jump')),
      row('Hervatten waar gebleven', toggle('resume'))),
      sec('Decodering', row('Altijd omzetten met ffmpeg', toggle('forceTx', () => App.reloadSource()), { info: 'Gebruik dit als beeld of geluid hapert of ontbreekt.' })),
    ],
    video: () => [sec('Beeld',
      row('Beeldverhouding', select([['', 'Standaard'], ['fill', 'Vullen (bijsnijden)'], ['stretch', 'Uitrekken']], 'aspect')),
      row('Draaien', select([[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']], 'vf.rotate')),
      row('Zoom', select([[1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']], 'vf.zoom')),
      row('Spiegelen', toggle('vf.mirror')),
      row('Bijsnijden', el('span')), cropBlock()),
      sec('Filters',
        slider({ label: 'Helderheid', min: 0, max: 200, binding: 'vf.brightness', fmt: v => v + '%' }),
        slider({ label: 'Contrast', min: 0, max: 200, binding: 'vf.contrast', fmt: v => v + '%' }),
        slider({ label: 'Verzadiging', min: 0, max: 300, binding: 'vf.saturate', fmt: v => v + '%', ticks: 2 }),
        collapse([
          slider({ label: 'Tint', min: -180, max: 180, binding: 'vf.hue', fmt: v => v + '°', center: true }),
          slider({ label: 'Gamma', min: 0.1, max: 3, step: 0.01, binding: 'vf.gamma', fmt: f2, ticks: 9 }),
          slider({ label: 'Verscherpen', min: 0, max: 2, step: 0.05, binding: 'vf.sharpen', fmt: f2, ticks: 4 }),
          slider({ label: 'Filmkorrel', min: 0, max: 10, step: 0.5, binding: 'vf.grain', fmt: f1, ticks: 10 }),
        ]),
        collapse([
          row('Negatief', toggle('vf.negate')), row('Posterize', toggle('vf.posterize')), row('Grijstinten', toggle('vf.gray')),
          slider({ label: 'Sepia-intensiteit', min: 0, max: 100, binding: 'vf.sepia', fmt: v => v + '%', ticks: 2 }),
        ], { offLabel: 'Kleureffecten', onLabel: 'Kleureffecten inklappen' })),
    ],
    audio: () => [sec('Standaard',
      row('Audiospoor', select(() => App.audioTracks(), { get: () => App.audioTrack(), set: v => App.setAudioTrack(+v), path: '_atrack' })),
      slider({ label: 'Volumeversterking', min: 0, max: 200, binding: 'gain', fmt: v => v + '%', ticks: 2 })),
      sec('Equalizer', row('Equalizer', toggle('eqOn')), row('Voorinstelling', eqPresetSelect()), collapse(eqBlock(false))),
      sec('Effecten',
        row('Compressor', toggle('compOn')), collapse(compBlock()),
        row('Ruimtelijk geluid (galm)', toggle('reverbOn')), collapse(reverbBlock()),
        row('Stereoverbreding', toggle('widenOn')), collapse(widenBlock())),
    ],
    subs: () => [sec('Standaard',
      row('Ondertitelspoor', select(() => App.subTracks(), { get: () => App.subActive(), set: v => App.selectSub(+v), path: '_strack' })),
      row('Voorkeurstaal', textInput('subLang', 'bijv. nl, en')),
      row('Bestand laden', button('.srt / .ass / .vtt…', () => App.loadSubFile()))),
      sec('Synchronisatie',
        slider({ label: 'Ondertitelvertraging', min: -10, max: 10, step: 0.05, binding: { get: () => App.sub.delay, set: v => App.sub.delay = v, path: '_subdelay' }, fmt: v => f3(v) + ' s', box: true, center: true }),
        el('div.scale', {}, el('span', {}, '−10 s'), el('span', {}, '0 s'), el('span', {}, '+10 s')),
        slider({ label: 'Ondertitelsnelheid', min: 0.5, max: 2, step: 0.001, binding: { get: () => App.sub.speed, set: v => App.sub.speed = v, path: '_subspeed' }, fmt: f3, box: true }),
        slider({ label: 'Duurfactor', min: 0, max: 5, step: 0.05, binding: { get: () => App.sub.dur, set: v => App.sub.dur = v, path: '_subdur' }, fmt: v => f3(v) + ' s', box: true })),
      sec('Uiterlijk',
        row('Lettertype', select(FONTS, 'subFont')),
        slider({ label: 'Grootte', min: 50, max: 250, binding: 'subSize', fmt: v => v + '%' }),
        row('Tekstkleur', color('subColor')), row('Randkleur', color('subOutline')),
        slider({ label: 'Achtergrond', min: 0, max: 100, binding: 'subBg', fmt: v => v + '%' })),
    ],
  };
  const presets = {
    playback: null,
    video: () => row('Voorinstelling', select(Object.entries(VIDEO_PRESETS).map(([k, v]) => [k, v[0]]), { get: () => panel._vp || '', set: v => { panel._vp = v; applyVideoPreset(v); }, path: '_vp' })),
    audio: () => row('Voorinstelling', eqPresetSelect()),
    subs: () => row('Voorinstelling', select([['', 'Standaard'], ['big', 'Groot en geel'], ['cinema', 'Bioscoop'], ['clean', 'Zonder achtergrond']], { get: () => panel._sp || '', set: v => { panel._sp = v; subPreset(v); }, path: '_sp' })),
  };
  function show(t) {
    current = t; panel.dataset.tab = t;
    UI.$$('.qtab', head).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    body.replaceChildren(...build[t]());
    presetBox.replaceChildren(presets[t] ? presets[t]() : el('span'));
    body.scrollTop = 0;
  }
  function hide() { panel.classList.remove('show'); }
  function toggleTab(t) {
    if (panel.classList.contains('show') && (!t || t === current)) return hide();
    panel.classList.add('show'); show(t || current);
  }
  show('playback');
  return { toggle: toggleTab, hide, refresh: () => panel.classList.contains('show') && show(current) };
}
const FONTS = [['Segoe UI', 'Segoe UI'], ['Inter', 'Inter'], ['Arial', 'Arial'], ['Verdana', 'Verdana'], ['Tahoma', 'Tahoma'], ['Georgia', 'Georgia'], ['Trebuchet MS', 'Trebuchet MS'], ['Consolas', 'Consolas'], ['Comic Sans MS', 'Comic Sans MS']];
function subPreset(k) {
  const P = { '': ['Segoe UI', 100, '#ffffff', '#0c0c0c', 60], big: ['Segoe UI', 150, '#ffe14d', '#000000', 0], cinema: ['Georgia', 115, '#f0f0f0', '#000000', 0], clean: ['Arial', 100, '#ffffff', '#000000', 0] }[k];
  if (!P) return;
  ['subFont', 'subSize', 'subColor', 'subOutline', 'subBg'].forEach((key, i) => S.set(key, P[i]));
}

/* ---------- Global Settings dialog ---------- */
const CATS = [
  ['App'], ['general', 'Algemeen', 'general'], ['interface', 'Interface', 'pointer'], ['privacy', 'Privacy', 'shield'], ['controls', 'Bediening', 'keyboard'],
  ['Media'], ['playback', 'Afspelen', 'play'], ['video', 'Video', 'video'], ['audio', 'Audio', 'audio'], ['subtitles', 'Ondertitels', 'subtitle'], ['library', 'Bibliotheek', 'library'],
  ['Systeem'], ['network', 'Netwerk', 'network'], ['performance', 'Prestaties', 'general'], ['recording', 'Opnemen', 'record'], ['extensions', 'Extensies', 'puzzle'],
];
const TITLES = { general: 'Globale instellingen', interface: 'Interface', privacy: 'Privacy', controls: 'Bediening', playback: 'Afspelen', video: 'Video', audio: 'Audiostandaarden', subtitles: 'Ondertitels', library: 'Bibliotheek', network: 'Netwerk', performance: 'Prestaties', recording: 'Opnemen', extensions: 'Extensies' };

function pages(App) {
  const P = App.paths;
  const folderRow = (label, key, fallback) => {
    const t = el('input.txt.path', { readonly: true });
    const draw = () => t.value = S.get(key) || fallback;
    S.on(k => k === key && draw()); draw();
    return row(label, el('div.pathrow', {}, t, button('Bladeren', async () => { const f = await api.chooseFolder(label); if (f) S.set(key, f); }, 'ghost'), button('Openen', () => api.openPath(S.get(key) || fallback), 'ghost')));
  };
  return {
    general: () => [
      sec('Uiterlijk',
        row('Taal van de interface', select([['nl', 'Nederlands']], 'language')),
        row('Thema', segmented([['dark', 'Donker'], ['light', 'Licht'], ['system', 'Systeem']], 'theme')),
        row('Accentkleur', swatches(S.ACCENTS, 'accent'))),
      sec('Opstarten',
        row('Bevestigings- en foutmeldingen tonen', toggle('confirmDialogs'), { info: 'Vraag om bevestiging bij verwijderen of leegmaken.' }),
        row('Welkomstscherm opnieuw tonen', button('Onboarding starten', () => { UI.$('.dlg-layer')?.querySelector('.dlg')?._close(null); App.showOnboarding(); }, 'ghost'))),
      sec('Diagnose',
        row('Ontwikkelaarsmodus', toggle('devMode', v => api.devtools(v)), { info: 'Opent de ontwikkelaarstools.' }),
        row('Log opslaan', toggle('logOn', () => App.applyLog()), { info: 'Schrijf ffmpeg- en afspeelmeldingen naar een bestand.' }),
        (() => { const t = el('input.txt.path', { readonly: true }); const d = () => t.value = S.get('logFile') || P.log; S.on(k => k === 'logFile' && d()); d();
          return row('Logbestand', el('div.pathrow', {}, t, button('Bladeren', async () => { const f = await api.saveLogAs(); if (f) { S.set('logFile', f); App.applyLog(); } }, 'ghost'))); })(),
        row('Logdetails', select([['error', 'Alleen fouten'], ['info', 'Alles']], 'logLevel', () => App.applyLog()))),
    ],
    interface: () => [
      sec('Indeling',
        row('Zijbalk met labels', toggle('navExpanded')),
        row('Minispeler tonen tijdens bladeren', toggle('miniPlayer')),
        row('Miniaturen tonen', toggle('showThumbs')),
        row('Bekeken items dimmen', toggle('dimWatched')),
        row('ffmpeg-label tonen in speler', toggle('showBadge'))),
      sec('Volledig scherm',
        slider({ label: 'Cursor en bediening verbergen na', min: 1, max: 10, step: 0.5, binding: 'hideCursorDelay', fmt: v => f1(v) + ' s' })),
    ],
    privacy: () => [
      sec('Geschiedenis',
        row('Recent afgespeeld onthouden', toggle('rememberRecent')),
        row('Afspeelpositie onthouden', toggle('resume')),
        row('Recente items wissen', button('Wissen', async () => { if (await UI.confirm('Recent wissen?', 'De lijst met recent afgespeelde media wordt geleegd.', 'Wissen')) App.clearRecent(); }, 'ghost')),
        row('Afspeelposities wissen', button('Wissen', async () => { if (await UI.confirm('Posities wissen?', 'Alle onthouden afspeelposities en bekeken-markeringen worden gewist.', 'Wissen')) App.clearPositions(); }, 'ghost')),
        row('Miniaturen-cache wissen', button('Wissen', async () => { await api.clearThumbs(); App.osd('Miniaturen-cache gewist'); }, 'ghost')),
        row('Netwerkgeschiedenis wissen', button('Wissen', () => { S.set('networkHistory', []); App.osd('Netwerkgeschiedenis gewist'); }, 'ghost'))),
      sec('Gegevens', el('p.note', {}, 'VLC verzamelt geen gegevens. Alles wordt alleen lokaal op deze pc opgeslagen.')),
    ],
    controls: () => [
      sec('Sneltoetsen', el('div.kbtable', {}, SHORTCUTS.map(([l, k]) => el('div.kbrow', { dataset: { search: l } }, el('span', {}, l), keycaps(k))))),
      sec('Muis',
        row('Scrollwiel in speler', select([['volume', 'Volume'], ['seek', 'Spoelen'], ['none', 'Niets']], { get: () => S.get('wheel') || 'volume', set: v => S.set('wheel', v), path: 'wheel' })),
        row('Dubbelklik in speler', select([['fullscreen', 'Volledig scherm'], ['play', 'Afspelen / pauzeren']], { get: () => S.get('dblclick') || 'fullscreen', set: v => S.set('dblclick', v), path: 'dblclick' }))),
    ],
    playback: () => [
      sec('Standaard',
        row('Herhalen', select([['off', 'Uit'], ['one', 'Huidige'], ['all', 'Alles']], 'repeat')),
        row('Willekeurig', toggle('shuffle')),
        row('Automatisch volgende afspelen', toggle('autoNext')),
        row('Hervatten waar gebleven', toggle('resume')),
        row('Doorspringen', select([[5, '5 seconden'], [10, '10 seconden'], [30, '30 seconden'], [60, '1 minuut']], 'jump'))),
    ],
    video: () => [
      sec('Weergave',
        row('Standaard beeldverhouding', select([['', 'Standaard'], ['fill', 'Vullen (bijsnijden)'], ['stretch', 'Uitrekken']], 'aspect')),
        row('Altijd omzetten met ffmpeg', toggle('forceTx'), { info: 'Gebruik dit als een bestand niet goed afspeelt.' })),
      sec('Momentopnames',
        row('Formaat', select([['png', 'PNG'], ['jpg', 'JPG']], 'snapshotFormat')),
        folderRow('Map', 'snapshotDir', P.snapshots)),
      sec('Filters', el('div.btnrow', {}, button('Videofilters herstellen', () => { FX.resetVideo(); App.osd('Videofilters hersteld'); }, 'ghost'))),
    ],
    audio: () => [
      sec('Effecten',
        row('Equalizer', toggle('eqOn'), { info: '10-bands equalizer met voorversterker.' }),
        row('Equalizer-voorinstelling', eqPresetSelect()),
        collapse(eqBlock(true), { open: true, onLabel: 'Equalizer sluiten', offLabel: 'Equalizer openen' }),
        row('Compressor', toggle('compOn'), { info: 'Maakt zachte en harde passages gelijkmatiger.' }), collapse(compBlock()),
        row('Ruimtelijk geluid', toggle('reverbOn'), { info: 'Voegt galm toe, alsof je in een ruimte zit.' }), collapse(reverbBlock()),
        row('Stereoverbreding', toggle('widenOn')), collapse(widenBlock())),
      sec('Volume', slider({ label: 'Volumeversterking', min: 0, max: 200, binding: 'gain', fmt: v => v + '%', ticks: 2 })),
    ],
    subtitles: () => [
      sec('Sporen en talen',
        row('Ondertitels automatisch laden', toggle('subAuto'), { info: 'Laadt .srt/.ass-bestanden met dezelfde naam als de video.' }),
        row('Voorkeurstaal', textInput('subLang', 'bijv. nl, en'), { info: 'Ingebouwde ondertitels in deze taal worden automatisch gekozen.' })),
      sec('Uiterlijk',
        row('Lettertype', select(FONTS, 'subFont')),
        slider({ label: 'Grootte', min: 50, max: 250, binding: 'subSize', fmt: v => v + '%' }),
        row('Tekstkleur', color('subColor')), row('Randkleur', color('subOutline')),
        slider({ label: 'Achtergronddekking', min: 0, max: 100, binding: 'subBg', fmt: v => v + '%' }),
        el('div.subpreview', {}, el('span', {}, 'Voorbeeld van een ondertitel'))),
    ],
    library: () => {
      const list = el('div.folderlist');
      const draw = () => {
        const f = S.get('mediaFolders');
        list.replaceChildren(...(f.length ? f.map(p => el('div.folderitem', {}, el('span', { html: icon('folder') }), el('span.fp', { title: p }, p),
          el('button.ibtn', { type: 'button', title: 'Openen', html: icon('open'), onclick: () => api.openPath(p) }),
          el('button.ibtn', { type: 'button', title: 'Verwijderen', html: icon('trash'), onclick: async () => { if (await UI.confirm('Map verwijderen?', `${p}\n\nDe bestanden zelf blijven staan.`, 'Verwijderen')) App.removeFolder(p); } })))
          : [el('p.note', {}, 'Nog geen mediamappen. Voeg een map toe om je video\'s en muziek automatisch in de bibliotheek te zien.')]));
      };
      S.on(k => k === 'mediaFolders' && list.isConnected && draw()); draw();
      return [sec('Mediamappen', list, el('div.btnrow', {}, button('Map toevoegen', async () => { const f = await api.chooseFolder('Mediamap kiezen'); if (f) App.addFolder(f); }, 'primary'), button('Opnieuw scannen', () => App.rescan(), 'ghost')))];
    },
    network: () => {
      const h = S.get('networkHistory');
      return [sec('Streams', row('Netwerkstream openen', button('Openen…', () => { UI.$('.dlg-layer .dlg')?._close(null); openNetwork(App); }, 'ghost')),
        el('div.histlist', {}, h.length ? h.map(u => el('div.histitem', {}, el('span', { html: icon('link') }), el('span.fp', { title: u }, u), el('button.ibtn', { type: 'button', html: icon('play'), title: 'Afspelen', onclick: () => App.addSources([u]) }))) : el('p.note', {}, 'Nog geen geopende streams.')))];
    },
    performance: () => [
      sec('Omzetten met ffmpeg',
        row('Kwaliteit', select([['fast', 'Snel (minder CPU)'], ['balanced', 'Gebalanceerd'], ['quality', 'Hoge kwaliteit']], 'txQuality', () => App.reloadSource()), { info: 'Alleen voor bestanden die de app moet omzetten (zoals .avi of AC3-geluid).' }),
        row('Maximale resolutie', select([[1280, '720p'], [1920, '1080p'], [2560, '1440p'], [3840, '4K']], 'txMaxW', () => App.reloadSource()))),
      sec('Bibliotheek', row('Miniaturen genereren', toggle('thumbs'))),
    ],
    recording: () => [
      sec('Opnemen',
        folderRow('Opnamemap', 'recDir', P.recordings),
        row('Geluid meenemen', toggle('recAudio')),
        el('p.note', {}, 'Druk op R (of Shift+R) tijdens het afspelen om op te nemen. Opnames worden opgeslagen als .webm.')),
    ],
    extensions: () => [sec('Extensies', el('div.empty-ext', {}, el('span', { html: icon('puzzle', 'icon big') }), el('p', {}, 'Geen extensies geïnstalleerd.'), el('p.note', {}, 'Extensies worden in een latere versie ondersteund.')))],
  };
}

function openSettings(App, cat = 'general') {
  if (cat === 'subs') cat = 'subtitles';
  const P = pages(App);
  const nav = el('nav.gnav');
  const content = el('div.gcontent');
  const title = el('span.gtitle');
  const search = el('input.gsearch', { type: 'search', placeholder: 'Zoeken' });
  let current = cat;
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    UI.$$('.gnav button', nav).forEach(b => b.classList.toggle('on', !q && b.dataset.cat === current));
    if (!q) { title.textContent = TITLES[current]; content.replaceChildren(...P[current]()); content.scrollTop = 0; return; }
    title.textContent = `Zoeken: "${search.value.trim()}"`;
    const all = [];
    for (const [k] of CATS) if (P[k]) {
      const nodes = P[k]();
      const holder = el('div', {}, nodes);
      UI.$$('.frow, .srow-slider, .kbrow', holder).forEach(r => { const txt = (r.dataset.search || r.textContent).toLowerCase(); r.style.display = txt.includes(q) ? '' : 'none'; });
      UI.$$('.psec', holder).forEach(s => { const vis = UI.$$('.frow, .srow-slider, .kbrow', s).some(r => r.style.display !== 'none'); s.style.display = vis ? '' : 'none'; });
      if (UI.$$('.psec', holder).some(s => s.style.display !== 'none')) all.push(el('h3.gcat', {}, TITLES[k]), holder);
    }
    content.replaceChildren(...(all.length ? all : [el('p.note', {}, 'Niets gevonden.')]));
  };
  for (const c of CATS) {
    if (c.length === 1) { nav.append(el('div.ghead', {}, c[0])); continue; }
    nav.append(el('button', { type: 'button', dataset: { cat: c[0] }, html: icon(c[2]) + `<span>${c[1]}</span>`, onclick: () => { search.value = ''; current = c[0]; draw(); } }));
  }
  search.addEventListener('input', draw);
  const box = el('div.gwrap', {}, el('div.gside', {}, el('div.gsearchwrap', { html: icon('search') }, search), nav), el('div.gmain', {}, el('div.gtop', {}, title), content));
  draw();
  return dialog({ title: '', body: box, buttons: [], width: 980, cls: 'global' });
}

/* ---------- other dialogs ---------- */
async function openNetwork(App) {
  const urls = el('textarea.txt.area', { placeholder: 'bijv. https://www.example.com/stream.m3u8', rows: 5 });
  const name = el('input.txt.wide', { placeholder: 'bijv. Favoriete tv-zenders' });
  const body = el('div.formcol', {},
    el('label.flabel', {}, 'Netwerk-URL'), el('p.hint', {}, 'Je kunt meerdere links invoeren, één per regel.'), urls,
    el('label.flabel', {}, 'Naam afspeellijst ', el('span.opt', {}, '(optioneel)')), el('p.hint', {}, 'De afspeellijst wordt opgeslagen en getoond met deze naam.'), name);
  const r = await dialog({ title: 'Netwerkstream openen', body, width: 560, buttons: [{ label: 'Annuleren', value: null }, { label: 'Openen', primary: true, value: () => ({ urls: urls.value, name: name.value }) }] });
  if (!r) return;
  const list = r.urls.split(/\s+/).map(s => s.trim()).filter(u => /^(https?|rtsp|rtmp|mms):\/\//i.test(u));
  if (!list.length) return App.osd('Geen geldige URL ingevoerd');
  S.set('networkHistory', [...list, ...S.get('networkHistory').filter(u => !list.includes(u))].slice(0, 30));
  if (r.name.trim()) App.createPlaylist(r.name.trim(), list);
  App.addSources(list);
}
async function newPlaylist(App) {
  let cover = null, files = [];
  const name = el('input.txt.wide', { placeholder: 'bijv. Favoriete nummers' });
  const coverBtn = el('button.cover', { type: 'button', html: icon('plus'), title: 'Omslag kiezen' });
  coverBtn.onclick = async () => { const f = await api.chooseFile('Omslagafbeelding', ['png', 'jpg', 'jpeg', 'webp', 'gif']); if (f) { cover = await api.readImage(f); coverBtn.style.backgroundImage = `url("${cover}")`; coverBtn.classList.add('has'); } };
  const drop = el('div.dropzone', {}, el('p', {}, 'Sleep bestanden hierheen of klik om ze te kiezen'), el('span.ibtn', { html: icon('plus') }));
  const listEl = el('div.droplist');
  const refresh = () => { listEl.replaceChildren(...files.map(f => el('div', {}, f.split(/[\\/]/).pop()))); drop.classList.toggle('filled', files.length > 0); };
  drop.onclick = async () => { const p = await api.openFiles(); files.push(...p.filter(x => !files.includes(x))); refresh(); };
  drop.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); const p = await api.expand([...e.dataTransfer.files].map(f => api.pathFor(f)).filter(Boolean)); files.push(...p.filter(x => !files.includes(x))); refresh(); });
  const body = el('div.formcol', {},
    el('label.flabel', {}, 'Afspeellijstgegevens'), el('div.plhead', {}, el('div', {}, el('p.hint', {}, 'De afspeellijst wordt opgeslagen en getoond met deze naam en omslag.'), name), coverBtn),
    el('label.flabel', {}, 'Bestanden kiezen'), el('p.hint', {}, 'Deze bestanden worden aan de afspeellijst toegevoegd.'), drop, listEl);
  const r = await dialog({ title: 'Nieuwe afspeellijst', body, width: 560, buttons: [{ label: 'Annuleren', value: null }, { label: 'Opslaan', primary: true, value: () => name.value.trim() || 'Nieuwe afspeellijst' }] });
  if (!r) return null;
  return App.createPlaylist(r, files, cover, true);
}
function shortcuts() {
  const half = Math.ceil(SHORTCUTS.length / 2);
  const col = list => el('div.kbcol', {}, list.map(([l, k]) => el('div.kbrow', {}, el('span', {}, l), keycaps(k))));
  return dialog({ title: 'Sneltoetsen', width: 820, body: el('div.kbgrid', {}, col(SHORTCUTS.slice(0, half)), col(SHORTCUTS.slice(half))), buttons: [{ label: 'Sluiten', primary: true, value: true }] });
}

window.Panels = { quickPanel, openSettings, openNetwork, newPlaylist, shortcuts, SHORTCUTS, keycaps };
})();
