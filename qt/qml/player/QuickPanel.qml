// #settings: the quick settings in the player (v2.x panels.js quickPanel): Playback, Video, Audio and Subtitles tabs,
// a preset per tab at the bottom and "Open advanced settings".
import QtQuick
import QtQuick.Controls.Basic as C
import VLCR
import "../pages/Effects.js" as FX

Rectangle {
  id: root
  property var ctl: null
  property string tab: "playback"
  property bool open: false
  readonly property var sb: ctl.sb
  function toggle(t) { if (open && (!t || t === tab)) { open = false; return; } open = true; if (t) tab = t; }
  visible: open
  width: Math.min(400, ctl.width - 24)
  radius: 10; color: Theme.panel; border.width: 1; border.color: Theme.line
  clip: true
  // keep clicks inside the panel from reaching the player
  MouseArea { anchors.fill: parent; acceptedButtons: Qt.AllButtons; onWheel: w => w.accepted = true }

  readonly property var vpresets: ({ "": ["Default", {}],
    vivid: ["Vivid", { brightness: 105, contrast: 115, saturate: 160, gamma: 1, sepia: 0, gray: false }],
    cinema: ["Cinema", { brightness: 95, contrast: 120, saturate: 85, gamma: 1.1, sepia: 0, gray: false }],
    bw: ["Black & white", { brightness: 100, contrast: 115, saturate: 0, gray: true, sepia: 0 }],
    warm: ["Warm", { brightness: 103, contrast: 105, saturate: 115, hue: -10, sepia: 15, gray: false }],
    vintage: ["Vintage", { brightness: 98, contrast: 90, saturate: 70, sepia: 45, grain: 4, gray: false }] })
  property string vpreset: ""
  property string spreset: ""
  function videoPreset(k) {
    vpreset = k;
    const base = JSON.parse(JSON.stringify(Settings.defaultValue("vf"))), cur = Settings.values.vf || {};
    Settings.set("vf", Object.assign(base, vpresets[k][1], { crop: cur.crop, rotate: cur.rotate, zoom: cur.zoom, mirror: cur.mirror }));
  }
  function subPreset(k) {
    spreset = k;
    const P = { "": ["Segoe UI", 100, "#ffffff", "#0c0c0c", 60], big: ["Segoe UI", 150, "#ffe14d", "#000000", 0], cinema: ["Georgia", 115, "#f0f0f0", "#000000", 0], clean: ["Arial", 100, "#ffffff", "#000000", 0] }[k];
    if (P) ["subFont", "subSize", "subColor", "subOutline", "subBg"].forEach((key, i) => Settings.set(key, P[i]));
  }

  Rectangle {   // .qtabs
    id: tabs
    width: parent.width; height: 44; color: Theme.bg2; radius: 10
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 10; color: Theme.bg2 }
    Row {
      x: 6; width: parent.width - 12; height: parent.height
      Repeater {
        model: [["playback", "Playback", "playback"], ["video", "Video", "video"], ["audio", "Audio", "audio"], ["subs", "Subtitles", "subtitle"]]
        Item {
          required property var modelData
          readonly property bool on: root.tab === modelData[0]
          width: parent.width / 4; height: parent.height
          Row { anchors.centerIn: parent; spacing: 7
            Icon { width: 17; height: 17; name: modelData[2]; color: parent.parent.on ? Theme.accent : Theme.muted; anchors.verticalCenter: parent.verticalCenter }
            T { text: qsTr(modelData[1]); color: parent.parent.on ? Theme.text : Theme.muted; anchors.verticalCenter: parent.verticalCenter } }
          Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 2; color: parent.on ? Theme.accent : "transparent" }
          MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { root.tab = modelData[0]; body.contentY = 0; } }
        }
      }
    }
  }
  Flickable {   // .qbody
    id: body
    anchors { left: parent.left; right: parent.right; top: tabs.bottom; bottom: foot.top; leftMargin: 18; rightMargin: 2 }
    contentHeight: content.implicitHeight + 10
    clip: true; boundsBehavior: Flickable.StopAtBounds
    C.ScrollBar.vertical: ScrollBar {}
    Loader {
      id: content
      width: body.width - 26   // v2.x's .qbody: 18px padding, then the scrollbar at the edge (the Loader sizes the page)
      sourceComponent: root.tab === "playback" ? playbackC : root.tab === "video" ? videoC : root.tab === "audio" ? audioC : subsC
    }
  }
  Component {
    id: playbackC
    Column {
      width: body.width - 10
      Section { title: "Defaults"; last: true
        Slider { label: "Speed"; box: true; min: 0.25; max: 4; step: 0.05; controlled: true; value: root.ctl.pb.speed; fmt: v => v.toFixed(2) + "×"; onMoved: v => Settings.set("speed", v) }
        SettingRow { label: "Repeat"; Select { width: 160; path: "repeat"; options: [["off", "Off"], ["one", "Current"], ["all", "All"]] } }
        SettingRow { label: "Shuffle"; Toggle { path: "shuffle" } }
        SettingRow { label: "Autoplay next item"; Toggle { path: "autoNext" } }
        SettingRow { label: "Skip interval"; Select { width: 160; path: "jump"; options: [[5, "5 s"], [10, "10 s"], [30, "30 s"], [60, "1 min"]] } }
        SettingRow { label: "Resume where you left off"; Select { width: 160; path: "resumeMode"; options: [["always", "Always"], ["ask", "Ask"], ["never", "Never"]] } }
      }
    }
  }
  Component {
    id: videoC
    Column {
      width: body.width - 10
      Section { title: "Picture"
        SettingRow { label: "Aspect ratio"; Select { width: 160; path: "aspect"; options: [["", "Default"], ["fill", "Fill (crop)"], ["stretch", "Stretch"]] } }
        SettingRow { label: "Rotate"; Select { width: 160; path: "vf.rotate"; options: [[0, "0°"], [90, "90°"], [180, "180°"], [270, "270°"]] } }
        SettingRow { label: "Zoom"; Select { width: 160; path: "vf.zoom"; options: [[1, "1×"], [1.25, "1.25×"], [1.5, "1.5×"], [2, "2×"]] } }
        SettingRow { label: "Mirror"; Toggle { path: "vf.mirror" } }
        SettingRow { label: "Crop" }
        Grid {   // .cropgrid: two fields and a link button per row; a linked pair gets the same value
          id: cropGrid
          property var linked: ({ v: false, h: false })
          columns: 3; spacing: 8; width: parent.width; bottomPadding: 8
          Repeater {
            model: [["Top", "t", "b", "v"], ["Bottom", "b", "t", "v"], ["link", "v"], ["Left", "l", "r", "h"], ["Right", "r", "l", "h"], ["link", "h"]]
            Item {
              id: cell
              required property var modelData
              readonly property bool isLink: modelData[0] === "link"
              width: isLink ? 30 : (cropGrid.width - 30 - 16) / 2; height: 38
              IconButton { visible: cell.isLink; anchors.centerIn: parent; name: "link"; tip: qsTr("Link"); on: cell.isLink && cropGrid.linked[cell.modelData[1]]
                           onClicked: { const l = Object.assign({}, cropGrid.linked); l[cell.modelData[1]] = !l[cell.modelData[1]]; cropGrid.linked = l; } }
              Rectangle {   // .cropf
                visible: !cell.isLink
                anchors.fill: parent; radius: 8; color: Theme.track
                T { x: 12; anchors.verticalCenter: parent.verticalCenter; text: qsTr(cell.modelData[0]); color: Theme.muted }
                TextInput { anchors { right: unit.left; rightMargin: 6; verticalCenter: parent.verticalCenter } width: 50; horizontalAlignment: TextInput.AlignRight
                            font.family: Theme.font; font.pixelSize: 13; color: Theme.text; validator: IntValidator { bottom: 0; top: 2000 }
                            text: String((Settings.values.vf && Settings.values.vf.crop && Settings.values.vf.crop[cell.modelData[1]]) || 0)
                            onEditingFinished: { const v = Math.max(0, +text || 0); Settings.set("vf.crop." + cell.modelData[1], v)
                                                 if (cropGrid.linked[cell.modelData[3]]) Settings.set("vf.crop." + cell.modelData[2], v); } }
                T { id: unit; anchors { right: parent.right; rightMargin: 12; verticalCenter: parent.verticalCenter } text: "px"; color: Theme.dim }
              }
            }
          }
        }
      }
      Section { title: "Filters"; last: true
        ProLock { ctl: root.ctl; what: "video" }
        Column { visible: Store.pro; width: parent.width
        Slider { label: "Brightness"; min: 0; max: 200; path: "vf.brightness"; fmt: v => v + "%" }
        Slider { label: "Contrast"; min: 0; max: 200; path: "vf.contrast"; fmt: v => v + "%" }
        Slider { label: "Saturation"; min: 0; max: 300; path: "vf.saturate"; fmt: v => v + "%"; ticks: 2 }
        Collapse {
          Slider { label: "Hue"; min: -180; max: 180; path: "vf.hue"; fmt: v => v + "°"; center: true }
          Slider { label: "Gamma"; min: 0.1; max: 3; step: 0.01; path: "vf.gamma"; fmt: v => v.toFixed(2); ticks: 9 }
          Slider { label: "Sharpen"; min: 0; max: 2; step: 0.05; path: "vf.sharpen"; fmt: v => v.toFixed(2); ticks: 4 }
          Slider { label: "Film grain"; min: 0; max: 10; step: 0.5; path: "vf.grain"; fmt: v => v.toFixed(1); ticks: 10 }
        }
        Item { width: 1; height: 8 }
        Collapse { offLabel: "Color effects"; onLabel: "Collapse color effects"
          SettingRow { label: "Negative"; Toggle { path: "vf.negate" } }
          SettingRow { label: "Posterize"; Toggle { path: "vf.posterize" } }
          SettingRow { label: "Grayscale"; Toggle { path: "vf.gray" } }
          Slider { label: "Sepia intensity"; min: 0; max: 100; path: "vf.sepia"; fmt: v => v + "%"; ticks: 2 }
        }
        }
      }
    }
  }
  Component {
    id: audioC
    Column {
      width: body.width - 10
      Section { title: "Defaults"
        SettingRow { label: "Audio track"
                     Select { width: 160; options: { root.ctl.player.time; const t = root.ctl.player.audioTracks().filter(x => x.id >= 0); const a = (root.ctl.pb.info || {}).audio || [];
                                       // named like v2.x from FFmpeg's look at the file: "Track 1 (aac, 2ch)"
                                       return t.length ? t.map((x, i) => [x.id, a[i] ? a[i].label + " (" + a[i].codec + (a[i].ch ? ", " + a[i].ch + "ch" : "") + ")" : x.name]) : [[-2, "Default"]]; }
                              value: { root.ctl.player.time; return root.ctl.player.audioTrack(); } onPicked: v => { if (v >= 0) root.ctl.player.setAudioTrack(v); } } }
        Slider { label: "Volume boost"; min: 0; max: 200; path: "gain"; fmt: v => v + "%"; ticks: 2 }
        Slider { label: "Audio delay"; min: -1000; max: 1000; step: 10; path: "audioDelay"; fmt: v => (v > 0 ? "+" : "") + v + " ms"; center: true; ticks: 2 }
      }
      Section { title: "Equalizer"
        ProLock { ctl: root.ctl; what: "eq" }
        EffectRows { visible: Store.pro; vertical: false; part: "eq" }
      }
      Section { title: "Effects"; last: true
        ProLock { ctl: root.ctl; what: "eq" }
        EffectRows { visible: Store.pro; vertical: false; part: "fx" }
      }
    }
  }
  Component {
    id: subsC
    Column {
      width: body.width - 10
      Section { title: "Defaults"
        SettingRow { label: "Subtitle track"
                     Select { width: 160; options: [[-1, "Off"]].concat(root.sb.tracks.map((t, i) => [i, t.label])); value: root.sb.active; onPicked: v => root.sb.select(v) } }
        SettingRow { label: "Preferred language"; TextField { width: 160; path: "subLang"; placeholder: "e.g. en, nl" } }
        SettingRow { label: "Load file"; Button { text: ".srt / .ass / .vtt…"; onClicked: root.ctl.addSubtitleFile() } }
        SettingRow { label: "Search online"; Button { text: "OpenSubtitles…"; onClicked: { root.open = false; root.ctl.searchSubtitles(); } } }
      }
      Section { title: "Synchronization"
        Slider { label: "Subtitle delay"; box: true; min: -10; max: 10; step: 0.05; center: true; controlled: true; value: root.sb.delay; fmt: v => v.toFixed(3) + " s"
                 onMoved: v => { root.sb.delay = v; root.ctl.player.setSpuDelay(v); } }
        Item { width: parent.width; height: 14   // .scale
          T { text: "−10 s"; px: 11; color: Theme.muted } T { anchors.horizontalCenter: parent.horizontalCenter; text: "0 s"; px: 11; color: Theme.muted }
          T { anchors.right: parent.right; text: "+10 s"; px: 11; color: Theme.muted } }
        Slider { label: "Subtitle speed"; box: true; min: 0.5; max: 2; step: 0.001; controlled: true; value: root.sb.speed; fmt: v => v.toFixed(3); onMoved: v => root.sb.speed = v }
        Slider { label: "Duration factor"; box: true; min: 0; max: 5; step: 0.05; controlled: true; value: root.sb.dur; fmt: v => v.toFixed(3) + " s"; onMoved: v => root.sb.dur = v }
      }
      Section { title: "Appearance"; last: true
        SettingRow { label: "Font"; FontSelect { width: 160; ctl: root.ctl } }
        Slider { label: "Size"; min: 50; max: 250; path: "subSize"; fmt: v => v + "%" }
        SettingRow { label: "Text color"; ColorField { path: "subColor" } }
        SettingRow { label: "Outline color"; ColorField { path: "subOutline" } }
        Slider { label: "Background"; min: 0; max: 100; path: "subBg"; fmt: v => v + "%" }
      }
    }
  }

  Rectangle {   // .qfoot: the tab's preset and "Open advanced settings"
    id: foot
    anchors.bottom: parent.bottom
    width: parent.width; height: col.implicitHeight + 18; color: Theme.bg2; radius: 10
    Rectangle { width: parent.width; height: 10; color: Theme.bg2 }
    Column {
      id: col
      x: 16; y: 10; width: parent.width - 32
      SettingRow {
        visible: root.tab !== "playback" && (Store.pro || root.tab === "subs")   // (#53: the video and audio presets are Pro)
        label: "Preset"
        Loader { sourceComponent: root.tab === "video" ? vpC : root.tab === "audio" ? apC : spC }
        Component { id: vpC; Select { width: 160; options: Object.keys(root.vpresets).map(k => [k, root.vpresets[k][0]]); value: root.vpreset; onPicked: v => root.videoPreset(v) } }
        Component { id: apC; Select { width: 160; options: FX.presetOptions(); value: Settings.values.eqPreset || "flat"
                                     onPicked: v => { if (v === "custom") return Settings.set("eqPreset", "custom"); const p = FX.EQ_PRESETS[v]; Settings.set("eqPreset", v); Settings.set("eq", p.slice(1)); Settings.set("eqOn", true); } } }
        Component { id: spC; Select { width: 160; options: [["", "Default"], ["big", "Large and yellow"], ["cinema", "Cinema"], ["clean", "No background"]]; value: root.spreset; onPicked: v => root.subPreset(v) } }
      }
      Rectangle {   // .qadv
        width: parent.width; height: 36; radius: Theme.radius; color: "transparent"
        Row { anchors.centerIn: parent; spacing: 8
          Icon { name: "settings"; color: adv.containsMouse ? Theme.text : Theme.muted; anchors.verticalCenter: parent.verticalCenter }
          T { text: qsTr("Open advanced settings"); color: adv.containsMouse ? Theme.text : Theme.muted; anchors.verticalCenter: parent.verticalCenter } }
        MouseArea { id: adv; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor
                    onClicked: { root.open = false; root.ctl.openSettings(root.tab === "subs" ? "subtitles" : root.tab); } }
      }
    }
  }
}
