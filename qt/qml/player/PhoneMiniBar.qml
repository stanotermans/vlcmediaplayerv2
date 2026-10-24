// A phone (#53): what plays, in a bar above the tabs while you browse (like a music app): the cover or thumbnail, the
// name, the time, play/pause and next; a tap opens the player. The progress runs along its bottom edge.
import QtQuick
import VLCR

Rectangle {
  id: root
  property var ctl: null
  readonly property var it: ctl.current
  readonly property var item: it ? ctl.library.item(it.src) : null
  height: 60; radius: 12; color: Theme.panel2; clip: true
  Accessible.role: Accessible.Button; Accessible.name: qsTr("Back to player")
  MouseArea { anchors.fill: parent; onClicked: root.ctl.showPlayer() }
  Rectangle {   // the cover or the thumbnail
    id: art
    x: 8; anchors.verticalCenter: parent.verticalCenter; width: 44; height: 44; radius: 8; color: Theme.stage; clip: true
    Image { anchors.fill: parent; source: root.item && root.item.thumb || ""; fillMode: Image.PreserveAspectCrop; sourceSize.width: 96; asynchronous: true }
    Icon { visible: !(root.item && root.item.thumb); anchors.centerIn: parent; width: 20; height: 20; html: root.it && root.it.type === "audio" ? "view_music" : "view_videos"; color: Theme.muted }
  }
  Column {
    anchors { left: art.right; leftMargin: 12; right: buttons.left; rightMargin: 6; verticalCenter: parent.verticalCenter }
    spacing: 2
    T { width: parent.width; text: root.it ? root.it.name : ""; color: Theme.text; px: 14 }
    T { width: parent.width; px: 12; color: Theme.muted
        text: root.ctl.pb.fmt(root.ctl.player.time / 1000).replace(/^00:/, "") + (root.ctl.player.length > 0 ? " / " + root.ctl.pb.fmt(root.ctl.player.length / 1000).replace(/^00:/, "") : "") }
  }
  Row {
    id: buttons
    anchors { right: parent.right; rightMargin: 6; verticalCenter: parent.verticalCenter }
    IconButton { width: 44; height: 44; iconSize: 22; name: root.ctl.player.playing ? "pause" : "play"; tip: qsTr("Play / pause"); onClicked: root.ctl.pb.togglePlay() }
    IconButton { width: 44; height: 44; iconSize: 22; name: "next"; tip: qsTr("Next"); onClicked: root.ctl.pb.step(1) }
  }
  Rectangle {   // the progress
    anchors.bottom: parent.bottom; x: 12; width: parent.width - 24; height: 2; color: Theme.accentDark
    Rectangle { height: 2; color: Theme.accent; width: root.ctl.player.length > 0 ? parent.width * root.ctl.player.time / root.ctl.player.length : 0 }
  }
}
