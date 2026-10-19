// .linkbtn: an icon and a label that opens a web page
import QtQuick
import VLCR

Rectangle {
  id: root
  property string text: ""
  property string icon: "link"
  property string url: ""
  implicitWidth: row.implicitWidth + 16; implicitHeight: 30
  radius: Theme.radius; color: ma.containsMouse ? Theme.panel2 : "transparent"
  Accessible.role: Accessible.Link; Accessible.name: text
  Row { id: row; anchors.centerIn: parent; spacing: 6
    Icon { name: root.icon; width: 15; height: 15; color: Theme.accent; anchors.verticalCenter: parent.verticalCenter }
    T { text: root.text; color: Theme.accent; anchors.verticalCenter: parent.verticalCenter } }
  MouseArea { id: ma; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: Qt.openUrlExternally(root.url) }
}
