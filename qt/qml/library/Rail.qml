// #rail: the views (Home … Recent) and "Add item". 52px; with "Sidebar with labels" (navExpanded) 200px on bg2 with
// the names, and the library panel hides.
import QtQuick
import VLCR

Rectangle {
  id: root
  property var ctl: null
  property bool horizontal: false          // (a phone: a bar at the bottom with the names under the icons)
  readonly property bool expanded: !horizontal && !!Settings.values.navExpanded
  readonly property var views: horizontal ? model.filter(v => v[0] !== "network") : model
  readonly property var model: [["home", "Home"], ["videos", "Videos"], ["music", "Music"], ["network", "Network"], ["playlists", "Playlists"], ["recent", "Recent"], ["add", "Add item"]]
  width: horizontal ? 0 : expanded ? 200 : 52
  height: horizontal ? 60 : 0
  Behavior on width { NumberAnimation { duration: 180 } }
  color: expanded ? Theme.bg2 : Theme.bg
  radius: expanded ? 8 : 0
  Rectangle { visible: root.expanded; width: 8; height: parent.height; color: Theme.bg2 }   // square on the left
  Rectangle { visible: !root.expanded && !root.horizontal; anchors { right: parent.right; top: parent.top; bottom: parent.bottom } width: 1; color: Theme.edge }
  Rectangle { visible: root.horizontal; anchors { left: parent.left; right: parent.right; top: parent.top } height: 1; color: Theme.edge }
  clip: true
  Grid {
    anchors { fill: parent; topMargin: root.horizontal ? 2 : 8; leftMargin: 6; rightMargin: 6 }
    columns: root.horizontal ? root.views.length : 1
    spacing: root.horizontal ? 0 : 4
    Repeater {
      model: root.views
      Rectangle {
        id: nb
        required property var modelData
        readonly property bool on: root.ctl.nav.view === modelData[0]
        readonly property string label: modelData[0] === "music" && Settings.values.audioLabel ? qsTr("Audio") : qsTr(modelData[1])
        width: root.horizontal ? (root.width - 12) / root.views.length : root.width - 12; height: root.horizontal ? 56 : 38; radius: Theme.radius
        color: ra.containsMouse || (root.expanded && on) ? Theme.panel2 : "transparent"
        Accessible.role: Accessible.Button; Accessible.name: label
        Column {   // a phone: the icon with its name under it
          visible: root.horizontal; anchors.centerIn: parent; spacing: 4
          Icon { width: 22; height: 22; anchors.horizontalCenter: parent.horizontalCenter
                 html: nb.modelData[0] === "add" ? "addBtn" : "view_" + nb.modelData[0]; color: nb.on ? Theme.accent : Theme.muted }
          T { text: nb.modelData[0] === "add" ? qsTr("Add") : nb.label; px: 11; width: Math.min(implicitWidth, nb.width - 4); elide: Text.ElideRight
              anchors.horizontalCenter: parent.horizontalCenter; color: nb.on ? Theme.text : Theme.muted }
        }
        Row {
          visible: !root.horizontal
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
            if (nb.modelData[0] === "add") { const p = root.horizontal ? nb.mapToItem(null, 0, -8) : nb.mapToItem(null, nb.width + 4, 0); root.ctl.menu(root.ctl.openMediaItems(), p.x, p.y); }
            else root.ctl.showView(nb.modelData[0]);
          }
        }
      }
    }
  }
}
