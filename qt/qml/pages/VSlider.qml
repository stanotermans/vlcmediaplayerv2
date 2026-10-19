// An upright equalizer slider: value on top, the track, the band's name below (v2.x .eqv)
import QtQuick
import VLCR

Column {
  id: root
  property string label: ""
  property real min: -20
  property real max: 20
  property real step: 0.1
  property real value: 0
  readonly property string searchLabel: label
  signal moved(real v)
  spacing: 6
  readonly property real p: (value - min) / (max - min)
  readonly property real c: (0 - min) / (max - min)
  function setValue(v) { v = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min)); moved(Number(v.toFixed(2))); }
  T { anchors.horizontalCenter: parent.horizontalCenter; px: 11; color: Theme.muted; text: root.value.toFixed(1) }
  Item {
    width: root.width; height: root.height - 44
    Rectangle {
      id: track
      anchors.horizontalCenter: parent.horizontalCenter
      width: 20; height: parent.height; radius: 6; color: Theme.track
      Rectangle {
        x: 2; width: parent.width - 4; radius: 0; color: Theme.accentDark
        readonly property real a: Math.min(root.p, root.c)
        readonly property real b: Math.max(root.p, root.c)
        y: 2 + (parent.height - 4) * (1 - b); height: (parent.height - 4) * (b - a)
      }
    }
    Rectangle { anchors.horizontalCenter: parent.horizontalCenter; y: 2 + (track.height - 4) * (1 - root.p) - height / 2; width: 24; height: 8; radius: 4; color: Theme.accent }
    MouseArea {
      anchors.fill: parent; cursorShape: Qt.PointingHandCursor
      function at(y) { root.setValue(root.min + (1 - Math.min(1, Math.max(0, (y - 2) / (height - 4)))) * (root.max - root.min)); }
      onPressed: m => at(m.y)
      onPositionChanged: m => { if (pressed) at(m.y); }
      onDoubleClicked: root.moved(0)
      onWheel: w => root.setValue(root.value + (w.angleDelta.y > 0 ? 0.5 : -0.5))
    }
  }
  T { anchors.horizontalCenter: parent.horizontalCenter; px: 11; color: Theme.muted; text: qsTr(root.label) }
}
