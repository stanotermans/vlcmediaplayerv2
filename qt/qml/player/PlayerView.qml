// #player: the stage with the floor and the pixel cat (nothing playing), the video, music with its cover on a
// blurred copy of it, the play/pause flash, the spinner and the 2× badge. A click plays/pauses (after a short wait,
// so a double click only goes fullscreen, #32), holding the button plays at 2× (#46), the wheel sets the volume.
import QtQuick
import QtQuick.Effects
import QtQuick.Shapes
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
  property alias pixelCat: pixelCat   // testing
  clip: true

  // ---------- #78: 360° video: drag to look around, the wheel zooms (VLC's own default view: 80°) ----------
  property var force360: null          // the menu's choice for this file (null: the file says it)
  readonly property bool on360: showVideo && (force360 !== null ? force360 : ctl.player.projection === 1)
  property real yaw: 0                 // degrees
  property real pitch: 0
  property real fov: 80
  function reset360() {
    const p = ctl.player.pose || [];
    yaw = p[0] || 0; pitch = p[1] || 0; fov = p[2] > 0 ? Math.max(30, Math.min(120, p[2])) : 80;
  }
  function look360(dx, dy) {           // a drag of dx, dy pixels: the picture follows the mouse
    const k = fov / Math.max(1, height);
    yaw = ((yaw - dx * k) % 360 + 540) % 360 - 180;
    pitch = Math.max(-90, Math.min(90, pitch + dy * k));
  }
  function zoom360(steps) { fov = Math.max(30, Math.min(120, fov - steps * 5)); }
  onItChanged: { force360 = null; reset360(); }
  Connections { target: root.ctl.player; function onProjectionChanged() { root.reset360(); } }
  onOn360Changed: if (on360 && force360 === null) ctl.osd(qsTr("360° video: drag to look around"))

  Rectangle {   // .floor
    visible: !root.showVideo && !root.abOn && !root.ctl.sb.lyricsOn
    anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
    height: parent.height * 0.27; color: Theme.floor
  }
  Item {   // the picture in its real shape (pixel aspect applied), fitted, filled or stretched (Video → Aspect ratio),
            // cropped, zoomed, rotated and mirrored, with the video filters (Video → Filters) on the graphics card
    id: stage
    anchors.fill: parent
    visible: root.showVideo
    clip: true
    readonly property var vf: Settings.values.vf || {}
    readonly property var crop: vf.crop || { t: 0, b: 0, l: 0, r: 0 }
    readonly property size full: root.ctl.player.videoSize
    readonly property real sx: root.ctl.player.frameSize.width > 0 ? full.width / root.ctl.player.frameSize.width : 1   // crop is in the picture's pixels
    readonly property real cw: Math.max(1, full.width - (crop.l + crop.r) * sx)
    readonly property real ch: Math.max(1, full.height - crop.t - crop.b)
    readonly property real ar: full.width > 0 ? cw / ch : 16 / 9
    readonly property string mode: Settings.values.aspect || ""
    readonly property bool wide: width / height > ar
    // the box the visible (cropped) part fills
    readonly property real bw: mode === "stretch" ? width : (wide !== (mode === "fill")) ? height * ar : width
    readonly property real bh: mode === "stretch" ? height : (wide !== (mode === "fill")) ? height : width / ar
    Item {
      id: box
      anchors.centerIn: parent
      width: stage.bw; height: stage.bh
      clip: stage.crop.t || stage.crop.b || stage.crop.l || stage.crop.r
      rotation: stage.vf.rotate || 0
      transform: Scale { origin.x: box.width / 2; origin.y: box.height / 2; xScale: (stage.vf.zoom || 1) * (stage.vf.mirror ? -1 : 1); yScale: stage.vf.zoom || 1 }
      VideoOutput {
        id: video
        fillMode: VideoOutput.Stretch
        width: box.width * (stage.full.width > 0 ? stage.full.width / stage.cw : 1)
        height: box.height * (stage.full.height > 0 ? stage.full.height / stage.ch : 1)
        x: -stage.crop.l * stage.sx * box.width / stage.cw
        y: -stage.crop.t * box.height / stage.ch
        readonly property bool filtered: stage.vf.brightness !== 100 || stage.vf.contrast !== 100 || stage.vf.saturate !== 100 || !!stage.vf.hue || !!stage.vf.sepia
                                         || !!stage.vf.gray || !!stage.vf.negate || !!stage.vf.posterize || (stage.vf.gamma ?? 1) !== 1 || !!stage.vf.sharpen || !!stage.vf.grain
        layer.enabled: filtered
        layer.effect: ShaderEffect {
          readonly property real brightness: (stage.vf.brightness ?? 100) / 100
          readonly property real contrast: (stage.vf.contrast ?? 100) / 100
          readonly property real saturate: (stage.vf.saturate ?? 100) / 100
          readonly property real hue: (stage.vf.hue || 0) * Math.PI / 180
          readonly property real sepia: (stage.vf.sepia || 0) / 100
          readonly property real gray: stage.vf.gray ? 1 : 0
          readonly property real negate: stage.vf.negate ? 1 : 0
          readonly property real posterize: stage.vf.posterize ? 1 : 0
          readonly property real gamma: stage.vf.gamma ?? 1
          readonly property real sharpen: stage.vf.sharpen || 0
          readonly property real grain: stage.vf.grain || 0
          property real time: 0
          readonly property size texel: Qt.size(1 / Math.max(1, width), 1 / Math.max(1, height))
          NumberAnimation on time { running: (stage.vf.grain || 0) > 0 && root.ctl.player.playing; from: 0; to: 100; duration: 100000; loops: Animation.Infinite }
          fragmentShader: "qrc:/shaders/videofx.frag.qsb"
        }
        // DVD menus: the mouse moves the highlight, a click presses the button under it
        MouseArea {
          anchors.fill: parent
          enabled: root.ctl.en.dvdMenu
          hoverEnabled: enabled
          onPositionChanged: m => root.ctl.en.dvdMouse(video, m.x, m.y, false)
          onClicked: m => root.ctl.en.dvdMouse(video, m.x, m.y, true)
        }
      }
    }
    ShaderEffectSource {   // #78: the whole picture (at its own size) for the 360° view
      id: src360
      sourceItem: root.on360 ? video : null
      hideSource: root.on360
      visible: false
      wrapMode: ShaderEffectSource.Repeat
      textureSize: Qt.size(Math.min(4096, root.ctl.player.frameSize.width), Math.min(4096, root.ctl.player.frameSize.height))
    }
    ShaderEffect {
      anchors.fill: parent
      visible: root.on360
      readonly property var source: src360
      readonly property real yaw: root.yaw * Math.PI / 180
      readonly property real pitch: root.pitch * Math.PI / 180
      readonly property real fov: root.fov * Math.PI / 180
      readonly property real aspect: width / Math.max(1, height)
      fragmentShader: "qrc:/shaders/view360.frag.qsb"
    }
  }

  Rectangle {   // #rec: REC and the time while recording
    visible: root.ctl.player.recording
    x: 12; y: 12; z: 5
    width: recRow.implicitWidth + 18; height: 24; radius: 12; color: "#bb000000"
    property int secs: 0
    Timer { running: parent.visible; interval: 500; repeat: true; triggeredOnStart: true; onTriggered: parent.secs = Math.floor((Date.now() - root.ctl.en.recStart) / 1000) }
    Row { id: recRow; anchors.centerIn: parent; spacing: 6
      Rectangle { width: 9; height: 9; radius: 5; color: "#e5393a"; anchors.verticalCenter: parent.verticalCenter
        SequentialAnimation on opacity { running: root.ctl.player.recording; loops: Animation.Infinite
          PropertyAction { value: 1 } PauseAnimation { duration: 500 } PropertyAction { value: 0.2 } PauseAnimation { duration: 500 } } }
      T { px: 12; color: "#ffffff"; font.features: { "tnum": 1 }; anchors.verticalCenter: parent.verticalCenter
          text: "REC " + String(Math.floor(parent.parent.secs / 60)).padStart(2, "0") + ":" + String(parent.parent.secs % 60).padStart(2, "0") } }
  }

  // #audioBg (Settings → Interface → Music background, like v2.x): blur = the cover blurred, gradient = two colours
  // of the cover (a dark default without one, also for blur), black; dimmed. "stage" keeps the normal stage.
  readonly property string abMode: Settings.values.audioBg || "blur"
  readonly property bool abOn: audio && abMode !== "stage"
  readonly property var abColors: abOn && abMode === "gradient" && art !== "" ? root.ctl.library.coverColors(art) : []
  Item {
    anchors.fill: parent
    visible: root.abOn
    Shape {   // CSS linear-gradient(135deg, …): the line runs corner to corner through the middle
      id: abGrad
      anchors.fill: parent
      visible: root.abMode !== "black" && !(root.abMode === "blur" && root.art !== "")
      readonly property real d: (width + height) / 4
      ShapePath {
        strokeWidth: -1
        fillGradient: LinearGradient {
          x1: abGrad.width / 2 - abGrad.d; y1: abGrad.height / 2 - abGrad.d; x2: abGrad.width / 2 + abGrad.d; y2: abGrad.height / 2 + abGrad.d
          GradientStop { position: 0; color: root.abColors.length ? root.abColors[0] : "#3a3a46" }
          GradientStop { position: 1; color: root.abColors.length ? root.abColors[1] : "#121214" }
        }
        PathRectangle { width: abGrad.width; height: abGrad.height }
      }
    }
    Image { id: abArt; anchors.fill: parent; source: root.abMode === "blur" ? root.art : ""; fillMode: Image.PreserveAspectCrop; visible: false; sourceSize.width: 320 }
    MultiEffect { anchors.fill: parent; autoPaddingEnabled: false; source: abArt; blurEnabled: true; blur: 1; blurMax: 64; saturation: 0.3; visible: root.abMode === "blur" && root.art !== "" }
    Rectangle { anchors.fill: parent; color: "#000000"; opacity: root.abMode === "black" ? 1 : (Settings.values.audioBgDim ?? 65) / 100 }
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
      id: pixelCat
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
    cursorShape: root.ctl.cursorHidden ? Qt.BlankCursor : root.on360 ? (pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor) : Qt.ArrowCursor
    property bool skipClick: false
    property point last
    property bool dragged: false
    onPressed: m => { last = Qt.point(m.x, m.y); dragged = false; if (m.button === Qt.LeftButton) hold.restart(); }
    onPositionChanged: m => {   // #78: dragging a 360° video looks around (and is no click or 2× hold)
      if (!root.on360 || !(m.buttons & Qt.LeftButton)) return;
      const dx = m.x - last.x, dy = m.y - last.y;
      if (!dragged && Math.abs(dx) + Math.abs(dy) < 4) return;
      if (!dragged) { dragged = true; hold.stop(); skipClick = true; }
      root.look360(dx, dy); last = Qt.point(m.x, m.y);
    }
    onReleased: { hold.stop(); if (root.ctl.pb.fast && root.ctl.pb.fastKey === 0) root.ctl.pb.fastEnd(); }
    onCanceled: { hold.stop(); if (root.ctl.pb.fast && root.ctl.pb.fastKey === 0) root.ctl.pb.fastEnd(); }
    onClicked: m => {
      if (m.button === Qt.RightButton) { const p = mapToItem(null, m.x, m.y); root.ctl.menu(root.ctl.playerMenu(), p.x, p.y); return; }
      if (skipClick) { skipClick = false; return; }
      if (root.ctl.en.dvdMenu) return;            // the menu's buttons take the clicks
      click.restart();
    }
    onDoubleClicked: { click.stop(); if ((Settings.values.dblclick || "fullscreen") === "fullscreen") root.ctl.toggleFs(); else root.ctl.pb.togglePlay(); }
    onWheel: w => {
      if (root.on360) return root.zoom360(w.angleDelta.y / 120);   // #78: zoom in and out of a 360° video
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
