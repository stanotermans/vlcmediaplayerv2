// v2.x scrollbars: 10px wide, a 6px panel3 thumb with round ends, no track
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR

C.ScrollBar {
  id: bar
  implicitWidth: 10; implicitHeight: 10
  padding: 2
  minimumSize: 0.05
  policy: size < 1 ? C.ScrollBar.AsNeeded : C.ScrollBar.AlwaysOff
  contentItem: Rectangle { implicitWidth: 6; implicitHeight: 6; radius: 3; color: Theme.panel3
                           opacity: bar.size < 1 ? 1 : 0 }
  background: Item {}
}
