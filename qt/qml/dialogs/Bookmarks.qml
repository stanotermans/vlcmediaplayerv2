// "Chapters and bookmarks" (#120, app.js / panels.js bookmarks): the file's chapters and your own bookmarks; a time
// jumps there, a bookmark can be renamed or removed, and one can be added at the current place
import QtQuick
import VLCR

DialogBox {
  id: dlg
  property var pb: null
  title: "Chapters and bookmarks"
  maxWidth: 520
  buttons: []
  readonly property var chapters: pb ? pb.chapters() : []
  readonly property var marks: pb && pb.library.bookmarks ? pb.bookmarks() : []
  function clock(s) {
    s = Math.floor(Math.max(0, s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0");
  }
  function setMarks(list) { if (pb && pb.it) pb.library.setBookmarks(pb.it.src, list); }

  component TimeButton: Button { compact: true; implicitWidth: 72 }

  Column {
    width: parent.width
    spacing: 8
    T { text: qsTr("Chapters"); color: Theme.text2; font.weight: Font.DemiBold }
    T { visible: !dlg.chapters.length; text: qsTr("This file has no chapters."); color: Theme.muted }
    Repeater {
      model: dlg.chapters
      Row {
        required property var modelData
        required property int index
        spacing: 10
        TimeButton { text: dlg.clock(modelData.start); onClicked: dlg.pb.seekTo(modelData.start) }
        T { anchors.verticalCenter: parent.verticalCenter; width: dlg.width - 130; text: modelData.title || qsTr("Chapter %1").arg(index + 1); color: Theme.text }
      }
    }
    Item { width: 1; height: 6 }
    T { text: qsTr("Bookmarks"); color: Theme.text2; font.weight: Font.DemiBold }
    T { visible: !dlg.marks.length; width: parent.width; wrapMode: Text.Wrap; elide: Text.ElideNone
        text: qsTr("No bookmarks yet. Press Ctrl+B while playing to add one."); color: Theme.muted }
    Repeater {
      model: dlg.marks
      Row {
        required property var modelData
        required property int index
        spacing: 10
        TimeButton { text: dlg.clock(modelData.t); onClicked: dlg.pb.seekTo(modelData.t) }
        TextField {
          width: dlg.width - 36 - 72 - 10 - 32 - 10; text: modelData.name; placeholder: "Name"
          input.onEditingFinished: { const l = dlg.marks.slice(); if (l[index] && l[index].name !== input.text) { l[index] = Object.assign({}, l[index], { name: input.text }); dlg.setMarks(l); } }
        }
        IconButton { anchors.verticalCenter: parent.verticalCenter; name: "x"; tip: qsTr("Remove"); onClicked: dlg.setMarks(dlg.marks.filter((_, j) => j !== index)) }
      }
    }
    Item { width: 1; height: 6 }
    Button { text: qsTr("Add bookmark here"); kind: "primary"; onClicked: dlg.pb.addBookmark() }
    Note { visible: true; text: qsTr("Ctrl+B adds a bookmark while playing, Ctrl+Shift+B opens this window. Shift+N and Shift+P jump to the next and previous chapter or bookmark.") }
  }
}
