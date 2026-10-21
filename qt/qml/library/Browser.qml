// #browser: the toolbar (back/forward, breadcrumb, count, sort, grid/list, search, more), the grid or list of the
// current view, the empty-library screen and the selection bar (#49).
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR
import "../Lib.js" as Lib

Item {
  id: root
  property var ctl: null
  readonly property var pg: ctl.pg
  property alias search: search

  Item {   // #toolbar: padding 12px 18px, margin 0 12px, line below
    id: toolbar
    anchors { left: parent.left; right: parent.right; top: parent.top; leftMargin: 12; rightMargin: 12 }
    height: 56
    Row {
      id: tl
      anchors { left: parent.left; leftMargin: root.ctl.compact ? 0 : 18; verticalCenter: parent.verticalCenter }
      spacing: 6
      IconButton { html: "navBack"; tip: qsTr("Back"); opacity: root.ctl.nav.back.length || root.ctl.inPlayer ? 1 : 0.35; onClicked: root.ctl.goBack() }
      IconButton { html: "navFwd"; visible: !root.ctl.compact; tip: qsTr("Forward"); opacity: root.ctl.nav.fwd.length ? 1 : 0.35; onClicked: root.ctl.goFwd() }
    }
    Row {   // .path: the breadcrumb
      anchors { left: tl.right; leftMargin: 6; right: tr.left; rightMargin: 6; verticalCenter: parent.verticalCenter }
      spacing: 4; clip: true
      Repeater {
        model: root.pg.crumbs
        Row {
          required property var modelData
          required property int index
          readonly property bool last: index === root.pg.crumbs.length - 1
          spacing: 4
          T { visible: index > 0; text: "▶"; px: 9; color: Theme.dim; anchors.verticalCenter: parent.verticalCenter }
          Rectangle {
            width: cl.implicitWidth + 12; height: cl.implicitHeight + 4; radius: 4
            color: ca.containsMouse && !parent.last ? Theme.panel2 : "transparent"
            T { id: cl; anchors.centerIn: parent; text: modelData.label; px: 14; color: parent.parent.last ? Theme.text : Theme.text2; font.weight: parent.parent.last ? Font.DemiBold : Font.Normal }
            MouseArea { id: ca; anchors.fill: parent; hoverEnabled: true; enabled: !parent.parent.last && !!modelData.nav
                        onClicked: root.ctl.crumb(modelData.nav) }
          }
        }
      }
    }
    Row {
      id: tr
      anchors { right: parent.right; rightMargin: root.ctl.compact ? 0 : 18; verticalCenter: parent.verticalCenter }
      spacing: 6
      T { visible: !root.ctl.compact; text: root.pg.count ? root.ctl.itemsLabel(root.pg.count) : ""; color: Theme.muted; px: 12; anchors.verticalCenter: parent.verticalCenter; leftPadding: 6; rightPadding: 6 }
      IconButton { html: "sortBtn2"; tip: qsTr("Sort"); onClicked: root.ctl.toggleSort() }
      IconButton { html: "viewToggle"; visible: !root.ctl.compact; tip: qsTr("Grid / list"); onClicked: root.ctl.toggleList() }
      TextField {
        id: search
        width: root.ctl.compact ? 120 : 230; height: 30; color: Theme.panel2; border.color: input.activeFocus ? Theme.accent : "transparent"
        placeholder: "Search"; iconLeft: 20
        Icon { x: 9; anchors.verticalCenter: parent.verticalCenter; width: 14; height: 14; name: "search"; color: Theme.muted }
        input.onTextEdited: root.ctl.setQuery(input.text)
      }
      IconButton { id: more; html: "moreBtn"; tip: qsTr("More"); onClicked: { const p = more.mapToItem(null, more.width, more.height); root.ctl.moreMenu(p.x - 260, p.y + 4); } }
    }
    Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: Theme.line }
  }

  Item {   // .lhead: the column headers of the list view (stays on top); click to sort, again to reverse
    id: lhead
    anchors { left: parent.left; right: parent.right; top: toolbar.bottom; topMargin: 6 }
    height: grid.list && root.pg.list.length ? 32 : 0; visible: height > 0
    Rectangle {
      x: 30; width: parent.width - 60; height: 30; color: Theme.panel
      Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.edge }
      readonly property real fr: (width - 16 - 46 - 70 - 36) / 1.7
      Repeater {
        model: [["name", "Title"], ["album", "Artist / album"], ["duration", "Duration"]]
        T {
          required property var modelData
          required property int index
          readonly property bool on: root.ctl.nav.sort === modelData[0]
          x: index === 0 ? 8 + 46 + 12 : index === 1 ? 8 + 46 + 12 + parent.fr + 12 : parent.width - 8 - 70
          width: index === 2 ? 70 : parent.fr * (index ? 0.7 : 1)
          y: 4; px: 12
          horizontalAlignment: index === 2 ? Text.AlignRight : Text.AlignLeft
          text: qsTr(modelData[1]) + (on ? (root.ctl.nav.sortDesc ? " ▼" : " ▲") : "")
          color: on || ha.containsMouse ? Theme.text : Theme.muted
          MouseArea { id: ha; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.ctl.sortBy(modelData[0]) }
        }
      }
    }
  }
  ListView {   // #grid: repeat(auto-fill, minmax(190px, 1fr)), gap 22px 18px, padding 18px 30px 140px
    id: grid
    anchors { left: parent.left; right: parent.right; top: lhead.visible ? lhead.bottom : toolbar.bottom; bottom: parent.bottom }
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    readonly property bool list: root.ctl.nav.list
    readonly property real inner: width - 60
    readonly property int cols: Math.max(1, Math.floor((inner + 18) / (190 + 18)))
    readonly property real cell: (inner - 18 * (cols - 1)) / cols
    model: Lib.rows(root.pg.cards, cols, list)
    topMargin: list ? 4 : 18; bottomMargin: 140
    spacing: list ? 0 : 22
    cacheBuffer: 800
    C.ScrollBar.vertical: ScrollBar {}
    delegate: Item {
      id: row
      required property var modelData
      width: grid.width
      height: modelData.section !== undefined ? sec.implicitHeight + 4 : rowItems.height
      T { id: sec; visible: row.modelData.section !== undefined; x: 30 + (grid.list ? 8 : 0); y: 4; text: row.modelData.section || ""; px: 15; font.weight: Font.DemiBold; color: Theme.text }
      Row {
        id: rowItems
        x: 30; spacing: 18
        visible: row.modelData.cells !== undefined
        Repeater {
          model: row.modelData.cells || []
          Loader {
            required property var modelData
            sourceComponent: grid.list ? listC : cardC
            Component { id: cardC; Card { width: grid.cell; entry: modelData; ctl: root.ctl; reorder: root.pg.reorder } }
            Component { id: listC; ListRow { width: grid.width - 60; entry: modelData; ctl: root.ctl; reorder: root.pg.reorder } }
          }
        }
      }
    }
    MouseArea {   // a click on empty space clears the selection
      anchors.fill: parent; z: -1
      onClicked: root.ctl.clearSelection()
    }
  }

  Column {   // #empty
    visible: !!root.pg.empty
    anchors { horizontalCenter: parent.horizontalCenter; verticalCenter: parent.verticalCenter; verticalCenterOffset: 30 }
    spacing: 14
    Image {
      anchors.horizontalCenter: parent.horizontalCenter
      width: 90; height: 90; sourceSize: Qt.size(180, 180)
      source: Theme.logo
    }
    T { anchors.horizontalCenter: parent.horizontalCenter; text: root.pg.empty ? root.pg.empty.title : ""; px: 18; font.weight: Font.Medium; color: Theme.text }
    T { anchors.horizontalCenter: parent.horizontalCenter; text: root.pg.empty ? root.pg.empty.text : ""; color: Theme.muted }
    Row {
      anchors.horizontalCenter: parent.horizontalCenter
      spacing: 8
      Button { text: qsTr("Open files"); kind: "primary"; onClicked: root.ctl.doAct("files") }
      Button { text: qsTr("Add media folder"); onClicked: root.ctl.doAct("addfolder") }
      Button { text: qsTr("Network stream…"); onClicked: root.ctl.doAct("url") }
    }
  }

  Rectangle {   // #selbar: what to do with the selected items
    id: selbar
    readonly property var list: root.ctl.selectedItems
    readonly property bool show: list.length > 0
    anchors.horizontalCenter: parent.horizontalCenter
    y: parent.height - height - 22 + (show ? 0 : 20)
    opacity: show ? 1 : 0; visible: opacity > 0
    Behavior on opacity { NumberAnimation { duration: 150 } }
    Behavior on y { NumberAnimation { duration: 150 } }
    width: bar.implicitWidth + 20; height: bar.height + 16
    radius: 12; color: Theme.panel; border.width: 1; border.color: Theme.line
    Row {
      id: bar
      x: 10; y: 8; spacing: 6
      T { height: 32; verticalAlignment: Text.AlignVCenter; leftPadding: 8; rightPadding: 8; font.weight: Font.DemiBold; color: Theme.text
          text: qsTr("%1 selected").arg(selbar.list.length) }
      Repeater {
        model: selbar.show ? root.ctl.selActions(selbar.list).filter(a => a && !a.sep) : []
        Button { required property var modelData; compact: true; text: modelData.label; icon: modelData.icon || ""; danger: !!modelData.danger; onClicked: modelData.action() }
      }
      Button { compact: true; text: qsTr("Select all"); onClicked: root.ctl.selectAll() }
      Button { compact: true; text: qsTr("Clear selection"); icon: "x"; onClicked: root.ctl.clearSelection() }
    }
  }
}
