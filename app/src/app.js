(async () => {
const { $, $$, esc, el, icon } = UI;
const video = $('#video');
const api = window.api;
const { port, token } = await api.info();
const PATHS = await api.paths();
const fileUrl = p => `http://127.0.0.1:${port}/file?t=${token}&src=${encodeURIComponent(p)}`;
const streamUrl = (src, ss, a, vcopy) => `http://127.0.0.1:${port}/stream?t=${token}&src=${encodeURIComponent(src)}&ss=${ss.toFixed(2)}&a=${a}&vcopy=${vcopy ? 1 : 0}&q=${S.get('txQuality')}&maxw=${S.get('txMaxW')}`;
FX.attach(video);

/* ---------- pixel cat (idle screen) ---------- */
const CAT = [
"..K..........K....", "..KW........WK....", "..KWW......WWK....", "..KWWWWWWWWWWK....", "..KWWWWWWWWWWK....",
"KKWKKWWWWWWKKWKK..", "..WWWWWWWWWWWWW...", "KKWPPWKWWKWPPWKK..", "..WWWWWKKKWWWWW...", "....WWWWWWWWW.....",
"....WWWWWWWWW.....", "....WWWWWWWWW..W..", "....WGWWWWWWW...W.", "....WGWWWWWWWW..W.", "....WGWWWGWWWW.WW.",
"....WGWWWGWWWWWW..", "....W.W.W.W.WW....",
];
function catSVG(cls = '') {
  const C = { W: '#ececec', K: '#111', P: '#f6b8c4', G: '#a8a8a8' };
  let r = '';
  CAT.forEach((row, y) => [...row].forEach((c, x) => { if (C[c]) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${C[c]}"/>`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" viewBox="0 0 18 17" shape-rendering="crispEdges">${r}</svg>`;
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
  items: [], current: -1, view: 'videos',
  playlists: store.get('playlists3', null) || store.get('playlists2', [{ name: 'Cool Songs', srcs: [] }, { name: 'Anime to Watch', srcs: [] }]),
  activePlaylist: null, recent: store.get('recent2', []),
  sort: 'name', list: false, query: '', dir: { videos: null, music: null },
  sideMode: 'view',
};
const history = { back: [], fwd: [] };
let rec = null, quick = null;
let uid = 0;
const bySrc = src => state.items.find(i => i.src === src);
const saveLibrary = () => store.set('library', S.get('rememberRecent') ? state.items.filter(i => i.manual).map(i => ({ src: i.src, added: i.added })) : []);
const savePlaylists = () => store.set('playlists3', state.playlists);
const saveRecent = () => store.set('recent2', S.get('rememberRecent') ? state.recent.slice(0, 50) : []);

const isAudio = it => it.type === 'audio';
const AUDIO_RE = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|wma|ac3|dts|mka|ape|aiff?)$/i;
const SUB_RE = /\.(srt|vtt|ass|ssa|sub)$/i;
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
async function addSources(srcs, { play = true, silent = false, added, manual = true } = {}) {
  const subs = srcs.filter(s => SUB_RE.test(s));
  const media = srcs.filter(s => !SUB_RE.test(s));
  const newOnes = []; let first = null;
  for (const src of media) {
    let it = bySrc(src);
    if (!it) {
      const remote = /^[a-z]+:\/\//i.test(src);
      it = { id: ++uid, src, name: baseName(src), remote, type: AUDIO_RE.test(src) ? 'audio' : 'video', thumb: null, duration: 0,
             progress: positions[src] || 0, added: (added && added[src]) || Date.now(), info: null, manual };
      it.ready = enrich(it);
      state.items.push(it); newOnes.push(it);
    } else if (manual && !it.manual) it.manual = !S.get('mediaFolders').some(f => under(src, f));
    first = first || it;
  }
  if (newOnes.length) saveLibrary();
  renderSoon();
  if (subs.length && state.current >= 0) for (const s of subs) addSubFile(s, true);
  if (play && first) playItem(state.items.indexOf(first));
  else if (!silent && newOnes.length) osd(t('{n} item(s) added', { n: newOnes.length }));
  return newOnes;
}
let running = 0; const waiting = [];
function limit(fn) { return new Promise(res => { const go = async () => { running++; try { res(await fn()); } finally { running--; waiting.length && waiting.shift()(); } }; running < 2 ? go() : waiting.push(go); }); }
function enrich(it) {
  return limit(async () => {
    const info = await api.probe(it.src);
    if (info) {
      it.info = info; it.duration = info.duration;
      it.type = info.vcodec ? 'video' : 'audio';
      if (S.get('thumbs') && (info.vcodec || info.cover)) it.thumb = await api.thumb(it.src, info.vcodec ? Math.min(info.duration * 0.2, 120) : 0);
    }
    renderSoon();
  });
}
let rs; function renderSoon() { clearTimeout(rs); rs = setTimeout(render, 80); }

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
  state.current = cur ? state.items.indexOf(cur) : -1;
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
const viewTitle = v => t(VIEW_TITLES[v]);
const itemsLabel = n => t(n === 1 ? '1 item' : '{n} items', { n });
const REPEAT_NAMES = { off: 'Off', one: 'Current', all: 'All' };
const typeOf = view => view === 'music' ? 'audio' : 'video';
function sortItems(list) {
  return list.slice().sort(state.sort === 'name' ? (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) : (a, b) => b.added - a.added);
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
  state.query = ''; $('#search').value = '';
  showBrowser(); render();
}
function goBack() { if (mode === 'player') return showBrowser(); const h = history.back.pop(); if (!h) return; history.fwd.push({ view: state.view, dir: { ...state.dir }, pl: state.activePlaylist }); state.view = h.view; state.dir = h.dir; state.activePlaylist = h.pl; render(); }
function goFwd() { const h = history.fwd.pop(); if (!h) return; history.back.push({ view: state.view, dir: { ...state.dir }, pl: state.activePlaylist }); state.view = h.view; state.dir = h.dir; state.activePlaylist = h.pl; render(); }

/* ---------- rendering ---------- */
const ICON_PLAY = icon('play'), ICON_AUDIO = '<svg class="icon" viewBox="0 0 24 24"><circle cx="8" cy="17" r="3"/><path d="M11 17V5l8 2"/></svg>', ICON_VIDEO = '<svg class="icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/></svg>';
function cardHTML(it) {
  const idx = state.items.indexOf(it);
  const w = isWatched(it), pct = w ? 100 : it.duration ? Math.min(100, it.progress / it.duration * 100) : 0;
  const thumb = S.get('showThumbs') && it.thumb;
  return `<div class="card ${idx === state.current ? 'on' : ''} ${w && S.get('dimWatched') ? 'watched' : ''}" data-idx="${idx}" title="${esc(it.src)}">
    <div class="thumb">${thumb ? `<img src="${it.thumb}" alt="">` : `<div class="ph">${isAudio(it) ? '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="17" r="3"/><path d="M11 17V5l8 2"/></svg>' : '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/></svg>'}</div>`}
      ${pct > 1 ? `<div class="prog" style="width:${pct}%"></div>` : ''}
      ${it.duration ? `<span class="dur">${shortFmt(it.duration)}</span>` : ''}
      <div class="play"><svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M7 4l13 8-13 8z"/></svg></div>
    </div><div class="name">${esc(it.name)}</div></div>`;
}
function folderHTML(f) {
  const t = S.get('showThumbs') && f.items.find(i => i.thumb);
  return `<div class="card folder" data-dir="${esc(f.path)}" title="${esc(f.path)}"><div class="thumb">${t ? `<img src="${t.thumb}" alt="">` : ''}<span class="fic">${icon('folder')}</span><span class="fcount">${itemsLabel(f.items.length)}</span></div><div class="name">${esc(f.name)}</div></div>`;
}
const sectionHead = s => `<div style="grid-column:1/-1;font-size:15px;font-weight:600;color:var(--text);margin-top:4px">${esc(t(s))}</div>`;

function render() {
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
    html = state.playlists.map((p, i) => `<div class="card" data-pl="${i}"><div class="thumb" style="background:${p.cover ? `url('${p.cover}') center/cover` : 'var(--panel2)'};display:grid;place-items:center">${p.cover ? '' : `<span class="fic" style="color:var(--muted)">${icon('playlist', 'icon big')}</span>`}<span class="fcount" style="position:absolute;left:8px;bottom:6px;font-size:11px;color:#fff;background:#000a;padding:1px 6px;border-radius:3px">${itemsLabel(p.srcs.length)}</span></div><div class="name">${esc(p.name)}</div></div>`).join('')
      + `<div class="card" data-act="newpl"><div class="thumb" style="background:transparent;border:1px dashed var(--line);display:grid;place-items:center;color:var(--muted)">${icon('plus', 'icon big')}</div><div class="name" style="color:var(--muted)">${esc(t('Create playlist'))}</div></div>`;
    count = state.playlists.length;
  } else {
    const list = visibleItems();
    if (b && !state.query) html += b.folders.map(folderHTML).join('');
    html += list.map(cardHTML).join('');
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
    html = q.map(it => { const idx = state.items.indexOf(it); return `<div class="srow ${idx === state.current ? 'on' : ''}" data-idx="${idx}" title="${esc(it.src)}">${idx === state.current ? ICON_PLAY : (isAudio(it) ? ICON_AUDIO : ICON_VIDEO)}<span>${esc(it.name)}</span></div>`; }).join('');
  } else if (v === 'playlists') {
    n = state.playlists.length;
    html = `<div class="srow muted" data-act="newpl">${icon('plus')}<span>${esc(t('Create playlist'))}</span></div>` +
      state.playlists.map((p, i) => `<div class="srow ${state.activePlaylist === p ? 'on' : ''}" data-pl="${i}">${p.cover ? `<span class="cov" style="background-image:url('${p.cover}')"></span>` : icon('playlist')}<span>${esc(p.name)}</span></div>`).join('');
  } else {
    let entries = [];
    if ((v === 'videos' || v === 'music') && !state.query) { const b = browse(v); entries = b.folders.map(f => `<div class="srow" data-dir="${esc(f.path)}">${icon('folder')}<span>${esc(f.name)}</span></div>`); }
    const list = visibleItems(); n = list.length + entries.length;
    html = entries.join('') + list.map(it => { const idx = state.items.indexOf(it); return `<div class="srow ${idx === state.current ? 'on' : ''}" data-idx="${idx}" title="${esc(it.src)}">${idx === state.current ? ICON_PLAY : (isAudio(it) ? ICON_AUDIO : ICON_VIDEO)}<span>${esc(it.name)}</span></div>`; }).join('');
    if (!n) html = `<div class="srow muted" data-act="files">${icon('plus')}<span>${esc(t('Add media'))}</span></div>`;
  }
  $('#sideTitle').textContent = title;
  $('#sideCount').textContent = itemsLabel(n);
  $('#sideList').innerHTML = html;
}

let mode = 'browser';
function showPlayer() { mode = 'player'; $('#player').classList.add('show'); $('#browser').style.visibility = 'hidden'; updateMini(); updateFocus(); render && $('#navBack') && ($('#navBack').style.opacity = 1); }
function showBrowser() { mode = 'browser'; $('#player').classList.remove('show'); $('#browser').style.visibility = ''; updateMini(); updateFocus(); }
// While a video plays, the rail and library panel collapse so the video gets the full width (setting autoHideSide).
// The sidebar button brings them back until the next video starts.
let sideOverride = false;
function updateFocus() {
  const it = state.items[state.current];
  document.body.classList.toggle('focus-video', !!(S.get('autoHideSide') && mode === 'player' && it && it.type === 'video' && !sideOverride));
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
    video.src = streamUrl(it.src, at, P.audio, P.vcopy);
  } else {
    P.seekTarget = null; P.offset = 0; P.pendingSeek = at;
    video.src = it.remote ? it.src : fileUrl(it.src);
  }
  video.playbackRate = S.get('speed') || 1;
  setBadge(); setSpinner(true);
  if (autoplay) video.play().catch(() => {});
}
function reloadSource() { const it = curItem(); if (!it) return; P.tx = S.get('forceTx') || !canDirect(it.info) || P.audio > 0; loadSource(curTime(), !video.paused); }

function setIdle(it) {
  const idle = $('#idle'), showVideo = it && !isAudio(it) && video.videoWidth;
  $('#player').classList.toggle('playing-video', !!showVideo);
  if (showVideo) { idle.innerHTML = ''; return; }
  idle.innerHTML = it && it.thumb && isAudio(it) ? `<div class="cover" style="background-image:url('${it.thumb}')"></div>` : catSVG();
}
async function playItem(idx, autoplay = true) {
  const it = state.items[idx]; if (!it) return;
  savePos();
  state.current = idx; P.audio = 0; P.retried = false; P.forceReencode = false; P.fit = true; sideOverride = false;
  showPlayer(); render(); setSpinner(true);
  video.removeAttribute('src'); video.load();
  clearSubs(); setIdle(it);
  await it.ready;
  if (curItem() !== it) return;
  P.tx = S.get('forceTx') || !canDirect(it.info);
  const resumeAt = S.get('resume') && positions[it.src] && positions[it.src] < (it.duration || 1e9) - 5 ? positions[it.src] : 0;
  loadSource(resumeAt, autoplay);
  if (resumeAt) osd(t('Resuming from {time}', { time: shortFmt(resumeAt) }));
  setIdle(it);
  if (S.get('rememberRecent')) { state.recent = [it.src, ...state.recent.filter(s => s !== it.src)]; saveRecent(); }
  setupSubs(it);
  buildStoryboard(it);
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
  if (S.get('repeat') === 'one') { P.tx ? loadSource(0, true) : (video.currentTime = 0, video.play()); }
  else if (S.get('autoNext') || S.get('repeat') === 'all') step(1, true);
  else { setPlayIcon(); render(); }
});
video.addEventListener('timeupdate', updateTime);
video.addEventListener('progress', updateTime);
video.addEventListener('durationchange', updateTime);
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
  if (state.current < 0) { const v = visibleItems()[0] || state.items[0]; if (v) playItem(state.items.indexOf(v)); else doAct('files'); return; }
  if (video.paused) video.play().catch(() => {}); else video.pause();
  flashBig();
}
function flashBig() { const d = $('#bigplay div'); $('#bigIcon').innerHTML = video.paused ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4l13 8-13 8z"/>'; d.classList.add('flash'); clearTimeout(flashBig.t); flashBig.t = setTimeout(() => d.classList.remove('flash'), 350); }
function queue() {
  if (state.queueList && state.queueList.some(i => state.items.indexOf(i) === state.current)) return state.queueList;
  const v = state.query ? visibleItems() : (state.view === 'home' ? sortItems(state.items) : visibleItems());
  return v.some(i => state.items.indexOf(i) === state.current) ? v : (curItem() && !curItem().remote && S.get('mediaFolders').length ? siblingsOf(curItem()) : state.items);
}
function siblingsOf(it) { const dir = it.src.split(SEP).slice(0, -1).join('\\'); return sortItems(state.items.filter(i => i.type === it.type && i.src.split(SEP).slice(0, -1).join('\\') === dir)); }
function step(dir, auto) {
  const q = queue(); if (!q.length) return;
  if (S.get('shuffle') && q.length > 1) { let n; do { n = q[Math.floor(Math.random() * q.length)]; } while (state.items.indexOf(n) === state.current); return playItem(state.items.indexOf(n)); }
  let pos = q.findIndex(i => state.items.indexOf(i) === state.current) + dir;
  if (pos >= q.length) { if (S.get('repeat') === 'all') pos = 0; else { setPlayIcon(); render(); return auto ? null : osd('End of the list'); } }
  if (pos < 0) pos = S.get('repeat') === 'all' ? q.length - 1 : 0;
  playItem(state.items.indexOf(q[pos]));
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

const seek = $('#seek');
const frac = (e, elm) => { const r = elm.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
seek.addEventListener('pointerdown', e => { if (!curDur()) return; dragging = true; seek.setPointerCapture(e.pointerId); setSeekUI(frac(e, seek)); });
seek.addEventListener('pointermove', e => { const f = frac(e, seek); const tip = $('#seekTip'); tip.style.left = f * 100 + '%'; tip.textContent = fmt(f * curDur()); if (dragging) setSeekUI(f); preview(e, f); });
seek.addEventListener('pointerleave', () => { if (!dragging) schedulePreviewHide(); });

/* ---------- timeline hover preview (design: frame card with the time above the seek bar) ---------- */
const pvBox = $('#seekPreview'), pvCanvas = $('#seekPreview canvas'), pvCtx = pvCanvas.getContext('2d'), pvTime = $('#seekPreview span');
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
  if (!S.get('seekPreview') || !it || !d) return hidePreview();
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
  if (isAudio(it) || it.remote) return pvStage();
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
video.addEventListener('click', togglePlay);
$('#player').addEventListener('dblclick', e => { if ((S.get('dblclick') || 'fullscreen') === 'fullscreen') toggleFs(); else togglePlay(); });
$('#fsBtn2').onclick = toggleFs;
$('#minBtn').onclick = () => api.win('min');
$('#maxBtn').onclick = () => api.win('max');
$('#closeBtn').onclick = () => { savePos(); stopRecord(); api.win('close'); };
api.onMaximized(m => { $('#maxIcon').innerHTML = m ? '<rect x="8" y="5" width="11" height="11" rx="1"/><path d="M5 8v10a1 1 0 0 0 1 1h10"/>' : '<rect x="6" y="6" width="12" height="12" rx="1"/>'; });
$('#titlebar').addEventListener('dblclick', e => { if (!e.target.closest('button')) api.win('max'); });
function toggleFs() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
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
let hideT; document.addEventListener('mousemove', e => {
  fsZones(e.clientY);
  document.body.classList.remove('hidecursor'); clearTimeout(hideT);
  hideT = setTimeout(() => {
    const b = document.body.classList;
    if (!video.paused && !b.contains('fs-top') && !b.contains('fs-bottom')) b.add('hidecursor');
  }, S.get('hideCursorDelay') * 1000);
});
document.documentElement.addEventListener('mouseleave', () => fsZones(null));
function toggleHideUI() { const on = document.body.classList.toggle('hide-ui'); if (on) showPlayer(); osd(on ? 'Interface hidden – press Ctrl+\\ to show it again' : 'Interface visible'); }

/* ---------- per-frame: mini preview + subtitles ---------- */
const mctx = $('#miniCanvas').getContext('2d');
let lastSub = null;
const SUB = { tracks: [], active: -1 };
const subSync = { delay: 0, speed: 1, dur: 0 };
(function frame() {
  if (mode === 'browser' && state.current >= 0 && video.videoWidth && !isAudio(curItem())) {
    const c = mctx.canvas, r = Math.min(c.width / video.videoWidth, c.height / video.videoHeight), w = video.videoWidth * r, h = video.videoHeight * r;
    mctx.fillStyle = '#000'; mctx.fillRect(0, 0, c.width, c.height);
    try { mctx.filter = FX.filterString().replace(/url\([^)]*\)\s*/g, '') || 'none'; mctx.drawImage(video, (c.width - w) / 2, (c.height - h) / 2, w, h); mctx.filter = 'none'; } catch {}
    $('#miniCanvasWrap .cat').style.display = 'none';
  } else if (mode === 'browser') { mctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--stage') || '#2a2928'; mctx.fillRect(0, 0, 320, 180); $('#miniCanvasWrap .cat').style.display = ''; }
  const tr = SUB.tracks[SUB.active];
  let htmlSub = '';
  if (tr && tr.cues) {
    const t = curTime() - subSync.delay, sp = subSync.speed || 1;
    htmlSub = tr.cues.filter(c => t >= c.s / sp && t <= c.e / sp + subSync.dur).map(c => `<span>${c.h}</span>`).join('<br>');
  }
  if (htmlSub !== lastSub) { $('#subs').innerHTML = htmlSub; lastSub = htmlSub; }
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
function clearSubs() { SUB.tracks = []; SUB.active = -1; subSync.delay = 0; subSync.speed = 1; subSync.dur = 0; }
async function setupSubs(it) {
  if (it.info) it.info.subs.forEach(s => SUB.tracks.push({ label: s.label + (BITMAP.test(s.codec) ? ' (' + t('image-based, not supported') + ')' : ''), lang: s.lang, src: it.src, idx: s.i, bitmap: BITMAP.test(s.codec) }));
  if (!it.remote && S.get('subAuto')) {
    const sib = await api.siblingSubs(it.src); if (curItem() !== it) return;
    for (const f of sib) SUB.tracks.push({ label: baseName(f), src: f, idx: null });
    if (sib.length) return selectSub(SUB.tracks.length - sib.length);
  }
  const prefs = (S.get('subLang') || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (prefs.length) { const i = SUB.tracks.findIndex(t => !t.bitmap && t.lang && prefs.some(p => t.lang.toLowerCase().startsWith(p))); if (i >= 0) selectSub(i); }
}
async function addSubFile(file, select) { SUB.tracks.push({ label: baseName(file), src: file, idx: null }); if (select) await selectSub(SUB.tracks.length - 1); quick && quick.refresh(); }
async function selectSub(i) {
  if (i < 0) { SUB.active = -1; osd('Subtitles off'); return; }
  SUB.active = i;
  const tr = SUB.tracks[i]; if (!tr) return;
  if (tr.bitmap) { osd('Image-based subtitles are not supported'); SUB.active = -1; return; }
  if (!tr.cues) { osd('Loading subtitles…'); const txt = await api.subs(tr.src, tr.idx); tr.cues = txt ? parseVTT(txt) : []; }
  osd(tr.cues.length ? t('Subtitles: {name}', { name: tr.label }) : 'No subtitles found');
}
async function loadSubFile() { if (state.current < 0) return osd('Play something first'); const f = await api.openSubtitle(); if (f) addSubFile(f, true); }
function cycleSubs() { if (!SUB.tracks.length) return osd('No subtitles'); const n = SUB.active + 1 >= SUB.tracks.length ? -1 : SUB.active + 1; selectSub(n); }
function applySubStyle() {
  const r = document.documentElement.style;
  r.setProperty('--subsize', S.get('subSize') / 100); r.setProperty('--subcolor', S.get('subColor')); r.setProperty('--subout', S.get('subOutline'));
  r.setProperty('--subbg', `rgba(0,0,0,${S.get('subBg') / 100})`); r.setProperty('--subfont', `"${S.get('subFont')}", "Segoe UI", sans-serif`);
  $('#subs').style.fontFamily = `"${S.get('subFont')}", "Segoe UI", sans-serif`;
}
applySubStyle();

/* ---------- audio tracks ---------- */
const audioTracks = () => { const it = curItem(); const t = it && it.info ? it.info.audio : []; return t.length ? t.map(a => [a.i, `${a.label} (${a.codec}${a.ch ? ', ' + a.ch + 'ch' : ''})`]) : [[0, 'Default']]; };
function setAudioTrack(i) { if (!curItem()) return; P.audio = i; P.tx = S.get('forceTx') || !canDirect(curItem().info) || P.audio > 0; loadSource(curTime(), !video.paused); const tk = audioTracks().find(x => x[0] === i); osd(t('Audio track: {name}', { name: tk ? tk[1] : i })); }
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
  const idx = state.items.indexOf(it);
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
  else if (r.dataset.pl) navigate({ view: 'playlists', activePlaylist: state.playlists[+r.dataset.pl] });
  else if (r.dataset.act) doAct(r.dataset.act);
});
$('#grid').addEventListener('click', e => {
  const c = e.target.closest('.card'); if (!c) return;
  if (c.dataset.dir) return navigate({ dir: { ...state.dir, [state.view]: c.dataset.dir } });
  if (c.dataset.pl) return navigate({ activePlaylist: state.playlists[+c.dataset.pl] });
  if (c.dataset.act) return doAct(c.dataset.act);
  state.queueList = state.view === 'home' ? null : visibleItems();
  playItem(+c.dataset.idx);
});
$('#search').addEventListener('input', e => { state.query = e.target.value.trim().toLowerCase(); render(); });
$('#viewToggle').onclick = () => { state.list = !state.list; render(); };
$('#sortBtn').onclick = $('#sortBtn2').onclick = () => { state.sort = state.sort === 'name' ? 'added' : 'name'; osd(state.sort === 'name' ? 'Sort by name' : 'Sort by date added'); render(); };
$('#moreBtn').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); UI.menu([
  { label: 'Grid / list', icon: 'queue', action: () => { state.list = !state.list; render(); } },
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
      { label: 'Play', icon: 'play', accent: true, action: () => playItem(state.items.indexOf(it)) },
      { label: 'Add to playlist…', icon: 'playlist', action: () => addToPlaylist(it) },
      { label: isWatched(it) ? 'Mark as unwatched' : 'Mark as watched', icon: 'eye', action: () => { isWatched(it) ? watched.delete(it.src) : watched.add(it.src); saveWatched(); render(); } },
      !it.remote ? { label: 'Show in folder', icon: 'folder', action: () => api.reveal(it.src) } : null,
      { label: 'Media information', icon: 'info', action: () => mediaInfo(it) },
      { sep: true },
      state.view === 'playlists' && state.activePlaylist
        ? { label: 'Remove from playlist', icon: 'trash', danger: true, action: () => { const p = state.activePlaylist; p.srcs = p.srcs.filter(s => s !== it.src); savePlaylists(); render(); } }
        : { label: 'Remove from library', icon: 'trash', danger: true, action: () => removeItem(it) },
    ], e.clientX, e.clientY);
  } else if (pl) {
    const p = state.playlists[+pl.dataset.pl];
    UI.menu([
      { label: 'Play', icon: 'play', accent: true, action: () => { const f = bySrc(p.srcs[0]); if (f) { state.queueList = p.srcs.map(bySrc).filter(Boolean); playItem(state.items.indexOf(f)); } else osd('Playlist is empty'); } },
      { label: 'Rename…', icon: 'general', action: async () => { const n = await UI.prompt('Rename', { value: p.name }); if (n && n.trim()) { p.name = n.trim(); savePlaylists(); render(); } } },
      { label: 'Choose cover…', icon: 'camera', action: async () => { const f = await api.chooseFile(t('Cover image'), ['png', 'jpg', 'jpeg', 'webp']); if (f) { p.cover = await api.readImage(f); savePlaylists(); render(); } } },
      { sep: true },
      { label: 'Delete', icon: 'trash', danger: true, action: async () => { if (await UI.confirm('Delete playlist?', p.name, 'Delete')) { state.playlists.splice(state.playlists.indexOf(p), 1); if (state.activePlaylist === p) state.activePlaylist = null; savePlaylists(); render(); } } },
    ], e.clientX, e.clientY);
  } else if (dir) {
    const path = dir.dataset.dir;
    UI.menu([
      { label: 'Open', icon: 'folder', action: () => navigate({ dir: { ...state.dir, [state.view]: path } }) },
      { label: 'Play all', icon: 'play', accent: true, action: () => { const list = sortItems(state.items.filter(i => under(i.src, path) && i.type === typeOf(state.view))); if (list.length) { state.queueList = list; playItem(state.items.indexOf(list[0])); } } },
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

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if (UI.dialogOpen() || document.querySelector('.ob-layer')) return;
  if (e.target.matches?.('input:not([type=range]),select,textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key, low = k.toLowerCase(), jump = S.get('jump');
  if (e.ctrlKey) {
    const zoom = d => { const v = d ? Math.min(150, Math.max(75, S.get('uiScale') + d)) : 100; S.set('uiScale', v); osd(t('Interface size {v}%', { v })); };
    const map = { '=': () => zoom(10), '+': () => zoom(10), '-': () => zoom(-10), '0': () => zoom(0), o: () => doAct('files'), f: () => doAct('folder'), n: () => doAct('url'), i: () => doAct('mediainfo'), p: () => Panels.openSettings(App), q: () => $('#closeBtn').click(), '\\': toggleHideUI };
    if (map[low]) { e.preventDefault(); map[low](); }
    return;
  }
  if (k === 'F1') { e.preventDefault(); return Panels.shortcuts(); }
  if (k === 'F11') { e.preventDefault(); return toggleFs(); }
  if (e.metaKey || e.altKey) return;
  switch (k) {
    case ' ': case 'k': e.preventDefault(); togglePlay(); break;
    case 'ArrowRight': e.preventDefault(); seekTo(curTime() + (e.shiftKey ? 3 : jump)); osd('+' + (e.shiftKey ? 3 : jump) + ' s'); break;
    case 'ArrowLeft': e.preventDefault(); seekTo(curTime() - (e.shiftKey ? 3 : jump)); osd('−' + (e.shiftKey ? 3 : jump) + ' s'); break;
    case 'ArrowUp': e.preventDefault(); video.muted = false; setVol(volume + .05); osd(t('Volume {v}%', { v: Math.round(volume * 100) })); break;
    case 'ArrowDown': e.preventDefault(); setVol(volume - .05); osd(t('Volume {v}%', { v: Math.round(volume * 100) })); break;
    case 'm': toggleMute(); break;
    case 'f': toggleFs(); break;
    case 'n': case '>': step(1); break;
    case 'p': case '<': prev(); break;
    case 'q': toggleQueue(); break;
    case 'l': toggleLibrary(); break;
    case 'v': cycleSubs(); break;
    case 'b': cycleAudio(); break;
    case 'g': nudgeSub(-0.1); break;
    case 'h': nudgeSub(0.1); break;
    case 'S': snapshot(); break;
    case 's': if (curItem()) { stopPlayback(); osd('Stopped'); } break;
    case 'r': case 'R': toggleRecord(); break;
    case '[': video.playbackRate = Math.max(.25, +(video.playbackRate - .25).toFixed(2)); osd(t('Speed {v}×', { v: video.playbackRate })); break;
    case ']': video.playbackRate = Math.min(4, +(video.playbackRate + .25).toFixed(2)); osd(t('Speed {v}×', { v: video.playbackRate })); break;
    case '=': video.playbackRate = 1; osd(t('Speed {v}×', { v: 1 })); break;
    case '.': case ',': if (!curItem()) break; video.pause(); if (P.tx) seekTo(curTime() + (k === '.' ? 0.04 : -0.04)); else video.currentTime = Math.max(0, video.currentTime + (k === '.' ? 1 / 30 : -1 / 30)); break;
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
function applyLog() { api.setLog({ on: S.get('logOn'), file: S.get('logFile') || PATHS.log, level: S.get('logLevel') }); }
S.on(path => {
  if (/^sub(Size|Color|Outline|Bg|Font)$/.test(path)) applySubStyle();
  if (path === 'autoHideSide') updateFocus();
  if (path === 'uiScale') api.setZoom(S.get('uiScale') / 100);
  if (/^(navExpanded|showThumbs|dimWatched|miniPlayer)$/.test(path)) render();
  if (path === 'showBadge') setBadge();
  if (path === 'rememberRecent') { if (!S.get('rememberRecent')) { state.recent = []; render(); } saveRecent(); saveLibrary(); saveWatched(); }
  if (path === 'speed' && Math.abs(video.playbackRate - S.get('speed')) > 1e-6) video.playbackRate = S.get('speed');
  if (path === 'language') { render(); setPlayIcon(); setBadge(); quick && quick.refresh(); api.setLang && api.setLang(I18N.lang()); }
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
  video, paths: PATHS, osd, addSources, createPlaylist, addFolder, removeFolder,
  rescan: async () => { osd('Scanning library…'); await scanFolders(); osd('Library updated'); },
  clearRecent: () => { state.recent = []; saveRecent(); render(); App.osd('Recent cleared'); },
  clearPositions: () => { for (const k in positions) delete positions[k]; store.set('pos', positions); watched = new Set(); saveWatched(); state.items.forEach(i => i.progress = 0); render(); App.osd('Playback positions cleared'); },
  audioTracks, audioTrack: () => P.audio, setAudioTrack,
  subTracks: () => [[-1, 'Off'], ...SUB.tracks.map((t, i) => [i, t.label])], subActive: () => SUB.active, selectSub, loadSubFile, sub: subSync,
  reloadSource, showOnboarding, applyLog,
  update: { get: () => Upd, check: checkUpdates, install: installUpdate, label: updActionLabel, on: fn => Upd.fns.push(fn), off: fn => { const i = Upd.fns.indexOf(fn); if (i >= 0) Upd.fns.splice(i, 1); } },
};
function showOnboarding() {
  video.pause();
  Onboarding.show(App, { onDone: () => {
    navigate({ view: 'videos' }, false);
    if (pendingOpen) { const p = pendingOpen; pendingOpen = null; addSources(p, { play: true }); }
  } });
}
App.appInfo = await api.appInfo();
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
I18N.apply(); api.setLang && api.setLang(I18N.lang());
render(); setPlayIcon(); setIdle(null); applyLog();
if (S.get('devMode')) api.devtools(true);
const lib = store.get('library', []);
if (lib.length) {
  const ok = await api.exists(lib.map(l => l.src));
  const added = Object.fromEntries(lib.map(l => [l.src, l.added]));
  await addSources(ok, { play: false, silent: true, added });
}
if (S.get('mediaFolders').length) scanFolders();
if (!S.get('onboarded')) showOnboarding();
if (S.get('autoUpdate') && Date.now() - (S.get('lastUpdateCheck') || 0) > 6 * 3600e3) setTimeout(() => checkUpdates(false), 4000);
I18N.onChange(renderUpdateBanner);
api.ready();
})();
