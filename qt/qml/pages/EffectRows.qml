// The audio effect controls (v2.x panels.js eqBlock, compBlock, reverbBlock, widenBlock): the equalizer with its
// preset, the compressor, spatial audio and stereo widening, each with its sliders in a folded group.
// vertical: the equalizer as upright sliders (the settings page); otherwise as rows (the quick settings).
import QtQuick
import VLCR
import "Effects.js" as FX

Column {
  id: root
  property bool vertical: true
  property bool eqOpen: vertical
  property string part: ""          // "eq" or "fx": only the equalizer or only the other effects (quick settings)
  readonly property bool eq: part !== "fx"
  readonly property bool fx: part !== "eq"
  width: parent ? parent.width : 400
  function setPreset(k) { const p = FX.EQ_PRESETS[k]; if (!p) return; Settings.set("eqPreset", k); Settings.set("eq", p.slice(1)); Settings.set("eqOn", true); }
  function band(i, v) { const eq = (Settings.values.eq || []).slice(); eq[i] = v; Settings.set("eq", eq); if (Settings.values.eqPreset !== "custom") Settings.set("eqPreset", "custom"); if (!Settings.values.eqOn) Settings.set("eqOn", true); }
  SettingRow { shown: root.eq; label: "Equalizer"; info: root.vertical ? "10-band equalizer with preamp." : ""; Toggle { path: "eqOn" } }
  SettingRow { shown: root.eq; label: root.vertical ? "Equalizer preset" : "Preset"
               Select { width: root.vertical ? 220 : 160; options: FX.presetOptions(); value: Settings.values.eqPreset || "flat"; onPicked: v => { if (v !== "custom") root.setPreset(v); else Settings.set("eqPreset", "custom"); } } }
  Collapse {
    shown: root.eq
    open: root.eqOpen
    onLabel: root.vertical ? "Close equalizer" : "Collapse settings"; offLabel: root.vertical ? "Open equalizer" : "Expand settings"
    Row {   // .eqv: upright sliders
      visible: root.vertical
      width: parent.width; height: 290; spacing: (width - 11 * 40) / 10; topPadding: 10
      Repeater {
        model: 11
        VSlider { required property int index; width: 40
                  label: index === 0 ? "Preamp" : FX.BAND_LABELS[index - 1]; min: index === 0 ? -8 : -20; max: 20
                  value: (Settings.values.eq || [])[index] || 0; onMoved: v => root.band(index, v) }
      }
    }
    Repeater {
      model: root.vertical ? 0 : 11
      Slider { required property int index; box: true; label: index === 0 ? "Preamp" : FX.BAND_LABELS[index - 1]; min: index === 0 ? -8 : -20; max: 20; step: 0.1
               controlled: true; value: (Settings.values.eq || [])[index] || 0; fmt: v => FX.f1(v) + " dB"; onMoved: v => root.band(index, v) }
    }
  }
  SettingRow { shown: root.fx; label: "Compressor"; info: root.vertical ? "Evens out quiet and loud passages." : ""; Toggle { path: "compOn" } }
  Collapse {
    shown: root.fx
    Repeater { model: FX.COMP
      Slider { required property var modelData; label: modelData[1]; min: modelData[2]; max: modelData[3]; step: modelData[4]; path: "comp." + modelData[0]; fmt: v => FX.f1(v) + modelData[5] } }
  }
  SettingRow { shown: root.fx; label: root.vertical ? "Spatial audio" : "Spatial audio (reverb)"; info: root.vertical ? "Adds reverb, as if you are in a room." : ""; Toggle { path: "reverbOn" } }
  Collapse {
    shown: root.fx
    Repeater { model: FX.REVERB
      Slider { required property var modelData; label: modelData[1]; min: 0; max: 10; step: 0.1; ticks: 10; path: "reverb." + modelData[0]; fmt: FX.f1 } }
  }
  SettingRow { shown: root.fx; label: "Stereo widening"; Toggle { path: "widenOn" } }
  Collapse {
    shown: root.fx
    Repeater { model: FX.WIDEN
      Slider { required property var modelData; label: modelData[1]; min: modelData[2]; max: modelData[3]; step: modelData[4]; ticks: modelData[5] === 100 ? 8 : 0
               path: "widen." + modelData[0]; fmt: v => FX.f1(v * modelData[5]) + modelData[6] } }
  }
}
