// Text in the app's font (13px "Segoe UI Variable Text" on Windows, like v2.x)
import QtQuick
import QtQuick.Window
import VLCR

Text {
  // #67: Qt (6.8) does not reach the light and semibold weights of the variable Segoe UI Variable (semibold came out as
  // a heavier bold, light as regular): those weights in the static Segoe UI, which has them and looks the same
  font.family: Qt.platform.os === "windows" && font.weight !== Font.Normal && font.weight < Font.Bold ? "Segoe UI" : Theme.font
  property real px: Theme.fontSize          // pixels like v2.x's CSS (12.5 allowed), set as points so fractions work
  font.pointSize: px * 72 / (Screen.logicalPixelDensity * 25.4)   // = px at any logical DPI (96 Windows, 72 macOS)
  color: Theme.text
  renderType: Text.NativeRendering   // the system's text rendering, as in v2.x (Chromium)
  elide: Text.ElideRight
}
