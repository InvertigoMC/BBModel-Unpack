# Changelog

All notable changes to the **BBModel Unpack** monorepo are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- `@bbmodel-tools/render` — new package that renders `.bbmodel` files to framed transparent PNGs using automated
  isolated Blockbench instances (Chrome DevTools Protocol, no plugins installed, user profile untouched):
  - `BlockbenchRenderer` — spawns/reuses an isolated Blockbench process (`--userData <temp>` + `--remote-debugging-port`, `locateBlockbench()` resolves the install), loads models in-memory, and captures PNGs via an offscreen `THREE.WebGLRenderer` with hidden grid/gizmos.
  - Camera framing math (`fitBoxToCamera`) fitted to the world-space bounding box from element meshes so rotated elements/bones are fully in frame; ink-margin verification (`verifyImage`, `classify`) drives automatic reframing retries (up to 3 attempts).
  - Pure helpers are unit tested without Blockbench (framing, PNG ink analysis, minimal PNG encode/decode); CLI (`node dist/cli.js`) included for manual end-to-end runs.
  - Camera direction support: presets (`iso`, `front`, `back`, `left`, `right`, `top`, `bottom`), arbitrary direction vectors, and orbit angles in degrees (`CameraAngles` with `yaw`/`elevation`).
- `@bbmodel-tools/mcp` — new `bbmodel_render` tool wrapping the renderer: saves a PNG next to the model (or explicit `out` path, `overwrite` respected) and returns MCP `image` content plus camera/margins metadata. Window-kill cleanup on SIGINT/SIGTERM; graceful error when Blockbench is not installed.
- Project `.pi/mcp.json` — registers the `bbmodel` MCP server for pi sessions (4 tools: inspect, read sections, extract, render).

## [0.1.1] — 2026-11-07

### Added

- READMEs for `@bbmodel-tools/core` and `@bbmodel-tools/mcp` packages.

### Changed

- Restructured as a monorepo:
  - `@bbmodel-tools/core` — headless `.bbmodel` toolkit (parsing, inventories, Bedrock converters, extraction).
  - `bbmodel-unpack` — the BBModel Unpack VS Code extension (npm name kept unscoped for the VSIX manifest), now bundling `@bbmodel-tools/core` at build time.
  - `@bbmodel-tools/mcp` — a new MCP (Model Context Protocol) server exposing the core toolkit over stdio
    (`bbmodel_inspect`, `bbmodel_read_sections`, `bbmodel_extract`).
- Versions bumped to `0.1.1` across all three packages in preparation for the first npm publish.

## [0.1.0] — 2026-08-02

### Added

Initial release.

- **Extract BBModel Contents** command (Explorer context menu, Command Palette, multi-select).
- **Extract Geometry Only**, **Extract Animations Only** (includes animation controllers),
  **Extract Textures Only** and **Preview BBModel Contents** commands.
- Converted files use plain `.json` names — `bedrock/geometry.json`, `bedrock/animations.json`,
  `bedrock/animation_controllers.json`, `display/display.json` — instead of `.geo.json`-style
  compound suffixes (`.png.mcmeta` keeps its Minecraft-mandated double extension).
- Bedrock geometry conversion (`bedrock/geometry.json`, format_version 1.12.0 / 1.16.0 / 1.21.0) matching
  Blockbench's exporter: axis mirroring, box-UV and per-face UV (with up/down flip), bones,
  locators, null objects, texture meshes, bindings, visible bounds.
- Bedrock animation conversion (`bedrock/animations.json`, format_version 1.8.0): snapped timecodes,
  axis flips, catmullrom / step / pre-post keyframes, bezier baking, Molang passthrough,
  sound / particle / timeline effect keyframes.
- Animation controller conversion (`bedrock/animation_controllers.json`, format_version 1.19.0).
- Embedded texture decoding (base64 → PNG), texture layers, flipbook `.mcmeta` generation, and
  copying of `relative_path`-linked external textures.
- Display settings export.
- Legacy container support: `cubes` arrays, `geometry_name`, missing `model_format`,
  `shade`-based mirroring, pre-3.2 Z-rotation fix, and the bbmodel 5.0 flat `groups` layout.
- **Extract All BBModels in Folder** command: recursive scan (`node_modules`/`.git` skipped,
  symlinks not followed), count confirmation, per-file logging and a single batch summary.
- `BB` Explorer badge on `.bbmodel` files (toggle: `bbmodelUnpack.explorer.badges`).
- Safe output handling: destination prompt / alongside mode, new-folder / merge / overwrite
  choices, ` (2)`-style collision names, cancellable progress, output-channel logging.
