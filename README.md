# BBModel Unpack (monorepo)

Tooling for Blockbench `.bbmodel` files. Extract Bedrock `geo.json`, animations,
animation controllers, textures and metadata, and render the models to PNG
previews — from the VS Code Explorer, from the command line over MCP, or as a
library in your own tools.

## Packages

| Package | Path | Description |
| --- | --- | --- |
| `@bbmodel-tools/core` | [`packages/core`](packages/core) | Headless `.bbmodel` toolkit: parsing, inventories, Bedrock converters, file extraction. No UI dependencies; runs on plain Node.js. |
| `@bbmodel-tools/render` | [`packages/render`](packages/render) | Automated **Blockbench rendering**: renders `.bbmodel` files to framed, transparent PNGs by driving an isolated Blockbench desktop instance over the Chrome DevTools Protocol. Pure framing/verification math is unit tested without Blockbench. |
| `@bbmodel-tools/vsc` | [`packages/vsc`](packages/vsc) | The **BBModel Unpack** VS Code extension, with Explorer context-menu commands, inline badges and previews. Built on `@bbmodel-tools/core`. |
| `@bbmodel-tools/mcp` | [`packages/mcp`](packages/mcp) | An MCP (Model Context Protocol) server exposing the core toolkit and automated rendering to MCP clients over stdio. Built on `@bbmodel-tools/core` and `@bbmodel-tools/render`. |

## Getting started

```bash
npm install          # installs all workspaces
npm run build        # build core → render → vsc + mcp (in dependency order)
npm test             # unit tests: @bbmodel-tools/core + @bbmodel-tools/render (no Blockbench needed)
npm run lint         # eslint across all packages
```

Rendering PNGs end-to-end additionally requires the
[Blockbench](https://www.blockbench.net/) desktop app (tested with 5.2.x); the
MCP server locates it automatically or honors the `BBMODEL_BLOCKBENCH_PATH`
environment variable.

## Workspace scripts

Any script can be run for a single package with `-w`:

```bash
npm run build -w @bbmodel-tools/core     # build only the core library
npm run fixtures -w @bbmodel-tools/core  # regenerate test fixtures
npm run package:vsc                # build core + package the VS Code extension (.vsix)
npm run start -w @bbmodel-tools/mcp      # run the MCP server over stdio
npm run render -w @bbmodel-tools/render  # manual render: node dist/cli.js <file.bbmodel> [--out out.png] [--direction iso]
```

## Using the MCP server

`@bbmodel-tools/mcp` listens on stdio and exposes four tools over `.bbmodel` files:

- `bbmodel_inspect` — parse a file and return a content inventory (formats, counts, names).
- `bbmodel_read_sections` — convert geometry/animations/controllers to Bedrock JSON in memory, no files written.
- `bbmodel_extract` — extract sections to an output folder (geo.json, animations.json, animation_controllers.json, display.json and texture PNGs).
- `bbmodel_render` — render a framed PNG preview of the model (direction presets or `yaw`/`elevation` orbit angles). Requires Blockbench installed + Node ≥ 22; first call pays a ~1–2 s Blockbench boot, later calls reuse the warm instance.

Example client configuration:

```json
{
  "mcpServers": {
    "bbmodel": {
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"]
    }
  }
}
```

(Rebuild first if needed: `npm run build -w @bbmodel-tools/mcp`.)

This repo also ships a project-level pi configuration: `.pi/mcp.json` registers
the same server as the `bbmodel` server for [pi](https://github.com/earendil-works/pi-coding-agent)
sessions in this repo (tools appear as `mcp__bbmodel__…` after trusting the
project).

## Documentation

- [`packages/render/README.md`](packages/render/README.md) — how automated Blockbench rendering works (camera fitting, verification loop, CDP automation).
- [`packages/core/docs/FORMAT-NOTES.md`](packages/core/docs/FORMAT-NOTES.md) — notes on the `.bbmodel` format and conversion fidelity.
- [`packages/vsc/docs/PUBLISHING.md`](packages/vsc/docs/PUBLISHING.md) — publishing the extension to the Marketplace.
- [`packages/vsc/docs/TESTING.md`](packages/vsc/docs/TESTING.md) — test strategy for the extension.
- [`packages/core/docs/CREDIT-AND-OWNERSHIP.md`](packages/core/docs/CREDIT-AND-OWNERSHIP.md) — attribution of bundled assets.

## License

GPL-3.0 — see [LICENSE](LICENSE).
