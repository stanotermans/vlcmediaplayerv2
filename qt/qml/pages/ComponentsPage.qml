// Every component of the design system on one page (for checking against v2.x; not in the finished app)
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR

Column {
  id: page
  width: parent ? parent.width : 600
  Section {
    title: "Theme"
    SettingRow { label: "Theme"; Segmented { path: "theme"; options: [["system", "System"], ["dark", "Dark"], ["light", "Light"], ["black", "Black"]] } }
    SettingRow { label: "Accent color"; Swatches { path: "accent"; colors: Settings.accents } }
    SettingRow { label: "Subtitle color"; ColorField { path: "subColor" } }
  }
  Section {
    title: "Controls"
    SettingRow { label: "Toggle"; info: "A setting that is on or off."; Toggle { path: "dimWatched" } }
    SettingRow { label: "Selection"; Select { path: "startView"; options: [["home", "Home"], ["videos", "Videos"], ["music", "Music"], ["recent", "Recent"]] } }
    SettingRow { label: "Text"; TextField { path: "subLang"; placeholder: "e.g. en, nl" } }
    Slider { label: "Slider"; min: 0; max: 200; path: "gain"; fmt: v => v + "%"; ticks: 2 }
    Slider { label: "Centred slider (double-click: 0)"; min: -1000; max: 1000; step: 10; path: "audioDelay"; fmt: v => (v > 0 ? "+" : "") + v + " ms"; center: true; ticks: 2 }
    Collapse {
      SettingRow { label: "Inside a folded group"; Toggle { path: "showBadge" } }
      Slider { label: "Sepia intensity"; min: 0; max: 100; path: "vf.sepia"; fmt: v => v + "%"; ticks: 2 }
    }
  }
  Section {
    title: "Buttons, menus and dialogs"
    last: true
    Row {
      spacing: 8; topPadding: 10; bottomPadding: 10
      Button { text: "Button" }
      Button { text: "Primary"; kind: "primary" }
      Button { text: "Ghost"; kind: "ghost" }
      Button { id: menuBtn; text: "Open a menu"; icon: "chevron"
        onClicked: { const p = mapToItem(C.Overlay.overlay, 0, height + 4);
          const m = Qt.createComponent("../controls/ContextMenu.qml").createObject(C.Overlay.overlay, { items: page.demoMenu() }); m.open(); m.placeAt(p.x, p.y); } }
      Button { text: "Open a dialog"; onClicked: demo.open() }
    }
  }
  function demoMenu() {
    return [
      { label: "Play", icon: "play", accent: true, kbd: "Space" },
      { label: "Add to playlist…", icon: "playlist" },
      { label: "Mark as watched", icon: "eye" },
      { sep: true },
      { label: "Playback", icon: "playback", sub: [{ header: "Speed" }, { label: "0.5×" }, { label: "1×", checked: true }, { label: "2×" }] },
      { label: "Disabled item", disabled: true },
      { sep: true },
      { label: "Remove from library", icon: "trash", danger: true }
    ];
  }
  DialogBox {
    id: demo
    title: "Add to playlist"
    buttons: [{ label: "Cancel", value: null }, { label: "Add", value: true, primary: true }]
    T { width: parent.width; wrapMode: Text.Wrap; elide: Text.ElideNone; color: Theme.muted; text: qsTr("A dialog like v2.x's: title bar with ×, a body, and the buttons at the bottom right. Escape or a click outside closes it.") }
  }
}
