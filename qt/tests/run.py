# The Vela Player (formerly VLC Redesign) test suite: the v2.x tests (tests/*.mjs, issues #16 #36 #37 #40 #41 #42 #43 #44 #46 #47 #50 #51,
# recording, snapshots, migration) as scenarios for the Qt app. Each scenario starts the app with a fresh profile,
# runs test steps (VLCR_OPEN, see Main.qml testStep) that write "name=value" lines with log:<expression> to
# VLCR_LOG, quits after a screenshot (VLCR_SHOT) and checks those values and the files the app made.
#   python qt/tests/run.py <app> <test media (make-media.sh)> [--vlc <libVLC folder>] [--ffmpeg <ffmpeg>]
#                          [--soundfont <sf2/sf3>] [--out <folder>] [name …]
# The app's own libVLC, FFmpeg and SoundFont are used when it is a packaged app; for a development build pass them.
import argparse, functools, http.server, json, os, shutil, socketserver, subprocess, sys, tempfile, threading, time

ap = argparse.ArgumentParser()
ap.add_argument('app'); ap.add_argument('media')
ap.add_argument('--vlc'); ap.add_argument('--ffmpeg'); ap.add_argument('--soundfont'); ap.add_argument('--out')
ap.add_argument('only', nargs='*')
A = ap.parse_args()
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
MEDIA = os.path.abspath(os.path.join(A.media, 'media'))
OUT = os.path.abspath(A.out or tempfile.mkdtemp(prefix='vlcr-tests-'))
os.makedirs(OUT, exist_ok=True)

# the HLS stream (and anything else in <media>/web) over HTTP
class Quiet(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'   # like real servers (libVLC's HLS stalls on Python's default HTTP/1.0)
    def log_message(self, *a): pass
class Server(socketserver.ThreadingTCPServer):
    daemon_threads = True
    def handle_error(self, *a): pass   # players drop connections when they have enough
httpd = Server(('127.0.0.1', 0), functools.partial(Quiet, directory=os.path.join(A.media, 'web')))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
WEB = 'http://127.0.0.1:%d' % httpd.server_address[1]

def js(s): return json.dumps(s)   # a string inside a step, e.g. a path for set:recDir=…

def run(name, steps, extra_env=None, profile=None):
    """Starts the app, returns the logged values ({ name: [values] }) and the profile folder."""
    prof = profile or os.path.join(OUT, name, 'profile')
    if not profile: shutil.rmtree(prof, ignore_errors=True)   # every test starts from a fresh profile
    os.makedirs(prof, exist_ok=True)
    log = os.path.join(OUT, name, 'log.txt')
    if os.path.exists(log): os.remove(log)
    ms = 1500 + sum(int(s[5:]) if s.startswith('wait:') else 60 if s.startswith('set:') else 500 for s in steps)
    env = dict(os.environ, VLCR_USER_DATA=prof, VLCR_FOLDER=MEDIA, VLCR_NO_IMPORT='1', VLCR_LOG=log,
               VLCR_OPEN=';'.join(['set:language="en"', 'set:volume=0'] + steps),   # (volume 0: the test tones are no fun to hear)
               VLCR_SHOT=os.path.join(OUT, name, 'shot.png'), VLCR_SHOT_MS=str(ms))
    for k, v in (('VLCR_VLC', A.vlc), ('VLCR_FFMPEG', A.ffmpeg), ('VLCR_SOUNDFONT', A.soundfont)):
        if v: env[k] = os.path.abspath(v)
    env.pop('VLCR_PLAY', None)
    env.update(extra_env or {})
    for k in [k for k, v in env.items() if v is None]: env.pop(k)   # (None: leave that variable out)
    cmd = [A.app] if not A.app.endswith('.app') else [os.path.join(A.app, 'Contents', 'MacOS', os.path.basename(A.app)[:-4])]
    p = subprocess.run(cmd, env=env, timeout=ms / 1000 + 60, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    with open(os.path.join(OUT, name, 'output.txt'), 'wb') as f: f.write(p.stdout)
    vals = {}
    if os.path.exists(log):
        for line in open(log, encoding='utf-8'):
            k, _, v = line.rstrip('\n').partition('=')
            vals.setdefault(k, []).append(v)
    return vals, prof

# ---------- the scenarios ----------
TESTS = []
def test(fn): TESTS.append(fn); return fn

class Check:
    def __init__(self, name, vals): self.name, self.vals, self.fails = name, vals, []
    def get(self, k, i=-1):
        v = self.vals.get(k)
        return v[i] if v else None
    def ok(self, cond, what):
        if not cond: self.fails.append(what)
    def eq(self, k, want, i=-1): v = self.get(k, i); self.ok(v == str(want), f'{k} = {v!r}, want {want!r}')
    def near(self, k, want, tol, i=-1):
        v = self.get(k, i)
        try: good = abs(float(v) - want) <= tol
        except (TypeError, ValueError): good = False
        self.ok(good, f'{k} = {v!r}, want {want} ± {tol}')
    def more(self, k, low, i=-1):
        v = self.get(k, i)
        try: good = float(v) > low
        except (TypeError, ValueError): good = False
        self.ok(good, f'{k} = {v!r}, want more than {low}')
    def has(self, k, part, i=-1): v = self.get(k, i); self.ok(v is not None and part in v, f'{k} = {v!r}, want it to contain {part!r}')

PLAY = lambda f, w=2000: [f'play:{f}', f'wait:{w}']

@test
def library(c):
    v, _ = run(c.name, ['view:videos', 'wait:1500', 'log:"items="+library.items.length', 'log:"folders="+pg.cards.filter(e => e.kind === "folder").length',
                        'view:music', 'log:"music="+vis.length', 'view:videos', 'query:surround', 'log:"found="+vis.map(i => i.name).join(",")',
                        'log:"nat="+["ep11", "Ep2", "ep1", "ep10", "ep2b"].sort(Lib.natCompare).join(",")'])
    c.vals = v
    c.eq('items', 9); c.eq('folders', 1); c.eq('music', 2); c.eq('found', 'surround.mp4')
    c.eq('nat', 'ep1,Ep2,ep2b,ep10,ep11')   # #62: numbers in their order

@test
def playback(c):
    c.vals, _ = run(c.name, PLAY('video.mp4', 2500) + ['log:"playing="+player.playing', 'log:"time="+player.time', 'log:"length="+player.length',
                    'log:"size="+player.frameSize.width+"x"+player.frameSize.height', 'log:"frames="+player.framesShown', 'pause', 'wait:300',
                    'log:"playing="+player.playing', 'log:"error="+player.error'])
    c.eq('playing', 'true', 0); c.more('time', 1000); c.near('length', 12000, 300); c.eq('size', '640x360'); c.more('frames', 10)
    c.eq('playing', 'false'); c.eq('error', '')

@test
def keys(c):   # #37: the skip keys, mute, speed
    c.vals, _ = run(c.name, ['set:jump=5'] + PLAY('video.mp4', 1500) + ['pause', 'seek:2', 'wait:600', 'key:ArrowRight', 'wait:700', 'log:"t="+player.time',
                    'key:ArrowLeft', 'wait:700', 'log:"t="+player.time', 'key:m', 'log:"muted="+player.muted', 'key:]', 'log:"rate="+player.rate',
                    'key:j', 'key:j', 'log:"delay="+Settings.values.audioDelay',
                    'seek:2', 'wait:500', 'key:Ctrl+ArrowRight', 'wait:700', 'log:"tmin="+player.time', 'key:Alt+ArrowLeft', 'wait:700', 'log:"t5="+player.time'])
    c.near('t', 7000, 400, 0); c.near('t', 2000, 400, 1); c.eq('muted', 'true'); c.more('rate', 1.01); c.eq('delay', -20)   # #58: 10 ms steps
    c.near('tmin', 11500, 500); c.near('t5', 0, 400)   # #70: Ctrl+→ 1 min (to the end of 12 s), Alt+← 5 min (to the start)

@test
def ab_repeat(c):   # #42 (libVLC reports the time in steps: B can be seen up to ~0.5 s late)
    c.vals, _ = run(c.name, PLAY('video.mp4', 1000) + ['ab:1-2', 'wait:3500', 'log:"t="+player.time', 'wait:1100', 'log:"t="+player.time'])
    for i in (0, 1): c.ok(700 <= float(c.get('t', i) or -1) <= 2700, f't = {c.get("t", i)}, want 1–2 s, it should loop (without A-B it is past 4 s)')

@test
def chapters(c):   # #40: chapters from the file, jumping, bookmarks
    c.vals, _ = run(c.name, PLAY('chapters.mkv', 1500) + ['log:"chapters="+pb.chapters().map(x => x.title).join(",")', 'pause', 'seek:0.5', 'wait:500',
                    'key:N', 'wait:700', 'log:"t="+player.time', 'bookmark:7.5', 'log:"bookmarks="+pb.bookmarks().length', 'key:N', 'wait:700', 'log:"t="+player.time'])
    c.eq('chapters', 'One,Two,Three'); c.near('t', 3000, 400, 0); c.eq('bookmarks', 1); c.near('t', 6000, 400, 1)

@test
def subtitles(c):   # the .srt next to the video, and the embedded track
    c.vals, _ = run(c.name, PLAY('video.mp4', 2500) + ['log:"tracks="+sb.tracks.length', 'log:"active="+sb.active', 'log:"now="+sb.now',
                    'play:tracks.mkv', 'wait:2500', 'log:"tracks2="+sb.tracks.length', 'log:"audio="+player.audioTracks().filter(x => x.id >= 0).length',
                    'log:"atrack="+player.audioTrack()', 'key:b', 'wait:600', 'log:"atrack="+player.audioTrack()'])
    c.more('tracks', 0); c.eq('active', 0); c.has('now', 'Hello from the test subtitles'); c.more('tracks2', 0); c.eq('audio', 2)
    c.ok(c.get('atrack', 0) != c.get('atrack', 1), f'audio track did not change ({c.get("atrack", 0)} → {c.get("atrack", 1)})')

@test
def lyrics(c):   # #41
    c.vals, _ = run(c.name, ['view:music'] + PLAY('song.flac', 3500) + ['log:"lines="+(sb.lyrics ? sb.lyrics.length : 0)', 'log:"synced="+sb.synced',
                    'log:"now="+player.time+" "+sb.lyricIndex', 'log:"playing="+player.playing'])
    c.eq('lines', 3); c.eq('synced', 'true'); c.eq('playing', 'true')
    t, idx = (c.get('now') or '-1 -9').split()   # the line for the moment it was asked (lines at 1, 3 and 5 s)
    want = sum(int(t) + 50 >= ms for ms in (1000, 3000, 5000)) - 1   # a line shows 50 ms early (Subtitles.lineAt)
    c.ok(int(idx) == want and want >= 0, f'lyric line {idx} at {t} ms, want {want}')

@test
def fast(c):   # #46: hold for 2× speed
    c.vals, _ = run(c.name, PLAY('video.mp4', 1500) + ['log:(pb.fastStart(0), "rate="+player.rate)', 'wait:300', 'log:"rate="+player.rate',
                    'log:(pb.fastEnd(), "end")', 'wait:300', 'log:"rate="+player.rate'])
    c.near('rate', 2, 0.01, 1); c.near('rate', 1, 0.01, 2)

@test
def surround(c):   # #44
    c.vals, _ = run(c.name, PLAY('surround.mp4', 2500) + ['log:"ch="+pb.info.audio[0].ch', 'log:"playing="+player.playing', 'log:"error="+player.error'])
    c.eq('ch', 6); c.eq('playing', 'true'); c.eq('error', '')

@test
def midi(c):   # #36: MIDI through FluidSynth and the built-in SoundFont
    c.vals, _ = run(c.name, ['view:music'] + PLAY('tune.mid', 3000) + ['log:"playing="+player.playing', 'log:"time="+player.time', 'log:"error="+player.error'])
    c.eq('playing', 'true'); c.more('time', 500); c.eq('error', '')

@test
def hls(c):   # #16: a network stream
    c.vals, _ = run(c.name, [f'playfile:{WEB}/hls/index.m3u8', 'wait:5000', 'log:"playing="+player.playing', 'log:"time="+player.time',
                    'log:"size="+player.frameSize.width', 'log:"error="+player.error'])
    c.eq('playing', 'true'); c.more('time', 500); c.eq('size', 640); c.eq('error', '')

@test
def preview(c):   # #43: the storyboard for the timeline preview
    c.vals, _ = run(c.name, PLAY('video.mp4', 6000) + ['log:"frames="+pb.frames.board.filter(x => x).length', 'log:"near="+pb.frames.nearest(5)'])
    c.more('frames', 2); c.ok((c.get('near') or '') != '', 'no storyboard frame near 5 s')

@test
def playlists(c):   # #47 #50 #51: adding, moving, exporting, importing
    m3u = os.path.join(OUT, c.name, 'list.m3u8')
    c.vals, _ = run(c.name, ['view:videos', 'wait:1000', 'pladd:3', 'plmove', 'log:"pl="+library.playlists[0].srcs.map(s => s.split(/[\\\\/]/).pop()).join(",")',
                    f'log:"export="+library.exportPlaylist("Test", library.playlists[0].srcs, {js(m3u)})',
                    f'log:(library.addSources([{js(m3u)}], false, true), "count="+library.playlists.length)', 'wait:300',
                    'log:"imported="+library.playlists[library.playlists.length - 1].name+":"+library.playlists[library.playlists.length - 1].srcs.length'])
    c.eq('export', 'true')
    names = (c.get('pl') or '').split(',')
    c.ok(len(names) == 3, f'playlist has {names}, want 3 items')
    lines = [l for l in open(m3u, encoding='utf-8').read().splitlines() if l and not l.startswith('#')] if os.path.exists(m3u) else []
    c.ok(len(lines) == 3, f'exported playlist has {len(lines)} entries, want 3')
    c.eq('imported', 'Test:3')

@test
def recording(c):
    d = os.path.join(OUT, c.name, 'rec'); os.makedirs(d, exist_ok=True)
    c.vals, _ = run(c.name, [f'set:recDir={js(d)}'] + PLAY('video.mp4', 1000) + ['rec', 'wait:200', 'log:"recording="+player.recording', 'wait:5000', 'rec', 'wait:1500',
                    'log:"recording="+player.recording'])
    c.eq('recording', 'true', 0); c.eq('recording', 'false', 1)
    files = [f for f in os.listdir(d) if os.path.getsize(os.path.join(d, f)) > 20000]
    c.ok(files, f'no recording in {d}: {os.listdir(d)}')

@test
def snapshot(c):
    d = os.path.join(OUT, c.name, 'snap'); os.makedirs(d, exist_ok=True)
    c.vals, _ = run(c.name, [f'set:snapshotDir={js(d)}'] + PLAY('video.mp4', 1500) + ['pause', 'key:S', 'wait:800'])
    files = [f for f in os.listdir(d) if f.endswith('.png') and os.path.getsize(os.path.join(d, f)) > 1000]
    c.ok(files, f'no snapshot in {d}: {os.listdir(d)}')

@test
def settings_kept(c):   # settings and positions survive a restart
    v1, prof = run(c.name, ['set:accent="#3b82f6"', 'set:jump=30'] + PLAY('video.mp4', 1500) + ['pause', 'seek:6', 'wait:1000'])   # resume skips the first and the last 5 s
    c.vals, _ = run(c.name, ['log:"accent="+Settings.values.accent', 'log:"jump="+Settings.values.jump',
                             'log:"pos="+Math.round(library.positions[vis.find(i => i.name === "video.mp4").src] || 0)'], profile=prof)
    c.eq('accent', '#3b82f6'); c.eq('jump', 30); c.near('pos', 6, 1)

@test
def resume_ask(c):   # #79: Resume set to Ask starts from the beginning and offers the saved place; Never starts over
    c.vals, _ = run(c.name, ['set:resumeMode="ask"'] + PLAY('video.mp4', 1500) + ['pause', 'seek:6', 'wait:800', 'play:video.mp4', 'wait:1500',
                    'log:"offer=" + Math.round(pb.resumeOffer)', 'log:"bar=" + resumeBar.visible', 'log:"t=" + player.time', 'resume', 'wait:800',
                    'log:"offer=" + Math.round(pb.resumeOffer)', 'log:"bar=" + resumeBar.visible', 'log:"t=" + player.time',
                    'set:resumeMode="never"', 'pause', 'seek:6', 'wait:800', 'play:video.mp4', 'wait:1500', 'log:"offer=" + Math.round(pb.resumeOffer)', 'log:"t=" + player.time'])
    c.eq('offer', 6, 0); c.eq('bar', 'true', 0); c.near('t', 2500, 1700, 0)   # from the beginning (each step takes 0.5 s), with the bar
    c.eq('offer', 0, 1); c.eq('bar', 'false', 1); c.near('t', 8000, 1300, 1)   # Resume: on from the saved place
    c.eq('offer', 0, 2); c.near('t', 2500, 1700, 2)                            # Never: from the beginning, no bar

@test
def midi_not_ffmpeg(c):   # #76: MIDI on the "always with FFmpeg" list still plays (with FluidSynth, not through FFmpeg)
    c.vals, _ = run(c.name, ['set:classicTypes="mid, tgv"', 'view:music'] + PLAY('tune.mid', 3000) + ['log:"playing="+player.playing', 'log:"time="+player.time'])
    c.eq('playing', 'true'); c.more('time', 500)   # (like the midi test: the tune lasts 4 s)

@test
def side_kept(c):   # #91: a hidden sidebar stays hidden after a restart
    _, prof = run(c.name, ['wait:1800', 'log:(win.sideHidden = true, "hid")', 'wait:300'])
    c.vals, _ = run(c.name, ['wait:500', 'log:"hidden=" + win.sideHidden'], profile=prof)
    c.eq('hidden', 'true')

@test
def video_shape(c):   # #89: with "resize window to the video" on, a resized window takes the video's shape again
    c.vals, _ = run(c.name, ['set:fitWindow=true', 'size:1000x500'] + PLAY('video.mp4', 1500) + ['size:1000x900', 'wait:1200',
                    'log:"ratio=" + Math.round(playerView.height / playerView.width * 1000)'])
    c.near('ratio', 563, 25)   # (640x360)

@test
def live_shape(c):   # #89: while the window is resized it keeps the video's shape (Windows: WM_SIZING; Linux: our own edges)
    ratio = lambda s, f=1: f'Math.round(({s}.height - (win.height - playerView.height) * {f}) / ({s}.width - (win.width - playerView.width) * {f}) * 1000)'
    steps = ['set:fitWindow=true', 'size:1000x500'] + PLAY('video.mp4', 1500) + [
        'log:"edge=" + ' + ratio('win.lockedSize(Qt.RightEdge, 1200, 500)'),
        'log:"corner=" + ' + ratio('win.lockedSize(Qt.BottomEdge | Qt.RightEdge, 1200, 300)'),
        'log:"top=" + ' + ratio('win.lockedSize(Qt.TopEdge, 1000, 800)')]
    if sys.platform == 'win32':
        d = 'Screen.devicePixelRatio'
        steps += [f'log:"win=" + ' + ratio(f'frame.sizingAt(2, 1200 * {d}, 500 * {d})', d),
                  f'log:"wincorner=" + ' + ratio(f'frame.sizingAt(4, 900 * {d}, 900 * {d})', d)]
    c.vals, _ = run(c.name, steps)
    for k in ('edge', 'corner', 'top') + (('win', 'wincorner') if sys.platform == 'win32' else ()): c.near(k, 563, 8)   # (640x360)

@test
def max_whole_screen(c):   # #95: a maximised window that covers the whole screen (no taskbar) is not taken for fullscreen
    c.vals, _ = run(c.name, ['wait:1800', 'log:(win.toggleMax(), "max")', 'wait:900', 'view:music', 'wait:900',
                    'log:"max=" + win.maximized + " fs=" + win.fullscreen'] + PLAY('video.mp4', 1200) + [
                    'log:"fsMode=" + win.fsMode', 'fs', 'wait:900', 'log:"fs=" + win.fullscreen', 'fs', 'wait:900',
                    'log:"back=" + win.maximized + " fs=" + win.fullscreen'])
    c.eq('max', 'true fs=false'); c.eq('fsMode', 'false'); c.eq('fs', 'true'); c.eq('back', 'true fs=false')

@test
def side_l_key(c):   # #91: a hidden sidebar stays hidden when L goes from the player to the library and back
    S = 'log:"side=" + win.sideHidden + " " + Settings.values.navExpanded + " " + Math.round(side.width) + " rail=" + rail.width'
    c.vals, _ = run(c.name, ['set:autoHideSide=true', 'wait:1500', 'log:(win.sideHidden = true, "hid")', 'wait:400', S] + PLAY('video.mp4', 1200) + [
                    'key:l', 'wait:600', S, 'key:l', 'wait:600', 'key:l', 'wait:600', S, 'key:Ctrl+3', 'wait:600', S,
                    'key:l', 'wait:600', 'log:(win.sideToggle(), "peek")', 'wait:500', 'log:"peek=" + Math.round(side.width)',
                    'log:(win.sideToggle(), "unpeek")', 'key:l', 'wait:600', S])
    c.eq('peek', 250)
    for i in range(5): c.ok((c.get('side', i) or '').startswith('true') and ' 0 ' in (c.get('side', i) or ''), f"sidebar shows: {c.get('side', i)}")

@test
def lyrics_snap(c):   # #96: fullscreen lyrics, then the window manager takes the window out of fullscreen and tiles it
    c.vals, _ = run(c.name, ['set:fitWindow=true', 'size:1000x600', 'view:music'] + PLAY('song.flac', 2500) + ['fs', 'wait:900',
                    'log:(win.showNormal(), win.y = Screen.virtualY, win.height = Screen.desktopAvailableHeight, "tiled")', 'wait:1500',
                    'log:"lock=" + win.lockAspect', 'log:"win=" + win.visible + " " + win.visibility', 'log:"h=" + (win.height === Screen.desktopAvailableHeight)',
                    'log:"tiled=" + win.tiled + " " + win.corner'])
    c.eq('lock', 0); c.eq('win', 'true 2')
    if sys.platform == 'win32': c.eq('h', 'true')   # (the height the window manager gave it is kept; macOS keeps it under its menu bar)
    if sys.platform.startswith('linux'): c.eq('tiled', 'true 0')

@test
def preview_av1(c):   # #94: AV1 videos (YouTube downloads) get a storyboard and a thumbnail (FFmpeg with dav1d)
    f = os.path.join(A.media, 'extra', 'av1.mkv')
    if not os.path.exists(f): return c.ok(not os.environ.get('CI'), 'no extra/av1.mkv in the test media (no AV1 encoder?)')
    c.vals, _ = run(c.name, [f'playfile:{f}', 'wait:6000', 'log:"frames="+pb.frames.board.filter(x => x).length', 'log:"playing="+player.playing'])
    c.more('frames', 2); c.eq('playing', 'true')

@test
def key_names(c):   # #97: Shift+letter is the capital, also without text (input methods) or with Caps Lock on
    E, S = 0x45, 0x02000000
    c.vals, _ = run(c.name, [f'log:"n=" + keys.nameOf({E}, 0, "e") + keys.nameOf({E}, {S}, "E") + keys.nameOf({E}, {S}, "") + keys.nameOf({E}, 0, "") + keys.nameOf({E}, 0, "E") + keys.nameOf({E}, {S}, "e")'])
    c.eq('n', 'eEEeeE')

@test
def quick_close(c):   # #98: a click on the video closes the quick settings
    c.vals, _ = run(c.name, ['size:1100x700'] + PLAY('video.mp4', 1500) + ['quick:video', 'wait:500', 'log:"open=" + quick.open',
                    'click:200,300', 'wait:700', 'log:"open=" + quick.open', 'log:"playing=" + player.playing'])
    c.eq('open', 'true', 0); c.eq('open', 'false', 1); c.eq('playing', 'true')

@test
def preset_list(c):   # #98: the preset list at the bottom of the quick settings stays inside the window
    c.vals, _ = run(c.name, ['size:1100x600'] + PLAY('video.mp4', 1500) + ['quick:subs', 'wait:500', 'log:(quick.presetBox.item.popup.open(), "opened")', 'wait:400',
                    'log:"bottom=" + (quick.presetBox.item.popup.contentItem.mapToItem(null, 0, quick.presetBox.item.popup.contentItem.height).y <= win.height)'])
    c.eq('bottom', 'true')

@test
def own_presets(c):   # #98: your own video filter presets: save, pick again, remove
    vf = 'Settings.values.vf'
    c.vals, _ = run(c.name, PLAY('video.mp4', 1200) + ['quick:video', 'wait:300',
        f'log:(Settings.set("vf", Object.assign({{}}, {vf}, {{ brightness: 130, saturate: 40, rotate: 90 }})), quick.savePreset("Anime"), "saved")',
        'log:"stored=" + Settings.values.vfPresets.Anime.brightness + " " + Settings.values.vfPresets.Anime.saturate + " " + ("rotate" in Settings.values.vfPresets.Anime)',
        'log:"listed=" + quick.vpresetOptions.map(o => o[0]).join(",")',
        'log:(quick.videoPreset(""), "reset")', f'log:"after=" + {vf}.brightness + " " + {vf}.rotate',
        'log:(quick.videoPreset("u:Anime"), "picked")', f'log:"again=" + {vf}.brightness + " " + {vf}.saturate + " " + {vf}.rotate',
        'log:(quick.videoPreset("__del"), "removed")', 'log:"left=" + Object.keys(Settings.values.vfPresets).length + " " + quick.vpreset'])
    c.eq('stored', '130 40 false'); c.eq('listed', ',vivid,cinema,bw,warm,vintage,u:Anime,__save,__del')
    c.eq('after', '100 90'); c.eq('again', '130 40 90'); c.eq('left', '0 ')

@test
def original_size(c):   # #99: the video area takes the video's own size, one video pixel on one screen pixel
    c.vals, _ = run(c.name, ['size:1200x800'] + PLAY('video.mp4', 1500) + ['log:(win.originalSize(), "go")', 'wait:600',
                    'log:"px=" + Math.round(playerView.width * Screen.devicePixelRatio) + "x" + Math.round(playerView.height * Screen.devicePixelRatio)',
                    'log:(win.toggleMax(), "max")', 'wait:900', 'log:(win.originalSize(), "go")', 'wait:900',
                    'log:"px=" + Math.round(playerView.width * Screen.devicePixelRatio) + "x" + Math.round(playerView.height * Screen.devicePixelRatio) + " " + win.maximized'])
    for i, want in ((0, '640x360'), (1, '640x360 false')): c.ok(c.get('px', i) in (want, want.replace('640x360', '641x360'), want.replace('640x360', '640x361')), f"video area {c.get('px', i)}, want {want}")

@test
def state_paint(c):   # #96: after maximise / back the window keeps drawing; it is never see-through (Linux: corners by a mask)
    c.vals, _ = run(c.name, ['size:1000x600'] + PLAY('video.mp4', 1200) + ['log:(win.toggleMax(), "max")', 'wait:900',
                    'log:(win.showNormal(), "normal")', 'wait:900', 'log:(win.swaps = 0, "count")', 'wait:1500',
                    'log:"swaps=" + win.swaps', 'log:"alpha=" + win.color.a', 'log:"mask=" + frame.masked()'])
    c.more('swaps', 10); c.eq('alpha', 1)
    c.eq('mask', 'true' if sys.platform.startswith('linux') else 'false')   # (Linux: rounded corners by the window mask)

@test
def restore_size(c):   # #102: back from maximised at a size of a few pixels (or bigger than the screen): the last good size
    c.vals, _ = run(c.name, ['size:1000x600', 'wait:1500', 'log:(win.toggleMax(), "max")', 'wait:900',
                    # what Windows did on the reporter's PC: the restored window at its minimum size in the corner
                    'log:(win.showNormal(), win.x = Screen.virtualX, win.y = Screen.virtualY, win.width = 136, win.height = 39, "tiny")', 'wait:900',
                    'log:"size=" + win.width + "x" + win.height'])
    c.eq('size', '1000x600')

@test
def max_tap(c):   # #95: a tap that maximises twice at once (Windows and the button) keeps the window maximised
    c.vals, _ = run(c.name, ['wait:1800', 'log:(win.toggleMax(), win.toggleMax(), "tap")', 'wait:800', 'log:"vis=" + win.visibility'])
    c.ok(c.get('vis') in ('4', '5'), f"window went back to {c.get('vis')}")   # (maximised; on a screen without a taskbar Windows reports it as fullscreen)

@test
def view360(c):   # #78: a 360° video is shown as a view to look around in (drag) and zoom (wheel); a flat one is not
    c.vals, _ = run(c.name, PLAY('video.mp4', 1500) + ['log:"on=" + playerView.on360'] + PLAY('sphere.mkv', 2000) + [
                    'log:"playing=" + player.playing', 'pause',   # (paused: the next file in the folder must not start during the test)
                    'log:"on=" + playerView.on360', 'log:"p=" + player.projection', 'log:"yaw=" + playerView.yaw', 'look:-100,0', 'zoom:2',
                    'log:"yaw=" + Math.round(playerView.yaw)', 'log:"fov=" + playerView.fov'])
    c.eq('on', 'false', 0); c.eq('on', 'true', 1); c.eq('p', 1); c.eq('yaw', 0, 0)
    c.ok(c.get('yaw', 1) not in (None, '0'), 'dragging did not turn the view'); c.eq('fov', 70); c.eq('playing', 'true')

@test
def renamed(c):   # 3.1: VLC Redesign is now Vela Player: the first start copies the old data folder (Linux: under XDG_DATA_HOME)
    if not sys.platform.startswith('linux') or A.app.endswith('run.sh'): return   # (the Flatpak keeps its own XDG folders)
    xdg = os.path.join(OUT, c.name, 'xdg'); shutil.rmtree(xdg, ignore_errors=True)
    old = os.path.join(xdg, 'VLC Redesign', 'VLC Redesign 3'); os.makedirs(old)
    json.dump({'language': 'en', 'accent': '#123456', 'onboarded': True}, open(os.path.join(old, 'settings.json'), 'w'))
    c.vals, _ = run(c.name, ['log:"accent=" + Settings.values.accent'], extra_env={'XDG_DATA_HOME': xdg, 'VLCR_USER_DATA': None})
    c.eq('accent', '#123456')
    c.ok(os.path.exists(os.path.join(xdg, 'Vela Player', 'Vela Player', 'settings.json')), 'no settings.json under the new name')
    c.ok(os.path.exists(os.path.join(old, 'settings.json')), 'the old data folder is gone (it should be copied, not moved)')

@test
def probe_cache(c):   # #59: the next start shows the library complete at once, without FFmpeg reading every file again
    _, prof = run(c.name, ['view:videos', 'wait:4000'])
    c.vals, _ = run(c.name, ['view:videos', 'log:"dur="+Math.round(vis.find(i => i.name === "video.mp4").duration)', 'log:"busy="+library.busy'],
                    extra_env={'VLCR_FFMPEG': os.path.join(OUT, 'no-ffmpeg-here')}, profile=prof)
    c.eq('dur', 12); c.eq('busy', 0)

@test
def controls_follow(c):   # #68: a switch follows its setting while it is shown
    make = """Qt.createQmlObject('import VLCR\\nToggle { path: "autoUpdate" }', win)"""   # (no ";": it splits steps)
    c.vals, _ = run(c.name, ['settings:general', 'wait:500',
        f'log:((t) => ((b) => (Settings.set("autoUpdate", false), "flip=" + b + ">" + t.checked))(t.checked))({make})'])
    c.eq('flip', 'true>false')

@test
def episodes(c):   # #72: at the end of an episode the next one starts (this crashed: the old player was used after release)
    c.vals, prof = run(c.name, ['view:videos', 'dir:0', 'wait:800', 'play:Show_S01E01.mp4', 'wait:1500', 'seek:9', 'wait:6000',
                                'log:"now=" + (current ? current.name : "-")', 'log:"playing=" + player.playing'])
    c.eq('now', 'Show_S01E02.mp4'); c.eq('playing', 'true')
    c.ok(not os.path.exists(os.path.join(prof, 'crash.log')), 'the app crashed (crash.log)')

@test
def cursor(c):   # #60: in fullscreen the cursor hides after the delay, also while the video keeps the hover going; not over Settings
    c.vals, _ = run(c.name, ['set:hideCursorDelay=1.5'] + PLAY('video.mp4', 500) + ['fs', 'wait:1000', 'log:"fs=" + win.fsMode', 'mouse:600,400', 'wait:300',
                    'mouse:610,410', 'log:"h=" + win.cursorHidden', 'wait:2500', 'log:"h=" + win.cursorHidden', 'mouse:650,420', 'log:"h=" + win.cursorHidden',
                    'wait:2500', 'log:"h=" + win.cursorHidden', 'settings:general', 'log:"h=" + win.cursorHidden', 'wait:2500', 'log:"h=" + win.cursorHidden'])
    # only where it means something: under xvfb the real (virtual) pointer stays at 0,0, the top edge, where the
    # controls come in and the cursor rightly stays; macOS runners have no real fullscreen either
    if c.get('fs') != 'true' or sys.platform != 'win32': return
    c.eq('h', 'false', 0); c.eq('h', 'true', 1); c.eq('h', 'false', 2)
    c.eq('h', 'true', 3); c.eq('h', 'false', 4); c.eq('h', 'false', 5)   # Settings opened in fullscreen: the cursor comes back and stays

@test
def ffmpeg_route(c):   # #66: file types on the FFmpeg list play converted by FFmpeg (time, length and seeking still right)
    c.vals, _ = run(c.name, ['set:classicTypes="mkv"'] + PLAY('tracks.mkv', 3000) + ['log:"a=" + player.playing + " " + player.frameSize.width + "x" + player.frameSize.height',
                    'log:"t=" + player.time', 'log:"len=" + player.length', 'seek:5', 'wait:1500', 'log:"t=" + player.time', 'log:"err=" + player.error'])
    c.eq('a', 'true 640x360'); c.near('t', 2700, 1300, 0); c.near('len', 11000, 300); c.near('t', 6300, 900, 1); c.eq('err', '')   # (its subtitles run to 11 s; FFmpeg starts slower on 2-core build servers)

@test
def migration(c):   # v2.x → v3: export-for-v3.json in v2.x's data folder
    v2 = os.path.join(OUT, c.name, 'v2data'); os.makedirs(v2, exist_ok=True)
    src = os.path.join(MEDIA, 'video.mp4')
    # what v2.x writes (main.js exportForV3): its localStorage, every value as JSON text
    data = {'vlcx-settings': {'accent': '#22c55e', 'jump': 5, 'engine': 'ffmpeg', 'engineV': 2}, 'vlcx-listView': True,
            'vlcx-playlists3': [{'name': 'From v2', 'srcs': [src]}], 'vlcx-recent2': [src], 'vlcx-watched': [src], 'vlcx-pos': {src: 4.5},
            'vlcx-bookmarks': {src: [{'t': 3, 'name': 'Mark'}]}}
    json.dump({'version': '2.1.1', 'data': {k: json.dumps(v) for k, v in data.items()}}, open(os.path.join(v2, 'export-for-v3.json'), 'w', encoding='utf-8'))
    c.vals, _ = run(c.name, ['wait:500', 'log:"accent="+Settings.values.accent', 'log:"jump="+Settings.values.jump', 'log:"engine="+Settings.values.engine',
                             'log:"list="+Settings.values.listView', 'log:"pls="+library.playlists.map(p => p.name).join(",")',
                             f'log:"bm="+(library.bookmarks[{js(src)}] || []).length'],
                    extra_env={'VLCR_NO_IMPORT': '', 'VLCR_V2_DATA': v2})
    c.eq('accent', '#22c55e'); c.eq('jump', 5); c.ok(c.get('engine') != 'ffmpeg', 'the Classic engine setting was taken over')
    c.eq('list', 'true'); c.has('pls', 'From v2'); c.eq('bm', 1)

# ---------- run ----------
# a first start: libVLC makes its plugin cache, Windows and macOS look at the new program; later starts are quicker
run('warmup', ['play:video.mp4', 'wait:2000'])
failed = []
for fn in TESTS:
    name = fn.__name__
    if A.only and name not in A.only: continue
    c = Check(name, {})
    t0 = time.time()
    try: fn(c)
    except Exception as e: c.fails.append(f'{type(e).__name__}: {e}')
    print(('PASS' if not c.fails else 'FAIL') + f'  {name}  ({time.time() - t0:.0f} s)', flush=True)
    for f in c.fails: print('      ' + f)
    if c.fails: failed.append(name)
httpd.shutdown()
print(f'\n{len(failed)} failed' + (': ' + ', '.join(failed) if failed else '') + f'   (output in {OUT})')
sys.exit(1 if failed else 0)
