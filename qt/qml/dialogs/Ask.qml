// UI.prompt / UI.choose / UI.confirm of v2.x: a dialog with a text field, a choice from a list, or only a question.
// finished(value): the text, the chosen index, true, or null when cancelled.
import QtQuick
import VLCR

DialogBox {
  id: dlg
  property string mode: "confirm"     // "prompt", "choose", "confirm"
  property string text: ""
  property string value: ""
  property var options: []            // choose: labels
  property string okLabel: "OK"
  property bool danger: false
  buttons: [{ label: "Cancel", value: null },
            { label: okLabel, primary: true, value: () => mode === "prompt" ? field.text : mode === "choose" ? +pick.value : true }]
  Column {
    width: parent.width; spacing: 12
    T { visible: dlg.text !== ""; width: parent.width; text: dlg.text; color: Theme.text2; wrapMode: Text.Wrap; elide: Text.ElideNone }
    TextField { id: field; visible: dlg.mode === "prompt"; width: parent.width; text: dlg.value; onAccepted: dlg.done(text) }
    Select { id: pick; visible: dlg.mode === "choose"; width: parent.width; options: dlg.options.map((o, i) => [i, o]); value: 0 }
  }
  onOpened: if (mode === "prompt") { field.input.forceActiveFocus(); field.input.selectAll(); }
}
