// #lyrics: the song's lines over its blurred cover. Synced lyrics follow the song with the current line bright and in
// the middle (click a line to jump there); unsynced lyrics simply scroll. The switch in the corner (Y) goes back to
// the cover (#20).
import QtQuick
import QtQuick.Effects
import VLCR

Item {
  id: root
  property var ctl: null
  readonly property var sb: ctl.sb
  readonly property real px: (Settings.values.lyricsSize || 100) / 100 * Math.max(18, Math.min(30, ctl.width * 0.023))
  readonly property bool ownBg: (Settings.values.audioBg || "blur") === "stage"
  clip: true

  Rectangle { anchors.fill: parent; color: "#121212"; visible: root.sb.lyricsOn && root.ownBg }
  Item {   // .lyr-bg: the blurred cover, only with the default stage background (otherwise the music background shows)
    anchors.fill: parent; visible: root.sb.lyricsOn && root.ownBg
    Image { id: art; anchors.fill: parent; source: root.ctl.current && root.ctl.current.type === "audio" ? root.ctl.current.thumb || "" : ""; fillMode: Image.PreserveAspectCrop; visible: false; sourceSize.width: 320 }
    MultiEffect { anchors.fill: parent; autoPaddingEnabled: false; source: art; blurEnabled: true; blur: 1; blurMax: 64; visible: art.status === Image.Ready }
    Rectangle { anchors.fill: parent; color: "#000000"; opacity: 0.68 }
  }

  Flickable {   // .lyr-scroll
    id: flick
    anchors.fill: parent
    visible: root.sb.lyricsOn
    interactive: !root.sb.synced
    contentHeight: list.height + (root.sb.synced ? 0 : root.height * 0.56)
    boundsBehavior: Flickable.StopAtBounds
    layer.enabled: true
    layer.effect: MultiEffect {   // fade out at the top and bottom
      maskEnabled: true; maskSource: mask; maskThresholdMin: 0.0; maskSpreadAtMin: 1.0
    }
    Column {
      id: list
      width: flick.width
      y: root.sb.synced ? Math.round(flick.height / 2 - (cur ? cur.y + cur.height / 2 : 0)) : flick.height * 0.28
      Behavior on y { NumberAnimation { duration: 500; easing.type: Easing.OutCubic } }
      readonly property Item cur: rep.count ? rep.itemAt(Math.max(0, root.sb.lyricIndex)) : null
      Repeater {
        id: rep
        model: root.sb.lyrics || []
        Text {
          required property var modelData
          required property int index
          readonly property bool on: root.sb.synced && index === root.sb.lyricIndex
          width: list.width * 0.84; x: list.width * 0.08
          topPadding: root.px * 0.4; bottomPadding: root.px * 0.4
          horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap
          text: modelData.text || "♪"
          font.family: Settings.values.subFont || Theme.font; font.pixelSize: root.px; font.weight: Font.DemiBold
          lineHeight: 1.3; color: "#ffffff"
          opacity: !root.sb.synced ? 0.85 : on ? 1 : !modelData.text ? 0.2 : la.containsMouse ? 0.6 : 0.36
          scale: on ? 1.06 : 1
          Behavior on opacity { NumberAnimation { duration: 300 } }
          Behavior on scale { NumberAnimation { duration: 300 } }
          MouseArea { id: la; anchors.fill: parent; hoverEnabled: true; enabled: root.sb.synced; cursorShape: Qt.PointingHandCursor
                      onClicked: root.ctl.pb.seekTo(modelData.t) }
        }
      }
    }
  }
  Item {
    id: mask
    anchors.fill: parent; visible: false; layer.enabled: true
    Rectangle { anchors.fill: parent
      gradient: Gradient { GradientStop { position: 0; color: "transparent" } GradientStop { position: 0.16; color: "#ffffff" }
                           GradientStop { position: 0.84; color: "#ffffff" } GradientStop { position: 1; color: "transparent" } } }
  }

  Rectangle {   // #lyrSwitch: cover ⇄ lyrics (a phone: in PhoneControls' bottom row)
    visible: root.sb.canLyrics && !root.ctl.phone
    x: 12; y: 12
    width: sw.implicitWidth + 18; height: 26; radius: 13
    color: swa.containsMouse ? "#bb000000" : "#88000000"
    Row { id: sw; anchors.centerIn: parent; spacing: 6
      Icon { width: 15; height: 15; name: root.sb.lyricsOn ? "audio" : "subtitle"; color: swa.containsMouse ? "#ffffff" : "#dddddd"; anchors.verticalCenter: parent.verticalCenter }
      T { text: root.sb.lyricsOn ? qsTr("Show cover") : qsTr("Show lyrics"); px: 12; color: swa.containsMouse ? "#ffffff" : "#dddddd"; anchors.verticalCenter: parent.verticalCenter } }
    MouseArea { id: swa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.sb.toggleLyrics() }
  }
}
