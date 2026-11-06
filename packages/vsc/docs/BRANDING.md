# Branding

## Name candidates

| Name | Notes |
| --- | --- |
| **BBModel Unpack** ✅ | Recommended. Says exactly what it does, matches the repo name, "bbmodel" is the term users actually search, and no other marketplace extension owns it. Doesn't lead with a third-party trademark. |
| Model Crate | Evocative (matches the icon) but doesn't say *bbmodel*; weaker search. |
| Cube Courier | Charming, zero discoverability. |
| BBX — BBModel Extractor | Reads like a file format; the acronym adds nothing. |
| Unboxer for Blockbench Files | Descriptive but long; leads users to type "Blockbench", which the display name shouldn't lean on. |

**Recommended:** `BBModel Unpack` (id `bbmodel-unpack`).

## Tagline

> **Unbox everything inside a Blockbench model.**

## Marketplace summary (≤ ~140 chars, used as `description`)

> Extract Bedrock geo.json, animations, animation controllers, textures and metadata from
> Blockbench .bbmodel files — right from the Explorer.

## Longer Marketplace description

The README serves as the long description (the Marketplace renders it). Its opening paragraph is
the pitch: right-click a `.bbmodel`, get an organized folder of converted Bedrock JSON and
decoded textures — no need to open Blockbench.

## Keywords & categories

- `keywords`: blockbench, bbmodel, minecraft, bedrock, geometry, animation, texture, extract,
  geo.json, resource pack
- `categories`: **Other**, **Visualization**

## Logo concept

**"Cube out of the crate."** An amber isometric cube (the model) lifting out of an open slate
crate (the archive), with two mint motion dashes on each side, on a dark rounded tile. It combines
the three required motifs — generic 3D cube, extraction/archive symbol, file-container feel —
using simple geometry that stays readable at 32 px. All artwork is original; it deliberately
avoids the Blockbench wrench-cube, the Minecraft grass block/creeper, the Mojang and Microsoft
logos, and the VS Code ribbon.

Palette: slate `#131A22` / `#3D4E64` / `#2A3648`, amber `#FFC94A` / `#E09F2D` / `#B97B1D`,
mint accent `#7FD1B9`.

## Assets & regeneration

- `media/icon.svg` — vector source of truth (hand-editable).
- `media/icon.png` — 256×256 Marketplace icon, generated **without any image tooling** by
  `scripts/generate-icon.js` (a dependency-free PNG encoder):

```bash
npm run icon
```

To produce other sizes (e.g. 128 px for tighter payloads), either change `SIZE` in the script and
re-run, or export `media/icon.svg` from any vector editor (Inkscape:
`inkscape media/icon.svg -w 128 -h 128 -o media/icon-128.png`). The manifest currently points at
`media/icon.png` (256 px — above the 128 px Marketplace minimum). Keep the icon identical across
releases so users recognize the extension.
