# Local testing guide

How to run, test, debug, and package BBModel Unpack on your machine. Nothing here publishes
anything.

## Requirements

| Software | Version | Notes |
| --- | --- | --- |
| Node.js | 20 LTS or newer (22/24 fine) | `node --test` glob support is used by `npm test` |
| npm | bundled with Node | |
| Visual Studio Code | 1.90+ | matches `engines.vscode` in package.json |
| Git | any recent | optional, for history |

## Setup

The extension lives in `packages/vsc` of this monorepo. Run all commands from the repository
root unless noted otherwise.

```bash
npm install
npm run build            # builds @bbmodel/core, then packages/vsc
npm run fixtures -w packages/core   # regenerates fixtures/ (already committed, safe to re-run)
```

## Automated tests

```bash
npm test           # compiles @bbmodel/core, then runs 70 unit tests via Node's built-in test runner
npm run lint       # ESLint over all packages
```

The tests cover parsing/normalization (all container eras + malformed input), geometry math,
animation keyframe compilation, controllers, texture decoding, file-name safety, folder
scanning, and an end-to-end extraction into a temp directory. They deliberately avoid
`@vscode/test-electron`: the entire `@bbmodel/core` package is VS Code–independent by design, so
the tests run in plain Node in under a second. The thin `src/vscode/` layer is covered by the manual
checklist below.

## Running the extension (Extension Development Host)

1. Open the repository root in VS Code (`code .`).
2. Press **F5** (or Run → Start Debugging → *Run Extension*). A second VS Code window — the
   Extension Development Host — opens with the extension loaded.
3. In that window, open any folder containing `.bbmodel` files — the repo's `fixtures/` folder
   works out of the box.
4. Watch logs via **View → Output → BBModel Unpack**.

## Manual test checklist

Work through this in the Extension Development Host with the `fixtures/` folder open.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Right-click `simple_cube.bbmodel` → **Extract BBModel Contents** | Progress notification, then success message. `simple_cube_extracted/` appears with `bedrock/` and `textures/` only — no report files, no `metadata/` or `raw/` folders |
| 2 | Click **Open Folder** on the success message | OS file manager opens the output folder |
| 3 | Inspect `bedrock/geometry.json` | `identifier: "geometry.simple_cube"`, bone `body` with `pivot [0,2,0]`, `rotation [0,-45,0]`, cube `origin [-2,0,-2]`, `size [4,4,4]` — note the plain `.json` name |
| 4 | Open `textures/cube.png` | A 16×16 orange/brown checkerboard renders |
| 5 | Extract `animated_bot.bbmodel` | Success **with warnings** (mesh skipped, Molang wrap); `bedrock/animations.json` + `bedrock/animation_controllers.json` + `textures/flip.png.mcmeta` exist |
| 6 | Right-click `animated_bot.bbmodel` → **Preview BBModel Contents** | A Markdown document opens listing 2 animations, 1 controller, 2 textures, element counts — no files written |
| 7 | Right-click → **Extract Textures Only** | Output contains only `textures/` — no `bedrock/` |
| 8 | Extract `simple_cube.bbmodel` **again** into the same folder, choose **Merge (Keep Existing)** | New files get ` (2)` names; nothing overwritten |
| 9 | Same again, choose **Overwrite Matching Files** | Files replaced in place; log notes each overwrite |
| 10 | Same again, choose **Use New Folder** | `simple_cube_extracted-2/` created |
| 11 | Extract `broken.bbmodel` | Clear error: "not valid JSON", with **Show Log** button |
| 12 | Extract `not_a_model.bbmodel` | Clear error: "does not look like a Blockbench project" |
| 13 | Extract `legacy_box.bbmodel` | Works; geo cube has `mirror: true` (migrated from `shade: false`) |
| 14 | Extract `groups_v5.bbmodel` | Works; bones `root` → `child` prove the flat-groups layout parses |
| 15 | Multi-select two `.bbmodel` files → extract | Both are processed one after the other; one summary notification at the end |
| 16 | Command Palette → *BBModel Unpack: Extract BBModel Contents* with no editor open | Open-file dialog filtered to `*.bbmodel` |
| 17 | Set `bbmodelUnpack.output.mode` to `ask`, extract | Folder picker appears first; output lands inside the chosen folder |
| 18 | Cancel the progress notification on a large model | "Extraction cancelled" message; partial files may remain (logged) |
| 19 | Rename a `.txt` file to `.bbmodel` with random text, extract | JSON error — never a crash |
| 20 | External-texture case: create a model whose texture has only `relative_path` pointing at a real PNG next to it | PNG is copied into `textures/`; the output-channel log shows the source path |
| 21 | Look at the Explorer | Every `.bbmodel` file shows a `BB` badge; its hover tooltip includes "Blockbench model — right-click to extract" |
| 22 | Set `bbmodelUnpack.explorer.badges` to `false` | Badges disappear (decorations refresh on the setting change) |
| 23 | Right-click the `fixtures/` folder → **Extract All BBModels in Folder** | Confirmation "Extract 6 .bbmodel files…" listing the names; after **Extract All**: one summary like "extracted 4 of 6 models · warnings · 2 failed" (the broken fixtures fail) with **Show Log** |
| 24 | Right-click a folder with no models → same command | "No .bbmodel files found" message; nothing written |
| 25 | Put a `.bbmodel` inside a `node_modules` subfolder and run the folder command on the parent | That file is not picked up (scan skips `node_modules`/`.git`) |
| 26 | Cancel the progress notification mid-batch | Batch stops; summary says "stopped early" |
| 27 | Right-click `animated_bot.bbmodel` → **Extract Geometry Only** | Output contains only `bedrock/geometry.json` — no animations, textures or display |
| 28 | Right-click `animated_bot.bbmodel` → **Extract Animations Only** | Output contains `bedrock/animations.json` + `bedrock/animation_controllers.json` — no geometry or textures |

### Testing embedded vs. external textures

Fixtures embed all textures (like Blockbench's default "embed textures" save). To exercise the
external path: open a fixture in Blockbench, save textures to disk so the model stores
`relative_path`, re-save the project, then run checklist item 20. Deleting the linked PNG should
produce a warning naming the missing path.

## Debugging common failures

| Symptom | Likely cause / fix |
| --- | --- |
| Commands missing from the context menu | File extension isn't `.bbmodel` (the menu uses `resourceExtname`); or the Extension Host didn't reload — run *Developer: Reload Window* |
| "Cannot find module out/extension.js" on F5 | builds didn't run; run `npm run build` and check the preLaunchTask output |
| Breakpoints not hit | Ensure `outFiles` in `.vscode/launch.json` matches `packages/vsc/out/**` and source maps exist (`npm run build`) |
| Extraction writes nothing, no error | Check the **BBModel Unpack** output channel — sections with no data are skipped by design |
| `npm test` fails to find fixtures | Run `npm run fixtures` (tests resolve `fixtures/` relative to the repo root) |
| Badges not visible | Check `bbmodelUnpack.explorer.badges` and VS Code's own `explorer.decorations.badges` setting |

## Packaging a local `.vsix`

```bash
npm run package
```

produces `bbmodel-unpack-0.1.0.vsix`. Install it for final verification:

```bash
code --install-extension bbmodel-unpack-0.1.0.vsix
```

(or in VS Code: Extensions view → `…` menu → *Install from VSIX…*). Then repeat checklist items
1, 5, 6 and 11 in a **normal** VS Code window. Uninstall afterwards with
`code --uninstall-extension Kaioga.bbmodel-unpack` if you like.
