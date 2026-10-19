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
    Row { topPadding: 10; bottomPadding: 10; visible: SettingsSearch.q === ""
          Button { text: qsTr("Reset video filters"); kind: "ghost"; onClicked: { page.ctl.resetVideoFilters(); page.ctl.osd(qsTr("Video filters reset")); } } }
  }
}
