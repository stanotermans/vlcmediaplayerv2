// .psec: a titled group of settings, divided from the next by a line
import QtQuick
import VLCR

Column {
  id: root
  property string title: ""
  property bool last: false
  default property alias rows: body.data
  width: parent ? parent.width : 400
  topPadding: 6; bottomPadding: 10
  T { visible: root.title !== ""; text: qsTr(root.title); px: 15; font.weight: Font.DemiBold; color: Theme.text
      topPadding: 14; bottomPadding: 6 }
  Column { id: body; width: root.width }
  Item { width: 1; height: 10 }
  Rectangle { width: root.width; height: 1; color: Theme.line; visible: !root.last }
}
