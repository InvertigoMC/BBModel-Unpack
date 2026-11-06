# BBModel Unpack

**Unbox everything inside a Blockbench model.**

BBModel Unpack adds a right-click command to Visual Studio Code that extracts the contents of
[Blockbench](https://www.blockbench.net/) `.bbmodel` project files into an organized folder:
Minecraft Bedrock `geo.json` geometry, `animation.json` files, animation controllers, embedded
textures and display settings.

> A `.bbmodel` is a single JSON document that bundles geometry, textures (as base64), animations
> and metadata. This extension unpacks that bundle without ever needing to open Blockbench.

## Features

- **Extract BBModel Contents** — right-click any `.bbmodel` in the Explorer and unpack everything.
- **Extract All BBModels in Folder** — right-click a folder to batch-extract every model inside
  it (recursive; confirms the file count first, then reports one summary).
- **Extract Textures Only** — pull just the embedded PNGs (plus `.mcmeta` for flipbook textures).
- **Extract Geometry Only** / **Extract Animations Only** — grab just the converted geometry, or
  just the animations together with their animation controllers.
- **Preview BBModel Contents** — inspect what a model contains before writing anything.
- `.bbmodel` files are marked with a small `BB` badge in the Explorer so they're easy to spot.
- Converted **Bedrock geometry** (`.geo.json`), **animations** (`.animation.json`) and
  **animation controllers** (`.animation_controllers.json`) that match Blockbench's own exporters.
- Handles old and new container formats (Blockbench 3.x inline outliner through the 5.0 flat
  `groups` layout), including legacy migrations like `geometry_name` and `shade`-based mirroring.
- Never overwrites silently: existing folders prompt for *new folder / merge / overwrite*, and
  merged files get safe ` (2)`-style names.
- Full logging in the **BBModel Unpack** output channel, including every written file and every
  conversion warning.

## Usage

1. Right-click a `.bbmodel` file in the Explorer.
2. Choose **Extract BBModel Contents**.
3. The extension writes a `<model name>_extracted` folder next to the file (or asks for a
   destination, if configured) and shows a completion message with **Open Folder**.

All commands are also available from the Command Palette (they use the active editor's file or
ask you to pick one), and the file commands support multi-selecting several `.bbmodel` files at
once.

Right-clicking a **folder** offers **Extract All BBModels in Folder**: it scans the folder
recursively (skipping `node_modules` and `.git`), shows how many models it found and asks for
confirmation, then extracts each one. Batch runs log per-file results to the output channel and
finish with a single summary notification instead of one message per model; cancelling stops the
rest of the batch.

### Output layout

```
my_model_extracted/
├── bedrock/
│   ├── geometry.json                 Bedrock geometry (format_version 1.12.0+)
│   ├── animations.json               all animations (format_version 1.8.0)
│   └── animation_controllers.json
├── textures/
│   ├── skin.png                      decoded from embedded base64
│   ├── flip.png.mcmeta               only for flipbook/animated textures
│   └── layers/…                      Blockbench editing layers, if present
└── display/
    └── display.json                  Java item/block display transforms
```

File names are plain `.json` — no `.geo.json` / `.animation.json` compound suffixes (Minecraft
reads the identifiers inside the files, not the file names). If your pack tooling expects the
conventional `name.geo.json` style, rename on copy. The exception is `<texture>.png.mcmeta`,
whose double extension Minecraft itself requires.

## What gets converted, and how

| Output | Source inside `.bbmodel` | Transformation |
| --- | --- | --- |
| `bedrock/geometry.json` | `elements[]`, `outliner[]`/`groups[]`, `resolution`, `visible_box` | Rebuilt exactly like Blockbench's Bedrock exporter: X axis mirrored (`origin.x = -to.x`), pivots negate X, rotations negate X/Y, box-UV offsets or per-face `uv`/`uv_size` with flipped up/down faces, bones with parent/pivot/rotation/binding/mirror, locators and null objects (`_null_` prefix). |
| `bedrock/animations.json` | `animations[]` | Keyframes keyed by snapped `"0.0"`-style timecodes; position X and rotation X/Y negated back into Bedrock space; `catmullrom` keeps `lerp_mode`; `step` becomes a `pre`/`post` jump on the following keyframe; bezier segments are baked to sampled keyframes; sound/particle/timeline effect keyframes included. |
| `bedrock/animation_controllers.json` | `animation_controllers[]` | States keyed by name, transitions as `{target: condition}`, `on_entry`/`on_exit` as `;`-terminated Molang lines, blend settings preserved. |
| `textures/*.png` | `textures[].source` (base64 data URL) | Decoded byte-for-byte — no re-encoding. Textures referenced by `relative_path` are copied from disk when the file exists next to the model. |
| `textures/*.mcmeta` | `textures[].frame_time` etc. | Approximate rewrite of Blockbench flipbook settings as Java `.mcmeta` animation data. |
| `display/display.json` | `display` | Verbatim copy, wrapped as `{"display": …}` for merging into a Java item/block model. |

Everything else in the file (editor state, history, project metadata) is deliberately left alone —
the `.bbmodel` itself remains the source of truth for it.

Approximate or lossy conversions are flagged in the completion message and the log —
for example: free-form **meshes** cannot be represented in Bedrock geometry (a warning lists
them), bezier curves are baked, and Molang expressions on mirrored axes are negated by wrapping
(`-(expr)`).

## Commands

| Command | ID |
| --- | --- |
| Extract BBModel Contents | `bbmodel-unpack.extractAll` |
| Extract Geometry Only | `bbmodel-unpack.extractGeometry` |
| Extract Animations Only | `bbmodel-unpack.extractAnimations` |
| Extract Textures Only | `bbmodel-unpack.extractTextures` |
| Preview BBModel Contents | `bbmodel-unpack.preview` |
| Extract All BBModels in Folder | `bbmodel-unpack.extractFolder` |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `bbmodelUnpack.output.mode` | `alongside` | Write next to the model, or `ask` for a destination folder every time. |
| `bbmodelUnpack.output.onExisting` | `ask` | What to do when the output folder already has content: `ask`, `newFolder`, `merge`, or `overwrite`. |
| `bbmodelUnpack.output.prettyJson` | `true` | Pretty-print generated JSON. |
| `bbmodelUnpack.explorer.badges` | `true` | Show the `BB` badge next to `.bbmodel` files in the Explorer. |

## Security & privacy

- The extension treats model files as **pure data**: nothing inside a `.bbmodel` is ever executed
  or evaluated (Molang stays text).
- File names derived from model content are fully sanitized (no path traversal, no reserved
  Windows device names).
- The only file read outside the model itself is a texture's `relative_path`, resolved next to the
  `.bbmodel`, and only when the texture is not embedded.
- No telemetry, no network access.

## Known limitations

- Free-form meshes, armatures and other non-cube geometry are not converted to `geo.json`
  (Bedrock's schema has no stable equivalent); a warning reports how many were skipped.
- Inverse-kinematics (null object) animation baking is not performed; null objects export as
  `_null_*` locators like Blockbench does.
- LZUTF8-compressed backup files (`<lz>…`) are detected and explained, not decoded — re-save them
  in Blockbench first.
- Java block/item model export (`.json` element models) is on the roadmap; today Java projects
  still get textures, animations and display settings.

## Development

This extension is part of a monorepo; the shared logic lives in the `@bbmodel/core` package
([`packages/core`](../core)) so it can also be used headlessly and from the `@bbmodel/mcp`
MCP server ([`packages/mcp`](../mcp)). From the repository root:

```bash
npm install                          # install all workspaces
npm run build                        # build @bbmodel/core, then this extension
npm test                             # unit tests (Node's built-in test runner, in packages/core)
npm run lint                         # ESLint across the monorepo
npm run fixtures -w packages/core    # regenerate fixtures/ deterministically
npm run icon -w packages/vsc         # regenerate media/icon.png from packages/vsc/scripts
npm run package:vsc                  # build core + bundle + .vsix with @vscode/vsce
```

Press `F5` in VS Code to launch an Extension Development Host with the extension loaded. See
[docs/TESTING.md](docs/TESTING.md) for a full manual test checklist, and
[`packages/core/docs/FORMAT-NOTES.md`](../core/docs/FORMAT-NOTES.md) for the research notes behind the converters.

## Credits & trademarks

- Conversion behavior follows the open-source [Blockbench](https://github.com/JannisX11/blockbench)
  exporters (GPL-3.0) as a *reference specification*; this extension contains its own independent
  TypeScript implementation and no Blockbench code.
- Blockbench is a project by JannisX11 and contributors. Minecraft is a trademark of Mojang
  Synergies AB / Microsoft. This extension is not affiliated with, endorsed by, or sponsored by
  Blockbench, Mojang, or Microsoft.
- Icon and branding are original artwork for this project.

## License

[GPL-3.0](LICENSE) — © 2026 Kaioga5
