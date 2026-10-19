// Settings → Subtitles (v2.x panels.js "subtitles"): tracks and languages, appearance with a preview, the
// OpenSubtitles account, lyrics, and your own subtitle fonts.
import QtQuick
import QtQuick.Dialogs
import VLCR

Column {
  id: page
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Tracks and languages"
    SettingRow { label: "Load subtitles automatically"; info: "Loads .srt/.ass files with the same name as the video."; Toggle { path: "subAuto" } }
    SettingRow { label: "Preferred language"; info: "Embedded subtitles in this language are selected automatically."; TextField { path: "subLang"; placeholder: "e.g. en, nl" } }
  }
  Section {
    title: "Appearance"
    SettingRow { label: "Font"; info: "Your own fonts, followed by every font installed on this computer."; FontSelect { ctl: page.ctl } }
    Slider { label: "Size"; min: 50; max: 250; path: "subSize"; fmt: v => v + "%" }
    SettingRow { label: "Text color"; ColorField { path: "subColor" } }
    SettingRow { label: "Outline color"; ColorField { path: "subOutline" } }
    Slider { label: "Background opacity"; min: 0; max: 100; path: "subBg"; fmt: v => v + "%" }
    Rectangle {   // .subpreview
      visible: SettingsSearch.q === ""
      width: parent.width; height: 90; radius: 8
      gradient: Gradient { orientation: Gradient.Horizontal; GradientStop { position: 0; color: "#3a4a5a" } GradientStop { position: 1; color: "#1d2a1d" } }
      Rectangle {
        anchors { horizontalCenter: parent.horizontalCenter; bottom: parent.bottom; bottomMargin: 12 }
        width: pv.implicitWidth + 16; height: pv.implicitHeight + 2; radius: 3
        color: Qt.rgba(0, 0, 0, (Settings.values.subBg ?? 60) / 100)
        Text { id: pv; anchors.centerIn: parent; text: qsTr("Subtitle preview"); font.family: Settings.values.subFont || "Segoe UI"
               font.pixelSize: 18 * (Settings.values.subSize || 100) / 100; color: Settings.values.subColor || "#ffffff"
               style: Text.Outline; styleColor: Settings.values.subOutline || "#0c0c0c" }
      }
    }
    Item { width: 1; height: 6 }
  }
  Section {
    title: "Online subtitles (OpenSubtitles)"
    OsAccount { subs: page.ctl.subs; readonly property string searchLabel: "OpenSubtitles" }
  }
  Section {
    title: "Lyrics"
    SettingRow { label: "Load lyrics (.lrc) automatically"; info: "Loads a .lrc file with the same name as the song, also when subtitles are not loaded automatically."; Toggle { path: "lrcAuto" } }
    SettingRow { label: "Show lyrics full-screen for music"; info: "Shows the lyrics large, following the song. Off: lyrics appear as subtitles. For videos, .lrc files are always shown as subtitles."; Toggle { path: "lyricsView" } }
    Slider { label: "Lyrics text size"; min: 50; max: 300; path: "lyricsSize"; fmt: v => v + "%" }
    Note { text: qsTr("Separate from the subtitle size above. Lyrics shown as subtitles use the subtitle size.") }
  }
  Section {
    title: "Your fonts"
    last: true
    Column {   // .folderlist
      readonly property string searchLabel: "Your fonts"
      width: parent.width; spacing: 4; topPadding: 6; bottomPadding: 6
      Repeater {
        model: Settings.values.customFonts || []
        Rectangle {   // .folderitem
          required property var modelData
          width: parent.width; height: 36; radius: Theme.radius; color: Theme.track
          Row { x: 8; anchors.verticalCenter: parent.verticalCenter; spacing: 10
            Icon { name: "subtitle"; color: Theme.text2; anchors.verticalCenter: parent.verticalCenter }
            Text { text: modelData.name; font.family: modelData.name; font.pixelSize: 13; color: Theme.text2; anchors.verticalCenter: parent.verticalCenter } }
          IconButton { anchors { right: parent.right; rightMargin: 4; verticalCenter: parent.verticalCenter } name: "trash"; tip: qsTr("Remove")
                       onClicked: { Settings.set("customFonts", Settings.values.customFonts.filter(x => x.file !== modelData.file)); page.ctl.subs.removeFont(modelData.file);
                                    if (Settings.values.subFont === modelData.name) Settings.set("subFont", "Segoe UI"); } }
        }
      }
      Note { visible: !(Settings.values.customFonts || []).length && SettingsSearch.q === ""
             text: qsTr("Add .ttf, .otf or .woff files to use them for subtitles. They are copied into the app, so you can delete the originals.") }
    }
    Row { topPadding: 10; bottomPadding: 10; visible: SettingsSearch.q === ""
          Button { text: qsTr("Add font file…"); kind: "primary"; onClicked: fontDlg.open() } }
    FileDialog {
      id: fontDlg; fileMode: FileDialog.OpenFiles; nameFilters: [qsTr("Fonts") + " (*.ttf *.otf *.woff *.woff2)"]
      onAccepted: {
        const ok = page.ctl.subs.addFonts(selectedFiles.map(u => u.toString()));
        if (!ok.length) return page.ctl.osd(qsTr("Not a valid font file: %1").arg(selectedFiles[0].toString().split("/").pop()));
        Settings.set("customFonts", (Settings.values.customFonts || []).concat(ok));
        Settings.set("subFont", ok[0].name);
      }
    }
  }
}
