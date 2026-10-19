// "New playlist" (panels.js newPlaylist): a name, a cover and files (choose them or drag them onto the drop zone).
// finished({ name, cover, files }) or null.
import QtQuick
import QtQuick.Dialogs
import VLCR

DialogBox {
  id: dlg
  property var library: null
  property string cover: ""
  property var files: []
  title: "New playlist"
  maxWidth: 560
  buttons: [{ label: "Cancel", value: null }, { label: "Save", primary: true, value: () => ({ name: name.text.trim() || qsTr("New playlist"), cover: dlg.cover, files: dlg.files }) }]
  function addFiles(list) { const add = dlg.library.expandMedia(list).filter(f => dlg.files.indexOf(f) < 0); dlg.files = dlg.files.concat(add); }
  Column {
    width: parent.width; spacing: 6
    T { text: qsTr("Playlist details"); font.weight: Font.DemiBold; color: Theme.text }
    Item {
      width: parent.width; height: 78
      Column {
        width: parent.width - 90; spacing: 8
        T { width: parent.width; text: qsTr("The playlist will be saved and shown with this name and cover."); px: 12; color: Theme.muted; wrapMode: Text.Wrap; elide: Text.ElideNone }
        TextField { id: name; width: parent.width; placeholder: "e.g. Favorite songs" }
      }
      Rectangle {   // .cover
        anchors.right: parent.right; width: 78; height: 78; radius: 8; color: Theme.track; clip: true
        border.width: 1; border.color: ca.containsMouse ? Theme.accent : Theme.line
        Image { anchors.fill: parent; source: dlg.cover; fillMode: Image.PreserveAspectCrop; visible: dlg.cover !== "" }
        Icon { visible: dlg.cover === ""; anchors.centerIn: parent; width: 20; height: 20; name: "plus"; color: Theme.muted }
        MouseArea { id: ca; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: coverDlg.open() }
      }
    }
    Item { width: 1; height: 8 }
    T { text: qsTr("Select files"); font.weight: Font.DemiBold; color: Theme.text }
    T { width: parent.width; text: qsTr("These files will be added to the playlist."); px: 12; color: Theme.muted }
    Rectangle {   // .dropzone
      width: parent.width; height: 90; radius: 8
      color: drop.containsDrag ? Theme.accentSoft : Theme.track
      border.width: 1; border.color: drop.containsDrag || za.containsMouse ? Theme.accent : Theme.line
      Column {
        anchors.centerIn: parent; spacing: 6
        T { anchors.horizontalCenter: parent.horizontalCenter; text: qsTr("Drag files here or click to choose them"); color: Theme.muted }
        Icon { anchors.horizontalCenter: parent.horizontalCenter; name: "plus"; color: Theme.muted }
      }
      MouseArea { id: za; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: filesDlg.open() }
      DropArea { id: drop; anchors.fill: parent; onDropped: d => { if (d.hasUrls) { dlg.addFiles(d.urls.map(u => dlg.library.toLocal(u))); d.accept(); } } }
    }
    Column {   // .droplist
      width: parent.width
      Repeater { model: dlg.files.slice(0, 8)
        T { required property var modelData; width: parent.width; text: modelData.split(/[\\/]/).pop(); px: 12; color: Theme.text2; topPadding: 3 } }
      T { visible: dlg.files.length > 8; text: qsTr("… and %1 more").arg(dlg.files.length - 8); px: 12; color: Theme.muted; topPadding: 3 }
    }
  }
  FileDialog { id: coverDlg; title: qsTr("Cover image"); nameFilters: [qsTr("Images") + " (*.png *.jpg *.jpeg *.webp *.gif)"]
               onAccepted: dlg.cover = dlg.library.readImage(selectedFile) }
  FileDialog { id: filesDlg; fileMode: FileDialog.OpenFiles; onAccepted: dlg.addFiles(selectedFiles.map(u => dlg.library.toLocal(u))) }
  onOpened: name.input.forceActiveFocus()
}
