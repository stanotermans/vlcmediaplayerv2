// The settings that go to libVLC (v2.x vlcplayer.js _applyEq / _applyFx and app.js recording, DVD menus):
// the equalizer (VLC's own 10 bands; the app's presets are VLC's), compressor, spatial audio and stereo widening
// (VLC's audio filters with the same settings; reverb's 0–10 sliders are VLC's 0–1), surround, audio delay, fast
// seek, passthrough, the MIDI SoundFont, recording and the DVD menus.
import QtQuick
import VLCR

QtObject {
  id: en
  property var ctl: null
  readonly property VlcPlayer player: ctl ? ctl.player : null

  function applyEq() { player.setEqualizer(Settings.values.eqOn && Store.pro ? Settings.values.eq : null); }   // (#53: Pro)
  function applyFx() {
    const f = [], o = [], c = Settings.values.comp || {}, r = Settings.values.reverb || {}, w = Settings.values.widen || {};
    if (!Store.pro) return player.setAudioFx("", o);   // (#53: Pro)
    if (Settings.values.compOn) { f.push("compressor"); o.push(["compressor-threshold", "f", c.threshold], ["compressor-ratio", "f", c.ratio], ["compressor-knee", "f", c.knee],
                                   ["compressor-attack", "f", c.attack], ["compressor-release", "f", c.release], ["compressor-makeup-gain", "f", c.makeup]); }
    if (Settings.values.reverbOn) { f.push("spatializer"); o.push(["spatializer-roomsize", "f", r.size / 10], ["spatializer-width", "f", r.width / 10], ["spatializer-wet", "f", r.wet / 10],
                                     ["spatializer-dry", "f", r.dry / 10], ["spatializer-damp", "f", r.damp / 10]); }
    if (Settings.values.widenOn) { f.push("stereo_widen"); o.push(["stereowiden-delay", "f", w.delay], ["stereowiden-feedback", "f", w.feedback], ["stereowiden-crossfeed", "f", w.crossfeed], ["stereowiden-dry-mix", "f", w.dry]); }
    player.setAudioFx(f.join(":"), o);
  }
  function applyAll() {
    applyEq(); applyFx();
    player.setStereo(Settings.values.surround === false);
    player.setAudioDelay(Settings.values.audioDelay || 0);
    player.setFastSeek(!!Settings.values.fastSeek);
  }
  property Connections settings: Connections {
    target: Settings
    function onChanged(p) {
      if (p.startsWith("eq")) en.applyEq();
      else if (/^(comp|reverb|widen)/.test(p)) en.applyFx();
      else if (p === "surround") en.player.setStereo(Settings.values.surround === false);
      else if (p === "audioDelay") en.player.setAudioDelay(Settings.values.audioDelay || 0);
      else if (p === "fastSeek") en.player.setFastSeek(!!Settings.values.fastSeek);
    }
  }
  property Connections store: Connections { target: Store; function onChanged() { en.applyEq(); en.applyFx(); } }
  property Connections started: Connections { target: en.player; function onVersionChanged() { en.applyAll(); } }
  // passthrough (Settings → Audio): Dolby/DTS go to the receiver as they are; a libVLC start option
  // (Windows: WASAPI incl. the HD formats; elsewhere VLC's S/PDIF option)
  readonly property var startArgs: Settings.values.passthrough ? [Qt.platform.os === "windows" ? "--mmdevice-passthrough=2" : "--spdif"] : []

  // MIDI: libVLC's FluidSynth plays it with the chosen SoundFont, or the built-in FluidR3 Mono
  readonly property var midiRe: /\.(mid|midi|kar|rmi|smf)$/i
  // "Play another media synchronously" (Open network stream → Show more options): its audio plays with the stream
  property var extra: ({})
  // #66 (v2.x's "Always play with Classic (FFmpeg)"): file types that VLC reads and decodes with FFmpeg
  function ext(src) { const m = /\.([a-z0-9]{1,5})$/i.exec(String(src).split(/[?#]/)[0]); return m ? m[1].toLowerCase() : ""; }
  function ffmpegTypes() { return String(Settings.values.classicTypes || "").toLowerCase().split(/[\s,;.]+/).filter(x => x); }
  function byFfmpeg(src) { const e = ext(src); return !!e && ffmpegTypes().indexOf(e) >= 0; }
  function setByFfmpeg(e, on) { const l = ffmpegTypes().filter(x => x !== e); if (on) l.push(e); Settings.set("classicTypes", l.join(", ")); }
  function options(src) {
    const o = midiRe.test(src) ? [":soundfont=" + (Settings.values.soundfont || ctl.library.builtinSoundfont())] : [];
    if (byFfmpeg(src)) o.push(":vlcr-ffmpeg=" + ((ctl.library.item(src) || {}).duration || 0));   // #66: converted by FFmpeg
    const x = extra[src];
    if (x) o.push(":input-slave=" + (/^[a-z][a-z0-9+.-]*:\/\//i.test(x) ? x : "file:///" + x.replace(/\\/g, "/").replace(/^\/+/, "")));
    return o;
  }

  // ---------- recording (R): like VLC's Record button, the file's own streams saved unchanged from the next keyframe ----------
  property real recStart: 0
  function toggleRecord() {
    if (player.recording) return stopRecord();
    if (!Store.pro) return ctl.pro("extras");
    if (!ctl.current) return ctl.osd(qsTr("Play something first"));
    const dir = Settings.values.recDir || ctl.library.recordingsDir();
    ctl.library.makeDir(dir);
    if (!player.record(true, dir)) return ctl.osd(qsTr("Recording not possible"));
    recStart = Date.now(); ctl.osd(qsTr("Recording started"));
    if (!player.playing) player.play();
  }
  function stopRecord() {
    if (!player.recording) return;
    player.record(false);
    ctl.osd(qsTr("Recording saved to %1").arg(Settings.values.recDir || ctl.library.recordingsDir()));
  }

  // ---------- DVD menus: in a menu the arrow keys, Enter and clicks work its buttons ----------
  readonly property bool dvdMenu: {
    if (!player || !player.isDvd || player.title < 0) return false;
    const t = player.titles()[player.title];
    return player.title === 0 || !!(t && (t.menu || t.interactive));
  }
  function showDvdMenu() { if (!player.isDvd) return ctl.osd(qsTr("No DVD is playing")); player.dvdMenu(); ctl.osd(qsTr("DVD menu")); }
  function dvdKey(name) {
    const m = { Enter: 0, ArrowUp: 1, ArrowDown: 2, ArrowLeft: 3, ArrowRight: 4 }[name];
    if (!dvdMenu || m === undefined) return false;
    player.navigate(m); return true;
  }
  // a point on the video item → the picture's pixels
  function dvdMouse(item, x, y, click) {
    if (!dvdMenu || !player.frameSize.width) return false;
    return player.dvdMouse(Math.round(x / item.width * player.frameSize.width), Math.round(y / item.height * player.frameSize.height), click) > 0;
  }
}
