# Smoke test of a packaged Vela Player: makes a short video (Y4M, uncompressed) and a sound (WAV), lets the
# packaged app play each for a few seconds with its own libVLC, and checks what it reports (the picture size,
# decoded frames, the length). Used by the GitHub Actions workflow after packaging.
#   python qt/packaging/smoke.py <path to the program> [more env, e.g. QT_QPA_PLATFORM=offscreen]
import math, os, struct, subprocess, sys, tempfile

exe = os.path.abspath(sys.argv[1])
extra = dict(a.split('=', 1) for a in sys.argv[2:])
tmp = tempfile.mkdtemp(prefix='vlcr-smoke-')

def video(path, w=320, h=240, frames=150, fps=25):
    with open(path, 'wb') as f:
        f.write(f'YUV4MPEG2 W{w} H{h} F{fps}:1 Ip A1:1 C420jpeg\n'.encode())
        for n in range(frames):
            f.write(b'FRAME\n')
            f.write(bytes((x + n * 4) % 256 for x in range(w)) * h)   # moving gradient
            f.write(bytes([90]) * (w * h // 4)); f.write(bytes([240]) * (w * h // 4))

def sound(path, secs=6, rate=44100):
    data = b''.join(struct.pack('<h', int(8000 * math.sin(2 * math.pi * 440 * i / rate))) for i in range(secs * rate))
    with open(path, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, rate, rate * 2, 2, 16) + b'data' + struct.pack('<I', len(data)) + data)

def run(media, name):
    log = os.path.join(tmp, name + '.log')
    env = dict(os.environ, VLCR_PLAY=media, VLCR_SHOT=os.path.join(tmp, name + '.png'), VLCR_SHOT_MS='8000', VLCR_LOG=log,
               VLCR_USER_DATA=os.path.join(tmp, 'data-' + name), VLCR_NO_IMPORT='1', **extra)
    try: subprocess.run([exe], env=env, timeout=90)
    except subprocess.TimeoutExpired: print('timeout'); return ''
    text = open(log, encoding='utf-8').read() if os.path.exists(log) else ''
    print(f'--- {name}\n{text}')
    return text

ok = True
v = os.path.join(tmp, 'test.y4m'); video(v)
t = run(v, 'video')
if 'size=320x240' not in t or 'decoded 0.0 fps' in t or 'decoded' not in t: print('FAIL: the video did not play'); ok = False
a = os.path.join(tmp, 'test.wav'); sound(a)
t = run(a, 'audio')
if 'player test.wav' not in t or ' t=0.0 ' in t: print('FAIL: the sound did not play'); ok = False
print('smoke test', 'passed' if ok else 'FAILED')
sys.exit(0 if ok else 1)
