import * as path from 'node:path';
import { NormalizedModel } from './types';
import { buildInventory, ModelInventory } from './inspect';
import { convertToBedrockGeometry } from './geometry';
import { convertAnimationsToBedrock } from './animations';
import { convertControllersToBedrock } from './controllers';
import { decodeTextures } from './textures';
import { sanitizeFileName } from './names';
import { ConflictStrategy, FileIO, safeWriteFile } from './fileio';

export type ExtractSection = 'geometry' | 'animations' | 'controllers' | 'textures' | 'display';

export const ALL_SECTIONS: ExtractSection[] = [
  'geometry',
  'animations',
  'controllers',
  'textures',
  'display',
];

export interface ExtractionOptions {
  sections: ExtractSection[];
  prettyJson: boolean;
  conflict: ConflictStrategy;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface ProgressSink {
  report(message: string): void;
}

export interface CancelToken {
  readonly isCancellationRequested: boolean;
}

export class ExtractionCancelledError extends Error {
  constructor() {
    super('Extraction was cancelled.');
    this.name = 'ExtractionCancelledError';
  }
}

export interface ArtifactRecord {

  path: string;
  kind: string;

  source: string;

  transform: string;

  lossy: boolean;
  bytes: number;
  notes: string[];
}

export interface ExtractionSummary {
  outDir: string;
  sourceFile: string;
  artifacts: ArtifactRecord[];
  warnings: string[];
  inventory: ModelInventory;
  durationMs: number;
}

export interface ExtractionInput {
  model: NormalizedModel;

  sourcePath: string;
  outDir: string;
  io: FileIO;
  log: Logger;
  options: ExtractionOptions;
  progress?: ProgressSink;
  token?: CancelToken;
}

const textEncoder = new TextEncoder();

function encodeJson(value: unknown, pretty: boolean): Uint8Array {
  return textEncoder.encode(pretty ? JSON.stringify(value, null, '\t') + '\n' : JSON.stringify(value));
}

export async function extractBBModel(input: ExtractionInput): Promise<ExtractionSummary> {
  const { model, io, log, options } = input;
  const started = Date.now();
  const warnings: string[] = [...model.warnings];
  const artifacts: ArtifactRecord[] = [];
  const inventory = buildInventory(model);
  const wants = new Set(options.sections);

  const checkCancelled = (): void => {
    if (input.token?.isCancellationRequested) throw new ExtractionCancelledError();
  };
  const step = (message: string): void => {
    checkCancelled();
    input.progress?.report(message);
    log.info(message);
  };

  const writeArtifact = async (
    relativeDir: string,
    fileName: string,
    data: Uint8Array,
    record: Omit<ArtifactRecord, 'path' | 'bytes'>
  ): Promise<void> => {
    const directory = relativeDir ? path.join(input.outDir, relativeDir) : input.outDir;
    const outcome = await safeWriteFile(io, directory, fileName, data, options.conflict);
    const relativePath = (relativeDir ? `${relativeDir}/` : '') + outcome.fileName;
    const notes = [...record.notes];
    if (outcome.renamed) {
      notes.push(`Renamed from "${fileName}" because a file with that name already existed.`);
      log.warn(`"${fileName}" existed; wrote "${outcome.fileName}" instead.`);
    }
    if (outcome.overwrote) {
      notes.push('Overwrote an existing file with the same name.');
      log.warn(`Overwrote existing file "${relativePath}".`);
    }
    artifacts.push({ ...record, notes, path: relativePath, bytes: data.byteLength });
    log.info(`Wrote ${relativePath} (${data.byteLength} bytes)`);
  };

  await io.mkdirp(input.outDir);

  if (wants.has('geometry')) {
    step('Converting geometry to Bedrock geo.json…');
    const geometry = convertToBedrockGeometry(model);
    warnings.push(...geometry.warnings);
    if (geometry.file) {
      await writeArtifact('bedrock', 'geometry.json', encodeJson(geometry.file, options.prettyJson), {
        kind: 'bedrock-geometry',
        source: 'elements[] (cubes, locators, texture meshes) + outliner[]/groups[] hierarchy + resolution + visible_box',
        transform:
          `Rebuilt as minecraft:geometry (format_version ${geometry.formatVersion}) the way Blockbench exports it: ` +
          'X axis mirrored (origin.x = -to.x, pivots negate X, rotations negate X/Y), box-UV offsets or per-face ' +
          'uv/uv_size (up/down faces flipped), bones from groups with pivot/rotation/binding/mirror preserved, ' +
          `${geometry.boneCount} bones / ${geometry.cubeCount} cubes / ${geometry.locatorCount} locators.`,
        lossy: geometry.skipped.meshes > 0 || geometry.skipped.other > 0,
        notes: [],
      });
    } else if (model.elements.length || model.rootNodes.length) {
      warnings.push('Geometry conversion produced no bones; no .geo.json was written.');
    } else {
      log.info('No geometry present; skipping geo.json.');
    }
  }

  if (wants.has('animations')) {
    step('Converting animations…');
    const animations = convertAnimationsToBedrock(model);
    warnings.push(...animations.warnings);
    if (animations.file) {
      await writeArtifact(
        'bedrock',
        'animations.json',
        encodeJson(animations.file, options.prettyJson),
        {
          kind: 'bedrock-animations',
          source: 'animations[] (keyframes per bone animator, effect animators)',
          transform:
            'Compiled to a Bedrock animation file (format_version 1.8.0): keyframes keyed by snapped timecodes, ' +
            'position X and rotation X/Y negated back into Bedrock space, catmullrom/step/pre-post semantics ' +
            `preserved, sound/particle/timeline effect keyframes included. Animations: ${animations.names.join(', ')}.`,
          lossy: animations.warnings.length > 0,
          notes: [],
        }
      );
    } else {
      log.info('No animations present; skipping animation.json.');
    }
  }

  if (wants.has('controllers')) {
    step('Converting animation controllers…');
    const controllers = convertControllersToBedrock(model.controllers);
    warnings.push(...controllers.warnings);
    if (controllers.file) {
      await writeArtifact(
        'bedrock',
        'animation_controllers.json',
        encodeJson(controllers.file, options.prettyJson),
        {
          kind: 'bedrock-animation-controllers',
          source: 'animation_controllers[] (states, transitions, blend settings)',
          transform:
            'Compiled to a Bedrock animation controller file (format_version 1.19.0): states keyed by name, ' +
            'transitions as {target: condition}, on_entry/on_exit split into Molang instruction lines. ' +
            `Controllers: ${controllers.names.join(', ')}.`,
          lossy: false,
          notes: [],
        }
      );
    } else {
      log.info('No animation controllers present; skipping.');
    }
  }

  if (wants.has('textures')) {
    step('Decoding textures…');
    const textures = decodeTextures(model.textures);
    warnings.push(...textures.warnings);
    const sourceDir = path.dirname(input.sourcePath);

    for (const item of textures.items) {
      checkCancelled();
      let bytes = item.bytes;
      let origin = 'embedded base64 data URL in textures[].source';
      if (!bytes && item.relativePath) {
        const resolved = path.resolve(sourceDir, item.relativePath);
        try {
          bytes = await io.readFile(resolved);
          origin = `external file referenced by textures[].relative_path (${resolved})`;
          log.info(`Texture "${item.originalName}" copied from ${resolved}`);
        } catch {
          warnings.push(
            `Texture "${item.originalName}" is not embedded and its relative path could not be read: ${resolved}`
          );
        }
      } else if (!bytes && item.externalPath) {
        warnings.push(
          `Texture "${item.originalName}" is not embedded; it references an absolute path on the authoring ` +
            `machine (${item.externalPath}) which was not copied. Re-save the model in Blockbench with ` +
            '"embed textures" enabled to include it.'
        );
      }
      if (!bytes) continue;

      await writeArtifact('textures', item.fileName, bytes, {
        kind: 'texture',
        source: origin,
        transform: 'Base64 payload decoded to the original image bytes (no re-encoding).',
        lossy: false,
        notes: item.notes,
      });
      if (item.mcmeta) {
        await writeArtifact('textures', `${item.fileName}.mcmeta`, encodeJson(item.mcmeta, options.prettyJson), {
          kind: 'texture-mcmeta',
          source: 'textures[].frame_time / frame_order / frame_interpolate',
          transform:
            'Rewritten as a Java Edition .mcmeta animation section. Approximate: Blockbench flipbook settings ' +
            'and Java animation metadata do not map one-to-one.',
          lossy: true,
          notes: [],
        });
      }
      for (const layer of item.layers) {
        await writeArtifact(
          `textures/layers/${sanitizeFileName(item.fileName.replace(/\.[^.]+$/, ''), 'texture')}`,
          layer.fileName,
          layer.bytes,
          {
            kind: 'texture-layer',
            source: 'textures[].layers[].data_url',
            transform: 'Layer image decoded from base64 (composited result is the main texture file).',
            lossy: false,
            notes: [],
          }
        );
      }
    }
  }

  if (wants.has('display') && model.display) {
    step('Extracting display settings…');
    await writeArtifact(
      'display',
      'display.json',
      encodeJson({ display: model.display }, options.prettyJson),
      {
        kind: 'java-display-settings',
        source: 'display (thirdperson/firstperson/gui/ground/fixed/head slots)',
        transform:
          'Copied verbatim, wrapped as {"display": …} so it can be merged into a Java Edition item/block model. ' +
          'Values are already in vanilla format; no conversion needed.',
        lossy: false,
        notes: [],
      }
    );
  }

  const summary: ExtractionSummary = {
    outDir: input.outDir,
    sourceFile: input.sourcePath,
    artifacts,
    warnings,
    inventory,
    durationMs: Date.now() - started,
  };
  log.info(
    `Extraction finished: ${artifacts.length} artifact(s), ${warnings.length} warning(s), ${summary.durationMs} ms.`
  );
  for (const warning of warnings) log.warn(warning);
  return summary;
}
