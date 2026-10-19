// .txt: a text field on the track colour, accent border when focused; bound to a setting (saved on Enter / leaving)
import QtQuick
import VLCR

Rectangle {
  id: root
  property string path: ""
  property string placeholder: ""
  property alias text: input.text
  property alias input: input
  property int iconLeft: 0            // room for an icon on the left (search fields)
  signal accepted()
  implicitWidth: 220; implicitHeight: 32
  radius: Theme.radius; color: Theme.track
  border.width: 1; border.color: input.activeFocus ? Theme.accent : Theme.line
  Component.onCompleted: if (path !== "") input.text = Settings.get(path) ?? ""
  Connections { target: Settings; enabled: root.path !== ""; function onChanged(p) { if (p === root.path && !input.activeFocus) input.text = Settings.get(root.path) ?? ""; } }
  TextInput {
    id: input
    anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter; leftMargin: 10 + root.iconLeft; rightMargin: 10 }
    font.family: Theme.font; font.pixelSize: Theme.fontSize; color: Theme.text
    selectionColor: Theme.accentSoft; selectedTextColor: Theme.text
    selectByMouse: true; clip: true
    renderType: Text.NativeRendering
    onEditingFinished: if (root.path !== "") Settings.set(root.path, text)
    onAccepted: root.accepted()
    Accessible.role: Accessible.EditableText; Accessible.name: root.placeholder
    T { text: qsTr(root.placeholder); color: Theme.dim; visible: !input.text && !input.preeditText; anchors.verticalCenter: parent.verticalCenter }
  }
}
