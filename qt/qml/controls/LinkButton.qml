// .linkbtn: an icon and a label that opens a web page (a panel2 pill; on hover panel3 and the text colour)
import QtQuick
import VLCR

Rectangle {
  id: root
  property string text: ""
  property string icon: "link"
  property string url: ""
  implicitWidth: row.implicitWidth + 24; implicitHeight: 32
  radius: Theme.radius; color: ma.containsMouse ? Theme.panel3 : Theme.panel2
  Accessible.role: Accessible.Link; Accessible.name: text
  Row { id: row; anchors.centerIn: parent; spacing: 8
    Icon { name: root.icon; width: 15; height: 15; color: ma.containsMouse ? Theme.text : Theme.text2; anchors.verticalCenter: parent.verticalCenter }
    T { text: root.text; color: ma.containsMouse ? Theme.text : Theme.text2; anchors.verticalCenter: parent.verticalCenter } }
  MouseArea { id: ma; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: Qt.openUrlExternally(root.url) }
}
