/**
 * Type declarations for the parts of a Blockbench `.bbmodel` project file that
 * this extension understands.
 *
 * A `.bbmodel` is a plain JSON document saved by Blockbench's "project" codec
 * (`js/formats/bbmodel.js` in the Blockbench source). The container format has
 * evolved over the years (meta.format_version "3.x" → "5.0"), so every field
 * here is optional and all consumers go through the tolerant accessors in
 * `parse.ts` rather than trusting these shapes blindly.
 */

/** A 3-component vector. Blockbench sometimes stores fewer/extra entries. */
export type Vec3 = [number, number, number];

/** Blockbench face keys for cubes. */
export const FACE_KEYS = ['north', 'east', 'south', 'west', 'up', 'down'] as const;
export type FaceKey = (typeof FACE_KEYS)[number];

/** `meta` header of a .bbmodel file. */
export interface BBMeta {
  /** Version of the *container* format (e.g. "4.5", "5.0") — not the Minecraft format. */
  format_version?: string;
  /** Blockbench format id, e.g. "bedrock", "java_block", "free", "bedrock_old". */
  model_format?: string;
  /** Project-wide box UV flag (per-element `box_uv` overrides it since 4.5). */
  box_uv?: boolean;
  /** Present in automatic backup files. */
  backup?: boolean;
  /** Legacy (pre-model_format) marker for bedrock_old projects. */
  bone_rig?: boolean;
  [key: string]: unknown;
}

/** One face of a cube element. */
export interface BBFace {
  /** [x1, y1, x2, y2] in texture pixels. */
  uv?: number[];
  /** Index into the `textures` array, or null when the face is untextured. */
  texture?: number | string | null;
  /** Per-face UV rotation in degrees (0/90/180/270), newer feature. */
  rotation?: number;
  /** Bedrock material instance name. */
  material_name?: string;
  tint?: number;
  cullface?: string;
  [key: string]: unknown;
}

/**
 * An entry of the top-level `elements` array. `type` distinguishes cubes,
 * meshes, locators, null objects and texture meshes; legacy files omit it
 * (implying "cube").
 */
export interface BBElement {
  type?: string;
  uuid?: string;
  name?: string;
  from?: number[];
  to?: number[];
  origin?: number[];
  rotation?: number[];
  inflate?: number;
  box_uv?: boolean;
  uv_offset?: number[];
  mirror_uv?: boolean;
  /** Pre-4.5 box-UV files stored mirroring as `shade: false`. */
  shade?: boolean;
  rescale?: boolean;
  export?: boolean;
  visibility?: boolean;
  locked?: boolean;
  faces?: Partial<Record<FaceKey, BBFace>>;
  /** Locator / null object position. */
  position?: number[];
  ignore_inherited_scale?: boolean;
  /** Mesh data: vertex key → [x, y, z]. */
  vertices?: Record<string, number[]>;
  /** Texture mesh reference. */
  texture_name?: string;
  local_pivot?: number[];
  scale?: number[];
  [key: string]: unknown;
}

/**
 * A group ("bone"). In bbmodel ≤ 4.x groups appear inline in the `outliner`
 * tree; since format 5.0 they are stored flat in a top-level `groups` array
 * and the outliner only references them by uuid.
 */
export interface BBGroup {
  uuid?: string;
  name?: string;
  origin?: number[];
  rotation?: number[];
  bedrock_binding?: string;
  material?: string;
  mirror_uv?: boolean;
  reset?: boolean;
  export?: boolean;
  visibility?: boolean;
  isOpen?: boolean;
  autouv?: number;
  color?: number;
  children?: BBOutlinerNode[];
  [key: string]: unknown;
}

/**
 * Outliner tree node: either an element uuid string, an inline group object
 * (legacy), or a `{uuid, children}` reference into the `groups` array (5.0+).
 */
export type BBOutlinerNode = string | BBGroup;

/** A texture entry. Embedded textures carry a base64 data URL in `source`. */
export interface BBTexture {
  uuid?: string;
  name?: string;
  id?: string;
  path?: string;
  relative_path?: string;
  folder?: string;
  namespace?: string;
  particle?: boolean;
  render_mode?: string;
  visible?: boolean;
  mode?: string;
  saved?: boolean;
  internal?: boolean;
  width?: number;
  height?: number;
  uv_width?: number;
  uv_height?: number;
  /** data:image/png;base64,… when the texture is embedded. */
  source?: string;
  frame_time?: number;
  frame_order_type?: string;
  frame_order?: string;
  frame_interpolate?: boolean;
  layers_enabled?: boolean;
  layers?: BBTextureLayer[];
  [key: string]: unknown;
}

export interface BBTextureLayer {
  uuid?: string;
  name?: string;
  data_url?: string;
  visible?: boolean;
  opacity?: number;
  blend_mode?: string;
  offset?: number[];
  [key: string]: unknown;
}

/** One animation keyframe data point (values may be numbers or Molang strings). */
export interface BBKeyframeDataPoint {
  x?: number | string;
  y?: number | string;
  z?: number | string;
  /** Effect keyframes. */
  effect?: string;
  locator?: string;
  script?: string;
  file?: string;
  bind_to_actor?: boolean;
  [key: string]: unknown;
}

export interface BBKeyframe {
  channel?: string;
  time?: number;
  interpolation?: string;
  uniform?: boolean;
  data_points?: BBKeyframeDataPoint[];
  bezier_linked?: boolean;
  bezier_left_time?: number[];
  bezier_left_value?: number[];
  bezier_right_time?: number[];
  bezier_right_value?: number[];
  [key: string]: unknown;
}

export interface BBAnimator {
  name?: string;
  /** "bone" (default), "effect", … */
  type?: string;
  rotation_global?: boolean;
  keyframes?: BBKeyframe[];
  [key: string]: unknown;
}

export interface BBAnimation {
  uuid?: string;
  name?: string;
  /** "once" | "loop" | "hold" */
  loop?: string;
  override?: boolean;
  length?: number;
  snapping?: number;
  anim_time_update?: string;
  blend_weight?: string;
  start_delay?: string;
  loop_delay?: string;
  /** Keyed by bone uuid, plus the special "effects" animator. */
  animators?: Record<string, BBAnimator>;
  [key: string]: unknown;
}

export interface BBControllerStateAnimation {
  uuid?: string;
  key?: string;
  animation?: string;
  blend_value?: string;
  [key: string]: unknown;
}

export interface BBControllerTransition {
  uuid?: string;
  target?: string;
  condition?: string;
  [key: string]: unknown;
}

export interface BBControllerState {
  uuid?: string;
  name?: string;
  animations?: BBControllerStateAnimation[];
  transitions?: BBControllerTransition[];
  sounds?: Array<{ effect?: string; [key: string]: unknown }>;
  particles?: Array<{
    effect?: string;
    locator?: string;
    pre_effect_script?: string;
    bind_to_actor?: boolean;
    [key: string]: unknown;
  }>;
  on_entry?: string;
  on_exit?: string;
  blend_transition?: number;
  blend_transition_curve?: Record<string, number>;
  blend_via_shortest_path?: boolean;
  [key: string]: unknown;
}

export interface BBAnimationController {
  uuid?: string;
  name?: string;
  initial_state?: string;
  states?: BBControllerState[];
  [key: string]: unknown;
}

/** The root of a parsed .bbmodel document. */
export interface BBModelFile {
  meta?: BBMeta;
  name?: string;
  model_identifier?: string;
  /** Legacy alias of model_identifier. */
  geometry_name?: string;
  credit?: string;
  parent?: string;
  ambientocclusion?: boolean;
  front_gui_light?: boolean;
  visible_box?: number[];
  resolution?: { width?: number; height?: number };
  elements?: BBElement[];
  /** Very old files used `cubes` instead of `elements`. */
  cubes?: BBElement[];
  /** Flat group list (bbmodel 5.0+). */
  groups?: BBGroup[];
  outliner?: BBOutlinerNode[];
  textures?: BBTexture[];
  texture_groups?: unknown[];
  animations?: BBAnimation[];
  animation_controllers?: BBAnimationController[];
  animation_variable_placeholders?: string;
  variable_placeholders?: string;
  display?: Record<string, unknown>;
  overrides?: unknown;
  fonts?: unknown;
  backgrounds?: unknown;
  reference_images?: unknown[];
  history?: unknown[];
  editor_state?: unknown;
  export_options?: unknown;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------------- */
/* Normalized model — what the converters actually consume                    */
/* ------------------------------------------------------------------------- */

/** A group after normalization (legacy inline & 5.0 flat formats unified). */
export interface NormalizedGroup {
  uuid: string;
  name: string;
  origin: Vec3;
  rotation: Vec3;
  bedrockBinding?: string;
  material?: string;
  mirrorUv: boolean;
  reset: boolean;
  export: boolean;
  children: NormalizedNode[];
}

export type NormalizedNode =
  | { kind: 'group'; group: NormalizedGroup }
  | { kind: 'element'; uuid: string };

export interface NormalizedModel {
  /** The raw parsed document (post legacy-migration, pre conversion). */
  raw: BBModelFile;
  /** Container format version string, "unknown" when absent. */
  formatVersion: string;
  modelFormat: string;
  boxUv: boolean;
  /** Human-readable project name. */
  name: string;
  /** Bedrock geometry identifier body (without the "geometry." prefix). */
  identifier: string;
  resolution: { width: number; height: number };
  elements: BBElement[];
  elementsByUuid: Map<string, BBElement>;
  /** Normalized outliner tree (root level). */
  rootNodes: NormalizedNode[];
  textures: BBTexture[];
  animations: BBAnimation[];
  controllers: BBAnimationController[];
  display?: Record<string, unknown>;
  /** Non-fatal oddities discovered while normalizing. */
  warnings: string[];
}
