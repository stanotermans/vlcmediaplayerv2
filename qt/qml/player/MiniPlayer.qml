// #mini: while you browse the library, what plays keeps going in a small card at the bottom right: the picture (or
// the music's cover on a blurred copy, or the cat), its progress, the name, the time, play/pause and close.
import QtQuick
import QtQuick.Effects
import QtMultimedia
import VLCR

Rectangle {
  id: root
  property var ctl: null
  property alias video: video
  readonly property var it: ctl.current
  readonly property bool audio: !!it && it.type === "audio"
  width: 270; height: col.height
  radius: 8; color: Theme.bg2; border.width: 1; border.color: Theme.line; clip: true
  Column {
    id: col
    width: parent.width
    Rectangle {   // #miniCanvasWrap
      width: parent.width; height: width * 9 / 16; color: Theme.stage; clip: true
      VideoOutput { id: video; anchors.fill: parent; visible: !root.audio && root.ctl.player.videoSize.width > 0 }
      Image { id: art; anchors.fill: parent; visible: false; source: root.audio ? root.it.thumb || "" : ""; fillMode: Image.PreserveAspectCrop; sourceSize.width: 320 }
      MultiEffect { anchors.fill: parent; autoPaddingEnabled: false; source: art; visible: root.audio && art.status === Image.Ready; blurEnabled: true; blur: 1; blurMax: 48; opacity: 0.55 }
      Image { visible: root.audio && art.status === Image.Ready; anchors.centerIn: parent; width: parent.height * 132 / 180; height: width; source: art.source; fillMode: Image.PreserveAspectCrop }
      PixelCat { visible: !video.visible && !(root.audio && art.status === Image.Ready); width: parent.width * 0.26; anchors.centerIn: parent }
      MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.ctl.showPlayer() }
      Accessible.role: Accessible.Button; Accessible.name: qsTr("Back to player")
    }
    Rectangle {   // #miniProg
      width: parent.width; height: 3; color: Theme.accentDark
      Rectangle { height: 3; color: Theme.accent; width: root.ctl.player.length > 0 ? parent.width * root.ctl.player.time / root.ctl.player.length : 0 }
    }
    T { width: parent.width; leftPadding: 10; rightPadding: 10; topPadding: 8; bottomPadding: 2; px: 12; text: root.it ? root.it.name : "—"; color: Theme.text }
    Item {   // #miniBar
      width: parent.width; height: 30
      T { x: 10; anchors.verticalCenter: parent.verticalCenter; px: 11; color: Theme.muted; text: root.ctl.pb.fmt(root.ctl.player.time / 1000).replace(/^00:/, "") }
      Row { anchors { right: parent.right; rightMargin: 4; verticalCenter: parent.verticalCenter } spacing: 2
        IconButton { width: 26; height: 26; name: root.ctl.player.playing ? "pause" : "play"; onClicked: root.ctl.pb.togglePlay() }
        IconButton { width: 26; height: 26; name: "x"; tip: qsTr("Close"); onClicked: root.ctl.pb.stop() } }
    }
  }
}
