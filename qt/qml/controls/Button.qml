// .btn: 7px 16px, rounded; kind "primary" (accent, bold) or "ghost" (no background until hovered)
import QtQuick
import VLCR

Rectangle {
  id: root
  property string text: ""
  property string kind: ""           // "", "primary", "ghost"
  property string icon: ""
  signal clicked()
  readonly property bool hovered: area.containsMouse
  implicitWidth: row.implicitWidth + 32
  implicitHeight: 32
  radius: Theme.radius
  color: kind === "primary" ? (hovered ? Theme.accent2 : Theme.accent) : kind === "ghost" ? (hovered ? Theme.panel2 : "transparent") : hovered ? Theme.panel3 : Theme.panel2
  border.width: 1
  border.color: kind === "primary" ? Theme.accent : kind === "ghost" ? "transparent" : Theme.line
  activeFocusOnTab: true
  Accessible.role: Accessible.Button
  Accessible.name: text
  Keys.onPressed: e => { if (e.key === Qt.Key_Return || e.key === Qt.Key_Space) { root.clicked(); e.accepted = true; } }
  Row {
    id: row
    anchors.centerIn: parent
    spacing: 6
    Icon { visible: root.icon !== ""; name: root.icon; width: 15; height: 15; anchors.verticalCenter: parent.verticalCenter
           color: label.color }
    T { id: label; text: root.text; anchors.verticalCenter: parent.verticalCenter
        color: root.kind === "primary" ? Theme.accentText : root.kind === "ghost" ? Theme.text2 : Theme.text
        font.weight: root.kind === "" ? Font.Normal : Font.DemiBold }
  }
  MouseArea { id: area; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.clicked() }
  Rectangle { anchors.fill: parent; anchors.margins: -3; radius: root.radius + 3; color: "transparent"; border.width: 2; border.color: Theme.accent; visible: root.activeFocus }
}
