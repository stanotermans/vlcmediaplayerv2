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
    // #126
    SettingRow { label: "Deinterlacing"; info: "Removes the comb lines of interlaced video (old TV recordings, DVDs). Automatic only does it for interlaced video; Off saves processing power."
                 Select { path: "deinterlace"; options: [["auto", "Automatic"], ["off", "Off"], ["on", "On"]] } }
    SettingRow { label: "Sound only"; info: "Plays only the sound of videos, without decoding the picture: saves battery, for example to listen to a documentary."
                 Toggle { path: "audioOnly" } }
    SettingRow { label: "Power saving"; info: "Decodes video with less work (H.264's in-loop filter skipped, faster decoding, no post-processing): a slightly less sharp picture, but less battery and fan noise, and smoother on slow computers."
                 Toggle { path: "powerSave" } }
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
