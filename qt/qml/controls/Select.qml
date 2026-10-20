// .sel: a choice in a text-field-like box with a down arrow; the list opens as a v2.x menu with a check at the
// current choice. Bound to a setting (path) or used with value / picked().
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR

Rectangle {
  id: root
  property var options: []           // [[value, label], …]
  property string path: ""
  property var value: path !== "" ? (Settings.values && Settings.get(path)) : undefined
  signal picked(var value)
  readonly property var current: options.find(o => String(o[0]) === String(value))
  implicitWidth: 220; implicitHeight: 32
  radius: Theme.radius; color: Theme.track
  border.width: 1; border.color: list.visible || activeFocus ? Theme.accent : Theme.line
  activeFocusOnTab: true
  Accessible.role: Accessible.ComboBox; Accessible.name: current ? current[1] : ""
  Keys.onPressed: e => { if (e.key === Qt.Key_Space || e.key === Qt.Key_Return || e.key === Qt.Key_Down) { list.open(); e.accepted = true; } }
  T { anchors { left: parent.left; right: arrow.left; leftMargin: 10; rightMargin: 6; verticalCenter: parent.verticalCenter }
      text: root.current ? qsTr(root.current[1]) : "" }
  Icon { id: arrow; anchors { right: parent.right; rightMargin: 9; verticalCenter: parent.verticalCenter } width: 12; height: 12
         name: "chevron"; rotation: 90; color: Theme.muted }
  MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: list.visible ? list.close() : list.open() }

  C.Popup {
    id: list
    y: root.height + 4; width: Math.max(root.width, 200)
    padding: 6
    background: MenuBackground {}
    contentItem: ListView {
      implicitHeight: Math.min(contentHeight, 320); clip: true
      model: root.options
      delegate: MenuItem {
        required property var modelData
        width: ListView.view.width
        label: modelData[1]; checked: String(modelData[0]) === String(root.value)
        onActivated: { if (root.path !== "") Settings.set(root.path, modelData[0]); else root.value = modelData[0]; root.picked(modelData[0]); list.close(); }
      }
    }
  }
}
