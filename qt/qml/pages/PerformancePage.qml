// Settings → Performance (v2.x panels.js "performance"; converting with FFmpeg and Chromium's graphics settings are
// gone with Electron)
import QtQuick
import VLCR

Column {
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Library"
    last: true
    SettingRow { label: "Generate thumbnails"; Toggle { path: "thumbs" } }
  }
}
