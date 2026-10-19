// #side: the library panel next to the rail. The current view as a list (folders first), the playlists, or the
// queue (Q); title, item count and sort at the top.
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR

Rectangle {
  id: root
  property var ctl: null
  readonly property var sd: ctl.sideData
  color: Theme.bg2
  clip: true
  Rectangle { anchors { right: parent.right; top: parent.top; bottom: parent.bottom } width: 1; color: Theme.edge }

  Item {   // .side-head: padding 12px 10px 4px
    id: head
    x: 10; y: 12; width: parent.width - 20; height: 26
    IconButton { id: back; width: 26; height: 26; html: "backBtn"; tip: qsTr("Back"); onClicked: root.ctl.goBack() }
    T { anchors { left: back.right; leftMargin: 6; right: more.left; rightMargin: 6; verticalCenter: parent.verticalCenter }
        text: root.sd.title; px: 15; font.weight: Font.Medium; color: Theme.text }
    IconButton { id: more; anchors.right: parent.right; width: 26; height: 26; html: "sideMore"; tip: qsTr("More")
                 onClicked: { const p = more.mapToItem(null, 0, more.height + 4); root.ctl.sideMenu(p.x, p.y); } }
  }
  Item {   // .side-sub: count and sort, line below
    id: sub
    anchors { left: parent.left; right: parent.right; top: head.bottom; leftMargin: 6; rightMargin: 6; topMargin: 4 }
    height: 36
    T { x: 14; anchors.verticalCenter: parent.verticalCenter; anchors.verticalCenterOffset: -5; px: 12; color: Theme.muted; text: root.ctl.itemsLabel(root.sd.count) }
    IconButton { anchors { right: parent.right; rightMargin: 4; verticalCenter: parent.verticalCenter; verticalCenterOffset: -5 } width: 26; height: 26
                 html: "sortBtn"; tip: qsTr("Sort"); onClicked: root.ctl.toggleSort() }
    Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: Theme.line }
  }
  ListView {   // #sideList: padding 8px 6px
    anchors { left: parent.left; right: parent.right; top: sub.bottom; bottom: parent.bottom; leftMargin: 6; rightMargin: 6 }
    topMargin: 8; bottomMargin: 8
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    model: root.sd.rows
    C.ScrollBar.vertical: ScrollBar {}
    delegate: Rectangle {   // .srow
      id: row
      required property var modelData
      readonly property var it: modelData.kind === "item" ? modelData.it : null
      readonly property bool on: it ? root.ctl.current && root.ctl.current.src === it.src
                                    : modelData.kind === "playlist" && root.ctl.nav.view === "playlists" && root.ctl.nav.pl === modelData.key
      readonly property color fg: on ? Theme.accent : modelData.kind === "action" ? Theme.muted : Theme.text2
      width: ListView.view.width; height: 34; radius: Theme.radius
      color: sa.containsMouse ? Theme.panel2 : "transparent"
      Row {
        x: 10; anchors.verticalCenter: parent.verticalCenter; spacing: 10
        Rectangle {   // .cov: a playlist's cover
          visible: !!row.modelData.cover; width: 22; height: 22; radius: 4; color: Theme.panel3; clip: true; anchors.verticalCenter: parent.verticalCenter
          Image { anchors.fill: parent; source: row.modelData.cover || ""; fillMode: Image.PreserveAspectCrop; sourceSize.width: 44 }
        }
        Icon {
          visible: !row.modelData.cover; anchors.verticalCenter: parent.verticalCenter
          name: row.it ? (row.on ? "play" : row.it.type === "audio" ? "ph_audio" : "row_video") : row.modelData.kind === "folder" ? "folder" : row.modelData.icon || ""
          color: row.fg
        }
        T { text: row.it ? row.it.name : row.modelData.name; color: row.fg; width: row.width - 46; anchors.verticalCenter: parent.verticalCenter }
      }
      MouseArea {
        id: sa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: m => {
          if (m.button === Qt.RightButton) { const p = mapToItem(null, m.x, m.y); root.ctl.entryMenu(row.modelData, p.x, p.y, false); }
          else root.ctl.sideClicked(row.modelData);
        }
      }
    }
  }
}
