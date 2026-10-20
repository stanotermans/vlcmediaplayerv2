// .swatches: colour squares on the track colour; the chosen one has a ring in its own colour
import QtQuick
import VLCR

Rectangle {
  id: root
  property var colors: []
  property string path: ""
  readonly property string value: path !== "" ? String((Settings.values && Settings.get(path))).toLowerCase() : ""
  implicitWidth: row.implicitWidth + 10; implicitHeight: 36
  radius: 7; color: Theme.track
  Row {
    id: row
    x: 5; anchors.verticalCenter: parent.verticalCenter; spacing: 6
    Repeater {
      model: root.colors
      Item {
        required property string modelData
        width: 26; height: 26
        Rectangle { anchors.fill: parent; anchors.margins: -4; radius: 6; color: "transparent"; border.width: 2
                    border.color: root.value === modelData.toLowerCase() ? modelData : "transparent" }
        Rectangle { anchors.fill: parent; radius: 4; color: modelData }
        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Settings.set(root.path, modelData) }
        Accessible.role: Accessible.RadioButton; Accessible.name: modelData; Accessible.checked: root.value === modelData.toLowerCase()
      }
    }
  }
}
