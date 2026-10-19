// #updateBanner: a newer version (found by the automatic check at start): install / download it, or later
import QtQuick
import VLCR

Rectangle {
  id: root
  property bool shown: false
  readonly property var u: System.update
  readonly property var info: u.info || {}
  readonly property bool busy: u.state === "downloading"
  function label() { return info.mode === "install" ? qsTr("Install update") : info.mode === "download" ? qsTr("Download update") : qsTr("Open download page"); }
  visible: shown && !!info.latest
  width: Math.min(560, row.implicitWidth + 28); height: row.implicitHeight + 24
  radius: 10; color: Theme.panel; border.width: 1; border.color: Theme.line
  Rectangle { width: 3; height: parent.height - 2; y: 1; x: 1; radius: 2; color: Theme.accent }
  Row {
    id: row
    x: 14; anchors.verticalCenter: parent.verticalCenter; spacing: 12
    Icon { width: 22; height: 22; name: "download"; color: Theme.accent; anchors.verticalCenter: parent.verticalCenter }
    Column { anchors.verticalCenter: parent.verticalCenter
      T { text: qsTr("Update available: %1").arg("v" + root.info.latest); font.weight: Font.DemiBold; color: Theme.text }
      T { px: 12; color: Theme.muted
          text: root.busy ? qsTr("Downloading update… %1%").arg(Math.round((root.u.progress || 0) * 100)) : root.u.state === "installing" ? qsTr("The update is being installed. The app will restart.")
              : root.u.state === "downloaded" ? qsTr("The update has been downloaded.") : root.u.state === "error" ? qsTr("Could not check for updates.") : qsTr("You are using v%1.").arg(root.info.current) } }
    Rectangle { visible: root.busy; width: 120; height: 6; radius: 3; color: Theme.track; anchors.verticalCenter: parent.verticalCenter
      Rectangle { height: 6; radius: 3; color: Theme.accent; width: parent.width * (root.u.progress || 0) } }
    Button { visible: !root.busy && root.u.state === "available"; text: root.label(); kind: "primary"; anchors.verticalCenter: parent.verticalCenter; onClicked: System.installUpdate() }
    Button { visible: !root.busy; text: qsTr("Later"); kind: "ghost"; anchors.verticalCenter: parent.verticalCenter; onClicked: root.shown = false }
  }
}
