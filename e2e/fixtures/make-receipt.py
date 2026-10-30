#!/usr/bin/env python3
"""Draws e2e/fixtures/receipt.png: a clean, synthetic receipt (no real business or person).

Only needed to regenerate the fixture; the PNG is committed. Requires Pillow and DejaVu Sans Mono.
    python3 e2e/fixtures/make-receipt.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

LINES = [
    "CORNER CAFE",
    "42 Example Street",
    "",
    "Order 1042",
    "",
    "1x Burrito Bowl      $11.95",
    "2x Chips & Guac       $8.90",
    "1x Iced Tea           $2.99",
    "",
    "Subtotal             $23.84",
    "Tax                   $2.12",
    "Tip                   $4.00",
    "Total                $29.96",
]
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
SIZE, PAD = 30, 40

font = ImageFont.truetype(FONT, SIZE)
line_h = int(SIZE * 1.5)
width = int(font.getlength("x" * max(len(l) for l in LINES))) + 2 * PAD
img = Image.new("RGB", (width, line_h * len(LINES) + 2 * PAD), "white")
draw = ImageDraw.Draw(img)
for i, line in enumerate(LINES):
    draw.text((PAD, PAD + i * line_h), line, font=font, fill=(20, 20, 20))
out = Path(__file__).with_name("receipt.png")
img.save(out, optimize=True)
print(out, img.size, out.stat().st_size, "bytes")

# The same receipt as a phone would save it: pixels stored sideways, with EXIF Orientation = 6
# ("rotate 90 degrees clockwise to display"). A reader that ignores EXIF sees it lying down.
exif = Image.Exif()
exif[0x0112] = 6
sideways = img.rotate(90, expand=True)  # 90 degrees counter-clockwise
out = Path(__file__).with_name("receipt-exif-rotated.jpg")
sideways.save(out, quality=92, exif=exif)
print(out, sideways.size, out.stat().st_size, "bytes")
