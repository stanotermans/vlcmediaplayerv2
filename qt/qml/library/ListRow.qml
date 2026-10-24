// A row of the list view (#grid.list .card): small thumbnail, title, artist / album, duration
import QtQuick
import VLCR
import "../Lib.js" as Lib

Rectangle {
  id: root
  property var entry: ({})
  property var ctl: null
  property bool reorder: false
  readonly property var it: entry.kind === "item" ? entry.it : null
  readonly property bool playing: !!it && ctl.current && ctl.current.src === it.src
  readonly property bool selected: !!it && !!ctl.sel[it.src]
  readonly property bool watched: !!it && !!ctl.library.watched[it.src]
  property string dropMark: ""
  readonly property real fr: (width - 16 - 46 - 70 - 36) / 1.7       // minmax(0,1fr) minmax(0,.7fr)
  // a phone (#53): a taller row for a finger, a bigger thumbnail, the details under the name and a menu button
  readonly property bool phone: ctl.phone
  readonly property int tw: phone ? (root.it && root.it.type !== "audio" ? 80 : 48) : 46
  implicitHeight: phone ? 64 : 40
  radius: 6
  color: ma.containsMouse && !ctl.dragging ? Theme.panel2 : "transparent"
  opacity: ma.drag.active ? 0.35 : 1

  Rectangle {   // .thumb 46×30
    id: thumb
    x: 8; anchors.verticalCenter: parent.verticalCenter
    width: root.tw; height: root.phone ? 48 : 30; radius: root.phone ? 6 : 3; clip: true
    color: root.entry.kind === "item" ? "#000000" : root.entry.kind === "action" ? "transparent" : Theme.panel2
    border.width: selected ? 2 : 0; border.color: Theme.accent
    Image { anchors.fill: parent; anchors.margins: parent.border.width; fillMode: Image.PreserveAspectCrop; asynchronous: true; sourceSize.width: 120
            source: root.it ? (Settings.values.showThumbs ? root.it.thumb || "" : "") : root.entry.kind === "folder" ? (Settings.values.showThumbs ? root.entry.thumb : "") : root.entry.cover || ""
            opacity: root.entry.kind === "folder" ? 0.35 : root.watched ? 0.75 : 1; visible: status === Image.Ready }
    Icon {
      anchors.centerIn: parent; width: 20; height: 20
      visible: root.it ? !Settings.values.showThumbs || !root.it.thumb : !(root.entry.kind === "playlist" && root.entry.cover)
      name: root.it ? (root.it.type === "audio" ? "ph_audio" : "ph_video") : root.entry.kind === "folder" ? "folder" : root.entry.kind === "playlist" ? (root.entry.all ? "library" : "playlist") : root.entry.icon || ""
      color: root.it ? "#555555" : root.entry.all ? Theme.accent : Theme.muted
    }
  }
  T {
    visible: !root.phone
    x: thumb.x + 46 + 12; anchors.verticalCenter: parent.verticalCenter
    width: root.it ? root.fr : root.width - x - 8
    text: root.it ? root.it.name : root.entry.name || ""
    color: root.entry.kind === "action" ? Theme.muted : root.playing ? Theme.accent : root.selected ? Theme.text
         : root.watched && Settings.values.dimWatched ? Theme.dim : Theme.text2
  }
  Column {   // a phone: the name, and under it the artist, album and length
    visible: root.phone
    anchors { left: thumb.right; leftMargin: 12; right: phoneMore.left; rightMargin: 4; verticalCenter: parent.verticalCenter }
    spacing: 3
    T { width: parent.width; px: 15; text: root.it ? root.it.name : root.entry.name || ""
        color: root.entry.kind === "action" ? Theme.muted : root.playing ? Theme.accent : root.watched && Settings.values.dimWatched ? Theme.dim : Theme.text }
    T { width: parent.width; px: 12; color: Theme.muted; visible: text !== ""
        text: root.it ? [root.it.artist, root.it.album, Lib.shortFmt(root.it.duration)].filter(Boolean).join(" · ")
            : root.entry.kind === "folder" ? root.ctl.itemsLabel(root.entry.count || 0) : "" }
  }
  IconButton {
    id: phoneMore
    visible: root.phone && root.entry.kind !== "action"
    anchors { right: parent.right; verticalCenter: parent.verticalCenter }
    width: root.phone ? 40 : 0; height: 40; html: "moreBtn"; tip: qsTr("More")
    onClicked: { const p = mapToItem(null, 0, height); root.ctl.entryMenu(root.entry, p.x - 200, p.y, true); }
    z: 2
  }
  T {   // .c-album
    visible: !!root.it && !root.phone
    x: thumb.x + 46 + 12 + root.fr + 12; anchors.verticalCenter: parent.verticalCenter; width: root.fr * 0.7
    text: root.it ? [root.it.artist, root.it.album].filter(Boolean).join(" – ") : ""; color: Theme.muted
  }
  T {   // .c-dur
    visible: !!root.it && !root.phone
    anchors { right: parent.right; rightMargin: 8; verticalCenter: parent.verticalCenter } width: 70
    horizontalAlignment: Text.AlignRight; font.features: { "tnum": 1 }
    text: root.it ? Lib.shortFmt(root.it.duration) : ""; color: Theme.muted
  }
  Rectangle { visible: root.dropMark !== ""; width: parent.width; height: 2; color: Theme.accent; y: root.dropMark === "before" ? 0 : parent.height - 2 }

  MouseArea {
    id: ma
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: root.reorder && root.it ? Qt.OpenHandCursor : Qt.PointingHandCursor
    acceptedButtons: Qt.LeftButton | Qt.RightButton
    drag.target: root.reorder && root.it && !root.phone ? ghost : null
    drag.threshold: 6
    onPressed: m => { ghost.x = m.x; ghost.y = m.y; }
    onPressAndHold: m => { if (root.phone) { const p = mapToItem(null, m.x, m.y); root.ctl.entryMenu(root.entry, p.x, p.y, true); } }   // (touch: hold for the menu)
    onReleased: if (ghost.Drag.active) ghost.Drag.drop()
    drag.onActiveChanged: root.ctl.dragging = drag.active
    onClicked: m => {
      if (m.button === Qt.RightButton) { const p = mapToItem(null, m.x, m.y); root.ctl.entryMenu(root.entry, p.x, p.y, true); }
      else root.ctl.entryClicked(root.entry, m.modifiers);
    }
  }
  Item { id: ghost; width: 1; height: 1; Drag.active: ma.drag.active; Drag.keys: ["vlcr-item"]; Drag.source: root }
  DropArea {
    anchors.fill: parent
    enabled: root.reorder && !!root.it
    keys: ["vlcr-item"]
    onPositionChanged: d => root.dropMark = d.source === root ? "" : d.y > root.height / 2 ? "after" : "before"
    onExited: root.dropMark = ""
    onDropped: d => { const after = root.dropMark === "after"; root.dropMark = "";
                      if (d.source !== root) root.ctl.moveItem(d.source.it.src, root.it.src, after); }
  }
}
