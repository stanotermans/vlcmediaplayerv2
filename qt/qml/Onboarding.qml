// First-run onboarding (v2.x onboarding.js): language → welcome and media folder → theme and accent → default player
// → keyboard shortcuts. Covers the window below the title bar.
import QtQuick
import QtQuick.Dialogs
import VLCR

Rectangle {
  id: ob
  property var ctl: null
  property int step: 0
  property string folder: (Settings.values.mediaFolders || [])[0] || ctl.library.videosDir()
  property string defaultResult: ""
  signal done()
  color: Theme.bg2
  MouseArea { anchors.fill: parent; acceptedButtons: Qt.AllButtons; hoverEnabled: true; onWheel: w => w.accepted = true }
  // "Choose your language" in each language, so everyone can find their own
  readonly property var hello: ({ en: "Choose your language", nl: "Kies je taal", de: "Wähle deine Sprache", fr: "Choisissez votre langue", es: "Elige tu idioma",
                                  it: "Scegli la tua lingua", pt: "Escolha o seu idioma", pl: "Wybierz język" })
  readonly property string cone: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.6 2h4.8l1.2 4H8.4z" fill="' + Theme.accent + '"/><path d="M8.1 7h7.8l1.1 4H7z" fill="' + Theme.bg2 + '" opacity=".9"/><path d="M6.7 12h10.6l1.2 4.5H5.5z" fill="' + Theme.accent + '"/><path d="M3 18h18l1 3H2z" fill="' + Theme.accent + '"/></svg>')
  Component.onCompleted: if (!Settings.values.language) Settings.set("language", I18n.detect())   // preselect the system language

  function finish() {
    if (!Settings.values.language) Settings.set("language", I18n.language);
    Settings.set("onboarded", true);
    if (folder && (Settings.values.mediaFolders || []).indexOf(folder) < 0) ctl.addFolder(folder);
    done();
  }
  component Nav: Row {
    property bool back: true
    property string next: "Continue"
    signal go()
    spacing: 10
    Button { visible: parent.back; width: Math.max(96, implicitWidth); text: qsTr("Back"); onClicked: ob.step-- }
    Button { width: Math.max(96, implicitWidth); text: qsTr(parent.next); kind: "primary"; onClicked: parent.go() }
  }

  Loader {
    anchors.fill: parent
    sourceComponent: [langC, welcomeC, themeC, defaultC, keysC][ob.step]
  }
  Row {   // .ob-progress
    anchors { horizontalCenter: parent.horizontalCenter; bottom: parent.bottom; bottomMargin: 16 }
    spacing: 6
    Repeater { model: 5
      Rectangle { required property int index; width: index === ob.step ? 18 : 6; height: 6; radius: 3; color: index === ob.step ? Theme.accent : Theme.line
                  Behavior on width { NumberAnimation { duration: 200 } } } }
  }

  Component {
    id: langC
    Item {
      Column {
        anchors.centerIn: parent
        spacing: 0
        Image { anchors.horizontalCenter: parent.horizontalCenter; width: 84; height: 84; sourceSize: Qt.size(168, 168); source: ob.cone }
        T { anchors.horizontalCenter: parent.horizontalCenter; topPadding: 26; bottomPadding: 10; px: 30; font.weight: Font.Light; color: Theme.text; text: ob.hello[I18n.language] || ob.hello.en }
        T { anchors.horizontalCenter: parent.horizontalCenter; bottomPadding: 26; color: Theme.muted; text: qsTr("You can change this later in Settings.") }
        Grid {   // .ob-langs
          anchors.horizontalCenter: parent.horizontalCenter
          columns: 2; spacing: 10
          Repeater {
            model: I18n.languages
            Rectangle {   // .ob-lang
              required property var modelData
              readonly property bool on: I18n.language === modelData[0]
              width: 255; height: 50; radius: 10
              color: on ? Theme.accentSoft : Theme.panel; border.width: 1; border.color: on ? Theme.accent : la.containsMouse ? Theme.dim : Theme.line
              T { x: 18; anchors.verticalCenter: parent.verticalCenter; text: modelData[1]; px: 15; color: parent.on ? Theme.text : Theme.text2 }
              T { anchors { right: parent.right; rightMargin: 18; verticalCenter: parent.verticalCenter } text: modelData[0].toUpperCase(); px: 11; font.letterSpacing: 0.7; color: parent.on ? Theme.accent : Theme.muted }
              MouseArea { id: la; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                          onClicked: Settings.set("language", modelData[0]); onDoubleClicked: ob.step = 1 }
            }
          }
        }
      }
      Nav { anchors { right: parent.right; bottom: parent.bottom; rightMargin: 38; bottomMargin: 30 } back: false; onGo: ob.step = 1 }
    }
  }
  Component {
    id: welcomeC
    Item {
      Column {
        anchors.centerIn: parent
        width: 560
        Image { anchors.horizontalCenter: parent.horizontalCenter; width: 84; height: 84; sourceSize: Qt.size(168, 168); source: ob.cone }
        T { anchors.horizontalCenter: parent.horizontalCenter; topPadding: 26; bottomPadding: 22; px: 30; font.weight: Font.Light; color: Theme.text; text: qsTr("Welcome to VLC!") }
        T { width: parent.width; wrapMode: Text.Wrap; elide: Text.ElideNone; lineHeight: 1.7; color: Theme.muted
            text: qsTr("VLC is a free and open source multimedia player that plays most video and audio files, as well as network streams and subtitles.") }
        T { topPadding: 34; bottomPadding: 8; px: 12; color: Theme.muted; text: qsTr("Choose a media folder to get started with") }
        Row { spacing: 8; width: parent.width
          TextField { width: parent.width - browse.width - 8; text: ob.folder; input.readOnly: true; placeholder: "No folder – add one later in Settings" }
          Button { id: browse; text: qsTr("Browse"); onClicked: fd.open() } }
        T { topPadding: 8; px: 12; color: sk.containsMouse ? Theme.text2 : Theme.dim; text: qsTr("Skip for now")
            MouseArea { id: sk; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: ob.folder = "" } }
      }
      FolderDialog { id: fd; title: qsTr("Choose media folder"); onAccepted: ob.folder = ob.ctl.library.toLocal(selectedFolder) }
      Nav { anchors { right: parent.right; bottom: parent.bottom; rightMargin: 38; bottomMargin: 30 } onGo: ob.step = 2 }
    }
  }
  Component {
    id: themeC
    Item {
      Rectangle {   // .ob-preview: a miniature player window in the chosen theme and accent
        anchors { left: parent.left; right: parent.right; top: parent.top; bottom: bottomBar.top; margins: 14; bottomMargin: 0 }
        radius: 8; color: Theme.panel; border.width: 1; border.color: Theme.line; clip: true
        Rectangle { id: pvTitle; width: parent.width; height: 22; color: Theme.bg
          Row { x: 8; anchors.verticalCenter: parent.verticalCenter; spacing: 6
            Image { width: 14; height: 14; sourceSize: Qt.size(28, 28); source: ob.cone } }
          Row { anchors { right: parent.right; rightMargin: 8; verticalCenter: parent.verticalCenter } spacing: 6
            Repeater { model: 3; Rectangle { width: 8; height: 8; radius: 2; color: "transparent"; border.width: 1; border.color: Theme.dim } } } }
        Rectangle {   // .ob-pv-stage
          anchors { left: parent.left; right: parent.right; top: pvTitle.bottom; bottom: pvBar.top }
          color: Theme.mix(Theme.panel, Theme.black0, 0.6)
          Column {
            anchors.centerIn: parent; spacing: 30
            T { anchors.horizontalCenter: parent.horizontalCenter; px: 20; font.weight: Font.Light; color: Theme.text; text: qsTr("Select your preferred theme and color.") }
            Row {
              anchors.horizontalCenter: parent.horizontalCenter; spacing: 36
              Repeater {
                model: [["light", "Light"], ["dark", "Dark"], ["system", "System"]]
                Column {
                  required property var modelData
                  readonly property bool on: Settings.values.theme === modelData[0]
                  spacing: 10
                  Item { width: 84; height: 84
                    Rectangle { anchors.fill: parent; anchors.margins: -7; radius: 16; color: "transparent"; border.width: 3; border.color: parent.parent.on ? Theme.accent : "transparent" }
                    Rectangle { anchors.fill: parent; radius: 12; clip: true; color: modelData[0] === "light" ? "#c8c8c8" : "#262626"
                      Canvas { anchors.fill: parent; visible: modelData[0] === "system"
                               onPaint: { const g = getContext("2d"); g.fillStyle = "#c8c8c8"; g.beginPath(); g.moveTo(width * 0.62, 0); g.lineTo(width, 0); g.lineTo(width, height); g.lineTo(width * 0.38, height); g.fill(); } } }
                    MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: Settings.set("theme", modelData[0]) } }
                  T { anchors.horizontalCenter: parent.horizontalCenter; px: 12; color: Theme.muted; text: qsTr(modelData[1]) }
                }
              }
            }
          }
        }
        Rectangle {   // .ob-pv-bar
          id: pvBar
          anchors.bottom: parent.bottom; width: parent.width; height: 30; color: Theme.bg
          Row { x: 8; anchors.verticalCenter: parent.verticalCenter; spacing: 6
            Icon { width: 11; height: 11; name: "prev"; anchors.verticalCenter: parent.verticalCenter }
            Rectangle { width: 26; height: 15; radius: 3; color: Theme.accent; anchors.verticalCenter: parent.verticalCenter
              Icon { anchors.centerIn: parent; width: 9; height: 9; name: "play_fill"; filled: true; color: Theme.accentText } }
            Icon { width: 11; height: 11; name: "next"; anchors.verticalCenter: parent.verticalCenter }
            T { px: 9; color: Theme.muted; text: "00:02:10"; anchors.verticalCenter: parent.verticalCenter } }
          Rectangle { anchors { left: parent.left; right: parent.right; leftMargin: 160; rightMargin: 200; verticalCenter: parent.verticalCenter } height: 9; radius: 2; color: Theme.track
            Rectangle { width: parent.width * 0.08; height: parent.height; radius: 2; color: Theme.accentDark
              Rectangle { anchors.right: parent.right; width: 3; height: parent.height; color: Theme.accent } } }
          Row { anchors { right: parent.right; rightMargin: 8; verticalCenter: parent.verticalCenter } spacing: 6
            T { px: 9; color: Theme.muted; text: "00:25:40"; anchors.verticalCenter: parent.verticalCenter }
            Icon { width: 11; height: 11; name: "volume"; anchors.verticalCenter: parent.verticalCenter }
            Rectangle { width: 40; height: 8; radius: 2; color: Theme.track; anchors.verticalCenter: parent.verticalCenter
              Rectangle { width: 22; height: 8; radius: 2; color: Theme.vol1 } }
            Icon { width: 11; height: 11; name: "audio"; anchors.verticalCenter: parent.verticalCenter }
            Icon { width: 11; height: 11; name: "subtitle"; anchors.verticalCenter: parent.verticalCenter }
            Icon { width: 11; height: 11; name: "settings"; anchors.verticalCenter: parent.verticalCenter } }
        }
      }
      Item {   // .ob-bottom: accent dots and the buttons
        id: bottomBar
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom; leftMargin: 38; rightMargin: 38 }
        height: 110
        Row { anchors.verticalCenter: parent.verticalCenter; anchors.verticalCenterOffset: -5; spacing: 18
          Repeater { model: Settings.accents
            Item { required property string modelData; width: 30; height: 30
              readonly property bool on: String(Settings.values.accent).toLowerCase() === modelData.toLowerCase()
              Rectangle { anchors.fill: parent; anchors.margins: -7; radius: width; color: "transparent"; border.width: 3; border.color: parent.on ? Theme.alpha(modelData, 0.45) : "transparent" }
              Rectangle { anchors.fill: parent; radius: 15; color: modelData; opacity: parent.on ? 1 : da.containsMouse ? 0.9 : 0.6 }
              MouseArea { id: da; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: Settings.set("accent", modelData) } } } }
        Nav { anchors { right: parent.right; verticalCenter: parent.verticalCenter; verticalCenterOffset: -5 } onGo: ob.step = 3 }
      }
    }
  }
  Component {
    id: defaultC
    Item {
      Column {
        anchors.centerIn: parent
        width: 560
        Image { anchors.horizontalCenter: parent.horizontalCenter; width: 84; height: 84; sourceSize: Qt.size(168, 168); source: ob.cone }
        T { anchors.horizontalCenter: parent.horizontalCenter; topPadding: 26; bottomPadding: 22; px: 30; font.weight: Font.Light; color: Theme.text; text: qsTr("Make VLC your default player") }
        T { width: 460; anchors.horizontalCenter: parent.horizontalCenter; horizontalAlignment: Text.AlignHCenter   // .ob-default .ob-lead
            wrapMode: Text.Wrap; elide: Text.ElideNone; lineHeight: 1.7; color: Theme.muted
            text: qsTr("Then videos and music open in VLC Redesign when you double-click them. You can also do this later in Settings → General.") }
        Item { width: 1; height: 24 }
        Button { anchors.horizontalCenter: parent.horizontalCenter; text: qsTr("Set as default player"); kind: "primary"; onClicked: ob.defaultResult = ob.ctl.setDefaultPlayer() }
        T { visible: ob.defaultResult !== ""; width: parent.width; topPadding: 14; wrapMode: Text.Wrap; elide: Text.ElideNone; horizontalAlignment: Text.AlignHCenter; color: Theme.muted; text: ob.defaultResult }
      }
      Nav { anchors { right: parent.right; bottom: parent.bottom; rightMargin: 38; bottomMargin: 30 } onGo: ob.step = 4 }
    }
  }
  Component {
    id: keysC
    Item {
      Column {
        anchors { fill: parent; leftMargin: 60; rightMargin: 60; topMargin: 40 }
        T { anchors.horizontalCenter: parent.horizontalCenter; bottomPadding: 24; px: 20; font.weight: Font.Light; color: Theme.text; text: qsTr("Learn the basic keyboard shortcuts.") }
        Grid {   // .kbgrid
          width: parent.width; columns: 2; columnSpacing: 40; rowSpacing: 0
          Repeater {
            model: [["Play / pause", ["Space"]], ["Fullscreen", ["F"]], ["Seek backward / forward", ["←", "→"]], ["Volume up / down", ["↑", "↓"]],
                    ["Previous / next", ["<", ">"]], ["Show / hide queue", ["Q"]], ["Previous / next frame", [",", "."]], ["Show / hide library", ["L"]],
                    ["Cycle subtitle track", ["V"]], ["Snapshot", ["SHIFT", "S"]], ["Cycle audio track", ["B"]], ["Record", ["SHIFT", "R"]]]
            Item { required property var modelData; width: (parent.width - 40) / 2; height: 46
              T { anchors.verticalCenter: parent.verticalCenter; text: qsTr(modelData[0]); color: Theme.text2 }
              KeyCaps { anchors { right: parent.right; verticalCenter: parent.verticalCenter } caps: modelData[1] } }
          }
        }
      }
      T { anchors { left: parent.left; leftMargin: 60; bottom: parent.bottom; bottomMargin: 40 } px: 12; color: Theme.muted; text: qsTr("Find the full list in the menu (F1).") }
      Nav { anchors { right: parent.right; bottom: parent.bottom; rightMargin: 60; bottomMargin: 30 } next: "Finish"; onGo: ob.finish() }
    }
  }
}
