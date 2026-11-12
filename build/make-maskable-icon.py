"""Draws public/icons/icon-maskable-512.png (needs Pillow; run by hand, the PNG is committed).

A maskable icon is cropped by the OS (circle, squircle, ...), so the background must run to the
edges and the artwork must sit inside the "safe zone": a circle covering the middle 80%. This is
the same plate-and-cutlery mark as icon-512.png, redrawn at 78% size on a full-bleed background.
Usage: python3 build/make-maskable-icon.py [--scale 1.0 --out file.png]   (scale 1.0 = the plain icon)
"""
import argparse
import math

from PIL import Image, ImageDraw

SIZE = 512
SS = 4  # supersampling for smooth edges
TOP, BOTTOM = (30, 169, 129), (41, 120, 105)
INK = (30, 160, 120)
WHITE = (255, 255, 255)


def render(scale: float) -> Image.Image:
    n = SIZE * SS
    bg = Image.new('RGB', (n, n))
    d = ImageDraw.Draw(bg)
    for y in range(n):
        t = y / (n - 1)
        d.line([(0, y), (n, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    c = n / 2

    def p(x: float, y: float) -> tuple[float, float]:
        return (c + (x - 256) * scale * SS, c + (y - 256) * scale * SS)

    def disc(r: float, fill):
        (x0, y0), (x1, y1) = p(256 - r, 256 - r), p(256 + r, 256 + r)
        d.ellipse([x0, y0, x1, y1], fill=fill)

    disc(155, WHITE)
    disc(111, INK)
    disc(107, WHITE)
    # the slash
    w = 14 * scale * SS / 2
    ax, ay = p(197, 313)
    bx, by = p(316, 197)
    ang = math.atan2(by - ay, bx - ax) + math.pi / 2
    ox, oy = math.cos(ang) * w, math.sin(ang) * w
    d.polygon([(ax + ox, ay + oy), (bx + ox, by + oy), (bx - ox, by - oy), (ax - ox, ay - oy)], fill=INK)
    # the two cutlery bars
    for x in (62, 450):
        (x0, y0), (x1, y1) = p(x - 5, 155), p(x + 5, 357)
        d.rounded_rectangle([x0, y0, x1, y1], radius=5 * scale * SS, fill=WHITE)
    return bg.resize((SIZE, SIZE), Image.LANCZOS)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--scale', type=float, default=0.78)
    ap.add_argument('--out', default='public/icons/icon-maskable-512.png')
    a = ap.parse_args()
    render(a.scale).save(a.out, optimize=True)
