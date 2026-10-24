// .card of the library grid: a media item (thumbnail, progress, duration, play on hover), a folder, a playlist or an
// action ("Create playlist"). Clicks and the right-click menu go to the main window (ctl); in your own playlists the
// items can be dragged to change their order (#50).
import QtQuick
import QtQuick.Shapes
import VLCR
import "../Lib.js" as Lib

Item {
  id: root
  property var entry: ({})
  property var ctl: null
  property bool reorder: false
  readonly property var it: entry.kind === "item" ? entry.it : null
  readonly property bool audio: !!it && it.type === "audio"
  readonly property bool playing: !!it && ctl.current && ctl.current.src === it.src
  readonly property bool selected: !!it && !!ctl.sel[it.src]
  readonly property bool watched: !!it && !!ctl.library.watched[it.src]
  readonly property real pct: !it ? 0 : watched ? 100 : it.duration ? Math.min(100, (ctl.library.positions[it.src] || 0) / it.duration * 100) : 0
  readonly property bool showThumbs: !!Settings.values.showThumbs
  readonly property bool hovered: ma.containsMouse
  property string dropMark: ""
  implicitHeight: thumb.height + 8 + name.implicitHeight
  opacity: ma.drag.active ? 0.35 : 1

  Rectangle {   // .thumb
    id: thumb
    width: root.width; height: root.audio ? width : Math.round(width * 9 / 16)
    radius: Theme.radius; clip: true
    color: root.entry.kind === "action" ? "transparent" : root.entry.kind === "item" ? "#000000" : Theme.panel2
    Image {   // the thumbnail, a folder's first thumbnail (dimmed) or a playlist's cover
      anchors.fill: parent
      source: root.it ? (root.showThumbs ? root.it.thumb || "" : "") : root.entry.kind === "folder" ? (root.showThumbs ? root.entry.thumb : "") : root.entry.cover || ""
      fillMode: Image.PreserveAspectCrop; asynchronous: true; cache: true
      sourceSize.width: 320
      opacity: root.entry.kind === "folder" ? 0.35 : root.watched ? 0.75 : 1
      visible: status === Image.Ready
    }
    Icon {   // .ph: no thumbnail
      visible: !!root.it && (!root.showThumbs || !root.it.thumb)
      anchors.centerIn: parent; width: 30; height: 30; strokeWidth: 1.5; color: "#555555"
      name: root.audio ? "ph_audio" : "ph_video"
    }
    Icon {   // folder, playlist and action icons
      visible: root.entry.kind !== "item" && !(root.entry.kind === "playlist" && root.entry.cover)
      anchors.centerIn: parent
      width: root.entry.kind === "folder" ? 46 : 40; height: width
      strokeWidth: root.entry.kind === "folder" ? 1.1 : 1.2
      name: root.entry.kind === "folder" ? "folder" : root.entry.kind === "playlist" ? (root.entry.all ? "library" : "playlist") : root.entry.icon || ""
      color: root.entry.kind === "playlist" && root.entry.all ? Theme.accent : Theme.muted
    }
    Rectangle {   // .fcount
      visible: root.entry.kind === "folder" || root.entry.kind === "playlist"
      x: 8; anchors.bottom: parent.bottom; anchors.bottomMargin: 6
      width: fc.implicitWidth + 12; height: fc.implicitHeight + 2; radius: 3; color: "#aa000000"
      T { id: fc; anchors.centerIn: parent; px: 11; color: "#ffffff"; text: root.entry.count === 1 ? qsTr("1 item") : qsTr("%1 items").arg(root.entry.count) }
    }
    Rectangle {   // .prog
      visible: root.pct > 1
      anchors.bottom: parent.bottom; width: parent.width * root.pct / 100; height: 3; color: Theme.accent
    }
    Rectangle {   // .dur
      visible: !!root.it && root.it.duration > 0
      anchors { right: parent.right; bottom: parent.bottom; margins: 6 }
      width: dl.implicitWidth + 10; height: dl.implicitHeight + 2; radius: 3; color: "#bb000000"
      T { id: dl; anchors.centerIn: parent; px: 11; color: "#ffffff"; text: root.it ? Lib.shortFmt(root.it.duration) : "" }
    }
    Rectangle {   // .play
      visible: !!root.it
      anchors.fill: parent; color: "#66000000"; opacity: root.hovered && !root.ctl.dragging ? 1 : 0
      Behavior on opacity { NumberAnimation { duration: 150 } }
      Icon { anchors.centerIn: parent; width: 28; height: 28; name: "play"; filled: true; color: "#ffffff" }
    }
    Shape {   // the dashed border of "Create playlist" / "Import playlist…"
      visible: root.entry.kind === "action"
      anchors.fill: parent
      preferredRendererType: Shape.CurveRenderer
      ShapePath {
        strokeColor: Theme.line; strokeWidth: 1; fillColor: "transparent"; strokeStyle: ShapePath.DashLine; dashPattern: [3, 3]
        PathRectangle { x: 0.5; y: 0.5; width: thumb.width - 1; height: thumb.height - 1; radius: Theme.radius }
      }
    }
  }
  Rectangle {   // outline: accent on hover, 3px with 1px offset when selected
    readonly property int w: root.selected ? 3 : 2
    x: -w - (root.selected ? 1 : 0); y: x; width: thumb.width - 2 * x; height: thumb.height - 2 * x
    radius: Theme.radius - x; color: "transparent"
    border.width: w; border.color: root.selected || (root.hovered && root.entry.kind !== "action" && !root.ctl.dragging) ? Theme.accent : "transparent"
    Behavior on border.color { ColorAnimation { duration: 150 } }
  }
  Rectangle {   // the check of a selected card
    visible: root.selected
    x: 6; y: 6; width: 20; height: 20; radius: 10; color: Theme.accent
    Icon { anchors.centerIn: parent; width: 14; height: 14; name: "check"; strokeWidth: 3; color: "#ffffff" }
  }
  T {
    id: name
    anchors { top: thumb.bottom; topMargin: 8 }
    width: root.width
    text: root.it ? root.it.name : root.entry.name || ""
    color: root.entry.kind === "action" ? Theme.muted : root.playing ? Theme.accent : root.selected ? Theme.text
         : root.watched && Settings.values.dimWatched ? Theme.dim : Theme.text2
  }
  Rectangle {   // where a dragged item lands
    visible: root.dropMark !== ""
    x: root.dropMark === "before" ? -4 : root.width + 1; y: 1; width: 3; height: thumb.height - 2; color: Theme.accent
  }

  MouseArea {
    id: ma
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: root.reorder && root.it ? Qt.OpenHandCursor : Qt.PointingHandCursor
    acceptedButtons: Qt.LeftButton | Qt.RightButton
    drag.target: root.reorder && root.it && !root.ctl.phone ? ghost : null
    drag.threshold: 6
    onClicked: m => {
      if (m.button === Qt.RightButton) { const p = mapToItem(null, m.x, m.y); root.ctl.entryMenu(root.entry, p.x, p.y, true); }
      else root.ctl.entryClicked(root.entry, m.modifiers);
    }
    onPressed: m => { ghost.x = m.x; ghost.y = m.y; }   // the ghost sits under the mouse
    onPressAndHold: m => { if (root.ctl.phone) { const p = mapToItem(null, m.x, m.y); root.ctl.entryMenu(root.entry, p.x, p.y, true); } }   // (touch: hold for the menu)
    onReleased: if (ghost.Drag.active) ghost.Drag.drop()
    drag.onActiveChanged: { root.ctl.dragging = drag.active; }
  }
  Item {   // follows the mouse while dragging; the DropAreas of the other cards see its hot spot
    id: ghost
    width: 1; height: 1
    Drag.active: ma.drag.active
    Drag.keys: ["vlcr-item"]
    Drag.source: root
  }
  DropArea {
    anchors.fill: parent
    enabled: root.reorder && !!root.it
    keys: ["vlcr-item"]
    onPositionChanged: d => root.dropMark = d.source === root ? "" : d.x > root.width / 2 ? "after" : "before"
    onExited: root.dropMark = ""
    onDropped: d => { const after = root.dropMark === "after"; root.dropMark = "";
                      if (d.source !== root) root.ctl.moveItem(d.source.it.src, root.it.src, after); }
  }
}
