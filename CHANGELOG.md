# Changelog

All notable changes to the **BBModel Unpack** monorepo are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Restructured as a monorepo:
  - `@bbmodels-tools/core` — headless `.bbmodel` toolkit (parsing, inventories, Bedrock converters, extraction).
  - `@bbmodels-tools/vsc` — the BBModel Unpack VS Code extension, now bundling `@bbmodels-tools/core` at build time.
  - `@bbmodels-tools/mcp` — a new MCP (Model Context Protocol) server exposing the core toolkit over stdio
    (`bbmodel_inspect`, `bbmodel_read_sections`, `bbmodel_extract`).

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
