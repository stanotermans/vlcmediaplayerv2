// "Open network stream" (panels.js openNetwork): one or more URLs and an optional playlist name. finished({ urls,
// name }) or null. (VLC's "Play another media synchronously" follows with the player in phase 3.)
import QtQuick
import VLCR

DialogBox {
  id: dlg
  title: "Open network stream"
  maxWidth: 560
  buttons: [{ label: "Cancel", value: null }, { label: "Open", primary: true, value: () => ({ urls: urls.text, name: name.text }) }]
  Column {
    width: parent.width; spacing: 6
    T { text: qsTr("Network URL"); font.weight: Font.DemiBold; color: Theme.text }
    T { text: qsTr("You can enter multiple links, one per line."); px: 12; color: Theme.muted }
    Rectangle {   // .txt.area, 5 rows
      width: parent.width; height: 110; radius: Theme.radius; color: Theme.track
      border.width: 1; border.color: urls.activeFocus ? Theme.accent : Theme.line
      Flickable {
        id: fl
        anchors { fill: parent; margins: 8 }
        contentHeight: urls.contentHeight; clip: true
        TextEdit {
          id: urls
          width: fl.width; wrapMode: TextEdit.WrapAnywhere
          font.family: Theme.font; font.pixelSize: Theme.fontSize; color: Theme.text
          selectionColor: Theme.accentSoft; selectedTextColor: Theme.text; selectByMouse: true
          T { visible: !urls.text; text: qsTr("e.g. https://www.example.com/stream.m3u8"); color: Theme.dim }
        }
      }
    }
    Item { width: 1; height: 8 }
    Row { spacing: 4
      T { text: qsTr("Playlist name"); font.weight: Font.DemiBold; color: Theme.text }
      T { text: qsTr("(optional)"); color: Theme.muted } }
    T { text: qsTr("The playlist will be saved and shown with this name."); px: 12; color: Theme.muted }
    TextField { id: name; width: parent.width; placeholder: "e.g. Favorite TV channels" }
  }
  onOpened: urls.forceActiveFocus()
}
