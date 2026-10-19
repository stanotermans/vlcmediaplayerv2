// A v2.x menu (right-click and "…" menus). items: [{ label, icon, checked, accent, danger, disabled, kbd, action,
// sub: [items] or () => [items] }, { sep: true }, { header: "…" }, null (skipped)]. Submenus open on hover (120 ms)
// to the right, or to the left at the window edge. Escape or a click elsewhere closes all of them; arrow keys move.
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR

C.Popup {
  id: menu
  property var items: []
  property var parentMenu: null
  property int current: -1
  readonly property var list: (typeof items === "function" ? items() : items).filter(i => i)
  padding: 6
  width: Math.max(250, col.implicitWidth + 12)
  closePolicy: parentMenu ? C.Popup.NoAutoClose : C.Popup.CloseOnEscape | C.Popup.CloseOnPressOutside
  background: MenuBackground {}
  enter: Transition { NumberAnimation { property: "opacity"; from: 0; to: 1; duration: 90 } }
  // keep inside the window
  function placeAt(px, py, leftAlt) {
    const W = parent.width, H = parent.height;
    let x = px, y = py;
    if (x + width > W - 6) x = leftAlt !== undefined ? leftAlt - width - 2 : W - width - 6;
    if (y + height > H - 6) y = Math.max(6, H - height - 6);
    menu.x = Math.max(6, x); menu.y = y;
  }
  function closeAll() { let m = menu; while (m.parentMenu) m = m.parentMenu; m.close(); }
  property var sub: null
  function closeSub() { if (sub) { sub.closeSub(); sub.close(); sub.destroy(); sub = null; } }
  onClosed: { closeSub(); if (!parentMenu) destroy(); }
  function openSub(item, row) {
    closeSub();
    const p = row.mapToItem(menu.parent, 0, 0);
    sub = Qt.createComponent("ContextMenu.qml").createObject(menu.parent, { items: item.sub, parentMenu: menu });
    sub.open();
    sub.placeAt(p.x + row.width + 8, p.y - 6, p.x - 6);
  }
  function activate(item, row) {
    if (item.disabled) return;
    if (item.sub) return openSub(item, row);
    closeAll();
    if (item.action) item.action();
  }
  Timer { id: subTimer; interval: 120; property var item; property var row; onTriggered: menu.openSub(item, row) }

  contentItem: Column {
    id: col
    focus: true
    Keys.onPressed: e => {
      const n = menu.list.length;
      const step = d => { let i = menu.current; for (let k = 0; k < n; k++) { i = (i + d + n) % n; const it = menu.list[i]; if (!it.sep && !it.header && !it.disabled) { menu.current = i; return; } } };
      if (e.key === Qt.Key_Down) { step(1); e.accepted = true; }
      else if (e.key === Qt.Key_Up) { step(-1); e.accepted = true; }
      else if ((e.key === Qt.Key_Return || e.key === Qt.Key_Space || e.key === Qt.Key_Right) && menu.current >= 0) { menu.activate(menu.list[menu.current], rep.itemAt(menu.current)); e.accepted = true; }
      else if (e.key === Qt.Key_Left && menu.parentMenu) { menu.close(); e.accepted = true; }
    }
    Repeater {
      id: rep
      model: menu.list
      Loader {
        required property var modelData
        required property int index
        width: menu.width - 12
        sourceComponent: modelData.sep ? sepC : modelData.header ? headC : itemC
        Component { id: sepC; Item { height: 11; Rectangle { x: 4; y: 5; width: parent.width - 8; height: 1; color: Theme.line } } }
        Component { id: headC; T { leftPadding: 10; topPadding: 6; bottomPadding: 2; text: qsTr(modelData.header).toUpperCase(); px: 11; font.letterSpacing: 0.44; color: Theme.dim } }
        Component {
          id: itemC
          MenuItem {
            label: modelData.label || ""; icon: modelData.icon || ""; checked: !!modelData.checked; accent: !!modelData.accent
            danger: !!modelData.danger; disabled: !!modelData.disabled; kbd: modelData.kbd || ""; hasSub: !!modelData.sub
            highlighted: menu.current === index || hoveredNow
            property bool hoveredNow: false
            onHovered: {
              menu.current = index;
              if (modelData.sub) { subTimer.item = modelData; subTimer.row = this; subTimer.restart(); }
              else { subTimer.stop(); menu.closeSub(); }
            }
            onActivated: menu.activate(modelData, this)
          }
        }
      }
    }
  }
}
