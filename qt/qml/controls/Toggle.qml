// .tgl: the v2.x switch. 66×30 on the track colour; OFF: grey knob left, "OFF" right; ON: accent knob right, "ON" on
// the dark accent left. Bound to a setting (path) or used with checked / toggled().
import QtQuick
import VLCR

Rectangle {
  id: root
  property string path: ""
  // #68: "Settings.values &&" (not a comma): the QML compiler dropped the unused read of values, so the control did not
  // follow the setting (the same in Select, Slider, Segmented, Swatches, ColorField, FolderRow)
  property bool checked: path !== "" ? (Settings.values && !!Settings.get(path)) : false
  signal toggled(bool on)
  implicitWidth: 66; implicitHeight: 30
  radius: 7
  color: Theme.track
  border.width: 1; border.color: Theme.line
  activeFocusOnTab: true
  Accessible.role: Accessible.CheckBox
  Accessible.checked: checked
  function flip() { const v = !checked; if (path !== "") Settings.set(path, v); else checked = v; toggled(v); }
  Keys.onPressed: e => { if (e.key === Qt.Key_Space || e.key === Qt.Key_Return) { flip(); e.accepted = true; } }

  Rectangle {   // "ON" behind the label when on
    x: 3; y: 3; width: root.width - 6 - 24 - 3; height: 22; radius: 4
    color: Theme.accentDark; opacity: root.checked ? 1 : 0
    Behavior on opacity { NumberAnimation { duration: 150 } }
  }
  T {
    x: root.checked ? 3 : 3 + 24; width: root.width - 6 - 24 - (root.checked ? 3 : 0); height: root.height
    horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter
    text: root.checked ? "ON" : "OFF"; px: 11; font.letterSpacing: 0.33
    color: root.checked ? Theme.accent : Theme.muted
  }
  Rectangle {   // knob
    y: 3; width: 24; height: 22; radius: 4
    x: root.checked ? root.width - 3 - 1 - width + 1 : 3
    color: root.checked ? Theme.accent : "#444444"
    Behavior on x { NumberAnimation { duration: 150; easing.type: Easing.OutCubic } }
    Behavior on color { ColorAnimation { duration: 150 } }
  }
  MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.flip() }
  Rectangle { anchors.fill: parent; anchors.margins: -3; radius: root.radius + 3; color: "transparent"; border.width: 2; border.color: Theme.accent; visible: root.activeFocus }
}
