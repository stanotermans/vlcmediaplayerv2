// .frow: a setting's label (with an optional ⓘ) on the left and its control on the right, at least 42px high.
// A click on ⓘ (or Enter / Space) opens the explanation in a panel under the row (#56); again or Escape closes it.
import QtQuick
import VLCR

Column {
  id: root
  property string label: ""
  property string info: ""
  default property alias control: holder.data
  property bool infoOpen: false
  width: parent ? parent.width : 400
  Item {
    width: root.width
    height: Math.max(42, holder.childrenRect.height + 8, lbl.implicitHeight + 8)
    Row {
      anchors.verticalCenter: parent.verticalCenter
      spacing: 8
      T { id: lbl; text: qsTr(root.label); color: Theme.text2; anchors.verticalCenter: parent.verticalCenter; width: Math.min(implicitWidth, root.width - holder.childrenRect.width - 40) }
      Item {
        id: infoBtn
        visible: root.info !== ""
        width: 15; height: 15; anchors.verticalCenter: parent.verticalCenter
        activeFocusOnTab: visible
        Accessible.role: Accessible.Button; Accessible.name: qsTr("More information")
        Keys.onPressed: e => { if (e.key === Qt.Key_Return || e.key === Qt.Key_Space || (e.key === Qt.Key_Escape && root.infoOpen)) { root.infoOpen = !root.infoOpen; e.accepted = true; } }
        Icon { anchors.fill: parent; name: "info"; color: root.infoOpen || ia.containsMouse ? Theme.accent : Theme.dim }
        MouseArea { id: ia; anchors.fill: parent; anchors.margins: -3; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.infoOpen = !root.infoOpen }
        Rectangle { anchors.fill: parent; anchors.margins: -2; radius: width; color: "transparent"; border.width: 2; border.color: Theme.accent; visible: infoBtn.activeFocus }
      }
    }
    Item { id: holder; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; width: childrenRect.width; height: childrenRect.height }
  }
  Rectangle {   // .frow-note
    visible: root.infoOpen
    width: root.width; height: visible ? note.implicitHeight + 20 : 0
    radius: Theme.radius; color: Theme.panel2; border.width: 1; border.color: Theme.line
    T { id: note; x: 12; y: 10; width: parent.width - 24; text: qsTr(root.info); wrapMode: Text.Wrap; elide: Text.ElideNone
        px: 12.5; lineHeight: 1.5; color: Theme.text }
  }
  Item { width: 1; height: root.infoOpen ? 8 : 0 }
}
