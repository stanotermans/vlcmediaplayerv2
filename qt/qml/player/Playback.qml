// What happens around the player (v2.x app.js "playback engine", chapters and bookmarks #40, A-B repeat #42, hold
// for 2× #46, volume, keyboard actions #37): which file plays, where it resumes, what comes next, and every action a
// key, a menu or a button can start. The libVLC player itself is VlcPlayer (C++).
import QtQuick
import VLCR
import "../Lib.js" as Lib

QtObject {
  id: pb
  property var ctl: null                 // the main window
  property VlcPlayer player: null
  property Library library: null
  property Frames frames: null
  readonly property var it: ctl ? ctl.current : null

  function fmt(s) { if (!isFinite(s) || s < 0) s = 0; s = Math.floor(s); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, "0")).join(":"); }
  function curTime() { return player.time / 1000; }
  function curDur() { return player.length > 0 ? player.length / 1000 : (it && it.duration) || 0; }
  function osd(t) { ctl.osd(t); }

  // ---------- opening ----------
  // A DVD for libVLC: dvd:///<the .iso, or the folder holding VIDEO_TS>, plus #<title> for one title (none: the menu)
  function dvdMrl(src) {
    const tm = /#t(\d+)(?:n\d+)?$/.exec(src), file = tm ? src.slice(0, tm.index) : src;
    const disc = /\.iso$/i.test(file) ? file : file.replace(/[\\/]VIDEO_TS[\\/]VIDEO_TS\.IFO$/i, "") + "/";
    return "dvd://" + (disc.startsWith("/") ? "" : "/") + disc.replace(/\\/g, "/") + (tm ? "#" + tm[1] : "");
  }
  readonly property var dvdRe: /(\.iso|[\\/]VIDEO_TS\.IFO)(#t\d+(?:n\d+)?)?$/i
  function mrl(i) { return i.remote ? i.src : dvdRe.test(i.src) ? dvdMrl(i.src) : i.src; }

  property bool fit: false               // resize the window to the next video once its size is known
  property real resumeOffer: 0           // #79: the saved place the resume bar offers (seconds; 0 = no bar)
  function acceptResume() { const t = resumeOffer; resumeOffer = 0; if (t) { seekTo(t); osd(qsTr("Resuming from %1").arg(Lib.shortFmt(t))); } }
  function playItem(i, list) {
    if (!i) return;
    savePos();
    abClear(true);
    if (list !== undefined) ctl.queueList = list;
    ctl.current = i; ctl.sideOverride = false;
    library.playing = i.src; library.hurry(i.src);
    const pos = library.positions[i.src];
    const saved = Settings.values.resume && pos && pos < (i.duration || 1e9) - 5 ? pos : 0;
    // #79: "always" resumes, "ask" starts from the beginning and offers the saved place (the bar), "never" starts over
    const mode = Settings.values.resumeMode || "always";
    const resumeAt = mode === "always" ? saved : 0;
    resumeOffer = mode === "ask" ? saved : 0;
    fit = true;
    player.keepSpu = dvdRe.test(i.src);              // a DVD's menus and subtitles stay libVLC's
    player.open(mrl(i), resumeAt * 1000, ctl.en.options(i.src));
    ctl.sb.setup(i);
    if (resumeAt) osd(qsTr("Resuming from %1").arg(Lib.shortFmt(resumeAt)));
    if (Settings.values.rememberRecent) library.addRecent(i.src);
    ctl.showPlayer();
    if (i.type !== "audio" && !i.remote && Settings.values.seekPreview && i.duration) frames.storyboard(i.src, i.duration, i.width * i.height > 2560 * 1440);
    else frames.clear();
  }
  // an item's latest data from the library (duration, chapters … arrive after it was opened)
  readonly property var info: { library.items; return it ? library.item(it.src) : null; }
  onInfoChanged: {
    if (info && it && info.duration && !frames.src && it.type !== "audio" && !it.remote && Settings.values.seekPreview)
      frames.storyboard(it.src, info.duration, info.width * info.height > 2560 * 1440);
    if (info && info.ready) ctl.sb.refreshTracks(info);
  }

  function togglePlay() {
    if (!it) { const v = ctl.vis[0] || library.items[0]; if (v) playItem(v, ctl.vis); else ctl.doAct("files"); return; }
    player.togglePause();
    ctl.flashBig(player.playing);
  }
  function stop() {
    savePos(); abClear(true); ctl.en.stopRecord();
    player.stop(); frames.clear(); ctl.sb.clear();
    ctl.current = null; library.playing = "";
    ctl.showBrowser();
  }
  function queue() {
    const q = ctl.queueList;
    if (q && it && q.some(x => x.src === it.src)) return q;
    const v = ctl.vis;
    if (it && v.some(x => x.src === it.src)) return v;
    if (it && !it.remote) {                // the files next to it
      const dir = it.src.split(Lib.SEP).slice(0, -1).join("\\");
      return Lib.sortItems(library.items.filter(x => x.type === it.type && x.src.split(Lib.SEP).slice(0, -1).join("\\") === dir), "name", false);
    }
    return library.items;
  }
  function step(dir, auto) {
    const q = queue(); if (!q.length) return;
    if (Settings.values.shuffle && q.length > 1) { let n; do { n = q[Math.floor(Math.random() * q.length)]; } while (it && n.src === it.src); return playItem(n); }
    let pos = q.findIndex(x => it && x.src === it.src) + dir;
    if (pos >= q.length) { if (Settings.values.repeat === "all") pos = 0; else return auto ? null : osd(qsTr("End of the list")); }
    if (pos < 0) pos = Settings.values.repeat === "all" ? q.length - 1 : 0;
    playItem(q[pos]);
  }
  function prev() { if (curTime() > 3) return seekTo(0); step(-1); }
  function seekTo(t) { const d = curDur(); t = Math.max(0, d ? Math.min(d - 0.5, t) : t); player.seek(t * 1000); }
  function jumpBy(d, label) { if (!it) return; seekTo(curTime() + d); osd(label); }

  // ---------- positions and watched marks ----------
  function savePos() {
    if (!it) return;
    const d = curDur(), t = curTime(); if (!d) return;
    if (resumeOffer) return;                         // #79: the offered place stays saved until it is taken or turned down
    if (t > d * 0.95) library.setWatched([it.src], true);
    library.setPosition(it.src, Settings.values.resume && t > 5 && t < d - 5 ? Math.floor(t) : 0);
  }
  property Timer saver: Timer { interval: 5000; repeat: true; running: pb.player && pb.player.playing; onTriggered: pb.savePos() }
  property Connections events: Connections {
    target: pb.player
    function onEnded() {
      if (!pb.it) return;
      pb.library.setPosition(pb.it.src, 0); pb.library.setWatched([pb.it.src], true);
      if (pb.ab.b !== null) { pb.seekTo(pb.ab.a); pb.player.play(); return; }   // B at the very end
      if (Settings.values.repeat === "one") { pb.seekTo(0); pb.player.play(); }
      else if (Settings.values.autoNext || Settings.values.repeat === "all") pb.step(1, true);
    }
    function onFailed() { pb.osd(qsTr("Cannot play this file")); }
    function onStateChanged() { if (!pb.player.playing && pb.player.active) pb.savePos(); }
    function onVideoSizeChanged() { if (pb.fit && pb.player.videoSize.width > 0) { pb.fit = false; pb.ctl.fitWindow(pb.player.videoSize); } }
  }

  // ---------- volume (0…1 like v2.x; above 100 % via Settings → Audio → gain) ----------
  readonly property real volume: Settings.values.volume ?? 0.8
  property Binding volBinding: Binding { target: pb.player; property: "volume"; value: Math.round(Math.min(2, pb.volume * (Settings.values.gain || 100) / 100) * 100) }
  function setVol(v) { Settings.set("volume", Math.round(Math.min(1, Math.max(0, v)) * 100) / 100); }
  function volOsd() { osd(qsTr("Volume %1%").arg(Math.round(volume * 100))); }
  function toggleMute() { player.muted = !player.muted; osd(player.muted ? qsTr("Muted") : qsTr("Volume %1%").arg(Math.round(volume * 100))); }

  // ---------- speed, and hold for 2× (#46): while Shift+Space or the mouse button on the video is held ----------
  readonly property real speed: Settings.values.speed || 1
  property bool fast: false
  property real fastFrom: 1
  property int fastKey: 0                // the key that is held (0: the mouse)
  property Binding rateBinding: Binding { target: pb.player; property: "rate"; value: pb.fast ? Math.max(2, pb.speed) : pb.speed }
  function setSpeed(r) { r = Math.min(4, Math.max(0.25, +r.toFixed(2))); Settings.set("speed", r); osd(qsTr("Speed %1×").arg(r)); }
  property real fastSince: 0
  function fastStart(key) { if (fast || !it || !player.playing) return; fastKey = key; fast = true; fastSince = Date.now(); }
  // #74: after a speed change libVLC 3 can leave the sound behind the picture with some formats; a seek to the same
  // moment lines them up again (only after a real stretch at 2×, not after a tap)
  function fastEnd() {
    if (!fast) return;
    fast = false;
    if (Date.now() - fastSince > 400 && player.playing) Qt.callLater(() => player.seek(player.time));
  }
  function frameStep(dir) {
    if (!it) return;
    if (dir > 0) return player.nextFrame();
    player.pause(); seekTo(curTime() - 1 / 30);
  }

  // ---------- chapters (embedded) and bookmarks (your own), #40 ----------
  function chapters() { return (info && info.chapters) || []; }
  function bookmarks() { return (it && library.bookmarks[it.src]) || []; }
  function markTimes() { return [...new Set(chapters().map(c => c.start).concat(bookmarks().map(b => b.t)).map(x => Math.round(x * 10) / 10))].sort((a, b) => a - b); }
  function addBookmark(at, name) {
    if (!it) return;
    if (at === undefined) at = curTime();
    const list = bookmarks();
    if (list.some(b => Math.abs(b.t - at) < 0.5)) return osd(qsTr("There is already a bookmark here"));
    library.setBookmarks(it.src, list.concat([{ t: at, name: name || qsTr("Bookmark %1").arg(list.length + 1) }]));
    osd(qsTr("Bookmark added at %1").arg(fmt(at)));
  }
  // "previous" within 2 s after a mark goes to the mark before it, like ⏮ on a CD player
  function jumpMark(dir) {
    if (!it) return;
    const now = curTime(), times = markTimes();
    const target = dir > 0 ? times.find(x => x > now + 0.5) : times.slice().reverse().find(x => x < now - 2);
    if (target === undefined) { if (dir < 0) seekTo(0); return osd(dir > 0 ? qsTr("No next chapter") : qsTr("Start")); }
    seekTo(target);
    const label = markLabel(target + 0.01);
    osd(label ? label + " · " + fmt(target) : fmt(target));
  }
  // the name for a moment: a bookmark close to it (within 1 % of the length), otherwise the chapter it lies in
  function markLabel(at) {
    if (!it) return "";
    const d = curDur(), near = Math.max(1, d * 0.01);
    const b = bookmarks().find(x => Math.abs(x.t - at) <= near);
    if (b) return b.name;
    const ch = chapters(); let c = null;
    for (const x of ch) if (x.start <= at + 0.001) c = x;
    return c ? (c.title || qsTr("Chapter %1").arg(ch.indexOf(c) + 1)) : "";
  }

  // ---------- A-B repeat (#42): one key cycles like VLC: set A → set B (the loop starts) → off ----------
  property var ab: ({ a: null, b: null })
  function abCycle() {
    if (!it) return;
    const now = curTime();
    if (ab.a === null || ab.b !== null) { if (ab.b !== null) return abClear(); ab = { a: now, b: null }; osd(qsTr("A-B repeat: A set at %1").arg(fmt(now))); }
    else if (now <= ab.a + 0.3) osd(qsTr("Point B must come after point A"));
    else { ab = { a: ab.a, b: now }; seekTo(ab.a); osd(qsTr("A-B repeat: %1 – %2").arg(fmt(ab.a)).arg(fmt(ab.b))); }
  }
  function abSet(which) {
    if (!it) return;
    const now = curTime();
    if (which === "a") ab = { a: now, b: ab.b !== null && ab.b <= now + 0.3 ? null : ab.b };
    else { const a = ab.a === null ? 0 : ab.a; if (now <= a + 0.3) return osd(qsTr("Point B must come after point A")); ab = { a: a, b: now }; seekTo(a); }
    osd(ab.b !== null ? qsTr("A-B repeat: %1 – %2").arg(fmt(ab.a)).arg(fmt(ab.b)) : qsTr("A-B repeat: A set at %1").arg(fmt(ab.a)));
  }
  function abClear(quiet) { const was = ab.a !== null; ab = { a: null, b: null }; if (was && !quiet) osd(qsTr("A-B repeat off")); }
  property Timer abLoop: Timer { interval: 50; repeat: true; running: pb.ab.b !== null && pb.player.playing
    onTriggered: if (pb.curTime() >= pb.ab.b) pb.seekTo(pb.ab.a) }

  // ---------- snapshot (Shift+S): the picture on screen, into Pictures (or Settings → Video → Snapshot folder) ----------
  function snapshot() {
    if (!Store.pro) return ctl.pro("extras");   // (#53: Pro)
    if (!it || it.type === "audio") return osd(qsTr("Nothing to take a snapshot of"));
    const dir = Settings.values.snapshotDir || library.snapshotsDir();
    library.makeDir(dir);
    const ext = Settings.values.snapshotFormat === "jpg" ? "jpg" : "png";
    const base = it.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_");
    const file = dir + "/" + base + " " + fmt(curTime()).replace(/:/g, "-") + "." + ext;
    osd(player.snapshot(file) ? qsTr("Snapshot saved") : qsTr("Snapshot failed"));
  }

  // ---------- audio track ----------
  function cycleAudio() {
    const t = player.audioTracks().filter(x => x.id >= 0); if (t.length < 2) return osd(qsTr("Only one audio track"));
    const i = t.findIndex(x => x.id === player.audioTrack()), n = t[(i + 1) % t.length];
    player.setAudioTrack(n.id); osd(qsTr("Audio: %1").arg(n.name));
  }
  // #55 #58: the sound against the picture, in 10 ms steps (the effect itself comes with the audio settings, phase 6)
  function nudgeAudio(d) { const v = Math.max(-1000, Math.min(1000, (Settings.values.audioDelay || 0) + d)); Settings.set("audioDelay", v); osd(qsTr("Audio delay %1 ms").arg((v > 0 ? "+" : "") + v)); }

  // ---------- keyboard: actions with changeable keys (Settings → Controls, #37) ----------
  readonly property var actions: [
    ["playPause", "Play / pause", ["Space", "k", "MediaPlayPause"], () => togglePlay()],
    ["stop", "Stop", ["s", "MediaStop"], () => { if (it) { stop(); osd(qsTr("Stopped")); } }],
    ["next", "Next", ["n", ">", "MediaTrackNext"], () => step(1)],
    ["prev", "Previous", ["p", "<", "MediaTrackPrevious"], () => prev()],
    ["fastHold", "Hold for 2× speed", ["Shift+Space"], () => {}],
    ["seekFwd", "Seek forward", ["ArrowRight"], () => jumpBy(Settings.values.jump, "+" + Settings.values.jump + " s")],
    ["seekBack", "Seek backward", ["ArrowLeft"], () => jumpBy(-Settings.values.jump, "−" + Settings.values.jump + " s")],
    ["seekFwdShort", "Seek 3 s forward", ["Shift+ArrowRight"], () => jumpBy(3, "+3 s")],
    ["seekBackShort", "Seek 3 s backward", ["Shift+ArrowLeft"], () => jumpBy(-3, "−3 s")],
    // #70: bigger jumps for long videos
    ["seekFwdMin", "Seek 1 min forward", ["Ctrl+ArrowRight"], () => jumpBy(60, "+1 min")],
    ["seekBackMin", "Seek 1 min backward", ["Ctrl+ArrowLeft"], () => jumpBy(-60, "−1 min")],
    ["seekFwd5Min", "Seek 5 min forward", ["Alt+ArrowRight"], () => jumpBy(300, "+5 min")],
    ["seekBack5Min", "Seek 5 min backward", ["Alt+ArrowLeft"], () => jumpBy(-300, "−5 min")],
    ["volUp", "Volume up", ["ArrowUp"], () => { player.muted = false; setVol(volume + 0.05); volOsd(); }],
    ["volDown", "Volume down", ["ArrowDown"], () => { setVol(volume - 0.05); volOsd(); }],
    ["mute", "Mute", ["m"], () => toggleMute()],
    ["fullscreen", "Fullscreen", ["f"], () => ctl.toggleFs()],
    ["library", "Library / player", ["l"], () => ctl.toggleLibrary()],
    ["queue", "Show / hide queue", ["q"], () => ctl.toggleQueue()],
    ["lyrics", "Show lyrics", ["y"], () => ctl.sb.toggleLyrics()],
    ["subs", "Cycle subtitle track", ["v"], () => ctl.sb.cycle()],
    ["audio", "Cycle audio track", ["b"], () => cycleAudio()],
    ["subMinus", "Subtitle delay −", ["g"], () => ctl.sb.nudge(-0.1)],
    ["subPlus", "Subtitle delay +", ["h"], () => ctl.sb.nudge(0.1)],
    ["snapshot", "Snapshot", ["S"], () => snapshot()],
    ["record", "Record", ["r", "R"], () => ctl.en.toggleRecord()],
    ["slower", "Slower", ["["], () => setSpeed(speed - 0.25)],
    ["faster", "Faster", ["]"], () => setSpeed(speed + 0.25)],
    ["normalSpeed", "Normal speed", ["="], () => setSpeed(1)],
    ["frameNext", "Next frame", ["."], () => frameStep(1)],
    ["framePrev", "Previous frame", [","], () => frameStep(-1)],
    ["nextChapter", "Next chapter / bookmark", ["N"], () => jumpMark(1)],
    ["prevChapter", "Previous chapter / bookmark", ["P"], () => jumpMark(-1)],
    ["bookmark", "Add bookmark", ["Ctrl+b"], () => addBookmark()],
    ["abRepeat", "A-B repeat (set A, set B, off)", ["a"], () => abCycle()],
    ["bookmarks", "Chapters and bookmarks", ["Ctrl+B"], () => {}],
    ["dvdMenu", "DVD menu", ["M"], () => ctl.en.showDvdMenu()],
    ["audioEarlier", "Audio delay − (sound earlier)", ["j"], () => nudgeAudio(-10)],
    ["audioLater", "Audio delay + (sound later)", ["J"], () => nudgeAudio(10)]
  ]
  // Give one action new keys (taken away from any other action that had them); [] removes its keys.
  function setKeys(id, list) {
    const c = Object.assign({}, Settings.values.keys || {});
    for (const k of list) for (const a of actions) if (a[0] !== id && keysFor(a[0]).indexOf(k) >= 0) c[a[0]] = keysFor(a[0]).filter(x => x !== k);
    c[id] = list; Settings.set("keys", c);
  }
  function keysFor(id) { const c = Settings.values.keys || {}; const a = actions.find(x => x[0] === id); return c[id] || (a ? a[2] : []); }
  readonly property var keyMap: { const m = {}; Settings.values.keys; for (const a of actions) for (const k of keysFor(a[0])) if (!(k in m)) m[k] = a[0]; return m; }
  property real lastMedia: 0
  function runAction(id, media) {
    if (media) { const now = Date.now(); if (now - lastMedia < 350) return; lastMedia = now; }   // a media key can arrive twice
    const a = actions.find(x => x[0] === id); if (a) a[3]();
  }
  // a key press (KeyFilter): true when it was used
  function key(name, repeat, code) {
    const act = keyMap[name];
    if (act === "fastHold") { if (!repeat) fastStart(code); return true; }
    if (act) { runAction(act, /^Media/.test(name)); return true; }
    if (/^[0-9]$/.test(name) && it && curDur()) { seekTo(curDur() * (+name / 10)); return true; }
    return false;
  }
  function keyUp(code) { if (fast && fastKey === code) fastEnd(); }
}
