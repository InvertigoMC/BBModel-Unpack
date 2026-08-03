/**
 * Blockbench project -> Minecraft Bedrock `.geo.json` conversion.
 *
 * This reimplements the compile path of Blockbench's Bedrock codec
 * (`js/formats/bedrock/bedrock.js`) so the output matches what Blockbench
 * itself exports:
 *
 * - Blockbench's X axis is mirrored relative to Bedrock model space, so
 *   cube `origin.x` becomes `-to.x`, pivots negate X, and rotations negate
 *   X and Y (Z keeps its sign).
 * - Box-UV cubes export `uv: [u, v]` (the uv_offset); per-face UV cubes
 *   export `uv: {face: {uv, uv_size}}` with the up/down faces flipped to the
 *   opposite corner, matching the Bedrock convention.
 * - Loose elements at the outliner root are gathered into a synthetic
 *   "bb_main" bone, exactly like Blockbench does.
 * - format_version is 1.12.0, raised to 1.16.0 when a bone uses a Bedrock
 *   binding and to 1.21.0 when any face uses UV rotation.
 *
 * Free-form meshes cannot be represented in the Bedrock geometry schema
 * (its `poly_mesh` is experimental and Blockbench does not export it), so
 * they are counted and reported instead of silently dropped.
 */

import {
  BBElement,
  BBFace,
  FACE_KEYS,
  NormalizedGroup,
  NormalizedModel,
  NormalizedNode,
  Vec3,
} from './types';
import { cleanNumber, toNumber, toVec3, vecAllEqual } from './mathUtil';
import { sanitizeIdentifier } from './names';
import { elementType } from './parse';

interface BedrockCubeFaceUv {
  uv: [number, number];
  uv_size: [number, number];
  uv_rotation?: number;
  material_instance?: string;
}

interface BedrockCube {
  origin: Vec3;
  size: Vec3;
  inflate?: number;
  pivot?: Vec3;
  rotation?: Vec3;
  uv?: [number, number] | Partial<Record<string, BedrockCubeFaceUv>>;
  mirror?: boolean;
}

interface BedrockTextureMesh {
  texture: string;
  position: Vec3;
  rotation?: Vec3;
  local_pivot?: Vec3;
  scale?: Vec3;
}

interface BedrockBone {
  name: string;
  parent?: string;
  pivot: Vec3;
  rotation?: Vec3;
  binding?: string;
  reset?: boolean;
  mirror?: boolean;
  material?: string;
  cubes?: BedrockCube[];
  locators?: Record<string, Vec3 | { offset: Vec3; rotation?: Vec3; ignore_inherited_scale?: boolean }>;
  texture_meshes?: BedrockTextureMesh[];
}

export interface GeometryResult {
  /** The complete geo.json document, or null when there is nothing to convert. */
  file: Record<string, unknown> | null;
  formatVersion: string;
  identifier: string;
  boneCount: number;
  cubeCount: number;
  locatorCount: number;
  skipped: { meshes: number; other: number };
  warnings: string[];
}

function cleanVec(vec: Vec3): Vec3 {
  return [cleanNumber(vec[0]), cleanNumber(vec[1]), cleanNumber(vec[2])];
}

/** Mirrors `compileCube` in Blockbench's Bedrock codec. */
function compileCube(
  cube: BBElement,
  boneMirror: boolean,
  projectBoxUv: boolean,
  warnings: string[],
  counters: { uvRotation: boolean; rescale: boolean }
): BedrockCube {
  const from = toVec3(cube.from);
  const to = toVec3(cube.to);
  const size: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  // -(from.x + size.x) === -to.x, computed directly to avoid float noise.
  const origin: Vec3 = [-to[0], from[1], from[2]];

  const template: BedrockCube = {
    origin: cleanVec(origin),
    size: cleanVec(size),
  };
  const inflate = toNumber(cube.inflate, 0);
  if (inflate) template.inflate = cleanNumber(inflate);

  const rotation = toVec3(cube.rotation);
  if (!vecAllEqual(rotation, 0)) {
    const pivot = toVec3(cube.origin);
    template.pivot = cleanVec([-pivot[0], pivot[1], pivot[2]]);
    template.rotation = cleanVec([-rotation[0], -rotation[1], rotation[2]]);
  }

  if (cube.rescale === true) counters.rescale = true;

  const boxUv = cube.box_uv ?? projectBoxUv;
  if (boxUv) {
    const uvOffset = Array.isArray(cube.uv_offset) ? cube.uv_offset : [0, 0];
    template.uv = [cleanNumber(toNumber(uvOffset[0], 0)), cleanNumber(toNumber(uvOffset[1], 0))];
    // Blockbench: emit cube-level mirror only when it differs from the bone's.
    if (cube.mirror_uv === !boneMirror) template.mirror = cube.mirror_uv;
  } else {
    const uv: Partial<Record<string, BedrockCubeFaceUv>> = {};
    const faces = cube.faces ?? {};
    for (const key of FACE_KEYS) {
      const face: BBFace | undefined = faces[key];
      if (!face || face.texture === null) continue;
      const rect = Array.isArray(face.uv) ? face.uv : [0, 0, 0, 0];
      const u0 = toNumber(rect[0], 0);
      const v0 = toNumber(rect[1], 0);
      const u1 = toNumber(rect[2], 0);
      const v1 = toNumber(rect[3], 0);
      const entry: BedrockCubeFaceUv = {
        uv: [cleanNumber(u0), cleanNumber(v0)],
        uv_size: [cleanNumber(u1 - u0), cleanNumber(v1 - v0)],
      };
      if (typeof face.rotation === 'number' && face.rotation) {
        entry.uv_rotation = face.rotation;
        counters.uvRotation = true;
      }
      if (typeof face.material_name === 'string' && face.material_name) {
        entry.material_instance = face.material_name;
      }
      if (key === 'up' || key === 'down') {
        // Bedrock stores up/down UVs from the opposite corner.
        entry.uv = [cleanNumber(entry.uv[0] + entry.uv_size[0]), cleanNumber(entry.uv[1] + entry.uv_size[1])];
        entry.uv_size = [cleanNumber(-entry.uv_size[0]), cleanNumber(-entry.uv_size[1])];
      }
      uv[key] = entry;
    }
    template.uv = uv;
  }
  return template;
}

interface BoneBuildContext {
  model: NormalizedModel;
  bones: BedrockBone[];
  usedBoneNames: Set<string>;
  cubeCount: number;
  locatorCount: number;
  skippedMeshes: number;
  skippedOther: number;
  warnings: string[];
  flags: { uvRotation: boolean; rescale: boolean; binding: boolean };
}

/** True when a non-exported group still has exported descendants (Blockbench keeps those). */
function hasExportedDescendants(group: NormalizedGroup): boolean {
  return group.children.some((child) =>
    child.kind === 'element' ? true : child.group.export || hasExportedDescendants(child.group)
  );
}

/** Mirrors `compileGroup` in Blockbench's Bedrock codec. */
function compileGroup(group: NormalizedGroup, parentName: string | undefined, ctx: BoneBuildContext): void {
  if (!group.export && !hasExportedDescendants(group)) return;

  let name = group.name;
  if (ctx.usedBoneNames.has(name.toLowerCase())) {
    let i = 2;
    while (ctx.usedBoneNames.has(`${name}${i}`.toLowerCase())) i++;
    ctx.warnings.push(
      `Duplicate bone name "${name}" renamed to "${name}${i}" (Bedrock bone names must be unique).`
    );
    name = `${name}${i}`;
  }
  ctx.usedBoneNames.add(name.toLowerCase());

  const bone: BedrockBone = {
    name,
    pivot: cleanVec([-group.origin[0], group.origin[1], group.origin[2]]),
  };
  if (parentName) bone.parent = parentName;
  if (!vecAllEqual(group.rotation, 0)) {
    bone.rotation = cleanVec([-group.rotation[0], -group.rotation[1], group.rotation[2]]);
  }
  if (group.bedrockBinding) {
    bone.binding = group.bedrockBinding;
    ctx.flags.binding = true;
  }
  if (group.reset) bone.reset = true;
  const boneMirror = group.mirrorUv && ctx.model.boxUv;
  if (boneMirror) bone.mirror = true;
  if (group.material) bone.material = group.material;

  const cubes: BedrockCube[] = [];
  const locators: NonNullable<BedrockBone['locators']> = {};
  const textureMeshes: BedrockTextureMesh[] = [];
  const childGroups: NormalizedGroup[] = [];

  for (const child of group.children) {
    if (child.kind === 'group') {
      childGroups.push(child.group);
      continue;
    }
    const element = ctx.model.elementsByUuid.get(child.uuid);
    if (!element || element.export === false) continue;
    const type = elementType(element);

    if (type === 'cube') {
      cubes.push(compileCube(element, boneMirror, ctx.model.boxUv, ctx.warnings, ctx.flags));
      ctx.cubeCount++;
    } else if (type === 'locator' || type === 'null_object') {
      let key = typeof element.name === 'string' && element.name.length ? element.name : 'locator';
      if (type === 'null_object') key = `_null_${key}`;
      const position = toVec3(element.position);
      const offset = cleanVec([-position[0], position[1], position[2]]);
      const rotation = toVec3(element.rotation);
      const rotatable = type === 'locator';
      if ((rotatable && !vecAllEqual(rotation, 0)) || element.ignore_inherited_scale === true) {
        const entry: { offset: Vec3; rotation?: Vec3; ignore_inherited_scale?: boolean } = { offset };
        if (rotatable && !vecAllEqual(rotation, 0)) {
          entry.rotation = cleanVec([-rotation[0], -rotation[1], rotation[2]]);
        }
        if (element.ignore_inherited_scale === true) entry.ignore_inherited_scale = true;
        locators[key] = entry;
      } else {
        locators[key] = offset;
      }
      ctx.locatorCount++;
    } else if (type === 'texture_mesh') {
      const position = toVec3(element.origin);
      const texmesh: BedrockTextureMesh = {
        texture: typeof element.texture_name === 'string' ? element.texture_name : '',
        position: cleanVec([-position[0], -(position[1] - bone.pivot[1]), position[2]]),
      };
      const rotation = toVec3(element.rotation);
      if (!vecAllEqual(rotation, 0)) {
        texmesh.rotation = cleanVec([-rotation[0], -rotation[1], rotation[2]]);
      }
      const localPivot = toVec3(element.local_pivot);
      if (!vecAllEqual(localPivot, 0)) {
        texmesh.local_pivot = cleanVec([localPivot[0], localPivot[1], -localPivot[2]]);
      }
      const scale = toVec3(element.scale, [1, 1, 1]);
      if (!vecAllEqual(scale, 1)) texmesh.scale = cleanVec(scale);
      textureMeshes.push(texmesh);
    } else if (type === 'mesh') {
      ctx.skippedMeshes++;
    } else {
      ctx.skippedOther++;
    }
  }

  if (cubes.length) bone.cubes = cubes;
  if (textureMeshes.length) bone.texture_meshes = textureMeshes;
  if (Object.keys(locators).length) bone.locators = locators;
  ctx.bones.push(bone);

  for (const child of childGroups) compileGroup(child, name, ctx);
}

/**
 * Convert the normalized model into a Bedrock geometry file.
 * Returns `file: null` when the model has no convertible content.
 */
export function convertToBedrockGeometry(model: NormalizedModel): GeometryResult {
  const warnings: string[] = [];
  const ctx: BoneBuildContext = {
    model,
    bones: [],
    usedBoneNames: new Set(),
    cubeCount: 0,
    locatorCount: 0,
    skippedMeshes: 0,
    skippedOther: 0,
    warnings,
    flags: { uvRotation: false, rescale: false, binding: false },
  };

  // Loose elements at the outliner root go into a synthetic "bb_main" bone.
  const looseElements = model.rootNodes.filter((n): n is NormalizedNode & { kind: 'element' } => n.kind === 'element');
  const rootGroups = model.rootNodes.filter((n): n is NormalizedNode & { kind: 'group' } => n.kind === 'group');

  if (looseElements.length) {
    const catchBone: NormalizedGroup = {
      uuid: 'bb_main',
      name: 'bb_main',
      origin: [0, 0, 0],
      rotation: [0, 0, 0],
      mirrorUv: false,
      reset: false,
      export: true,
      children: looseElements,
    };
    compileGroup(catchBone, undefined, ctx);
  }
  for (const node of rootGroups) compileGroup(node.group, undefined, ctx);

  if (!ctx.bones.length) {
    return {
      file: null,
      formatVersion: '1.12.0',
      identifier: '',
      boneCount: 0,
      cubeCount: 0,
      locatorCount: 0,
      skipped: { meshes: ctx.skippedMeshes, other: ctx.skippedOther },
      warnings,
    };
  }

  if (ctx.skippedMeshes) {
    warnings.push(
      `${ctx.skippedMeshes} free-form mesh element(s) cannot be represented in Bedrock geometry and were ` +
        'left out of the .geo.json (edit them in Blockbench or export them as OBJ/glTF from there).'
    );
  }
  if (ctx.skippedOther) {
    warnings.push(
      `${ctx.skippedOther} element(s) of unsupported types were left out of the .geo.json.`
    );
  }
  if (ctx.flags.rescale) {
    warnings.push(
      'Some cubes use "rescale"; Bedrock geometry has no equivalent, so the flag was dropped.'
    );
  }

  // Same escalation rules as Blockbench's getFormatVersion().
  let formatVersion = '1.12.0';
  if (ctx.flags.binding) formatVersion = '1.16.0';
  if (ctx.flags.uvRotation) {
    formatVersion = '1.21.0';
    warnings.push(
      'Per-face UV rotation is used; the geometry was written as format_version 1.21.0, which requires a recent Minecraft Bedrock release.'
    );
  }

  const identifier = sanitizeIdentifier(model.identifier || model.name, 'unknown');
  const description: Record<string, unknown> = {
    identifier: `geometry.${identifier}`,
    texture_width: model.resolution.width,
    texture_height: model.resolution.height,
  };
  const visibleBox = Array.isArray(model.raw.visible_box) ? model.raw.visible_box : undefined;
  if (visibleBox) {
    description.visible_bounds_width = cleanNumber(toNumber(visibleBox[0], 0));
    description.visible_bounds_height = cleanNumber(toNumber(visibleBox[1], 0));
    description.visible_bounds_offset = [0, cleanNumber(toNumber(visibleBox[2], 0)), 0];
  }

  const file = {
    format_version: formatVersion,
    'minecraft:geometry': [
      {
        description,
        bones: ctx.bones,
      },
    ],
  };

  return {
    file,
    formatVersion,
    identifier: `geometry.${identifier}`,
    boneCount: ctx.bones.length,
    cubeCount: ctx.cubeCount,
    locatorCount: ctx.locatorCount,
    skipped: { meshes: ctx.skippedMeshes, other: ctx.skippedOther },
    warnings,
  };
}
