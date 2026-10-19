// Settings → About (v2.x panels.js "about"; checking for updates follows in phase 6)
import QtQuick
import VLCR

Column {
  id: page
  property var ctl: null
  width: parent ? parent.width : 600
  Row {   // .about-head
    spacing: 16; topPadding: 18; bottomPadding: 8
    Image { width: 64; height: 64; sourceSize: Qt.size(128, 128); anchors.verticalCenter: parent.verticalCenter
            source: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.6 2h4.8l1.2 4H8.4z" fill="' + Theme.accent + '"/><path d="M8.1 7h7.8l1.1 4H7z" fill="#ddd"/><path d="M6.7 12h10.6l1.2 4.5H5.5z" fill="' + Theme.accent + '"/><path d="M3 18h18l1 3H2z" fill="' + Theme.accent + '"/></svg>') }
    Column { anchors.verticalCenter: parent.verticalCenter; spacing: 2
      T { text: "VLC Redesign"; px: 22; font.weight: Font.DemiBold; color: Theme.text }
      T { text: qsTr("Version %1").arg(Qt.application.version) + " · " + Qt.platform.os + " · Qt " + page.ctl.qtVersion + " · libVLC " + page.ctl.player.version; color: Theme.muted } }
  }
  Rectangle {   // .about-note
    width: parent.width; height: an.implicitHeight + 20; radius: 8; color: Theme.panel2
    T { id: an; x: 12; y: 10; width: parent.width - 24; wrapMode: Text.Wrap; elide: Text.ElideNone; color: Theme.muted
        text: qsTr("Unofficial fan project. Not made by or affiliated with VideoLAN, the makers of VLC media player.") }
  }
  Section {
    title: "Credits"
    SettingRow { label: "Design"; T { text: "Juxtopposed – “I Redesigned VLC After 25 Years”"; color: Theme.text2 } }
    Row { spacing: 8; topPadding: 10; bottomPadding: 10
      LinkButton { text: qsTr("Watch the video"); icon: "play"; url: "https://www.youtube.com/watch?v=ERFeOgqk324" }
      LinkButton { text: qsTr("Figma file"); url: "https://www.figma.com/design/7fsD7tE4rIOTEfaLAAQiDY/VLC-Redesign--Community-" } }
    SettingRow { label: "Code"; T { text: "© 2026 Stan Otermans · " + qsTr("MIT license"); color: Theme.text2 } }
    SettingRow { label: "Built with"; T { text: "Qt " + page.ctl.qtVersion + " (LGPL) · libVLC " + page.ctl.player.version + " (LGPL/GPL) · FFmpeg (LGPL/GPL)"; color: Theme.text2 } }
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
