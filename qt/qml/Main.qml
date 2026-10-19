// The main window: title bar, rail, library panel, library (grid / list) or player, and the control bar, as in
// v2.x. Phase 2: the library and browsing (app.js "views & navigation", "library interactions", selection #49,
// playlists #50); the player itself is built out in phase 3.
import QtQuick
import QtQuick.Window
import QtQuick.Controls.Basic as C
import QtQuick.Dialogs
import QtMultimedia
import VLCR
import "Lib.js" as Lib

C.ApplicationWindow {
  id: win
  width: 1600; height: 1000
  visible: true
  color: Theme.bg
  title: current ? current.name : "VLC Redesign"
  flags: Qt.Window | Qt.FramelessWindowHint
  property bool inPlayer: false
  property var current: null           // the item that plays
  property var queueList: null         // what plays next (the view it was started from)
  property bool sideHidden: false
  property bool dragging: false        // an item is being dragged (playlist order)

  // ---------- navigation (app.js state / navigate / goBack / goFwd) ----------
  QtObject {
    id: nav
    property string view: ["home", "videos", "music", "network", "playlists", "recent"].indexOf(Settings.values.startView) >= 0 ? Settings.values.startView : "videos"
    property var dir: ({})               // view → the folder shown in Videos / Music
    property string query: ""
    property string sort: "name"
    property bool sortDesc: false
    readonly property bool list: !!Settings.values.listView
    property var pl: null                // the open playlist: null, "all" or its index
    property string sideMode: "view"     // or "queue"
    property var back: []
    property var fwd: []
  }
  property alias nav: nav
  property alias library: library
  readonly property var ctx: ({ items: library.items, playlists: library.playlists, recent: library.recent, watched: library.watched,
    positions: library.positions, folders: Settings.values.mediaFolders || [], view: nav.view, dir: nav.dir, query: nav.query,
    sort: nav.sort, sortDesc: nav.sortDesc, pl: nav.pl, musicLabel: !!Settings.values.audioLabel, tr: s => qsTranslate("Lib", s) })
  readonly property var pg: Lib.page(ctx)
  readonly property var vis: nav.view === "home" && !nav.query ? Lib.visibleItems(ctx) : pg.list      // what Ctrl+A selects
  readonly property var sideData: Lib.side(ctx, pg, nav.sideMode === "queue" ? queue() : null)

  function itemsLabel(n) { return n === 1 ? qsTr("1 item") : qsTr("%1 items").arg(n); }
  function snapshot() { return { view: nav.view, dir: Object.assign({}, nav.dir), pl: nav.pl }; }
  function navigate(patch, push) {
    if (push !== false) { nav.back = nav.back.concat([snapshot()]); nav.fwd = []; }
    for (const k in patch) nav[k] = patch[k];
    nav.query = ""; browser.search.text = "";
    clearSelection();                   // another view or folder: nothing selected
    inPlayer = false;
  }
  function restore(h) { nav.view = h.view; nav.dir = h.dir; nav.pl = h.pl; clearSelection(); }
  function goBack() {
    if (inPlayer) { inPlayer = false; return; }
    if (!nav.back.length) return;
    const h = nav.back[nav.back.length - 1];
    nav.back = nav.back.slice(0, -1); nav.fwd = nav.fwd.concat([snapshot()]); restore(h);
  }
  function goFwd() {
    if (!nav.fwd.length) return;
    const h = nav.fwd[nav.fwd.length - 1];
    nav.fwd = nav.fwd.slice(0, -1); nav.back = nav.back.concat([snapshot()]); restore(h);
  }
  function openDir(path) { const d = Object.assign({}, nav.dir); d[nav.view] = path; navigate({ dir: d }); }
  function showView(v) { nav.sideMode = "view"; navigate(v === "playlists" ? { view: v, pl: null } : { view: v }); }
  function crumb(c) {
    if (c.pl === null) return navigate({ pl: null });
    const d = Object.assign({}, nav.dir); d[c.dir] = c.path || null; navigate({ dir: d });
  }
  function setQuery(t) { nav.query = t.trim().toLowerCase(); }
  function toggleSort() { nav.sort = nav.sort === "name" ? "added" : "name"; nav.sortDesc = false; osd(nav.sort === "name" ? qsTr("Sort by name") : qsTr("Sort by date added")); }
  function sortBy(k) { if (nav.sort === k) nav.sortDesc = !nav.sortDesc; else { nav.sort = k; nav.sortDesc = false; } }
  function toggleList() { Settings.set("listView", !nav.list); }

  // ---------- playing (the player itself: phase 3) ----------
  function queue() { return queueList || vis; }
  function playItem(it, list) {
    if (!it) return;
    if (list !== undefined) queueList = list;
    current = it; library.playing = it.src; library.hurry(it.src);
    if (Settings.values.rememberRecent) library.addRecent(it.src);
    inPlayer = true;
    player.open(it.src);
  }
  function step(d) {
    const q = queue(); if (!current || !q.length) return;
    const i = q.findIndex(x => x.src === current.src);
    const n = q[(i + d + q.length) % q.length]; if (n) playItem(n);
  }

  // ---------- clicks ----------
  function entryClicked(e, mods) {
    if (e.kind === "folder") return openDir(e.path);
    if (e.kind === "playlist") return navigate({ view: "playlists", pl: e.key });
    if (e.kind === "action") return doAct(e.act);
    if (mods & (Qt.ControlModifier | Qt.ShiftModifier)) return selectClick(e.it, !!(mods & Qt.ShiftModifier));
    clearSelection();
    playItem(e.it, nav.view === "home" ? null : pg.list);
  }
  function sideClicked(e) {
    if (e.kind === "item") return playItem(e.it, nav.sideMode === "view" ? vis : undefined);
    entryClicked(e, 0);
  }

  // ---------- selecting several items (#49): Ctrl+click, Shift+click, Ctrl+A, Esc, Delete ----------
  property var sel: ({})
  property string selAnchor: ""
  readonly property var selectedItems: vis.filter(i => sel[i.src])
  function selectClick(it, range) {
    const s = Object.assign({}, sel);
    const a = vis.findIndex(i => i.src === selAnchor), b = vis.findIndex(i => i.src === it.src);
    if (range && a >= 0 && b >= 0) { for (let k = Math.min(a, b); k <= Math.max(a, b); k++) s[vis[k].src] = true; }
    else { if (s[it.src]) delete s[it.src]; else s[it.src] = true; selAnchor = it.src; }
    sel = s;
  }
  function selectAll() { const s = Object.assign({}, sel); vis.forEach(i => s[i.src] = true); sel = s; }
  function clearSelection() { if (Object.keys(sel).length) sel = ({}); selAnchor = ""; }
  readonly property bool inOwnPlaylist: nav.view === "playlists" && nav.pl !== null && nav.pl !== "all"
  function selActions(list) {
    const n = list.length, allWatched = list.every(i => library.watched[i.src]), srcs = list.map(i => i.src);
    return [
      { label: qsTr("Play"), icon: "play", accent: true, action: () => { clearSelection(); playItem(list[0], list); } },
      { label: qsTr("Add %1 items to a playlist…").arg(n), icon: "playlist", action: () => addToPlaylist(srcs) },
      { label: allWatched ? qsTr("Mark as unwatched") : qsTr("Mark as watched"), icon: "eye", action: () => library.setWatched(srcs, !allWatched) },
      { sep: true },
      inOwnPlaylist
        ? { label: qsTr("Remove %1 items from playlist").arg(n), icon: "trash", danger: true, action: () => { library.removeFromPlaylist(nav.pl, srcs); clearSelection(); } }
        : { label: qsTr("Remove %1 items from library").arg(n), icon: "trash", danger: true, action: () => removeItems(srcs) }
    ];
  }
  function removeItems(srcs) {
    if (current && srcs.indexOf(current.src) >= 0) { player.stop(); current = null; library.playing = ""; inPlayer = false; }
    library.remove(srcs);
    const s = Object.assign({}, sel); srcs.forEach(x => delete s[x]); sel = s;
  }
  function moveItem(src, target, after) { if (inOwnPlaylist) library.movePlaylistItem(nav.pl, src, target, after); }

  // ---------- menus ----------
  function menu(items, x, y) {
    const m = Qt.createComponent("controls/ContextMenu.qml").createObject(C.Overlay.overlay, { items: items });
    m.open(); m.placeAt(x, y);
    return m;
  }
  function openMediaItems() {
    return [
      { label: qsTr("Open files…"), icon: "file", kbd: "Ctrl + O", action: () => doAct("files") },
      { label: qsTr("Open folder…"), icon: "folder", kbd: "Ctrl + F", action: () => doAct("folder") },
      { label: qsTr("Add media folder…"), icon: "library", action: () => doAct("addfolder") },
      { label: qsTr("Open network stream…"), icon: "network", kbd: "Ctrl + N", action: () => doAct("url") }
    ];
  }
  function moreMenu(x, y) {
    menu([
      { label: qsTr("Grid / list"), icon: "queue", action: toggleList },
      { label: nav.sort === "name" ? qsTr("Sort by date") : qsTr("Sort by name"), icon: "speed", action: toggleSort },
      nav.view === "playlists" && nav.pl !== null ? { label: qsTr("Export playlist…"), icon: "download", action: () => exportPlaylist(nav.pl) } : null,
      { sep: true }
    ].concat(openMediaItems(), [{ sep: true }, { label: qsTr("Manage media folders…"), icon: "library", action: () => openSettings("library") }]), x, y);
  }
  function sideMenu(x, y) {
    menu([
      { label: nav.sideMode === "queue" ? qsTr("Show library") : qsTr("Show queue"), icon: "queue", kbd: "Q", action: toggleQueue },
      { label: qsTr("Sidebar with labels"), icon: "pointer", checked: !!Settings.values.navExpanded, action: () => Settings.set("navExpanded", !Settings.values.navExpanded) },
      { label: qsTr("Hide sidebar"), icon: "hide", action: () => sideHidden = true }
    ], x, y);
  }
  function toggleQueue() {
    if (Settings.values.navExpanded) Settings.set("navExpanded", false);
    if (nav.sideMode === "queue" && !sideHidden) { nav.sideMode = "view"; sideHidden = true; }
    else { nav.sideMode = "queue"; sideHidden = false; }
  }
  function entryMenu(e, x, y, isCard) {
    if (e.kind === "item") {
      const it = e.it;
      if (isCard && selectedItems.length > 1 && sel[it.src])
        return menu([{ header: qsTr("%1 selected").arg(selectedItems.length) }].concat(selActions(selectedItems)), x, y);
      const p = inOwnPlaylist ? library.playlists[nav.pl] : null, i = p ? p.srcs.indexOf(it.src) : -1;
      return menu([
        { label: qsTr("Play"), icon: "play", accent: true, action: () => playItem(it) },
        { label: qsTr("Add to playlist…"), icon: "playlist", action: () => addToPlaylist([it.src]) },
        { label: library.watched[it.src] ? qsTr("Mark as unwatched") : qsTr("Mark as watched"), icon: "eye", action: () => library.setWatched([it.src], !library.watched[it.src]) },
        !it.remote ? { label: qsTr("Show in folder"), icon: "folder", action: () => library.reveal(it.src) } : null,
        { label: qsTr("Media information"), icon: "info", action: () => dialog("dialogs/MediaInfo.qml", { it: library.item(it.src) }) },
        isCard ? { label: sel[it.src] ? qsTr("Deselect") : qsTr("Select"), icon: "check", kbd: "Ctrl + click", action: () => selectClick(it, false) } : null
      ].concat(p ? [{ sep: true },
        { label: qsTr("Move up"), disabled: i <= 0, action: () => library.movePlaylistItem(nav.pl, it.src, p.srcs[i - 1], false) },
        { label: qsTr("Move down"), disabled: i < 0 || i >= p.srcs.length - 1, action: () => library.movePlaylistItem(nav.pl, it.src, p.srcs[i + 1], true) }] : [],
      [{ sep: true }, p
        ? { label: qsTr("Remove from playlist"), icon: "trash", danger: true, action: () => library.removeFromPlaylist(nav.pl, [it.src]) }
        : { label: qsTr("Remove from library"), icon: "trash", danger: true, action: () => removeItems([it.src]) }]), x, y);
    }
    if (e.kind === "playlist") {
      const k = e.key, all = k === "all";
      const srcs = () => all ? Lib.sortItems(library.items, nav.sort, nav.sortDesc).map(i => i.src) : library.playlists[k].srcs;
      return menu([
        { label: qsTr("Play"), icon: "play", accent: true, action: () => { const l = srcs().map(s => library.item(s)).filter(i => i.src); if (l.length) playItem(l[0], l); else osd(qsTr("Playlist is empty")); } },
        { label: qsTr("Export playlist…"), icon: "download", action: () => exportPlaylist(k) }
      ].concat(all ? [] : [
        { label: qsTr("Rename…"), icon: "general", action: () => dialog("dialogs/Ask.qml", { title: "Rename", mode: "prompt", value: library.playlists[k].name }, v => { if (v && v.trim()) library.renamePlaylist(k, v.trim()); }) },
        { label: qsTr("Choose cover…"), icon: "camera", action: () => { coverDlg.target = k; coverDlg.open(); } },
        { sep: true },
        { label: qsTr("Delete"), icon: "trash", danger: true, action: () => dialog("dialogs/Ask.qml", { title: "Delete playlist?", text: library.playlists[k].name, okLabel: "Delete" }, v => {
            if (!v) return; if (nav.pl === k) nav.pl = null; else if (typeof nav.pl === "number" && nav.pl > k) nav.pl--; library.deletePlaylist(k); }) }
      ]), x, y);
    }
    if (e.kind === "folder") {
      const path = e.path;
      return menu([
        { label: qsTr("Open"), icon: "folder", action: () => openDir(path) },
        { label: qsTr("Play all"), icon: "play", accent: true, action: () => { const l = Lib.sortItems(library.items.filter(i => Lib.under(i.src, path) && i.type === Lib.typeOf(nav.view)), nav.sort, nav.sortDesc); if (l.length) playItem(l[0], l); } },
        { label: qsTr("Show in folder"), icon: "open", action: () => library.openPath(path) }
      ], x, y);
    }
  }

  // ---------- adding media, playlists, dialogs ----------
  function dialog(file, props, cb) {
    const d = Qt.createComponent(file).createObject(C.Overlay.overlay, props || {});
    if (!d) { console.warn(file, Qt.createComponent(file).errorString()); return null; }
    d.finished.connect(v => { if (cb) cb(v); });
    dialogs++;
    d.closed.connect(() => { dialogs--; d.destroy(); });
    d.open();
    return d;
  }
  function addSources(srcs, play, keepLists) {
    const added = library.addSources(srcs, true, !!keepLists);
    if (play !== false && added.length) playItem(library.item(added[0]), added.length > 1 ? added.map(s => library.item(s)) : undefined);
    else if (added.length && play === false) osd(qsTr("%1 item(s) added").arg(added.length));
    return added;
  }
  function doAct(a) {
    if (a === "files") filesDlg.open();
    else if (a === "folder") folderDlg.open();
    else if (a === "addfolder") mediaFolderDlg.open();
    else if (a === "url") dialog("dialogs/Network.qml", {}, r => {
      if (!r) return;
      const list = r.urls.split(/\s+/).map(s => s.trim()).filter(u => /^(https?|rtsp|rtmp|mms):\/\//i.test(u));
      if (!list.length) return osd(qsTr("No valid URL entered"));
      Settings.set("networkHistory", list.concat((Settings.values.networkHistory || []).filter(u => list.indexOf(u) < 0)).slice(0, 30));
      if (r.name.trim()) library.createPlaylist(r.name.trim(), list, "");
      addSources(list);
    });
    else if (a === "newpl") newPlaylist();
    else if (a === "importpl") importDlg.open();
  }
  function newPlaylist(then) {
    dialog("dialogs/NewPlaylist.qml", { library: library }, r => {
      if (!r) return;
      const i = library.createPlaylist(r.name, r.files, r.cover);
      if (then) then(i); else navigate({ view: "playlists", pl: i });
    });
  }
  function addToPlaylist(srcs) {
    if (!library.playlists.length) return newPlaylist(i => library.addToPlaylist(i, srcs));
    dialog("dialogs/Ask.qml", { title: "Add to playlist", mode: "choose", options: library.playlists.map(p => p.name), okLabel: "Add" }, i => {
      if (i !== null && i !== undefined) library.addToPlaylist(i, srcs);
    });
  }
  function exportPlaylist(k) {
    const srcs = k === "all" ? Lib.sortItems(library.items, nav.sort, nav.sortDesc).map(i => i.src) : library.playlists[k].srcs;
    if (!srcs.length) return osd(qsTr("Playlist is empty"));
    exportDlg.srcs = srcs; exportDlg.name = k === "all" ? qsTr("All media") : library.playlists[k].name;
    exportDlg.selectedFile = "file:///" + exportDlg.name.replace(/[\\/:*?"<>|]/g, "_") + ".xspf";
    exportDlg.open();
  }
  function addFolder(f) {
    const list = Settings.values.mediaFolders || [];
    if (list.indexOf(f) < 0) Settings.set("mediaFolders", list.concat([f]));
    osd(qsTr("Media folder added"));
  }
  FileDialog { id: filesDlg; title: qsTr("Open files"); fileMode: FileDialog.OpenFiles; onAccepted: win.addSources(selectedFiles.map(u => library.toLocal(u))) }
  FolderDialog { id: folderDlg; title: qsTr("Open folder"); onAccepted: { win.addSources([library.toLocal(selectedFolder)], false); win.queueList = null; } }
  FolderDialog { id: mediaFolderDlg; title: qsTr("Add media folder"); onAccepted: win.addFolder(library.toLocal(selectedFolder)) }
  FileDialog { id: importDlg; title: qsTr("Import playlist…"); fileMode: FileDialog.OpenFiles; nameFilters: [qsTr("Playlists") + " (*.m3u *.m3u8 *.xspf *.pls)"]
    onAccepted: { const before = library.playlists.length; win.addSources(selectedFiles.map(u => library.toLocal(u)), false, true);
                  if (library.playlists.length > before) win.navigate({ view: "playlists", pl: before }); } }
  FileDialog { id: exportDlg; property var srcs: []; property string name: ""; title: qsTr("Export playlist…"); fileMode: FileDialog.SaveFile
    nameFilters: ["XSPF (*.xspf)", "M3U8 (*.m3u8)"]; onAccepted: if (library.exportPlaylist(name, srcs, selectedFile)) win.osd(qsTr("Playlist exported")) }
  FileDialog { id: coverDlg; property var target: -1; title: qsTr("Cover image"); nameFilters: [qsTr("Images") + " (*.png *.jpg *.jpeg *.webp)"]
    onAccepted: library.setPlaylistCover(target, library.readImage(selectedFile)) }

  function toggleMax() { win.visibility === Window.Maximized ? win.showNormal() : win.showMaximized(); }
  function openSettings(page) { const w = Qt.createComponent("pages/SettingsWindow.qml").createObject(C.Overlay.overlay, { current: page || "interface" }); dialogs++; w.closed.connect(() => { dialogs--; w.destroy(); }); w.open(); }
  property int dialogs: 0              // open dialogs (the library keys wait)
  function osd(text) { osdText.text = text; osdBox.opacity = 1; osdTimer.restart(); }

  Library {
    id: library
    thumbs: Settings.values.thumbs !== false
    remember: Settings.values.rememberRecent !== false
    onMessage: t => win.osd(t)
  }
  Connections { target: Settings; function onChanged(p) { if (p === "mediaFolders") { library.scanFolders(Settings.values.mediaFolders || []); } } }
  VlcPlayer { id: player; videoSink: video.videoSink }
  WindowFrame { id: frame; maximizeButton: maxBtn }
  Component.onCompleted: {
    if (startFolder) Settings.set("mediaFolders", [startFolder]);
    library.load();
    library.scanFolders(Settings.values.mediaFolders || []);
    if (autoPlay) addSources([autoPlay]);
    // testing: VLCR_OPEN=<step>;<step>… with view:<name>, dir:<n>, list, grid, select:<n>, pl:<n>, expanded,
    // dialog:<newpl|network|info|choose>, menu:<item|folder|playlist|more>, settings:<page>
    if (openAtStart) Qt.callLater(() => testSteps(openAtStart.split(";")), 0);
  }
  function testSteps(steps) {
    let delay = 600;   // the library is read first
    steps.forEach(s => { const k = s.split(":")[0], v = s.slice(k.length + 1); delay += 500; timerAt(delay, () => testStep(k, v)); });
  }
  function timerAt(ms, fn) { const t = Qt.createQmlObject("import QtQuick; Timer {}", win); t.interval = ms; t.triggered.connect(() => { fn(); t.destroy(); }); t.start(); }
  function testStep(k, v) {
    if (k === "view") showView(v);
    else if (k === "dir") { const f = pg.cards.filter(e => e.kind === "folder")[+v || 0]; if (f) openDir(f.path); }
    else if (k === "list") Settings.set("listView", true);
    else if (k === "grid") Settings.set("listView", false);
    else if (k === "select") { for (let i = 0; i < +v; i++) selectClick(vis[i], false); }
    else if (k === "pl") navigate({ view: "playlists", pl: v === "all" ? "all" : +v });
    else if (k === "expanded") Settings.set("navExpanded", !!+v || v === "");
    else if (k === "pladd") library.addToPlaylist(0, vis.slice(0, +v).map(i => i.src));
    else if (k === "plmove") { const p = library.playlists[0].srcs; library.movePlaylistItem(0, p[0], p[p.length - 1], true); }
    else if (k === "watched") library.setWatched([vis[0].src], true);
    else if (k === "query") { browser.search.text = v; setQuery(v); }
    else if (k === "settings") openSettings(v);
    else if (k === "dialog") {
      if (v === "newpl") dialog("dialogs/NewPlaylist.qml", { library: library, files: vis.slice(0, 3).map(i => i.src) });
      else if (v === "network") dialog("dialogs/Network.qml", {});
      else if (v === "info") dialog("dialogs/MediaInfo.qml", { it: library.item(vis[0].src) });
      else if (v === "choose") addToPlaylist([vis[0].src]);
    } else if (k === "menu") {
      if (v === "more") moreMenu(win.width - 300, 92);
      else if (v === "player") menu(playerMenu(), 760, 260);
      else { const e = v === "item" ? { kind: "item", it: vis[0] } : pg.cards.filter(c => c.kind === v)[0]; if (e) entryMenu(e, 700, 300, true); }
    }
  }

  // ---------- title bar (36px) ----------
  Rectangle {
    id: titlebar
    anchors { left: parent.left; right: parent.right; top: parent.top }
    height: 36; color: Theme.bg
    Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: Theme.edge }
    MouseArea { anchors.fill: parent; onPressed: win.startSystemMove(); onDoubleClicked: win.toggleMax() }
    Row {
      anchors { left: parent.left; leftMargin: 10; verticalCenter: parent.verticalCenter }
      spacing: 4
      Image {   // the cone
        width: 18; height: 18; anchors.verticalCenter: parent.verticalCenter; sourceSize: Qt.size(36, 36)
        source: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.6 2h4.8l1.2 4H8.4z" fill="' + Theme.accent + '"/><path d="M8.1 7h7.8l1.1 4H7z" fill="#ddd"/><path d="M6.7 12h10.6l1.2 4.5H5.5z" fill="' + Theme.accent + '"/><path d="M3 18h18l1 3H2z" fill="' + Theme.accent + '"/></svg>')
      }
      IconButton { html: "menuBtn"; width: 28; height: 28; tip: qsTr("Menu") }
      Rectangle { width: 1; height: 16; color: Theme.line; anchors.verticalCenter: parent.verticalCenter }
      IconButton { html: "sideToggle"; width: 28; height: 28; tip: qsTr("Sidebar (Q)")
                   onClicked: { if (Settings.values.navExpanded) Settings.set("navExpanded", false); else win.sideHidden = !win.sideHidden; } }
      Row {
        spacing: 6; anchors.verticalCenter: parent.verticalCenter; leftPadding: 4
        Icon { html: "crumbs"; color: Theme.muted; anchors.verticalCenter: parent.verticalCenter }
        T { text: win.pg.title; color: Theme.muted; anchors.verticalCenter: parent.verticalCenter }
      }
    }
    T { anchors.centerIn: parent; text: win.title; color: Theme.text2; width: Math.min(implicitWidth, parent.width * 0.4) }
    Row {
      anchors { right: parent.right; top: parent.top; bottom: parent.bottom }
      Repeater {
        model: ["minBtn", "maxBtn", "fsBtn2", "closeBtn"]
        Rectangle {
          id: wbtn
          required property string modelData
          readonly property bool hot: a.containsMouse || (modelData === "maxBtn" && frame.maximizeHovered)
          width: 44; height: 36
          color: hot ? (modelData === "closeBtn" ? "#c42b1c" : Theme.panel2) : "transparent"
          Component.onCompleted: if (modelData === "maxBtn") maxBtn = wbtn
          Icon { anchors.centerIn: parent; html: modelData; color: parent.hot ? (modelData === "closeBtn" ? "#fff" : Theme.text) : Theme.muted }
          MouseArea { id: a; anchors.fill: parent; hoverEnabled: true
            onClicked: modelData === "minBtn" ? win.showMinimized() : modelData === "maxBtn" ? win.toggleMax()
                     : modelData === "fsBtn2" ? (win.visibility === Window.FullScreen ? win.showNormal() : win.showFullScreen()) : Qt.quit() }
        }
      }
    }
  }
  property Item maxBtn: null

  // ---------- body ----------
  Item {
    id: body
    anchors { left: parent.left; right: parent.right; top: titlebar.bottom; bottom: controls.top }

    Rail {
      id: rail
      ctl: win
      visible: !win.inPlayer
      anchors { left: parent.left; top: parent.top; bottom: parent.bottom; topMargin: expanded ? 6 : 0; bottomMargin: expanded ? 6 : 0 }
    }
    SidePanel {
      id: side
      ctl: win
      width: win.inPlayer || win.sideHidden || Settings.values.navExpanded ? 0 : 250
      Behavior on width { NumberAnimation { duration: 200 } }
      visible: width > 0
      anchors { left: rail.visible ? rail.right : parent.left; top: parent.top; bottom: parent.bottom }
    }

    Rectangle {   // main area: library or player
      id: main
      anchors { left: side.visible ? side.right : rail.visible ? rail.right : parent.left; right: parent.right; top: parent.top; bottom: parent.bottom }
      color: Theme.panel

      Browser { id: browser; ctl: win; anchors.fill: parent; visible: !win.inPlayer }

      Rectangle {   // player
        anchors.fill: parent
        visible: win.inPlayer
        color: "#000"
        VideoOutput { id: video; anchors.fill: parent; fillMode: VideoOutput.PreserveAspectFit }
        MouseArea { anchors.fill: parent; acceptedButtons: Qt.LeftButton | Qt.RightButton
          onClicked: m => { if (m.button === Qt.RightButton) { const p = mapToItem(null, m.x, m.y); win.menu(win.playerMenu(), p.x, p.y); } else player.togglePause(); }
          onDoubleClicked: win.visibility === Window.FullScreen ? win.showNormal() : win.showFullScreen() }
        T { anchors.centerIn: parent; visible: player.error !== ""; text: player.error; color: "#fff" }
      }

      Rectangle {   // #osd
        id: osdBox
        anchors.horizontalCenter: parent.horizontalCenter; y: 16
        width: osdText.implicitWidth + 28; height: osdText.implicitHeight + 12; radius: 20; color: "#cc000000"
        opacity: 0; visible: opacity > 0; z: 6
        Behavior on opacity { NumberAnimation { duration: 250 } }
        T { id: osdText; anchors.centerIn: parent; color: "#ffffff" }
        Timer { id: osdTimer; interval: 1500; onTriggered: osdBox.opacity = 0 }
      }
    }
  }

  function playerMenu() {
    return [
      { label: player.playing ? qsTr("Pause") : qsTr("Play"), icon: player.playing ? "pause" : "play", accent: true, kbd: "Space", action: () => player.togglePause() },
      { label: qsTr("Stop"), icon: "stop", accent: true, kbd: "S", action: () => { player.stop(); win.inPlayer = false; } },
      { sep: true },
      { label: qsTr("Playback"), icon: "playback", sub: [{ header: "Speed" }, { label: "0.5×" }, { label: "1×", checked: true }, { label: "1.5×" }, { label: "2×" }] },
      { label: qsTr("Video"), icon: "video", sub: [{ label: "Fullscreen", icon: "fullscreen", kbd: "F" }, { label: "Snapshot", icon: "camera", kbd: "Shift + S" }] },
      { sep: true },
      { label: qsTr("Add to playlist…"), icon: "playlist", action: () => { if (win.current) win.addToPlaylist([win.current.src]); } },
      { label: qsTr("Settings"), icon: "general", action: () => win.openSettings("interface") }
    ];
  }

  // ---------- control bar (52px) ----------
  Rectangle {
    id: controls
    anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
    height: 52; color: Theme.bg
    Rectangle { anchors { left: parent.left; right: parent.right; top: parent.top } height: 1; color: Theme.edge }
    Row {
      id: leftCtl
      anchors { left: parent.left; leftMargin: 10; verticalCenter: parent.verticalCenter }
      spacing: 6
      IconButton { html: "prevBtn"; visible: Settings.values.ctl.prevnext; tip: qsTr("Previous (P)"); onClicked: win.step(-1) }
      Rectangle {   // #playBtn: 46×26, accent, rounded 5
        visible: Settings.values.ctl.play
        width: 46; height: 26; radius: 5; anchors.verticalCenter: parent.verticalCenter
        color: pa.containsMouse ? Theme.accent2 : Theme.accent
        Icon { anchors.centerIn: parent; width: 16; height: 16; name: player.playing ? "pause" : "play"; filled: !player.playing; strokeWidth: 2.2; color: Theme.accentText }
        MouseArea { id: pa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: player.togglePause() }
      }
      IconButton { html: "nextBtn"; visible: Settings.values.ctl.prevnext; tip: qsTr("Next (N)"); onClicked: win.step(1) }
      T { visible: Settings.values.ctl.time; width: 70; horizontalAlignment: Text.AlignHCenter; text: win.fmt(player.time); color: Theme.muted; px: 12; font.features: { "tnum": 1 }; anchors.verticalCenter: parent.verticalCenter }
    }
    Row {
      id: rightCtl
      anchors { right: parent.right; rightMargin: 10; verticalCenter: parent.verticalCenter }
      spacing: 6
      T { visible: Settings.values.ctl.time; width: 70; horizontalAlignment: Text.AlignHCenter; text: win.fmt(player.length); color: Theme.muted; px: 12; font.features: { "tnum": 1 }; anchors.verticalCenter: parent.verticalCenter }
      IconButton { html: "muteBtn"; visible: Settings.values.ctl.volume }
      Rectangle {   // #vol: 90×18, gradient fill
        visible: Settings.values.ctl.volume
        width: 90; height: 18; radius: 4; color: Theme.track; anchors.verticalCenter: parent.verticalCenter; clip: true
        Rectangle { width: parent.width * Math.min(1, player.volume / 125); height: parent.height; radius: 4
          gradient: Gradient { orientation: Gradient.Horizontal; GradientStop { position: 0; color: Theme.vol1 } GradientStop { position: 1; color: Theme.vol2 } } }
        MouseArea { anchors.fill: parent; onPressed: m => player.volume = Math.round(m.x / width * 125); onPositionChanged: m => player.volume = Math.round(Math.max(0, m.x) / width * 125) }
      }
      Rectangle { width: 1; height: 18; color: Theme.line; anchors.verticalCenter: parent.verticalCenter }
      IconButton { html: "eqBtn"; visible: Settings.values.ctl.audio }
      IconButton { html: "subBtn"; visible: Settings.values.ctl.subs }
      IconButton { html: "setBtn"; visible: Settings.values.ctl.settings; onClicked: win.openSettings("interface") }
      IconButton { html: "listBtn"; visible: Settings.values.ctl.library; tip: qsTr("Library / player (L)"); onClicked: win.inPlayer = !win.inPlayer && !!win.current }
    }
    Item {   // #seek: 18px track, accent-dark fill, 6×20 accent handle
      anchors { left: leftCtl.right; right: rightCtl.left; leftMargin: 6; rightMargin: 6; verticalCenter: parent.verticalCenter }
      height: 22
      Rectangle {
        anchors.verticalCenter: parent.verticalCenter; width: parent.width; height: 18; radius: 4; color: Theme.track
        readonly property real p: player.length > 0 ? player.time / player.length : 0
        Rectangle { width: parent.width * parent.p; height: parent.height; radius: 4; color: Theme.accentDark }
        Rectangle { x: parent.width * parent.p - 3; y: -1; width: 6; height: 20; radius: 3; color: Theme.accent }
      }
      MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onPressed: m => player.seek(m.x / width * player.length) }
    }
  }
  function fmt(ms) { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
                     return [h, m, x].map(n => String(n).padStart(2, '0')).join(':'); }

  // drop files and folders anywhere to add them (#drop)
  DropArea {
    id: dropArea
    anchors.fill: parent
    keys: ["text/uri-list"]
    onDropped: d => { if (d.hasUrls) { win.addSources(d.urls.map(u => library.toLocal(u)), true); d.accept(Qt.CopyAction); } }
  }
  Rectangle {
    anchors.fill: parent; visible: dropArea.containsDrag; z: 50
    color: Theme.accentSoft; border.width: 3; border.color: Theme.accent
    T { anchors.centerIn: parent; text: qsTr("Drop to add"); px: 20; color: Theme.text }
  }

  // window edges: resize like a normal window (the frame is our own)
  Repeater {
    model: [[Qt.LeftEdge, 0, 0, 5, -1], [Qt.RightEdge, -5, 0, 5, -1], [Qt.BottomEdge, 0, -5, -1, 5], [Qt.TopEdge, 0, 0, -1, 4]]
    MouseArea {
      required property var modelData
      x: modelData[1] < 0 ? win.width + modelData[1] : modelData[1]; y: modelData[2] < 0 ? win.height + modelData[2] : modelData[2]
      width: modelData[3] < 0 ? win.width : modelData[3]; height: modelData[4] < 0 ? win.height : modelData[4]
      cursorShape: modelData[0] === Qt.LeftEdge || modelData[0] === Qt.RightEdge ? Qt.SizeHorCursor : Qt.SizeVerCursor
      onPressed: win.startSystemResize(modelData[0])
    }
  }

  // keys of the library (v2.x: Ctrl+A, Esc, Delete only while browsing and no dialog is open)
  readonly property bool browsing: !inPlayer && dialogs === 0
  Shortcut { sequence: "Ctrl+A"; enabled: win.browsing && !browser.search.input.activeFocus; onActivated: win.selectAll() }
  Shortcut { sequence: "Delete"; enabled: win.browsing && win.selectedItems.length > 0 && !browser.search.input.activeFocus
             onActivated: { const a = win.selActions(win.selectedItems); a[a.length - 1].action(); } }
  Shortcut { sequence: "Ctrl+O"; onActivated: win.doAct("files") }
  Shortcut { sequence: "Ctrl+F"; onActivated: win.doAct("folder") }
  Shortcut { sequence: "Ctrl+N"; onActivated: win.doAct("url") }
  Shortcut { sequence: "Space"; enabled: !browser.search.input.activeFocus; onActivated: player.togglePause() }
  Shortcut { sequence: "Esc"
    onActivated: { if (win.browsing && win.selectedItems.length) win.clearSelection(); else if (win.visibility === Window.FullScreen) win.showNormal(); else win.inPlayer = false; } }

  // testing: frames drawn while a video plays, then a screenshot (VLCR_SHOT)
  property int swaps: 0
  property int f0: 0
  onFrameSwapped: swaps++
  Timer { running: shotPath !== "" && autoPlay !== ""; interval: 4000; onTriggered: { win.swaps = 0; win.f0 = player.framesShown; } }
  Timer { running: shotPath !== "" && autoPlay !== ""; interval: 7000
          onTriggered: player.log("decoded " + ((player.framesShown - win.f0) / 3).toFixed(1) + " fps, drawn " + (win.swaps / 3).toFixed(1) + " fps") }
  Timer { running: shotPath !== ""; interval: shotMs
          onTriggered: { player.log("hit test over the maximise button: " + (maxBtn ? frame.hitTestAt(Math.round((maxBtn.mapToItem(null, 22, 18).x) * Screen.devicePixelRatio), Math.round(18 * Screen.devicePixelRatio)) : -1));
                         player.log("items " + library.items.length + ", busy " + library.busy + ", view " + nav.view + ", cards " + pg.cards.length);
                         frame.grab(shotPath); Qt.quit(); } }
}
