# Protoloop — Brand assets

Icon, logomark, wordmark and logo lockups for **Protoloop**, the agentic parametric‑CAD
studio for macOS.

**Concept** — a minimal **isometric wireframe box** (wide rectangular form), drawn from an exact
isometric projection with slim, **sharp‑cornered pure‑blue** strokes, on a light‑gray macOS
"squircle." All assets are generated from one script (`src/build_assets.py`) and rasterised to **PNG**.

## Palette

| Token | Hex | Use |
|---|---|---|
| Blue (primary) | `#0D0DFF` | brand blue (≈ pure `#0000FF`), "loop" accent |
| Wireframe stroke | `#2323FF → #0000EE` | the box edges (subtle gradient) |
| Ink | `#14171E` | wordmark on light |
| Background | `#F5F6F8 → #E0E4EB` | light‑gray icon material |

Wordmark typeface: **Avenir Next** (Demi, 600) — its circular `o`s echo the "loop" and the bore.

---

## macOS app‑icon format (what to ship)

macOS uses a single **`.icns`** file, compiled from an **`.iconset`** folder of 10 PNGs at five
logical sizes plus their `@2x` Retina variants. These are exactly the files in
`icon/icon.iconset/`:

| File | Pixels |
|---|---|
| `icon_16x16.png` | 16×16 |
| `icon_16x16@2x.png` | 32×32 |
| `icon_32x32.png` | 32×32 |
| `icon_32x32@2x.png` | 64×64 |
| `icon_128x128.png` | 128×128 |
| `icon_128x128@2x.png` | 256×256 |
| `icon_256x256.png` | 256×256 |
| `icon_256x256@2x.png` | 512×512 |
| `icon_512x512.png` | 512×512 |
| `icon_512x512@2x.png` | 1024×1024 |

Conventions followed:
- **Big Sur grid** — the rounded‑rect body is **824×824** centered in a **1024** canvas with a
  **~185 px** corner radius. Corners are **transparent** (the squircle is the shape).
- **No baked drop shadow** in the iconset — macOS adds the shadow at render time. The
  shadowed version (`Protoloop-icon-hero-1024.png`) is for marketing/web only.
- **Small sizes use a heavier stroke** — 16/32/64 px thicken the wireframe so the box stays
  crisp and legible in the Dock / Finder.

The compiled `icon/Protoloop.icns` was built with:

```bash
iconutil -c icns icon/icon.iconset -o icon/Protoloop.icns
```

### Wire it into the app (optional)

electron‑builder reads the icon from `build/` (`buildResources: build`). To make this the real
app icon, copy the `.icns` into the build resources:

```bash
cp marketing/icon/Protoloop.icns build/icon.icns
npm run pack   # or: npm run dist
```

---

## Asset inventory

```
icon/
  Protoloop.icns                  ← compiled macOS app icon (ship this)
  icon.iconset/                   ← the 10 source PNGs above
  Protoloop-icon-1024.png         ← flat app icon master (no shadow)
  Protoloop-icon-512.png / -256.png
  Protoloop-icon-hero-1024.png    ← with soft shadow, for marketing/web

logomark/                         ← the CAD block alone, transparent bg
  Protoloop-logomark-{1024,512,256,128}.png

wordmark/                         ← "Protoloop" type, transparent, trimmed
  Protoloop-wordmark-light.png    ← for light backgrounds
  Protoloop-wordmark-dark.png     ← for dark backgrounds

logo/                             ← lockups (mark + wordmark), transparent
  Protoloop-logo-horizontal-{light,dark}.png
  Protoloop-logo-stacked-{light,dark}.png

src/                              ← SVG sources + generator
  build_assets.py                 ← regenerates everything
  *.svg
```

## Regenerate

```bash
cd marketing/src
python3 build_assets.py
```

Requires `rsvg-convert` (`brew install librsvg`), `iconutil` (ships with macOS), and Python
`Pillow`. Edit the palette/geometry constants at the top of `build_assets.py` and re‑run to
restyle the whole set. Vector sources live in `src/*.svg` if you prefer to edit those directly.
