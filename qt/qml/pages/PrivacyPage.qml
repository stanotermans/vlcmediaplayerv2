// Settings → Privacy (v2.x panels.js "privacy")
import QtQuick
import VLCR

Column {
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "History"
    SettingRow { label: "Remember recently played"; info: "When off, nothing you played is kept after a restart: no recent list, no watched marks and no files you only opened."
                 Toggle { path: "rememberRecent" } }
    SettingRow { label: "Remember playback position"; Toggle { path: "resume" } }
    SettingRow { label: "Clear recent items"
                 Button { text: qsTr("Clear"); kind: "ghost"; onClicked: ctl.confirm("Clear recent?", "The list of recently played media will be emptied.", "Clear", () => ctl.library.clearRecent()) } }
    SettingRow { label: "Clear playback positions"
                 Button { text: qsTr("Clear"); kind: "ghost"; onClicked: ctl.confirm("Clear positions?", "All saved playback positions and watched marks will be cleared.", "Clear", () => ctl.library.clearPositions()) } }
    SettingRow { label: "Clear thumbnail cache"
                 Button { text: qsTr("Clear"); kind: "ghost"; onClicked: { ctl.library.clearThumbs(); ctl.osd(qsTr("Thumbnail cache cleared")); } } }
    SettingRow { label: "Clear network history"
                 Button { text: qsTr("Clear"); kind: "ghost"; onClicked: { Settings.set("networkHistory", []); ctl.osd(qsTr("Network history cleared")); } } }
  }
  Section {
    title: "Data"
    last: true
    Note { text: qsTr("VLC does not collect any data. Everything is stored locally on this computer.") }
  }
}
