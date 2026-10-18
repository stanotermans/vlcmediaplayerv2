(async () => {
const { $, $$, esc, el, icon } = UI;
const video = $('#video');
const api = window.api;
const { port, token } = await api.info();
const PATHS = await api.paths();
const MIDI_RE = /\.(mid|midi|kar|rmi|smf)$/i;
// MIDI is rendered with the chosen SoundFont: a different SoundFont is a different URL (no cached old audio)
const fileUrl = p => `http://127.0.0.1:${port}/file?t=${token}&src=${encodeURIComponent(p)}` + (MIDI_RE.test(p) ? '&sf=' + encodeURIComponent(S.get('soundfont') || '') : '');
const streamUrl = (src, ss, a, vcopy, ch = 2) => `http://127.0.0.1:${port}/stream?t=${token}&src=${encodeURIComponent(src)}&ss=${ss.toFixed(2)}&a=${a}&vcopy=${vcopy ? 1 : 0}&q=${S.get('txQuality')}&maxw=${S.get('txMaxW')}&ch=${ch}`;
FX.attach(video);

/* ---------- pixel cat (idle screen) ---------- */
const CAT = [
"..K..........K....", "..KW........WK....", "..KWW......WWK....", "..KWWWWWWWWWWK....", "..KWWWWWWWWWWK....",
"KKWKKWWWWWWKKWKK..", "..WWWWWWWWWWWWW...", "KKWPPWKWWKWPPWKK..", "..WWWWWKKKWWWWW...", "....WWWWWWWWW.....",
"....WWWWWWWWW.....", "....WWWWWWWWW..W..", "....WGWWWWWWW...W.", "....WGWWWWWWWW..W.", "....WGWWWGWWWW.WW.",
"....WGWWWGWWWWWW..", "....W.W.W.W.WW....",
];
// The pixels are grouped (eyes, mouth, tail, the rest) so the cat can be animated when clicked (#48).
const catPart = (x, y) => y === 7 && (x === 6 || x === 9) ? 'eyes' : y === 8 && x >= 7 && x <= 9 ? 'mouth' : (x >= 15 && y >= 11) || (y === 15 && x === 14) ? 'tail' : 'body';
function catSVG(cls = '') {
  const C = { W: '#ececec', K: '#111', P: '#f6b8c4', G: '#a8a8a8' }, parts = { body: '', eyes: '', mouth: '', tail: '' };
  CAT.forEach((row, y) => [...row].forEach((c, x) => { if (C[c]) parts[catPart(x, y)] += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${C[c]}"/>`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="0 0 18 17" shape-rendering="crispEdges">` +
    Object.entries(parts).map(([k, r]) => `<g class="c-${k}">${r}</g>`).join('') + '</svg>';
}
$('#miniCanvasWrap').insertAdjacentHTML('beforeend', catSVG('cat'));

/* ---------- persistence ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('vlcx-' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('vlcx-' + k, JSON.stringify(v)); } catch {} },
};
const positions = store.get('pos', {});
let watched = new Set(store.get('watched', []));
// With "Remember recently played" off nothing about what you watched is kept after a restart:
// no recent list, no watched marks and no files you only opened (e.g. via "Open with").
const saveWatched = () => store.set('watched', S.get('rememberRecent') ? [...watched] : []);

/* ---------- state ---------- */
const state = {
  items: [], current: -1, view: ['home', 'videos', 'music', 'network', 'playlists', 'recent'].includes(S.get('startView')) ? S.get('startView') : 'videos',
  playlists: store.get('playlists3', null) || store.get('playlists2', [{ name: 'Cool Songs', srcs: [] }, { name: 'Anime to Watch', srcs: [] }]),
  activePlaylist: null, recent: store.get('recent2', []),
  sort: 'name', sortDesc: false, gridLimit: 240, sideLimit: 400, list: store.get('listView', false), query: '', dir: { videos: null, music: null },
  sideMode: 'view',
};
const history = { back: [], fwd: [] };
let rec = null, quick = null;
let uid = 0;
// Lookups by path and position use maps rebuilt only when the item list changed (thousands of items stay fast).
let lookup = { arr: null, len: -1, src: new Map(), idx: new Map() };
function lookupFresh() { if (lookup.arr !== state.items || lookup.len !== state.items.length) lookup = { arr: state.items, len: state.items.length, src: new Map(state.items.map(i => [i.src, i])), idx: new Map(state.items.map((it, n) => [it, n])) }; return lookup; }
const bySrc = src => lookupFresh().src.get(src);
const idxOf = it => { const n = lookupFresh().idx.get(it); return n == null ? -1 : n; };
const saveLibrary = () => store.set('library', S.get('rememberRecent') ? state.items.filter(i => i.manual).map(i => ({ src: i.src, added: i.added })) : []);
const savePlaylists = () => store.set('playlists3', state.playlists);
const saveRecent = () => store.set('recent2', S.get('rememberRecent') ? state.recent.slice(0, 50) : []);

const isAudio = it => it.type === 'audio';
const AUDIO_RE = /\.(mp3|mp2|mpa|m4a|m4b|aac|flac|wav|w64|ogg|oga|opus|spx|wma|ac3|dts|mka|ape|aiff?|wv|tta|mpc|tak|shn|amr|au|snd|caf|dsf|dff|ra|voc|mid|midi|kar|rmi|smf)$/i;
// A DVD folder is opened through its VIDEO_TS.IFO; show the folder's name instead ("My DVD", not "VIDEO_TS.IFO").
// One title of a DVD is "<disc>#t<n>n<i>" (#35): title n on the disc, shown as "My DVD – Title i" where i counts
// the listed titles 1, 2, 3 … (repeated titles are left out, so the disc's own numbers can skip). Older items: "#t<n>".
const DVD_RE = /(\.iso|[\\/]VIDEO_TS\.IFO)(#t\d+(?:n\d+)?)?$/i;
const itemName = src => {
  const tm = /#t(\d+)(?:n(\d+))?$/.exec(src), file = tm ? src.slice(0, tm.index) : src;
  const disc = /[\\/]VIDEO_TS[\\/]VIDEO_TS\.IFO$/i.test(file) ? (file.split(/[\\/]/).slice(-3, -2)[0] || 'DVD') : baseName(file);
  return tm ? `${disc.replace(/\.iso$/i, '')} – ${t('Title {n}', { n: +(tm[2] || tm[1]) })}` : disc;
};
// A DVD with several titles is added as one item per title, in disc order (the menus themselves cannot be shown).
async function expandDvds(srcs) {
  const out = []; let queue = null;
  for (const s of srcs) {
    if (!DVD_RE.test(s) || /#t\d+(n\d+)?$/.test(s)) { out.push(s); continue; }
    const titles = await api.dvdTitles(s);
    if (titles.length < 2) { out.push(s); continue; }
    const list = titles.map((x, i) => `${s}#t${x.title}n${i + 1}`);
    out.push(...list); queue = queue || list;
  }
  return { srcs: out, queue };
}
const SUB_RE = /\.(srt|vtt|ass|ssa|sub|lrc)$/i;
// TypeScript & co. share .ts with MPEG-TS video; never treat these as media (same rule as main.js)
const NOT_MEDIA_RE = /\.d\.[cm]?ts$|[\\/]node_modules[\\/]|\.(spec|test|config|module|service|component|types?)\.ts$/i;
const PLAYLIST_RE = /\.(m3u8?|xspf|pls)$/i;
const SEP = /[\\/]/;
const baseName = s => { try { return decodeURIComponent(s.split(SEP).pop().split('?')[0]) || s; } catch { return s; } };
const norm = p => p.replace(/[\\/]+$/, '');
const sepOf = p => p.includes('\\') ? '\\' : '/';   // Windows vs. Linux/macOS paths
const under = (p, dir) => { const a = p.toLowerCase(), b = norm(dir).toLowerCase(); return a.startsWith(b + '\\') || a.startsWith(b + '/'); };
const fmt = s => { if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return [h, m, x].map(n => String(n).padStart(2, '0')).join(':'); };
const shortFmt = s => { if (!isFinite(s) || !s) return ''; s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function osd(text) { const o = $('#osd'); o.textContent = t(text); o.classList.add('show'); clearTimeout(osd.t); osd.t = setTimeout(() => o.classList.remove('show'), 1500); }
const isWatched = it => watched.has(it.src);

/* ---------- adding media ---------- */
async function addSources(srcs, { play = true, silent = false, added, manual = true, extra = null, keepLists = false } = {}) {
  const imp = await importPlaylists(srcs.filter(s => !NOT_MEDIA_RE.test(s)), keepLists); srcs = imp.srcs;
  if (!added && srcs.some(s => DVD_RE.test(s))) { const dvd = await expandDvds(srcs); srcs = dvd.srcs; imp.queue = imp.queue || dvd.queue; }
  const subs = srcs.filter(s => SUB_RE.test(s));
  const media = srcs.filter(s => !SUB_RE.test(s));
  const newOnes = []; let first = null;
  for (const src of media) {
    let it = bySrc(src);
    if (!it) {
      const remote = /^[a-z]+:\/\//i.test(src);
      it = { id: ++uid, src, name: itemName(src), remote, type: AUDIO_RE.test(src) ? 'audio' : 'video', thumb: null, duration: 0,
             progress: positions[src] || 0, added: (added && added[src]) || Date.now(), info: null, manual };
      it.ready = enrich(it);
      state.items.push(it); newOnes.push(it);
      const L = lookupFresh(); L.src.set(src, it); L.idx.set(it, state.items.length - 1); L.len = state.items.length;   // keep the maps current without a rebuild
    } else if (manual && !it.manual) it.manual = !S.get('mediaFolders').some(f => under(src, f));
    if (extra) it.extra = extra;
    first = first || it;
  }
  lookup.arr = null;
  if (newOnes.length) saveLibrary();
  renderSoon();
  if (subs.length && state.current >= 0) for (const s of subs) addSubFile(s, true);
  if (play && first && imp.queue) state.queueList = imp.queue.map(bySrc).filter(Boolean);
  if (play && first) playItem(idxOf(first));
  else if (!silent && newOnes.length) osd(t('{n} item(s) added', { n: newOnes.length }));
  return newOnes;
}
// Playlist files (.m3u/.m3u8/.xspf/.pls): their entries are added like opened files and play in the list's order.
// Only "Import playlist…" saves the list under Playlists; opening or dropping one just plays it (#47).
async function importPlaylists(srcs, keep) {
  const out = []; let queue = null;
  for (const s of srcs) {
    if (!PLAYLIST_RE.test(s) || /^[a-z]+:\/\//i.test(s)) { out.push(s); continue; }
    const pl = await api.readPlaylist(s);
    if (!pl) { osd(t('Could not read playlist: {name}', { name: baseName(s) })); continue; }
    if (pl.hls) { out.push(s); continue; }                       // a local HLS stream, not a list
    if (!pl.srcs.length) { osd(t('No playable files in {name}', { name: baseName(s) })); continue; }
    if (keep && !state.playlists.some(p => p.name === pl.name && p.srcs.join('\n') === pl.srcs.join('\n'))) {
      state.playlists.push({ name: pl.name, srcs: pl.srcs, cover: null }); savePlaylists();
      osd(t('Playlist "{name}" imported', { name: pl.name }));
    }
    out.push(...pl.srcs); queue = queue || pl.srcs;
  }
  return { srcs: out, queue };
}
// Built-in playlist with everything in the library.
const ALL_PL = { all: true, cover: null, get name() { return t('All media'); }, get srcs() { return sortItems(state.items).map(i => i.src); }, set srcs(v) {} };
const plByKey = k => k === 'all' ? ALL_PL : state.playlists[+k];
let running = 0; const waiting = [];
function limit(fn, owner) { return new Promise(res => { const go = async () => { running++; try { res(await fn()); } finally { running--; waiting.length && waiting.shift().go(); } }; running < 2 ? go() : waiting.push({ go, owner }); }); }
// The file you want to play now skips the line: a file opened from Explorer at startup would otherwise wait until
// the whole library has been read again (#36).
function hurry(it) { const i = waiting.findIndex(j => j.owner === it); if (i >= 0) waiting.splice(i, 1)[0].go(); }
function enrich(it) {
  return limit(async () => {
    const info = await api.probe(it.src);
    if (info) {
      it.info = info; it.duration = info.duration;
      it.type = info.vcodec ? 'video' : 'audio';
      if (S.get('thumbs') && (info.vcodec || info.cover)) {
        const th = api.thumb(it.src, info.vcodec ? Math.min(info.duration * 0.2, 120) : 0);
        if (it.remote) th.then(t => { if (t) { it.thumb = t; updateCard(it); } });   // a network stream doesn't wait for its thumbnail
        else it.thumb = await th;
      }
    } else if (!it.remote) return dropUnplayable(it);
    updateCard(it); renderLater();
  }, it);
}
// ffmpeg could not open it (not media, or an unsupported/encrypted format): take it out of the library again.
// Files you opened yourself get a message; files found while scanning a folder disappear quietly.
function dropUnplayable(it) {
  const i = idxOf(it); if (i < 0) return;
  if (it.manual) osd(t('Cannot play this file: {name}', { name: it.name }));
  if (state.current === i) stopPlayback();
  const cur = curItem(); state.items.splice(i, 1); state.current = cur ? idxOf(cur) : -1;
  saveLibrary(); renderLater();
}
let rs; function renderSoon() { clearTimeout(rs); rs = setTimeout(render, 80); }
// While a big folder is being read, redraw the whole page at most every 1.5 s; single tiles update right away.
let rl; function renderLater() { if (!rl) rl = setTimeout(() => { rl = null; render(); }, 1500); }
function updateCard(it) { const c = document.querySelector(`#grid .card[data-idx="${idxOf(it)}"]`); if (c) c.outerHTML = cardHTML(it); }

/* media folders */
async function scanFolders() {
  const folders = S.get('mediaFolders');
  const found = new Set();
  for (const f of folders) {
    const paths = await api.expand([f]);
    paths.filter(p => !SUB_RE.test(p)).forEach(p => found.add(p));
    await addSources(paths.filter(p => !SUB_RE.test(p)), { play: false, silent: true, manual: false });
  }
  // drop folder items whose folder was removed or file vanished
  const cur = state.items[state.current];
  state.items = state.items.filter(it => it.manual || it.remote || it === cur || found.has(it.src));
  state.current = cur ? idxOf(cur) : -1;
  render();
}
let curItemRef = null;
async function addFolder(f) {
  if (!S.get('mediaFolders').includes(f)) S.set('mediaFolders', [...S.get('mediaFolders'), f]);
  osd('Scanning folder…');
  await scanFolders();
  osd('Media folder added');
}
async function removeFolder(f) { S.set('mediaFolders', S.get('mediaFolders').filter(x => x !== f)); state.dir = { videos: null, music: null }; await scanFolders(); }

/* ---------- views & navigation ---------- */
const VIEW_TITLES = { home: 'Home', videos: 'Videos', music: 'Music', network: 'Network', playlists: 'Playlists', recent: 'Recent' };
const viewTitle = v => t(v === 'music' && S.get('audioLabel') ? 'Audio' : VIEW_TITLES[v]);
// Rail button for the music section follows the "Audio" naming option.
function applyAudioLabel() { const b = $('#rail [data-view=music]'); if (!b) return; const l = viewTitle('music'); b.title = l; const s = b.querySelector('.lbl'); if (s) { s.textContent = l; s.removeAttribute('data-i18n'); } b.removeAttribute('data-i18n-title'); }
const itemsLabel = n => t(n === 1 ? '1 item' : '{n} items', { n });
const REPEAT_NAMES = { off: 'Off', one: 'Current', all: 'All' };
const typeOf = view => view === 'music' ? 'audio' : 'video';
function sortItems(list) {
  const cmp = { name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }), added: (a, b) => b.added - a.added,
    duration: (a, b) => (a.duration || 0) - (b.duration || 0), album: (a, b) => ((a.info && a.info.album) || '\uffff').localeCompare((b.info && b.info.album) || '\uffff') || a.name.localeCompare(b.name, undefined, { numeric: true }) }[state.sort] || ((a, b) => 0);
  return list.slice().sort(state.sortDesc ? (a, b) => cmp(b, a) : cmp);
}
// entries for the folder browser: { folders:[{path,name,items}], files:[items] }
function browse(view) {
  const type = typeOf(view);
  const pool = state.items.filter(i => i.type === type && !i.remote);
  const roots = S.get('mediaFolders').filter(f => pool.some(i => under(i.src, f)));
  let dir = state.dir[view];
  if (dir && !roots.some(r => norm(r).toLowerCase() === norm(dir).toLowerCase() || under(dir, r))) dir = state.dir[view] = null;
  if (!dir && roots.length === 1) dir = roots[0];
  const loose = pool.filter(i => !roots.some(r => under(i.src, r)));
  if (!dir) return { folders: roots.map(r => folderEntry(r, pool)), files: sortItems(loose), dir: null, roots };
  const folders = new Map(), files = [];
  for (const it of pool) {
    if (!under(it.src, dir)) continue;
    const rest = it.src.slice(norm(dir).length + 1).split(SEP);
    if (rest.length === 1) files.push(it);
    else { const p = norm(dir) + sepOf(dir) + rest[0]; if (!folders.has(p)) folders.set(p, null); }
  }
  return { folders: [...folders.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(p => folderEntry(p, pool)),
           files: sortItems(files).concat(roots.length === 1 && norm(dir) === norm(roots[0]) ? sortItems(loose) : []), dir, roots };
}
function folderEntry(path, pool) { const items = pool.filter(i => under(i.src, path)); return { path, name: baseName(norm(path)), items }; }

function visibleItems() {
  let list;
  const v = state.view;
  if (state.query) {
    const pool = v === 'music' ? state.items.filter(isAudio) : v === 'videos' ? state.items.filter(i => !isAudio(i)) : state.items;
    return sortItems(pool.filter(i => i.name.toLowerCase().includes(state.query)));
  }
  if (v === 'videos' || v === 'music') { const b = browse(v); return b.files; }
  if (v === 'recent') list = state.recent.map(bySrc).filter(Boolean);
  else if (v === 'playlists') list = state.activePlaylist ? state.activePlaylist.srcs.map(bySrc).filter(Boolean) : [];
  else if (v === 'network') list = sortItems(state.items.filter(i => i.remote));
  else list = sortItems(state.items);
  return list;
}
function navigate(patch, push = true) {
  if (push) { history.back.push({ view: state.view, dir: { ...state.dir }, pl: state.activePlaylist }); history.fwd = []; }
  Object.assign(state, patch);
  state.query = ''; $('#search').value = ''; state.gridLimit = 240; state.sideLimit = 400;
  showBrowser(); render();
}
function goBack() { if (mode === 'player') return showBrowser(); const h = history.back.pop(); if (!h) return; history.fwd.push({ view: state.view, dir: { ...state.dir }, pl: state.activePlaylist }); state.view = h.view; state.dir = h.dir; state.activePlaylist = h.pl; render(); }
function goFwd() { const h = history.fwd.pop(); if (!h) return; history.back.push({ view: state.view, dir: { ...state.dir }, pl: state.activePlaylist }); state.view = h.view; state.dir = h.dir; state.activePlaylist = h.pl; render(); }

/* ---------- rendering ---------- */
const ICON_PLAY = icon('play'), ICON_AUDIO = '<svg class="icon" viewBox="0 0 24 24"><circle cx="8" cy="17" r="3"/><path d="M11 17V5l8 2"/></svg>', ICON_VIDEO = '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>';
function cardHTML(it) {
  const idx = idxOf(it);
  const w = isWatched(it), pct = w ? 100 : it.duration ? Math.min(100, it.progress / it.duration * 100) : 0;
  const thumb = S.get('showThumbs') && it.thumb;
  return `<div class="card ${isAudio(it) ? 'audio' : ''} ${idx === state.current ? 'on' : ''} ${w && S.get('dimWatched') ? 'watched' : ''}" data-idx="${idx}" title="${esc(it.src)}">
    <div class="thumb">${thumb ? `<img src="${it.thumb}" alt="">` : `<div class="ph">${isAudio(it) ? '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="17" r="3"/><path d="M11 17V5l8 2"/></svg>' : '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/></svg>'}</div>`}
      ${pct > 1 ? `<div class="prog" style="width:${pct}%"></div>` : ''}
      ${it.duration ? `<span class="dur">${shortFmt(it.duration)}</span>` : ''}
      <div class="play"><svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M7 4l13 8-13 8z"/></svg></div>
    </div><div class="name">${esc(it.name)}</div>
    <div class="c-album">${esc([it.info && it.info.artist, it.info && it.info.album].filter(Boolean).join(' – '))}</div><div class="c-dur">${it.duration ? shortFmt(it.duration) : ''}</div></div>`;
}
// Column header of the list view; click a column to sort, click again to reverse.
const listHead = () => { const col = (k, l) => `<button type="button" data-sort="${k}" class="${state.sort === k ? 'on' + (state.sortDesc ? ' desc' : '') : ''}">${esc(t(l))}</button>`;
  return `<div class="lhead"><span></span>${col('name', 'Title')}${col('album', 'Artist / album')}${col('duration', 'Duration')}</div>`; };
function folderHTML(f) {
  const t = S.get('showThumbs') && f.items.find(i => i.thumb);
  return `<div class="card folder" data-dir="${esc(f.path)}" title="${esc(f.path)}"><div class="thumb">${t ? `<img src="${t.thumb}" alt="">` : ''}<span class="fic">${icon('folder')}</span><span class="fcount">${itemsLabel(f.items.length)}</span></div><div class="name">${esc(f.name)}</div></div>`;
}
const sectionHead = s => `<div style="grid-column:1/-1;font-size:15px;font-weight:600;color:var(--text);margin-top:4px">${esc(t(s))}</div>`;

function render() {
  lookup.arr = null;                                          // refresh the path/position maps once per redraw
  curItemRef = state.items[state.current] || null;
  const cur = curItemRef, v = state.view;
  $$('#rail [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  document.body.classList.toggle('nav-expanded', S.get('navExpanded'));
  $('#crumbText').textContent = viewTitle(v);

  // breadcrumb
  const crumbs = [[viewTitle(v), () => navigate(v === 'playlists' ? { activePlaylist: null } : { dir: { ...state.dir, [v]: null } })]];
  let b = null;
  if ((v === 'videos' || v === 'music') && !state.query) {
    b = browse(v);
    if (b.dir) {
      const root = b.roots.find(r => norm(b.dir).toLowerCase() === norm(r).toLowerCase() || under(b.dir, r));
      const rel = b.dir.slice(norm(root).length).split(SEP).filter(Boolean);
      if (b.roots.length > 1) crumbs.push([baseName(norm(root)), () => navigate({ dir: { ...state.dir, [v]: root } })]);
      rel.forEach((seg, i) => { const p = norm(root) + sepOf(root) + rel.slice(0, i + 1).join(sepOf(root)); crumbs.push([seg, () => navigate({ dir: { ...state.dir, [v]: p } })]); });
    }
  }
  if (v === 'playlists' && state.activePlaylist) crumbs.push([state.activePlaylist.name, null]);
  if (state.query) crumbs.push([t('Search: "{q}"', { q: state.query }), null]);
  const path = $('#pathText'); path.replaceChildren();
  crumbs.forEach(([label, fn], i) => {
    if (i) path.append(el('span.crumb-sep', { text: '▶' }));
    path.append(el('button.crumb' + (i === crumbs.length - 1 ? '.last' : ''), { type: 'button', onclick: fn && i < crumbs.length - 1 ? fn : null }, label));
  });
  $('#navBack').style.opacity = history.back.length || mode === 'player' ? 1 : .35;
  $('#navFwd').style.opacity = history.fwd.length ? 1 : .35;

  // grid
  const grid = $('#grid'); grid.classList.toggle('list', state.list);
  let html = '', count = 0;
  if (v === 'home' && !state.query) {
    const cont = state.items.filter(i => positions[i.src] && !isWatched(i)).slice(0, 10);
    const recentAdded = sortItems(state.items).sort((a, b) => b.added - a.added).slice(0, 15);
    if (cont.length) html += sectionHead('Continue watching') + cont.map(cardHTML).join('');
    if (recentAdded.length) html += sectionHead('Recently added') + recentAdded.map(cardHTML).join('');
    count = state.items.length;
  } else if (v === 'playlists' && !state.activePlaylist && !state.query) {
    html = `<div class="card" data-pl="all"><div class="thumb" style="background:var(--panel2);display:grid;place-items:center"><span class="fic" style="color:var(--accent)">${icon('library', 'icon big')}</span><span class="fcount" style="position:absolute;left:8px;bottom:6px;font-size:11px;color:#fff;background:#000a;padding:1px 6px;border-radius:3px">${itemsLabel(state.items.length)}</span></div><div class="name">${esc(t('All media'))}</div></div>`
      + state.playlists.map((p, i) => `<div class="card" data-pl="${i}"><div class="thumb" style="background:${p.cover ? `url('${p.cover}') center/cover` : 'var(--panel2)'};display:grid;place-items:center">${p.cover ? '' : `<span class="fic" style="color:var(--muted)">${icon('playlist', 'icon big')}</span>`}<span class="fcount" style="position:absolute;left:8px;bottom:6px;font-size:11px;color:#fff;background:#000a;padding:1px 6px;border-radius:3px">${itemsLabel(p.srcs.length)}</span></div><div class="name">${esc(p.name)}</div></div>`).join('')
      + `<div class="card" data-act="newpl"><div class="thumb" style="background:transparent;border:1px dashed var(--line);display:grid;place-items:center;color:var(--muted)">${icon('plus', 'icon big')}</div><div class="name" style="color:var(--muted)">${esc(t('Create playlist'))}</div></div>`
      + `<div class="card" data-act="importpl"><div class="thumb" style="background:transparent;border:1px dashed var(--line);display:grid;place-items:center;color:var(--muted)">${icon('download', 'icon big')}</div><div class="name" style="color:var(--muted)">${esc(t('Import playlist…'))}</div></div>`;
    count = state.playlists.length;
  } else {
    const list = visibleItems();
    if (state.list && list.length) html += listHead();
    if (b && !state.query) html += b.folders.map(folderHTML).join('');
    html += list.slice(0, state.gridLimit).map(cardHTML).join('');
    count = list.length + (b && !state.query ? b.folders.length : 0);
  }
  grid.innerHTML = html;
  $('#count').textContent = count ? itemsLabel(count) : '';
  const empty = $('#empty'); const isEmpty = !html;
  empty.classList.toggle('show', isEmpty);
  if (isEmpty) {
    const T = (a, b) => { $('#emptyTitle').textContent = t(a); $('#emptyText').textContent = t(b); };
    if (state.query) T('Nothing found', 'Try a different search term.');
    else if (v === 'playlists') T('Playlist is empty', 'Right-click a video or song and choose "Add to playlist".');
    else if (v === 'network') T('Network streams', 'Open a URL (http/https, including .m3u8 streams).');
    else if (v === 'recent') T('Nothing played yet', 'Recently played media will appear here.');
    else if (v === 'music') T('No music yet', 'Add a media folder or drag audio files here.');
    else T('No media yet', 'Add a media folder, drag files here or open a file.');
  }
  renderSide();
  $('#wintitle').textContent = cur ? cur.name : 'VLC Redesign';
  document.title = cur ? cur.name + ' - VLC Redesign' : 'VLC Redesign';
  updateMini();
}
function renderSide() {
  const v = state.view; let html = '', title = viewTitle(v), n = 0;
  if (state.sideMode === 'queue') {
    title = t('Queue');
    const q = queue(); n = q.length;
    html = q.map(it => { const idx = idxOf(it); return `<div class="srow ${idx === state.current ? 'on' : ''}" data-idx="${idx}" title="${esc(it.src)}">${idx === state.current ? ICON_PLAY : (isAudio(it) ? ICON_AUDIO : ICON_VIDEO)}<span>${esc(it.name)}</span></div>`; }).join('');
  } else if (v === 'playlists') {
    n = state.playlists.length;
    html = `<div class="srow muted" data-act="newpl">${icon('plus')}<span>${esc(t('Create playlist'))}</span></div>` +
      `<div class="srow muted" data-act="importpl">${icon('download')}<span>${esc(t('Import playlist…'))}</span></div>` +
      `<div class="srow ${state.activePlaylist === ALL_PL ? 'on' : ''}" data-pl="all">${icon('library')}<span>${esc(t('All media'))}</span></div>` +
      state.playlists.map((p, i) => `<div class="srow ${state.activePlaylist === p ? 'on' : ''}" data-pl="${i}">${p.cover ? `<span class="cov" style="background-image:url('${p.cover}')"></span>` : icon('playlist')}<span>${esc(p.name)}</span></div>`).join('');
  } else {
    let entries = [];
    if ((v === 'videos' || v === 'music') && !state.query) { const b = browse(v); entries = b.folders.map(f => `<div class="srow" data-dir="${esc(f.path)}">${icon('folder')}<span>${esc(f.name)}</span></div>`); }
    const list = visibleItems(); n = list.length + entries.length;
    html = entries.join('') + list.slice(0, state.sideLimit).map(it => { const idx = idxOf(it); return `<div class="srow ${idx === state.current ? 'on' : ''}" data-idx="${idx}" title="${esc(it.src)}">${idx === state.current ? ICON_PLAY : (isAudio(it) ? ICON_AUDIO : ICON_VIDEO)}<span>${esc(it.name)}</span></div>`; }).join('');
    if (!n) html = `<div class="srow muted" data-act="files">${icon('plus')}<span>${esc(t('Add media'))}</span></div>`;
  }
  $('#sideTitle').textContent = title;
  $('#sideCount').textContent = itemsLabel(n);
  $('#sideList').innerHTML = html;
}

let mode = 'browser';
function showPlayer() { if (fsForLibrary && !document.fullscreenElement) { fsForLibrary = false; document.documentElement.requestFullscreen().catch(() => {}); } mode = 'player'; document.body.classList.add('in-player'); $('#player').classList.add('show'); $('#browser').style.visibility = 'hidden'; updateMini(); updateFocus(); render && $('#navBack') && ($('#navBack').style.opacity = 1); }
// The library never stays in fullscreen: on Windows the taskbar can sit on top of a fullscreen window and hide the
// bottom bar and the last rows (#31). Leaving the player exits fullscreen; going back to the player restores it.
let fsForLibrary = false;
function showBrowser() { if (document.fullscreenElement) { fsForLibrary = true; document.exitFullscreen().catch(() => {}); } mode = 'browser'; document.body.classList.remove('in-player'); $('#player').classList.remove('show'); $('#browser').style.visibility = ''; updateMini(); updateFocus(); }
// While media plays (video or music), the rail and library panel collapse so the player gets the full width (setting autoHideSide).
// The sidebar button brings them back until the next video starts.
let sideOverride = false;
function updateFocus() {
  const it = state.items[state.current];
  document.body.classList.toggle('focus-video', !!(S.get('autoHideSide') && mode === 'player' && it && !sideOverride));
}
function updateMini() { const cur = state.items[state.current]; $('#mini').classList.toggle('show', !!(mode === 'browser' && cur && S.get('miniPlayer'))); if (cur) $('#miniName').textContent = cur.name; }

/* ---------- playback engine: direct or ffmpeg-transcoded ---------- */
const P = { offset: 0, tx: false, vcopy: false, audio: 0, pendingSeek: 0, seekTarget: null, retried: false };
const curItem = () => state.items[state.current];
const curTime = () => P.seekTarget != null ? P.seekTarget : P.offset + (video.currentTime || 0);
function curDur() { const it = curItem(), d = video.duration; if (P.tx) return (it && it.duration) || 0; return isFinite(d) && d > 0 ? d : ((it && it.duration) || 0); }
const OK_V = ['h264', 'vp8', 'vp9', 'av1', 'hevc', 'theora'];
const OK_A = ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'pcm_u8'];
const OK_F = /mov|mp4|matroska|webm|ogg|mp3|flac|wav|aac/;
api.setSoundfont(S.get('soundfont') || '');
S.on(async k => { if (k !== 'soundfont') return; await api.setSoundfont(S.get('soundfont') || ''); const it = curItem(); if (it && MIDI_RE.test(it.src)) reloadSource(); });
const needsTx = it => S.get('forceTx') || !canDirect(it.info) || !!it.extra;
function canDirect(info) {
  if (!info) return true;
  if (!OK_F.test(info.format)) return false;
  if (info.vcodec && !OK_V.includes(info.vcodec)) return false;
  const a = info.audio[P.audio] || info.audio[0];
  if (a && !OK_A.includes(a.codec)) return false;
  return P.audio === 0;
}
function setSpinner(on) { $('#spinner').classList.toggle('show', on); }
function setBadge() { const b = $('#badge'); b.textContent = P.tx ? t(P.vcopy ? 'ffmpeg · audio converted' : 'ffmpeg · converted') : ''; b.classList.toggle('show', P.tx && S.get('showBadge')); }

let loadSeq = 0;
async function loadSource(at, autoplay) {
  const it = curItem(); if (!it) return;
  const seq = ++loadSeq;
  if (P.tx) {
    P.vcopy = !!(it.info && it.info.vcodec === 'h264' && /^yuv420p$/.test(it.info.pix || '') && !P.forceReencode);
    if (P.vcopy && at > 0) {   // copied video starts on a keyframe: start exactly there so the clock stays in sync
      P.seekTarget = at; setSpinner(true);
      const kf = await api.keyframe(it.src, at);
      if (seq !== loadSeq || curItem() !== it) return;
      if (kf != null) at = kf;
    }
    P.seekTarget = null; P.offset = at; P.pendingSeek = 0;
    video.src = streamUrl(it.src, at, P.audio, P.vcopy, it.extra ? 2 : outChannels(it)) + (it.extra ? '&extra=' + encodeURIComponent(it.extra) : '');
  } else {
    P.seekTarget = null; P.offset = 0; P.pendingSeek = at;
    video.src = it.remote ? it.src : fileUrl(it.src);
  }
  FX.setChannels(P.tx && it.extra ? 2 : outChannels(it), srcChannels(it));
  video.playbackRate = S.get('speed') || 1;
  setBadge(); setSpinner(true);
  if (autoplay) video.play().catch(() => {});
}
// Surround (#44): the channels of the audio track, as 5.1 (6) or 7.1 (8) when there are more than two and the
// setting is on; Chromium mixes that down itself if the speakers have fewer channels.
const srcChannels = it => { const a = it && it.info && (it.info.audio[P.audio] || it.info.audio[0]); return (a && a.ch) || 2; };
function outChannels(it) { const c = srcChannels(it); return S.get('surround') === false || c <= 2 ? 2 : c > 6 ? 8 : 6; }
S.on(k => { if (k === 'surround' && curItem()) { if (P.tx) reloadSource(); else FX.setChannels(outChannels(curItem()), srcChannels(curItem())); } });
function reloadSource() { const it = curItem(); if (!it) return; P.tx = needsTx(it) || P.audio > 0; loadSource(curTime(), !video.paused); }

function setIdle(it) {
  const idle = $('#idle'), showVideo = it && !isAudio(it) && video.videoWidth;
  $('#player').classList.toggle('playing-video', !!showVideo);
  if (showVideo) { idle.innerHTML = ''; return; }
  const art = it && isAudio(it) && (it.cover || it.thumb);
  renderAudioBg(it);
  idle.innerHTML = art ? `<div class="np-cover" style="background-image:url('${art}')"></div>` : `<div class="catbox">${catSVG('pixcat')}</div>`;
}
async function playItem(idx, autoplay = true) {
  const it = state.items[idx]; if (!it) return;
  savePos();
  abClear(true);
  state.current = idx; P.audio = 0; P.retried = false; P.forceReencode = false; P.fit = true; sideOverride = false;
  showPlayer(); render(); setSpinner(true);
  video.removeAttribute('src'); video.load();
  clearSubs(); setIdle(it);
  hurry(it); await it.ready;
  if (curItem() !== it) return;
  P.tx = needsTx(it);
  const resumeAt = S.get('resume') && positions[it.src] && positions[it.src] < (it.duration || 1e9) - 5 ? positions[it.src] : 0;
  loadSource(resumeAt, autoplay);
  if (resumeAt) osd(t('Resuming from {time}', { time: shortFmt(resumeAt) }));
  setIdle(it);
  if (S.get('rememberRecent')) { state.recent = [it.src, ...state.recent.filter(s => s !== it.src)]; saveRecent(); }
  setupSubs(it); renderMarks();
  buildStoryboard(it);
  updateMediaSession(it);
  if (isAudio(it) && it.info && it.info.cover && !it.cover) api.cover(it.src).then(c => { if (!c) return; it.cover = c; if (curItem() === it) { setIdle(it); renderLyrics(); updateMediaSession(it); } });
  render(); quick && quick.refresh();
}
video.addEventListener('loadedmetadata', () => {
  const it = curItem(); if (!it) return;
  if (!P.tx && P.pendingSeek) { video.currentTime = P.pendingSeek; P.pendingSeek = 0; }
  if (!P.tx && isFinite(video.duration) && video.duration > 0) it.duration = video.duration;
  if (!P.tx && it.info && it.info.vcodec && !video.videoWidth) return fallbackToTx('Video codec not supported');
  setIdle(it);
  if (P.fit && video.videoWidth) { P.fit = false; fitWindow(); }
});
// Resize the window to the video's aspect ratio once per new video (setting fitWindow); main caps it at 70% of the screen.
function fitWindow() {
  if (!S.get('fitWindow') || document.fullscreenElement || document.body.classList.contains('fullscreen')) return;
  setTimeout(() => {                                          // after the sidebar collapse transition
    const pl = $('#player'), vw = video.videoWidth, vh = video.videoHeight;
    if (mode !== 'player' || !vw || !pl.clientWidth) return;
    const z = S.get('uiScale') / 100;                          // CSS px → window px when the interface is scaled
    api.fitWindow({ chromeW: (innerWidth - pl.clientWidth) * z, chromeH: (innerHeight - pl.clientHeight) * z, vw, vh });
  }, 260);
}
video.addEventListener('error', () => {
  if (!curItem() || !video.getAttribute('src')) return;
  if (!P.tx) return fallbackToTx('Format not supported');
  if (P.vcopy && !P.forceReencode) { P.forceReencode = true; return loadSource(curTime(), true); }
  setSpinner(false); osd('Cannot play this file');
});
function fallbackToTx(why) {
  if (P.retried) return; P.retried = true;
  const t = P.pendingSeek || video.currentTime || 0;
  P.tx = true; osd(t('{reason} – converting with ffmpeg…', { reason: t(why) })); loadSource(t, true);
}
video.addEventListener('waiting', () => setSpinner(true));
video.addEventListener('playing', () => setSpinner(false));
video.addEventListener('canplay', () => setSpinner(false));
video.addEventListener('play', setPlayIcon);
video.addEventListener('pause', () => { setPlayIcon(); savePos(); });
video.addEventListener('ended', () => {
  const it = curItem();
  if (it) { it.progress = 0; delete positions[it.src]; store.set('pos', positions); watched.add(it.src); saveWatched(); }
  if (AB.b != null) { P.tx ? loadSource(AB.a, true) : (video.currentTime = AB.a, video.play()); return; }   // B at the very end
  if (S.get('repeat') === 'one') { P.tx ? loadSource(0, true) : (video.currentTime = 0, video.play()); }
  else if (S.get('autoNext') || S.get('repeat') === 'all') step(1, true);
  else { setPlayIcon(); render(); }
});
video.addEventListener('timeupdate', updateTime);
video.addEventListener('progress', updateTime);
video.addEventListener('durationchange', () => { updateTime(); renderMarks(); });
video.addEventListener('ratechange', () => { if (Math.abs(video.playbackRate - S.get('speed')) > 1e-6) S.set('speed', +video.playbackRate.toFixed(2)); });
setInterval(() => { if (!video.paused) savePos(); }, 5000);

let txSeekTimer;
function seekTo(t) {
  const d = curDur(); t = Math.max(0, Math.min(d ? d - 0.5 : t, t));
  if (!P.tx) { video.currentTime = t; return; }
  P.seekTarget = t; updateTime();
  clearTimeout(txSeekTimer);
  txSeekTimer = setTimeout(() => loadSource(t, true), 250);
}
function togglePlay() {
  if (state.current < 0) { const v = visibleItems()[0] || state.items[0]; if (v) playItem(idxOf(v)); else doAct('files'); return; }
  if (video.paused) video.play().catch(() => {}); else video.pause();
  flashBig();
}
function flashBig() { const d = $('#bigplay div'); $('#bigIcon').innerHTML = video.paused ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4l13 8-13 8z"/>'; d.classList.add('flash'); clearTimeout(flashBig.t); flashBig.t = setTimeout(() => d.classList.remove('flash'), 350); }
function queue() {
  if (state.queueList && state.queueList.some(i => idxOf(i) === state.current)) return state.queueList;
  const v = state.query ? visibleItems() : (state.view === 'home' ? sortItems(state.items) : visibleItems());
  return v.some(i => idxOf(i) === state.current) ? v : (curItem() && !curItem().remote && S.get('mediaFolders').length ? siblingsOf(curItem()) : state.items);
}
function siblingsOf(it) { const dir = it.src.split(SEP).slice(0, -1).join('\\'); return sortItems(state.items.filter(i => i.type === it.type && i.src.split(SEP).slice(0, -1).join('\\') === dir)); }
function step(dir, auto) {
  const q = queue(); if (!q.length) return;
  if (S.get('shuffle') && q.length > 1) { let n; do { n = q[Math.floor(Math.random() * q.length)]; } while (idxOf(n) === state.current); return playItem(idxOf(n)); }
  let pos = q.findIndex(i => idxOf(i) === state.current) + dir;
  if (pos >= q.length) { if (S.get('repeat') === 'all') pos = 0; else { setPlayIcon(); render(); return auto ? null : osd('End of the list'); } }
  if (pos < 0) pos = S.get('repeat') === 'all' ? q.length - 1 : 0;
  playItem(idxOf(q[pos]));
}
function prev() { if (curTime() > 3) return seekTo(0); step(-1); }
function stopPlayback() { stopRecord(); savePos(); video.pause(); video.removeAttribute('src'); video.load(); state.current = -1; clearSubs(); P.tx = false; setBadge(); setSpinner(false); setIdle(null); showBrowser(); render(); updateTime(); setPlayIcon(); }
function savePos() {
  const it = curItem(); const d = curDur(); if (!it || !d) return;
  const t = curTime(); it.progress = t;
  if (t > d * 0.95) { watched.add(it.src); saveWatched(); }
  if (S.get('resume') && t > 5 && t < d - 5) positions[it.src] = Math.floor(t); else delete positions[it.src];
  store.set('pos', positions);
}
function setPlayIcon() {
  const p = video.paused;
  $('#playIcon').innerHTML = p ? '<path d="M6 4l14 8-14 8z"/>' : '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
  $('#miniPlay').innerHTML = icon(p ? 'play' : 'pause');
  $('#playBtn').title = t(p ? 'Play (Space)' : 'Pause (Space)');
}
let dragging = false;
function updateTime() {
  const d = curDur(), t = curTime();
  $('#cur').textContent = fmt(t); $('#dur').textContent = fmt(d);
  if (!dragging) setSeekUI(d ? t / d : 0);
  let buf = 0; try { if (video.buffered.length) buf = (P.offset + video.buffered.end(video.buffered.length - 1)) / d; } catch {}
  $('#seekBuf').style.width = Math.min(100, buf * 100 || 0) + '%';
  $('#miniProg div').style.width = (d ? t / d * 100 : 0) + '%';
  $('#miniTime').textContent = shortFmt(t) || '0:00';
}
function setSeekUI(f) { f = Math.min(1, Math.max(0, f || 0)); $('#seekFill').style.width = f * 100 + '%'; $('#seekHandle').style.left = f * 100 + '%'; }

/* ---------- chapters (embedded) and bookmarks (your own), #40 ---------- */
// Bookmarks are kept per file: { src: [{ t, name }] }, sorted by time.
const bookmarks = store.get('bookmarks', {});
const chaptersOf = it => (it && it.info && it.info.chapters) || [];
const bookmarksOf = it => (it && bookmarks[it.src]) || [];
function setBookmarks(it, list) {
  list = list.filter(b => isFinite(b.t) && b.t >= 0).map(b => ({ t: Math.round(b.t * 1000) / 1000, name: String(b.name || '').trim() })).sort((a, b) => a.t - b.t);
  if (list.length) bookmarks[it.src] = list; else delete bookmarks[it.src];
  store.set('bookmarks', bookmarks); renderMarks();
}
function addBookmark(at = curTime(), name) {
  const it = curItem(); if (!it) return;
  const list = bookmarksOf(it);
  if (list.some(b => Math.abs(b.t - at) < 0.5)) return osd('There is already a bookmark here');
  setBookmarks(it, [...list, { t: at, name: name || t('Bookmark {n}', { n: list.length + 1 }) }]);
  osd(t('Bookmark added at {time}', { time: fmt(at) }));
}
// Chapter starts and bookmarks as one sorted list of jump points
const markTimes = it => [...new Set([...chaptersOf(it).map(c => c.start), ...bookmarksOf(it).map(b => b.t)].map(x => Math.round(x * 10) / 10))].sort((a, b) => a - b);
function jumpMark(dir) {
  const it = curItem(); if (!it) return;
  const now = curTime(), times = markTimes(it);
  // "previous" within 2 s after a mark goes to the mark before it, like ⏮ on a CD player
  const target = dir > 0 ? times.find(x => x > now + 0.5) : [...times].reverse().find(x => x < now - 2);
  if (target == null) { if (dir < 0) seekTo(0); return osd(dir > 0 ? 'No next chapter' : 'Start'); }
  seekTo(target);
  const label = markLabel(it, target + 0.01);
  osd(label ? `${label} · ${fmt(target)}` : fmt(target));
}
// The name for a moment: a bookmark close to it (within 1% of the length), otherwise the chapter it lies in
function markLabel(it, at) {
  const d = curDur() || it.duration || 0, near = Math.max(1, d * 0.01);
  const b = bookmarksOf(it).find(x => Math.abs(x.t - at) <= near);
  if (b) return b.name;
  const ch = chaptersOf(it); let c = null;
  for (const x of ch) if (x.start <= at + 0.001) c = x;
  return c ? (c.title || t('Chapter {n}', { n: ch.indexOf(c) + 1 })) : '';
}
function renderMarks() {
  const box = $('#seekMarks'), it = curItem(), d = curDur();
  if (!it || !d) return box.replaceChildren();
  const pct = x => Math.min(100, Math.max(0, x / d * 100)) + '%';
  const mk = (cls, left, title) => { const n = document.createElement('i'); n.className = cls; n.style.left = left; if (title) n.title = title; return n; };
  box.replaceChildren(
    ...chaptersOf(it).filter(c => c.start > 0.5 && c.start < d - 0.5).map(c => mk('chap', pct(c.start))),
    ...bookmarksOf(it).map(b => mk('bmark', pct(b.t), `${b.name} · ${fmt(b.t)}`)));
  if (AB.a != null) {                                        // A-B repeat: the looped part, or just A while B is not set yet
    const r = mk('abzone' + (AB.b == null ? ' open' : ''), pct(AB.a));
    r.style.width = AB.b != null ? `calc(${pct(AB.b)} - ${pct(AB.a)})` : '0';
    box.append(r);
  }
}
/* ---------- A-B repeat (#42): loop the part between two points ---------- */
const AB = { a: null, b: null };
// One key cycles like VLC: set A → set B (the loop starts) → off
function abCycle() {
  if (!curItem()) return;
  const now = curTime();
  if (AB.a == null || AB.b != null) { if (AB.b != null) return abClear(); AB.a = now; osd(t('A-B repeat: A set at {time}', { time: fmt(now) })); }
  else if (now <= AB.a + 0.3) return osd('Point B must come after point A');
  else { AB.b = now; seekTo(AB.a); osd(t('A-B repeat: {a} – {b}', { a: fmt(AB.a), b: fmt(AB.b) })); }
  renderMarks();
}
function abSet(which) {
  const now = curTime(); if (!curItem()) return;
  if (which === 'a') { AB.a = now; if (AB.b != null && AB.b <= now + 0.3) AB.b = null; }
  else { if (AB.a == null) AB.a = 0; if (now <= AB.a + 0.3) return osd('Point B must come after point A'); AB.b = now; seekTo(AB.a); }
  osd(AB.b != null ? t('A-B repeat: {a} – {b}', { a: fmt(AB.a), b: fmt(AB.b) }) : t('A-B repeat: A set at {time}', { time: fmt(AB.a) }));
  renderMarks();
}
function abClear(quiet) { const was = AB.a != null; AB.a = AB.b = null; renderMarks(); if (was && !quiet) osd('A-B repeat off'); }
// The rest of the A-B loop runs in the frame loop below: past B → back to A
// The lyric line sung at a moment (synced .lrc), for the timeline preview of music (#41); '♪' between lines
function lyricAt(at) {
  const lines = LYR.hover; if (!lines) return '';
  let i = -1; for (let lo = 0, hi = lines.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (lines[m].t <= at + 0.05) { i = m; lo = m + 1; } else hi = m - 1; }
  return i < 0 ? '' : (lines[i].text || '♪');
}
// Preview label: long names scroll slowly back and forth instead of being cut off
function setPvTitle(text) {
  const box = $('#seekPreview .pv-title'), span = box.firstChild;
  box.hidden = !text; span.textContent = text || ''; box.classList.remove('roll');
  if (!text) return;
  const over = span.scrollWidth - box.clientWidth;
  if (over > 4) { box.style.setProperty('--roll', -over + 'px'); box.style.setProperty('--roll-time', Math.max(4, over / 25) + 's'); box.classList.add('roll'); }
}

const seek = $('#seek');
const frac = (e, elm) => { const r = elm.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
seek.addEventListener('pointerdown', e => { if (!curDur()) return; dragging = true; seek.setPointerCapture(e.pointerId); setSeekUI(frac(e, seek)); });
seek.addEventListener('pointermove', e => { const f = frac(e, seek); const tip = $('#seekTip'); tip.style.left = f * 100 + '%'; const lb = curItem() && markLabel(curItem(), f * curDur()); tip.textContent = lb ? `${lb} · ${fmt(f * curDur())}` : fmt(f * curDur()); if (dragging) setSeekUI(f); preview(e, f); });
seek.addEventListener('pointerleave', () => { if (!dragging) schedulePreviewHide(); });

/* ---------- timeline hover preview (design: frame card with the time above the seek bar) ---------- */
const pvBox = $('#seekPreview'), pvCanvas = $('#seekPreview canvas'), pvCtx = pvCanvas.getContext('2d'), pvTime = $('#seekPreview > span');
const pvVideo = document.createElement('video');            // hidden second decoder for direct-playable files
pvVideo.muted = true; pvVideo.preload = 'auto'; pvVideo.crossOrigin = 'anonymous';
const catImg = new Image(); catImg.src = 'data:image/svg+xml,' + encodeURIComponent(catSVG());
const pvCache = new Map();                                   // ffmpeg frames: "src@seconds" -> Image
let pvSrc = '', pvWant = null, pvBusy = false, pvTimer = null, pvKey = '';
// Calm hover behaviour: show after a short rest, hide with a short grace period, and only fetch a new
// frame when the pointer has (almost) stopped on a different time step.
let pvShowT = null, pvHideT = null, pvFrameT = null, pvStep = -1, pvLast = null;
function hidePreview() {
  clearTimeout(pvShowT); clearTimeout(pvHideT); clearTimeout(pvTimer); clearTimeout(pvFrameT);
  pvShowT = pvHideT = null; pvBox.classList.remove('show'); seek.classList.remove('pv'); pvWant = null; pvStep = -1;
}
function schedulePreviewHide() { clearTimeout(pvShowT); pvShowT = null; clearTimeout(pvHideT); pvHideT = setTimeout(hidePreview, 250); }
function pvStage() {                                         // empty stage with the pixel cat, like the idle player
  const c = pvCanvas, cs = getComputedStyle(document.documentElement);
  pvCtx.fillStyle = cs.getPropertyValue('--stage').trim() || '#2a2928'; pvCtx.fillRect(0, 0, c.width, c.height);
  pvCtx.fillStyle = cs.getPropertyValue('--floor').trim() || '#252423'; pvCtx.fillRect(0, c.height * 0.68, c.width, c.height * 0.32);
  const h = c.height * 0.42, w = h * 18 / 17;
  pvCtx.imageSmoothingEnabled = false; pvCtx.drawImage(catImg, (c.width - w) / 2, c.height * 0.68 - h, w, h); pvCtx.imageSmoothingEnabled = true;
}
function pvDraw(src, sw, sh) {
  const c = pvCanvas, r = Math.min(c.width / sw, c.height / sh), w = sw * r, h = sh * r;
  pvCtx.fillStyle = '#000'; pvCtx.fillRect(0, 0, c.width, c.height);
  try { pvCtx.drawImage(src, (c.width - w) / 2, (c.height - h) / 2, w, h); } catch { pvStage(); }
}
function pvSeekNext() {
  if (pvWant == null) { pvBusy = false; return; }
  if (pvVideo.readyState < 1) { pvBusy = true; pvVideo.onloadedmetadata = () => { pvVideo.onloadedmetadata = null; pvSeekNext(); }; return; }
  pvBusy = true;
  const target = pvWant; pvWant = null;
  pvVideo.onseeked = () => { if (pvVideo.videoWidth) pvDraw(pvVideo, pvVideo.videoWidth, pvVideo.videoHeight); pvSeekNext(); };
  pvVideo.currentTime = Math.min(target, Math.max(0, (pvVideo.duration || target) - 0.1));
}
function preview(e, f) {
  const it = curItem(), d = curDur();
  // music has no picture (#27): a text-only card with the lyric line or chapter, otherwise just the time tooltip (#41)
  const card = !!(S.get('seekPreview') && it && d && !(isAudio(it) && !LYR.hover && !markTimes(it).length));
  // with a card coming, the small time tooltip stays hidden: otherwise both pop up one after the other (#43)
  seek.classList.toggle('cardmode', card);
  if (!card) return hidePreview();
  clearTimeout(pvHideT); pvHideT = null;
  pvLast = { x: e.clientX, f };
  if (!pvBox.classList.contains('show')) {                    // wait until the pointer rests briefly before showing
    clearTimeout(pvShowT);                                   // restart on every move: fast sweeps never pop the card up
    pvShowT = setTimeout(() => { pvShowT = null; if (pvLast) showPreview(); }, dragging ? 0 : 160);
    return;
  }
  showPreview();
}
/* storyboard: small frames across the whole file, made in the background so the hover preview is instant */
const SB = { src: null, step: 0, n: 0, frames: [], job: 0 };
function buildStoryboard(it) {
  const job = ++SB.job;
  Object.assign(SB, { src: it.src, step: 0, n: 0, frames: [] });
  const d = it.duration;
  if (!d || isAudio(it) || it.remote || !S.get('seekPreview')) return;
  const n = Math.max(24, Math.min(160, Math.round(d / 3)));
  Object.assign(SB, { step: d / n, n });
  const order = [];                                          // coarse-to-fine, so the whole timeline is covered quickly
  for (let gap = 64; gap >= 1; gap >>= 1) for (let i = 0; i < n; i += gap) if (!order.includes(i)) order.push(i);
  let next = 0;
  const worker = async () => {
    while (SB.job === job && next < order.length) {
      const i = order[next++];
      const url = await api.frame(it.src, Math.min(d - 0.3, (i + 0.5) * SB.step), 240);
      if (SB.job !== job) return;
      if (url) { const img = new Image(); img.src = url; try { await img.decode(); } catch {} SB.frames[i] = img; }
    }
  };
  setTimeout(() => { if (SB.job === job) for (let k = 0; k < 3; k++) worker(); }, 1200);
}
function sbNearest(at) {
  if (!SB.n) return null;
  const i0 = Math.min(SB.n - 1, Math.max(0, Math.floor(at / SB.step)));
  for (let r = 0; r < SB.n; r++) { if (SB.frames[i0 - r]) return SB.frames[i0 - r]; if (SB.frames[i0 + r]) return SB.frames[i0 + r]; }
  return null;
}
function showPreview() {
  const it = curItem(), d = curDur(); if (!it || !d) return;
  const { x: cx, f } = pvLast, at = f * d;
  seek.classList.add('pv'); pvBox.classList.add('show');
  const r = seek.getBoundingClientRect(), half = pvBox.offsetWidth / 2;
  const x = Math.min(innerWidth - half - 8, Math.max(half + 8, cx));   // keep the card inside the window
  pvBox.style.left = (x - r.left) + 'px';
  pvTime.textContent = fmt(at);
  pvBox.classList.toggle('textonly', isAudio(it));
  const label = (isAudio(it) && lyricAt(at)) || markLabel(it, at);   // lyric line, or chapter / bookmark name (#40, #41)
  if (label !== (pvBox.dataset.label || '')) { pvBox.dataset.label = label; setPvTitle(label); }
  if (isAudio(it)) return;
  if (it.remote) return pvStage();
  // instant: nearest storyboard frame; then the exact frame once the pointer slows down
  const stepLen = Math.max(0.5, d / 300), step = Math.round(at / stepLen);
  if (step === pvStep) return;
  if (SB.src === it.src) { const img = sbNearest(at); if (img) pvDraw(img, img.naturalWidth, img.naturalHeight); }
  clearTimeout(pvFrameT);
  pvFrameT = setTimeout(() => { pvStep = step; requestFrame(it, Math.min(d, step * stepLen)); }, P.tx ? 140 : 40);
}
function requestFrame(it, at) {
  if (!P.tx) {                                               // direct file: seek the hidden <video>
    const url = fileUrl(it.src);
    if (pvSrc !== url) { pvSrc = url; pvVideo.src = url; }
    pvWant = at; if (!pvBusy) pvSeekNext();
    return;
  }
  const sec = Math.round(at / 2) * 2, key = it.src + '@' + sec;   // transcoded file: ask ffmpeg, 2 s buckets
  pvKey = key;
  const hit = pvCache.get(key);
  if (hit) return pvDraw(hit, hit.naturalWidth, hit.naturalHeight);
  clearTimeout(pvTimer);
  pvTimer = setTimeout(async () => {
    const url = await api.frame(it.src, sec, 320);
    if (!url) return;
    const img = new Image();
    img.onload = () => {
      pvCache.set(key, img); if (pvCache.size > 80) pvCache.delete(pvCache.keys().next().value);
      if (pvKey === key && pvBox.classList.contains('show')) pvDraw(img, img.naturalWidth, img.naturalHeight);
    };
    img.src = url;
  }, 0);
}
seek.addEventListener('pointerup', e => { if (!dragging) return; dragging = false; seekTo(frac(e, seek) * curDur()); const r = seek.getBoundingClientRect(); if (e.clientY < r.top - 12 || e.clientY > r.bottom + 8) schedulePreviewHide(); });

/* volume */
let volume = S.get('volume');
function setVol(v) { volume = Math.min(1, Math.max(0, v)); video.volume = volume; $('#volFill').style.width = volume * 100 + '%'; S.set('volume', volume); setMuteIcon(); }
function setMuteIcon() { const m = video.muted || volume === 0; $('#muteIcon').innerHTML = m ? '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/>' : '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6"/>' + (volume > .5 ? '<path d="M18.5 6.5a8 8 0 0 1 0 11"/>' : ''); $('#volFill').style.opacity = video.muted ? .35 : 1; }
const vol = $('#vol'); let vdrag = false;
vol.addEventListener('pointerdown', e => { vdrag = true; vol.setPointerCapture(e.pointerId); video.muted = false; setVol(frac(e, vol)); });
vol.addEventListener('pointermove', e => { if (vdrag) setVol(frac(e, vol)); });
vol.addEventListener('pointerup', () => { vdrag = false; osd(t('Volume {v}%', { v: Math.round(volume * 100) })); });
const volWheel = e => { e.preventDefault(); video.muted = false; setVol(volume + (e.deltaY < 0 ? .05 : -.05)); osd(t('Volume {v}%', { v: Math.round(volume * 100) })); };
vol.addEventListener('wheel', volWheel, { passive: false });
$('#player').addEventListener('wheel', e => {
  const w = S.get('wheel') || 'volume';
  if (w === 'volume') volWheel(e);
  else if (w === 'seek') { e.preventDefault(); seekTo(curTime() + (e.deltaY < 0 ? 5 : -5)); }
}, { passive: false });
const toggleMute = () => { video.muted = !video.muted; setMuteIcon(); osd(video.muted ? 'Muted' : t('Volume {v}%', { v: Math.round(volume * 100) })); };
$('#muteBtn').onclick = toggleMute;
setVol(volume);

/* ---------- controls wiring ---------- */
$('#playBtn').onclick = togglePlay;
$('#prevBtn').onclick = prev;
$('#nextBtn').onclick = () => step(1);
$('#miniPlay').onclick = togglePlay;
$('#miniClose').onclick = stopPlayback;
$('#miniCanvasWrap').onclick = showPlayer;
$('#listBtn').onclick = toggleLibrary;
function toggleLibrary() { mode === 'player' ? showBrowser() : showPlayer(); }
// A single click waits briefly: if it turns out to be a double click (fullscreen), it must not also pause and
// resume the video (#32).
let clickT = null;
function clickToggle() { if (FAST.skipClick) { FAST.skipClick = false; return; } clearTimeout(clickT); clickT = setTimeout(() => { clickT = null; togglePlay(); }, 230); }
video.addEventListener('click', clickToggle);
/* ---------- hold for 2× speed (#46): while Shift+Space or the mouse button on the video is held ---------- */
const FAST = { on: false, rate: 1, key: null, holdT: null, skipClick: false };
function fastStart(key) {
  if (FAST.on || !curItem() || video.paused) return;
  Object.assign(FAST, { on: true, key, rate: video.playbackRate }); video.playbackRate = Math.max(2, FAST.rate);
  $('#fastBadge').classList.add('show');
}
function fastEnd() {
  if (!FAST.on) return;
  FAST.on = false; video.playbackRate = FAST.rate; $('#fastBadge').classList.remove('show');
}
video.addEventListener('pointerdown', e => {                 // like on a phone: press and hold the picture
  if (e.button !== 0) return;
  clearTimeout(FAST.holdT); FAST.holdT = setTimeout(() => { fastStart('mouse'); if (FAST.on) FAST.skipClick = true; }, 450);
});
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) video.addEventListener(ev, () => { clearTimeout(FAST.holdT); if (FAST.key === 'mouse') fastEnd(); });
document.addEventListener('keyup', e => { if (FAST.on && FAST.key === e.code) fastEnd(); });
window.addEventListener('blur', fastEnd);
$('#player').addEventListener('dblclick', e => { clearTimeout(clickT); clickT = null; if ((S.get('dblclick') || 'fullscreen') === 'fullscreen') toggleFs(); else togglePlay(); });
$('#fsBtn2').onclick = toggleFs;
$('#minBtn').onclick = () => api.win('min');
$('#maxBtn').onclick = () => api.win('max');
$('#closeBtn').onclick = () => { savePos(); stopRecord(); api.win('close'); };
api.onSnapped(s => document.body.classList.toggle('snapped', s));

api.onMaximized(m => { document.body.classList.toggle('maxed', m); $('#maxIcon').innerHTML = m ? '<rect x="8" y="5" width="11" height="11" rx="1"/><path d="M5 8v10a1 1 0 0 0 1 1h10"/>' : '<rect x="6" y="6" width="12" height="12" rx="1"/>'; });
$('#titlebar').addEventListener('dblclick', e => { if (!e.target.closest('button')) api.win('max'); });
function toggleFs() { fsForLibrary = false; if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
document.addEventListener('fullscreenchange', () => {
  const fs = !!document.fullscreenElement;
  document.body.classList.toggle('fullscreen', fs);
  document.body.classList.remove('fs-top', 'fs-bottom');
  if (fs) showPlayer();
});
// In fullscreen the top bar and the controls stay hidden; they slide in while the mouse is near the top or bottom edge.
const FS_TOP = 60, FS_BOTTOM = 90;
function fsZones(y) {
  if (!document.body.classList.contains('fullscreen')) return;
  const menuOpen = !!document.querySelector('.menu-layer');
  document.body.classList.toggle('fs-top', y != null && y <= FS_TOP && !menuOpen);
  document.body.classList.toggle('fs-bottom', dragging || vdrag || (y != null && y >= innerHeight - FS_BOTTOM));
  if (!document.body.classList.contains('fs-bottom')) hidePreview();
}
// Only real movement counts: Chromium also fires mousemove when styles under a resting pointer change, which
// would otherwise show the cursor again right after hiding it.
let hideT, lastXY = ''; document.addEventListener('mousemove', e => {
  const xy = e.screenX + ',' + e.screenY; if (xy === lastXY) return; lastXY = xy;
  fsZones(e.clientY);
  document.body.classList.remove('hidecursor'); clearTimeout(hideT);
  hideT = setTimeout(() => {
    const b = document.body.classList;
    if (S.get('hideCursor') !== false && !video.paused && !b.contains('fs-top') && !b.contains('fs-bottom')) b.add('hidecursor');
  }, S.get('hideCursorDelay') * 1000);
});
document.documentElement.addEventListener('mouseleave', () => fsZones(null));
S.on(k => { if (k === 'hideCursor' && !S.get('hideCursor')) document.body.classList.remove('hidecursor'); });
/* ---------- the pixel cat does something when you click it (#48) ---------- */
let catCtx = null, lastTrick = '';
function meow() {                                              // a short synthesized meow, at the player's volume
  if (video.muted || !video.volume) return;
  try {
    catCtx = catCtx || new AudioContext(); const c = catCtx, t0 = c.currentTime + 0.02;
    const osc = c.createOscillator(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain(), out = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t0); osc.frequency.linearRampToValueAtTime(720, t0 + 0.16); osc.frequency.linearRampToValueAtTime(480, t0 + 0.5);
    f1.type = 'bandpass'; f1.Q.value = 6; f1.frequency.setValueAtTime(1800, t0); f1.frequency.exponentialRampToValueAtTime(800, t0 + 0.5);
    f2.type = 'bandpass'; f2.Q.value = 8; f2.frequency.setValueAtTime(3000, t0); f2.frequency.exponentialRampToValueAtTime(1500, t0 + 0.5);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + 0.06); g.gain.setValueAtTime(1, t0 + 0.32); g.gain.linearRampToValueAtTime(0, t0 + 0.55);
    out.gain.value = 0.5 * video.volume;
    osc.connect(f1); osc.connect(f2); f1.connect(g); f2.connect(g); g.connect(out); out.connect(c.destination);
    osc.start(t0); osc.stop(t0 + 0.6);
  } catch {}
}
const CAT_TRICKS = {
  meow: box => { meow(); box.insertAdjacentHTML('beforeend', `<span class="cat-say">${esc(t('Meow!'))}</span>`); },
  blink: () => {}, wag: () => {}, jump: () => {}, spin: () => {},
  hearts: box => { for (let i = 0; i < 5; i++) box.insertAdjacentHTML('beforeend', `<span class="cat-heart" style="--x:${(Math.random() * 70 + 15).toFixed(0)}%;--d:${(i * 0.12).toFixed(2)}s">♥</span>`); },
};
$('#idle').addEventListener('click', e => {
  const box = e.target.closest('.catbox'); if (!box || box.dataset.trick) return;
  e.stopPropagation();
  const names = Object.keys(CAT_TRICKS).filter(n => n !== lastTrick), name = names[Math.floor(Math.random() * names.length)];
  lastTrick = name; box.dataset.trick = name; CAT_TRICKS[name](box);
  setTimeout(() => { delete box.dataset.trick; box.querySelectorAll('.cat-say,.cat-heart').forEach(n => n.remove()); }, 1400);
});
$('#idle').addEventListener('dblclick', e => { if (e.target.closest('.catbox')) e.stopPropagation(); });
function toggleHideUI() { const on = document.body.classList.toggle('hide-ui'); if (on) showPlayer(); osd(on ? 'Interface hidden – press Ctrl+\\ to show it again' : 'Interface visible'); }

/* ---------- per-frame: mini preview + subtitles ---------- */
const mctx = $('#miniCanvas').getContext('2d');
const miniArt = { key: null, src: null, img: null, blur: null };   // the music mini player is only redrawn when this changes
// A cover blurred once into a small image; scaled up it looks like a heavy blur but costs nothing per frame
// (a live CSS/canvas blur had to be recomputed on every animation frame, e.g. while the sidebar slides).
const blurCache = {};
function blurredArt(art) {
  if (blurCache[art]) return Promise.resolve(blurCache[art]);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'); g.filter = 'blur(7px) saturate(1.3)'; g.drawImage(img, -16, -16, 128, 128); res(blurCache[art] = c.toDataURL('image/jpeg', 0.85)); };
    img.onerror = () => res(null); img.src = art;
  });
}
let lastSub = null;
const SUB = { tracks: [], active: -1 };
const LYR = { lines: null, synced: false, hidden: false, shown: false, idx: -2 };   // lyrics (.lrc), see below
const subSync = { delay: 0, speed: 1, dur: 0 };
(function frame() {
  if (mode === 'browser' && state.current >= 0 && video.videoWidth && !isAudio(curItem())) {
    const c = mctx.canvas, r = Math.min(c.width / video.videoWidth, c.height / video.videoHeight), w = video.videoWidth * r, h = video.videoHeight * r;
    mctx.fillStyle = '#000'; mctx.fillRect(0, 0, c.width, c.height);
    try { mctx.filter = FX.filterString().replace(/url\([^)]*\)\s*/g, '') || 'none'; mctx.drawImage(video, (c.width - w) / 2, (c.height - h) / 2, w, h); mctx.filter = 'none'; } catch {}
    $('#miniCanvasWrap .cat').style.display = 'none'; miniArt.key = null;
  } else if (mode === 'browser') {
    const it = curItem(), art = it && isAudio(it) && (it.cover || it.thumb);
    if (art && miniArt.src !== art) {
      miniArt.src = art; miniArt.img = new Image(); miniArt.img.src = art; miniArt.blur = null;
      blurredArt(art).then(b => { if (miniArt.src !== art || !b) return; const bi = new Image(); bi.onload = () => { miniArt.blur = bi; miniArt.key = null; }; bi.src = b; });
    }
    const img = art && miniArt.img && miniArt.img.complete && miniArt.img.naturalWidth ? miniArt.img : null;
    const key = (img ? art : 'stage') + (miniArt.blur ? '+b' : '') + document.documentElement.dataset.theme;
    if (key !== miniArt.key) {                               // draw once per change instead of every frame
      miniArt.key = key;
      mctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--stage') || '#2a2928'; mctx.fillRect(0, 0, 320, 180);
      if (img) {                                              // blurred cover behind, sharp square cover in the middle
        if (miniArt.blur) { mctx.globalAlpha = 0.55; mctx.drawImage(miniArt.blur, 0, -70, 320, 320); mctx.globalAlpha = 1; }
        mctx.drawImage(img, 160 - 66, 90 - 66, 132, 132);
      }
      $('#miniCanvasWrap .cat').style.display = img ? 'none' : '';
    }
  }
  const tr = SUB.tracks[SUB.active];
  let htmlSub = '';
  if (tr && tr.cues) {
    const t = curTime() - subSync.delay, sp = subSync.speed || 1;
    htmlSub = tr.cues.filter(c => t >= c.s / sp && t <= c.e / sp + subSync.dur).map(c => `<span>${c.h}</span>`).join('<br>');
  }
  if (htmlSub !== lastSub) { $('#subs').innerHTML = htmlSub; lastSub = htmlSub; }
  if (LYR.shown && LYR.synced) syncLyrics();
  if (AB.b != null && !video.paused && P.seekTarget == null && curTime() >= AB.b) seekTo(AB.a);
  if (rec) $('#rec span').textContent = 'REC ' + fmt((performance.now() - rec.t0) / 1000).slice(3);
  requestAnimationFrame(frame);
})();

/* ---------- subtitles ---------- */
const BITMAP = /pgs|dvd_sub|dvb_sub|xsub/;
function parseTime(s) { const p = s.trim().replace(',', '.').split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
function parseVTT(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n'); const i = lines.findIndex(l => l.includes('-->')); if (i < 0) continue;
    const [a, b] = lines[i].split('-->'); const body = lines.slice(i + 1).join('\n').trim(); if (!body) continue;
    const h = esc(body.replace(/\{\\[^}]*\}/g, '')).replace(/&lt;(\/?)(i|b|u)&gt;/g, '<$1$2>').replace(/&lt;[^&]*&gt;/g, '');
    cues.push({ s: parseTime(a), e: parseTime(b.trim().split(/\s/)[0]), h });
  }
  return cues;
}
function clearSubs() { SUB.tracks = []; SUB.active = -1; subSync.delay = 0; subSync.speed = 1; subSync.dur = 0; LYR.lines = null; LYR.hover = null; renderLyrics(); }
async function setupSubs(it) {
  if (it.info) it.info.subs.forEach(s => SUB.tracks.push({ label: s.label + (BITMAP.test(s.codec) ? ' (' + t('image-based, not supported') + ')' : ''), lang: s.lang, src: it.src, idx: s.i, bitmap: BITMAP.test(s.codec) }));
  if (!it.remote && (S.get('subAuto') || S.get('lrcAuto'))) {
    const all = await api.siblingSubs(it.src); if (curItem() !== it) return;
    const lrc = all.filter(f => /\.lrc$/i.test(f)), sib = S.get('subAuto') ? all.filter(f => !/\.lrc$/i.test(f)) : [];
    if (lrc.length && S.get('lrcAuto') && await useLyricsFile(lrc[0], it) && !isAudio(it)) return;
    if (curItem() !== it) return;
    for (const f of sib) SUB.tracks.push({ label: baseName(f), src: f, idx: null });
    if (sib.length) return selectSub(SUB.tracks.length - sib.length);
  }
  const prefs = I18N.langCodes(S.get('subLang')).map(c => c.slice(0, 2));   // also accepts names like "English"
  if (prefs.length) { const i = SUB.tracks.findIndex(t => !t.bitmap && t.lang && prefs.some(p => t.lang.toLowerCase().startsWith(p))); if (i >= 0) selectSub(i); }
}
async function addSubFile(file, select) { if (/\.lrc$/i.test(file)) { if (!await useLyricsFile(file)) osd('No lyrics found'); return quick && quick.refresh(); } SUB.tracks.push({ label: baseName(file), src: file, idx: null }); if (select) await selectSub(SUB.tracks.length - 1); quick && quick.refresh(); }
async function selectSub(i) {
  if (i < 0) { SUB.active = -1; osd('Subtitles off'); return; }
  SUB.active = i;
  const tr = SUB.tracks[i]; if (!tr) return;
  if (tr.bitmap) { osd('Image-based subtitles are not supported'); SUB.active = -1; return; }
  if (!tr.cues) { osd('Loading subtitles…'); const txt = await api.subs(tr.src, tr.idx); tr.cues = txt ? parseVTT(txt) : []; }
  osd(tr.cues.length ? t('Subtitles: {name}', { name: tr.label }) : 'No subtitles found');
}
async function loadSubFile() { if (state.current < 0) return osd('Play something first'); const f = await api.openSubtitle(curItem() && curItem().src); if (f) addSubFile(f, true); }
/* ---------- lyrics (.lrc) ---------- */
// Music with a .lrc file gets a full-screen lyrics view that follows the song (setting lyricsView);
// for videos, or with that setting off, the lyrics are shown as ordinary subtitles.
// "[mm:ss.xx] text" lines; a line may carry several time tags; [offset:±ms] shifts everything; <mm:ss.xx> word tags are dropped.
function parseLRC(text) {
  let offset = 0; const timed = [], plain = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const off = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw); if (off) { offset = +off[1] / 1000; continue; }
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    const body = raw.replace(/\[[^\]]*\]/g, '').replace(/<\d+:\d+(?:[.:]\d+)?>/g, '').trim();
    if (tags.length) tags.forEach(m => timed.push({ t: Math.max(0, +m[1] * 60 + parseFloat(m[2].replace(':', '.')) - offset), text: body }));
    else if (body) plain.push({ t: null, text: body });
  }
  timed.sort((a, b) => a.t - b.t);
  return timed.length ? { synced: true, lines: timed } : { synced: false, lines: plain };
}
const lrcCues = lrc => lrc.lines.map((l, i, a) => ({ s: l.t || 0, e: a[i + 1] ? a[i + 1].t : (l.t || 0) + 5, h: esc(l.text) })).filter(c => c.h);
async function useLyricsFile(file, it = curItem()) {
  const txt = await api.lyrics(file); if (!txt || !it || curItem() !== it) return false;
  const lrc = parseLRC(txt); if (!lrc.lines.some(l => l.text)) return false;
  if (lrc.synced) LYR.hover = lrc.lines;                      // for the timeline preview (#41), whatever view is used
  if (isAudio(it) && S.get('lyricsView')) { Object.assign(LYR, { lines: lrc.lines, synced: lrc.synced, hidden: false }); renderLyrics(); return true; }
  SUB.tracks.push({ label: baseName(file), src: file, idx: null, cues: lrcCues(lrc) });
  await selectSub(SUB.tracks.length - 1); return true;
}
function renderLyrics() {
  const it = curItem(), on = !!(LYR.lines && !LYR.hidden && S.get('lyricsView') && it && isAudio(it));
  LYR.shown = on; LYR.idx = -2;
  $('#player').classList.toggle('lyrics-on', on);
  // cover ⇄ lyrics switch in the corner of the player (#20); Y does the same
  const sw = $('#lyrSwitch'), can = !!(LYR.lines && S.get('lyricsView') && it && isAudio(it));
  sw.classList.toggle('show', can); sw.innerHTML = can ? icon(on ? 'audio' : 'subtitle') + `<span>${esc(t(on ? 'Show cover' : 'Show lyrics'))}</span>` : '';
  if (!on) return;
  const box = $('#lyrics'), art = it.cover || it.thumb;
  const lb = box.querySelector('.lyr-bg'); lb.style.backgroundImage = '';           // only used with the default stage background
  if (art) blurredArt(art).then(b => { if (b && curItem() === it) lb.style.backgroundImage = `url('${b}')`; });
  box.querySelector('.lyr-scroll').classList.toggle('free', !LYR.synced);
  const list = box.querySelector('.lyr-list');
  list.style.transform = '';
  list.innerHTML = LYR.lines.map((l, i) => `<div class="lyr-line${l.text ? '' : ' gap'}" data-i="${i}">${l.text ? esc(l.text) : '♪'}</div>`).join('');
  if (LYR.synced) syncLyrics();
}
// Highlight the current line and keep it in the middle.
function syncLyrics() {
  const now = curTime(), lines = LYR.lines;
  let i = -1; for (let lo = 0, hi = lines.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (lines[m].t <= now + 0.05) { i = m; lo = m + 1; } else hi = m - 1; }
  if (i === LYR.idx) return;
  LYR.idx = i;
  const box = $('#lyrics'), list = box.querySelector('.lyr-list'), els = list.children;
  list.querySelector('.lyr-line.on')?.classList.remove('on');
  const cur = els[Math.max(0, i)]; if (!cur) return;
  if (i >= 0) cur.classList.add('on');
  const sc = box.querySelector('.lyr-scroll');
  list.style.transform = `translateY(${Math.round(sc.clientHeight / 2 - (cur.offsetTop + cur.offsetHeight / 2))}px)`;
}
$('#lyrSwitch').addEventListener('click', e => { e.stopPropagation(); toggleLyrics(); });
$('#lyrics').addEventListener('click', e => {
  const line = e.target.closest('.lyr-line');
  if (line && LYR.synced) { seekTo(LYR.lines[+line.dataset.i].t); LYR.idx = -2; } else if (!line) clickToggle();
});
addEventListener('resize', () => { LYR.idx = -2; });
/* ---------- music stage: background (blur / gradient / black / default) with dim, and cover size ---------- */
const artColors = {};                                         // cover → [color1, color2] for the gradient background
function coverColors(art) {
  if (artColors[art]) return Promise.resolve(artColors[art]);
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data, avg = (x0, y0) => { let r = 0, gg = 0, b = 0; for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 4; x++) { const i = (y * 8 + x) * 4; r += d[i]; gg += d[i + 1]; b += d[i + 2]; } return `rgb(${r / 16 | 0},${gg / 16 | 0},${b / 16 | 0})`; };
      res(artColors[art] = [avg(0, 0), avg(4, 4)]);
    };
    img.onerror = () => res(null); img.src = art;
  });
}
function renderAudioBg(it = curItem()) {
  const pl = $('#player'), bg = S.get('audioBg'), on = !!(it && isAudio(it) && bg !== 'stage');
  pl.classList.toggle('audio-bg', on);
  pl.style.setProperty('--cover', S.get('coverSize'));
  pl.style.setProperty('--abdim', S.get('audioBgDim') / 100);
  if (!on) return;
  const layer = $('#audioBg .ab-art'), art = it.cover || it.thumb;
  layer.className = 'ab-art ' + (bg === 'blur' && art ? 'blur' : bg === 'black' ? 'black' : 'gradient');
  layer.style.background = '';
  layer.style.backgroundImage = '';
  if (bg === 'blur' && art) blurredArt(art).then(b => { if (b && curItem() === it && S.get('audioBg') === 'blur') layer.style.backgroundImage = `url('${b}')`; });
  if (bg === 'black') return;
  if (bg === 'gradient' || !art) {
    layer.style.background = 'linear-gradient(135deg,#3a3a46,#121214)';
    if (art) coverColors(art).then(c => { if (c && curItem() === it && S.get('audioBg') === 'gradient') layer.style.background = `linear-gradient(135deg,${c[0]},${c[1]})`; });
  }
}
function toggleLyrics() { if (!LYR.lines) return osd('No lyrics'); LYR.hidden = !LYR.hidden; renderLyrics(); }
function cycleSubs() { if (!SUB.tracks.length) return osd('No subtitles'); const n = SUB.active + 1 >= SUB.tracks.length ? -1 : SUB.active + 1; selectSub(n); }
function applySubStyle() {
  const r = document.documentElement.style;
  r.setProperty('--subsize', S.get('subSize') / 100); r.setProperty('--lyrsize', S.get('lyricsSize') / 100); r.setProperty('--subcolor', S.get('subColor')); r.setProperty('--subout', S.get('subOutline'));
  r.setProperty('--subbg', `rgba(0,0,0,${S.get('subBg') / 100})`); r.setProperty('--subfont', `"${S.get('subFont')}", "Segoe UI", sans-serif`);
  $('#subs').style.fontFamily = `"${S.get('subFont')}", "Segoe UI", sans-serif`;
}
// Lyrics got their own size in 1.15 (#45); until then they followed the subtitle size, so start from that.
if (!store.get('lyricsSizeSplit')) { store.set('lyricsSizeSplit', true); if (S.get('subSize') !== 100) S.set('lyricsSize', S.get('subSize')); }
applySubStyle();

/* ---------- audio tracks ---------- */
const audioTracks = () => { const it = curItem(); const t = it && it.info ? it.info.audio : []; return t.length ? t.map(a => [a.i, `${a.label} (${a.codec}${a.ch ? ', ' + a.ch + 'ch' : ''})`]) : [[0, 'Default']]; };
function setAudioTrack(i) { if (!curItem()) return; P.audio = i; P.tx = needsTx(curItem()) || P.audio > 0; loadSource(curTime(), !video.paused); const tk = audioTracks().find(x => x[0] === i); osd(t('Audio track: {name}', { name: tk ? tk[1] : i })); }
function cycleAudio() { const n = audioTracks().length; if (n < 2) return osd('Only one audio track'); setAudioTrack((P.audio + 1) % n); }

/* ---------- recording ---------- */
async function toggleRecord() { rec ? stopRecord() : startRecord(); }
async function startRecord() {
  const it = curItem(); if (!it) return osd('Play something first');
  try {
    const stream = video.captureStream();
    if (!S.get('recAudio')) stream.getAudioTracks().forEach(t => stream.removeTrack(t));
    const hasV = stream.getVideoTracks().length;
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'audio/webm;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m) && (hasV || m.startsWith('audio')));
    const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    const name = `vlc-record-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}-${it.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_')}.webm`;
    const file = await api.recStart(S.get('recDir') || PATHS.recordings, name);
    let chain = Promise.resolve();
    mr.ondataavailable = e => { if (e.data.size) chain = chain.then(async () => api.recChunk(file, await e.data.arrayBuffer())); };
    mr.onstop = () => { chain = chain.then(() => api.recStop(file)).then(f => osd(t('Recording saved to {dir}', { dir: S.get('recDir') || PATHS.recordings }))); };
    mr.start(1000);
    rec = { mr, file, t0: performance.now() };
    $('#rec').classList.add('show');
    osd('Recording started');
    if (video.paused) video.play();
  } catch (e) { console.error(e); osd('Recording not possible'); }
}
function stopRecord() { if (!rec) return; try { rec.mr.stop(); } catch {} rec = null; $('#rec').classList.remove('show'); }

/* ---------- snapshot ---------- */
async function snapshot() {
  if (!video.videoWidth) return osd('No video image');
  const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
  const x = c.getContext('2d'); x.filter = FX.filterString(); x.drawImage(video, 0, 0);
  const ext = S.get('snapshotFormat') === 'jpg' ? 'jpg' : 'png';
  const name = `vlcsnap-${(curItem()?.name || 'video').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_')}-${fmt(curTime()).replace(/:/g, '-')}.${ext}`;
  try { await api.snapshot(c.toDataURL(ext === 'jpg' ? 'image/jpeg' : 'image/png', 0.92), name, S.get('snapshotDir') || PATHS.snapshots); osd('Snapshot saved'); }
  catch { osd('Snapshot failed'); }
}

/* ---------- playlists ---------- */
function createPlaylist(name, srcs = [], cover = null, open = false) {
  const p = { name, srcs: [...new Set(srcs)], cover };
  state.playlists.push(p); savePlaylists();
  if (srcs.length) addSources(srcs, { play: false, silent: true });
  if (open) navigate({ view: 'playlists', activePlaylist: p });
  else render();
  osd(t('Playlist "{name}" created', { name }));
  return p;
}
async function addToPlaylist(it) {
  if (!state.playlists.length) { const p = await Panels.newPlaylist(App); if (!p) return; }
  const i = await UI.choose('Add to playlist', state.playlists.map(p => p.name), 'Add');
  if (i == null) return;
  const p = state.playlists[i]; if (!p.srcs.includes(it.src)) p.srcs.push(it.src);
  savePlaylists(); osd(t('Added to {name}', { name: p.name })); render();
}
function removeItem(it) {
  const idx = idxOf(it);
  if (idx === state.current) stopPlayback();
  state.items.splice(idx, 1);
  if (state.current > idx) state.current--;
  saveLibrary(); render();
}

/* ---------- library interactions ---------- */
$('#rail').addEventListener('click', e => {
  const b = e.target.closest('[data-view]'); if (!b) return;
  state.sideMode = 'view';
  if (b.dataset.view === 'playlists') navigate({ view: 'playlists', activePlaylist: null });
  else navigate({ view: b.dataset.view });
});
$('#addBtn').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); UI.menu(openMediaItems(), r.right + 4, r.top); };
$('#sideToggle').onclick = () => {
  if (document.body.classList.contains('focus-video')) { sideOverride = true; $('#side').classList.remove('hidden'); return updateFocus(); }
  if (sideOverride && mode === 'player') { sideOverride = false; return updateFocus(); }   // hide it again (#8)
  if (S.get('navExpanded')) return S.set('navExpanded', false);
  if (matchMedia('(max-width:560px)').matches) { $('#side').classList.remove('hidden'); return $('#side').classList.toggle('narrow-open'); }
  $('#side').classList.toggle('hidden');
};
$('#backBtn').onclick = $('#navBack').onclick = goBack;
$('#navFwd').onclick = goFwd;
$('#sideMore').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); UI.menu([
  { label: state.sideMode === 'queue' ? 'Show library' : 'Show queue', icon: 'queue', kbd: 'Q', action: toggleQueue },
  { label: 'Sidebar with labels', icon: 'pointer', checked: S.get('navExpanded'), action: () => S.set('navExpanded', !S.get('navExpanded')) },
  { label: 'Hide sidebar', icon: 'hide', action: () => $('#side').classList.add('hidden') },
], r.left, r.bottom + 4); };
$('#sideList').addEventListener('click', e => {
  const r = e.target.closest('.srow'); if (!r) return;
  if (r.dataset.idx) { if (state.sideMode === 'view') state.queueList = visibleItems(); playItem(+r.dataset.idx); }
  else if (r.dataset.dir) navigate({ dir: { ...state.dir, [state.view]: r.dataset.dir } });
  else if (r.dataset.pl) navigate({ view: 'playlists', activePlaylist: plByKey(r.dataset.pl) });
  else if (r.dataset.act) doAct(r.dataset.act);
});
$('#grid').addEventListener('click', e => {
  const sb = e.target.closest('[data-sort]');
  if (sb) { if (state.sort === sb.dataset.sort) state.sortDesc = !state.sortDesc; else { state.sort = sb.dataset.sort; state.sortDesc = false; } return render(); }
  const c = e.target.closest('.card'); if (!c) return;
  if (c.dataset.dir) return navigate({ dir: { ...state.dir, [state.view]: c.dataset.dir } });
  if (c.dataset.pl) return navigate({ activePlaylist: plByKey(c.dataset.pl) });
  if (c.dataset.act) return doAct(c.dataset.act);
  state.queueList = state.view === 'home' ? null : visibleItems();
  playItem(+c.dataset.idx);
});
$('#search').addEventListener('input', e => { state.query = e.target.value.trim().toLowerCase(); state.gridLimit = 240; render(); });
// Load more tiles / rows when scrolling near the end of a long list.
const nearEnd = el => el.scrollTop + el.clientHeight > el.scrollHeight - 800;
$('#grid').addEventListener('scroll', e => { if (nearEnd(e.target) && state.gridLimit < 1e6 && e.target.querySelectorAll('.card').length >= state.gridLimit) { state.gridLimit += 240; render(); } }, { passive: true });
$('#sideList').addEventListener('scroll', e => { if (nearEnd(e.target) && e.target.children.length >= state.sideLimit) { state.sideLimit += 400; renderSide(); } }, { passive: true });
const toggleList = () => { state.list = !state.list; store.set('listView', state.list); render(); };
$('#viewToggle').onclick = toggleList;
$('#sortBtn').onclick = $('#sortBtn2').onclick = () => { state.sort = state.sort === 'name' ? 'added' : 'name'; state.sortDesc = false; osd(state.sort === 'name' ? 'Sort by name' : 'Sort by date added'); render(); };
$('#moreBtn').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); UI.menu([
  { label: 'Grid / list', icon: 'queue', action: toggleList },
  { label: state.sort === 'name' ? 'Sort by date' : 'Sort by name', icon: 'speed', action: () => $('#sortBtn').click() },
  { sep: true }, ...openMediaItems(), { sep: true },
  { label: 'Manage media folders…', icon: 'library', action: () => Panels.openSettings(App, 'library') },
], r.right - 260, r.bottom + 4); };
$('#openFiles').onclick = () => doAct('files');
$('#openFolder').onclick = () => doAct('addfolder');
$('#openUrl').onclick = () => doAct('url');

function toggleQueue() {
  const side = $('#side');
  if (document.body.classList.contains('focus-video')) { sideOverride = true; updateFocus(); side.classList.add('hidden'); }
  else if (sideOverride && mode === 'player' && state.sideMode === 'queue' && !side.classList.contains('hidden')) { sideOverride = false; state.sideMode = 'view'; updateFocus(); return render(); }
  if (S.get('navExpanded')) S.set('navExpanded', false);
  if (state.sideMode === 'queue' && !side.classList.contains('hidden')) { state.sideMode = 'view'; side.classList.add('hidden'); }
  else { state.sideMode = 'queue'; side.classList.remove('hidden'); }
  render();
}

/* context menus on library items */
document.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (e.target.closest('#player') || e.target.closest('#controls')) return playerMenu(e.clientX, e.clientY);
  const card = e.target.closest('.card[data-idx],.srow[data-idx]');
  const pl = e.target.closest('[data-pl]');
  const dir = e.target.closest('[data-dir]');
  if (card) {
    const it = state.items[+card.dataset.idx];
    UI.menu([
      { label: 'Play', icon: 'play', accent: true, action: () => playItem(idxOf(it)) },
      { label: 'Add to playlist…', icon: 'playlist', action: () => addToPlaylist(it) },
      { label: isWatched(it) ? 'Mark as unwatched' : 'Mark as watched', icon: 'eye', action: () => { isWatched(it) ? watched.delete(it.src) : watched.add(it.src); saveWatched(); render(); } },
      !it.remote ? { label: 'Show in folder', icon: 'folder', action: () => api.reveal(it.src) } : null,
      { label: 'Media information', icon: 'info', action: () => mediaInfo(it) },
      { sep: true },
      state.view === 'playlists' && state.activePlaylist && !state.activePlaylist.all
        ? { label: 'Remove from playlist', icon: 'trash', danger: true, action: () => { const p = state.activePlaylist; p.srcs = p.srcs.filter(s => s !== it.src); savePlaylists(); render(); } }
        : { label: 'Remove from library', icon: 'trash', danger: true, action: () => removeItem(it) },
    ], e.clientX, e.clientY);
  } else if (pl) {
    const p = plByKey(pl.dataset.pl); if (!p) return;
    UI.menu([
      { label: 'Play', icon: 'play', accent: true, action: () => { const f = bySrc(p.srcs[0]); if (f) { state.queueList = p.srcs.map(bySrc).filter(Boolean); playItem(idxOf(f)); } else osd('Playlist is empty'); } },
      ...(p.all ? [] : [
      { label: 'Rename…', icon: 'general', action: async () => { const n = await UI.prompt('Rename', { value: p.name }); if (n && n.trim()) { p.name = n.trim(); savePlaylists(); render(); } } },
      { label: 'Choose cover…', icon: 'camera', action: async () => { const f = await api.chooseFile(t('Cover image'), ['png', 'jpg', 'jpeg', 'webp']); if (f) { p.cover = await api.readImage(f); savePlaylists(); render(); } } },
      { sep: true },
      { label: 'Delete', icon: 'trash', danger: true, action: async () => { if (await UI.confirm('Delete playlist?', p.name, 'Delete')) { state.playlists.splice(state.playlists.indexOf(p), 1); if (state.activePlaylist === p) state.activePlaylist = null; savePlaylists(); render(); } } },
      ]),
    ], e.clientX, e.clientY);
  } else if (dir) {
    const path = dir.dataset.dir;
    UI.menu([
      { label: 'Open', icon: 'folder', action: () => navigate({ dir: { ...state.dir, [state.view]: path } }) },
      { label: 'Play all', icon: 'play', accent: true, action: () => { const list = sortItems(state.items.filter(i => under(i.src, path) && i.type === typeOf(state.view))); if (list.length) { state.queueList = list; playItem(idxOf(list[0])); } } },
      { label: 'Show in folder', icon: 'open', action: () => api.openPath(path) },
    ], e.clientX, e.clientY);
  }
});

/* ---------- player right-click menu (design: right-click menu.png) ---------- */
function openMediaItems() {
  return [
    { label: 'Open files…', icon: 'file', kbd: 'Ctrl + O', action: () => doAct('files') },
    { label: 'Open folder…', icon: 'folder', kbd: 'Ctrl + F', action: () => doAct('folder') },
    { label: 'Add media folder…', icon: 'library', action: () => doAct('addfolder') },
    { label: 'Open network stream…', icon: 'network', kbd: 'Ctrl + N', action: () => doAct('url') },
  ];
}
function playerMenu(x, y) {
  const it = curItem(), rate = +video.playbackRate.toFixed(2);
  UI.menu([
    { label: video.paused ? 'Play' : 'Pause', icon: video.paused ? 'play' : 'pause', accent: true, kbd: 'Space', action: togglePlay },
    { label: 'Stop', icon: 'stop', accent: true, kbd: 'S', action: stopPlayback, disabled: !it },
    { label: 'Previous', icon: 'prev', accent: true, kbd: 'P', action: prev, disabled: !it },
    { label: 'Next', icon: 'next', accent: true, kbd: 'N', action: () => step(1), disabled: !it },
    { label: rec ? 'Stop recording' : 'Record', icon: 'record', accent: true, kbd: 'R', action: toggleRecord, disabled: !it },
    { label: document.body.classList.contains('hide-ui') ? 'Show interface' : 'Hide interface', icon: 'hide', kbd: 'Ctrl + \\', action: toggleHideUI },
    { sep: true },
    { label: 'Playback', icon: 'playback', sub: () => [
      { header: 'Speed' }, ...[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3].map(r => ({ label: r + '×', checked: rate === r, action: () => { video.playbackRate = r; osd(t('Speed {v}×', { v: r })); } })),
      { sep: true },
      { label: t('Repeat: {mode}', { mode: t(REPEAT_NAMES[S.get('repeat')]) }), icon: 'repeat', action: () => { const n = { off: 'one', one: 'all', all: 'off' }[S.get('repeat')]; S.set('repeat', n); osd(t('Repeat: {mode}', { mode: t(REPEAT_NAMES[n]) })); } },
      { label: 'Shuffle', icon: 'shuffle', checked: S.get('shuffle'), action: () => S.set('shuffle', !S.get('shuffle')) },
      { label: 'Autoplay next', checked: S.get('autoNext'), action: () => S.set('autoNext', !S.get('autoNext')) },
      { sep: true },
      { label: t('{n} s forward', { n: S.get('jump') }), kbd: '→', action: () => seekTo(curTime() + S.get('jump')) },
      { label: t('{n} s back', { n: S.get('jump') }), kbd: '←', action: () => seekTo(curTime() - S.get('jump')) },
      { sep: true },
      { label: 'Add bookmark', icon: 'bookmark', kbd: 'Ctrl + B', action: () => addBookmark(), disabled: !it },
      { sep: true }, { header: 'A-B repeat' },
      { label: AB.a != null ? t('Set point A ({time})', { time: fmt(AB.a) }) : 'Set point A', kbd: 'A', action: () => abSet('a'), disabled: !it },
      { label: AB.b != null ? t('Set point B ({time})', { time: fmt(AB.b) }) : 'Set point B', action: () => abSet('b'), disabled: !it },
      { label: 'A-B repeat off', action: () => abClear(), disabled: AB.a == null },
      { label: 'Next chapter / bookmark', kbd: 'Shift + N', action: () => jumpMark(1), disabled: !it || !markTimes(it).length },
      { label: 'Previous chapter / bookmark', kbd: 'Shift + P', action: () => jumpMark(-1), disabled: !it || !markTimes(it).length },
      { label: 'Chapters and bookmarks…', kbd: 'Ctrl + Shift + B', action: () => Panels.bookmarks(App), disabled: !it },
    ] },
    { label: 'Video', icon: 'video', sub: () => [
      { label: 'Fullscreen', icon: 'fullscreen', kbd: 'F', action: toggleFs },
      { label: 'Snapshot', icon: 'camera', kbd: 'Shift + S', action: snapshot },
      { label: 'Picture-in-picture', icon: 'pip', action: () => doAct('pip') },
      { sep: true }, { header: 'Aspect ratio' },
      ...[['', 'Default'], ['fill', 'Fill'], ['stretch', 'Stretch']].map(([v, l]) => ({ label: l, checked: S.get('aspect') === v, action: () => S.set('aspect', v) })),
      { sep: true },
      { label: 'Rotate 90°', icon: 'rotate', action: () => S.set('vf.rotate', (S.get('vf.rotate') + 90) % 360) },
      { label: 'Mirror', checked: S.get('vf.mirror'), action: () => S.set('vf.mirror', !S.get('vf.mirror')) },
      { label: 'Video filters…', icon: 'settings', action: () => quick.toggle('video') },
    ] },
    { label: 'Audio', icon: 'audio', sub: () => [
      { header: 'Audio track' }, ...audioTracks().map(([i, l]) => ({ label: l, checked: P.audio === i, action: () => setAudioTrack(i) })),
      { sep: true },
      { label: video.muted ? 'Unmute' : 'Mute', icon: video.muted ? 'volume' : 'mute', kbd: 'M', action: toggleMute },
      { label: 'Equalizer', checked: S.get('eqOn'), action: () => S.set('eqOn', !S.get('eqOn')) },
      { label: 'Audio effects…', icon: 'settings', action: () => quick.toggle('audio') },
    ] },
    { label: 'Subtitle', icon: 'subtitle', sub: () => [
      { label: 'Off', checked: SUB.active < 0, action: () => selectSub(-1) },
      ...SUB.tracks.map((t, i) => ({ label: t.label, checked: SUB.active === i, disabled: t.bitmap, action: () => selectSub(i) })),
      { sep: true },
      { label: 'Add file…', icon: 'file', action: loadSubFile, disabled: !it },
      { label: 'Search online…', icon: 'search', action: () => Panels.searchSubtitles(App), disabled: !it },
      ...(LYR.lines ? [{ label: 'Show lyrics', checked: !LYR.hidden, action: toggleLyrics }] : []),
      { label: 'Delay −0.1 s', kbd: 'G', action: () => nudgeSub(-0.1) },
      { label: 'Delay +0.1 s', kbd: 'H', action: () => nudgeSub(0.1) },
      { label: 'Subtitle settings…', icon: 'settings', action: () => quick.toggle('subs') },
    ] },
    { label: 'More settings', icon: 'settings', sub: () => [
      { label: 'Quick settings', icon: 'settings', action: () => quick.toggle() },
      { label: 'Global settings…', icon: 'general', kbd: 'Ctrl + P', action: () => Panels.openSettings(App) },
      { label: 'Media information', icon: 'info', kbd: 'Ctrl + I', action: () => doAct('mediainfo'), disabled: !it },
      { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: 'F1', action: () => Panels.shortcuts() },
    ] },
    { label: 'Playlist', icon: 'playlist', sub: () => [
      { label: 'Show queue', icon: 'queue', kbd: 'Q', action: toggleQueue },
      { label: 'Add current to playlist…', icon: 'plus', action: () => doAct('addpl'), disabled: !it },
      { label: 'New playlist…', icon: 'playlist', action: () => doAct('newpl') },
      { sep: true }, ...state.playlists.map(p => ({ label: p.name, icon: 'playlist', action: () => navigate({ view: 'playlists', activePlaylist: p }) })),
    ] },
    { label: 'Open media', icon: 'open', sub: openMediaItems },
    { sep: true },
    { label: 'Quit VLC', icon: 'quit', kbd: 'Ctrl + Q', action: () => $('#closeBtn').click() },
  ], x, y);
}
$('#menuBtn').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); UI.menu([
  ...openMediaItems(), { sep: true },
  { label: 'New playlist…', icon: 'playlist', action: () => doAct('newpl') },
  { label: 'Add current to playlist…', icon: 'plus', action: () => doAct('addpl'), disabled: !curItem() },
  { sep: true },
  { label: 'Snapshot', icon: 'camera', kbd: 'Shift + S', action: snapshot, disabled: !curItem() },
  { label: rec ? 'Stop recording' : 'Record', icon: 'record', kbd: 'R', action: toggleRecord, disabled: !curItem() },
  { label: 'Picture-in-picture', icon: 'pip', action: () => doAct('pip'), disabled: !curItem() },
  { label: 'Media information', icon: 'info', kbd: 'Ctrl + I', action: () => doAct('mediainfo'), disabled: !curItem() },
  { sep: true },
  { label: 'Settings…', icon: 'settings', kbd: 'Ctrl + P', action: () => Panels.openSettings(App) },
  { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: 'F1', action: () => Panels.shortcuts() },
  { label: 'Welcome screen', icon: 'info', action: showOnboarding },
  { sep: true },
  { label: 'Quit VLC', icon: 'quit', kbd: 'Ctrl + Q', action: () => $('#closeBtn').click() },
], r.left, r.bottom + 4); };

async function doAct(a) {
  if (a === 'files') { const p = await api.openFiles(); if (p.length) addSources(p); }
  else if (a === 'folder') { const p = await api.openFolder(); if (p.length) { await addSources(p, { play: false }); state.queueList = null; } }
  else if (a === 'addfolder') { const f = await api.chooseFolder(t('Add media folder')); if (f) addFolder(f); }
  else if (a === 'url') Panels.openNetwork(App);
  else if (a === 'newpl') Panels.newPlaylist(App);
  else if (a === 'importpl') { const f = await api.openPlaylist(); if (f.length) { const before = state.playlists.length; await addSources(f, { play: false, keepLists: true }); const p = state.playlists[before]; if (p) navigate({ view: 'playlists', activePlaylist: p }); } }
  else if (a === 'addpl') { const it = curItem(); if (!it) return osd('Nothing is playing'); addToPlaylist(it); }
  else if (a === 'pip') { if (document.pictureInPictureElement) document.exitPictureInPicture(); else video.requestPictureInPicture().catch(() => osd('Picture-in-picture not available')); }
  else if (a === 'mediainfo') { const it = curItem(); if (it) mediaInfo(it); else osd('Nothing is playing'); }
}
function mediaInfo(it) {
  const i = it.info || {};
  const rows = [['File', it.src], ['Container', i.format || '?'], ['Duration', fmt(it.duration)], ['Video', i.vcodec ? `${i.vcodec} ${i.width}×${i.height}` : '—'],
    ['Audio', (i.audio || []).map(a => `${a.label} (${a.codec})`).join(', ') || '—'], ['Subtitles', (i.subs || []).map(s => `${s.label} (${s.codec})`).join(', ') || '—']];
  if (it === curItem()) rows.push(['Playback mode', t(P.tx ? (P.vcopy ? 'ffmpeg (audio converted)' : 'ffmpeg (converted to H.264)') : 'Direct')]);
  UI.dialog({ title: 'Media information', width: 560, body: el('div.kbtable', { style: { gridTemplateColumns: '1fr' } }, rows.map(([k, v]) => el('div.frow', {}, el('span.rlabel', {}, t(k)), el('span', { style: { wordBreak: 'break-all', textAlign: 'right', color: 'var(--text)' } }, v)))), buttons: [{ label: 'Close', primary: true, value: true }] });
}
function nudgeSub(d) { subSync.delay = +(subSync.delay + d).toFixed(2); osd(t('Subtitle delay {v} s', { v: subSync.delay.toFixed(1) })); quick && quick.refresh(); }

/* drag & drop */
let dragDepth = 0;
addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files') && !UI.dialogOpen()) { dragDepth++; $('#drop').classList.add('show'); } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('show'); } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', async e => {
  e.preventDefault(); dragDepth = 0; $('#drop').classList.remove('show');
  if (UI.dialogOpen()) return;
  const paths = [...e.dataTransfer.files].map(f => api.pathFor(f)).filter(Boolean);
  if (!paths.length) { const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text'); if (/^https?:/i.test(url)) addSources([url.trim()]); return; }
  const all = await api.expand(paths);
  if (all.length && all.every(p => SUB_RE.test(p))) { if (state.current >= 0) all.forEach(f => addSubFile(f, true)); else osd('Play a video first'); return; }
  state.queueList = null;
  addSources(all, { play: true });
});
let pendingOpen = null;   // files opened via "Open with" while the first-run onboarding is showing
api.onOpenPaths(paths => {
  state.queueList = null;
  if (document.querySelector('.ob-layer')) { pendingOpen = paths; addSources(paths, { play: false, silent: true }); return; }
  addSources(paths, { play: true });
});

/* ---------- keyboard: actions with changeable keys (Settings → Controls, #37) ---------- */
// Keys are KeyboardEvent.key values; printable keys keep their case ("S" = Shift+S), other keys get modifier
// prefixes ("Shift+ArrowRight"). Media keys (MediaTrackNext …) also arrive through the Media Session below.
const jumpBy = (d, label) => { seekTo(curTime() + d); osd(label); };
const KEY_ACTIONS = [
  ['playPause', 'Play / pause', ['Space', 'k', 'MediaPlayPause'], () => togglePlay()],
  ['stop', 'Stop', ['s', 'MediaStop'], () => { if (curItem()) { stopPlayback(); osd('Stopped'); } }],
  ['next', 'Next', ['n', '>', 'MediaTrackNext'], () => step(1)],
  ['prev', 'Previous', ['p', '<', 'MediaTrackPrevious'], () => prev()],
  ['fastHold', 'Hold for 2× speed', ['Shift+Space'], () => {}],
  ['seekFwd', 'Seek forward', ['ArrowRight'], () => jumpBy(S.get('jump'), '+' + S.get('jump') + ' s')],
  ['seekBack', 'Seek backward', ['ArrowLeft'], () => jumpBy(-S.get('jump'), '−' + S.get('jump') + ' s')],
  ['seekFwdShort', 'Seek 3 s forward', ['Shift+ArrowRight'], () => jumpBy(3, '+3 s')],
  ['seekBackShort', 'Seek 3 s backward', ['Shift+ArrowLeft'], () => jumpBy(-3, '−3 s')],
  ['volUp', 'Volume up', ['ArrowUp'], () => { video.muted = false; setVol(volume + .05); osd(t('Volume {v}%', { v: Math.round(volume * 100) })); }],
  ['volDown', 'Volume down', ['ArrowDown'], () => { setVol(volume - .05); osd(t('Volume {v}%', { v: Math.round(volume * 100) })); }],
  ['mute', 'Mute', ['m'], () => toggleMute()],
  ['fullscreen', 'Fullscreen', ['f'], () => toggleFs()],
  ['library', 'Library / player', ['l'], () => toggleLibrary()],
  ['queue', 'Show / hide queue', ['q'], () => toggleQueue()],
  ['lyrics', 'Show lyrics', ['y'], () => toggleLyrics()],
  ['subs', 'Cycle subtitle track', ['v'], () => cycleSubs()],
  ['audio', 'Cycle audio track', ['b'], () => cycleAudio()],
  ['subMinus', 'Subtitle delay −', ['g'], () => nudgeSub(-0.1)],
  ['subPlus', 'Subtitle delay +', ['h'], () => nudgeSub(0.1)],
  ['snapshot', 'Snapshot', ['S'], () => snapshot()],
  ['record', 'Record', ['r', 'R'], () => toggleRecord()],
  ['slower', 'Slower', ['['], () => { video.playbackRate = Math.max(.25, +(video.playbackRate - .25).toFixed(2)); osd(t('Speed {v}×', { v: video.playbackRate })); }],
  ['faster', 'Faster', [']'], () => { video.playbackRate = Math.min(4, +(video.playbackRate + .25).toFixed(2)); osd(t('Speed {v}×', { v: video.playbackRate })); }],
  ['normalSpeed', 'Normal speed', ['='], () => { video.playbackRate = 1; osd(t('Speed {v}×', { v: 1 })); }],
  ['frameNext', 'Next frame', ['.'], () => frameStep(1)],
  ['framePrev', 'Previous frame', [','], () => frameStep(-1)],
  ['nextChapter', 'Next chapter / bookmark', ['N'], () => jumpMark(1)],
  ['prevChapter', 'Previous chapter / bookmark', ['P'], () => jumpMark(-1)],
  ['bookmark', 'Add bookmark', ['Ctrl+b'], () => addBookmark()],
  ['abRepeat', 'A-B repeat (set A, set B, off)', ['a'], () => abCycle()],
  ['bookmarks', 'Chapters and bookmarks', ['Ctrl+B'], () => Panels.bookmarks(App)],
];
function frameStep(dir) { if (!curItem()) return; video.pause(); if (P.tx) seekTo(curTime() + dir * 0.04); else video.currentTime = Math.max(0, video.currentTime + dir / 30); }
const keyOf = e => {
  const mods = (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '');
  if (e.key === ' ') return mods + (e.shiftKey ? 'Shift+' : '') + 'Space';
  return mods + (e.key.length === 1 ? e.key : (e.shiftKey ? 'Shift+' : '') + e.key);
};
const keysFor = id => { const c = S.get('keys') || {}; const a = KEY_ACTIONS.find(x => x[0] === id); return c[id] || (a ? a[2] : []); };
function keyLookup() { const m = new Map(); for (const [id] of KEY_ACTIONS) for (const k of keysFor(id)) if (!m.has(k)) m.set(k, id); return m; }
// Hardware media keys can arrive both as a key press and as a Media Session action: run them once.
let lastMedia = 0;
function runAction(id, media) {
  if (media) { const now = performance.now(); if (now - lastMedia < 350) return; lastMedia = now; }
  const a = KEY_ACTIONS.find(x => x[0] === id); if (a) a[3]();
}
// Give one action a new key (removed from any other action that had it); [] removes its keys.
function setKeys(id, keys) {
  const c = { ...(S.get('keys') || {}) };
  for (const k of keys) for (const [other] of KEY_ACTIONS) if (other !== id && keysFor(other).includes(k)) c[other] = keysFor(other).filter(x => x !== k);
  c[id] = keys; S.set('keys', c);
}
/* media keys, the Windows media overlay, MPRIS on Linux, headset buttons */
if ('mediaSession' in navigator) {
  const byKey = k => () => { const id = keyLookup().get(k); if (id) runAction(id, true); };
  const ms = navigator.mediaSession;
  [['play', 'MediaPlayPause'], ['pause', 'MediaPlayPause'], ['nexttrack', 'MediaTrackNext'], ['previoustrack', 'MediaTrackPrevious'], ['stop', 'MediaStop']]
    .forEach(([action, key]) => { try { ms.setActionHandler(action, byKey(key)); } catch {} });
  try { ms.setActionHandler('seekto', d => { if (d.seekTime != null) seekTo(d.seekTime); }); } catch {}
  video.addEventListener('play', () => { ms.playbackState = 'playing'; });
  video.addEventListener('pause', () => { ms.playbackState = 'paused'; });
}
function updateMediaSession(it) {
  if (!('mediaSession' in navigator) || !it) return;
  const art = it.cover || it.thumb, info = it.info || {};
  try { navigator.mediaSession.metadata = new MediaMetadata({ title: it.name, artist: info.artist || '', album: info.album || '', artwork: art ? [{ src: art, sizes: '512x512', type: 'image/jpeg' }] : [] }); } catch {}
}
/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if (UI.dialogOpen() || document.querySelector('.ob-layer')) return;
  if (e.target.matches?.('input:not([type=range]),select,textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key, low = k.toLowerCase(), jump = S.get('jump');
  const custom = e.ctrlKey && keyLookup().get(keyOf(e));
  if (custom) { e.preventDefault(); return runAction(custom); }
  if (e.ctrlKey) {
    const zoom = d => { const v = d ? Math.min(150, Math.max(75, S.get('uiScale') + d)) : 100; S.set('uiScale', v); osd(t('Interface size {v}%', { v })); };
    const VIEWS = ['home', 'videos', 'music', 'network', 'playlists', 'recent'];
    if (/^[1-6]$/.test(k)) { e.preventDefault(); if (mode === 'player') showBrowser(); state.sideMode = 'view'; return navigate({ view: VIEWS[+k - 1], activePlaylist: null }); }
    const map = { '=': () => zoom(10), '+': () => zoom(10), '-': () => zoom(-10), '0': () => zoom(0), o: () => doAct('files'), f: () => doAct('folder'), n: () => doAct('url'), i: () => doAct('mediainfo'), p: () => Panels.openSettings(App), q: () => $('#closeBtn').click(), '\\': toggleHideUI };
    if (map[low]) { e.preventDefault(); map[low](); }
    return;
  }
  if (k === 'F1') { e.preventDefault(); return Panels.shortcuts(); }
  if (k === 'F11') { e.preventDefault(); return toggleFs(); }
  if (e.metaKey) return;
  // your keys (or the defaults) for the actions above
  const act = keyLookup().get(keyOf(e));
  if (act === 'fastHold') { e.preventDefault(); if (!e.repeat) fastStart(e.code); return; }   // held: see FAST above
  if (act) { e.preventDefault(); return runAction(act, /^Media/.test(e.key)); }
  if (e.altKey) return;
  switch (k) {
    case 'Escape':
      if (document.body.classList.contains('hide-ui')) toggleHideUI();
      else if ($('#settings').classList.contains('show')) quick.hide();
      break;
    default: if (/^[0-9]$/.test(k) && curDur()) seekTo(curDur() * (+k / 10));
  }
});
addEventListener('beforeunload', () => { savePos(); stopRecord(); });

/* ---------- settings reactions ---------- */
api.setZoom(S.get('uiScale') / 100);
// Player controls the user switched off in Settings → Interface → Player controls (#10); keyboard shortcuts keep working.
function applyControls() { for (const [k, on] of Object.entries(S.get('ctl'))) document.body.classList.toggle('no-ctl-' + k, !on); }
applyControls();
function applyLog() { api.setLog({ on: S.get('logOn'), file: S.get('logFile') || PATHS.log, level: S.get('logLevel') }); }
S.on(path => {
  if (/^(sub(Size|Color|Outline|Bg|Font)|lyricsSize)$/.test(path)) applySubStyle();
  if (path === 'autoHideSide') updateFocus();
  if (path === 'lyricsView') renderLyrics();
  if (/^(audioBg|audioBgDim|coverSize)$/.test(path)) renderAudioBg();
  if (path === 'audioLabel') { applyAudioLabel(); render(); }
  if (path === 'uiScale') api.setZoom(S.get('uiScale') / 100);
  if (path.startsWith('ctl')) applyControls();
  if (/^(navExpanded|showThumbs|dimWatched|miniPlayer)$/.test(path)) render();
  if (path === 'showBadge') setBadge();
  if (path === 'rememberRecent') { if (!S.get('rememberRecent')) { state.recent = []; render(); } saveRecent(); saveLibrary(); saveWatched(); }
  if (path === 'speed' && Math.abs(video.playbackRate - S.get('speed')) > 1e-6) video.playbackRate = S.get('speed');
  if (path === 'language') { applyAudioLabel(); render(); setPlayIcon(); setBadge(); quick && quick.refresh(); api.setLang && api.setLang(I18N.lang()); }
});

/* ---------- updates (GitHub releases) ---------- */
const Upd = { state: 'idle', info: null, error: '', progress: 0, fns: [] };
const updEmit = () => { Upd.fns.forEach(fn => { try { fn(Upd); } catch {} }); renderUpdateBanner(); };
async function checkUpdates(manual = false) {
  if (Upd.state === 'checking' || Upd.state === 'downloading') return;
  Upd.state = 'checking'; Upd.error = ''; updEmit();
  try {
    const info = await api.updateCheck();
    Upd.info = info; Upd.state = info.newer ? 'available' : 'latest';
    S.set('lastUpdateCheck', Date.now());
    if (info.newer && !manual && S.get('skipVersion') !== info.latest) Upd.banner = true;
  } catch (e) { Upd.state = 'error'; Upd.error = String(e && e.message || e); }
  updEmit();
}
async function installUpdate() {
  if (!Upd.info) return;
  Upd.state = 'downloading'; Upd.progress = 0; updEmit();
  try { const r = await api.updateInstall(Upd.info); Upd.state = r.done; }
  catch (e) { Upd.state = 'error'; Upd.error = String(e && e.message || e); }
  updEmit();
}
api.onUpdateProgress(p => { Upd.progress = p.total ? p.got / p.total : 0; updEmit(); });
const updActionLabel = () => ({ install: 'Install update', download: 'Download update' })[Upd.info && Upd.info.mode] || 'Open download page';
function renderUpdateBanner() {
  let b = $('#updateBanner');
  if (!Upd.banner || !Upd.info) { if (b) b.remove(); return; }
  if (!b) { b = el('div'); b.id = 'updateBanner'; document.body.append(b); }
  const busy = Upd.state === 'downloading';
  b.replaceChildren(...[
    el('span.ub-icon', { html: icon('download') }),
    el('div.ub-text', {}, el('b', {}, t('Update available: {v}', { v: 'v' + Upd.info.latest })),
      el('span', {}, busy ? t('Downloading update… {p}%', { p: Math.round(Upd.progress * 100) }) : Upd.state === 'installing' ? t('The update is being installed. The app will restart.')
        : Upd.state === 'downloaded' ? t('The update has been downloaded.') : Upd.state === 'error' ? t('Could not check for updates.') : t('You are using v{v}.', { v: Upd.info.current }))),
    busy ? el('div.ub-bar', {}, el('i', { style: { width: Math.round(Upd.progress * 100) + '%' } })) : null,
    !busy && Upd.state === 'available' ? UI.button(updActionLabel(), () => installUpdate(), 'primary') : null,
    !busy ? UI.button('Later', () => { Upd.banner = false; renderUpdateBanner(); }, 'ghost') : null].filter(Boolean));
}

/* ---------- App API for panels / onboarding ---------- */
const App = {
  video, paths: PATHS, osd, addSources,
  marks: { chapters: () => chaptersOf(curItem()), bookmarks: () => bookmarksOf(curItem()), set: list => curItem() && setBookmarks(curItem(), list), add: addBookmark, time: () => curTime(), seek: x => seekTo(x), dur: () => curDur(), label: x => curItem() ? markLabel(curItem(), x) : '' }, createPlaylist, addFolder, removeFolder,
  rescan: async () => { osd('Scanning library…'); await scanFolders(); osd('Library updated'); },
  clearRecent: () => { state.recent = []; saveRecent(); render(); App.osd('Recent cleared'); },
  clearPositions: () => { for (const k in positions) delete positions[k]; store.set('pos', positions); watched = new Set(); saveWatched(); state.items.forEach(i => i.progress = 0); render(); App.osd('Playback positions cleared'); },
  audioTracks, audioTrack: () => P.audio, setAudioTrack,
  subTracks: () => [[-1, 'Off'], ...SUB.tracks.map((t, i) => [i, t.label])], subActive: () => SUB.active, selectSub, loadSubFile, sub: subSync,
  reloadSource, showOnboarding, applyLog, viewTitle,
  keys: { actions: () => KEY_ACTIONS.map(([id, label, def]) => ({ id, label, keys: keysFor(id), changed: JSON.stringify(keysFor(id)) !== JSON.stringify(def) })), set: setKeys, reset: () => S.set('keys', {}), of: keyOf }, addSubFile, current: () => curItem(),
  update: { get: () => Upd, check: checkUpdates, install: installUpdate, label: updActionLabel, on: fn => Upd.fns.push(fn), off: fn => { const i = Upd.fns.indexOf(fn); if (i >= 0) Upd.fns.splice(i, 1); } },
};
function showOnboarding() {
  video.pause();
  Onboarding.show(App, { onDone: () => {
    navigate({ view: S.get('startView') || 'videos' }, false);
    if (pendingOpen) { const p = pendingOpen; pendingOpen = null; addSources(p, { play: true }); }
  } });
}
App.appInfo = await api.appInfo();
document.body.classList.toggle('rounded-win', !!App.appInfo.drawsRoundedCorners);
quick = Panels.quickPanel(App);
// A click outside the quick settings panel closes it. A click on the video then only closes the panel
// (it does not also pause), like closing a menu.
let swallowVideoClick = false;
document.addEventListener('pointerdown', e => {
  swallowVideoClick = false;
  const panel = $('#settings');
  if (!panel.classList.contains('show') || panel.contains(e.target) || e.target.closest('#setBtn, #eqBtn, #subBtn, .menu-layer, .dlg-layer')) return;
  quick.hide();
  swallowVideoClick = e.target === video;
}, true);
video.addEventListener('click', e => { if (swallowVideoClick) { swallowVideoClick = false; e.stopImmediatePropagation(); } }, true);
$('#setBtn').onclick = () => quick.toggle();
$('#eqBtn').onclick = () => quick.toggle('audio');
$('#subBtn').onclick = () => quick.toggle('subs');
window.App = App;

/* ---------- start ---------- */
I18N.apply(); api.setLang && api.setLang(I18N.lang()); applyAudioLabel();
render(); setPlayIcon(); setIdle(null); applyLog();
if (S.get('devMode')) api.devtools(true);
const lib = store.get('library', []);
if (lib.length) {
  const ok = await api.exists(lib.map(l => l.src));
  const added = Object.fromEntries(lib.map(l => [l.src, l.added]));
  await addSources(ok, { play: false, silent: true, added });
}
{ const pls = [...new Set(state.playlists.flatMap(p => p.srcs))].filter(s => !bySrc(s));
  if (pls.length) { const ok = await api.exists(pls); if (ok.length) await addSources(ok, { play: false, silent: true, manual: false }); } }
if (S.get('mediaFolders').length) scanFolders();
if (!S.get('onboarded')) showOnboarding();
if (S.get('autoUpdate') && Date.now() - (S.get('lastUpdateCheck') || 0) > 6 * 3600e3) setTimeout(() => checkUpdates(false), 4000);
I18N.onChange(renderUpdateBanner);
api.ready();
})();
