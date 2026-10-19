.pragma library
// What the library shows (v2.x app.js: sortItems, browse, visibleItems, render, renderSide), as plain functions of
// the library and the navigation state, so QML can bind to the result.

var SEP = /[\\/]/;
function norm(p) { return p.replace(/[\\/]+$/, ''); }
function sepOf(p) { return p.indexOf('\\') >= 0 ? '\\' : '/'; }
function under(p, dir) { var a = p.toLowerCase(), b = norm(dir).toLowerCase(); return a.indexOf(b + '\\') === 0 || a.indexOf(b + '/') === 0; }
function baseName(s) { try { return decodeURIComponent(s.split(SEP).pop().split('?')[0]) || s; } catch (e) { return s; } }
function sameDir(a, b) { return norm(a).toLowerCase() === norm(b).toLowerCase(); }
function shortFmt(s) {
  if (!isFinite(s) || !s) return '';
  s = Math.floor(s); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
}
var TITLES = { home: 'Home', videos: 'Videos', music: 'Music', network: 'Network', playlists: 'Playlists', recent: 'Recent' };
function typeOf(view) { return view === 'music' ? 'audio' : 'video'; }

// Array.sort in QML's JavaScript is not stable (v2.x's Chromium is): equal entries keep their order this way
function stableSort(list, cmp) {
  return list.map(function (v, i) { return [v, i]; }).sort(function (a, b) { return cmp(a[0], b[0]) || a[1] - b[1]; }).map(function (p) { return p[0]; });
}

function sortItems(list, sort, desc) {
  var num = function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); };
  var cmp = {
    name: num,
    added: function (a, b) { return b.added - a.added; },
    duration: function (a, b) { return (a.duration || 0) - (b.duration || 0); },
    album: function (a, b) { return (a.album || '￿').localeCompare(b.album || '￿') || num(a, b); }
  }[sort] || function () { return 0; };
  return stableSort(list, desc ? function (a, b) { return cmp(b, a); } : cmp);
}

// the folder browser of Videos / Music: { folders: [{ path, name, items }], files, dir, roots }
function browse(c) {
  var type = typeOf(c.view);
  var pool = c.items.filter(function (i) { return i.type === type && !i.remote; });
  var roots = c.folders.filter(function (f) { return pool.some(function (i) { return under(i.src, f); }); });
  var dir = c.dir[c.view] || null;
  if (dir && !roots.some(function (r) { return sameDir(r, dir) || under(dir, r); })) dir = null;
  if (!dir && roots.length === 1) dir = roots[0];
  var loose = pool.filter(function (i) { return !roots.some(function (r) { return under(i.src, r); }); });
  var entry = function (path) { var items = pool.filter(function (i) { return under(i.src, path); }); return { path: path, name: baseName(norm(path)), items: items }; };
  if (!dir) return { folders: roots.map(entry), files: sortItems(loose, c.sort, c.sortDesc), dir: null, roots: roots };
  var folders = {}, files = [];
  pool.forEach(function (it) {
    if (!under(it.src, dir)) return;
    var rest = it.src.slice(norm(dir).length + 1).split(SEP);
    if (rest.length === 1) files.push(it);
    else folders[norm(dir) + sepOf(dir) + rest[0]] = true;
  });
  return {
    folders: Object.keys(folders).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); }).map(entry),
    files: sortItems(files, c.sort, c.sortDesc).concat(roots.length === 1 && sameDir(dir, roots[0]) ? sortItems(loose, c.sort, c.sortDesc) : []),
    dir: dir, roots: roots
  };
}

function bySrcMap(items) { var m = {}; items.forEach(function (i) { m[i.src] = i; }); return m; }

// the items of the current view (what Ctrl+A selects and what plays next)
function visibleItems(c, b) {
  var v = c.view, all = c.items;
  if (c.query) {
    var pool = v === 'music' ? all.filter(function (i) { return i.type === 'audio'; }) : v === 'videos' ? all.filter(function (i) { return i.type !== 'audio'; }) : all;
    return sortItems(pool.filter(function (i) { return i.name.toLowerCase().indexOf(c.query) >= 0; }), c.sort, c.sortDesc);
  }
  if (v === 'videos' || v === 'music') return (b || browse(c)).files;
  var map = bySrcMap(all);
  if (v === 'recent') return c.recent.map(function (s) { return map[s]; }).filter(Boolean);
  if (v === 'playlists') return c.pl === null ? [] : playlistSrcs(c).map(function (s) { return map[s]; }).filter(Boolean);
  if (v === 'network') return sortItems(all.filter(function (i) { return i.remote; }), c.sort, c.sortDesc);
  return sortItems(all, c.sort, c.sortDesc);
}
// "all" = the built-in playlist with everything in the library
function playlistSrcs(c) {
  if (c.pl === 'all') return sortItems(c.items, c.sort, c.sortDesc).map(function (i) { return i.src; });
  var p = c.playlists[c.pl]; return p ? p.srcs : [];
}
function playlistName(c, k, allName) { return k === 'all' ? allName : (c.playlists[k] || {}).name || ''; }

// Everything one page shows. c: { items, playlists, recent, watched, positions, folders, view, dir, query, sort,
// sortDesc, pl, tr (translations), musicLabel }. Returns { title, crumbs: [{ label, nav }], cards: [entry], count,
// empty: { title, text } or null, side: { title, rows: [entry] } } where entry.kind is "section", "item", "folder",
// "playlist" or "action".
function page(c) {
  var v = c.view, tr = c.tr;
  var title = v === 'music' && c.musicLabel ? tr('Audio') : tr(TITLES[v]);
  var out = { title: title, crumbs: [], cards: [], count: 0, empty: null, list: [], reorder: false };
  out.crumbs.push({ label: title, nav: v === 'playlists' ? { pl: null } : { dir: v } });
  var b = null;
  if ((v === 'videos' || v === 'music') && !c.query) {
    b = browse(c);
    if (b.dir) {
      var root = b.roots.filter(function (r) { return sameDir(b.dir, r) || under(b.dir, r); })[0];
      var rel = b.dir.slice(norm(root).length).split(SEP).filter(Boolean);
      if (b.roots.length > 1) out.crumbs.push({ label: baseName(norm(root)), nav: { dir: v, path: root } });
      rel.forEach(function (seg, i) { out.crumbs.push({ label: seg, nav: { dir: v, path: norm(root) + sepOf(root) + rel.slice(0, i + 1).join(sepOf(root)) } }); });
    }
  }
  if (v === 'playlists' && c.pl !== null) out.crumbs.push({ label: playlistName(c, c.pl, tr('All media')), nav: null });
  if (c.query) out.crumbs.push({ label: tr('Search: "{q}"').replace('{q}', c.query), nav: null });

  var item = function (it) { return { kind: 'item', it: it }; };
  if (v === 'home' && !c.query) {
    var cont = c.items.filter(function (i) { return c.positions[i.src] && !c.watched[i.src]; }).slice(0, 10);
    var added = stableSort(sortItems(c.items, c.sort, c.sortDesc), function (a, b) { return b.added - a.added; }).slice(0, 15);
    if (cont.length) out.cards = out.cards.concat([{ kind: 'section', title: tr('Continue watching') }], cont.map(item));
    if (added.length) out.cards = out.cards.concat([{ kind: 'section', title: tr('Recently added') }], added.map(item));
    out.count = c.items.length;
  } else if (v === 'playlists' && c.pl === null && !c.query) {
    out.cards.push({ kind: 'playlist', key: 'all', name: tr('All media'), count: c.items.length, cover: '', all: true });
    c.playlists.forEach(function (p, i) { out.cards.push({ kind: 'playlist', key: i, name: p.name, count: p.srcs.length, cover: p.cover || '' }); });
    out.cards.push({ kind: 'action', act: 'newpl', icon: 'plus', name: tr('Create playlist') });
    out.cards.push({ kind: 'action', act: 'importpl', icon: 'download', name: tr('Import playlist…') });
    out.count = c.playlists.length;
  } else {
    var list = visibleItems(c, b);
    out.list = list;
    if (b && !c.query) out.cards = b.folders.map(function (f) { return { kind: 'folder', path: f.path, name: f.name, count: f.items.length, thumb: (f.items.filter(function (i) { return i.thumb; })[0] || {}).thumb || '' }; });
    out.cards = out.cards.concat(list.map(item));
    out.count = list.length + (b && !c.query ? b.folders.length : 0);
    out.reorder = v === 'playlists' && c.pl !== null && c.pl !== 'all' && !c.query;
  }
  if (!out.cards.length) {
    var T = function (a, t) { out.empty = { title: tr(a), text: tr(t) }; };
    if (c.query) T('Nothing found', 'Try a different search term.');
    else if (v === 'playlists') T('Playlist is empty', 'Right-click a video or song and choose "Add to playlist".');
    else if (v === 'network') T('Network streams', 'Open a URL (http/https, including .m3u8 streams).');
    else if (v === 'recent') T('Nothing played yet', 'Recently played media will appear here.');
    else if (v === 'music') T('No music yet', 'Add a media folder or drag audio files here.');
    else T('No media yet', 'Add a media folder, drag files here or open a file.');
  }
  return out;
}

// the library panel on the left (renderSide)
function side(c, pg, queue) {
  var v = c.view, tr = c.tr, rows = [];
  if (queue) return { title: tr('Queue'), count: queue.length, rows: queue.map(function (it) { return { kind: 'item', it: it }; }) };
  if (v === 'playlists') {
    rows.push({ kind: 'action', act: 'newpl', icon: 'plus', name: tr('Create playlist') });
    rows.push({ kind: 'action', act: 'importpl', icon: 'download', name: tr('Import playlist…') });
    rows.push({ kind: 'playlist', key: 'all', name: tr('All media'), icon: 'library' });
    c.playlists.forEach(function (p, i) { rows.push({ kind: 'playlist', key: i, name: p.name, cover: p.cover || '', icon: 'playlist' }); });
    return { title: pg.title, count: c.playlists.length, rows: rows };
  }
  var folders = pg.cards.filter(function (e) { return e.kind === 'folder'; });
  var list = v === 'home' ? visibleItems(c) : pg.list;
  rows = folders.concat(list.map(function (it) { return { kind: 'item', it: it }; }));
  var n = rows.length;
  if (!n) rows = [{ kind: 'action', act: 'files', icon: 'plus', name: tr('Add media') }];
  return { title: pg.title, count: n, rows: rows };
}

// cards → rows of the grid (cols per row; a section takes a whole row), or one row per item in list view
function rows(cards, cols, list) {
  var out = [], row = null;
  cards.forEach(function (e) {
    if (e.kind === 'section') { out.push({ section: e.title }); row = null; return; }
    if (list) { out.push({ cells: [e] }); return; }
    if (!row || row.cells.length >= cols) { row = { cells: [] }; out.push(row); }
    row.cells.push(e);
  });
  return out;
}
