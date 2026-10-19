// The main window: title bar, rail, library panel, library grid / player and the control bar, as in v2.x.
// (Phase 1: the design system; the screens themselves are built out in phases 2 and 3.)
import QtQuick
import QtQuick.Window
import QtQuick.Controls.Basic as C
import QtMultimedia
import VLCR

C.ApplicationWindow {
  id: win
  width: 1600; height: 1000
  visible: true
  color: Theme.bg
  title: inPlayer ? current.name || "VLC Redesign" : "VLC Redesign"
  flags: Qt.Window | Qt.FramelessWindowHint
  property bool inPlayer: false
  property var current: ({})

  function fmt(ms) { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
                     return [h, m, x].map(n => String(n).padStart(2, '0')).join(':'); }
  function shortFmt(s) { if (!s) return ''; const m = Math.floor(s / 60), x = s % 60; return m + ':' + String(x).padStart(2, '0'); }
  function playItem(it) { current = it; inPlayer = true; player.open(it.path); }
  function toggleMax() { win.visibility === Window.Maximized ? win.showNormal() : win.showMaximized(); }
  function menu(items, x, y) {
    const m = Qt.createComponent("controls/ContextMenu.qml").createObject(C.Overlay.overlay, { items: items });
    m.open(); m.placeAt(x, y);
    return m;
  }
  function openSettings(page) { const w = Qt.createComponent("pages/SettingsWindow.qml").createObject(C.Overlay.overlay, { current: page || "interface" }); w.closed.connect(() => w.destroy()); w.open(); }

  Library { id: library }
  VlcPlayer { id: player; videoSink: video.videoSink }
  WindowFrame { id: frame; maximizeButton: maxBtn }
  Component.onCompleted: {
    library.scan(startFolder || "C:/Users/Stan Otermans/Desktop/VLC Media Player/testmedia");
    if (autoPlay) playItem({ name: autoPlay.split(/[\\/]/).pop(), path: autoPlay });
    if (openAtStart.startsWith("settings")) openSettings(openAtStart.split(":")[1]);
    if (openAtStart === "menu") Qt.callLater(() => { const m = win.menu(win.playerMenu(), 760, 260); Qt.callLater(() => m.openSub(m.list[3], m.contentItem.children[3])); });
    if (openAtStart === "dialog") Qt.callLater(() => { const d = Qt.createComponent("controls/DialogBox.qml").createObject(C.Overlay.overlay, { title: "Add to playlist", buttons: [{ label: "Cancel", value: null }, { label: "Add", value: true, primary: true }] });
      Qt.createComponent("controls/Select.qml").createObject(d.contentItem.children[1].children[0], { width: 424, options: [[0, "Favourites"], [1, "Road trip"], [2, "Series"]], value: 0 }); d.open(); });
  }

  // ---------- title bar (36px) ----------
  Rectangle {
    id: titlebar
    anchors { left: parent.left; right: parent.right; top: parent.top }
    height: 36; color: Theme.bg
    Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: Theme.edge }
    MouseArea { anchors.fill: parent; onPressed: win.startSystemMove(); onDoubleClicked: win.toggleMax() }
    Row {
      anchors { left: parent.left; leftMargin: 10; verticalCenter: parent.verticalCenter }
      spacing: 4
      Image {   // the cone
        width: 18; height: 18; anchors.verticalCenter: parent.verticalCenter; sourceSize: Qt.size(36, 36)
        source: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.6 2h4.8l1.2 4H8.4z" fill="' + Theme.accent + '"/><path d="M8.1 7h7.8l1.1 4H7z" fill="#ddd"/><path d="M6.7 12h10.6l1.2 4.5H5.5z" fill="' + Theme.accent + '"/><path d="M3 18h18l1 3H2z" fill="' + Theme.accent + '"/></svg>')
      }
      IconButton { html: "menuBtn"; width: 28; height: 28 }
      Rectangle { width: 1; height: 16; color: Theme.line; anchors.verticalCenter: parent.verticalCenter }
      IconButton { html: "sideToggle"; width: 28; height: 28 }
      Row {
        spacing: 6; anchors.verticalCenter: parent.verticalCenter; leftPadding: 4
        Icon { html: "crumbs"; color: Theme.muted; anchors.verticalCenter: parent.verticalCenter }
        T { text: qsTr("Videos"); color: Theme.muted; anchors.verticalCenter: parent.verticalCenter }
      }
    }
    T { anchors.centerIn: parent; text: win.title; color: Theme.text2; width: Math.min(implicitWidth, parent.width * 0.4) }
    Row {
      anchors { right: parent.right; top: parent.top; bottom: parent.bottom }
      Repeater {
        model: ["minBtn", "maxBtn", "fsBtn2", "closeBtn"]
        Rectangle {
          id: wbtn
          required property string modelData
          readonly property bool hot: a.containsMouse || (modelData === "maxBtn" && frame.maximizeHovered)
          width: 44; height: 36
          color: hot ? (modelData === "closeBtn" ? "#c42b1c" : Theme.panel2) : "transparent"
          Component.onCompleted: if (modelData === "maxBtn") maxBtn = wbtn
          Icon { anchors.centerIn: parent; html: modelData; color: parent.hot ? (modelData === "closeBtn" ? "#fff" : Theme.text) : Theme.muted }
          MouseArea { id: a; anchors.fill: parent; hoverEnabled: true
            onClicked: modelData === "minBtn" ? win.showMinimized() : modelData === "maxBtn" ? win.toggleMax()
                     : modelData === "fsBtn2" ? (win.visibility === Window.FullScreen ? win.showNormal() : win.showFullScreen()) : Qt.quit() }
        }
      }
    }
  }
  property Item maxBtn: null

  // ---------- body ----------
  Item {
    id: body
    anchors { left: parent.left; right: parent.right; top: titlebar.bottom; bottom: controls.top }

    Rectangle {   // rail (52px)
      id: rail
      width: win.inPlayer ? 0 : 52; visible: width > 0
      anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
      color: Theme.bg
      Rectangle { anchors { right: parent.right; top: parent.top; bottom: parent.bottom } width: 1; color: Theme.edge }
      Column {
        anchors { fill: parent; topMargin: 8; leftMargin: 6; rightMargin: 6 }
        spacing: 4
        Repeater {
          model: ["view_home", "view_videos", "view_music", "view_network", "view_playlists", "view_recent", "addBtn"]
          Rectangle {
            required property string modelData
            width: 40; height: 38; radius: Theme.radius
            color: ra.containsMouse ? Theme.panel2 : "transparent"
            Icon { anchors.centerIn: parent; width: 18; height: 18; html: modelData
                   color: modelData === "view_videos" ? Theme.accent : ra.containsMouse ? Theme.text : Theme.muted }
            MouseArea { id: ra; anchors.fill: parent; hoverEnabled: true }
          }
        }
      }
    }

    Rectangle {   // library panel (250px)
      id: side
      width: win.inPlayer ? 0 : 250; visible: width > 0
      anchors { left: rail.right; top: parent.top; bottom: parent.bottom }
      color: Theme.bg2
      Rectangle { anchors { right: parent.right; top: parent.top; bottom: parent.bottom } width: 1; color: Theme.edge }
      Row {
        id: sideHead
        x: 10; y: 12; spacing: 6; height: 30
        IconButton { html: "backBtn"; anchors.verticalCenter: parent.verticalCenter }
        T { text: qsTr("Videos"); px: 15; font.weight: Font.Medium; width: 160; anchors.verticalCenter: parent.verticalCenter }
        IconButton { html: "sideMore"; anchors.verticalCenter: parent.verticalCenter }
      }
      Item {
        id: sideSub
        anchors { left: parent.left; right: parent.right; top: sideHead.bottom; leftMargin: 6; rightMargin: 6; topMargin: 4 }
        height: 34
        T { x: 14; y: 2; text: qsTr("%1 items").arg(library.items.length); color: Theme.muted; px: 12 }
        IconButton { anchors.right: parent.right; anchors.rightMargin: 4; y: -6; html: "sortBtn" }
        Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: Theme.line }
      }
      ListView {
        anchors { left: parent.left; right: parent.right; top: sideSub.bottom; bottom: parent.bottom; margins: 6; topMargin: 8 }
        clip: true
        model: library.items
        C.ScrollBar.vertical: ScrollBar {}
        delegate: Rectangle {
          required property var modelData
          width: ListView.view.width; height: 34; radius: Theme.radius
          color: sa.containsMouse ? Theme.panel2 : "transparent"
          Row {
            x: 10; anchors.verticalCenter: parent.verticalCenter; spacing: 10
            Icon { anchors.verticalCenter: parent.verticalCenter; html: "view_videos"; color: win.current.path === modelData.path ? Theme.accent : Theme.text2 }
            T { text: modelData.name; color: win.current.path === modelData.path ? Theme.accent : Theme.text2; width: 190 }
          }
          MouseArea { id: sa; anchors.fill: parent; hoverEnabled: true; acceptedButtons: Qt.LeftButton | Qt.RightButton
            onClicked: m => { if (m.button === Qt.RightButton) { const p = mapToItem(null, m.x, m.y); win.menu(win.itemMenu(modelData), p.x, p.y); } else win.playItem(modelData); } }
        }
      }
    }

    Rectangle {   // main area: library grid or player
      id: main
      anchors { left: side.right; right: parent.right; top: parent.top; bottom: parent.bottom }
      color: Theme.panel

      Item {
        id: browser
        anchors.fill: parent
        visible: !win.inPlayer
        Item {   // toolbar
          id: toolbar
          anchors { left: parent.left; right: parent.right; top: parent.top; leftMargin: 12; rightMargin: 12 }
          height: 56
          Row {
            anchors { left: parent.left; leftMargin: 18; verticalCenter: parent.verticalCenter }
            spacing: 6
            IconButton { html: "navBack" }
            IconButton { html: "navFwd" }
            T { text: qsTr("Videos"); px: 14; font.weight: Font.DemiBold; anchors.verticalCenter: parent.verticalCenter; leftPadding: 10 }
          }
          Row {
            anchors { right: parent.right; rightMargin: 18; verticalCenter: parent.verticalCenter }
            spacing: 6
            T { text: qsTr("%1 items").arg(library.items.length); color: Theme.muted; px: 12; anchors.verticalCenter: parent.verticalCenter; rightPadding: 6 }
            IconButton { html: "sortBtn2" }
            IconButton { html: "viewToggle" }
            TextField {
              id: search
              width: 230; height: 30; color: Theme.panel2; border.color: input.activeFocus ? Theme.accent : "transparent"
              placeholder: "Search"; iconLeft: 20
              Icon { x: 9; anchors.verticalCenter: parent.verticalCenter; width: 14; height: 14; name: "search"; color: Theme.muted }
            }
            IconButton { html: "moreBtn" }
          }
          Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom } height: 1; color: Theme.line }
        }
        GridView {   // repeat(auto-fill, minmax(190px, 1fr)), gap 22px 18px, padding 18px 30px
          id: grid
          anchors { left: parent.left; right: parent.right; top: toolbar.bottom; bottom: parent.bottom; leftMargin: 30; rightMargin: 12 }
          topMargin: 18; bottomMargin: 140
          clip: true
          C.ScrollBar.vertical: ScrollBar {}
          readonly property int cols: Math.max(1, Math.floor(width / (190 + 18)))
          cellWidth: Math.floor(width / cols)
          cellHeight: (cellWidth - 18) * 9 / 16 + 8 + 20 + 22
          model: library.items.filter(i => !search.text || i.name.toLowerCase().includes(search.text.toLowerCase()))
          delegate: Item {
            required property var modelData
            width: grid.cellWidth; height: grid.cellHeight
            Item {
              width: parent.width - 18; height: parent.height - 22
              Rectangle {
                id: thumb
                width: parent.width; height: width * 9 / 16; radius: Theme.radius; color: "#000"; clip: true
                Image { anchors.fill: parent; source: modelData.thumb; fillMode: Image.PreserveAspectCrop; asynchronous: true; visible: status === Image.Ready && Settings.values.showThumbs }
                Rectangle { anchors.fill: parent; color: "#66000000"; opacity: ca.containsMouse ? 1 : 0; radius: Theme.radius
                  Behavior on opacity { NumberAnimation { duration: 150 } }
                  Icon { anchors.centerIn: parent; width: 28; height: 28; name: "play"; filled: true; color: "#fff" } }
                Rectangle { visible: modelData.duration > 0; anchors { right: parent.right; bottom: parent.bottom; margins: 6 } radius: 3; color: "#bb000000"
                  width: dl.implicitWidth + 10; height: dl.implicitHeight + 2
                  T { id: dl; anchors.centerIn: parent; text: win.shortFmt(modelData.duration); color: "#fff"; px: 11 } }
              }
              Rectangle { anchors.fill: thumb; anchors.margins: -2; radius: Theme.radius + 2; color: "transparent"
                border.width: 2; border.color: ca.containsMouse ? Theme.accent : "transparent"
                Behavior on border.color { ColorAnimation { duration: 150 } } }
              T { anchors { top: thumb.bottom; topMargin: 8 } width: parent.width; text: modelData.name; color: win.current.path === modelData.path ? Theme.accent : Theme.text2 }
              MouseArea { id: ca; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; acceptedButtons: Qt.LeftButton | Qt.RightButton
                onClicked: m => { if (m.button === Qt.RightButton) { const p = mapToItem(null, m.x, m.y); win.menu(win.itemMenu(modelData), p.x, p.y); } else win.playItem(modelData); } }
            }
          }
        }
      }

      Rectangle {   // player
        anchors.fill: parent
        visible: win.inPlayer
        color: "#000"
        VideoOutput { id: video; anchors.fill: parent; fillMode: VideoOutput.PreserveAspectFit }
        MouseArea { anchors.fill: parent; acceptedButtons: Qt.LeftButton | Qt.RightButton
          onClicked: m => { if (m.button === Qt.RightButton) { const p = mapToItem(null, m.x, m.y); win.menu(win.playerMenu(), p.x, p.y); } else player.togglePause(); }
          onDoubleClicked: win.visibility === Window.FullScreen ? win.showNormal() : win.showFullScreen() }
        T { anchors.centerIn: parent; visible: player.error !== ""; text: player.error; color: "#fff" }
      }
    }
  }

  // the right-click menus of v2.x (actions follow in phases 2 and 3)
  function itemMenu(it) {
    return [
      { label: "Play", icon: "play", accent: true, action: () => win.playItem(it) },
      { label: "Add to playlist…", icon: "playlist" },
      { label: "Mark as watched", icon: "eye" },
      { label: "Show in folder", icon: "folder" },
      { label: "Media information", icon: "info" },
      { label: "Select", icon: "check", kbd: "Ctrl + click" },
      { sep: true },
      { label: "Remove from library", icon: "trash", danger: true }
    ];
  }
  function playerMenu() {
    return [
      { label: player.playing ? "Pause" : "Play", icon: player.playing ? "pause" : "play", accent: true, kbd: "Space", action: () => player.togglePause() },
      { label: "Stop", icon: "stop", accent: true, kbd: "S", action: () => { player.stop(); win.inPlayer = false; } },
      { sep: true },
      { label: "Playback", icon: "playback", sub: [{ header: "Speed" }, { label: "0.5×" }, { label: "1×", checked: true }, { label: "1.5×" }, { label: "2×" }] },
      { label: "Video", icon: "video", sub: [{ label: "Fullscreen", icon: "fullscreen", kbd: "F" }, { label: "Snapshot", icon: "camera", kbd: "Shift + S" }] },
      { sep: true },
      { label: "Settings", icon: "general", action: () => win.openSettings("interface") }
    ];
  }

  // ---------- control bar (52px) ----------
  Rectangle {
    id: controls
    anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
    height: 52; color: Theme.bg
    Rectangle { anchors { left: parent.left; right: parent.right; top: parent.top } height: 1; color: Theme.edge }
    Row {
      id: leftCtl
      anchors { left: parent.left; leftMargin: 10; verticalCenter: parent.verticalCenter }
      spacing: 6
      IconButton { html: "prevBtn"; visible: Settings.values.ctl.prevnext }
      Rectangle {   // #playBtn: 46×26, accent, rounded 5
        visible: Settings.values.ctl.play
        width: 46; height: 26; radius: 5; anchors.verticalCenter: parent.verticalCenter
        color: pa.containsMouse ? Theme.accent2 : Theme.accent
        Icon { anchors.centerIn: parent; width: 16; height: 16; name: player.playing ? "pause" : "play"; filled: !player.playing; strokeWidth: 2.2; color: Theme.accentText }
        MouseArea { id: pa; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: player.togglePause() }
      }
      IconButton { html: "nextBtn"; visible: Settings.values.ctl.prevnext }
      T { visible: Settings.values.ctl.time; width: 70; horizontalAlignment: Text.AlignHCenter; text: win.fmt(player.time); color: Theme.muted; px: 12; font.features: { "tnum": 1 }; anchors.verticalCenter: parent.verticalCenter }
    }
    Row {
      id: rightCtl
      anchors { right: parent.right; rightMargin: 10; verticalCenter: parent.verticalCenter }
      spacing: 6
      T { visible: Settings.values.ctl.time; width: 70; horizontalAlignment: Text.AlignHCenter; text: win.fmt(player.length); color: Theme.muted; px: 12; font.features: { "tnum": 1 }; anchors.verticalCenter: parent.verticalCenter }
      IconButton { html: "muteBtn"; visible: Settings.values.ctl.volume }
      Rectangle {   // #vol: 90×18, gradient fill
        visible: Settings.values.ctl.volume
        width: 90; height: 18; radius: 4; color: Theme.track; anchors.verticalCenter: parent.verticalCenter; clip: true
        Rectangle { width: parent.width * Math.min(1, player.volume / 125); height: parent.height; radius: 4
          gradient: Gradient { orientation: Gradient.Horizontal; GradientStop { position: 0; color: Theme.vol1 } GradientStop { position: 1; color: Theme.vol2 } } }
        MouseArea { anchors.fill: parent; onPressed: m => player.volume = Math.round(m.x / width * 125); onPositionChanged: m => player.volume = Math.round(Math.max(0, m.x) / width * 125) }
      }
      Rectangle { width: 1; height: 18; color: Theme.line; anchors.verticalCenter: parent.verticalCenter }
      IconButton { html: "eqBtn"; visible: Settings.values.ctl.audio }
      IconButton { html: "subBtn"; visible: Settings.values.ctl.subs }
      IconButton { html: "setBtn"; visible: Settings.values.ctl.settings; onClicked: win.openSettings("interface") }
      IconButton { html: "listBtn"; visible: Settings.values.ctl.library }
    }
    Item {   // #seek: 18px track, accent-dark fill, 6×20 accent handle
      anchors { left: leftCtl.right; right: rightCtl.left; leftMargin: 6; rightMargin: 6; verticalCenter: parent.verticalCenter }
      height: 22
      Rectangle {
        anchors.verticalCenter: parent.verticalCenter; width: parent.width; height: 18; radius: 4; color: Theme.track
        readonly property real p: player.length > 0 ? player.time / player.length : 0
        Rectangle { width: parent.width * parent.p; height: parent.height; radius: 4; color: Theme.accentDark }
        Rectangle { x: parent.width * parent.p - 3; y: -1; width: 6; height: 20; radius: 3; color: Theme.accent }
      }
      MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onPressed: m => player.seek(m.x / width * player.length) }
    }
  }

  // window edges: resize like a normal window (the frame is our own)
  Repeater {
    model: [[Qt.LeftEdge, 0, 0, 5, -1], [Qt.RightEdge, -5, 0, 5, -1], [Qt.BottomEdge, 0, -5, -1, 5], [Qt.TopEdge, 0, 0, -1, 4]]
    MouseArea {
      required property var modelData
      x: modelData[1] < 0 ? win.width + modelData[1] : modelData[1]; y: modelData[2] < 0 ? win.height + modelData[2] : modelData[2]
      width: modelData[3] < 0 ? win.width : modelData[3]; height: modelData[4] < 0 ? win.height : modelData[4]
      cursorShape: modelData[0] === Qt.LeftEdge || modelData[0] === Qt.RightEdge ? Qt.SizeHorCursor : Qt.SizeVerCursor
      onPressed: win.startSystemResize(modelData[0])
    }
  }

  // testing: frames drawn while a video plays, then a screenshot (VLCR_SHOT)
  property int swaps: 0
  property int f0: 0
  onFrameSwapped: swaps++
  Timer { running: shotPath !== "" && autoPlay !== ""; interval: 4000; onTriggered: { win.swaps = 0; win.f0 = player.framesShown; } }
  Timer { running: shotPath !== "" && autoPlay !== ""; interval: 7000
          onTriggered: player.log("decoded " + ((player.framesShown - win.f0) / 3).toFixed(1) + " fps, drawn " + (win.swaps / 3).toFixed(1) + " fps") }
  Timer { running: shotPath !== ""; interval: shotMs
          onTriggered: { player.log("hit test over the maximise button: " + (maxBtn ? frame.hitTestAt(Math.round((maxBtn.mapToItem(null, 22, 18).x) * Screen.devicePixelRatio), Math.round(18 * Screen.devicePixelRatio)) : -1));
                         frame.grab(shotPath); Qt.quit(); } }
  Shortcut { sequence: "Space"; onActivated: player.togglePause() }
  Shortcut { sequence: "Esc"; onActivated: { if (win.visibility === Window.FullScreen) win.showNormal(); else win.inPlayer = false; } }
}
