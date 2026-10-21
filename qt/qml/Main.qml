// The main window: title bar, rail, library panel, library (grid / list) or player, and the control bar, as in
// v2.x. The library and browsing (app.js "views & navigation", "library interactions", selection #49, playlists #50)
// are here; the player is in player/ (PlayerView, ControlBar, SeekBar, MiniPlayer, PipWindow) and Playback.qml.
import QtQuick
import QtQuick.Window
import QtQuick.Controls.Basic as C
import QtQuick.Dialogs
import VLCR
import "Lib.js" as Lib

C.ApplicationWindow {
  id: win
  width: 1600; height: 1000
  visible: true
  color: Theme.bg
  title: current ? current.name : "Vela Player"
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
    sort: nav.sort, sortDesc: nav.sortDesc, pl: nav.pl, musicLabel: !!Settings.values.audioLabel, tr: s => qsTranslate("Lib", s), lang: I18n.language })
  readonly property var pg: Lib.page(ctx)
  readonly property var vis: nav.view === "home" && !nav.query ? Lib.visibleItems(ctx) : pg.list      // what Ctrl+A selects
  readonly property var sideData: Lib.side(ctx, pg, nav.sideMode === "queue" ? pb.queue() : null)

  function itemsLabel(n) { return n === 1 ? qsTr("1 item") : qsTr("%1 items").arg(n); }
  function snapshot() { return { view: nav.view, dir: Object.assign({}, nav.dir), pl: nav.pl }; }
  function navigate(patch, push) {
    if (push !== false) { nav.back = nav.back.concat([snapshot()]); nav.fwd = []; }
    for (const k in patch) nav[k] = patch[k];
    nav.query = ""; browser.search.text = "";
    clearSelection();                   // another view or folder: nothing selected
    showBrowser();
  }
  function restore(h) { nav.view = h.view; nav.dir = h.dir; nav.pl = h.pl; clearSelection(); }
  function goBack() {
    if (inPlayer) { showBrowser(); return; }
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

  // ---------- playing (Playback.qml) ----------
  function playItem(it, list) { pb.playItem(it, list); }

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
    if (current && srcs.indexOf(current.src) >= 0) pb.stop();
    library.remove(srcs);
    const s = Object.assign({}, sel); srcs.forEach(x => delete s[x]); sel = s;
  }
  function moveItem(src, target, after) { if (inOwnPlaylist) library.movePlaylistItem(nav.pl, src, target, after); }

  // ---------- menus ----------
  function menu(items, x, y) {
    const m = Qt.createComponent("controls/ContextMenu.qml").createObject(C.Overlay.overlay, { items: items });
    dialogs++; m.closed.connect(() => dialogs--);
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
        en.ext(it.src) && !pb.dvdRe.test(it.src) && !en.midiRe.test(it.src) ? { label: qsTr("Always play .%1 files with FFmpeg").arg(en.ext(it.src)), checked: en.byFfmpeg(it.src),
                                                     action: () => en.setByFfmpeg(en.ext(it.src), !en.byFfmpeg(it.src)) } : null,
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
      if (r.extra) { const x = Object.assign({}, en.extra); list.forEach(u => x[u] = r.extra); en.extra = x; }
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
  property var settingsWin: null
  property bool devPages: openAtStart.indexOf("components") >= 0   // the design system page (testing)
  function openSettings(page) {
    if (settingsWin) settingsWin.close();
    const w = Qt.createComponent("pages/SettingsWindow.qml").createObject(C.Overlay.overlay, { current: page || "general", ctl: win });
    settingsWin = w; dialogs++;
    w.closed.connect(() => { dialogs--; if (settingsWin === w) settingsWin = null; w.destroy(); });
    w.open();
  }
  function closeSettings() { if (settingsWin) settingsWin.close(); }
  function confirm(title, text, ok, fn) {
    if (Settings.values.confirmDialogs === false) return fn();
    dialog("dialogs/Ask.qml", { title: title, text: qsTr(text), okLabel: ok }, v => { if (v) fn(); });
  }
  function removeFolder(f) { Settings.set("mediaFolders", (Settings.values.mediaFolders || []).filter(x => x !== f)); nav.dir = ({}); }
  function resetVideoFilters() { const vf = Settings.defaultValue("vf"); Settings.set("vf", vf); }
  function shortcuts() { dialog("dialogs/Shortcuts.qml", { pb: pb }); }
  // Make Vela Player the app that opens videos and music. The system decides how (System.setDefaultPlayer); the
  // installer registers the file types so it is listed there.
  function setDefaultPlayer() { return System.setDefaultPlayer(); }
  property Item onboarding: null
  function showOnboarding() {
    closeSettings(); showBrowser();
    if (onboarding) return;
    onboarding = Qt.createComponent("Onboarding.qml").createObject(win.contentItem, { ctl: win, y: 36, width: win.width, height: win.height - 36, z: 60 });
    onboarding.width = Qt.binding(() => win.width); onboarding.height = Qt.binding(() => win.height - 36);
    dialogs++;
    onboarding.done.connect(() => { dialogs--; onboarding.destroy(); onboarding = null; });
  }
  property int dialogs: 0              // open dialogs and menus (the keys wait)
  // a phone (#53): the views in a bar at the bottom, no library panel, a simpler control bar. compactTest: the same on the
  // desktop (testing)
  readonly property bool compact: (Theme.mobile || !!Settings.values.compactTest) && width < 760
  // a phone (#53): the status and navigation bars lie over the app (Android 15+); the bars of the app stay clear of them
  readonly property int safeTop: Theme.mobile && !fsMode ? (System.insets.top || 0) : 0
  readonly property int safeBottom: Theme.mobile && !fsMode ? (System.insets.bottom || 0) : 0
  onWidthChanged: if (Theme.mobile) Qt.callLater(() => System.readInsets(Screen.devicePixelRatio))
  onHeightChanged: if (Theme.mobile) Qt.callLater(() => System.readInsets(Screen.devicePixelRatio))
  Connections { target: System; function onMediaAccessChanged() { if (System.mediaAccess) library.scanFolders(Settings.values.mediaFolders || []); } }
  function osd(text) { osdText.text = text; osdBox.opacity = 1; osdTimer.restart(); }

  // ---------- library / player, fullscreen, the interface (app.js showPlayer / showBrowser / toggleFs) ----------
  property bool sideOverride: false    // the sidebar button brought the rail and panel back while a video plays
  property bool hideUi: false          // Ctrl+\: only the picture
  property bool fsTop: false           // fullscreen: the mouse is near the top / bottom edge
  property bool fsBottom: false
  property bool cursorHidden: false
  // The library never stays in fullscreen (#31: on Windows the taskbar can cover it); going back to the player
  // restores it.
  property bool fsForLibrary: false
  readonly property bool fullscreen: visibility === Window.FullScreen
  readonly property bool fsMode: fullscreen && inPlayer
  // while media plays the rail and library panel step aside (Settings → Interface → autoHideSide)
  readonly property bool focusVideo: !!Settings.values.autoHideSide && inPlayer && !!current && !sideOverride
  // #73: after fullscreen back to how the window was (maximised or not), and maximised again after a restart
  property bool wasMaximized: false
  function enterFs() { wasMaximized = visibility === Window.Maximized; showFullScreen(); }
  function leaveFs() { if (wasMaximized) showMaximized(); else showNormal(); }
  property bool stateKept: false   // set a moment after the start: the first states are the app's own
  Timer { interval: 1500; running: true; onTriggered: win.stateKept = true }
  onVisibilityChanged: {
    frame.setFullscreen(visibility === Window.FullScreen);   // #80
    if (stateKept && !shotPath && (visibility === Window.Maximized || visibility === Window.Windowed)) Settings.set("winMaximized", visibility === Window.Maximized);
  }
  function showPlayer() {
    if (fsForLibrary && !fullscreen) { fsForLibrary = false; enterFs(); }
    inPlayer = true;
  }
  function showBrowser() {
    if (fullscreen) { fsForLibrary = true; leaveFs(); }
    inPlayer = false;
  }
  function toggleLibrary() { if (inPlayer) showBrowser(); else if (current) showPlayer(); }
  function toggleFs() { fsForLibrary = false; if (fullscreen) leaveFs(); else { enterFs(); if (current) inPlayer = true; } }
  function toggleHideUi() { hideUi = !hideUi; if (hideUi) showPlayer(); osd(hideUi ? qsTr("Interface hidden – press Ctrl+\\ to show it again") : qsTr("Interface visible")); }
  function flashBig(playing) { playerView.flash(playing); }
  function raiseMain() { win.show(); win.raise(); win.requestActivate(); }
  // Resize the window to the video's shape once per new video (Settings → Interface → fitWindow), at most 70 % of
  // the screen
  function fitWindow(size) {
    if (!Settings.values.fitWindow || visibility !== Window.Windowed || !inPlayer || Theme.mobile || compact) return;
    Qt.callLater(() => {
      const chromeW = win.width - playerView.width, chromeH = win.height - playerView.height;
      const sw = Screen.desktopAvailableWidth, sh = Screen.desktopAvailableHeight;
      const s = Math.min((sw * 0.7 - chromeW) / size.width, (sh * 0.7 - chromeH) / size.height, Math.max(1, 720 / size.width));
      if (!(s > 0)) return;
      const w = Math.round(chromeW + size.width * s), h = Math.round(chromeH + size.height * s);
      const cx = win.x + win.width / 2, cy = win.y + win.height / 2;
      win.x = Math.round(Math.min(Math.max(cx - w / 2, Screen.virtualX), Screen.virtualX + sw - w));
      win.y = Math.round(Math.min(Math.max(cy - h / 2, Screen.virtualY), Screen.virtualY + sh - h));
      win.width = w; win.height = h;
    });
  }
  property bool pipOpen: false
  function togglePip() {
    if (!current || current.type === "audio") return osd(qsTr("Picture-in-picture not available"));
    if (pipOpen) { pip.close(); return; }
    pip.show(); pipOpen = true;
  }

  Library {
    id: library
    thumbs: Settings.values.thumbs !== false
    remember: Settings.values.rememberRecent !== false
    onMessage: t => win.osd(t)
  }
  Connections { target: Settings
    function onChanged(p) {
      if (p === "mediaFolders") library.scanFolders(Settings.values.mediaFolders || []);
      if (p === "language") I18n.setLanguage(Settings.values.language || "");
      if (p === "uiScale" || p === "passthrough") osd(qsTr("Restart the app to apply this"));
    } }
  Engine { id: en; ctl: win }
  property alias en: en
  VlcPlayer {
    id: player
    startArgs: en.startArgs
    logAll: Settings.values.logLevel === "info"
    logFile: Settings.values.logOn ? (Settings.values.logFile || library.logFile()) : ""
    videoSink: playerView.video.videoSink
    // the mini player and picture-in-picture get the same frames
    extraSink: win.pipOpen ? pip.video.videoSink : mini.visible ? mini.video.videoSink : null
  }
  property alias player: player
  Frames { id: frames }
  property alias frames: frames
  Playback { id: pb; ctl: win; player: player; library: library; frames: frames }
  Subs { id: subs }
  Subtitles { id: sb; ctl: win; subs: subs }
  property alias sb: sb
  property alias quick: quick
  property alias keys: keys
  property alias subs: subs
  FileDialog { id: subDlg; title: qsTr("Add subtitle file"); nameFilters: [qsTr("Subtitles") + " (*.srt *.vtt *.ass *.ssa *.sub *.lrc)", qsTr("All files") + " (*)"]
    onAccepted: sb.addFile(library.toLocal(selectedFile), true) }
  function addSubtitleFile() { if (!current) return osd(qsTr("Play something first")); subDlg.currentFolder = "file:///" + current.src.replace(/\\/g, "/").replace(/\/[^/]*$/, ""); subDlg.open(); }
  // Vela Player Pro (#53): the Pro screen, with the part that led there first
  function pro(what) { dialog("dialogs/ProDialog.qml", { ctl: win, what: what || "" }); }
  function searchSubtitles() { if (!Store.pro) return pro("extras"); if (!current) return osd(qsTr("Play something first")); dialog("dialogs/SearchSubs.qml", { ctl: win, subs: subs, it: current }); }
  function subtitleMenu() {
    return [
      { label: qsTr("Off"), checked: sb.active < 0, action: () => sb.select(-1) }
    ].concat(sb.tracks.map((t, i) => ({ label: t.label, checked: sb.active === i, action: () => sb.select(i) })), [
      { sep: true },
      { label: qsTr("Add file…"), icon: "file", action: addSubtitleFile, disabled: !current },
      { label: qsTr("Search online…"), icon: "search", action: searchSubtitles, disabled: !current },
      sb.lyrics ? { label: qsTr("Show lyrics"), checked: !sb.lyricsHidden, kbd: "Y", action: () => sb.toggleLyrics() } : null,
      { label: qsTr("Delay −0.1 s"), kbd: "G", action: () => sb.nudge(-0.1) },
      { label: qsTr("Delay +0.1 s"), kbd: "H", action: () => sb.nudge(0.1) }
    ]);
  }
  property alias pb: pb
  PipWindow { id: pip; ctl: win; onClosing: win.pipOpen = false }
  // files opened while the app runs ("Open with", a double-click), media keys and the system's media overlay
  Connections {
    target: System
    function onOpenPaths(paths) { player.log("opened by another start: " + paths.join(", ")); win.raiseMain(); if (paths.length) { win.queueList = null; win.addSources(paths); } }
    function onMediaButton(b) {
      if (b === "play" || b === "pause") pb.runAction("playPause", true);
      else if (b === "next") pb.runAction("next", true);
      else if (b === "previous") pb.runAction("prev", true);
      else if (b === "stop") pb.runAction("stop", true);
    }
    function onUpdateChanged() { if (System.update.state === "available" && !System.update.manual && Settings.values.skipVersion !== System.update.info.latest) updateBanner.shown = true; }
  }
  Connections { target: player; function onStateChanged() { System.mediaState(!win.current ? "closed" : player.playing ? "playing" : player.active ? "paused" : "stopped"); } }
  onCurrentChanged: if (current) { const i = library.item(current.src); System.mediaInfo(current.name.replace(/\.[^.]+$/, ""), i.artist || "", i.album || "", current.type === "audio"); } else System.mediaState("closed")
  Timer { id: updateTimer; interval: 5000; onTriggered: { System.checkUpdates(false); Settings.set("lastUpdateCheck", Date.now()); } }
  WindowFrame { id: frame; maximizeButton: maxBtn }
  Component.onCompleted: {
    // #64: never bigger than the screen (1600 × 1000 is too big at 150 % on a 1080p screen), and in its middle
    if (!shotPath) {
      // this screen (desktopAvailable… spans all monitors), leaving room for the taskbar
      const aw = Screen.width, ah = Screen.height - 48;
      win.width = Math.min(1600, aw - 48); win.height = Math.min(1000, ah - 48);
      win.x = Screen.virtualX + Math.round((aw - win.width) / 2); win.y = Screen.virtualY + Math.round((ah - win.height) / 2);
    }
    if ((!shotPath || Settings.values.testStartMax) && Settings.values.winMaximized) win.visibility = Window.Maximized;   // #73: shown maximised (testStartMax: also in a test)
    I18n.setLanguage(Settings.values.language || "");
    subs.loadFonts(Settings.values.customFonts || []);
    const opened = System.startPaths();
    if (!Settings.values.onboarded && !shotPath && !autoPlay) Qt.callLater(showOnboarding);
    // #71: after an update, what changed (once per version; a new install gets the onboarding instead)
    const before = Settings.values.lastVersion || (Settings.values.onboarded ? "3.0.3" : "");   // 3.0.3 and older did not keep it
    if (before && before !== System.version && !shotPath) Qt.callLater(() => dialog("dialogs/WhatsNew.qml", { since: before }));
    Settings.set("lastVersion", System.version);
    System.mediaAttach(win);
    if (opened.length) Qt.callLater(() => { queueList = null; addSources(opened); });
    if (Settings.values.autoUpdate !== false && !shotPath && !Theme.mobile) updateTimer.start();   // (a phone: the store updates it)
    if (startFolder) Settings.set("mediaFolders", [startFolder]);
    // Android (#53): the phone's own media folders, and Android's question for access to them
    if (Qt.platform.os === "android") {
      if (!(Settings.values.mediaFolders || []).length) Settings.set("mediaFolders", System.mobileFolders);
      if (!System.mediaAccess) System.askMediaAccess();
      System.readInsets(Screen.devicePixelRatio);
    }
    library.load();
    importFromV2();
    library.scanFolders(Settings.values.mediaFolders || []);
    if (autoPlay) addSources([autoPlay]);
    // testing: VLCR_OPEN=<step>;<step>… with view:<name>, dir:<n>, list, grid, select:<n>, pl:<n>, expanded,
    // dialog:<newpl|network|info|choose>, menu:<item|folder|playlist|more|player|title>, settings:<page>, play:<n>,
    // seek:<s>, pause, key:<name>, browse, hover:<fraction>, fs, cone, mini
    if (openAtStart) Qt.callLater(() => testSteps(openAtStart.split(";")), 0);
  }
  // First start after VLC Redesign 2 (Electron): its settings, library, playlists, positions and bookmarks, from the
  // file v2.x writes for this (export-for-v3.json); settings of things that are gone (the Classic engine) are left out
  function importFromV2() {
    if (Settings.values.importedV2) return;
    Settings.set("importedV2", true);
    const d = library.v2Export();
    if (!d._from) return;
    const gone = ["engine", "engineV", "forceTx", "txQuality", "txMaxW", "showBadge", "logFile"];
    const s = d.settings || {};
    for (const k in s) if (gone.indexOf(k) < 0 && Settings.defaultValue(k) !== undefined) Settings.set(k, s[k]);
    if (d.listView !== undefined) Settings.set("listView", !!d.listView);
    library.importV2(d);
    Qt.callLater(() => osd(qsTr("Settings and library taken over from VLC Redesign 2")));
  }
  // one step after the other, each after its own short wait (one long timer per step could fire out of order:
  // timers may be a few percent early or late)
  function testSteps(steps, i) {
    i = i || 0;
    if (i >= steps.length) { stepsDone = true; return; }
    const s = steps[i], k = s.split(":")[0], v = s.slice(k.length + 1);
    timerAt((i === 0 ? 600 : 0) + (k === "wait" ? +v : k === "set" ? 60 : 500), () => { testStep(k, v); testSteps(steps, i + 1); });   // first: the library is read
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
    else if (k === "resume") pb.acceptResume();
    else if (k === "look") playerView.look360(+v.split(",")[0], +v.split(",")[1]);
    else if (k === "zoom") playerView.zoom360(+v);
    else if (k === "size") { win.showNormal(); win.width = +v.split("x")[0]; win.height = +v.split("x")[1]; }
    else if (k === "play") { const i = vis.find(x => x.name === v) || vis[+v || 0]; playItem(i, vis); }
    else if (k === "seek") pb.seekTo(+v);
    else if (k === "pause") player.pause();
    else if (k === "key") keys.handler(v, false, 0);
    else if (k === "browse") showBrowser();
    else if (k === "fs") toggleFs();
    else if (k === "cone") Settings.set("volShape", v || "cone");
    else if (k === "ab") { pb.ab = { a: +v.split("-")[0], b: +v.split("-")[1] }; }
    else if (k === "bookmark") pb.addBookmark(+v);
    else if (k === "pip") togglePip();
    else if (k === "hover") controls.testHover(+v);
    else if (k === "sub") sb.select(+v);
    else if (k === "subfile") sb.addFile(v, true);
    else if (k === "search") searchSubtitles();
    else if (k === "submenu") menu(subtitleMenu(), 900, 400);
    else if (k === "quick") quick.toggle(v);
    else if (k === "lang") Settings.set("language", v);
    else if (k === "theme") Settings.set("theme", v);
    else if (k === "onboarding") { showOnboarding(); if (v) onboarding.step = +v; }
    else if (k === "settingsq") { openSettings("general"); timerAt(300, () => SettingsSearch.q = v); }
    else if (k === "shortcuts") shortcuts();
    else if (k === "set") { const i = v.indexOf("="); Settings.set(v.slice(0, i), JSON.parse(v.slice(i + 1))); }
    else if (k === "rec") en.toggleRecord();
    else if (k === "update") System.checkUpdates(true);
    else if (k === "dvdkey") en.dvdKey(v);
    else if (k === "dvdmenu") en.showDvdMenu();
    else if (k === "playfile") playItem(library.item(library.addSources([v], true)[0]));
    else if (k === "log") player.log(eval(v));
    else if (k === "mouse") { const xy = v.split(","); System.testMouseMove(win, +xy[0], +xy[1]); }
    else if (k === "dialog") {
      if (v === "newpl") dialog("dialogs/NewPlaylist.qml", { library: library, files: vis.slice(0, 3).map(i => i.src) });
      else if (v === "newpl0") dialog("dialogs/NewPlaylist.qml", { library: library });
      else if (v === "network") dialog("dialogs/Network.qml", {});
      else if (v === "info") dialog("dialogs/MediaInfo.qml", { it: library.item(vis[0].src) });
      else if (v === "choose") addToPlaylist([vis[0].src]);
    } else if (k === "menu") {
      if (v === "more") moreMenu(win.width - 300, 92);
      else if (v === "player") { const m = menu(playerMenu(), 760, 260); }
      else if (v === "title") titleMenu(60, 40);
      else { const e = v === "item" ? { kind: "item", it: vis[1] } : pg.cards.filter(c => c.kind === v)[0]; if (e) entryMenu(e, v === "item" ? 848 : 700, v === "item" ? 206 : 300, true); }
    }
  }

  // ---------- title bar (36px); in fullscreen it slides in at the top edge ----------
  Rectangle {
    id: titlebar
    visible: !win.hideUi
    anchors { left: parent.left; right: parent.right }
    y: win.fsMode ? (win.fsTop ? 0 : -height) : win.safeTop
    opacity: win.fsMode && !win.fsTop ? 0 : 1
    Behavior on y { enabled: win.fsMode; NumberAnimation { duration: 200 } }
    Behavior on opacity { NumberAnimation { duration: 200 } }
    z: 30
    height: win.compact ? 44 : 36; color: Theme.bg
    Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: Theme.edge }
    MouseArea { anchors.fill: parent; enabled: !Theme.mobile; onPressed: if (!win.fullscreen) win.startSystemMove(); onDoubleClicked: win.toggleMax() }
    Row {
      anchors { left: parent.left; leftMargin: 10; verticalCenter: parent.verticalCenter }
      spacing: 4
      Image {   // the logo: Vela Player's sail in the accent colour
        width: 18; height: 18; anchors.verticalCenter: parent.verticalCenter; sourceSize: Qt.size(36, 36)
        source: Theme.logo
      }
      IconButton { id: menuBtn; html: "menuBtn"; width: 28; height: 28; tip: qsTr("Menu")
                   onClicked: { const p = menuBtn.mapToItem(null, 0, menuBtn.height + 4); win.titleMenu(p.x, p.y); } }
      Rectangle { visible: !win.compact; width: 1; height: 16; color: Theme.line; anchors.verticalCenter: parent.verticalCenter }
      IconButton { html: "sideToggle"; visible: !win.compact; width: 28; height: 28; tip: qsTr("Sidebar (Q)"); onClicked: win.sideToggle() }
      Row {
        visible: !win.compact
        spacing: 6; anchors.verticalCenter: parent.verticalCenter; leftPadding: 4
        Icon { html: "crumbs"; color: Theme.muted; anchors.verticalCenter: parent.verticalCenter }
        T { text: win.pg.title; color: Theme.muted; anchors.verticalCenter: parent.verticalCenter }
      }
    }
    T { anchors.centerIn: parent; text: win.title; color: Theme.text2; width: Math.min(implicitWidth, parent.width * 0.4) }
    Row {
      visible: !Theme.mobile && !Settings.values.compactTest
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
          Icon { anchors.centerIn: parent; color: parent.hot ? (modelData === "closeBtn" ? "#fff" : Theme.text) : Theme.muted
                 html: modelData === "maxBtn" && win.visibility === Window.Maximized ? "" : modelData
                 name: modelData === "maxBtn" && win.visibility === Window.Maximized ? "restore" : "" }
          MouseArea { id: a; anchors.fill: parent; hoverEnabled: true
            onClicked: modelData === "minBtn" ? win.showMinimized() : modelData === "maxBtn" ? win.toggleMax()
                     : modelData === "fsBtn2" ? win.toggleFs() : win.quit() }
        }
      }
    }
  }
  property Item maxBtn: null
  function quit() { pb.savePos(); Qt.quit(); }
  function sideToggle() {
    if (focusVideo) { sideOverride = true; sideHidden = false; return; }
    if (sideOverride && inPlayer) { sideOverride = false; return; }          // hide it again (#8)
    if (Settings.values.navExpanded) return Settings.set("navExpanded", false);
    sideHidden = !sideHidden;
  }

  // ---------- body ----------
  Item {
    id: body
    anchors { left: parent.left; right: parent.right; top: win.fsMode || win.hideUi ? parent.top : titlebar.bottom; bottom: win.fsMode || win.hideUi ? parent.bottom : controls.top }
    readonly property bool bare: win.fsMode || win.hideUi || win.focusVideo

    Rail {
      id: rail
      ctl: win
      visible: !body.bare && !win.compact
      anchors { left: parent.left; top: parent.top; bottom: parent.bottom; topMargin: expanded ? 6 : 0; bottomMargin: expanded ? 6 : 0 }
    }
    Rail {   // a phone: the views in a bar at the bottom (not while playing)
      id: bottomRail
      ctl: win
      horizontal: true
      visible: !body.bare && win.compact && !win.inPlayer
      anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
    }
    SidePanel {
      id: side
      ctl: win
      width: body.bare || win.sideHidden || win.compact || Settings.values.navExpanded ? 0 : 250
      Behavior on width { NumberAnimation { duration: 200 } }
      visible: width > 0
      anchors { left: rail.visible ? rail.right : parent.left; top: parent.top; bottom: parent.bottom }
    }

    Rectangle {   // main area: library or player
      id: main
      anchors { left: side.visible ? side.right : rail.visible ? rail.right : parent.left; right: parent.right; top: parent.top
                bottom: bottomRail.visible ? bottomRail.top : parent.bottom }
      color: Theme.panel

      Browser { id: browser; ctl: win; anchors.fill: parent; visible: !win.inPlayer }
      PlayerView { id: playerView; ctl: win; anchors.fill: parent; visible: win.inPlayer }
      MiniPlayer {
        id: mini
        ctl: win
        visible: !win.inPlayer && !!win.current && Settings.values.miniPlayer !== false
        anchors { right: parent.right; bottom: parent.bottom; margins: 16 }
        z: 4
      }

      UpdateBanner {
        id: updateBanner
        anchors { right: parent.right; bottom: parent.bottom; margins: 16 }
        z: 8
      }
      QuickPanel {
        id: quick
        ctl: win
        anchors { right: parent.right; top: parent.top; bottom: parent.bottom; margins: 12 }
        z: 7
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
      Rectangle {   // #79: "Continue from 12:34?" when Resume is set to Ask (like VLC's own bar); goes after 10 s
        id: resumeBar
        readonly property real at: pb.resumeOffer
        anchors.horizontalCenter: parent.horizontalCenter; y: 16
        width: resumeRow.implicitWidth + 24; height: 44; radius: 22; color: "#e6000000"
        visible: at > 0 && win.inPlayer; z: 6
        onAtChanged: if (at > 0) resumeT.restart()
        Timer { id: resumeT; interval: 10000; onTriggered: pb.resumeOffer = 0 }
        Row {
          id: resumeRow
          anchors.centerIn: parent; spacing: 10
          T { anchors.verticalCenter: parent.verticalCenter; color: "#ffffff"; text: qsTr("Continue from %1?").arg(Lib.shortFmt(resumeBar.at)) }
          Button { anchors.verticalCenter: parent.verticalCenter; compact: true; kind: "primary"; text: qsTr("Resume"); onClicked: pb.acceptResume() }
          IconButton { anchors.verticalCenter: parent.verticalCenter; name: "x"; tip: qsTr("Close"); onClicked: pb.resumeOffer = 0 }
        }
      }
    }
  }

  // ---------- menus of the player (design: right-click menu.png) and of the title bar ----------
  function playerMenu() {
    const it = current, rate = +player.rate.toFixed(2), repeatNames = { off: qsTr("Off"), one: qsTr("Current"), all: qsTr("All") };
    const ab = pb.ab;
    return [
      { label: player.playing ? qsTr("Pause") : qsTr("Play"), icon: player.playing ? "pause" : "play", accent: true, kbd: "Space", action: () => pb.togglePlay() },
      { label: qsTr("Stop"), icon: "stop", accent: true, kbd: "S", action: () => pb.stop(), disabled: !it },
      { label: qsTr("Previous"), icon: "prev", accent: true, kbd: "P", action: () => pb.prev(), disabled: !it },
      { label: qsTr("Next"), icon: "next", accent: true, kbd: "N", action: () => pb.step(1), disabled: !it },
      { label: player.recording ? qsTr("Stop recording") : qsTr("Record"), icon: "record", accent: true, kbd: "R", action: () => en.toggleRecord(), disabled: !it },
      { label: hideUi ? qsTr("Show interface") : qsTr("Hide interface"), icon: "hide", kbd: "Ctrl + \\", action: toggleHideUi },
      { sep: true },
      { label: qsTr("Playback"), icon: "playback", sub: () => [{ header: qsTr("Speed") }].concat(
          [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3].map(r => ({ label: r + "×", checked: rate === r, action: () => pb.setSpeed(r) })), [
          { sep: true },
          { label: qsTr("Repeat: %1").arg(repeatNames[Settings.values.repeat || "off"]), icon: "repeat", action: () => { const n = { off: "one", one: "all", all: "off" }[Settings.values.repeat || "off"]; Settings.set("repeat", n); osd(qsTr("Repeat: %1").arg(repeatNames[n])); } },
          { label: qsTr("Shuffle"), icon: "shuffle", checked: !!Settings.values.shuffle, action: () => Settings.set("shuffle", !Settings.values.shuffle) },
          { label: qsTr("Autoplay next"), checked: !!Settings.values.autoNext, action: () => Settings.set("autoNext", !Settings.values.autoNext) },
          { sep: true },
          { label: qsTr("%1 s forward").arg(Settings.values.jump), kbd: "→", action: () => pb.seekTo(pb.curTime() + Settings.values.jump) },
          { label: qsTr("%1 s back").arg(Settings.values.jump), kbd: "←", action: () => pb.seekTo(pb.curTime() - Settings.values.jump) },
          { sep: true },
          { label: qsTr("Add bookmark"), icon: "bookmark", kbd: "Ctrl + B", action: () => pb.addBookmark(), disabled: !it },
          { sep: true }, { header: qsTr("A-B repeat") },
          { label: ab.a !== null ? qsTr("Set point A (%1)").arg(pb.fmt(ab.a)) : qsTr("Set point A"), kbd: "A", action: () => pb.abSet("a"), disabled: !it },
          { label: ab.b !== null ? qsTr("Set point B (%1)").arg(pb.fmt(ab.b)) : qsTr("Set point B"), action: () => pb.abSet("b"), disabled: !it },
          { label: qsTr("A-B repeat off"), action: () => pb.abClear(), disabled: ab.a === null },
          { label: qsTr("Next chapter / bookmark"), kbd: "Shift + N", action: () => pb.jumpMark(1), disabled: !it || !pb.markTimes().length },
          { label: qsTr("Previous chapter / bookmark"), kbd: "Shift + P", action: () => pb.jumpMark(-1), disabled: !it || !pb.markTimes().length }
        ], player.isDvd ? [{ sep: true }, { header: qsTr("DVD") }, { label: qsTr("DVD menu"), kbd: "Shift + M", action: () => en.showDvdMenu() }].concat(
          player.titles().map((x, i) => i && !x.menu ? { label: qsTr("Title %1").arg(i) + (x.duration ? "  ·  " + Lib.shortFmt(x.duration / 1000) : ""), checked: player.title === i, action: () => player.setTitle(i) } : null)) : []) },
      { label: qsTr("Video"), icon: "video", sub: () => [
          { label: qsTr("Fullscreen"), icon: "fullscreen", kbd: "F", action: toggleFs },
          { label: qsTr("Snapshot"), icon: "camera", kbd: "Shift + S", action: () => pb.snapshot(), disabled: !it },
          { label: qsTr("Picture-in-picture"), icon: "pip", action: togglePip, disabled: !it },
          { label: qsTr("360° video"), checked: playerView.on360, action: () => { if (!Store.pro) return pro("video"); playerView.force360 = !playerView.on360; playerView.reset360(); }, disabled: !it || !playerView.showVideo },
          { label: qsTr("Reset 360° view"), action: () => playerView.reset360(), disabled: !playerView.on360 },
          { sep: true }, { header: qsTr("Aspect ratio") }
        ].concat([["", "Default"], ["fill", "Fill"], ["stretch", "Stretch"]].map(([v, l]) => ({ label: qsTr(l), checked: (Settings.values.aspect || "") === v, action: () => Settings.set("aspect", v) })), [
          { sep: true },
          { label: qsTr("Rotate 90°"), icon: "rotate", action: () => Settings.set("vf.rotate", ((Settings.values.vf.rotate || 0) + 90) % 360) },
          { label: qsTr("Mirror"), checked: !!Settings.values.vf.mirror, action: () => Settings.set("vf.mirror", !Settings.values.vf.mirror) },
          { label: qsTr("Video filters…"), icon: "settings", action: () => quick.toggle("video") }]) },
      { label: qsTr("Audio"), icon: "audio", sub: () => [{ header: qsTr("Audio track") }].concat(
          player.audioTracks().filter(t => t.id >= 0).map(t => ({ label: t.name, checked: player.audioTrack() === t.id, action: () => player.setAudioTrack(t.id) })), [
          { sep: true },
          { label: player.muted ? qsTr("Unmute") : qsTr("Mute"), icon: player.muted ? "volume" : "mute", kbd: "M", action: () => pb.toggleMute() },
          { label: qsTr("Equalizer"), checked: !!Settings.values.eqOn, action: () => Settings.set("eqOn", !Settings.values.eqOn) },
          { label: qsTr("Audio effects…"), icon: "settings", action: () => quick.toggle("audio") }]) },
      { label: qsTr("Subtitle"), icon: "subtitle", sub: subtitleMenu },
      { label: qsTr("More settings"), icon: "settings", sub: () => [
          { label: qsTr("Quick settings"), icon: "settings", action: () => quick.toggle() },
          { label: qsTr("Global settings…"), icon: "general", kbd: "Ctrl + P", action: () => openSettings() },
          { label: qsTr("Media information"), icon: "info", kbd: "Ctrl + I", action: () => mediaInfo(), disabled: !it },
          { label: qsTr("Keyboard shortcuts"), icon: "keyboard", kbd: "F1", action: shortcuts }].concat() },
      { label: qsTr("Playlist"), icon: "playlist", sub: () => [
          { label: qsTr("Show queue"), icon: "queue", kbd: "Q", action: toggleQueue },
          { label: qsTr("Add current to playlist…"), icon: "plus", action: () => addToPlaylist([current.src]), disabled: !it },
          { label: qsTr("New playlist…"), icon: "playlist", action: () => doAct("newpl") },
          { sep: true }].concat(library.playlists.map((p, i) => ({ label: p.name, icon: "playlist", action: () => navigate({ view: "playlists", pl: i }) }))) },
      { label: qsTr("Open media"), icon: "open", sub: openMediaItems },
      { sep: true },
      { label: qsTr("Quit VLC"), icon: "quit", kbd: "Ctrl + Q", action: quit }
    ];
  }
  function mediaInfo() { if (current) dialog("dialogs/MediaInfo.qml", { it: library.item(current.src) }); else osd(qsTr("Nothing is playing")); }
  function titleMenu(x, y) {
    menu(openMediaItems().concat([{ sep: true },
      { label: qsTr("New playlist…"), icon: "playlist", action: () => doAct("newpl") },
      { label: qsTr("Add current to playlist…"), icon: "plus", action: () => addToPlaylist([current.src]), disabled: !current },
      { sep: true },
      { label: qsTr("Snapshot"), icon: "camera", kbd: "Shift + S", action: () => pb.snapshot(), disabled: !current },
      { label: player.recording ? qsTr("Stop recording") : qsTr("Record"), icon: "record", kbd: "R", action: () => en.toggleRecord(), disabled: !current },
      { label: qsTr("Picture-in-picture"), icon: "pip", action: togglePip, disabled: !current },
      { label: qsTr("Media information"), icon: "info", kbd: "Ctrl + I", action: mediaInfo, disabled: !current },
      { sep: true },
      { label: qsTr("Settings…"), icon: "settings", kbd: "Ctrl + P", action: () => openSettings() },
      { label: qsTr("Keyboard shortcuts"), icon: "keyboard", kbd: "F1", action: shortcuts },
      { label: qsTr("Welcome screen"), icon: "info", action: showOnboarding },
      { sep: true },
      { label: qsTr("Quit VLC"), icon: "quit", kbd: "Ctrl + Q", action: quit }]), x, y);
  }

  // ---------- control bar (52px); in fullscreen it slides in at the bottom edge ----------
  ControlBar {
    id: controls
    ctl: win
    visible: !win.hideUi
    anchors { left: parent.left; right: parent.right }
    y: win.fsMode ? (win.fsBottom ? win.height - height : win.height) : win.height - height - win.safeBottom
    opacity: win.fsMode && !win.fsBottom ? 0 : 1
    Behavior on y { enabled: win.fsMode; NumberAnimation { duration: 200 } }
    Behavior on opacity { NumberAnimation { duration: 200 } }
    z: 30
  }

  // In fullscreen the top bar and the controls stay hidden; they slide in while the mouse is near the top or bottom
  // edge. The cursor hides after a moment without movement while a video plays (Settings → Interface).
  // a click outside the quick settings closes them (the click still does what it does)
  PointHandler {
    acceptedButtons: Qt.AllButtons
    onActiveChanged: if (active && quick.open) {
      const p = quick.mapFromItem(null, point.position.x, point.position.y);
      const onBar = point.position.y > win.height - controls.height && point.position.x > win.width - 200;   // its own buttons
      if (!(p.x >= 0 && p.y >= 0 && p.x <= quick.width && p.y <= quick.height) && !onBar && win.dialogs === 0) quick.open = false;
    }
  }
  HoverHandler {
    id: hover
    // #60: Qt Quick repeats the hover with every video frame while the mouse stands still: only real moves count
    property point last: Qt.point(-1, -1)
    onPointChanged: {
      const pos = point.position;
      if (Math.abs(pos.x - last.x) < 1 && Math.abs(pos.y - last.y) < 1) return;
      last = Qt.point(pos.x, pos.y);
      const y = pos.y;
      win.fsTop = win.fsMode && y <= 60 && win.dialogs === 0;
      win.fsBottom = win.fsMode && y >= win.height - 90;
      win.cursorHidden = false; hideCursorT.restart();
    }
    onHoveredChanged: if (!hovered) { win.fsTop = false; win.fsBottom = false; }
  }
  Timer { id: hideCursorT; interval: (Settings.values.hideCursorDelay || 2.5) * 1000
          onTriggered: win.cursorHidden = win.fsMode && Settings.values.hideCursor !== false && player.playing && !win.fsTop && !win.fsBottom && win.dialogs === 0 }
  onFsModeChanged: { fsTop = fsBottom = false; cursorHidden = false; if (fsMode) hideCursorT.restart(); }
  // #60: Settings, dialogs and menus take the mouse moves, so the cursor stays visible while one is open
  onDialogsChanged: { if (dialogs > 0) cursorHidden = false; else if (fsMode) hideCursorT.restart(); }
  onCursorHiddenChanged: System.hideCursor(cursorHidden)   // #60: at once, without waiting for the mouse to move
  // #61: while something plays the computer stays awake; with a video the screen stays on too
  readonly property int awake: player.playing ? (current && current.type === "audio" ? 1 : 2) : 0
  onAwakeChanged: System.keepAwake(awake)

  // drop files and folders anywhere to add them (#drop)
  DropArea {
    id: dropArea
    anchors.fill: parent
    keys: ["text/uri-list"]
    enabled: win.dialogs === 0
    onDropped: d => {
      if (!d.hasUrls) return;
      d.accept(Qt.CopyAction);
      const all = library.expandMedia(d.urls.map(u => library.toLocal(u)));
      // only subtitle or lyrics files: for what plays
      if (all.length && all.every(p => /\.(srt|vtt|ass|ssa|sub|lrc)$/i.test(p))) { if (win.current) all.forEach(f => sb.addFile(f, true)); else win.osd(qsTr("Play a video first")); return; }
      win.queueList = null; win.addSources(all, true);
    }
  }
  Rectangle {
    anchors.fill: parent; visible: dropArea.containsDrag; z: 50
    color: Theme.accentSoft; border.width: 3; border.color: Theme.accent
    T { anchors.centerIn: parent; text: qsTr("Drop to add"); px: 20; color: Theme.text }
  }

  // window edges: resize like a normal window (the frame is our own)
  Repeater {
    model: win.fullscreen || win.visibility === Window.Maximized ? [] : [[Qt.LeftEdge, 0, 0, 5, -1], [Qt.RightEdge, -5, 0, 5, -1], [Qt.BottomEdge, 0, -5, -1, 5], [Qt.TopEdge, 0, 0, -1, 4]]
    MouseArea {
      required property var modelData
      z: 40
      x: modelData[1] < 0 ? win.width + modelData[1] : modelData[1]; y: modelData[2] < 0 ? win.height + modelData[2] : modelData[2]
      width: modelData[3] < 0 ? win.width : modelData[3]; height: modelData[4] < 0 ? win.height : modelData[4]
      cursorShape: modelData[0] === Qt.LeftEdge || modelData[0] === Qt.RightEdge ? Qt.SizeHorCursor : Qt.SizeVerCursor
      onPressed: win.startSystemResize(modelData[0])
    }
  }

  // ---------- keyboard (app.js keydown): the library's keys, Ctrl shortcuts, then the player's actions ----------
  KeyFilter {
    id: keys
    enabled: win.active
    handler: (name, repeat, code) => {
      if (win.dialogs > 0) return false;                       // dialogs and menus have their own keys
      const browsing = !win.inPlayer;
      if (browsing && name === "Ctrl+a") { win.selectAll(); return true; }
      if (browsing && win.selectedItems.length) {
        if (name === "Escape") { win.clearSelection(); return true; }
        if (name === "Delete") { const a = win.selActions(win.selectedItems); a[a.length - 1].action(); return true; }
      }
      const custom = name.startsWith("Ctrl+") && pb.keyMap[name];
      if (custom) { pb.runAction(custom); return true; }
      if (name.startsWith("Ctrl+")) {
        const k = name.slice(5), views = ["home", "videos", "music", "network", "playlists", "recent"];
        if (/^[1-6]$/.test(k)) { win.showView(views[+k - 1]); return true; }
        const map = { o: () => win.doAct("files"), f: () => win.doAct("folder"), n: () => win.doAct("url"), i: win.mediaInfo,
                      p: () => win.openSettings(), q: win.quit, "\\": win.toggleHideUi };
        if (map[k.toLowerCase()]) { map[k.toLowerCase()](); return true; }
        return false;
      }
      if (name === "F11") { win.toggleFs(); return true; }
      if (name === "F1") { win.shortcuts(); return true; }
      if (name === "Escape" && quick.open) { quick.open = false; return true; }
      if (win.inPlayer && !name.includes("+") && en.dvdKey(name)) return true;   // the DVD menu's buttons
      if (pb.key(name, repeat, code)) return true;
      if (name === "Escape") {
        if (win.hideUi) win.toggleHideUi();
        else if (win.fullscreen) win.toggleFs();
        else if (win.inPlayer) win.showBrowser();
        return true;
      }
      return false;
    }
    onReleased: code => pb.keyUp(code)
  }
  onActiveChanged: if (!active) pb.fastEnd()
  onClosing: pb.savePos()

  // testing: frames drawn while a video plays, then a screenshot (VLCR_SHOT)
  property int swaps: 0
  property int f0: 0
  onFrameSwapped: swaps++
  Timer { running: shotPath !== "" && autoPlay !== ""; interval: 4000; onTriggered: { win.swaps = 0; win.f0 = player.framesShown; } }
  Timer { running: shotPath !== "" && autoPlay !== ""; interval: 7000
          onTriggered: player.log("decoded " + ((player.framesShown - win.f0) / 3).toFixed(1) + " fps, drawn " + (win.swaps / 3).toFixed(1) + " fps") }
  // testing: the screenshot (and quit) at VLCR_SHOT_MS, but never before the last test step has run (on a slow build
  // server the steps can take longer than planned)
  property bool stepsDone: !openAtStart
  property bool shotDue: false
  onStepsDoneChanged: if (stepsDone && shotDue) timerAt(300, takeShot)
  Timer { running: shotPath !== ""; interval: shotMs; onTriggered: { if (win.stepsDone) win.takeShot(); else win.shotDue = true; } }
  function takeShot() {   // (once)
          if (shotTaken) return; shotTaken = true;
          player.log("hit test over the maximise button: " + (maxBtn ? frame.hitTestAt(Math.round((maxBtn.mapToItem(null, 22, 18).x) * Screen.devicePixelRatio), Math.round(18 * Screen.devicePixelRatio)) : -1));
                         player.log("items " + library.items.length + ", busy " + library.busy + ", view " + nav.view + ", cards " + pg.cards.length +
                                    ", player " + (current ? current.name : "-") + " t=" + (player.time / 1000).toFixed(1) + " rate=" + player.rate + " vol=" + player.volume + " size=" + player.videoSize.width + "x" + player.videoSize.height + " subs=" + sb.tracks.length + "/" + sb.active + " cues=" + (sb.cues ? sb.cues.length : -1) + " now=" + JSON.stringify(sb.now));
                         frame.grab(shotPath); win.quit();   // like Ctrl+Q: the position is kept
  }
  property bool shotTaken: false
}
