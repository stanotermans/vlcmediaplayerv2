// Settings → About (v2.x panels.js "about"; checking for updates follows in phase 6)
import QtQuick
import VLCR

Column {
  id: page
  property var ctl: null
  width: parent ? parent.width : 600
  readonly property string platform: ({ windows: "Windows", osx: "macOS", linux: "Linux" })[Qt.platform.os] || Qt.platform.os
  Row {   // .about-head
    spacing: 16; topPadding: 18; bottomPadding: 8
    Image { width: 64; height: 64; sourceSize: Qt.size(128, 128); anchors.verticalCenter: parent.verticalCenter; source: Qt.resolvedUrl("../../assets/icon.png") }   // the app icon
    Column { anchors.verticalCenter: parent.verticalCenter; spacing: 2
      T { text: "VLC Redesign"; px: 22; font.weight: Font.DemiBold; color: Theme.text }
      T { text: qsTr("Version %1").arg(System.version) + (System.portable ? " · portable" : "") + " · " + page.platform + " · Qt " + qtVersion + " · libVLC " + page.ctl.player.version; color: Theme.muted } }
  }
  Rectangle {   // .about-note
    width: parent.width; height: an.implicitHeight + 20; radius: 8; color: Theme.panel2
    T { id: an; x: 12; y: 10; width: parent.width - 24; wrapMode: Text.Wrap; elide: Text.ElideNone; color: Theme.muted
        text: qsTr("Unofficial fan project. Not made by or affiliated with VideoLAN, the makers of VLC media player.") }
  }
  Section {
    title: "Updates"
    SettingRow { label: "Check for updates automatically"; Toggle { path: "autoUpdate" } }
    T {   // .upd-status
      readonly property var u: System.update
      readonly property var info: u.info || {}
      visible: text !== ""; topPadding: 6; px: 13
      color: u.state === "available" || u.state === "page" ? Theme.accent : u.state === "error" ? "#ff6b5b" : Theme.muted
      text: ({ checking: qsTr("Checking for updates…"), latest: qsTr("You have the latest version (%1).").arg("v" + (info.current || System.version)),
               available: qsTr("Version %1 is available.").arg("v" + info.latest), page: qsTr("Version %1 is available.").arg("v" + info.latest),
               downloading: qsTr("Downloading update… %1%").arg(Math.round((u.progress || 0) * 100)), installing: qsTr("The update is being installed. The app will restart."),
               downloaded: qsTr("The update has been downloaded."), error: qsTr("Could not check for updates.") + (u.error ? " (" + u.error + ")" : "") })[u.state] || ""
    }
    Row { spacing: 8; topPadding: 10; bottomPadding: 10
      Button { text: qsTr("Check for updates"); kind: "ghost"; onClicked: System.checkUpdates(true) }
      Button { text: qsTr("What's new"); kind: "ghost"; onClicked: page.ctl.dialog("dialogs/WhatsNew.qml", { since: "" }) }
      Button { visible: System.update.state === "available"; kind: "primary"
               text: (System.update.info || {}).mode === "install" ? qsTr("Install update") : (System.update.info || {}).mode === "download" ? qsTr("Download update") : qsTr("Open download page")
               onClicked: System.installUpdate() } }
  }
  Section {
    title: "Credits"
    SettingRow { label: "Design"; T { text: "Juxtopposed – “I Redesigned VLC After 25 Years”"; color: Theme.text2 } }
    Row { spacing: 8; topPadding: 10; bottomPadding: 10
      LinkButton { text: qsTr("Watch the video"); icon: "play"; url: "https://www.youtube.com/watch?v=ERFeOgqk324" }
      LinkButton { text: qsTr("Figma file"); url: "https://www.figma.com/design/7fsD7tE4rIOTEfaLAAQiDY/VLC-Redesign--Community-" } }
    SettingRow { label: "Code"; T { text: "© 2026 Stan Otermans · " + qsTr("MIT license"); color: Theme.text2 } }
    SettingRow { label: "MIDI"; T { text: "FluidSynth (LGPL) · FluidR3 Mono SoundFont (MIT)"; color: Theme.text2 } }
    SettingRow { label: "Built with"; T { text: "Qt " + qtVersion + " (LGPL) · libVLC " + page.ctl.player.version + " (LGPL/GPL) · FFmpeg (LGPL/GPL)"; color: Theme.text2 } }
  }
  Section {
    title: "Links"
    Row { spacing: 8; topPadding: 10; bottomPadding: 10
      LinkButton { text: "GitHub"; icon: "github"; url: "https://github.com/stanotermans/vlcmediaplayerv2" }
      LinkButton { text: qsTr("Website"); url: "https://stanotermans.github.io/vlcmediaplayerv2/" }
      LinkButton { text: qsTr("Report a problem"); url: "https://github.com/stanotermans/vlcmediaplayerv2/issues" } }
  }
  Note { text: qsTr("\"VLC\" and the VLC cone logo are trademarks of VideoLAN.") }
}
