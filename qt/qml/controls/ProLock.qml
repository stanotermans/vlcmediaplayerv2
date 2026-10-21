// Vela Player Pro (#53): in the store version without Pro, this card stands where a Pro part would be (give that part
// visible: Store.pro), with a button to the Pro screen. Without a store (the desktop) Store.pro is always true.
import QtQuick
import VLCR

Rectangle {
  id: root
  property var ctl: null
  property string what: ""            // "eq", "video", "theme", "extras": shown first on the Pro screen
  property string text: qsTr("Part of Vela Player Pro")
  visible: !Store.pro
  width: parent ? parent.width : 300
  height: row.implicitHeight + 20
  radius: Theme.radius; color: Theme.panel2; border.width: 1; border.color: Theme.line
  MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.ctl.pro(root.what) }
  Row {
    id: row
    anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; leftMargin: 12; rightMargin: 12 }
    spacing: 10
    Rectangle { width: pl.implicitWidth + 14; height: 22; radius: 11; color: Theme.accent; anchors.verticalCenter: parent.verticalCenter
      T { id: pl; anchors.centerIn: parent; text: "PRO"; px: 11; font.weight: Font.Bold; color: Theme.accentText } }
    T { text: root.text; color: Theme.text; width: parent.width - 34 - pl.implicitWidth - ub.width - 20; wrapMode: Text.Wrap; anchors.verticalCenter: parent.verticalCenter }
    Button { id: ub; compact: true; kind: "primary"; anchors.verticalCenter: parent.verticalCenter
             text: Store.price ? qsTr("Unlock for %1").arg(Store.price) : qsTr("Unlock"); onClicked: root.ctl.pro(root.what) }
  }
}
