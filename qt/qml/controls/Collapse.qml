// .collapse: a folded group of extra settings ("Expand settings" ▸ / "Collapse settings" ▾)
import QtQuick
import VLCR

Rectangle {
  id: root
  property bool open: false
  property string onLabel: "Collapse settings"
  property string offLabel: "Expand settings"
  default property alias rows: body.data
  width: parent ? parent.width : 400
  height: head.height + (open ? body.height + 10 : 0)
  radius: 8; color: Theme.alpha(Theme.panel2, 0.5)
  clip: true
  Item {
    id: head
    width: parent.width; height: 40
    T { x: 12; anchors.verticalCenter: parent.verticalCenter; text: qsTr(root.open ? root.onLabel : root.offLabel); color: Theme.muted }
    Icon { anchors { right: parent.right; rightMargin: 12; verticalCenter: parent.verticalCenter } name: "chevron"; color: Theme.muted
           rotation: root.open ? 90 : 0; Behavior on rotation { NumberAnimation { duration: 150 } } }
    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.open = !root.open }
  }
  Column { id: body; x: 12; y: head.height; width: root.width - 24; visible: root.open }
}
