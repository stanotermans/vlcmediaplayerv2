// .note: small muted text under settings
import QtQuick
import VLCR

T {
  width: parent ? parent.width : 400
  visible: SettingsSearch.q === ""
  topPadding: 8; bottomPadding: 8
  px: 12; color: Theme.muted
  wrapMode: Text.Wrap; elide: Text.ElideNone
}
