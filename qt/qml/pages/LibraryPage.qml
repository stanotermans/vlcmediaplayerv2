// Settings → Library: the media folders (v2.x panels.js "library")
import QtQuick
import QtQuick.Dialogs
import VLCR

Column {
  id: page
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Media folders"
    last: true
    Column {   // .folderlist
      readonly property string searchLabel: "Media folders"
      width: parent.width; spacing: 4; topPadding: 6; bottomPadding: 6
      Repeater {
        model: Settings.values.mediaFolders || []
        Rectangle {   // .folderitem
          required property string modelData
          width: parent.width; height: 36; radius: Theme.radius; color: Theme.track
          Row { x: 8; anchors.verticalCenter: parent.verticalCenter; spacing: 10; width: parent.width - 90
            Icon { name: "folder"; color: Theme.text2; anchors.verticalCenter: parent.verticalCenter }
            T { text: modelData; color: Theme.text2; width: parent.width - 30; elide: Text.ElideMiddle; anchors.verticalCenter: parent.verticalCenter } }
          Row { anchors { right: parent.right; rightMargin: 4; verticalCenter: parent.verticalCenter }
            IconButton { name: "open"; tip: qsTr("Open"); onClicked: page.ctl.library.openPath(modelData) }
            IconButton { name: "trash"; tip: qsTr("Remove")
                         onClicked: page.ctl.confirm("Remove folder?", modelData + "\n\n" + qsTr("The files themselves will not be deleted."), "Remove", () => page.ctl.removeFolder(modelData)) } }
        }
      }
      Note { visible: !(Settings.values.mediaFolders || []).length && SettingsSearch.q === ""
             text: qsTr("No media folders yet. Add a folder to see your videos and music in the library automatically.") }
    }
    Row { spacing: 8; topPadding: 10; bottomPadding: 10; visible: SettingsSearch.q === ""
      Button { text: qsTr("Add folder"); kind: "primary"; onClicked: dlg.open() }
      Button { text: qsTr("Rescan"); kind: "ghost"; onClicked: page.ctl.library.scanFolders(Settings.values.mediaFolders || []) } }
    FolderDialog { id: dlg; title: qsTr("Choose media folder"); onAccepted: page.ctl.addFolder(page.ctl.library.toLocal(selectedFolder)) }
  }
}
