// .ibtn: 30×30, rounded, muted icon; on hover a panel2 background and the text colour; .on: accent
import QtQuick
import VLCR

Rectangle {
  id: root
  property string name: ""
  property string html: ""
  property bool on: false
  property bool hovered: area.containsMouse
  property int iconSize: 16
  property color iconColor: "transparent"   // (set: the icon's colour, e.g. white over a video)
  property string tip: ""
  signal clicked()
  implicitWidth: 30; implicitHeight: 30
  radius: Theme.radius
  color: hovered ? Theme.panel2 : "transparent"
  activeFocusOnTab: true
  Accessible.role: Accessible.Button
  Accessible.name: tip
  Keys.onPressed: e => { if (e.key === Qt.Key_Return || e.key === Qt.Key_Space) { root.clicked(); e.accepted = true; } }
  Icon { anchors.centerIn: parent; width: root.iconSize; height: root.iconSize; name: root.name; html: root.html
         color: root.on ? Theme.accent : root.iconColor.a > 0 ? root.iconColor : root.hovered ? Theme.text : Theme.muted }
  MouseArea { id: area; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.clicked() }
  Rectangle { anchors.fill: parent; anchors.margins: -2; radius: root.radius + 2; color: "transparent"; border.width: 2; border.color: Theme.accent; visible: root.activeFocus }
}
