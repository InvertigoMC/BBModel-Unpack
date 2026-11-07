# @bbmodel-tools/mcp

MCP (Model Context Protocol) server that exposes the `@bbmodel-tools/core` Blockbench toolkit to
MCP clients over stdio. Let your coding agent read a `.bbmodel` file's inventory, read converted
Bedrock resources in memory, or extract them to disk — without installing anything else.

## Install

Requires Node.js 20+. No separate install is needed to *run* it:

```bash
npx @bbmodel-tools/mcp
```

Or install globally:

```bash
npm install -g @bbmodel-tools/mcp
bbmodel-mcp
```

## Tools

| Tool | Purpose |
| --- | --- |
| `bbmodel_inspect` | Parse a `.bbmodel` file and return a content inventory: container format version, model format, UV mode, texture resolution, group/texture counts, animation and controller names. Returns markdown + JSON. |
| `bbmodel_read_sections` | Convert requested sections and return them inline as JSON without writing files: `geometry` (Bedrock `minecraft:geometry`), `animations`, `controllers`, `display`. For `textures`, only file names and external references are returned. |
| `bbmodel_extract` | Extract sections to an output directory, writing Bedrock `geo.json`, `animations.json`, `animation_controllers.json`, `display.json` and decoded texture PNGs. Returns the written file list, warnings and inventory. |
| `bbmodel_render` | Capture a framed transparent PNG of the model by driving an isolated Blockbench instance over the Chrome DevTools Protocol (user settings/profile untouched; models are loaded in-memory). Supports preset directions (`iso`, `front`, …) or orbit angles (`yaw`/`elevation` in degrees). Requires the Blockbench desktop app (or `BBMODEL_BLOCKBENCH_PATH`) and Node >= 22 — see [@bbmodel-tools/render](../render). |

All tools accept an absolute path to a `.bbmodel` file in `file`. The extract tool additionally
accepts `out_dir` (defaults to `<model name>_extracted` next to the source), `sections`,
`overwrite` (default `false` — collisions become `name (2).ext`) and `pretty_json` (default
`true`).

## Client configuration

Generic servers config:

```json
{
  "mcpServers": {
    "bbmodel": {
      "command": "npx",
      "args": ["@bbmodel-tools/mcp"]
    }
  }
}
```

Claude Code:

```bash
claude mcp add bbmodel -- npx @bbmodel-tools/mcp
```

From source (monorepo), point at the built output instead:

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

## Notes

- The server speaks MCP over **stdio only**; it never opens ports and writes nothing to stdout
  besides MCP frames.
- Path access follows the server process's permissions — run it where the `.bbmodel` files are
  reachable, and treat `bbmodel_extract` as a write-capable tool in your client's approvals.
- Conversion fidelity matches the extension and the core library; see the
  [core docs](../core/docs/FORMAT-NOTES.md) for format notes (compressed `<lz>…` backups,
  free-form meshes and IK baking are passed through with warnings, not converted).

## Development (within the monorepo)

```bash
npm install
npm run build -w packages/mcp   # tsc -> dist/
npm run start -w packages/mcp   # run the server over stdio
```

## License

GPL-3.0 — see the root [LICENSE](../../LICENSE).
