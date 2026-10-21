# The pixel cat's meow (#77), made like v2.x's Web Audio meow (app/src/app.js meow()): a sawtooth gliding 420 → 720 →
# 480 Hz through two band-pass filters (1800 → 800 Hz and 3000 → 1500 Hz), faded in and out over 0.6 s.
#   python qt/assets/make-meow.py   →  qt/assets/meow.wav
import math, os, struct, wave
RATE = 44100
N = int(RATE * 0.62)

def ramp(t, pts):   # linear between (time, value) points
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        if t <= t1: return v0 + (v1 - v0) * max(0.0, (t - t0) / (t1 - t0))
    return pts[-1][1]
def expramp(t, a, b, dur): return a * (b / a) ** min(1.0, t / dur)

class Bandpass:     # RBJ biquad, recomputed every sample (the centre frequency glides)
    def __init__(self, q): self.q = q; self.x1 = self.x2 = self.y1 = self.y2 = 0.0
    def run(self, x, f):
        w = 2 * math.pi * f / RATE; a = math.sin(w) / (2 * self.q); c = math.cos(w)
        b0, b2, a0, a1, a2 = a, -a, 1 + a, -2 * c, 1 - a
        y = (b0 * x + b2 * self.x2 - a1 * self.y1 - a2 * self.y2) / a0
        self.x2, self.x1, self.y2, self.y1 = self.x1, x, self.y1, y
        return y

f1, f2, phase, out = Bandpass(6), Bandpass(8), 0.0, []
for i in range(N):
    t = i / RATE
    freq = ramp(t, [(0, 420), (0.16, 720), (0.5, 480), (1, 480)])
    phase = (phase + freq / RATE) % 1.0
    saw = 2 * phase - 1
    s = f1.run(saw, expramp(t, 1800, 800, 0.5)) + f2.run(saw, expramp(t, 3000, 1500, 0.5))
    out.append(s * ramp(t, [(0, 0), (0.06, 1), (0.32, 1), (0.55, 0), (1, 0)]))
peak = max(abs(v) for v in out) or 1
with wave.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'meow.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
    w.writeframes(b''.join(struct.pack('<h', int(v / peak * 0.9 * 32767)) for v in out))
print('meow.wav written')
