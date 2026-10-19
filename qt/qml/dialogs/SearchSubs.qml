// "Search subtitles online" (panels.js searchSubtitles): OpenSubtitles.com by title and languages, plus the file's
// hash (results that fit this exact file are marked). Downloading needs a free account: without one the login form
// is right in this dialog (only the session token is kept, never the password).
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR

DialogBox {
  id: dlg
  property var ctl: null
  property Subs subs: null
  property var it: ({})
  property string status: ""
  property var results: []
  property int busy: -1               // the row being downloaded
  title: "Search subtitles online"
  maxWidth: 720
  buttons: [{ label: "Close", value: null }]
  readonly property var errors: ({
    nokey: qsTr("Online subtitle search is not available in this build."),
    auth: qsTr("OpenSubtitles did not accept the login. Check your username and password."),
    limit: qsTr("Download limit reached for today. It resets at midnight (UTC)."),
    login: qsTr("Log in with a free OpenSubtitles.com account to download subtitles."),
    busy: qsTr("OpenSubtitles is busy right now. Try again in a moment."),
    network: qsTr("Could not reach OpenSubtitles. Check your internet connection."),
    write: qsTr("Could not save the subtitle file.")
  })
  function err(r) { return errors[r.error] || r.message || errors.network; }
  function run() {
    if (!subs.online) { status = errors.nokey; return; }
    const codes = subs.langCodes(langs.text);
    if (langs.text.trim() && !codes.length) { status = qsTr("Unknown language. Use two-letter codes like en or nl."); return; }
    if (codes.length) langs.text = codes.join(", ");
    status = qsTr("Searching…"); results = [];
    subs.search(query.text.trim(), codes.join(","), it.src || "");
  }
  Connections {
    target: dlg.subs
    function onSearched(r) {
      if (r.error) { dlg.status = dlg.err(r); return; }
      dlg.results = r.results;
      dlg.status = r.results.length ? qsTr("%1 subtitles found").arg(r.results.length) : qsTr("No subtitles found. Try a shorter title or another language.");
    }
    function onDownloaded(r) {
      dlg.busy = -1;
      if (r.error) { dlg.status = dlg.err(r); return; }
      if (Settings.values.subLang !== langs.text.trim()) Settings.set("subLang", langs.text.trim());
      dlg.ctl.sb.addFile(r.file, true);
      if (r.remaining !== undefined && r.remaining !== null) dlg.ctl.osd(qsTr("Subtitle loaded · %1 downloads left today").arg(r.remaining));
      dlg.done(true);
    }
    function onLoggedIn(r) { pass.text = ""; dlg.loginMsg = r.error ? dlg.err(r) : ""; if (!r.error) dlg.status = ""; }
  }
  property string loginMsg: ""
  Column {
    width: parent.width; spacing: 8
    Row {   // .osbar
      width: parent.width; spacing: 8
      TextField { id: query; width: parent.width - 130 - 8 - searchBtn.width - 8; text: dlg.subs.query(dlg.it.name || ""); placeholder: "Title, e.g. The Show S01E05"; onAccepted: dlg.run() }
      TextField { id: langs; width: 130; placeholder: "e.g. en, nl"; onAccepted: dlg.run()
                  text: (dlg.subs.langCodes(Settings.values.subLang || "").join(", ")) || Qt.locale().name.slice(0, 2) }
      Button { id: searchBtn; text: qsTr("Search"); kind: "primary"; onClicked: dlg.run() }
    }
    T { width: parent.width; px: 12; color: Theme.muted; wrapMode: Text.Wrap; elide: Text.ElideNone
        text: qsTr("Languages as two-letter codes (en, nl, de …) or names (English, Dutch), separated by commas.") }
    T { visible: dlg.status !== ""; width: parent.width; px: 12; color: Theme.muted; wrapMode: Text.Wrap; elide: Text.ElideNone; text: dlg.status }
    ListView {   // .osresults
      width: parent.width; height: Math.min(contentHeight, Math.min(460, dlg.parent ? dlg.parent.height * 0.45 : 400)); clip: true
      model: dlg.results
      spacing: 2
      C.ScrollBar.vertical: ScrollBar {}
      delegate: Rectangle {   // .osrow
        required property var modelData
        required property int index
        width: ListView.view.width; height: 52; radius: 6
        color: ra.containsMouse ? Theme.panel2 : "transparent"
        MouseArea { id: ra; anchors.fill: parent; hoverEnabled: true }
        Column {
          anchors { left: parent.left; leftMargin: 10; right: dl.left; rightMargin: 12; verticalCenter: parent.verticalCenter }
          spacing: 2
          T { width: parent.width; text: modelData.name || modelData.file; color: Theme.text }
          Row { spacing: 6
            T { px: 12; color: Theme.muted; anchors.verticalCenter: parent.verticalCenter
                text: [String(modelData.lang || "").toUpperCase(), modelData.title && (modelData.title + (modelData.year ? " (" + modelData.year + ")" : "")), qsTr("%1 downloads").arg(modelData.downloads)].filter(Boolean).join(" · ") }
            Rectangle { visible: modelData.match; height: 16; width: mt.implicitWidth + 12; radius: 8; color: Theme.accentSoft; anchors.verticalCenter: parent.verticalCenter
                        T { id: mt; anchors.centerIn: parent; px: 10; text: qsTr("Fits this file"); color: Theme.accent } }
            Rectangle { visible: modelData.hi; height: 16; width: 26; radius: 8; color: Theme.panel3; anchors.verticalCenter: parent.verticalCenter
                        T { anchors.centerIn: parent; px: 10; text: "HI"; color: Theme.text2 } }
          }
        }
        Button { id: dl; anchors { right: parent.right; rightMargin: 10; verticalCenter: parent.verticalCenter } kind: "primary"
                 text: dlg.busy === index ? qsTr("Downloading…") : qsTr("Download"); enabled: dlg.busy < 0
                 onClicked: { dlg.busy = index; dlg.subs.download(modelData.fileId, dlg.it.src || "", modelData.lang || ""); } }
      }
    }
    Column {   // the OpenSubtitles account
      width: parent.width; spacing: 8
      visible: dlg.subs.online
      T { width: parent.width; px: 12; color: Theme.muted; wrapMode: Text.Wrap; elide: Text.ElideNone
          text: dlg.subs.user ? qsTr("Logged in to OpenSubtitles as %1.").arg(dlg.subs.user)
                              : qsTr("Downloading subtitles needs a free OpenSubtitles.com account (20 downloads per day). Searching works without one. Your password is not stored.") }
      Row {
        visible: !dlg.subs.user; spacing: 8
        TextField { id: user; width: 200; placeholder: "Username" }
        TextField { id: pass; width: 200; placeholder: "Password"; input.echoMode: TextInput.Password
                    onAccepted: { dlg.loginMsg = qsTr("Logging in…"); dlg.subs.login(user.text.trim(), pass.text); } }
        Button { text: qsTr("Log in"); kind: "primary"; onClicked: { dlg.loginMsg = qsTr("Logging in…"); dlg.subs.login(user.text.trim(), pass.text); } }
      }
      Button { visible: !!dlg.subs.user; text: qsTr("Log out"); kind: "ghost"; onClicked: dlg.subs.logout() }
      T { visible: dlg.loginMsg !== ""; px: 12; color: Theme.muted; text: dlg.loginMsg }
    }
  }
  onOpened: run()
}
