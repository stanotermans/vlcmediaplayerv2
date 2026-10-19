// "Media information": file, container, duration, video, audio and subtitle tracks (app.js mediaInfo)
import QtQuick
import VLCR

DialogBox {
  id: dlg
  property var it: ({})
  title: "Media information"
  maxWidth: 560
  buttons: [{ label: "Close", value: true, primary: true }]
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, "0")).join(":"); }
  readonly property var rows: [
    ["File", it.src || ""], ["Container", it.format || "?"], ["Duration", fmt(it.duration)],
    ["Video", it.vcodec ? it.vcodec + " " + it.width + "×" + it.height : "—"],
    ["Audio", (it.audio || []).map(a => a.label + " (" + a.codec + ")").join(", ") || "—"],
    ["Subtitles", (it.subs || []).map(s => s.label + " (" + s.codec + ")").join(", ") || "—"]
  ]
  Column {
    width: parent.width
    Repeater {
      model: dlg.rows
      Item {   // .frow
        required property var modelData
        required property int index
        width: parent.width; height: Math.max(40, val.implicitHeight + 16)
        T { anchors.verticalCenter: parent.verticalCenter; text: qsTr(modelData[0]); color: Theme.text2 }
        T { id: val; anchors { right: parent.right; verticalCenter: parent.verticalCenter } width: parent.width * 0.68
            horizontalAlignment: Text.AlignRight; wrapMode: Text.WrapAnywhere; elide: Text.ElideNone; text: modelData[1]; color: Theme.text }
        Rectangle { visible: index < dlg.rows.length - 1; anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.line }
      }
    }
  }
}
