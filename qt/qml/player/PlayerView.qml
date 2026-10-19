// #player: the stage with the floor and the pixel cat (nothing playing), the video, music with its cover on a
// blurred copy of it, the play/pause flash, the spinner and the 2× badge. A click plays/pauses (after a short wait,
// so a double click only goes fullscreen, #32), holding the button plays at 2× (#46), the wheel sets the volume.
import QtQuick
import QtQuick.Effects
import QtMultimedia
import VLCR

Rectangle {
  id: root
  property var ctl: null
  property alias video: video
  readonly property var it: ctl.current
  readonly property bool audio: !!it && it.type === "audio"
  readonly property bool showVideo: !!it && !audio && ctl.player.videoSize.width > 0
  readonly property string art: audio ? (it.thumb || "") : ""
  readonly property bool hideCursor: false
  color: showVideo ? "#000000" : Theme.stage
  clip: true

  Rectangle {   // .floor
    visible: !root.showVideo && !(root.audio && root.art && Settings.values.audioBg !== "none") && !root.ctl.sb.lyricsOn
    anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
    height: parent.height * 0.27; color: Theme.floor
  }
  Item {   // the picture in its real shape (pixel aspect applied), fitted, filled or stretched (Video → Aspect ratio)
    anchors.fill: parent
    visible: root.showVideo
    clip: true
    readonly property real ar: root.ctl.player.videoSize.width > 0 ? root.ctl.player.videoSize.width / root.ctl.player.videoSize.height : 16 / 9
    readonly property string mode: Settings.values.aspect || ""
    readonly property bool wide: width / height > ar
    VideoOutput {
      id: video
      anchors.centerIn: parent
      fillMode: VideoOutput.Stretch
      width: parent.mode === "stretch" ? parent.width : (parent.wide !== (parent.mode === "fill")) ? parent.height * parent.ar : parent.width
      height: parent.mode === "stretch" ? parent.height : (parent.wide !== (parent.mode === "fill")) ? parent.height : parent.width / parent.ar
    }
  }

  Item {   // #audioBg: the cover, blurred, dimmed (Settings → Interface → Music background)
    anchors.fill: parent
    visible: root.audio && root.art !== "" && (Settings.values.audioBg || "blur") !== "none"
    Image { id: abArt; anchors.fill: parent; source: Settings.values.audioBg === "black" ? "" : root.art; fillMode: Image.PreserveAspectCrop; visible: false; sourceSize.width: 320 }
    MultiEffect { anchors.fill: parent; autoPaddingEnabled: false; source: abArt; blurEnabled: Settings.values.audioBg !== "cover"; blur: 1; blurMax: 64; saturation: 0.3; visible: Settings.values.audioBg !== "black" }
    Rectangle { anchors.fill: parent; color: "#000000"; opacity: Settings.values.audioBg === "black" ? 1 : (Settings.values.audioBgDim ?? 65) / 100 }
  }
  Item {   // #idle: the music's cover, or the pixel cat
    anchors.fill: parent
    visible: !root.showVideo && !root.ctl.sb.lyricsOn
    Rectangle {   // .np-cover
      visible: root.audio && root.art !== ""
      anchors.centerIn: parent
      width: Math.min(parent.width, parent.height) * (Settings.values.coverSize || 40) / 100; height: width; radius: 8; clip: true
      color: "transparent"
      Image { anchors.fill: parent; source: root.visible && root.audio ? root.art : ""; fillMode: Image.PreserveAspectCrop; sourceSize.width: 640 }
    }
    PixelCat {
      visible: !(root.audio && root.art !== "")
      clickable: true
      width: Math.min(parent.width * 0.32, 260)
      anchors { horizontalCenter: parent.horizontalCenter; verticalCenter: parent.verticalCenter; verticalCenterOffset: -height * 0.06 }
    }
  }

  // clicks on the picture (not on the cat): play/pause, double click fullscreen, hold for 2×, wheel volume
  MouseArea {
    id: area
    anchors.fill: parent
    z: -1
    acceptedButtons: Qt.LeftButton | Qt.RightButton
    hoverEnabled: true
    cursorShape: root.ctl.cursorHidden ? Qt.BlankCursor : Qt.ArrowCursor
    property bool skipClick: false
    onPressed: m => { if (m.button === Qt.LeftButton) hold.restart(); }
    onReleased: { hold.stop(); if (root.ctl.pb.fast && root.ctl.pb.fastKey === 0) root.ctl.pb.fastEnd(); }
    onCanceled: { hold.stop(); if (root.ctl.pb.fast && root.ctl.pb.fastKey === 0) root.ctl.pb.fastEnd(); }
    onClicked: m => {
      if (m.button === Qt.RightButton) { const p = mapToItem(null, m.x, m.y); root.ctl.menu(root.ctl.playerMenu(), p.x, p.y); return; }
      if (skipClick) { skipClick = false; return; }
      click.restart();
    }
    onDoubleClicked: { click.stop(); if ((Settings.values.dblclick || "fullscreen") === "fullscreen") root.ctl.toggleFs(); else root.ctl.pb.togglePlay(); }
    onWheel: w => {
      const mode = Settings.values.wheel || "volume";
      if (mode === "volume") { root.ctl.player.muted = false; root.ctl.pb.setVol(root.ctl.pb.volume + (w.angleDelta.y > 0 ? 0.05 : -0.05)); root.ctl.pb.volOsd(); }
      else if (mode === "seek") root.ctl.pb.seekTo(root.ctl.pb.curTime() + (w.angleDelta.y > 0 ? 5 : -5));
    }
    Timer { id: click; interval: 230; onTriggered: root.ctl.pb.togglePlay() }
    Timer { id: hold; interval: 450; onTriggered: { root.ctl.pb.fastStart(0); if (root.ctl.pb.fast) area.skipClick = true; } }
  }

  LyricsView { ctl: root.ctl; anchors.fill: parent }
  SubtitleView { ctl: root.ctl; anchors.fill: parent; visible: !root.ctl.sb.lyricsOn; text: root.ctl.sb.now }

  Item {   // #bigplay: the play/pause flash
    anchors.centerIn: parent
    width: 64; height: 64
    Rectangle {
      id: big
      anchors.fill: parent; radius: 32; color: "#aa000000"
      opacity: 0; scale: 0.8
      property bool paused: false
      Icon { anchors.centerIn: parent; width: 26; height: 26; name: big.paused ? "pause_fill" : "play_fill"; filled: true; color: "#ffffff" }
      states: State { name: "flash"; PropertyChanges { target: big; opacity: 1; scale: 1 } }
      transitions: Transition { NumberAnimation { properties: "opacity,scale"; duration: 250 } }
      Timer { id: flashT; interval: 350; onTriggered: big.state = "" }
    }
  }
  function flash(playing) { big.paused = !playing; big.state = "flash"; flashT.restart(); }

  Rectangle {   // #spinner
    id: spinner
    visible: root.ctl.player.loading && !!root.it
    anchors.centerIn: parent
    width: 44; height: 44; radius: 22; color: "transparent"; border.width: 3; border.color: "#22ffffff"
    Canvas {
      anchors.fill: parent
      onPaint: { const g = getContext("2d"); g.reset(); g.lineWidth = 3; g.strokeStyle = Theme.accent; g.beginPath(); g.arc(22, 22, 20.5, -Math.PI / 2, 0); g.stroke(); }
    }
    RotationAnimation on rotation { from: 0; to: 360; duration: 800; loops: Animation.Infinite; running: spinner.visible }
  }

  Rectangle {   // #fastBadge: 2× while held
    anchors.horizontalCenter: parent.horizontalCenter
    y: root.ctl.pb.fast ? 18 : 12; opacity: root.ctl.pb.fast ? 1 : 0
    Behavior on opacity { NumberAnimation { duration: 150 } }
    Behavior on y { NumberAnimation { duration: 150 } }
    width: fr.implicitWidth + 28; height: 32; radius: 16; color: "#aa000000"
    Row { id: fr; anchors.centerIn: parent; spacing: 6
      T { text: Math.max(2, root.ctl.pb.speed) + "×"; color: "#ffffff"; px: 15; font.weight: Font.Bold; anchors.verticalCenter: parent.verticalCenter }
      Icon { width: 18; height: 18; name: "fast"; filled: true; color: "#ffffff"; anchors.verticalCenter: parent.verticalCenter } }
  }
  T { anchors.centerIn: parent; anchors.verticalCenterOffset: 60; visible: root.ctl.player.error !== "" && !!root.it; text: root.ctl.player.error; color: "#ffffff" }
}
