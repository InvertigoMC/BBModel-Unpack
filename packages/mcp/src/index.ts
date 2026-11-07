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
} from '@bbmodels-tools/core';

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
