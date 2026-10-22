// F1: your keys for the actions, plus the fixed shortcuts, in two columns (v2.x panels.js shortcuts)
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR

DialogBox {
  id: dlg
  property var pb: null
  title: "Keyboard shortcuts"
  maxWidth: 820
  buttons: [{ label: "Close", value: true, primary: true }]
  readonly property var fixed: [["Hide interface", ["Ctrl", "\\"]], ["Jump to 0–90%", ["0 – 9"]], ["Open files", ["Ctrl", "O"]], ["Open folder", ["Ctrl", "F"]],
    ["Open network stream", ["Ctrl", "N"]], ["Media information", ["Ctrl", "I"]], ["Settings", ["Ctrl", "P"]],
    ["Library: home / videos / music / network / playlists / recent", ["Ctrl", "1 – 6"]], ["Keyboard shortcuts", ["F1"]], ["Quit", ["Ctrl", "Q"]]]
  readonly property var rows: pb.actions.map(a => ({ label: a[1], keys: pb.keysFor(a[0]) })).filter(r => r.keys.length).concat(fixed.map(f => ({ label: f[0], caps: f[1] })))
  Flickable {
    width: parent.width; height: Math.min(grid.height, (C.Overlay.overlay ? C.Overlay.overlay.height : 800) - 220)
    contentHeight: grid.height; clip: true; boundsBehavior: Flickable.StopAtBounds
    C.ScrollBar.vertical: ScrollBar {}
    Grid {   // .kbgrid
      id: grid
      width: parent.width; columns: 2; columnSpacing: 60; flow: Grid.TopToBottom
      rows: Math.ceil(dlg.rows.length / 2)
      Repeater {
        model: dlg.rows
        Item { required property var modelData; width: (grid.width - 60) / 2; height: 44
          T { anchors.verticalCenter: parent.verticalCenter; width: parent.width - caps.width - 16; text: qsTr(modelData.label); color: Theme.text2 }
          KeyCaps { id: caps; anchors { right: parent.right; verticalCenter: parent.verticalCenter } keys: modelData.keys || []; caps: modelData.caps || null } }
      }
    }
  }
}
