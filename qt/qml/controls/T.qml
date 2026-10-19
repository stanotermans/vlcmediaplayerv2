// Text in the app's font (13px "Segoe UI Variable Text" on Windows, like v2.x)
import QtQuick
import QtQuick.Window
import VLCR

Text {
  // Qt does not reach the Light instance of the variable Segoe UI Variable: light text (headings) in Segoe UI Light
  font.family: font.weight < Font.Normal && Qt.platform.os === "windows" ? "Segoe UI" : Theme.font
  property real px: Theme.fontSize          // pixels like v2.x's CSS (12.5 allowed), set as points so fractions work
  font.pointSize: px * 72 / (Screen.logicalPixelDensity * 25.4)   // = px at any logical DPI (96 Windows, 72 macOS)
  color: Theme.text
  renderType: Text.NativeRendering   // the system's text rendering, as in v2.x (Chromium)
  elide: Text.ElideRight
}
