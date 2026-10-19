// Settings → Extensions (none yet, as in v2.x)
import QtQuick
import VLCR

Column {
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Extensions"
    last: true
    Column {   // .empty-ext
      readonly property string searchLabel: "Extensions"
      width: parent.width; spacing: 8; topPadding: 50; bottomPadding: 50
      Icon { anchors.horizontalCenter: parent.horizontalCenter; width: 40; height: 40; strokeWidth: 1.2; name: "puzzle"; color: Theme.muted }
      T { anchors.horizontalCenter: parent.horizontalCenter; text: qsTr("No extensions installed."); color: Theme.muted }
      T { anchors.horizontalCenter: parent.horizontalCenter; text: qsTr("Extensions will be supported in a later version."); px: 12; color: Theme.muted }
    }
  }
}
