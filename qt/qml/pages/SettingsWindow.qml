// The settings window of v2.x (Global settings): 980px wide, up to 760px high; on the left the search field and the
// categories (230px, bg2), on the right the category's title bar and its settings. Searching shows the matching
// settings of every category, under the category's name.
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR

DialogBox {
  id: win
  property string current: "general"
  property var ctl: null
  // a phone (#53): full screen; first the list of categories (Pro on top), a tap shows that page with a back arrow
  readonly property bool phone: !!ctl && ctl.phone
  property bool phoneList: phone
  fullScreen: phone
  showHead: false
  buttons: []
  bodyPadding: 0
  maxWidth: 980
  readonly property var cats: [
    ["App"], ["general", "General", "general"], ["interface", "Interface", "pointer"], ["privacy", "Privacy", "shield"], ["controls", "Controls", "keyboard"],
    ["Media"], ["playback", "Playback", "play"], ["video", "Video", "video"], ["audio", "Audio", "audio"], ["subtitles", "Subtitles", "subtitle"], ["library", "Library", "library"],
    ["System"], ["network", "Network", "network"], ["performance", "Performance", "general"], ["recording", "Recording", "record"], ["extensions", "Extensions", "puzzle"]
  ].concat(ctl && ctl.devPages ? [["Design system"], ["components", "Components", "puzzle"]] : [])
   .filter(c => !(ctl && ctl.phone) || ["controls", "performance", "extensions"].indexOf(c[0]) < 0)   // (a phone: no keyboard, no add-ons)
  readonly property var titles: ({ about: "About", general: "Global settings", interface: "Interface", privacy: "Privacy", controls: "Controls", playback: "Playback",
    video: "Video", audio: "Audio defaults", subtitles: "Subtitles", library: "Library", network: "Network", performance: "Performance",
    recording: "Recording", extensions: "Extensions", components: "Components" })
  function file(k) { return k.charAt(0).toUpperCase() + k.slice(1) + "Page.qml"; }
  onClosed: SettingsSearch.q = ""

  Item {
    width: parent.width
    height: win.phone ? (C.Overlay.overlay ? C.Overlay.overlay.height : 800) : Math.min(760, (C.Overlay.overlay ? C.Overlay.overlay.height : 800) - 40)
    Rectangle {   // .gside
      id: side
      width: win.phone ? (win.phoneList ? parent.width : 0) : 230; height: parent.height; color: Theme.bg2; radius: win.phone ? 0 : 10
      visible: width > 0
      Item {   // a phone: the title and close
        id: phoneHead
        visible: win.phone; width: parent.width; height: win.phone ? 56 + (win.ctl ? win.ctl.safeTop : 0) : 0
        T { x: 18; anchors.bottom: parent.bottom; anchors.bottomMargin: 16; text: qsTr("Settings"); px: 20; color: Theme.text }
        IconButton { anchors { right: parent.right; rightMargin: 8; bottom: parent.bottom; bottomMargin: 6 } width: 44; height: 44; iconSize: 20; name: "x"; tip: qsTr("Close"); onClicked: win.close() }
      }
      ProCard { id: proCard; visible: win.phone && Store.inStore; ctl: win.ctl; x: 10; y: phoneHead.height + search.height + 20; width: parent.width - 20 }
      Rectangle { anchors.right: parent.right; width: 10; height: parent.height; color: Theme.bg2 }
      TextField {
        id: search
        x: 10; y: phoneHead.height + 10; width: parent.width - 20; height: win.phone ? 42 : 34; color: Theme.track; border.color: input.activeFocus ? Theme.accent : "transparent"
        placeholder: "Search"; iconLeft: 22
        Icon { x: 12; anchors.verticalCenter: parent.verticalCenter; width: 14; height: 14; name: "search"; color: Theme.muted }
        input.onTextChanged: SettingsSearch.q = input.text.trim()
      }
      ListView {
        anchors { left: parent.left; right: parent.right; top: proCard.visible ? proCard.bottom : search.bottom; bottom: about.top; leftMargin: 10; rightMargin: 10; topMargin: 10; bottomMargin: 6 }
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
              readonly property bool on: !SettingsSearch.q && win.current === modelData[0]
              height: win.phone ? 48 : 36; radius: Theme.radius
              color: on || na.containsMouse ? Theme.panel2 : "transparent"
              Row {
                x: 10; anchors.verticalCenter: parent.verticalCenter; spacing: 12
                Icon { width: 18; height: 18; name: modelData[2]; color: parent.parent.on ? Theme.accent : Theme.muted; anchors.verticalCenter: parent.verticalCenter }
                T { text: qsTr(modelData[1]); color: parent.parent.on ? Theme.text : Theme.text2; anchors.verticalCenter: parent.verticalCenter }
              }
              MouseArea { id: na; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { search.text = ""; win.current = modelData[0]; win.phoneList = false; } }
            }
          }
        }
      }
      Rectangle { anchors { left: parent.left; right: parent.right; bottom: about.top; leftMargin: 10; rightMargin: 10 } height: 1; color: Theme.line }
      Rectangle {   // .gabout: About at the bottom of the list
        id: about
        readonly property bool on: !SettingsSearch.q && win.current === "about"
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom; leftMargin: 10; rightMargin: 10; bottomMargin: 10 }
        height: win.phone ? 48 : 36; radius: Theme.radius; color: on || aa.containsMouse ? Theme.panel2 : "transparent"
        Row { x: 10; anchors.verticalCenter: parent.verticalCenter; spacing: 12
          Icon { width: 18; height: 18; name: "info"; color: about.on ? Theme.accent : Theme.muted; anchors.verticalCenter: parent.verticalCenter }
          T { text: qsTr("About"); color: about.on ? Theme.text : Theme.text2; anchors.verticalCenter: parent.verticalCenter } }
        MouseArea { id: aa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { search.text = ""; win.current = "about"; win.phoneList = false; } }
      }
    }
    Item {   // .gmain
      anchors { left: win.phone ? parent.left : side.right; right: parent.right; top: parent.top; bottom: parent.bottom }
      visible: !win.phone || !win.phoneList
      Rectangle {   // .gtop
        id: top
        width: parent.width; height: win.phone ? 56 + (win.ctl ? win.ctl.safeTop : 0) : 50; color: Theme.bg2; radius: win.phone ? 0 : 10
        IconButton { visible: win.phone; anchors { left: parent.left; leftMargin: 6; bottom: parent.bottom; bottomMargin: 6 } width: 44; height: 44; iconSize: 20
                     html: "navBack"; tip: qsTr("Back"); onClicked: win.phoneList = true }
        Rectangle { anchors.left: parent.left; width: 10; height: parent.height; color: Theme.bg2 }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 10; color: Theme.bg2 }
        T { x: win.phone ? 56 : 24; anchors.verticalCenter: win.phone ? undefined : parent.verticalCenter; anchors.bottom: win.phone ? parent.bottom : undefined
            anchors.bottomMargin: 18; px: win.phone ? 17 : 15
            text: SettingsSearch.q ? qsTr("Search: \"%1\"").arg(SettingsSearch.q) : qsTr(win.titles[win.current] || win.current) }
        IconButton { anchors { right: parent.right; rightMargin: 18; verticalCenter: parent.verticalCenter } name: "x"; tip: qsTr("Close"); onClicked: win.close() }
      }
      Flickable {   // .gcontent
        id: flick
        anchors { left: parent.left; right: parent.right; top: top.bottom; bottom: parent.bottom; leftMargin: win.phone ? 14 : 24 }
        contentHeight: (SettingsSearch.q ? results.implicitHeight : page.implicitHeight) + 34
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        C.ScrollBar.vertical: ScrollBar {}
        Loader {
          id: page
          visible: !SettingsSearch.q
          y: 4; width: flick.width - (win.phone ? 14 : 24)
          Component.onCompleted: load()
          function load() { setSource(win.file(win.current), { ctl: win.ctl }); flick.contentY = 0; }
          Connections { target: win; function onCurrentChanged() { page.load(); } }
        }
        Column {   // search: every category, each with its matching settings
          id: results
          visible: !!SettingsSearch.q
          y: 4; width: flick.width - 24
          Repeater {
            model: SettingsSearch.q ? win.cats.filter(c => c.length > 1 && c[0] !== "components").map(c => c[0]) : []
            Column {
              id: cat
              required property string modelData
              width: results.width
              visible: SettingsSearch.any(ld.item || cat)
              T { text: qsTr(win.titles[cat.modelData]).toUpperCase(); px: 12; color: Theme.accent; font.letterSpacing: 0.6; topPadding: 18; bottomPadding: 0 }
              Loader { id: ld; width: parent.width; Component.onCompleted: setSource(win.file(cat.modelData), { ctl: win.ctl }) }
            }
          }
          Note { visible: !!SettingsSearch.q && !Array.from(results.children).some(c => c.modelData !== undefined && c.visible); text: qsTr("Nothing found.") }
        }
      }
    }
  }
}
