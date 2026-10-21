# Marks a Matroska file as a 360° video (#78): adds Projection { ProjectionType = 1 (equirectangular) } to the first
# video track, the way 360° cameras and mkvmerge --projection-type do. FFmpeg's command line cannot set it.
# The elements behind the track list move, so the SeekHead and Cues positions are moved along.
#   python3 qt/tests/mark360.py in.mkv out.mkv
import sys

def vint(b, i):        # an EBML variable-size integer: (value, length); the marker bit is dropped
    n = 1
    while not b[i] & (0x80 >> (n - 1)): n += 1
    v = b[i] & (0xFF >> n)
    for k in range(1, n): v = (v << 8) | b[i + k]
    return v, n
def eid(b, i):         # an element ID keeps its marker bits
    n = vint(b, i)[1]
    return int.from_bytes(b[i:i + n], 'big'), n
def size8(v): return bytes([0x01]) + v.to_bytes(7, 'big')   # a size written in 8 bytes
def elems(b, s, e):
    i = s
    while i < e:
        id_, n1 = eid(b, i); sz, n2 = vint(b, i + n1)
        yield id_, i, i + n1 + n2, i + n1 + n2 + sz
        i += n1 + n2 + sz

b = bytearray(open(sys.argv[1], 'rb').read())
seg = next(x for x in elems(b, 0, len(b)) if x[0] == 0x18538067)
data = seg[2]          # positions in SeekHead and Cues count from here
tracks = next(x for x in elems(b, data, len(b)) if x[0] == 0x1654AE6B)
entry = next(x for x in elems(b, tracks[2], tracks[3]) if x[0] == 0xAE and any(
    y[0] == 0x83 and b[y[2]] == 1 for y in elems(b, x[2], x[3])))   # TrackType 1 = video
video = next(x for x in elems(b, entry[2], entry[3]) if x[0] == 0xE0)
proj = bytes([0x76, 0x70, 0x84, 0x76, 0x71, 0x81, 0x01])   # Projection (4 bytes) { ProjectionType = 1 }

# rebuild Tracks → TrackEntry → Video with the Projection inside, every size written in 8 bytes
v_body = bytes(b[video[2]:video[3]]) + proj
v_new = b'\xE0' + size8(len(v_body)) + v_body
e_body = bytes(b[entry[2]:video[1]]) + v_new + bytes(b[video[3]:entry[3]])
e_new = b'\xAE' + size8(len(e_body)) + e_body
t_body = bytes(b[tracks[2]:entry[1]]) + e_new + bytes(b[entry[3]:tracks[3]])
t_new = bytes(b[tracks[1]:tracks[1] + 4]) + size8(len(t_body)) + t_body
shift = len(t_new) - (tracks[3] - tracks[1])
after = tracks[3] - data   # positions past the track list move by "shift"

def bump(lo, hi):      # an unsigned integer element, rewritten in place (same width)
    v = int.from_bytes(b[lo:hi], 'big')
    if v >= after:
        v += shift
        assert v < 1 << (8 * (hi - lo)), 'position does not fit'
        b[lo:hi] = v.to_bytes(hi - lo, 'big')
for top in elems(b, data, len(b) if seg[3] > len(b) else seg[3]):
    if top[0] == 0x114D9B74:                                   # SeekHead → Seek → SeekPosition
        for s in elems(b, top[2], top[3]):
            for p in elems(b, s[2], s[3]):
                if p[0] == 0x53AC: bump(p[2], p[3])
    if top[0] == 0x1C53BB6B:                                   # Cues → CuePoint → CueTrackPositions → CueClusterPosition
        for cp in elems(b, top[2], top[3]):
            for tp in elems(b, cp[2], cp[3]):
                if tp[0] == 0xB7:
                    for p in elems(b, tp[2], tp[3]):
                        if p[0] == 0xF1: bump(p[2], p[3])
b[tracks[1]:tracks[3]] = t_new
if seg[3] <= len(b) - shift:   # a known Segment size grows too (8-byte size: rewritten in place)
    n1 = eid(b, seg[1])[1]; sz, n2 = vint(b, seg[1] + n1)
    assert n2 == 8, 'segment size is not 8 bytes'
    b[seg[1] + n1:seg[1] + n1 + 8] = size8(sz + shift)
open(sys.argv[2], 'wb').write(b)
print('marked as 360 degrees:', sys.argv[2], f'(+{shift} bytes)')
