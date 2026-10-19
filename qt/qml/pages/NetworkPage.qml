// Settings → Network: open a stream, and the streams opened before (v2.x panels.js "network")
import QtQuick
import VLCR

Column {
  id: page
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Streams"
    last: true
    SettingRow { label: "Open network stream"; Button { text: qsTr("Open…"); kind: "ghost"; onClicked: { page.ctl.closeSettings(); page.ctl.doAct("url"); } } }
    Column {   // .histlist
      readonly property string searchLabel: "Streams"
      width: parent.width; spacing: 4; topPadding: 6; bottomPadding: 6
      Repeater {
        model: Settings.values.networkHistory || []
        Rectangle {
          required property string modelData
          width: parent.width; height: 36; radius: Theme.radius; color: Theme.track
          Row { x: 8; anchors.verticalCenter: parent.verticalCenter; spacing: 10; width: parent.width - 50
            Icon { name: "link"; color: Theme.text2; anchors.verticalCenter: parent.verticalCenter }
            T { text: modelData; color: Theme.text2; width: parent.width - 30; elide: Text.ElideMiddle; anchors.verticalCenter: parent.verticalCenter } }
          IconButton { anchors { right: parent.right; rightMargin: 4; verticalCenter: parent.verticalCenter } name: "play"; tip: qsTr("Play"); onClicked: page.ctl.addSources([modelData]) }
        }
      }
      Note { visible: !(Settings.values.networkHistory || []).length && SettingsSearch.q === ""; text: qsTr("No streams opened yet.") }
    }
  }
}
