# BBModel Unpack (monorepo)

Tooling for Blockbench `.bbmodel` files. Extract Bedrock `geo.json`, animations,
animation controllers, textures and metadata — from the VS Code Explorer, from
the command line over MCP, or as a library in your own tools.

## Packages

| Package | Path | Description |
| --- | --- | --- |
| `@bbmodels-tools/core` | [`packages/core`](packages/core) | Headless `.bbmodel` toolkit: parsing, inventories, Bedrock converters, file extraction. No UI dependencies; runs on plain Node.js. |
| `@bbmodels-tools/vsc` | [`packages/vsc`](packages/vsc) | The **BBModel Unpack** VS Code extension, with Explorer context-menu commands, inline badges and previews. Built on `@bbmodels-tools/core`. |
| `@bbmodels-tools/mcp` | [`packages/mcp`](packages/mcp) | An MCP (Model Context Protocol) server exposing the core toolkit to MCP clients over stdio. Built on `@bbmodels-tools/core`. |

## Getting started

```bash
npm install          # installs all workspaces
npm run build        # build core → vsc + mcp (in dependency order)
npm test             # run @bbmodels-tools/core unit tests
npm run lint         # eslint across all packages
```

## Workspace scripts

Any script can be run for a single package with `-w`:

```bash
npm run build -w @bbmodels-tools/core     # build only the core library
npm run fixtures -w @bbmodels-tools/core  # regenerate test fixtures
npm run package:vsc                # build core + package the VS Code extension (.vsix)
npm run start -w @bbmodels-tools/mcp      # run the MCP server over stdio
```

## Using the MCP server

`@bbmodels-tools/mcp` listens on stdio and exposes three tools over `.bbmodel` files:

- `bbmodel_inspect` — parse a file and return a content inventory (formats, counts, names).
- `bbmodel_read_sections` — convert geometry/animations/controllers to Bedrock JSON in memory, no files written.
- `bbmodel_extract` — extract sections to an output folder (geo.json, animations.json, animation_controllers.json, display.json and texture PNGs).

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

(Rebuild first if needed: `npm run build -w @bbmodels-tools/mcp`.)

## Documentation

- [`packages/core/docs/FORMAT-NOTES.md`](packages/core/docs/FORMAT-NOTES.md) — notes on the `.bbmodel` format and conversion fidelity.
- [`packages/vsc/docs/PUBLISHING.md`](packages/vsc/docs/PUBLISHING.md) — publishing the extension to the Marketplace.
- [`packages/vsc/docs/TESTING.md`](packages/vsc/docs/TESTING.md) — test strategy for the extension.
- [`packages/core/docs/CREDIT-AND-OWNERSHIP.md`](packages/core/docs/CREDIT-AND-OWNERSHIP.md) — attribution of bundled assets.

## License

GPL-3.0 — see [LICENSE](LICENSE).
