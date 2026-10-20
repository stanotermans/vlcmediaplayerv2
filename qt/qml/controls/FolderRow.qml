// A folder setting: the path (read-only), Browse and Open (v2.x panels.js folderRow)
import QtQuick
import QtQuick.Dialogs
import VLCR

SettingRow {
  id: root
  property string path: ""
  property string fallback: ""
  property var ctl: null
  readonly property string folder: (Settings.values && Settings.get(path)) || fallback
  Row {
    spacing: 6
    TextField { width: 260; text: root.folder; input.readOnly: true; input.color: Theme.muted }
    Button { text: qsTr("Browse"); kind: "ghost"; onClicked: dlg.open() }
    Button { text: qsTr("Open"); kind: "ghost"; onClicked: root.ctl.library.openPath(root.folder) }
  }
  FolderDialog { id: dlg; title: qsTr(root.label); onAccepted: Settings.set(root.path, root.ctl.library.toLocal(selectedFolder)) }
}
