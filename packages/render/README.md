# @bbmodel-tools/render

Automated Blockbench screenshots for `.bbmodel` files. Launches an **isolated**
Blockbench desktop instance (a throwaway profile — your Blockbench state is never
touched), drives it over the Chrome DevTools Protocol (CDP), loads the model
in-memory, frames it with a mathematically fitted orthographic camera and
captures a transparent PNG — all from plain Node.js.

Powers the `bbmodel-unpack.preview3d` command of the [BBModel Unpack VS Code
extension](../vsc); the MCP server will reuse the same API.

## How it works

1. Resolve the Blockbench executable (`BBMODEL_BLOCKBENCH_PATH` env var, then
   platform default locations, e.g. `%LOCALAPPDATA%\Programs\Blockbench\Blockbench.exe`).
2. Spawn it with `--userData <temp>` and `--remote-debugging-port=<free port>`
   so it runs with its own profile and a reachable CDP endpoint.
3. Verify Blockbench exposes its plugin API surface over `Runtime.evaluate`.
4. Load the `.bbmodel` content in-memory via `Codecs.project.load(...)`.
5. Measure the model's world-space bounding box from the element meshes
   (covers element and bone/group rotations, which is why a naive `from/to`
   reading is not enough).
6. Fit an orthographic camera so every rotated box corner is inside the frame
   (pure math in [`src/framing.ts`](src/framing.ts), unit tested).
7. Hide helpers (grid, outlines, gizmos) keeping `lights`, render with an
   offscreen `THREE.WebGLRenderer` and return the PNG.
8. Verify the image (pure functions in [`src/verify.ts`](src/verify.ts)):
   no ink => warn; tight/clipped margins => reframe and retry (up to 3 attempts).

## Usage

```ts
import { BlockbenchRenderer, locateBlockbench } from '@bbmodel-tools/render';

const located = locateBlockbench();
if (!located) throw new Error('Blockbench not installed');

const renderer = new BlockbenchRenderer({
	blockbenchPath: located.path,
	logger, // optional
});
try {
	const result = await renderer.render({
		content: bbmodelText,
		name: 'bot',
		width: 512,
		direction: 'iso', // iso | front | back | left | right | top | bottom
	});
	await fs.writeFile(`${result.name}.png`, result.png); // { png, box, camera, margins, attempts, warnings }
} finally {
	await renderer.dispose(); // kills Blockbench + removes the temp profile
}
```

The Blockbench instance is reused across `render()` calls; the first call pays
the boot cost (~1-2 s), further renders are fast.

## CLI (manual e2e checks)

```bash
npm run build -w packages/render
node packages/render/dist/cli.js <file.bbmodel> [--out out.png] [--width N] [--direction iso]
```

## Unit tests

The pure pieces (camera fitting, image verification, minimal PNG codec) run
without Blockbench: `npm test -w packages/render`. Rendering requires a
Blockbench installation; use the CLI above for manual or CI e2e runs.

## Notes

- Requires Node.js >= 22 (built-in WebSocket client for CDP).
- Requires a Blockbench desktop installation (tested with 5.2.x).
- A real Blockbench window will appear briefly during the first render — that
  is the isolated instance booting.
- Bounds/framing/verification feedback comes through `RenderResult.warnings`.
