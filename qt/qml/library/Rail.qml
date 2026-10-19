// #rail: the views (Home … Recent) and "Add item". 52px; with "Sidebar with labels" (navExpanded) 200px on bg2 with
// the names, and the library panel hides.
import QtQuick
import VLCR

Rectangle {
  id: root
  property var ctl: null
  readonly property bool expanded: !!Settings.values.navExpanded
  width: expanded ? 200 : 52
  Behavior on width { NumberAnimation { duration: 180 } }
  color: expanded ? Theme.bg2 : Theme.bg
  radius: expanded ? 8 : 0
  Rectangle { visible: root.expanded; width: 8; height: parent.height; color: Theme.bg2 }   // square on the left
  Rectangle { visible: !root.expanded; anchors { right: parent.right; top: parent.top; bottom: parent.bottom } width: 1; color: Theme.edge }
  clip: true
  Column {
    anchors { fill: parent; topMargin: 8; leftMargin: 6; rightMargin: 6 }
    spacing: 4
    Repeater {
      model: [["home", "Home"], ["videos", "Videos"], ["music", "Music"], ["network", "Network"], ["playlists", "Playlists"], ["recent", "Recent"], ["add", "Add item"]]
      Rectangle {
        id: nb
        required property var modelData
        readonly property bool on: root.ctl.nav.view === modelData[0]
        readonly property string label: modelData[0] === "music" && Settings.values.audioLabel ? qsTr("Audio") : qsTr(modelData[1])
        width: parent.width; height: 38; radius: Theme.radius
        color: ra.containsMouse || (root.expanded && on) ? Theme.panel2 : "transparent"
        Accessible.role: Accessible.Button; Accessible.name: label
        Row {
          x: 11; anchors.verticalCenter: parent.verticalCenter; spacing: 12
          Icon { width: 18; height: 18; anchors.verticalCenter: parent.verticalCenter
                 html: nb.modelData[0] === "add" ? "addBtn" : "view_" + nb.modelData[0]
                 color: nb.on ? Theme.accent : ra.containsMouse ? Theme.text : Theme.muted }
          T { text: nb.label; anchors.verticalCenter: parent.verticalCenter; opacity: root.expanded ? 1 : 0
              color: root.expanded && nb.on ? Theme.text : Theme.text2
              Behavior on opacity { NumberAnimation { duration: 150 } } }
        }
        MouseArea {
          id: ra; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
          onClicked: {
            if (nb.modelData[0] === "add") { const p = nb.mapToItem(null, nb.width + 4, 0); root.ctl.menu(root.ctl.openMediaItems(), p.x, p.y); }
            else root.ctl.showView(nb.modelData[0]);
          }
        }
      }
    }
  }
}
