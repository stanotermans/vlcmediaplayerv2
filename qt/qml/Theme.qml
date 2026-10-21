// Colours, sizes and fonts of v2.x (app/src/style.css), following the settings: theme (dark, light, black (AMOLED),
// system) and the accent colour, with the same derived colours as v2.x's color-mix()
pragma Singleton
import QtQuick
import VLCR

QtObject {
  id: theme
  readonly property string mode: {
    const t = Store.pro ? Settings.values.theme || "dark" : "dark";   // (#53: other themes with Pro)
    if (t !== "system") return t;
    return Qt.styleHints.colorScheme === Qt.ColorScheme.Light ? "light" : "dark";
  }
  readonly property bool light: mode === "light"
  readonly property bool black: mode === "black"

  // a·t + b·(1−t), like color-mix(in srgb, a t%, b)
  function mix(a, b, t) { if (typeof a === "string") a = Qt.lighter(a, 1); if (typeof b === "string") b = Qt.lighter(b, 1);
    return Qt.rgba(a.r * t + b.r * (1 - t), a.g * t + b.g * (1 - t), a.b * t + b.b * (1 - t), a.a * t + b.a * (1 - t)); }
  function alpha(c, a) { if (typeof c === "string") c = Qt.lighter(c, 1); return Qt.rgba(c.r, c.g, c.b, a); }   // also "#rrggbb"

  readonly property color accent: Store.pro && Settings.values.accent || "#f28c1b"   // (#53: other colours with Pro)
  readonly property bool mobile: Qt.platform.os === "android" || Qt.platform.os === "ios"   // touch, no window frame
  // readable text on the accent (a light grey accent needs dark text)
  // the logo (assets/icon.svg without its tile): the sail-shaped play button, always in the app's own colours
  // (orange and dark, like the app icon), whatever the accent colour
  readonly property string logo: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="20 20 80 80"><circle cx="60" cy="60" r="38" fill="#f28c1b"/><path d="M50 38 C 62 50, 64 70, 50 82 L 82 60 Z" fill="#141414"/></svg>')
  readonly property color accentText: (0.299 * accent.r + 0.587 * accent.g + 0.114 * accent.b) > 0.6 ? "#111111" : "#ffffff"
  readonly property color white: Qt.rgba(1, 1, 1, 1)
  readonly property color black0: Qt.rgba(0, 0, 0, 1)
  readonly property color accentDark: light ? mix(accent, white, 0.40) : mix(accent, black0, 0.28)
  readonly property color accentSoft: alpha(accent, light ? 0.18 : 0.22)
  readonly property color accent2: mix(accent, white, 0.85)
  readonly property color vol1: "#9cc12b"
  readonly property color vol2: "#c9d93a"
  readonly property color danger: "#ff6b5b"

  readonly property color bg:     light ? "#ebebeb" : black ? "#000000" : "#141414"
  readonly property color bg2:    light ? "#f4f4f4" : black ? "#000000" : "#0f0f0f"
  readonly property color panel:  light ? "#fafafa" : black ? "#000000" : "#1e1e1e"
  readonly property color panel2: light ? "#e7e7e7" : black ? "#111111" : "#262626"
  readonly property color panel3: light ? "#dedede" : black ? "#181818" : "#2c2c2c"
  readonly property color line:   light ? "#d8d8d8" : black ? "#1c1c1c" : "#2a2a2a"
  readonly property color track:  light ? "#d9d9d9" : black ? "#161616" : "#0a0a0a"
  readonly property color text:   light ? "#1b1b1b" : "#e6e6e6"
  readonly property color text2:  light ? "#333333" : "#cfcfcf"
  readonly property color muted:  light ? "#666666" : "#8a8a8a"
  readonly property color dim:    light ? "#999999" : "#5d5d5d"
  readonly property color edge:   light ? "#d0d0d0" : black ? "#141414" : "#0a0a0a"
  readonly property color stage:  light ? "#d9d8d6" : black ? "#000000" : "#2a2928"
  readonly property color floor:  light ? "#cfcecc" : black ? "#070707" : "#252423"
  readonly property color shadow: light ? "#33000000" : "#aa000000"
  readonly property color scrim:  "#99000000"            // behind dialogs (#0009)

  readonly property int radius: 6
  // "Segoe UI Variable Text" on Windows (like v2.x), the system's UI font elsewhere
  readonly property string font: Qt.platform.os === "windows" ? "Segoe UI Variable Text" : Qt.application.font.family
  readonly property int fontSize: 13
}
