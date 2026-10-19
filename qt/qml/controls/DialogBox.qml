// .dlg: a centred dialog on a dark scrim. Head (title and ×) on bg2, body, footer with buttons on a line; Escape or
// a click on the scrim closes it. buttons: [{ label, value, primary }]; finished(value) (null when closed).
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as C
import VLCR

C.Popup {
  id: dlg
  property string title: ""
  property var buttons: [{ label: "OK", value: true, primary: true }]
  property bool showHead: true
  property int maxWidth: 460
  default property alias body: bodyHolder.data
  property real bodyPadding: 18
  signal finished(var value)
  function done(v) { finished(v); close(); }
  parent: C.Overlay.overlay
  modal: true; dim: true; focus: true
  closePolicy: C.Popup.CloseOnEscape | C.Popup.CloseOnPressOutside
  onClosed: if (!_done) finished(null)
  property bool _done: false
  onFinished: _done = true
  anchors.centerIn: parent
  width: Math.min(maxWidth, parent.width - 32)
  padding: 0
  C.Overlay.modal: Rectangle { color: Theme.scrim; Behavior on opacity { NumberAnimation { duration: 150 } } }
  enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: 150 } }
  background: MenuBackground { radius: 10 }
  contentItem: Column {
    Rectangle {   // .dlg-head
      visible: dlg.showHead
      width: parent.width; height: 50; color: Theme.bg2; radius: 10
      Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 10; color: Theme.bg2 }
      T { x: 18; anchors.verticalCenter: parent.verticalCenter; text: qsTr(dlg.title); color: Theme.text2 }
      IconButton { anchors { right: parent.right; rightMargin: 10; verticalCenter: parent.verticalCenter } name: "x"; tip: qsTr("Close"); onClicked: dlg.close() }
    }
    Item {   // .dlg-body
      width: parent.width; height: bodyHolder.childrenRect.height + 2 * dlg.bodyPadding
      Item { id: bodyHolder; x: dlg.bodyPadding; y: dlg.bodyPadding; width: parent.width - 2 * dlg.bodyPadding }
    }
    Rectangle { visible: dlg.buttons.length > 0; width: parent.width; height: 1; color: Theme.line }
    Item {   // .dlg-foot
      visible: dlg.buttons.length > 0
      width: parent.width; height: 56
      RowLayout {   // justify-content: space-between (a single button on the right, like v2.x)
        anchors { left: parent.left; right: parent.right; leftMargin: 18; rightMargin: 18; verticalCenter: parent.verticalCenter }
        spacing: 8
        Repeater {
          model: dlg.buttons.length === 1 ? [null].concat(dlg.buttons) : dlg.buttons.reduce((out, b, i) => out.concat(i ? [null, b] : [b]), [])
          Loader {
            required property var modelData
            Layout.fillWidth: modelData === null
            sourceComponent: modelData === null ? gap : btn
            Component { id: gap; Item { implicitHeight: 1 } }
            Component { id: btn; Button { text: qsTr(modelData.label); kind: modelData.primary ? "primary" : ""
                                          onClicked: dlg.done(typeof modelData.value === "function" ? modelData.value() : modelData.value) } }
          }
        }
      }
    }
  }
}
