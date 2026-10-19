// A v2.x icon (24×24 strokes, 1.6 wide, round ends) drawn as SVG in any colour
import QtQuick
import VLCR
import "../Icons.js" as Icons

Item {
  id: root
  property string name: ""          // an icon of ui.js (Icons.paths)
  property string html: ""          // or the inline SVG of an element of index.html (Icons.html)
  property color color: Theme.muted
  property bool filled: false
  property real strokeWidth: 1.6
  implicitWidth: 16; implicitHeight: 16
  readonly property string inner: html !== "" ? (Icons.html[html] || "") : (Icons.paths[name] || "")
  readonly property string col: "rgb(" + Math.round(color.r * 255) + "," + Math.round(color.g * 255) + "," + Math.round(color.b * 255) + ")"
  Image {
    anchors.fill: parent
    sourceSize: Qt.size(Math.ceil(root.width * Screen.devicePixelRatio), Math.ceil(root.height * Screen.devicePixelRatio))
    smooth: true
    opacity: root.color.a
    source: root.inner === "" ? "" : "data:image/svg+xml;utf8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="' + (root.filled ? root.col : 'none') + '" stroke="' + (root.filled ? 'none' : root.col) +
      '" stroke-width="' + root.strokeWidth + '" stroke-linecap="round" stroke-linejoin="round">' + root.inner.replace(/currentColor/g, root.col) + '</svg>')
  }
}
