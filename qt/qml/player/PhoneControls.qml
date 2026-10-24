// The player on a phone (#53): the controls over the picture and the gestures of a phone player.
//   tap: the controls (they go after 3.5 s while playing) · double tap on the left / right third: 10 s back / ahead,
//   in the middle: play / pause · swipe up or down on the left: brightness, on the right: volume · swipe sideways:
//   seek (shown while swiping, done when you let go) · pinch: fill the screen or fit the picture · the lock: no taps or
//   swipes until it is unlocked (a tap shows the lock button).
import QtQuick
import VLCR

Item {
  id: root
  property var ctl: null
  readonly property var pb: ctl.pb
  readonly property var player: ctl.player
  property bool shown: true
  property bool locked: false
  property real bright: 0.5          // (Android: the app's own brightness while the player is open)
  readonly property bool busy: gest.mode !== "" || seek.dragging
  // music: the controls stay, at the bottom (the cover and the lyrics above them), like a music app
  readonly property bool audio: !!ctl.current && ctl.current.type === "audio"

  function poke() { shown = true; hideT.restart(); }
  Timer { id: hideT; interval: 3500; onTriggered: if (root.player.playing && !root.busy && !root.audio) root.shown = false }
  onVisibleChanged: { if (visible) poke(); else { locked = false; System.setBrightness(-1); } }
  Connections { target: root.player; function onPlayingChanged() { if (!root.player.playing) root.shown = true; else hideT.restart(); } }

  // ---------- gestures ----------
  MouseArea {
    id: gest
    anchors.fill: parent
    enabled: !root.ctl.en.dvdMenu
    property point p0
    property string mode: ""          // "", "bright", "vol", "seek", "look"
    property real start: 0
    property real target: 0
    property real lastTap: 0
    property real tapX: 0
    onPressed: m => { p0 = Qt.point(m.x, m.y); mode = ""; }
    onPositionChanged: m => {
      if (root.locked) return;
      const dx = m.x - p0.x, dy = m.y - p0.y;
      if (mode === "") {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
        mode = root.ctl.playerView.on360 ? "look" : Math.abs(dx) > Math.abs(dy) ? "seek" : p0.x < width / 2 ? "bright" : "vol";
        start = mode === "bright" ? root.bright : mode === "vol" ? root.pb.volume : mode === "seek" ? root.pb.curTime() : 0;
        target = start;
      }
      if (mode === "look") { root.ctl.playerView.look360(dx - target, 0); target = dx; return; }
      if (mode === "seek") {
        const d = root.pb.curDur();
        target = Math.max(0, d ? Math.min(d, start + dx / width * 90) : start + dx / width * 90);
        const diff = Math.round(target - start);
        root.ctl.osd((diff >= 0 ? "+" : "−") + root.pb.fmt(Math.abs(diff)).replace(/^00:/, "") + "  ·  " + root.pb.fmt(target).replace(/^00:/, ""));
        return;
      }
      const v = Math.min(1, Math.max(0, start - dy / (height * 0.6)));
      if (mode === "bright") { root.bright = v; System.setBrightness(v); root.ctl.osd(qsTr("Brightness %1%").arg(Math.round(v * 100))); }
      else { root.player.muted = false; root.pb.setVol(v); root.pb.volOsd(); }
    }
    onReleased: m => {
      if (mode === "seek") root.pb.seekTo(target);
      if (mode !== "") { mode = ""; hideT.restart(); return; }
      const now = Date.now();
      if (!root.locked && now - lastTap < 300) {   // a double tap
        tapT.stop(); lastTap = 0;
        if (tapX < width / 3) root.pb.jumpBy(-10, "−10 s");
        else if (tapX > width * 2 / 3) root.pb.jumpBy(10, "+10 s");
        else root.pb.togglePlay();
        return;
      }
      lastTap = now; tapX = m.x; tapT.restart();
    }
    Timer { id: tapT; interval: 300; onTriggered: { if (root.locked) { lockHint.opacity = 1; lockT.restart(); } else if (root.shown && !root.audio) root.shown = false; else root.poke(); } }
  }
  PinchHandler {   // pinch out: fill the screen; in: the whole picture
    target: null
    enabled: !root.locked
    onActiveChanged: if (!active) {
      if (activeScale > 1.15 && (Settings.values.aspect || "") !== "fill") { Settings.set("aspect", "fill"); root.ctl.osd(qsTr("Fill")); }
      else if (activeScale < 0.87 && (Settings.values.aspect || "") !== "") { Settings.set("aspect", ""); root.ctl.osd(qsTr("Fit")); }
    }
  }

  // ---------- locked: only the lock button, for a moment after a tap ----------
  Rectangle {
    id: lockHint
    visible: root.locked && opacity > 0; opacity: 0
    x: 20; anchors.verticalCenter: parent.verticalCenter; width: 52; height: 52; radius: 26; color: "#99000000"
    Behavior on opacity { NumberAnimation { duration: 200 } }
    Icon { anchors.centerIn: parent; width: 24; height: 24; html: "lock"; color: "#ffffff" }
    MouseArea { anchors.fill: parent; onClicked: { root.locked = false; root.poke(); root.ctl.osd(qsTr("Unlocked")); } }
    Timer { id: lockT; interval: 2500; onTriggered: lockHint.opacity = 0 }
  }

  // ---------- the controls ----------
  Item {
    id: ui
    anchors.fill: parent
    opacity: root.shown && !root.locked ? 1 : 0; visible: opacity > 0
    Behavior on opacity { NumberAnimation { duration: 200 } }

    Rectangle {   // the top: back to the library, the name, the menu
      anchors { left: parent.left; right: parent.right; top: parent.top }
      height: root.ctl.safeTop + 56; color: "#99000000"
      Row {
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom; leftMargin: 4; rightMargin: 4 }
        height: 56
        IconButton { width: 48; height: 48; iconSize: 22; anchors.verticalCenter: parent.verticalCenter; name: "chevron"; rotation: 90; iconColor: "#ffffff"
                     tip: qsTr("Library"); onClicked: root.ctl.showBrowser() }
        T { width: parent.width - 96; anchors.verticalCenter: parent.verticalCenter; px: 15; color: "#ffffff"; text: root.ctl.current ? root.ctl.current.name : "" }
        IconButton { id: menuBtn; width: 48; height: 48; iconSize: 22; anchors.verticalCenter: parent.verticalCenter; html: "moreBtn"; iconColor: "#ffffff"; tip: qsTr("More")
                     onClicked: { const p = menuBtn.mapToItem(null, 0, menuBtn.height); root.ctl.menu(root.ctl.playerMenu(), p.x - 220, p.y); } }
      }
    }

    Row {   // the middle: lock, 10 s back, play / pause, 10 s ahead, picture-in-picture
      anchors { horizontalCenter: parent.horizontalCenter; verticalCenter: root.audio ? undefined : parent.verticalCenter
                bottom: root.audio ? bottomBar.top : undefined; bottomMargin: 20 }
      spacing: 18
      Repeater {
        model: [["lock", 48], ["replay", 56], ["play", 72], ["forward", 56], [Theme.mobile ? "" : "pip", 48]]
        Rectangle {
          required property var modelData
          visible: modelData[0] !== ""
          width: modelData[1]; height: width; radius: width / 2; anchors.verticalCenter: parent.verticalCenter
          color: modelData[0] === "play" ? Theme.accent : "#80000000"
          Icon { anchors.centerIn: parent; width: parent.width * 0.42; height: width; color: parent.modelData[0] === "play" ? "#1a1000" : "#ffffff"
                 readonly property string k: parent.modelData[0]
                 html: ["lock", "replay", "forward"].indexOf(k) >= 0 ? k : ""
                 name: k === "play" ? (root.player.playing ? "pause" : "play") : k }
          T { visible: parent.modelData[0] === "replay" || parent.modelData[0] === "forward"; anchors.centerIn: parent; anchors.verticalCenterOffset: 1
              text: "10"; px: 10; color: "#ffffff" }
          MouseArea {
            anchors.fill: parent
            onClicked: {
              const k = parent.modelData[0];
              if (k === "lock") { root.locked = true; root.ctl.osd(qsTr("Locked: tap, then the lock to unlock")); }
              else if (k === "replay") root.pb.jumpBy(-10, "−10 s");
              else if (k === "forward") root.pb.jumpBy(10, "+10 s");
              else if (k === "play") root.pb.togglePlay();
              else if (k === "pip") root.ctl.togglePip();
              root.poke();
            }
          }
        }
      }
    }

    Rectangle {   // the bottom: the times, the seek bar, subtitles, audio, speed, fit / fill
      id: bottomBar
      anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
      height: col.height + 16 + root.ctl.safeBottom; color: "#99000000"
      Column {
        id: col
        x: 16; y: 10; width: parent.width - 32; spacing: 6
        Item {
          width: parent.width; height: 16
          T { px: 12; color: "#dddddd"; text: root.pb.fmt(root.player.time / 1000) }
          T { anchors.right: parent.right; px: 12; color: "#dddddd"; text: root.pb.fmt(root.pb.curDur()) }
        }
        SeekBar { id: seek; ctl: root.ctl; width: parent.width }
        Row {
          width: parent.width
          Repeater {
            // (music: lyrics or the cover instead of fit / fill)
            model: [["subtitle", qsTr("Subtitles")], ["audio", qsTr("Audio")], ["speed", root.pb.speed + "×"],
                    root.audio ? ["lyrics", root.ctl.sb.lyricsOn ? qsTr("Cover") : qsTr("Lyrics")] : ["fit", (Settings.values.aspect || "") === "fill" ? qsTr("Fill") : qsTr("Fit")]]
            Item {
              id: cell
              required property var modelData
              width: parent.width / 4; height: 48
              Column { anchors.centerIn: parent; spacing: 3
                Icon { anchors.horizontalCenter: parent.horizontalCenter; width: 20; height: 20; html: cell.modelData[0] === "fit" ? "fit" : ""; color: "#ffffff"
                       name: cell.modelData[0] === "lyrics" ? (root.ctl.sb.lyricsOn ? "audio" : "subtitle") : cell.modelData[0] }
                T { anchors.horizontalCenter: parent.horizontalCenter; px: 11; color: "#dddddd"; text: cell.modelData[1] } }
              MouseArea {
                anchors.fill: parent
                onClicked: {
                  const k = cell.modelData[0], p = cell.mapToItem(null, 0, 0);
                  if (k === "subtitle") root.ctl.menu(root.ctl.subtitleMenu(), p.x, p.y - 260);
                  else if (k === "audio") { const a = root.ctl.playerMenu().find(e => e && e.icon === "audio"); if (a) root.ctl.menu(a.sub(), p.x, p.y - 220); }
                  else if (k === "lyrics") root.ctl.sb.toggleLyrics();
                  else if (k === "speed") { const s = [1, 1.25, 1.5, 2, 0.5, 0.75], i = s.indexOf(root.pb.speed); root.pb.setSpeed(s[(i + 1) % s.length]); }
                  else Settings.set("aspect", (Settings.values.aspect || "") === "fill" ? "" : "fill");
                  root.poke();
                }
              }
            }
          }
        }
      }
    }
  }
}
