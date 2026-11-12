// The queue next to the video (#110, as in the design): what plays now and next, on the right in the player. The
// header has the count and total time, sort, repeat, shuffle and add; a row plays on a click, moves by its handle
// and leaves the queue with its × (the file itself stays in the library).
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR
import "../Lib.js" as Lib

Rectangle {
  id: root
  property var ctl: null
  property bool open: false
  readonly property var q: open && ctl.current ? ctl.pb.queue() : []
  readonly property int rowH: 40
  readonly property real total: { if (q.length > 3000) return 0; let s = 0; for (const i of q) s += (ctl.library.item(i.src).duration || i.duration || 0); return s; }
  property bool sortDesc: false
  property alias list: list   // (testing)
  visible: open
  width: Math.min(340, ctl.width - 24)
  radius: 10; color: Theme.panel; border.width: 1; border.color: Theme.line
  clip: true
  // keep clicks inside the panel from reaching the player
  MouseArea { anchors.fill: parent; acceptedButtons: Qt.AllButtons; onWheel: w => w.accepted = true }

  function span(s) { s = Math.round(s / 60); const h = Math.floor(s / 60), m = s % 60; return h ? qsTr("%1h %2m").arg(h).arg(m) : qsTr("%1m").arg(m); }
  function clock(s) { const t = ctl.pb.fmt(s); return t.startsWith("00:") ? t.slice(3) : t; }
  function setQueue(l) { ctl.queueList = l; }
  function sort() { setQueue(Lib.sortItems(q, "name", sortDesc)); sortDesc = !sortDesc; }
  function remove(src) { setQueue(q.filter(i => i.src !== src)); }
  function move(from, to) {
    if (from === to || from < 0 || to < 0 || to >= q.length) return;
    const l = q.slice(), it = l.splice(from, 1)[0]; l.splice(to, 0, it); setQueue(l);
  }
  function cycleRepeat() {
    const next = { off: "all", all: "one", one: "off" }[Settings.values.repeat || "off"] || "off";
    Settings.set("repeat", next);
    ctl.pb.osd(next === "all" ? qsTr("Repeat all") : next === "one" ? qsTr("Repeat one") : qsTr("Repeat off"));
  }

  Item {
    id: head
    x: 14; y: 10; width: parent.width - 24; height: 30
    T { anchors { left: parent.left; right: tools.left; rightMargin: 8; verticalCenter: parent.verticalCenter } px: 12.5; color: Theme.muted
        text: root.ctl.itemsLabel(root.q.length) + (root.total > 30 ? " · " + root.span(root.total) : "") }
    Row {
      id: tools
      anchors { right: parent.right; verticalCenter: parent.verticalCenter }
      spacing: 2
      IconButton { html: "sortBtn"; tip: qsTr("Sort"); onClicked: root.sort() }
      IconButton { name: "repeat"; tip: qsTr("Repeat"); on: (Settings.values.repeat || "off") !== "off"; onClicked: root.cycleRepeat()
                   T { visible: Settings.values.repeat === "one"; text: "1"; px: 9; font.weight: Font.Bold; color: Theme.accent; anchors { right: parent.right; bottom: parent.bottom; margins: 3 } } }
      IconButton { name: "shuffle"; tip: qsTr("Shuffle"); on: !!Settings.values.shuffle; onClicked: Settings.set("shuffle", !Settings.values.shuffle) }
      IconButton { name: "plus"; tip: qsTr("Add media"); onClicked: root.ctl.doAct("files") }
      IconButton { name: "x"; tip: qsTr("Hide queue (Q)"); onClicked: root.ctl.toggleQueue() }
    }
  }
  Rectangle { id: rule; anchors { left: parent.left; right: parent.right; top: head.bottom; topMargin: 6 } height: 1; color: Theme.line }

  ListView {
    id: list
    anchors { left: parent.left; right: parent.right; top: rule.bottom; bottom: parent.bottom; leftMargin: 6; rightMargin: 6; bottomMargin: 6 }
    topMargin: 6; bottomMargin: 6
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    model: root.q
    interactive: dragFrom < 0
    property int dragFrom: -1    // the row that is being moved, and where it would land
    property int dragTo: -1
    C.ScrollBar.vertical: ScrollBar {}
    onVisibleChanged: if (visible) Qt.callLater(showCurrent)
    function showCurrent() { const i = root.q.findIndex(x => root.ctl.current && x.src === root.ctl.current.src); if (i >= 0) positionViewAtIndex(i, ListView.Contain); }
    delegate: Rectangle {
      id: row
      required property var modelData
      required property int index
      readonly property bool on: !!root.ctl.current && root.ctl.current.src === modelData.src
      readonly property bool moving: list.dragFrom === index
      readonly property real secs: root.ctl.library.item(modelData.src).duration || modelData.duration || 0
      width: ListView.view.width; height: root.rowH; radius: Theme.radius
      color: moving ? Theme.panel3 : ra.containsMouse || grip.containsMouse || del.hovered ? Theme.panel2 : "transparent"
      z: moving ? 2 : 0
      transform: Translate { y: row.moving ? grip.dy : 0 }
      Rectangle {   // where the moved row lands
        visible: list.dragFrom >= 0 && list.dragTo === row.index && !row.moving
        anchors { left: parent.left; right: parent.right; margins: 6 }
        y: list.dragTo > list.dragFrom ? parent.height - 1 : -1; height: 2; radius: 1; color: Theme.accent
      }
      MouseArea {
        id: ra; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: m => {
          if (m.button === Qt.RightButton) { const p = mapToItem(null, m.x, m.y); root.ctl.entryMenu({ kind: "item", it: row.modelData }, p.x, p.y, false); }
          else root.ctl.playItem(row.modelData);
        }
      }
      MouseArea {   // the handle: drag to move the row
        id: grip
        property real dy: 0
        property real startY: 0
        width: 34; height: parent.height
        hoverEnabled: true; cursorShape: pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor
        preventStealing: true
        Icon { anchors.centerIn: parent; name: row.on ? "play" : "grip"; color: row.on ? Theme.accent : grip.containsMouse || row.moving ? Theme.text : Theme.muted }
        onPressed: m => { startY = mapToItem(list, m.x, m.y).y; dy = 0; list.dragFrom = row.index; list.dragTo = row.index; }
        onPositionChanged: m => {
          if (!pressed) return;
          dy = mapToItem(list, m.x, m.y).y - startY;
          list.dragTo = Math.max(0, Math.min(root.q.length - 1, row.index + Math.round(dy / root.rowH)));
        }
        onReleased: { const from = list.dragFrom, to = list.dragTo; list.dragFrom = -1; list.dragTo = -1; dy = 0; root.move(from, to); }
        onCanceled: { list.dragFrom = -1; list.dragTo = -1; dy = 0; }
      }
      T { anchors { left: grip.right; right: time.left; rightMargin: 10; verticalCenter: parent.verticalCenter }
          text: row.modelData.name; color: row.on ? Theme.accent : Theme.text2 }
      T { id: time; opacity: del.visible ? 0 : 1; anchors { right: parent.right; rightMargin: 12; verticalCenter: parent.verticalCenter }
          text: row.secs > 0 ? root.clock(row.secs) : ""; px: 12; color: Theme.muted; elide: Text.ElideNone }
      IconButton { id: del; visible: !row.on && (ra.containsMouse || grip.containsMouse || hovered) && list.dragFrom < 0
                   anchors { right: parent.right; rightMargin: 6; verticalCenter: parent.verticalCenter } width: 26; height: 26
                   name: "x"; tip: qsTr("Remove from queue"); onClicked: root.remove(row.modelData.src) }
    }
  }
  T { visible: root.q.length === 0; anchors.centerIn: list; text: qsTr("Nothing is playing"); color: Theme.muted }
}
