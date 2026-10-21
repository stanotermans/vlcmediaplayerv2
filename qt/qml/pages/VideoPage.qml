// Settings → Video (v2.x panels.js "video")
import QtQuick
import VLCR

Column {
  id: page
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Playback mode"
    SettingRow { label: "Default aspect ratio"; Select { path: "aspect"; options: [["", "Default"], ["fill", "Fill (crop)"], ["stretch", "Stretch"]] } }
  }
  Section {
    title: "Snapshots"
    SettingRow { label: "Format"; Select { path: "snapshotFormat"; options: [["png", "PNG"], ["jpg", "JPG"]] } }
    FolderRow { label: "Folder"; path: "snapshotDir"; fallback: page.ctl.library.snapshotsDir(); ctl: page.ctl }
  }
  Section {
    title: "Filters"
    last: true
    ProLock { ctl: page.ctl; what: "video"; text: qsTr("Video filters and 360° video are part of Vela Player Pro") }
    SettingRow { shown: Store.pro; label: "Sharp upscaling"; info: "Scales low-resolution videos up with a sharper method and sharpens the edges (AMD FidelityFX's RCAS)."
                 Toggle { path: "vf.upscale" } }
    Row { topPadding: 10; bottomPadding: 10; visible: SettingsSearch.q === ""
          Button { text: qsTr("Reset video filters"); kind: "ghost"; onClicked: { page.ctl.resetVideoFilters(); page.ctl.osd(qsTr("Video filters reset")); } } }
  }
}
