// An upright equalizer slider (v2.x .vslider): a 22×220 track filled from the bottom, the band's name and the value in a
// small box below
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
  spacing: 8
  readonly property real p: (value - min) / (max - min)
  readonly property real c: (0 - min) / (max - min)
  function setValue(v) { v = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min)); moved(Number(v.toFixed(2))); }
  Item {
    width: root.width; height: 220
    Rectangle {
      id: track
      anchors.horizontalCenter: parent.horizontalCenter
      width: 22; height: parent.height; radius: 6; color: Theme.track
      Rectangle {
        x: 2; width: parent.width - 4; radius: 0; color: Theme.accentDark
        y: 2 + (parent.height - 4) * (1 - root.p); height: (parent.height - 4) * root.p
      }
    }
    Rectangle { anchors.horizontalCenter: parent.horizontalCenter; y: 2 + (track.height - 4) * (1 - root.p) - height / 2; width: 28; height: 8; radius: 4; color: Theme.accent; border.width: 1; border.color: "#44000000" }
    MouseArea {
      anchors.fill: parent; cursorShape: Qt.PointingHandCursor
      function at(y) { root.setValue(root.min + (1 - Math.min(1, Math.max(0, (y - 2) / (height - 4)))) * (root.max - root.min)); }
      onPressed: m => at(m.y)
      onPositionChanged: m => { if (pressed) at(m.y); }
      onDoubleClicked: root.moved(0)
      onWheel: w => root.setValue(root.value + (w.angleDelta.y > 0 ? 0.5 : -0.5))
    }
  }
  T { anchors.horizontalCenter: parent.horizontalCenter; px: 12; color: Theme.muted; text: qsTr(root.label) }
  Rectangle {   // .val
    anchors.horizontalCenter: parent.horizontalCenter
    width: vt.implicitWidth + 12; height: vt.implicitHeight + 8; radius: 5; color: Theme.track
    T { id: vt; anchors.centerIn: parent; px: 11; color: Theme.text2; text: root.value.toFixed(1) + " dB"; font.features: { "tnum": 1 } }
  }
}
