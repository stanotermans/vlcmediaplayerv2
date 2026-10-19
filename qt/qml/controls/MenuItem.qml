// .mitem: icon (or a check), label, key or submenu arrow; hover: panel2 and the text colour
import QtQuick
import VLCR

Rectangle {
  id: root
  property string label: ""
  property string icon: ""
  property bool checked: false
  property bool accent: false
  property bool danger: false
  property bool disabled: false
  property string kbd: ""
  property bool hasSub: false
  property bool highlighted: area.containsMouse
  signal activated()
  signal hovered()
  implicitHeight: 34
  radius: 6
  color: highlighted && !disabled ? Theme.panel2 : "transparent"
  opacity: disabled ? 0.4 : 1
  Accessible.role: Accessible.MenuItem; Accessible.name: label; Accessible.checked: checked
  Row {
    anchors { left: parent.left; right: parent.right; leftMargin: 10; rightMargin: 10; verticalCenter: parent.verticalCenter }
    spacing: 12
    Item {
      width: 18; height: 16; anchors.verticalCenter: parent.verticalCenter
      Icon { anchors.centerIn: parent; name: root.checked ? "check" : root.icon; visible: root.checked || root.icon !== ""
             color: root.accent ? Theme.accent : Theme.muted }
    }
    T { id: lbl; text: qsTr(root.label); anchors.verticalCenter: parent.verticalCenter; elide: Text.ElideNone
        width: parent.width - 18 - 24 - (kb.visible ? kb.implicitWidth : 14)
        color: root.danger ? Theme.danger : root.highlighted ? Theme.text : Theme.text2 }
    T { id: kb; visible: !root.hasSub && root.kbd !== ""; text: qsTr(root.kbd); px: 12; color: Theme.dim; anchors.verticalCenter: parent.verticalCenter }
    Icon { visible: root.hasSub; name: "chevron"; width: 14; height: 14; color: Theme.dim; anchors.verticalCenter: parent.verticalCenter }
  }
  MouseArea { id: area; anchors.fill: parent; hoverEnabled: true; enabled: !root.disabled
              onClicked: root.activated(); onEntered: root.hovered() }
}
