// Settings → Audio (v2.x panels.js "audio")
import QtQuick
import QtQuick.Dialogs
import VLCR

Column {
  id: page
  property var ctl: null
  width: parent ? parent.width : 600
  Section {
    title: "Effects"
    EffectRows { vertical: true }
  }
  Section {
    title: "Speakers"
    SettingRow { label: "Surround sound (5.1 / 7.1)"; info: "Keeps the surround channels of films and music, also when the file is converted. Turn it off to always get stereo. Your speakers or receiver must be set to 5.1 or 7.1 in the system sound settings."
                 Toggle { path: "surround" } }
    SettingRow { label: "Passthrough (Dolby / DTS to receiver)"; info: "Sends Dolby Digital, Dolby TrueHD (Atmos), DTS and DTS-HD unchanged to an AV receiver or soundbar over HDMI or S/PDIF, which decodes them. The equalizer, effects and volume of the app do not apply to that sound. Takes effect after restarting the app."
                 Toggle { path: "passthrough"; onToggled: page.ctl.osd(qsTr("Restart the app to apply this")) } }
  }
  Section {
    title: "Volume"
    Slider { label: "Volume boost"; min: 0; max: 200; path: "gain"; fmt: v => v + "%"; ticks: 2 }
  }
  Section {
    title: "Audio sync"
    Slider { label: "Audio delay"; min: -1000; max: 1000; step: 10; path: "audioDelay"; fmt: v => (v > 0 ? "+" : "") + v + " ms"; center: true; ticks: 2 }
    Note { text: qsTr("Sound late, for example with Bluetooth headphones? Move it to the left so the sound comes earlier; to the right makes it later. Also in the quick settings (Audio) and with J / Shift + J.") }
  }
  Section {
    title: "MIDI"
    last: true
    SettingRow { label: "SoundFont"; info: "The instrument sounds used to play MIDI files (.sf2 or .sf3)."
                 TextField { width: 260; text: Settings.values.soundfont || qsTr("Built-in (FluidR3 Mono)"); input.readOnly: true; input.color: Theme.muted } }
    Row { spacing: 8; topPadding: 10; bottomPadding: 10; visible: SettingsSearch.q === ""
      Button { text: qsTr("Choose SoundFont"); kind: "ghost"; onClicked: sf.open() }
      Button { text: qsTr("Use built-in"); kind: "ghost"; onClicked: Settings.set("soundfont", "") } }
    FileDialog { id: sf; nameFilters: ["SoundFont (*.sf2 *.sf3)"]; onAccepted: Settings.set("soundfont", page.ctl.library.toLocal(selectedFile)) }
  }
}
