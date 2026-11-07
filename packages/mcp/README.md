# @bbmodel-tools/mcp

MCP (Model Context Protocol) server that exposes the `@bbmodel-tools/core` Blockbench toolkit and
the `@bbmodel-tools/render` automated renderer to MCP clients over stdio. Let your coding agent
read a `.bbmodel` file's inventory, read converted Bedrock resources in memory, extract them to
disk — and capture rendered PNG previews of the models (see the render requirements below).

## Install

Requires Node.js 20+ (Node.js 22+ is required by the `bbmodel_render` tool — see below). No
separate install is needed to *run* it:

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
`true`). The render tool additionally accepts `out` (PNG path; defaults to `<model>_render.png`
next to the model), `width`/`height` (px, 16–4096), `direction` (`iso` — the default —`, front`,
`back`, `left`, `right`, `top`, `bottom`) or orbit angles `yaw`/`elevation` (degrees; 0/0 = front,
positive elevation = above), `padding` and `overwrite`.

### Render requirements

`bbmodel_render` needs more setup than the other tools:

- **Blockbench desktop app** installed (tested with 5.2.x), or `BBMODEL_BLOCKBENCH_PATH` pointing
  at the executable. The tool drives the app in an automation mode: it spawns an
  **isolated instance** with its own throwaway profile (`--userData <temp>`), so your Blockbench
  settings, plugins and state are never touched, and loads models in-memory (no disk access from
  within Blockbench).
- **Node.js ≥ 22** for the server *process* that lets the tool work (it uses Node's built-in
  WebSocket client to speak the Chrome DevTools Protocol). The other tools run fine on Node ≥ 20,
  but for `bbmodel_render` to be usable, run the server itself on Node ≥ 22.
- On each render the tool writes a PNG next to the model (or to `out`), **and** returns the image
  inline as MCP image content along with the camera spec, ink margins and warnings.

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
