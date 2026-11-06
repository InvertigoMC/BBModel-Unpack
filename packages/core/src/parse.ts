import {
  BBElement,
  BBGroup,
  BBModelFile,
  BBOutlinerNode,
  NormalizedGroup,
  NormalizedModel,
  NormalizedNode,
} from './types';
import { compareVersions, toNumber, toVec3 } from './mathUtil';

export class BBModelError extends Error {
  constructor(
    message: string,

    public readonly code: 'parse' | 'unsupported' | 'shape' | 'io'
  ) {
    super(message);
    this.name = 'BBModelError';
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseBBModelText(text: string): BBModelFile {
  const content = stripBom(text).trimStart();

  if (content.startsWith('<lz>')) {
    throw new BBModelError(
      'This file is an LZUTF8-compressed Blockbench backup ("<lz>" header). ' +
        'Open it in Blockbench and re-save it as a regular .bbmodel file, then extract again.',
      'unsupported'
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new BBModelError(`The file is not valid JSON: ${detail}`, 'parse');
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new BBModelError('The file is valid JSON but its root is not an object.', 'shape');
  }

  const model = data as BBModelFile;

  const looksLikeBBModel =
    (typeof model.meta === 'object' && model.meta !== null) ||
    Array.isArray(model.elements) ||
    Array.isArray(model.cubes) ||
    Array.isArray(model.outliner) ||
    Array.isArray(model.textures);
  if (!looksLikeBBModel) {
    throw new BBModelError(
      'The file does not look like a Blockbench project: it has no "meta" header and none of ' +
        'the expected sections (elements, outliner, textures).',
      'shape'
    );
  }

  return model;
}

export function applyCompatibility(model: BBModelFile): string[] {
  const notes: string[] = [];
  const meta = (model.meta ??= {});
  const version = typeof meta.format_version === 'string' ? meta.format_version : '0';

  if (!meta.model_format) {
    meta.model_format = meta.bone_rig ? 'bedrock_old' : 'java_block';
    notes.push(
      `The file has no meta.model_format; assumed "${meta.model_format}" (legacy Blockbench behavior).`
    );
  }

  if (Array.isArray(model.cubes) && !Array.isArray(model.elements)) {
    model.elements = model.cubes;
    notes.push('Legacy "cubes" array migrated to "elements".');
  }

  if (model.geometry_name && !model.model_identifier) {
    model.model_identifier = String(model.geometry_name);
  }

  if (
    Array.isArray(model.elements) &&
    meta.box_uv &&
    compareVersions(version, '4.5') < 0
  ) {
    for (const element of model.elements) {
      if (element && element.shade === false && element.mirror_uv === undefined) {
        element.mirror_uv = true;
      }
    }
    notes.push('Legacy box-UV mirroring ("shade": false) migrated to "mirror_uv".');
  }

  if (Array.isArray(model.outliner) && compareVersions(version, '3.2') < 0 && version !== '0') {
    const flipZ = (nodes: BBOutlinerNode[]): void => {
      for (const node of nodes) {
        if (typeof node === 'object' && node !== null) {
          if (Array.isArray(node.rotation) && typeof node.rotation[2] === 'number') {
            node.rotation[2] *= -1;
          }
          if (Array.isArray(node.children)) flipZ(node.children);
        }
      }
    };
    flipZ(model.outliner);
    notes.push('Pre-3.2 outliner Z rotations un-inverted (Blockbench compatibility fix).');
  }

  return notes;
}

const ELEMENT_TYPES = new Set([
  'cube',
  'mesh',
  'locator',
  'null_object',
  'texture_mesh',
  'billboard',
  'spline_mesh',
]);

export function elementType(element: BBElement): string {
  const t = typeof element.type === 'string' ? element.type : 'cube';
  return ELEMENT_TYPES.has(t) ? t : t;
}

function normalizeGroup(
  data: BBGroup,
  groupsByUuid: Map<string, BBGroup>,
  elementsByUuid: Map<string, BBElement>,
  warnings: string[],
  seen: Set<string>
): NormalizedGroup {
  const uuid = typeof data.uuid === 'string' ? data.uuid : `synthetic-${seen.size}`;
  const group: NormalizedGroup = {
    uuid,
    name: typeof data.name === 'string' && data.name.length ? data.name : 'group',
    origin: toVec3(data.origin),
    rotation: toVec3(data.rotation),
    bedrockBinding:
      typeof data.bedrock_binding === 'string' && data.bedrock_binding.length
        ? data.bedrock_binding
        : undefined,
    material: typeof data.material === 'string' && data.material.length ? data.material : undefined,
    mirrorUv: data.mirror_uv === true,
    reset: data.reset === true,
    export: data.export !== false,
    children: [],
  };

  const childNodes = Array.isArray(data.children) ? data.children : [];
  for (const child of childNodes) {
    const node = normalizeNode(child, groupsByUuid, elementsByUuid, warnings, seen);
    if (node) group.children.push(node);
  }
  return group;
}

function normalizeNode(
  node: BBOutlinerNode,
  groupsByUuid: Map<string, BBGroup>,
  elementsByUuid: Map<string, BBElement>,
  warnings: string[],
  seen: Set<string>
): NormalizedNode | undefined {
  if (typeof node === 'string') {
    if (elementsByUuid.has(node)) return { kind: 'element', uuid: node };
    const groupData = groupsByUuid.get(node);
    if (groupData) {
      if (seen.has(node)) return undefined;
      seen.add(node);
      return { kind: 'group', group: normalizeGroup(groupData, groupsByUuid, elementsByUuid, warnings, seen) };
    }
    warnings.push(`Outliner references unknown uuid "${node}"; entry skipped.`);
    return undefined;
  }

  if (typeof node !== 'object' || node === null) return undefined;

  const uuid = typeof node.uuid === 'string' ? node.uuid : undefined;
  const referenced = uuid ? groupsByUuid.get(uuid) : undefined;
  if (referenced && node.name === undefined) {
    if (uuid && seen.has(uuid)) return undefined;
    if (uuid) seen.add(uuid);
    const merged: BBGroup = { ...referenced, children: node.children ?? [] };
    return {
      kind: 'group',
      group: normalizeGroup(merged, groupsByUuid, elementsByUuid, warnings, seen),
    };
  }
  if (uuid && elementsByUuid.has(uuid) && node.children === undefined) {
    return { kind: 'element', uuid };
  }
  if (uuid) seen.add(uuid);
  return { kind: 'group', group: normalizeGroup(node, groupsByUuid, elementsByUuid, warnings, seen) };
}

export function normalizeModel(model: BBModelFile): NormalizedModel {
  const warnings = applyCompatibility(model);
  const meta = model.meta ?? {};

  const elements: BBElement[] = Array.isArray(model.elements)
    ? model.elements.filter((e): e is BBElement => typeof e === 'object' && e !== null)
    : [];
  const elementsByUuid = new Map<string, BBElement>();
  for (const element of elements) {
    if (typeof element.uuid === 'string') {
      if (elementsByUuid.has(element.uuid)) {
        warnings.push(`Duplicate element uuid "${element.uuid}"; the first occurrence wins.`);
      } else {
        elementsByUuid.set(element.uuid, element);
      }
    }
  }

  const groupsByUuid = new Map<string, BBGroup>();
  if (Array.isArray(model.groups)) {
    for (const group of model.groups) {
      if (typeof group === 'object' && group !== null && typeof group.uuid === 'string') {
        groupsByUuid.set(group.uuid, group);
      }
    }
  }

  const rootNodes: NormalizedNode[] = [];
  const seen = new Set<string>();
  if (Array.isArray(model.outliner)) {
    for (const node of model.outliner) {
      const normalized = normalizeNode(node, groupsByUuid, elementsByUuid, warnings, seen);
      if (normalized) rootNodes.push(normalized);
    }
  } else if (elements.length) {
    warnings.push('The file has elements but no outliner; all elements treated as root-level.');
    for (const element of elements) {
      if (typeof element.uuid === 'string') rootNodes.push({ kind: 'element', uuid: element.uuid });
    }
  }

  const referenced = new Set<string>();
  const collect = (nodes: NormalizedNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'element') referenced.add(node.uuid);
      else collect(node.group.children);
    }
  };
  collect(rootNodes);
  const orphans = [...elementsByUuid.keys()].filter((uuid) => !referenced.has(uuid));
  if (orphans.length) {
    warnings.push(
      `${orphans.length} element(s) are not referenced by the outliner; they are kept in the raw export ` +
        'but excluded from converted geometry.'
    );
  }

  const name =
    (typeof model.name === 'string' && model.name.trim()) ||
    (typeof model.model_identifier === 'string' && model.model_identifier.trim()) ||
    'model';

  return {
    raw: model,
    formatVersion: typeof meta.format_version === 'string' ? meta.format_version : 'unknown',
    modelFormat: typeof meta.model_format === 'string' ? meta.model_format : 'unknown',
    boxUv: meta.box_uv === true,
    name,
    identifier: typeof model.model_identifier === 'string' ? model.model_identifier : '',
    resolution: {
      width: toNumber(model.resolution?.width, 16) || 16,
      height: toNumber(model.resolution?.height, 16) || 16,
    },
    elements,
    elementsByUuid,
    rootNodes,
    textures: Array.isArray(model.textures)
      ? model.textures.filter((t): t is NonNullable<typeof t> => typeof t === 'object' && t !== null)
      : [],
    animations: Array.isArray(model.animations)
      ? model.animations.filter((a): a is NonNullable<typeof a> => typeof a === 'object' && a !== null)
      : [],
    controllers: Array.isArray(model.animation_controllers)
      ? model.animation_controllers.filter(
          (c): c is NonNullable<typeof c> => typeof c === 'object' && c !== null
        )
      : [],
    display:
      typeof model.display === 'object' && model.display !== null && !Array.isArray(model.display)
        ? (model.display as Record<string, unknown>)
        : undefined,
    warnings,
  };
}

export function loadBBModel(text: string): NormalizedModel {
  return normalizeModel(parseBBModelText(text));
}
