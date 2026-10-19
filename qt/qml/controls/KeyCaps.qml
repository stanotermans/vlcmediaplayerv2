// kbd.cap: keys drawn as key caps. keys: action keys as KeyFilter names ("Shift+ArrowLeft", "S", "MediaTrackNext"),
// several separated by "/"; or caps: fixed labels (["Ctrl", "O"]).
import QtQuick
import VLCR

Row {
  id: root
  property var keys: []
  property var caps: null
  spacing: 6
  readonly property var names: ({ Space: "Space", ArrowRight: "→", ArrowLeft: "←", ArrowUp: "↑", ArrowDown: "↓", MediaPlayPause: "⏯", MediaTrackNext: "⏭",
    MediaTrackPrevious: "⏮", MediaStop: "⏹", Enter: "Enter", Backspace: "⌫", Tab: "Tab", PageUp: "Page Up", PageDown: "Page Down", Home: "Home", End: "End", Insert: "Ins", Delete: "Del", Escape: "Esc" })
  // "ArrowRight" → ["→"], "Shift+ArrowLeft" → ["Shift", "←"], "S" → ["SHIFT", "S"]
  function parts(key) {
    const p = key.split("+").filter((x, i, a) => x || i === a.length - 1), last = p.pop() || "+";
    if (last.length === 1 && /[A-Z]/.test(last)) return p.concat(["SHIFT", last]);
    return p.concat([names[last] || (last.length === 1 ? last.toUpperCase() : last)]);
  }
  readonly property var items: caps ? caps.map((c, i) => ({ cap: c, slash: i > 0 && caps.length === 2 && ["SHIFT", "Ctrl"].indexOf(caps[0]) < 0 }))
                                    : keys.reduce((out, k, i) => out.concat(parts(k).map((c, j) => ({ cap: c, slash: i > 0 && j === 0 }))), [])
  Repeater {
    model: root.items
    Row {
      required property var modelData
      spacing: 6
      T { visible: modelData.slash; text: "/"; color: Theme.dim; anchors.verticalCenter: parent.verticalCenter }
      Rectangle {
        anchors.verticalCenter: parent.verticalCenter
        width: Math.max(34, cl.implicitWidth + 20); height: 32; radius: 6
        color: Theme.panel2; border.width: 1; border.color: Theme.line
        Rectangle { anchors { left: parent.left; right: parent.right; bottom: parent.bottom; leftMargin: 2; rightMargin: 2; bottomMargin: -2 } height: 2; radius: 1; color: Theme.edge; z: -1 }
        // the media keys (⏯ ⏭ ⏮ ⏹) as plain symbols: Qt would take the colour emoji font for them
        T { id: cl; anchors.centerIn: parent; text: qsTr(modelData.cap); px: 12; color: Theme.text
            font.family: /^[⏩-⏺]$/.test(modelData.cap) ? (Qt.platform.os === "windows" ? "Segoe UI Symbol" : Qt.platform.os === "osx" ? "Apple Symbols" : "DejaVu Sans") : Theme.font }
      }
    }
  }
}
