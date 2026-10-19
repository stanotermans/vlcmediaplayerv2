// .cmenu's box: panel colour, 1px line, 10px corners and the v2.x shadow (0 16px 40px)
import QtQuick
import QtQuick.Effects
import VLCR

Item {
  property real radius: 10
  Rectangle { id: box; anchors.fill: parent; radius: parent.radius; color: Theme.panel; border.width: 1; border.color: Theme.line; visible: false }
  MultiEffect {
    source: box; anchors.fill: box
    shadowEnabled: true; shadowColor: Theme.shadow; shadowVerticalOffset: 16; shadowBlur: 1.0; blurMax: 40
    paddingRect: Qt.rect(48, 32, 96, 96)
  }
}
