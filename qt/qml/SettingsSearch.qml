// The text typed into the search field of the settings window: rows (SettingRow, Slider) whose label contains it stay
// visible, sections without such rows hide.
pragma Singleton
import QtQuick

QtObject {
  property string q: ""
  function match(label) { return !q || qsTr(label).toLowerCase().indexOf(q.toLowerCase()) >= 0; }
  // any searchable row inside an item (sections, folded groups)
  function any(item) {
    if (!q) return true;
    for (const c of item.children) {
      if (c.searchLabel !== undefined) { if (c.shown !== false && match(c.searchLabel)) return true; }
      else if (any(c)) return true;
    }
    return false;
  }
}
