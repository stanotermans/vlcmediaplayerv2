// The v2.x slider: label and value on top, a thick 20px track (2px track-coloured border) filled with the dark accent
// up to the value (from 0 with center: true), an 8×24 accent thumb, optional tick marks. Double-click resets a
// centred slider to 0. Arrow keys step.
import QtQuick
import VLCR

Column {
  id: root
  property string label: ""
  property real min: 0
  property real max: 100
  property real step: 1
  property string path: ""
  property var fmt: v => String(v)
  property int ticks: 0
  property bool center: false
  property bool box: false          // the value in an editable box (v2.x's valbox): type a number, Enter sets it
  property bool editing: false      // #58: a click on the value of any slider opens the same box
  property real value: path !== "" ? (Settings.values, Number(Settings.get(path))) : 0
  signal moved(real v)
  property bool controlled: false   // value comes from a binding and is changed by the owner (on moved)
  property bool shown: true
  readonly property string searchLabel: label
  visible: shown && SettingsSearch.match(label)
  spacing: 8
  topPadding: 6; bottomPadding: 6
  width: parent ? parent.width : 300

  function setValue(v) {
    v = Math.min(max, Math.max(min, Math.round((v - min) / step) * step + min));
    v = Number(v.toFixed(6));
    if (path !== "") Settings.set(path, v); else if (!controlled) value = v;
    moved(v);
  }
  readonly property real p: (value - min) / (max - min)
  readonly property real c: Math.min(1, Math.max(0, (0 - min) / (max - min)))

  Item {
    width: root.width; height: root.box || root.editing ? val.implicitHeight + 10 : Math.max(lbl.implicitHeight, val.implicitHeight)
    T { id: lbl; text: qsTr(root.label); color: Theme.text2; width: parent.width - (root.box || root.editing ? 120 : val.implicitWidth + 10); anchors.verticalCenter: parent.verticalCenter }
    T { id: val; anchors.right: parent.right; text: root.fmt(root.value); color: Theme.muted; font.features: { "tnum": 1 }; visible: !root.box && !root.editing
         MouseArea { anchors.fill: parent; anchors.margins: -4; cursorShape: Qt.IBeamCursor; onClicked: { root.editing = true; edit.selectAll(); edit.forceActiveFocus(); } } }
    Rectangle {
      visible: root.box || root.editing
      anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
      width: 110; height: edit.implicitHeight + 10; radius: Theme.radius; color: Theme.track
      border.width: 1; border.color: edit.activeFocus ? Theme.accent : Theme.line
      TextInput {
        id: edit
        anchors.fill: parent; anchors.leftMargin: 10; anchors.rightMargin: 10; verticalAlignment: TextInput.AlignVCenter
        color: Theme.text; selectionColor: Theme.accentSoft; selectByMouse: true; clip: true
        font.pixelSize: val.font.pixelSize; font.family: val.font.family; font.features: { "tnum": 1 }
        Binding on text { value: root.fmt(root.value); when: !edit.activeFocus; restoreMode: Binding.RestoreNone }
        function commit() {
          const n = parseFloat(text.replace(",", "."));
          if (isFinite(n)) { const v = Math.min(root.max, Math.max(root.min, n)); if (root.path !== "") Settings.set(root.path, v); else if (!root.controlled) root.value = v; root.moved(v); }
          text = root.fmt(root.value);
        }
        onAccepted: { commit(); focus = false; }
        onEditingFinished: { commit(); root.editing = false; }
        onActiveFocusChanged: if (!activeFocus) root.editing = false
        Keys.onEscapePressed: { text = root.fmt(root.value); focus = false; root.editing = false; }
      }
    }
  }
  Item {
    id: trackBox
    width: root.width; height: 24
    activeFocusOnTab: true
    Accessible.role: Accessible.Slider; Accessible.name: root.label
    Keys.onPressed: e => {
      if (e.key === Qt.Key_Left || e.key === Qt.Key_Down) { root.setValue(root.value - root.step); e.accepted = true; }
      else if (e.key === Qt.Key_Right || e.key === Qt.Key_Up) { root.setValue(root.value + root.step); e.accepted = true; }
    }
    Rectangle {   // track: 20px, 6px rounded, 2px border in the track colour
      id: track
      anchors.verticalCenter: parent.verticalCenter
      width: parent.width; height: 20; radius: 6; color: Theme.track; clip: true
      Rectangle {
        readonly property real a: root.center ? Math.min(root.p, root.c) : 0
        readonly property real b: root.center ? Math.max(root.p, root.c) : root.p
        x: 2 + (parent.width - 4) * a; y: 2; width: (parent.width - 4) * (b - a); height: parent.height - 4
        radius: root.center ? 0 : 4; color: Theme.accentDark
      }
      Repeater {   // tick marks: a 2px line at the end of each part
        model: root.ticks > 1 ? root.ticks - 1 : 0
        Rectangle { required property int index; x: 2 + (track.width - 4) * (index + 1) / root.ticks - 2; y: 2; width: 2; height: track.height - 4; color: "#14ffffff" }
      }
    }
    Rectangle {   // thumb 8×24
      x: 2 + (track.width - 4) * root.p - width / 2; anchors.verticalCenter: parent.verticalCenter
      width: 8; height: 24; radius: 4; color: Theme.accent
      border.width: trackBox.activeFocus ? 3 : 1; border.color: trackBox.activeFocus ? Theme.accentSoft : "#44000000"
    }
    MouseArea {
      anchors.fill: parent
      cursorShape: Qt.PointingHandCursor
      function at(x) { root.setValue(root.min + Math.min(1, Math.max(0, (x - 2) / (width - 4))) * (root.max - root.min)); }
      onPressed: m => { trackBox.forceActiveFocus(); at(m.x); }
      onPositionChanged: m => { if (pressed) at(m.x); }
      onDoubleClicked: if (root.center) root.setValue(0)
    }
  }
}
