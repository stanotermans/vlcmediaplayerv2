// Settings → General (v2.x panels.js "general")
import QtQuick
import VLCR

Column {
  id: page
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Appearance"
    SettingRow { label: "Interface language"
                 Select { options: I18n.languages; value: I18n.language; onPicked: v => Settings.set("language", v) } }
    ProLock { ctl: page.ctl; what: "theme"; text: qsTr("Other themes and accent colours are part of Vela Player Pro") }
    SettingRow { shown: Store.pro; label: "Theme"; info: "Black is pure black (AMOLED): easier on the eyes in the dark and saves battery on OLED screens."
                 Segmented { path: "theme"; options: [["dark", "Dark"], ["black", "Black"], ["light", "Light"], ["system", "System"]] } }
    Slider { label: "Interface size"; min: 75; max: 150; step: 5; path: "uiScale"; fmt: v => v + "%"; ticks: 2 }
    SettingRow { shown: Store.pro; label: "Accent color"; Swatches { path: "accent"; colors: Settings.accents } }
  }
  Section {
    visible: !Theme.mobile   // (a phone: Android asks which app opens a file)
    title: "Default player"
    SettingRow { label: "Open videos and music with Vela Player"
                 Button { text: qsTr("Set as default player"); kind: "ghost"; onClicked: defNote.text = ctl.setDefaultPlayer() } }
    Note { id: defNote; visible: text !== "" }
  }
  Section {
    title: "Startup"
    SettingRow { label: "Start page"; info: "The library page the app opens on."
                 Select { path: "startView"; options: ["home", "videos", "music", "network", "playlists", "recent"].map(v => [v, v === "music" && Settings.values.audioLabel ? "Audio" : v.charAt(0).toUpperCase() + v.slice(1)]) } }
    SettingRow { label: "Show confirmation and error dialogs"; info: "Ask for confirmation before deleting or clearing."; Toggle { path: "confirmDialogs" } }
    SettingRow { shown: !Theme.mobile; label: "Check for updates automatically"; Toggle { path: "autoUpdate" } }
    SettingRow { label: "Show welcome screen again"; Button { text: qsTr("Start onboarding"); kind: "ghost"; onClicked: ctl.showOnboarding() } }
  }
  Section {
    title: "Diagnostics"
    last: true
    SettingRow { label: "Save a log"; info: "Write ffmpeg and playback messages to a file."; Toggle { path: "logOn" } }
    SettingRow { label: "Log file"
      Row { spacing: 6
        TextField { width: 260; text: Settings.values.logFile || ctl.library.logFile(); input.readOnly: true; input.color: Theme.muted }
        Button { text: qsTr("Open"); kind: "ghost"; onClicked: ctl.library.openPath(Settings.values.logFile || ctl.library.logFile()) } } }
    SettingRow { label: "Log details"; Select { path: "logLevel"; options: [["error", "Errors only"], ["info", "All"]] } }
  }
}
