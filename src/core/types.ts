export type Vec3 = [number, number, number];

export const FACE_KEYS = ['north', 'east', 'south', 'west', 'up', 'down'] as const;
export type FaceKey = (typeof FACE_KEYS)[number];

export interface BBMeta {

  format_version?: string;

  model_format?: string;

  box_uv?: boolean;

  backup?: boolean;

  bone_rig?: boolean;
  [key: string]: unknown;
}

export interface BBFace {

  uv?: number[];

  texture?: number | string | null;

  rotation?: number;

  material_name?: string;
  tint?: number;
  cullface?: string;
  [key: string]: unknown;
}

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

  shade?: boolean;
  rescale?: boolean;
  export?: boolean;
  visibility?: boolean;
  locked?: boolean;
  faces?: Partial<Record<FaceKey, BBFace>>;

  position?: number[];
  ignore_inherited_scale?: boolean;

  vertices?: Record<string, number[]>;

  texture_name?: string;
  local_pivot?: number[];
  scale?: number[];
  [key: string]: unknown;
}

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

export type BBOutlinerNode = string | BBGroup;

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

export interface BBKeyframeDataPoint {
  x?: number | string;
  y?: number | string;
  z?: number | string;

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

  type?: string;
  rotation_global?: boolean;
  keyframes?: BBKeyframe[];
  [key: string]: unknown;
}

export interface BBAnimation {
  uuid?: string;
  name?: string;

  loop?: string;
  override?: boolean;
  length?: number;
  snapping?: number;
  anim_time_update?: string;
  blend_weight?: string;
  start_delay?: string;
  loop_delay?: string;

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

export interface BBModelFile {
  meta?: BBMeta;
  name?: string;
  model_identifier?: string;

  geometry_name?: string;
  credit?: string;
  parent?: string;
  ambientocclusion?: boolean;
  front_gui_light?: boolean;
  visible_box?: number[];
  resolution?: { width?: number; height?: number };
  elements?: BBElement[];

  cubes?: BBElement[];

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

  raw: BBModelFile;

  formatVersion: string;
  modelFormat: string;
  boxUv: boolean;

  name: string;

  identifier: string;
  resolution: { width: number; height: number };
  elements: BBElement[];
  elementsByUuid: Map<string, BBElement>;

  rootNodes: NormalizedNode[];
  textures: BBTexture[];
  animations: BBAnimation[];
  controllers: BBAnimationController[];
  display?: Record<string, unknown>;

  warnings: string[];
}
