# Renders icon.svg's shapes (Vela Player: a sail-shaped play button in an orange circle on a dark tile) to the icon files:
# icon.png (1024 px, the app and macOS), icon-512.png (Linux, Flatpak), ../packaging/windows/icon.ico, ../packaging/android/res/drawable/icon.png
# and ../../docs/icon.png. Needs Pillow:  python qt/assets/make-icon.py
import os
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
TILE, DARK, SAIL = (0x14, 0x14, 0x14), (0xF2, 0x8C, 0x1B), (0x14, 0x14, 0x14)   # the app's colours: its dark background and orange accent

def bezier(p0, p1, p2, p3, n=64):
    return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
                  for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i / n for i in range(n + 1))]

def render(size):
    S = 4 * size; k = S / 120                       # drawn 4× larger, then scaled down (smooth edges)
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=28 * k, fill=TILE)
    d.ellipse([(60 - 38) * k, (60 - 38) * k, (60 + 38) * k, (60 + 38) * k], fill=DARK)
    sail = bezier((50, 38), (62, 50), (64, 70), (50, 82)) + [(82, 60)]
    d.polygon([(x * k, y * k) for x, y in sail], fill=SAIL)
    return im.resize((size, size), Image.LANCZOS)

big = render(1024)
big.save(os.path.join(HERE, 'icon.png'))
render(512).save(os.path.join(HERE, 'icon-512.png'))   # Linux menus and the Flatpak (at most 512 px)
render(512).save(os.path.join(HERE, '..', '..', 'docs', 'icon.png'))
render(192).save(os.path.join(HERE, '..', 'packaging', 'android', 'res', 'drawable', 'icon.png'))
big.save(os.path.join(HERE, '..', 'packaging', 'windows', 'icon.ico'), sizes=[(s, s) for s in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
print('icons written')
