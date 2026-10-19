// .colorbox: the hex value (editable) and a swatch that opens the system's colour picker
import QtQuick
import QtQuick.Dialogs
import VLCR

Rectangle {
  id: root
  property string path: ""
  readonly property string value: (Settings.values, String(Settings.get(path) || "#ffffff"))
  implicitWidth: 180; implicitHeight: 34
  radius: Theme.radius; color: Theme.track; border.width: 1; border.color: hex.activeFocus ? Theme.accent : Theme.line
  TextInput {
    id: hex
    anchors { left: parent.left; leftMargin: 10; verticalCenter: parent.verticalCenter } width: 100
    text: root.value.toUpperCase(); font.family: Theme.font; font.pixelSize: Theme.fontSize; font.features: { "tnum": 1 }
    color: Theme.text; selectByMouse: true; renderType: Text.NativeRendering
    onEditingFinished: { if (/^#[0-9a-f]{6}$/i.test(text)) Settings.set(root.path, text.toLowerCase()); else text = Qt.binding(() => root.value.toUpperCase()); }
  }
  Rectangle {
    anchors { right: parent.right; rightMargin: 4; verticalCenter: parent.verticalCenter }
    width: 28; height: 26; radius: 4; color: root.value; border.width: 1; border.color: "#33ffffff"
    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { picker.selectedColor = root.value; picker.open(); } }
  }
  ColorDialog { id: picker; onAccepted: Settings.set(root.path, String(selectedColor)) }
}
