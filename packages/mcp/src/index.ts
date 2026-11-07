#!/usr/bin/env node
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ALL_SECTIONS,
  AnimationsResult,
  ConflictStrategy,
  ControllersResult,
  ExtractSection,
  GeometryResult,
  Logger,
  NormalizedModel,
  TexturesResult,
  NodeFileIO,
  buildInventory,
  convertAnimationsToBedrock,
  convertControllersToBedrock,
  convertToBedrockGeometry,
  decodeTextures,
  extractBBModel,
  loadBBModel,
  renderInventoryMarkdown,
  sanitizeFileName,
} from '@bbmodel-tools/core';
import {
  BlockbenchRenderer,
  CameraDirection,
  locateBlockbench,
} from '@bbmodel-tools/render';

const nullLogger: Logger = {
  /* MCP servers must only write MCP frames to stdout/stderr */
  info() {},
  warn() {},
  error() {},
};

const ALL_SECTIONS_SCHEMA = { type: 'array', items: { type: 'string', enum: ALL_SECTIONS } };

const TOOLS: Tool[] = [
  {
    name: 'bbmodel_inspect',
    title: 'Inspect a .bbmodel file',
    description:
      'Parse a Blockbench .bbmodel file and return a content inventory: format version, model ' +
      'format, UV mode, texture resolution, cube/group/texture counts, animation and controller names.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to a .bbmodel file' },
      },
      required: ['file'],
    },
  },
  {
    name: 'bbmodel_read_sections',
    title: 'Read converted sections in memory',
    description:
      'Convert requested sections of a .bbmodel file and return them inline as JSON without ' +
      'writing any files. Sections: geometry (Bedrock geo.json), animations (Bedrock ' +
      'animations.json), controllers (Bedrock animation_controllers.json), textures (names and ' +
      'external references only — use bbmodel_extract for the actual PNG files), display ' +
      '(display.json render settings).',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to a .bbmodel file' },
        sections: {
          ...ALL_SECTIONS_SCHEMA,
          description: 'Sections to convert; defaults to all',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'bbmodel_extract',
    title: 'Extract sections to disk',
    description:
      'Extract sections of a .bbmodel file into an output directory, writing Bedrock geo.json, ' +
      'animations.json, animation_controllers.json, display.json and decoded texture PNGs. ' +
      'Returns the list of written files, warnings and a content inventory.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to a .bbmodel file' },
        out_dir: {
          type: 'string',
          description:
            'Destination directory. Defaults to a "<model name>_extracted" folder next to the source file.',
        },
        sections: {
          ...ALL_SECTIONS_SCHEMA,
          description: 'Sections to extract; defaults to all',
        },
        overwrite: {
          type: 'boolean',
          description:
            'Overwrite existing files instead of writing unique " (2)"-style file names (default: false).',
        },
        pretty_json: {
          type: 'boolean',
          description: 'Pretty-print generated JSON files (default: true).',
        },
      },
      required: ['file'],
    },
  },
  {
    name: 'bbmodel_render',
    title: 'Render a .bbmodel to PNG',
    description:
      'Capture a rendered PNG image of a Blockbench .bbmodel file. Launches an isolated Blockbench '
      + 'instance (user installation settings are not modified), loads the model in-memory, frames it '
      + 'with an automatically fitted orthographic camera and saves a transparent PNG. Requires the '
      + 'Blockbench desktop app to be installed (or BBMODEL_BLOCKBENCH_PATH set) and Node >= 22.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to a .bbmodel file' },
        out: {
          type: 'string',
          description: 'Output PNG path. Defaults to "<model>_render.png" next to the source file.',
        },
        width: { type: 'number', description: 'Image width in pixels (default 512). Height matches width.' },
        height: { type: 'number', description: 'Image height in pixels. Defaults to width.' },
        direction: {
          type: 'string',
          description: 'Camera preset: iso (default), front, back, left, right, top or bottom.',
          enum: ['iso', 'front', 'back', 'left', 'right', 'top', 'bottom'],
        },
        yaw: {
          type: 'number',
          description: 'Orbit angle around the Y axis in degrees: 0 = front (+Z), 90 = right (+X). Overrides direction preset.',
        },
        elevation: {
          type: 'number',
          description: 'Elevation angle in degrees: 0 = level, positive = above the model (top = +90). Overrides direction preset.',
        },
        padding: {
          type: 'number',
          description: 'Extra camera margin relative to the model half-extents (default 1.15).',
        },
        overwrite: {
          type: 'boolean',
          description: 'Overwrite the output PNG if it exists (default: false).',
        },
      },
      required: ['file'],
    },
  },
];

function parseSections(value: string[] | undefined): ExtractSection[] {
  if (!value || value.length === 0) return ALL_SECTIONS;
  const wanted = new Set(value);
  const unknown = [...wanted].filter(
    (section) => !ALL_SECTIONS.includes(section as ExtractSection)
  );
  if (unknown.length) {
    throw new Error(
      `Unknown section(s): ${unknown.join(', ')}. Valid sections: ${ALL_SECTIONS.join(', ')}`
    );
  }
  return ALL_SECTIONS.filter((section) => wanted.has(section as ExtractSection));
}

async function readModelFile(file: string): Promise<NormalizedModel> {
  const text = await fsp.readFile(file, 'utf-8');
  return loadBBModel(text);
}

interface ConvertedSections {
  geometry?: GeometryResult;
  animations?: AnimationsResult;
  controllers?: ControllersResult;
  textures?: TexturesResult;
}

function convertSections(model: NormalizedModel, sections: ExtractSection[]): ConvertedSections {
  const result: ConvertedSections = {};
  if (sections.includes('geometry')) result.geometry = convertToBedrockGeometry(model);
  if (sections.includes('animations')) result.animations = convertAnimationsToBedrock(model);
  if (sections.includes('controllers')) {
    result.controllers = convertControllersToBedrock(model.controllers);
  }
  if (sections.includes('textures')) result.textures = decodeTextures(model.textures);
  return result;
}

function errorResult(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}

function normalizeSize(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 16 || n > 4096) {
    throw new Error(`${name} must be between 16 and 4096`);
  }
  return Math.round(n);
}

function requireNumberInRange(
  value: unknown,
  name: string,
  range: { min?: number; max?: number }
): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a finite number`);
  if (range.min !== undefined && n < range.min) throw new Error(`${name} must be >= ${range.min}`);
  if (range.max !== undefined && n > range.max) throw new Error(`${name} must be <= ${range.max}`);
  return n;
}

export {};

interface DirectionArgs {
  direction?: string;
  yaw?: number;
  elevation?: number;
}

function resolveDirectionArgs(args: DirectionArgs): CameraDirection | undefined {
  if (typeof args.yaw === 'number' || typeof args.elevation === 'number') {
    return { yaw: args.yaw, elevation: args.elevation };
  }
  if (typeof args.direction === 'string') {
    return args.direction as CameraDirection;
  }
  return undefined;
}

let renderInstance: BlockbenchRenderer | undefined;
let locatedBlockbenchPath: string | undefined;

function getRenderInstance(): BlockbenchRenderer {
  if (!renderInstance) {
    const located = locatedBlockbenchPath ? undefined : locateBlockbench();
    if (!located) {
      throw new Error(
        'Blockbench executable not found. Install the Blockbench desktop app, or set the '
        + 'BBMODEL_BLOCKBENCH_PATH environment variable to the executable path.'
      );
    }
    locatedBlockbenchPath = located.path;
    renderInstance = new BlockbenchRenderer({ blockbenchPath: located.path, logger: nullLogger });
  }
  return renderInstance;
}

async function disposeRenderer(): Promise<void> {
  const instance = renderInstance;
  renderInstance = undefined;
  if (instance) {
    try {
      await instance.dispose();
    } catch {
      // best effort on shutdown
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void disposeRenderer().finally(() => process.exit(0));
  });
}

async function uniqueOutputPath(base: string): Promise<string> {
  if (!(await exists(base))) return base;
  const dir = path.dirname(base);
  const ext = path.extname(base) || '.png';
  const stem = path.basename(base, ext);
  for (let i = 2; ; i++) {
    const candidate = path.join(dir, `${stem} (${i})${ext}`);
    if (!(await exists(candidate))) return candidate;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

const server = new Server(
  { name: 'bbmodel-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case 'bbmodel_inspect': {
        const model = await readModelFile(String(args['file']));
        const inventory = buildInventory(model);
        return {
          content: [
            { type: 'text' as const, text: renderInventoryMarkdown(inventory, model, String(args['file'])) },
            { type: 'text' as const, text: JSON.stringify(inventory, null, 2) },
          ],
        };
      }

      case 'bbmodel_read_sections': {
        const sections = parseSections(args['sections'] as string[] | undefined);
        const model = await readModelFile(String(args['file']));
        const converted = convertSections(model, sections);
        const payload: Record<string, unknown> = {};
        if (converted.geometry) payload.geometry = converted.geometry;
        if (converted.animations) payload.animations = converted.animations;
        if (converted.controllers) payload.controllers = converted.controllers;
        if (converted.textures) {
          payload.textures = converted.textures.items.map((item) => ({
            index: item.index,
            fileName: item.fileName,
            embedded: !!item.bytes,
            externalPath: item.externalPath,
            relativePath: item.relativePath,
            layers: item.layers.map((layer) => layer.fileName),
            notes: item.notes,
          }));
          payload.textureWarnings = converted.textures.warnings;
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        };
      }

      case 'bbmodel_extract': {
        const sections = parseSections(args['sections'] as string[] | undefined);
        const file = String(args['file']);
        const model = await readModelFile(file);
        const conflict: ConflictStrategy =
          (args['overwrite'] as boolean | undefined) === true ? 'overwrite' : 'unique';
        const outDir =
          (args['out_dir'] as string | undefined) ??
          path.join(path.dirname(file), `${sanitizeFileName(model.name, 'model')}_extracted`);

        const summary = await extractBBModel({
          model,
          sourcePath: file,
          outDir,
          io: new NodeFileIO(),
          log: nullLogger,
          options: {
            sections,
            prettyJson: (args['pretty_json'] as boolean | undefined) ?? true,
            conflict,
          },
        });

        const payload = {
          sourceFile: summary.sourceFile,
          outDir: summary.outDir,
          durationMs: summary.durationMs,
          files: summary.artifacts.map((artifact) => ({
            path: path.join(summary.outDir, artifact.path),
            kind: artifact.kind,
            lossy: artifact.lossy,
            notes: artifact.notes,
          })),
          warnings: summary.warnings,
          inventory: summary.inventory,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        };
      }

      case 'bbmodel_render': {
        const file = String(args['file']);
        const content = await fsp.readFile(file, 'utf-8');
        const width = normalizeSize(args['width'], 'width');
        const height = normalizeSize(args['height'], 'height') ?? width ?? undefined;
        const padding = requireNumberInRange(args['padding'], 'padding', { min: 0.5, max: 4 });
        const request = {
          content,
          name: path.basename(file, '.bbmodel'),
          width: width ?? undefined,
          height,
          direction: resolveDirectionArgs({
            direction: args['direction'] as string | undefined,
            yaw: args['yaw'] as number | undefined,
            elevation: args['elevation'] as number | undefined,
          }),
          padding,
        };
        const renderer = getRenderInstance();
        const result = await renderer.render(request);

        let out = (args['out'] as string | undefined)
          ? path.resolve(String(args['out']))
          : path.join(path.dirname(file), `${sanitizeFileName(request.name, 'model')}_render.png`);
        if (args['overwrite'] !== true) out = await uniqueOutputPath(out);
        await fsp.mkdir(path.dirname(out), { recursive: true });
        await fsp.writeFile(out, result.png);

        return {
          content: [
            {
              type: 'image' as const,
              data: Buffer.from(result.png).toString('base64'),
              mimeType: 'image/png',
            },
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  outFile: out,
                  width: result.width,
                  height: result.height,
                  attempts: result.attempts,
                  margins: result.margins,
                  camera: result.camera,
                  box: result.box,
                  warnings: result.warnings,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return errorResult(new Error(`Unknown tool: ${name}`));
    }
  } catch (error) {
    return errorResult(error);
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('bbmodel-mcp failed to start:', error);
  process.exit(1);
});
