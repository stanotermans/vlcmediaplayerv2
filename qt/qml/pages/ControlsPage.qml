// Settings → Controls (v2.x panels.js keyEditor, #37): every action with its keys and a Change button that listens
// for the next key press; the mouse in the player.
import QtQuick
import VLCR

Column {
  id: page
  property var ctl: null
  width: parent ? parent.width : 600
  property string listening: ""
  Section {
    title: "Keyboard shortcuts"
    Repeater {
      model: { Settings.values.keys; return page.ctl.pb.actions.map(a => ({ id: a[0], label: a[1], keys: page.ctl.pb.keysFor(a[0]), changed: !!(Settings.values.keys || {})[a[0]] })); }
      Item {   // .kbrow
        id: kr
        required property var modelData
        readonly property string searchLabel: modelData.label
        visible: SettingsSearch.match(modelData.label)
        width: parent.width; height: 44
        T { anchors.verticalCenter: parent.verticalCenter; text: qsTr(kr.modelData.label); color: kr.modelData.changed ? Theme.accent : Theme.text2 }
        Row {
          anchors { right: parent.right; verticalCenter: parent.verticalCenter }
          spacing: 10
          T { visible: page.listening === kr.modelData.id; anchors.verticalCenter: parent.verticalCenter; text: qsTr("Press a key…"); color: Theme.accent; font.weight: Font.DemiBold
              SequentialAnimation on opacity { running: page.listening === kr.modelData.id; loops: Animation.Infinite
                NumberAnimation { to: 0.4; duration: 1000 } NumberAnimation { to: 1; duration: 1000 } } }
          KeyCaps { visible: page.listening !== kr.modelData.id && kr.modelData.keys.length > 0; keys: kr.modelData.keys; anchors.verticalCenter: parent.verticalCenter }
          T { visible: page.listening !== kr.modelData.id && !kr.modelData.keys.length; text: qsTr("No key"); color: Theme.muted; font.italic: true; anchors.verticalCenter: parent.verticalCenter }
          Button { text: qsTr("Change"); kind: "ghost"; compact: true; anchors.verticalCenter: parent.verticalCenter
                   onClicked: { page.listening = kr.modelData.id; catcher.forceActiveFocus(); } }
        }
      }
    }
    Item {   // takes the next key press while listening
      id: catcher
      width: 1; height: 1
      Keys.onPressed: e => {
        if (!page.listening) return;
        if ([Qt.Key_Shift, Qt.Key_Control, Qt.Key_Alt, Qt.Key_Meta, Qt.Key_AltGr, Qt.Key_CapsLock].indexOf(e.key) >= 0) return;
        e.accepted = true;
        const id = page.listening; page.listening = "";
        if (e.key === Qt.Key_Escape) return;
        // a new key replaces the keyboard keys; the media keys (⏯ ⏭ ⏮ ⏹) stay with the action
        const key = page.ctl.keys.nameOf(e.key, e.modifiers, e.text);
        const media = page.ctl.pb.keysFor(id).filter(k => /^Media/.test(k) && k !== key);
        page.ctl.pb.setKeys(id, e.key === Qt.Key_Backspace || e.key === Qt.Key_Delete ? [] : [key].concat(media));
      }
      onActiveFocusChanged: if (!activeFocus) page.listening = ""
    }
    Note { text: qsTr("Click Change and press the new key. Esc cancels, Backspace removes the key. A key can belong to one action only.") }
    Row { topPadding: 10; bottomPadding: 10; visible: SettingsSearch.q === ""
          Button { text: qsTr("Reset to defaults"); kind: "ghost"; onClicked: Settings.set("keys", {}) } }
  }
  Section {
    title: "Mouse"
    last: true
    SettingRow { label: "Scroll wheel in player"
                 Select { options: [["volume", "Volume"], ["seek", "Seek"], ["none", "Nothing"]]; value: Settings.values.wheel || "volume"; onPicked: v => Settings.set("wheel", v) } }
    SettingRow { label: "Double-click in player"
                 Select { options: [["fullscreen", "Fullscreen"], ["play", "Play / pause"]]; value: Settings.values.dblclick || "fullscreen"; onPicked: v => Settings.set("dblclick", v) } }
  }
}
