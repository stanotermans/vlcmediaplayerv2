// The settings window of v2.x (Global settings): 980px wide, up to 760px high; on the left the search field and the
// categories (230px, bg2), on the right the category's title bar and its settings. Phase 1: the Interface page and
// a page with every component; the other categories follow in phase 5.
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR

DialogBox {
  id: win
  property string current: "interface"
  showHead: false
  buttons: []
  bodyPadding: 0
  maxWidth: 980
  readonly property var cats: [
    ["App"], ["general", "General", "general"], ["interface", "Interface", "pointer"], ["privacy", "Privacy", "shield"], ["controls", "Controls", "keyboard"],
    ["Media"], ["playback", "Playback", "play"], ["video", "Video", "video"], ["audio", "Audio", "audio"], ["subtitles", "Subtitles", "subtitle"], ["library", "Library", "library"],
    ["System"], ["network", "Network", "network"], ["performance", "Performance", "general"], ["recording", "Recording", "record"], ["extensions", "Extensions", "puzzle"],
    ["Design system"], ["components", "Components", "puzzle"]
  ]
  readonly property var titles: ({ interface: "Interface", components: "Components" })

  Item {
    width: parent.width
    height: Math.min(760, (C.Overlay.overlay ? C.Overlay.overlay.height : 800) - 40)
    Rectangle {   // .gside
      id: side
      width: 230; height: parent.height; color: Theme.bg2; radius: 10
      Rectangle { anchors.right: parent.right; width: 10; height: parent.height; color: Theme.bg2 }
      TextField {
        id: search
        x: 10; y: 10; width: parent.width - 20; height: 34; color: Theme.track; border.color: input.activeFocus ? Theme.accent : "transparent"
        placeholder: "Search"; iconLeft: 22
        Icon { x: 12; anchors.verticalCenter: parent.verticalCenter; width: 14; height: 14; name: "search"; color: Theme.muted }
      }
      ListView {
        anchors { left: parent.left; right: parent.right; top: search.bottom; bottom: about.top; leftMargin: 10; rightMargin: 10; topMargin: 10; bottomMargin: 6 }
        clip: true
        model: win.cats
        C.ScrollBar.vertical: ScrollBar {}
        delegate: Loader {
          required property var modelData
          width: ListView.view.width
          sourceComponent: modelData.length === 1 ? headC : btnC
          Component { id: headC; T { leftPadding: 10; topPadding: 12; bottomPadding: 6; text: qsTr(modelData[0]); px: 12; color: Theme.muted } }
          Component {
            id: btnC
            Rectangle {
              readonly property bool on: win.current === modelData[0]
              height: 36; radius: Theme.radius
              color: on || na.containsMouse ? Theme.panel2 : "transparent"
              Row {
                x: 10; anchors.verticalCenter: parent.verticalCenter; spacing: 12
                Icon { width: 18; height: 18; name: modelData[2]; color: parent.parent.on ? Theme.accent : Theme.muted; anchors.verticalCenter: parent.verticalCenter }
                T { text: qsTr(modelData[1]); color: parent.parent.on ? Theme.text : Theme.text2; anchors.verticalCenter: parent.verticalCenter }
              }
              MouseArea { id: na; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: win.current = modelData[0] }
            }
          }
        }
      }
      Rectangle { anchors { left: parent.left; right: parent.right; bottom: about.top; leftMargin: 10; rightMargin: 10 } height: 1; color: Theme.line }
      Rectangle {   // .gabout: About at the bottom of the list
        id: about
        readonly property bool on: win.current === "about"
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom; leftMargin: 10; rightMargin: 10; bottomMargin: 10 }
        height: 36; radius: Theme.radius; color: on || aa.containsMouse ? Theme.panel2 : "transparent"
        Row { x: 10; anchors.verticalCenter: parent.verticalCenter; spacing: 12
          Icon { width: 18; height: 18; name: "info"; color: about.on ? Theme.accent : Theme.muted; anchors.verticalCenter: parent.verticalCenter }
          T { text: qsTr("About"); color: about.on ? Theme.text : Theme.text2; anchors.verticalCenter: parent.verticalCenter } }
        MouseArea { id: aa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: win.current = "about" }
      }
    }
    Item {   // .gmain
      anchors { left: side.right; right: parent.right; top: parent.top; bottom: parent.bottom }
      Rectangle {   // .gtop
        id: top
        width: parent.width; height: 50; color: Theme.bg2; radius: 10
        Rectangle { anchors.left: parent.left; width: 10; height: parent.height; color: Theme.bg2 }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 10; color: Theme.bg2 }
        T { x: 24; anchors.verticalCenter: parent.verticalCenter; text: qsTr(win.titles[win.current] || win.current); px: 15 }
        IconButton { anchors { right: parent.right; rightMargin: 18; verticalCenter: parent.verticalCenter } name: "x"; tip: qsTr("Close"); onClicked: win.close() }
      }
      Flickable {   // .gcontent
        id: flick
        anchors { left: parent.left; right: parent.right; top: top.bottom; bottom: parent.bottom; leftMargin: 24 }
        contentHeight: page.implicitHeight + 34
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        C.ScrollBar.vertical: ScrollBar {}
        Loader {
          id: page
          y: 4; width: flick.width - 24
          source: win.current === "interface" ? "InterfacePage.qml" : win.current === "components" ? "ComponentsPage.qml" : ""
        }
      }
    }
  }
}
