// Settings → Recording (v2.x panels.js "recording")
import QtQuick
import VLCR

Column {
  id: page
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Recording"
    last: true
    FolderRow { label: "Recording folder"; path: "recDir"; fallback: page.ctl.library.videosDir(); ctl: page.ctl }
    SettingRow { label: "Include audio"; Toggle { path: "recAudio" } }
    Note { text: qsTr("Press R (or Shift+R) during playback to record.") }
  }
}
