// Vela Player Pro (#53): what the one-time purchase unlocks, its price from the store, Buy and Restore.
import QtQuick
import VLCR

DialogBox {
  id: dlg
  property var ctl: null
  property string what: ""            // the part that led here (shown first)
  title: qsTr("Vela Player Pro")
  maxWidth: 420
  buttons: [{ label: "Not now", value: null }]
  readonly property var parts: [
    ["eq", "audio", "Equalizer and audio effects", "10-band equalizer with presets, compressor, reverb, stereo widening and volume boost"],
    ["video", "video", "Video filters and 360° video", "Sharp upscaling, brightness, contrast, colour, sharpness and film grain; look around in 360° videos"],
    ["theme", "eye", "Themes and accent colours", "Light and black (AMOLED) themes, the system theme and every accent colour"],
    ["extras", "subtitle", "Subtitles online, recording and snapshots", "Find subtitles on OpenSubtitles, record what plays and save snapshots"]
  ]
  Connections { target: Store; function onBought() { dlg.ctl.osd(qsTr("Thank you! Vela Player Pro is unlocked")); dlg.done(true); } }
  Column {
    width: parent.width; spacing: 14
    T { width: parent.width; wrapMode: Text.Wrap; color: Theme.text2
        text: qsTr("Playing, the library, playlists and subtitles stay free. One purchase unlocks everything below, for good, on all your devices with this Google account.") }
    Repeater {
      model: dlg.parts.slice().sort((a, b) => (b[0] === dlg.what) - (a[0] === dlg.what))
      Row {
        required property var modelData
        width: parent.width; spacing: 12
        Rectangle { width: 34; height: 34; radius: 17; color: Theme.accentDark
          Icon { anchors.centerIn: parent; width: 16; height: 16; name: modelData[1]; color: Theme.accent } }
        Column { width: parent.width - 46; spacing: 2
          T { text: qsTr(modelData[2]); color: Theme.text; font.weight: Font.DemiBold; width: parent.width; wrapMode: Text.Wrap }
          T { text: qsTr(modelData[3]); color: Theme.muted; px: 12; width: parent.width; wrapMode: Text.Wrap } }
      }
    }
    Button { width: parent.width; height: 40; kind: "primary"
             text: Store.price ? qsTr("Unlock Pro for %1").arg(Store.price) : qsTr("Unlock Pro"); onClicked: Store.buy() }
    T { visible: Store.error !== ""; width: parent.width; wrapMode: Text.Wrap; color: "#e5534b"; px: 12; text: Store.error }
    Button { anchors.horizontalCenter: parent.horizontalCenter; kind: "ghost"; text: qsTr("Restore purchase"); onClicked: { Store.restore(); dlg.ctl.osd(qsTr("Checking your purchases…")); } }
  }
}
