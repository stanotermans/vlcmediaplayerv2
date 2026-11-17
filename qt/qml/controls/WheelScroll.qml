// #116: a mouse wheel notch scrolls its view the same distance every time (the system's lines per notch × 24 px, made
// faster or slower by Settings → Controls → Scroll speed), with a short glide. Qt's own wheel handling could carry the
// speed of the last notch into the next one, so every other notch went a different distance. Pixel scrolling
// (touchpads that report pixels) moves the view by exactly those pixels.
import QtQuick

WheelHandler {
  id: h
  // (declared in a Flickable it sits on the Flickable's contentItem)
  readonly property Flickable view: parent instanceof Flickable ? parent : parent && parent.parent instanceof Flickable ? parent.parent : null
  property real goal: 0
  orientation: Qt.Vertical
  target: null   // (no property of the item is changed by the handler itself)
  function clamp(y) {
    const v = view, top = v.originY - v.topMargin;
    return Math.max(top, Math.min(Math.max(top, v.originY + v.contentHeight + v.bottomMargin - v.height), y));
  }
  onWheel: e => {
    const v = view;
    if (!v || !v.interactive) return;
    if (e.pixelDelta.y !== 0) { glide.stop(); v.contentY = clamp(v.contentY - e.pixelDelta.y); return; }
    if (e.angleDelta.y === 0) return;
    goal = clamp((glide.running ? goal : v.contentY) - e.angleDelta.y / 120 * Qt.styleHints.wheelScrollLines * 24);
    glide.to = goal; glide.restart();
  }
  property NumberAnimation glide: NumberAnimation { target: h.view; property: "contentY"; duration: 160; easing.type: Easing.OutCubic }
}
