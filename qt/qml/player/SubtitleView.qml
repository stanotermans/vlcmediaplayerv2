// #subs: the current subtitle lines at the bottom of the picture, each on its own box (Settings → Subtitles: font,
// size, colour, outline colour and background opacity).
import QtQuick
import VLCR

Item {
  id: root
  property var ctl: null
  property string text: ""
  readonly property real px: (Settings.values.subSize || 100) / 100 * Math.max(16, Math.min(40, ctl.width * 0.026))
  readonly property var lines: text ? text.split(/\n|<br>/) : []
  Column {
    anchors { horizontalCenter: parent.horizontalCenter; bottom: parent.bottom; bottomMargin: root.height * 0.06 }
    width: root.width * 0.9
    Repeater {
      model: root.lines
      Item {
        required property string modelData
        width: parent.width; height: line.implicitHeight * 1.5   // line-height 1.5
        Rectangle {   // the line's box (#subs span background)
          anchors.centerIn: parent
          width: Math.min(parent.width, line.contentWidth + 20); height: line.implicitHeight + 4; radius: 4
          color: Qt.rgba(0, 0, 0, (Settings.values.subBg ?? 60) / 100)
        }
        Text {
          id: line
          anchors.centerIn: parent
          width: Math.min(implicitWidth, parent.width - 20)
          horizontalAlignment: Text.AlignHCenter; wrapMode: Text.Wrap
          textFormat: Text.StyledText
          text: modelData
          font.family: Settings.values.subFont || "Segoe UI"; font.pixelSize: root.px
          color: Settings.values.subColor || "#ffffff"
          style: Text.Outline; styleColor: Settings.values.subOutline || "#0c0c0c"
          renderType: Text.QtRendering
        }
      }
    }
  }
}
