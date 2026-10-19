// Subtitles and lyrics of what plays (v2.x app.js "subtitles" and "lyrics (.lrc)"): the tracks (inside the file,
// next to it, added by hand or downloaded), the chosen one, its cues at the current moment, the delay (G / H), and
// synced lyrics for music, shown full-screen in the player (Settings → Subtitles → lyrics view) or as subtitles.
import QtQuick
import VLCR

QtObject {
  id: sb
  property var ctl: null
  property Subs subs: null
  readonly property var player: ctl ? ctl.player : null
  readonly property var it: ctl ? ctl.current : null
  readonly property var bitmapRe: /pgs|dvd_sub|dvb_sub|xsub/

  property var tracks: []           // [{ label, lang, src, idx (stream), bitmap, k, cues }]
  property int active: -1
  property real delay: 0            // seconds; positive: subtitles later
  property real speed: 1            // for subtitles made for another frame rate
  property real dur: 0              // extra seconds each cue stays
  property int req: 0
  property var waiting: ({})        // req → track index

  // lyrics (.lrc)
  property var lyrics: null         // [{ t, text }]
  property bool synced: false
  property bool lyricsHidden: false
  property var hoverLines: null     // synced lines for the timeline preview (#41), whatever view shows them
  readonly property bool lyricsOn: !!lyrics && !lyricsHidden && Settings.values.lyricsView !== false && !!it && it.type === "audio"
  readonly property bool canLyrics: !!lyrics && Settings.values.lyricsView !== false && !!it && it.type === "audio"

  function osd(t) { ctl.osd(t); }
  function baseName(s) { return s.split(/[\\/]/).pop(); }
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function parseTime(s) { const p = s.trim().replace(",", ".").split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
  // WebVTT → cues { s, e, h } with h as styled text (italic, bold and underline kept; ASS overrides dropped)
  function parseVTT(text) {
    const cues = [];
    for (const block of text.replace(/\r/g, "").split(/\n\n+/)) {
      const lines = block.split("\n"), i = lines.findIndex(l => l.indexOf("-->") >= 0); if (i < 0) continue;
      const ab = lines[i].split("-->"), body = lines.slice(i + 1).join("\n").trim(); if (!body) continue;
      const h = esc(body.replace(/\{\\[^}]*\}/g, "")).replace(/&lt;(\/?)(i|b|u)&gt;/g, "<$1$2>").replace(/&lt;[^&]*&gt;/g, "");
      cues.push({ s: parseTime(ab[0]), e: parseTime(ab[1].trim().split(/\s/)[0]), h: h });
    }
    return cues;
  }
  // "[mm:ss.xx] text" lines; a line may carry several time tags; [offset:±ms] shifts everything; <mm:ss.xx> word tags are dropped
  function parseLRC(text) {
    let offset = 0; const timed = [], plain = [];
    for (const raw of text.replace(/\r/g, "").split("\n")) {
      const off = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw); if (off) { offset = +off[1] / 1000; continue; }
      const tags = [], re = /\[(\d+):(\d+(?:[.:]\d+)?)\]/g;
      for (let m; (m = re.exec(raw));) tags.push(m);
      const body = raw.replace(/\[[^\]]*\]/g, "").replace(/<\d+:\d+(?:[.:]\d+)?>/g, "").trim();
      if (tags.length) tags.forEach(m => timed.push({ t: Math.max(0, +m[1] * 60 + parseFloat(m[2].replace(":", ".")) - offset), text: body }));
      else if (body) plain.push({ t: null, text: body });
    }
    timed.sort((a, b) => a.t - b.t);
    return timed.length ? { synced: true, lines: timed } : { synced: false, lines: plain };
  }

  function clear() { tracks = []; active = -1; delay = 0; speed = 1; dur = 0; lyrics = null; hoverLines = null; synced = false; lyricsHidden = false; waiting = ({}); player.setSpu(-1); player.setSpuDelay(0); }
  // a new file: its own tracks, then files next to it (and .lrc lyrics), then the preferred language (Settings → Subtitles)
  function setup(i) {
    clear();
    const info = ctl.library.item(i.src);
    const list = ((info && info.subs) || []).map((s, k) => ({ label: s.label, lang: s.lang, src: i.src, idx: s.i, bitmap: bitmapRe.test(s.codec), k: k }));
    tracks = list;
    if (!i.remote && (Settings.values.subAuto !== false || Settings.values.lrcAuto !== false)) {
      const all = subs.siblings(i.src);
      const lrc = all.filter(f => /\.lrc$/i.test(f)), sib = Settings.values.subAuto !== false ? all.filter(f => !/\.lrc$/i.test(f)) : [];
      if (lrc.length && Settings.values.lrcAuto !== false && useLyricsFile(lrc[0]) && i.type === "audio") return;
      if (sib.length) { tracks = tracks.concat(sib.map(f => ({ label: baseName(f), src: f, idx: null }))); return select(tracks.length - sib.length); }
    }
    const prefs = subs.langCodes(Settings.values.subLang || "").map(c => c.slice(0, 2));
    if (prefs.length) { const k = tracks.findIndex(t => !t.bitmap && t.lang && prefs.some(p => t.lang.toLowerCase().startsWith(p))); if (k >= 0) select(k); }
  }
  // the probe arrives after a file was opened: add its tracks then
  function refreshTracks(info) {
    if (!it || !info || tracks.some(t => t.src === it.src && t.idx !== null)) return;
    const list = (info.subs || []).map((s, k) => ({ label: s.label, lang: s.lang, src: it.src, idx: s.i, bitmap: bitmapRe.test(s.codec), k: k }));
    if (list.length) tracks = list.concat(tracks), active = active >= 0 ? active + list.length : -1;
  }
  function addFile(file, choose) {
    if (/\.lrc$/i.test(file)) { if (!useLyricsFile(file)) osd(qsTr("No lyrics found")); return; }
    tracks = tracks.concat([{ label: baseName(file), src: file, idx: null }]);
    if (choose) select(tracks.length - 1);
  }
  function select(i) {
    player.setSpu(-1);
    if (i < 0 || !tracks[i]) { active = -1; osd(qsTr("Subtitles off")); return; }
    active = i;
    const tr = tracks[i];
    if (tr.bitmap) {   // image subtitles: drawn by libVLC (k = the file's k-th subtitle track)
      const ids = player.spuTracks();
      if (ids[tr.k]) { player.setSpu(ids[tr.k].id); player.setSpuDelay(delay); return osd(qsTr("Subtitles: %1").arg(tr.label)); }
      active = -1; return osd(qsTr("Image-based subtitles are not supported"));
    }
    if (!tr.cues) {
      osd(qsTr("Loading subtitles…"));
      const r = ++req, w = Object.assign({}, waiting); w[r] = i; waiting = w;
      subs.load(r, tr.src, tr.idx === null || tr.idx === undefined ? -1 : tr.idx);
      return;
    }
    osd(tr.cues.length ? qsTr("Subtitles: %1").arg(tr.label) : qsTr("No subtitles found"));
  }
  property Connections loads: Connections {
    target: sb.subs
    function onLoaded(r, text) {
      const i = sb.waiting[r]; if (i === undefined) return;
      const tr = sb.tracks[i]; if (!tr) return;
      const list = sb.tracks.slice(); list[i] = Object.assign({}, tr, { cues: text ? sb.parseVTT(text) : [] }); sb.tracks = list;
      if (sb.active === i) sb.osd(list[i].cues.length ? qsTr("Subtitles: %1").arg(tr.label) : qsTr("No subtitles found"));
    }
  }
  function cycle() { if (!tracks.length) return osd(qsTr("No subtitles")); select(active + 1 >= tracks.length ? -1 : active + 1); }
  function nudge(d) { delay = +(delay + d).toFixed(2); player.setSpuDelay(delay); osd(qsTr("Subtitle delay %1 s").arg(delay.toFixed(1))); }

  // Music with a .lrc file gets the lyrics view that follows the song; videos (or with the view off) show the lines
  // as ordinary subtitles.
  function useLyricsFile(file) {
    const txt = subs.readLyrics(file); if (!txt || !it) return false;
    const lrc = parseLRC(txt); if (!lrc.lines.some(l => l.text)) return false;
    if (lrc.synced) hoverLines = lrc.lines;
    if (it.type === "audio" && Settings.values.lyricsView !== false) { lyrics = lrc.lines; synced = lrc.synced; lyricsHidden = false; return true; }
    const cues = lrc.lines.map((l, i, a) => ({ s: l.t || 0, e: a[i + 1] ? a[i + 1].t : (l.t || 0) + 5, h: esc(l.text) })).filter(c => c.h);
    tracks = tracks.concat([{ label: baseName(file), src: file, idx: null, cues: cues }]);
    select(tracks.length - 1);
    return true;
  }
  function toggleLyrics() { if (!lyrics) return osd(qsTr("No lyrics")); lyricsHidden = !lyricsHidden; }
  // the lyric line sung at a moment (synced .lrc), for the timeline preview of music (#41); "♪" between lines
  function lineAt(lines, at) {
    let i = -1;
    for (let lo = 0, hi = lines.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (lines[m].t <= at + 0.05) { i = m; lo = m + 1; } else hi = m - 1; }
    return i;
  }
  function lyricAt(at) { if (!hoverLines) return ""; const i = lineAt(hoverLines, at); return i < 0 ? "" : (hoverLines[i].text || "♪"); }

  // what to show now
  readonly property var cues: active >= 0 && tracks[active] && tracks[active].cues ? tracks[active].cues : null
  readonly property string now: {
    if (!cues || !player) return "";
    const t = player.time / 1000 - delay, sp = speed || 1;
    return cues.filter(c => t >= c.s / sp && t <= c.e / sp + dur).map(c => c.h).join("\n");
  }
  readonly property int lyricIndex: lyricsOn && synced && player ? lineAt(lyrics, player.time / 1000) : -1
}
