# The VLC Redesign 3 test suite: the v2.x tests (tests/*.mjs, issues #16 #36 #37 #40 #41 #42 #43 #44 #46 #47 #50 #51,
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
def view360(c):   # #78: a 360° video is shown as a view to look around in (drag) and zoom (wheel); a flat one is not
    c.vals, _ = run(c.name, PLAY('video.mp4', 1500) + ['log:"on=" + playerView.on360'] + PLAY('sphere.mkv', 2000) + [
                    'log:"playing=" + player.playing', 'pause',   # (paused: the next file in the folder must not start during the test)
                    'log:"on=" + playerView.on360', 'log:"p=" + player.projection', 'log:"yaw=" + playerView.yaw', 'look:-100,0', 'zoom:2',
                    'log:"yaw=" + Math.round(playerView.yaw)', 'log:"fov=" + playerView.fov'])
    c.eq('on', 'false', 0); c.eq('on', 'true', 1); c.eq('p', 1); c.eq('yaw', 0, 0)
    c.ok(c.get('yaw', 1) not in (None, '0'), 'dragging did not turn the view'); c.eq('fov', 70); c.eq('playing', 'true')

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
    c.eq('a', 'true 640x360'); c.near('t', 2600, 1100, 0); c.near('len', 11000, 300); c.near('t', 6300, 900, 1); c.eq('err', '')   # (its subtitles run to 11 s; FFmpeg starts slower on 2-core build servers)

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
