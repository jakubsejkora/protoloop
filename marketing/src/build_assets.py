#!/usr/bin/env python3
"""
Protoloop brand asset generator + builder.

One file does everything:
  1. emits SVG sources (icon / logomark / wordmark)   -> marketing/src/*.svg
  2. rasterises every PNG with rsvg-convert
  3. builds the macOS .iconset + .icns
  4. trims the wordmark and composes the logo lockups with Pillow

The "CAD shape" is an isometric machined block with a bored hole, drawn from an
exact isometric projection. A simplified, handle-free variant is used at small
icon sizes so it stays legible in the Dock / Finder.

Run:  python3 build_assets.py
"""
import math, os, subprocess
from PIL import Image

# ---------------------------------------------------------------- palette ----
COBALT     = "#0D0DFF"   # primary brand blue — close to pure #0000FF
COBALT_DK  = "#0000E0"
HILITE     = "#A9CBFF"   # bright lit edge
TOP_HI     = "#4A80FF"   # top face, lit
TOP_LO     = "#1E55F6"
LEFT_HI    = "#1E50E0"   # left face (mid)
LEFT_LO    = "#1640BE"
RIGHT_HI   = "#12379F"   # right face (shadow side)
RIGHT_LO   = "#0C2C7E"
BORE_TOP   = "#0A2160"
BORE_BOT   = "#1D4ECB"
EDGE_DARK  = "#0A2068"
INK        = "#14171E"
INK_DK_BG  = "#F4F7FC"   # wordmark ink on dark backgrounds
LOOP_LIGHT = COBALT      # "loop" accent on light bg
LOOP_DARK  = "#4D4DFF"   # "loop" accent on dark bg (lifted for contrast)
BG_TOP     = "#F5F6F8"
BG_BOT     = "#E0E4EB"

# ------------------------------------------------------------- icon canvas ---
CANVAS = 1024.0
BODY   = 824.0                         # Big Sur squircle body
MARGIN = (CANVAS - BODY) / 2.0         # 100
RADIUS = 185.4
CX     = CANVAS / 2.0
CY     = CANVAS / 2.0                   # box is vertically symmetric — true centre

C30 = math.cos(math.radians(30))
S30 = 0.5

# box half-extents (model units). Square base, low height => wide rectangular box.
HX = 0.5
HY = 0.5
HZ = 0.33

# ------------------------------------------------------------- iso helpers ---
def proj(x, y, z, s):
    return (CX + s * (x - y) * C30, CY + s * ((x + y) * S30 - z))

def fmt(coords):
    return " ".join(f"{x:.2f},{y:.2f}" for x, y in coords)

def faces(s):
    h = 0.5
    top   = [proj(-h,-h, h, s), proj( h,-h, h, s), proj( h, h, h, s), proj(-h, h, h, s)]
    left  = [proj(-h, h, h, s), proj( h, h, h, s), proj( h, h,-h, s), proj(-h, h,-h, s)]
    right = [proj( h,-h, h, s), proj( h, h, h, s), proj( h, h,-h, s), proj( h,-h,-h, s)]
    return top, left, right

def hexagon(s):
    return [proj(-HX,-HY, HZ, s), proj( HX,-HY, HZ, s), proj( HX,-HY,-HZ, s),
            proj( HX, HY,-HZ, s), proj(-HX, HY,-HZ, s), proj(-HX, HY, HZ, s)]

def bore(s, r=0.275):
    cx, cy = proj(0, 0, 0.5, s)
    return cx, cy, C30*math.sqrt(2)*s*r, S30*math.sqrt(2)*s*r

def line(a, b):
    return f'M {a[0]:.2f} {a[1]:.2f} L {b[0]:.2f} {b[1]:.2f}'

# ----------------------------------------------------------------- the cube --
def cube(s, *, handles=True, small=False):
    """Minimal wireframe rectangular box, drawn as its three visible faces — each a
    CLOSED polygon. Every corner is a polygon mitre (sharp, no end-caps), and the
    shared inner edges overlap pixel-for-pixel, so there is no overlap artefact.
    Slim, sharp, pure-blue strokes only."""
    E, F, B, C, D, H = hexagon(s)           # [top, UR, LR, bottom, LL, UL]
    g = proj(HX, HY, HZ, s)                 # front (near) top corner

    sw = 80.0 if small else 38.0            # slimmer strokes
    common = (f'fill="none" stroke="url(#gWire)" stroke-width="{sw}" '
              f'stroke-linejoin="miter" stroke-miterlimit="10"')

    top_face   = f'<polygon points="{fmt([E, F, g, H])}" {common}/>'   # rhombus
    right_face = f'<polygon points="{fmt([F, B, C, g])}" {common}/>'   # F·B·C·g
    left_face  = f'<polygon points="{fmt([H, g, C, D])}" {common}/>'   # H·g·C·D
    return top_face + right_face + left_face

# ----------------------------------------------------------------- shared ----
def defs():
    return f'''<defs>
    <linearGradient id="gBg"   x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{BG_TOP}"/><stop offset="1" stop-color="{BG_BOT}"/></linearGradient>
    <linearGradient id="gTop"  x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="{TOP_HI}"/><stop offset="1" stop-color="{TOP_LO}"/></linearGradient>
    <linearGradient id="gLeft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{LEFT_HI}"/><stop offset="1" stop-color="{LEFT_LO}"/></linearGradient>
    <linearGradient id="gRight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{RIGHT_HI}"/><stop offset="1" stop-color="{RIGHT_LO}"/></linearGradient>
    <linearGradient id="gBore" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{BORE_TOP}"/><stop offset="1" stop-color="{BORE_BOT}"/></linearGradient>
    <linearGradient id="gLit"  x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.5" stop-color="{HILITE}"/><stop offset="1" stop-color="{COBALT}"/></linearGradient>
    <linearGradient id="gWire" gradientUnits="userSpaceOnUse" x1="512" y1="285" x2="600" y2="745">
      <stop offset="0" stop-color="#2323FF"/><stop offset="1" stop-color="#0000EE"/></linearGradient>
    <radialGradient id="gGlow" cx="0.5" cy="0.4" r="0.55">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    <filter id="softShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#0A1A4A" flood-opacity="0.30"/></filter>
  </defs>'''

def squircle(shadow=False):
    sh = ' filter="url(#softShadow)"' if shadow else ''
    return f'''<rect x="{MARGIN}" y="{MARGIN}" width="{BODY}" height="{BODY}" rx="{RADIUS}" ry="{RADIUS}" fill="url(#gBg)"{sh}/>
  <rect x="{MARGIN}" y="{MARGIN}" width="{BODY}" height="{BODY}" rx="{RADIUS}" ry="{RADIUS}" fill="url(#gGlow)" opacity="0.5"/>
  <rect x="{MARGIN+1}" y="{MARGIN+1}" width="{BODY-2}" height="{BODY-2}" rx="{RADIUS-1}" ry="{RADIUS-1}" fill="none" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="2"/>
  <rect x="{MARGIN+0.5}" y="{MARGIN+0.5}" width="{BODY-1}" height="{BODY-1}" rx="{RADIUS}" ry="{RADIUS}" fill="none" stroke="#0A1330" stroke-opacity="0.07" stroke-width="1"/>'''

def svg_wrap(inner):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
            f'viewBox="0 0 1024 1024">{defs()}\n{inner}\n</svg>')

def icon_svg(shadow=False, small=False, handles=True):
    s = 312.0 if small else 300.0
    return svg_wrap(squircle(shadow=shadow) + "\n" + cube(s, handles=handles, small=small))

def logomark_svg():
    # the bare wireframe glyph on a transparent canvas
    return svg_wrap(cube(306.0, handles=False, small=False))

# ----------------------------------------------------------------- wordmark --
def wordmark_svg(dark=False):
    proto = INK_DK_BG if dark else INK
    loop  = LOOP_DARK if dark else LOOP_LIGHT
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="640" viewBox="0 0 2400 640">'
            f'<text x="40" y="455" font-family="Avenir Next" font-weight="600" font-size="360" '
            f'letter-spacing="-8" fill="{proto}">Proto<tspan fill="{loop}">loop</tspan></text></svg>')

# ----------------------------------------------------------------- builder ---
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def P(*a):            # path inside marketing/
    return os.path.join(ROOT, *a)

def writef(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)

def rsvg(src, out, w, h=None):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cmd = ["rsvg-convert", src, "-w", str(w), "-h", str(h or w), "-o", out]
    subprocess.run(cmd, check=True)

def trim(path, pad_ratio=0.06):
    im = Image.open(path).convert("RGBA")
    bbox = im.getbbox()
    if not bbox:
        return im
    im = im.crop(bbox)
    pad = int(im.height * pad_ratio)
    canvas = Image.new("RGBA", (im.width + 2*pad, im.height + 2*pad), (0,0,0,0))
    canvas.paste(im, (pad, pad), im)
    canvas.save(path)
    return canvas

ICONSET = [  # (px, apple-name, use small variant?)
    (16,  "16x16",      True),
    (32,  "16x16@2x",   True),
    (32,  "32x32",      True),
    (64,  "32x32@2x",   True),
    (128, "128x128",    False),
    (256, "128x128@2x", False),
    (256, "256x256",    False),
    (512, "256x256@2x", False),
    (512, "512x512",    False),
    (1024,"512x512@2x", False),
]

def build():
    src = lambda n: P("src", n)
    # 1) SVG sources
    writef(src("icon-app.svg"),        icon_svg(shadow=False, small=False))
    writef(src("icon-app-small.svg"),  icon_svg(shadow=False, small=True))
    writef(src("icon-hero.svg"),       icon_svg(shadow=True,  small=False))
    writef(src("logomark.svg"),        logomark_svg())
    writef(src("wordmark-light.svg"),  wordmark_svg(dark=False))
    writef(src("wordmark-dark.svg"),   wordmark_svg(dark=True))
    print("· svg sources written")

    # 2) iconset PNGs + master
    for px, name, small in ICONSET:
        rsvg(src("icon-app-small.svg" if small else "icon-app.svg"),
             P("icon", "icon.iconset", f"icon_{name}.png"), px)
    rsvg(src("icon-app.svg"),  P("icon", "Protoloop-icon-1024.png"), 1024)
    rsvg(src("icon-app.svg"),  P("icon", "Protoloop-icon-512.png"),  512)
    rsvg(src("icon-app.svg"),  P("icon", "Protoloop-icon-256.png"),  256)
    rsvg(src("icon-hero.svg"), P("icon", "Protoloop-icon-hero-1024.png"), 1024)
    print("· iconset + icon PNGs rendered")

    # 3) .icns
    subprocess.run(["iconutil", "-c", "icns", P("icon", "icon.iconset"),
                    "-o", P("icon", "Protoloop.icns")], check=True)
    print("· Protoloop.icns built")

    # 4) logomark (transparent)
    for px in (1024, 512, 256, 128):
        rsvg(src("logomark.svg"), P("logomark", f"Protoloop-logomark-{px}.png"), px)
    print("· logomark PNGs rendered")

    # 5) wordmark (transparent, trimmed)
    for variant in ("light", "dark"):
        out = P("wordmark", f"Protoloop-wordmark-{variant}.png")
        rsvg(src(f"wordmark-{variant}.svg"), out, 2400, 640)
        trim(out)
    print("· wordmark PNGs rendered + trimmed")

    # 6) logo lockups (composite icon tile + wordmark)
    build_lockups()
    print("· logo lockups composed")

def build_lockups():
    # icon tile with soft shadow, transparent bg
    tile_px = 560
    tile = P("src", "_tile.png")
    rsvg(P("src", "icon-hero.svg"), tile, tile_px)
    tile_img = Image.open(tile).convert("RGBA")

    for variant in ("light", "dark"):
        wm = Image.open(P("wordmark", f"Protoloop-wordmark-{variant}.png")).convert("RGBA")
        # scale wordmark so its cap height pairs with the icon
        target_h = int(tile_px * 0.34)
        scale = target_h / wm.height
        wm_s = wm.resize((int(wm.width*scale), target_h), Image.LANCZOS)

        # ---- horizontal lockup ----
        gap = int(tile_px * 0.06)
        W = tile_img.width + gap + wm_s.width
        H = tile_img.height
        canvas = Image.new("RGBA", (W, H), (0,0,0,0))
        canvas.paste(tile_img, (0, 0), tile_img)
        canvas.paste(wm_s, (tile_img.width + gap, (H - wm_s.height)//2 + int(H*0.01)), wm_s)
        canvas = trim_img(canvas, pad=int(tile_px*0.05))
        canvas.save(P("logo", f"Protoloop-logo-horizontal-{variant}.png"))

        # ---- stacked lockup ----
        wm_t = wm.resize((int(wm.width * (tile_px*0.62/wm.width)),
                          int(wm.height * (tile_px*0.62/wm.width))), Image.LANCZOS)
        vgap = int(tile_px * 0.07)
        W2 = max(tile_img.width, wm_t.width)
        H2 = tile_img.height + vgap + wm_t.height
        c2 = Image.new("RGBA", (W2, H2), (0,0,0,0))
        c2.paste(tile_img, ((W2 - tile_img.width)//2, 0), tile_img)
        c2.paste(wm_t, ((W2 - wm_t.width)//2, tile_img.height + vgap), wm_t)
        c2 = trim_img(c2, pad=int(tile_px*0.05))
        c2.save(P("logo", f"Protoloop-logo-stacked-{variant}.png"))

    os.remove(tile)

def trim_img(im, pad=0):
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    if pad:
        c = Image.new("RGBA", (im.width+2*pad, im.height+2*pad), (0,0,0,0))
        c.paste(im, (pad, pad), im)
        im = c
    return im

if __name__ == "__main__":
    build()
    print("done.")
