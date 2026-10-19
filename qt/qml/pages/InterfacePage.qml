// Settings → Interface, as in v2.x (app/src/panels.js, "interface")
import QtQuick
import VLCR

Column {
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Layout"
    SettingRow { label: "Sidebar with labels"; Toggle { path: "navExpanded" } }
    SettingRow { label: "Call the music section \"Audio\""; Toggle { path: "audioLabel" } }
    SettingRow { label: "Rounded window corners"; info: "Windows 11 rounds window corners automatically."; shown: Qt.platform.os === "windows"
                 Note { width: implicitWidth; text: qsTr("Set by Windows"); topPadding: 0; bottomPadding: 0 } }
    SettingRow { label: "Hide sidebar while media plays"; info: "Gives videos and music the full width. The sidebar button (Q) brings it back."; Toggle { path: "autoHideSide" } }
    SettingRow { label: "Resize window to the video"; info: "Matches the window to the video's shape when a new video starts, up to 70% of the screen."; Toggle { path: "fitWindow" } }
    SettingRow { label: "Show mini player while browsing"; Toggle { path: "miniPlayer" } }
    SettingRow { label: "Show preview when hovering the timeline"; Toggle { path: "seekPreview" } }
    SettingRow { label: "Show thumbnails"; Toggle { path: "showThumbs" } }
    SettingRow { label: "Dim watched items"; Toggle { path: "dimWatched" } }
  }
  Section {
    title: "Music player"
    SettingRow { label: "Background"; info: "Blur and gradient use the colors of the album cover."
                 Segmented { path: "audioBg"; options: [["blur", "Blur"], ["gradient", "Gradient"], ["black", "Black"], ["stage", "Default"]] } }
    Slider { label: "Background dimming"; min: 0; max: 90; step: 5; path: "audioBgDim"; fmt: v => v + "%" }
    Slider { label: "Cover size"; min: 15; max: 100; step: 5; path: "coverSize"; fmt: v => v + "%" }
    Note { text: qsTr("Press Y or use the button in the corner of the player to switch between the cover and the lyrics.") }
  }
  Section {
    title: "Player controls"
    SettingRow { label: "Previous / next"; Toggle { path: "ctl.prevnext" } }
    SettingRow { label: "Play / pause"; Toggle { path: "ctl.play" } }
    SettingRow { label: "Time"; Toggle { path: "ctl.time" } }
    SettingRow { label: "Volume"; Toggle { path: "ctl.volume" } }
    SettingRow { label: "Volume bar shape"; Segmented { path: "volShape"; options: [["bar", "Bar"], ["cone", "Cone"]] } }
    SettingRow { label: "Audio"; Toggle { path: "ctl.audio" } }
    SettingRow { label: "Subtitles"; Toggle { path: "ctl.subs" } }
    SettingRow { label: "Settings"; Toggle { path: "ctl.settings" } }
    SettingRow { label: "Library / player"; Toggle { path: "ctl.library" } }
    Note { text: qsTr("Hidden controls still work with the keyboard. Press F1 for all shortcuts.") }
  }
  Section {
    title: "Fullscreen"
    last: true
    SettingRow { label: "Hide the mouse cursor"; info: "When off, the cursor stays visible in fullscreen; only the controls hide."; Toggle { path: "hideCursor" } }
    Slider { label: "Hide cursor and controls after"; min: 1; max: 10; step: 0.5; path: "hideCursorDelay"; fmt: v => v.toFixed(1) + " s" }
  }
}
