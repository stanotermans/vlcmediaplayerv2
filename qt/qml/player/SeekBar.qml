// #seek: the timeline. 18px track, the played part in the dark accent, a 6×20 accent handle; chapter starts as gaps,
// bookmarks as pins, the A-B loop as an outlined zone. Hovering shows the time (and chapter / bookmark name), or a
// preview card with the frame there (#43: after a short rest, so fast sweeps never pop it up).
import QtQuick
import VLCR

Item {
  id: root
  property var ctl: null
  readonly property var pb: ctl.pb
  readonly property real dur: pb.curDur()
  readonly property real now: ctl.player.time / 1000
  property bool dragging: false
  property real dragF: 0
  readonly property real f: dragging ? dragF : dur > 0 ? Math.min(1, Math.max(0, now / dur)) : 0
  implicitHeight: 22
  function testHover(f) { preview.move(f); preview.shown = true; preview.update(); }   // testing

  Rectangle {   // #seekTrack
    id: track
    anchors.verticalCenter: parent.verticalCenter
    width: parent.width; height: 18; radius: 4; color: Theme.track
    Rectangle { width: parent.width * root.f; height: parent.height; radius: 4; color: Theme.accentDark }   // #seekFill
    Repeater {   // chapter starts
      model: root.dur ? root.pb.chapters().filter(c => c.start > 0.5 && c.start < root.dur - 0.5) : []
      Rectangle { required property var modelData; x: track.width * modelData.start / root.dur - 1.5; width: 3; height: track.height; color: Theme.bg }
    }
    Rectangle {   // .abzone
      visible: root.pb.ab.a !== null && root.dur > 0
      readonly property real xa: root.dur ? track.width * root.pb.ab.a / root.dur : 0
      x: xa; y: -3; height: track.height + 6
      width: root.pb.ab.b !== null ? Math.max(4, track.width * root.pb.ab.b / root.dur - xa) : 6
      radius: 5; border.width: 2; border.color: Theme.accent
      color: root.pb.ab.b !== null ? Theme.alpha(Theme.accent, 0.22) : "transparent"
    }
    Rectangle { x: track.width * root.f - 3; y: -1; width: 6; height: 20; radius: 3; color: Theme.accent }   // #seekHandle
    Repeater {   // bookmarks: small accent pins above the track
      model: root.dur ? root.pb.bookmarks() : []
      Rectangle { required property var modelData; x: track.width * modelData.t / root.dur - 4; y: -6; width: 8; height: 8; color: Theme.accent
                  radius: 4; border.width: 1.5; border.color: "#88000000"; rotation: -45
                  Rectangle { anchors { left: parent.left; bottom: parent.bottom } width: 4; height: 4; color: Theme.accent } }
    }
  }

  MouseArea {
    id: area
    anchors { fill: parent; topMargin: -12; bottomMargin: -8 }
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    readonly property real hf: Math.min(1, Math.max(0, mouseX / width))
    onPressed: m => { if (!root.dur) return; root.dragging = true; root.dragF = hf; }
    onPositionChanged: { if (root.dragging) root.dragF = hf; preview.move(hf); }
    onReleased: m => { if (!root.dragging) return; root.dragging = false; root.pb.seekTo(hf * root.dur); }
    onExited: if (!root.dragging) preview.leave()
    onContainsMouseChanged: if (containsMouse) preview.move(hf)
  }

  // the small time tooltip (#seekTip), when there is no preview card
  Rectangle {
    visible: area.containsMouse && root.dur > 0 && !preview.cardMode
    x: Math.max(0, Math.min(root.width - width, area.mouseX - width / 2)); y: -28 - height + 18
    width: tip.implicitWidth + 12; height: tip.implicitHeight + 4; radius: 4; color: "#000000"
    T { id: tip; anchors.centerIn: parent; px: 11; color: "#ffffff"
        text: { const at = area.hf * root.dur, lb = root.pb.markLabel(at); return lb ? lb + " · " + root.pb.fmt(at) : root.pb.fmt(at); } }
  }

  // #seekPreview: a card with the frame, the chapter / bookmark name and the time
  Item {
    id: preview
    readonly property var it: root.ctl.current
    readonly property bool audio: !!it && it.type === "audio"
    property bool cardMode: false
    property bool shown: false
    property real at: 0
    property real cx: 0
    property string img: ""
    property int stepNo: -1
    function move(hf) {
      // music has no picture (#27): only a card when there is a chapter or bookmark name, else just the tooltip (#41)
      cardMode = !!(Settings.values.seekPreview && it && root.dur && !(audio && !root.ctl.sb.hoverLines && !root.pb.markTimes().length));
      if (!cardMode) return leave();
      hideT.stop();
      at = hf * root.dur; cx = hf * root.width;
      if (!shown) { showT.interval = root.dragging ? 0 : 160; showT.restart(); return; }
      update();
    }
    function leave() { showT.stop(); hideT.restart(); }
    function update() {
      if (audio) return;
      if (it.remote) { img = ""; return; }
      // instant: the nearest storyboard frame; then the exact frame once the pointer slows down
      const len = Math.max(0.5, root.dur / 300), s = Math.round(at / len);
      if (s === stepNo) return;
      const near = root.ctl.frames.nearest(at); if (near) img = near;
      exactT.want = Math.min(root.dur, s * len); exactT.s = s; exactT.restart();
    }
    Timer { id: showT; onTriggered: { preview.shown = true; preview.update(); } }
    Timer { id: hideT; interval: 250; onTriggered: { preview.shown = false; preview.stepNo = -1; } }
    Timer { id: exactT; interval: 40; property real want: 0; property int s: -1
            onTriggered: { preview.stepNo = s; root.ctl.frames.frame(preview.it.src, want); } }
    Connections { target: root.ctl.frames; function onFrameReady(src, at, url) { if (preview.it && src === preview.it.src && preview.shown) preview.img = url; } }
    Connections { target: root.ctl; function onCurrentChanged() { preview.img = ""; preview.stepNo = -1; } }

    visible: shown
    z: 9
    width: 236; height: col.implicitHeight + 14
    x: Math.max(8 - root.mapToItem(null, 0, 0).x, Math.min(cx - width / 2, root.ctl.width - 8 - root.mapToItem(null, 0, 0).x - width))
    y: -34 - height + 22
    Repeater {   // box-shadow 0 14px 40px: a few soft layers
      model: 4
      Rectangle { required property int index; x: -4 * index; y: 6 + 3 * index; width: preview.width + 8 * index; height: preview.height + 4 * index
                  radius: 18 + 4 * index; color: "#000000"; opacity: Theme.light ? 0.04 : 0.12 }
    }
    Rectangle { id: cardBg; anchors.fill: parent; radius: 18; color: Theme.light ? "#f4f4f4" : "#191919" }
    Column {
      id: col
      x: 10; y: preview.audio ? 12 : 10; width: 216
      T {   // .pv-title: the chapter or bookmark name
        readonly property string label: (preview.audio && root.ctl.sb.lyricAt(preview.at)) || root.pb.markLabel(preview.at)
        visible: label !== ""; width: parent.width; horizontalAlignment: Text.AlignHCenter; bottomPadding: 7
        text: label; px: preview.audio ? 15 : 14; font.weight: Font.DemiBold; color: Theme.light ? "#222222" : "#e8e8e8"
      }
      Rectangle {
        visible: !preview.audio
        width: 216; height: 122; radius: 9; clip: true; color: "#000000"
        Rectangle { anchors.fill: parent; color: Theme.stage; visible: pvImg.status !== Image.Ready
          Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: parent.height * 0.32; color: Theme.floor }
          PixelCat { width: parent.height * 0.42 * 18 / 17; anchors.horizontalCenter: parent.horizontalCenter; y: parent.height * 0.68 - height } }
        Image { id: pvImg; anchors.fill: parent; source: preview.img; fillMode: Image.PreserveAspectFit; asynchronous: false; cache: true; smooth: true }
      }
      T { width: parent.width; horizontalAlignment: Text.AlignHCenter; topPadding: 6; bottomPadding: 4; px: 16; font.features: { "tnum": 1 }
          text: root.pb.fmt(preview.at); color: Theme.light ? "#555555" : "#a0a0a0" }
    }
  }
}
