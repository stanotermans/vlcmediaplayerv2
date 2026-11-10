// macOS (#108): the menu bar at the top of the screen (File, Playback, Video, Audio, Subtitles, View, Help), with
// Settings…, About and Quit in the app's own menu. Only made on a Mac (Main.qml); the shortcuts shown are ⌘ ones (the
// plain keys such as Space and F keep working in the window).
import QtQuick
import Qt.labs.platform as P
import VLCR

P.MenuBar {
  id: bar
  property var ctl: null
  readonly property var pb: ctl.pb

  P.Menu {
    title: qsTr("File")
    P.MenuItem { text: qsTr("Open files…"); shortcut: "Ctrl+O"; onTriggered: bar.ctl.doAct("files") }
    P.MenuItem { text: qsTr("Open folder…"); shortcut: "Ctrl+F"; onTriggered: bar.ctl.doAct("folder") }
    P.MenuItem { text: qsTr("Open network stream…"); shortcut: "Ctrl+N"; onTriggered: bar.ctl.doAct("url") }
    P.MenuSeparator {}
    P.MenuItem { text: qsTr("Add media folder…"); onTriggered: bar.ctl.doAct("addfolder") }
    P.MenuItem { text: qsTr("Import playlist…"); onTriggered: bar.ctl.doAct("importpl") }
    P.MenuItem { text: qsTr("New playlist…"); onTriggered: bar.ctl.doAct("newpl") }
    P.MenuSeparator {}
    P.MenuItem { text: qsTr("Media information"); shortcut: "Ctrl+I"; enabled: !!bar.ctl.current; onTriggered: bar.ctl.mediaInfo() }
    // (these three move to the app's own menu)
    P.MenuItem { text: qsTr("Settings…"); role: P.MenuItem.PreferencesRole; onTriggered: bar.ctl.openSettings() }
    P.MenuItem { text: qsTr("About Vela Player"); role: P.MenuItem.AboutRole; onTriggered: bar.ctl.openSettings("about") }
    P.MenuItem { text: qsTr("Quit"); role: P.MenuItem.QuitRole; onTriggered: bar.ctl.quit() }
  }
  P.Menu {
    title: qsTr("Playback")
    P.MenuItem { text: bar.ctl.player.playing ? qsTr("Pause") : qsTr("Play"); enabled: !!bar.ctl.current; onTriggered: bar.pb.togglePlay() }
    P.MenuItem { text: qsTr("Stop"); enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("stop") }
    P.MenuSeparator {}
    P.MenuItem { text: qsTr("Previous"); enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("prev") }
    P.MenuItem { text: qsTr("Next"); enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("next") }
    P.MenuSeparator {}
    P.MenuItem { text: qsTr("Seek forward"); enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("seekFwd") }
    P.MenuItem { text: qsTr("Seek backward"); enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("seekBack") }
    P.MenuItem { text: qsTr("Seek 1 min forward"); shortcut: "Ctrl+Right"; enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("seekFwdMin") }
    P.MenuItem { text: qsTr("Seek 1 min backward"); shortcut: "Ctrl+Left"; enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("seekBackMin") }
    P.MenuSeparator {}
    P.MenuItem { text: qsTr("Faster"); onTriggered: bar.pb.runAction("faster") }
    P.MenuItem { text: qsTr("Slower"); onTriggered: bar.pb.runAction("slower") }
    P.MenuItem { text: qsTr("Normal speed"); onTriggered: bar.pb.runAction("normalSpeed") }
    P.MenuSeparator {}
    P.MenuItem { text: qsTr("Add bookmark"); shortcut: "Ctrl+B"; enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("bookmark") }
  }
  P.Menu {
    title: qsTr("Video")
    P.MenuItem { text: qsTr("Fullscreen"); enabled: !!bar.ctl.current; onTriggered: bar.ctl.toggleFs() }
    P.MenuItem { text: qsTr("Picture-in-picture"); enabled: !!bar.ctl.current; onTriggered: bar.ctl.togglePip() }
    P.MenuItem { text: qsTr("Original size (1:1)"); enabled: !!bar.ctl.current; onTriggered: bar.ctl.originalSize() }
    P.MenuItem { text: qsTr("Snapshot"); enabled: !!bar.ctl.current; onTriggered: bar.pb.snapshot() }
    P.MenuSeparator {}
    P.MenuItem { text: qsTr("Sharp upscaling"); checkable: true; checked: !!(Settings.values.vf || {}).upscale; onTriggered: Settings.set("vf.upscale", !Settings.values.vf.upscale) }
    P.MenuItem { text: qsTr("Video filters…"); onTriggered: bar.ctl.quick.toggle("video") }
  }
  P.Menu {
    title: qsTr("Audio")
    P.MenuItem { text: bar.ctl.player.muted ? qsTr("Unmute") : qsTr("Mute"); onTriggered: bar.pb.toggleMute() }
    P.MenuItem { text: qsTr("Volume up"); onTriggered: bar.pb.runAction("volUp") }
    P.MenuItem { text: qsTr("Volume down"); onTriggered: bar.pb.runAction("volDown") }
    P.MenuSeparator {}
    P.MenuItem { text: qsTr("Cycle audio track"); enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("audio") }
    P.MenuItem { text: qsTr("Audio effects…"); onTriggered: bar.ctl.quick.toggle("audio") }
  }
  P.Menu {
    title: qsTr("Subtitles")
    P.MenuItem { text: qsTr("Cycle subtitle track"); enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("subs") }
    P.MenuItem { text: qsTr("Show lyrics"); enabled: !!bar.ctl.current; onTriggered: bar.pb.runAction("lyrics") }
    P.MenuItem { text: qsTr("Subtitles") + "…"; onTriggered: bar.ctl.quick.toggle("subs") }
  }
  P.Menu {
    title: qsTr("View")
    P.MenuItem { text: qsTr("Library / player"); onTriggered: bar.ctl.toggleLibrary() }
    P.MenuItem { text: qsTr("Show / hide queue"); onTriggered: bar.ctl.toggleQueue() }
    P.MenuItem { text: qsTr("Sidebar"); onTriggered: bar.ctl.sideToggle() }
  }
  P.Menu {
    title: qsTr("Help")
    P.MenuItem { text: qsTr("Keyboard shortcuts"); onTriggered: bar.ctl.shortcuts() }
  }
}
