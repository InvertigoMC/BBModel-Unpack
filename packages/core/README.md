# @bbmodel/core

Headless Blockbench `.bbmodel` toolkit. Parse `.bbmodel` files and convert their contents into
Minecraft Bedrock resources: `geo.json` geometry, `animations.json`, `animation_controllers.json`,
decoded texture PNGs and display settings — with no UI or VS Code dependencies, on plain Node.js.

This package powers the [BBModel Unpack VS Code extension](../vsc) and the
[@bbmodel-tools/mcp server](../mcp), and can be used directly in your own tools.

## Install

```bash
npm install @bbmodel-tools/core
```

Requires Node.js 20+.

## Quick start

### Load a model and summarize it

```ts
import { loadBBModel, buildInventory, renderInventoryMarkdown } from '@bbmodel-tools/core';

const model = loadBBModel(await readFile('bot.bbmodel', 'utf-8'));
const inventory = buildInventory(model);

console.log(renderInventoryMarkdown(inventory, model, 'bot.bbmodel'));
// or use the raw counts:
console.log(inventory.elementCounts, inventory.animationNames);
```

### Convert a single section (in memory)

```ts
import { loadBBModel, convertToBedrockGeometry } from '@bbmodel-tools/core';

const model = loadBBModel(text);
const geometry = convertToBedrockGeometry(model);

if (geometry.file) {
  await fs.writeFile('geometry.json', JSON.stringify(geometry.file, null, 2));
}
console.log(geometry.warnings, geometry.skipped);
```

Similar converters exist for the other sections:

- `convertToBedrockGeometry(model)` — `GeometryResult` (bedrock `minecraft:geometry`)
- `convertAnimationsToBedrock(model)` — `AnimationsResult` (bedrock `animations.json`)
- `convertControllersToBedrock(model.controllers)` — `ControllersResult`
- `decodeTextures(model.textures)` — `TexturesResult` (decoded PNG bytes + `.mcmeta` + layers)

### Full extraction to disk

```ts
import { ALL_SECTIONS, NodeFileIO, extractBBModel, loadBBModel } from '@bbmodel-tools/core';
```

`extractBBModel` is the highest-level entry point — it writes the same folder layout as the
extension (`bedrock/`, `textures/`, `display/`) and returns an `ExtractionSummary` with every
artifact it wrote, plus conversion warnings and a content inventory.

```ts
import { ALL_SECTIONS, NodeFileIO, extractBBModel, loadBBModel } from '@bbmodel-tools/core';

const log = { info() {}, warn() {}, error() {} };
const sourcePath = 'bot.bbmodel';
const model = loadBBModel(await readFile(sourcePath, 'utf-8'));

const summary = await extractBBModel({
  model,
  sourcePath,
  outDir: 'bot_extracted',
  io: new NodeFileIO(),          // implement FileIO to run on other backends (e.g. VS Code fs)
  log,
  options: {
    sections: ALL_SECTIONS,      // geometry | animations | controllers | textures | display
    prettyJson: true,
    conflict: 'unique',          // or 'overwrite'
  },
});

for (const artifact of summary.artifacts) {
  console.log(`${artifact.path} (${artifact.kind}, ${artifact.bytes} bytes)`);
}
console.log(summary.warnings);
```

`extractBBModel` uses an async `FileIO` abstraction (`exists`, `mkdirp`, `writeFile`, `readFile`,
`readDir*`), so the same pipeline runs against any storage backend — `NodeFileIO` is bundled, and
the VS Code extension substitutes a `WorkspaceFileIO`. All code paths are awaitable, cancellable
(`CancelToken`) and reportable (`ProgressSink`).

## Subpath exports

Deep imports are supported for tree-shaking / partial use:

```ts
import { loadBBModel } from '@bbmodel-tools/core/parse';
import { convertAnimationsToBedrock } from '@bbmodel-tools/core/animations';
import { NodeFileIO } from '@bbmodel-tools/core/fileio';
```

Available subpaths: `.`, `/extractor`, `/parse`, `/inspect`, `/geometry`, `/animations`,
`/controllers`, `/textures`, `/fileio`, `/names`, `/mathUtil`, `/types`.

## Conversion fidelity

Behavior intentionally mirrors the open-source Blockbench exporters: X-axis mirroring for
geometry, Bedrock-space `position`/`rotation` negation for keyframes, catmullrom/step semantics,
sound/particle/timeline effect keyframes, per-face UV with flipped up/down faces, bone pivots
and locators. See [`docs/FORMAT-NOTES.md`](docs/FORMAT-NOTES.md) for format research notes and
[`docs/CREDIT-AND-OWNERSHIP.md`](docs/CREDIT-AND-OWNERSHIP.md) for attribution.

## Development (within the monorepo)

```bash
npm install
npm run build -w packages/core   # tsc -> dist/
npm test                         # 70 unit tests via Node's built-in test runner
npm run fixtures                 # regenerate fixtures/ deterministically
```

## License

GPL-3.0 — see the root [LICENSE](../../LICENSE).
