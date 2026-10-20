// .seg: buttons in a track-coloured box; the chosen one on the dark accent with accent text
import QtQuick
import VLCR

Rectangle {
  id: root
  property var options: []           // [[value, label], …]
  property string path: ""
  property var value: path !== "" ? (Settings.values && Settings.get(path)) : undefined
  signal picked(var value)
  implicitWidth: row.implicitWidth + 8; implicitHeight: row.implicitHeight + 8
  radius: 7; color: Theme.track; border.width: 1; border.color: Theme.line
  Row {
    id: row
    x: 4; y: 4; spacing: 3
    Repeater {
      model: root.options
      Rectangle {
        required property var modelData
        readonly property bool on: String(root.value) === String(modelData[0])
        width: Math.max(90, lbl.implicitWidth + 44); height: 28; radius: 5
        color: on ? Theme.accentDark : "transparent"
        T { id: lbl; anchors.centerIn: parent; text: qsTr(modelData[1]); color: parent.on ? Theme.accent : Theme.muted }
        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor
          onClicked: { if (root.path !== "") Settings.set(root.path, modelData[0]); else root.value = modelData[0]; root.picked(modelData[0]); } }
        Accessible.role: Accessible.RadioButton; Accessible.name: modelData[1]; Accessible.checked: on
      }
    }
  }
}
