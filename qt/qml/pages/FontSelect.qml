// The subtitle font: your own fonts, a few defaults, then every font installed on this computer
import QtQuick
import VLCR

Select {
  property var ctl: null
  readonly property var defaults: ["Segoe UI", "Inter", "Arial", "Verdana", "Tahoma", "Georgia", "Trebuchet MS", "Consolas", "Comic Sans MS"]
  path: "subFont"
  options: {
    const seen = {}, out = [], add = n => { if (n && !seen[n]) { seen[n] = true; out.push([n, n]); } };
    (Settings.values.customFonts || []).forEach(f => add(f.name)); defaults.forEach(add);
    if (ctl) ctl.subs.systemFonts().forEach(add);
    add(Settings.values.subFont);
    return out;
  }
}
