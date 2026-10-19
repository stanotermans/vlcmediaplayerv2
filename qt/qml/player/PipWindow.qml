// Picture-in-picture: the video in a small window that stays on top of other windows (v2.x used Chromium's PiP).
// Drag it anywhere, resize it at the corner; on hover: play/pause, back to the app, close.
import QtQuick
import QtQuick.Window
import QtMultimedia
import VLCR

Window {
  id: pip
  property var ctl: null
  property alias video: video
  width: 400; height: 225
  minimumWidth: 200; minimumHeight: 112
  flags: Qt.Window | Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
  color: "#000000"
  title: ctl.current ? ctl.current.name : "VLC Redesign"
  VideoOutput { id: video; anchors.fill: parent }
  MouseArea {
    id: area
    anchors.fill: parent; hoverEnabled: true
    onPressed: pip.startSystemMove()
    onDoubleClicked: { pip.close(); pip.ctl.raiseMain(); }
  }
  Rectangle {
    anchors.fill: parent; color: "#55000000"; opacity: area.containsMouse || bar.hovered ? 1 : 0
    Behavior on opacity { NumberAnimation { duration: 150 } }
    Row {
      id: bar
      property bool hovered: b1.hovered || b2.hovered || b3.hovered
      anchors.centerIn: parent; spacing: 10
      IconButton { id: b1; width: 40; height: 40; iconSize: 22; name: pip.ctl.player.playing ? "pause" : "play"; onClicked: pip.ctl.pb.togglePlay() }
      IconButton { id: b2; width: 40; height: 40; iconSize: 22; name: "pip"; tip: qsTr("Back to the app"); onClicked: { pip.close(); pip.ctl.raiseMain(); } }
      IconButton { id: b3; width: 40; height: 40; iconSize: 22; name: "x"; tip: qsTr("Close"); onClicked: pip.close() }
    }
  }
  MouseArea { anchors { right: parent.right; bottom: parent.bottom } width: 16; height: 16; cursorShape: Qt.SizeFDiagCursor
              onPressed: pip.startSystemResize(Qt.RightEdge | Qt.BottomEdge) }
  // keep the picture's shape
  Connections { target: pip.ctl.player; function onVideoSizeChanged() { const s = pip.ctl.player.videoSize; if (s.width > 0) pip.height = Math.round(pip.width * s.height / s.width); } }
}
