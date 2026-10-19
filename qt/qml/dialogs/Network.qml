// "Open network stream" (panels.js openNetwork): one or more URLs, an optional playlist name and, under "Show more
// options", VLC's "Play another media synchronously". finished({ urls, name, extra }) or null.
import QtQuick
import QtQuick.Dialogs
import VLCR

DialogBox {
  id: dlg
  title: "Open network stream"
  maxWidth: 560
  buttons: [{ label: "Cancel", value: null }, { label: "Open", primary: true, value: () => ({ urls: urls.text, name: name.text, extra: syncOn && sync.text.trim() ? sync.text.trim() : "" }) }]
  property bool more: false
  property bool syncOn: false
  Column {
    width: parent.width; spacing: 6
    T { text: qsTr("Network URL"); font.weight: Font.DemiBold; color: Theme.text }
    T { text: qsTr("You can enter multiple links, one per line."); px: 12; color: Theme.muted }
    Rectangle {   // .txt.area, 5 rows
      width: parent.width; height: 110; radius: Theme.radius; color: Theme.track
      border.width: 1; border.color: urls.activeFocus ? Theme.accent : Theme.line
      Flickable {
        id: fl
        anchors { fill: parent; margins: 8 }
        contentHeight: urls.contentHeight; clip: true
        TextEdit {
          id: urls
          width: fl.width; wrapMode: TextEdit.WrapAnywhere
          font.family: Theme.font; font.pixelSize: Theme.fontSize; color: Theme.text
          selectionColor: Theme.accentSoft; selectedTextColor: Theme.text; selectByMouse: true
          T { visible: !urls.text; text: qsTr("e.g. https://www.example.com/stream.m3u8"); color: Theme.dim }
        }
      }
    }
    Item { width: 1; height: 8 }
    Row { spacing: 4
      T { text: qsTr("Playlist name"); font.weight: Font.DemiBold; color: Theme.text }
      T { text: qsTr("(optional)"); color: Theme.muted } }
    T { text: qsTr("The playlist will be saved and shown with this name."); px: 12; color: Theme.muted }
    TextField { id: name; width: parent.width; placeholder: "e.g. Favorite TV channels" }
    T {   // .formcol > .linkbtn
      topPadding: 6; bottomPadding: 4; color: Theme.accent; text: qsTr(dlg.more ? "Show fewer options" : "Show more options")
      MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: dlg.more = !dlg.more }
    }
    Column {   // .moreopts
      visible: dlg.more; width: parent.width; spacing: 6
      Row {   // label.chk
        spacing: 8
        Rectangle {
          width: 16; height: 16; radius: 4; anchors.verticalCenter: parent.verticalCenter
          color: dlg.syncOn ? Theme.accent : Theme.track; border.width: 1; border.color: dlg.syncOn ? Theme.accent : Theme.line
          Icon { anchors.centerIn: parent; width: 12; height: 12; name: "check"; color: Theme.accentText; visible: dlg.syncOn }
        }
        T { text: qsTr("Play another media synchronously"); color: Theme.text; anchors.verticalCenter: parent.verticalCenter }
        TapHandler { onTapped: dlg.syncOn = !dlg.syncOn }
      }
      T { width: parent.width; wrapMode: Text.Wrap; px: 12; color: Theme.muted
          text: qsTr("Plays the audio of this file or URL together with the stream, for example a separate audio track.") }
      Row {   // .pathrow
        width: parent.width; spacing: 8
        TextField { id: sync; width: parent.width - browse.width - 8; placeholder: "File or URL, e.g. an audio track or dub"; onTextChanged: dlg.syncOn = !!text.trim() }
        Button { id: browse; text: qsTr("Browse"); kind: "ghost"; onClicked: syncDlg.open() }
      }
    }
  }
  FileDialog { id: syncDlg; title: qsTr("Play another media synchronously")
               onAccepted: { const u = decodeURIComponent(String(selectedFile));
                             sync.text = Qt.platform.os === "windows" ? u.replace(/^file:\/\/\//, "").replace(/\//g, "\\") : u.replace(/^file:\/\//, "");
                             dlg.syncOn = true; } }
  onOpened: urls.forceActiveFocus()
}
