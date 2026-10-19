// Settings → Playback (v2.x panels.js "playback"; the engine choice is gone: libVLC plays everything)
import QtQuick
import VLCR

Column {
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Engine"
    SettingRow { label: "Fast seek"; info: "Like VLC’s own setting. Jumps to the nearest keyframe instead of the exact moment: quicker in large files, less precise. Applies from the next file on."
                 Toggle { path: "fastSeek" } }
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
