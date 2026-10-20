// What's new (#71): the parts of CHANGELOG.md (built into the app) newer than "since", or all of it
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR

DialogBox {
  id: dlg
  property string since: ""          // the version that was installed before ("" = everything)
  title: "What's new"
  maxWidth: 620
  buttons: [{ label: "OK", value: true, primary: true }]
  function newer(a, b) {             // version a is newer than b
    const x = a.split(".").map(Number), y = b.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    return false;
  }
  readonly property string text: {
    const parts = System.changelog().split(/^## /m).filter(p => p.trim());
    const keep = parts.filter(p => { const v = p.split("\n")[0].trim(); return !dlg.since || dlg.newer(v, dlg.since); });
    return keep.map(p => "### " + p.replace(/^([^\n]*)/, qsTr("Version %1").arg("$1"))).join("\n")
  }
  Flickable {
    width: parent.width; height: Math.min(md.implicitHeight, 420)
    contentHeight: md.implicitHeight; clip: true; boundsBehavior: Flickable.StopAtBounds
    C.ScrollBar.vertical: ScrollBar {}
    T {
      id: md
      width: parent.width - 12; wrapMode: Text.Wrap; elide: Text.ElideNone; lineHeight: 1.25
      textFormat: Text.MarkdownText; color: Theme.text2; text: dlg.text
    }
  }
}
