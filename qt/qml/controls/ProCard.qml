// Vela Player Pro on a phone's settings list (#53): what it unlocks, the price, a 7-day trial (once), Buy and Restore;
// once bought a thank-you, during the trial the days left.
import QtQuick
import VLCR

Rectangle {
  id: root
  property var ctl: null
  height: col.height + 24; radius: 12; color: Theme.accentSoft; border.width: 1; border.color: Theme.accent
  Column {
    id: col
    x: 14; y: 12; width: parent.width - 28; spacing: 8
    Row {
      width: parent.width; spacing: 10
      Image { width: 26; height: 26; sourceSize: Qt.size(52, 52); source: Theme.logo; anchors.verticalCenter: parent.verticalCenter }
      T { text: qsTr("Vela Player Pro"); px: 15; color: Theme.text; font.weight: Font.DemiBold; anchors.verticalCenter: parent.verticalCenter
          width: parent.width - 36 - price.width }
      T { id: price; visible: !Store.owned; text: Store.price; px: 14; color: Theme.accent; anchors.verticalCenter: parent.verticalCenter }
    }
    T { width: parent.width; wrapMode: Text.Wrap; px: 12; color: Theme.text2
        text: Store.owned ? qsTr("Pro is active. Thank you!")
            : Store.trialDays > 0 ? qsTr("Pro trial: %1 days left").arg(Store.trialDays)
            : qsTr("Equalizer, video filters, themes, subtitles online and recording. One-time purchase, no subscription.") }
    Flow {
      visible: !Store.owned
      width: parent.width; spacing: 8
      Button { visible: Store.trialAvailable; kind: "primary"; text: qsTr("Try 7 days free"); onClicked: Store.startTrial() }
      Button { kind: Store.trialAvailable ? "" : "primary"; text: qsTr("Buy"); onClicked: Store.buy() }
      Button { kind: "ghost"; text: qsTr("Restore"); onClicked: { Store.restore(); if (root.ctl) root.ctl.osd(qsTr("Checking your purchases…")); } }
    }
    T { visible: Store.error !== ""; width: parent.width; wrapMode: Text.Wrap; color: "#e5534b"; px: 12; text: Store.error }
  }
}
