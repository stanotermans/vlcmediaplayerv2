// Settings → Playback (v2.x panels.js "playback"; the engine choice is gone, file types can still go to FFmpeg: #66)
import QtQuick
import VLCR

Column {
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Engine"
    SettingRow { label: "Fast seek"; info: "Like VLC’s own setting. Jumps to the nearest keyframe instead of the exact moment: quicker in large files, less precise. Applies from the next file on."
                 Toggle { path: "fastSeek" } }
    SettingRow { label: "Always play with FFmpeg"; info: "File types (extensions) that VLC reads and decodes with FFmpeg, for files that don't play well otherwise. Separate them with commas. Also in the right-click menu of a file."
                 TextField { width: 220; path: "classicTypes"; placeholder: "e.g. tgv, bik" } }
  }
  Section {
    title: "Defaults"
    last: true
    SettingRow { label: "Repeat"; Select { path: "repeat"; options: [["off", "Off"], ["one", "Current"], ["all", "All"]] } }
    SettingRow { label: "Shuffle"; Toggle { path: "shuffle" } }
    SettingRow { label: "Autoplay next item"; Toggle { path: "autoNext" } }
    SettingRow { label: "Resume where you left off"; Toggle { path: "resume" } }
    SettingRow { label: "Skip interval"; Select { path: "jump"; options: [[5, "5 seconds"], [10, "10 seconds"], [30, "30 seconds"], [60, "1 minute"]] } }
  }
}
