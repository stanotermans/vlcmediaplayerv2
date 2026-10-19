// The OpenSubtitles account (v2.x panels.js osAccountBlock): log in for downloads (only the session token is kept),
// or who is logged in with Log out.
import QtQuick
import VLCR

Column {
  id: root
  property Subs subs: null
  property string msg: ""
  signal changed()
  width: parent ? parent.width : 500
  spacing: 8
  readonly property var errors: ({
    auth: qsTr("OpenSubtitles did not accept the login. Check your username and password."),
    network: qsTr("Could not reach OpenSubtitles. Check your internet connection."),
    busy: qsTr("OpenSubtitles is busy right now. Try again in a moment.")
  })
  function login() { msg = qsTr("Logging in…"); subs.login(user.text.trim(), pass.text); }
  Connections { target: root.subs; function onLoggedIn(r) { pass.text = ""; root.msg = r.error ? (root.errors[r.error] || r.message || root.errors.network) : ""; if (!r.error) root.changed(); } }
  T { width: parent.width; px: 12.5; color: Theme.muted; wrapMode: Text.Wrap; elide: Text.ElideNone; topPadding: 8
      text: !root.subs.online ? qsTr("Online subtitle search is not available in this build.")
          : root.subs.user ? qsTr("Logged in to OpenSubtitles as %1.").arg(root.subs.user)
          : qsTr("Downloading subtitles needs a free OpenSubtitles.com account (20 downloads per day). Searching works without one. Your password is not stored.") }
  Row {
    visible: root.subs.online && !root.subs.user; spacing: 8
    TextField { id: user; width: 200; placeholder: "Username" }
    TextField { id: pass; width: 200; placeholder: "Password"; input.echoMode: TextInput.Password; onAccepted: root.login() }
    Button { text: qsTr("Log in"); kind: "primary"; onClicked: root.login() }
  }
  Button { visible: root.subs.online && !!root.subs.user; text: qsTr("Log out"); kind: "ghost"; onClicked: { root.subs.logout(); root.changed(); } }
  T { visible: root.msg !== ""; px: 12; color: Theme.muted; text: root.msg }
}
