// #controls: previous, play/pause, next, time, the timeline, length, mute, volume (bar, or a cone like classic VLC),
// audio, subtitles, settings and library/player. Buttons switched off in Settings → Interface → Player controls
// hide (#10); their keys keep working.
import QtQuick
import QtQuick.Shapes
import VLCR

Rectangle {
  id: root
  property var ctl: null
  readonly property var pb: ctl.pb
  readonly property var player: ctl.player
  readonly property var c: Settings.values.ctl || {}
  height: 52; color: Theme.bg
  Rectangle { anchors { left: parent.left; right: parent.right; top: parent.top } height: 1; color: Theme.edge }
  Row {
    id: leftCtl
    anchors { left: parent.left; leftMargin: 10; verticalCenter: parent.verticalCenter }
    spacing: 6
    IconButton { html: "prevBtn"; visible: root.c.prevnext !== false; tip: qsTr("Previous (P)"); onClicked: root.pb.prev() }
    Rectangle {   // #playBtn: 46×26, accent, rounded 5
      visible: root.c.play !== false
      width: 46; height: 26; radius: 5; anchors.verticalCenter: parent.verticalCenter
      color: pa.containsMouse ? Theme.accent2 : Theme.accent
      Accessible.role: Accessible.Button; Accessible.name: root.player.playing ? qsTr("Pause (Space)") : qsTr("Play (Space)")
      Icon { anchors.centerIn: parent; width: 14; height: 14; name: root.player.playing ? "pause_fill" : "play_fill"; filled: true; color: Theme.accentText }
      MouseArea { id: pa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.pb.togglePlay() }
    }
    IconButton { html: "nextBtn"; visible: root.c.prevnext !== false; tip: qsTr("Next (N)"); onClicked: root.pb.step(1) }
    T { visible: root.c.time !== false; width: 70; horizontalAlignment: Text.AlignHCenter; anchors.verticalCenter: parent.verticalCenter
        text: root.pb.fmt(root.player.time / 1000); color: Theme.muted; px: 12; font.features: { "tnum": 1 } }
  }
  Row {
    id: rightCtl
    anchors { right: parent.right; rightMargin: 10; verticalCenter: parent.verticalCenter }
    spacing: 6
    T {   // #69: a click switches between the length and the time left ("-00:53"), like VLC; the choice is kept
      visible: root.c.time !== false; width: 70; horizontalAlignment: Text.AlignHCenter; anchors.verticalCenter: parent.verticalCenter
      text: Settings.values.showRemaining ? "-" + root.pb.fmt(Math.max(0, root.pb.curDur() - root.player.time / 1000)) : root.pb.fmt(root.pb.curDur())
      color: tm.containsMouse ? Theme.text : Theme.muted; px: 12; font.features: { "tnum": 1 }
      MouseArea { id: tm; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                  onClicked: Settings.set("showRemaining", !Settings.values.showRemaining) }
    }
    IconButton { visible: root.c.volume !== false; tip: qsTr("Mute (M)"); onClicked: root.pb.toggleMute()
                 name: root.player.muted || root.pb.volume === 0 ? "vol_mute" : root.pb.volume > 0.5 ? "vol_high" : "vol_low" }
    Item {   // #vol: 90×18 bar, or a 24px cone
      id: vol
      visible: root.c.volume !== false
      readonly property bool cone: Settings.values.volShape === "cone"
      width: 90; height: cone ? 24 : 18; anchors.verticalCenter: parent.verticalCenter
      Rectangle { visible: !vol.cone; anchors.fill: parent; radius: 4; color: Theme.track; clip: true
        Rectangle { width: parent.width * root.pb.volume; height: parent.height; radius: 4; opacity: root.player.muted ? 0.35 : 1
          gradient: Gradient { orientation: Gradient.Horizontal; GradientStop { position: 0; color: Theme.vol1 } GradientStop { position: 1; color: Theme.vol2 } } } }
      Shape {   // the cone: narrow on the left, full height on the right
        visible: vol.cone; anchors.fill: parent
        preferredRendererType: Shape.CurveRenderer
        ShapePath { strokeWidth: -1; fillColor: Theme.track
          PathPolyline { path: [Qt.point(0, 24 * 0.38), Qt.point(90, 0), Qt.point(90, 24), Qt.point(0, 24 * 0.62), Qt.point(0, 24 * 0.38)] } }
      }
      Item { visible: vol.cone; width: parent.width * root.pb.volume; height: parent.height; clip: true; opacity: root.player.muted ? 0.35 : 1
        Shape { width: 90; height: 24; preferredRendererType: Shape.CurveRenderer
          ShapePath { strokeWidth: -1
            fillGradient: LinearGradient { x1: 0; x2: 90; GradientStop { position: 0; color: Theme.vol1 } GradientStop { position: 1; color: Theme.vol2 } }
            PathPolyline { path: [Qt.point(0, 24 * 0.38), Qt.point(90, 0), Qt.point(90, 24), Qt.point(0, 24 * 0.62), Qt.point(0, 24 * 0.38)] } } } }
      MouseArea {
        anchors.fill: parent; cursorShape: Qt.PointingHandCursor
        function at(x) { return Math.min(1, Math.max(0, x / width)); }
        onPressed: m => { root.player.muted = false; root.pb.setVol(at(m.x)); }
        onPositionChanged: m => { if (pressed) root.pb.setVol(at(m.x)); }
        onReleased: root.pb.volOsd()
        onWheel: w => { root.player.muted = false; root.pb.setVol(root.pb.volume + (w.angleDelta.y > 0 ? 0.05 : -0.05)); root.pb.volOsd(); }
      }
    }
    Rectangle { visible: root.c.audio !== false || root.c.subs !== false; width: 1; height: 18; color: Theme.line; anchors.verticalCenter: parent.verticalCenter }
    IconButton { html: "eqBtn"; visible: root.c.audio !== false; tip: qsTr("Audio"); onClicked: root.ctl.quick.toggle("audio") }
    IconButton { id: subBtn; html: "subBtn"; visible: root.c.subs !== false; tip: qsTr("Subtitles")
                 onClicked: root.ctl.quick.toggle("subs") }
    IconButton { html: "setBtn"; visible: root.c.settings !== false; tip: qsTr("Settings"); onClicked: root.ctl.quick.toggle() }
    IconButton { html: "listBtn"; visible: root.c.library !== false; tip: qsTr("Library / player (L)"); onClicked: root.ctl.toggleLibrary() }
  }
  function testHover(f) { seek.testHover(f); }
  SeekBar {
    id: seek
    ctl: root.ctl
    anchors { left: leftCtl.right; right: rightCtl.left; leftMargin: 6; rightMargin: 6; verticalCenter: parent.verticalCenter }
  }
}
