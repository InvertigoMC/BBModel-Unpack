import {
  BBAnimation,
  BBAnimator,
  BBKeyframe,
  NormalizedModel,
  NormalizedNode,
} from './types';
import {
  cleanNumber,
  exportMolang,
  invertMolangValue,
  timecodeString,
  toNumber,
  trimFloat,
} from './mathUtil';

type KeyframeValue = number | string;
type KeyframeArray = KeyframeValue[];

export interface AnimationsResult {

  file: Record<string, unknown> | null;
  count: number;
  names: string[];
  warnings: string[];
}

const TRANSFORM_CHANNELS = ['rotation', 'position', 'scale'] as const;
type TransformChannel = (typeof TRANSFORM_CHANNELS)[number];

function getAxis(kf: BBKeyframe, axis: 'x' | 'y' | 'z', dataPoint: number): KeyframeValue {
  const points = kf.data_points ?? [];
  const index = Math.min(Math.max(dataPoint, 0), Math.max(points.length - 1, 0));
  const raw = points[index]?.[axis];
  if (raw === undefined || raw === null || raw === '') return 0;
  return exportMolang(raw);
}

function getArray(kf: BBKeyframe, dataPoint: number): KeyframeArray {
  return [getAxis(kf, 'x', dataPoint), getAxis(kf, 'y', dataPoint), getAxis(kf, 'z', dataPoint)];
}

function getNumericArray(kf: BBKeyframe, dataPoint: number, fallbackTracker: { molang: boolean }): number[] {
  return getArray(kf, dataPoint).map((v) => {
    if (typeof v === 'number') return v;
    fallbackTracker.molang = true;
    return toNumber(v, 0);
  });
}

interface FlipTracker {
  molangApproximated: boolean;
}

function flipArray(channel: TransformChannel, arr: KeyframeArray, tracker: FlipTracker): KeyframeArray {
  const flipIndex = (i: number) => {
    const { value, approximated } = invertMolangValue(arr[i] as number | string);
    if (approximated) tracker.molangApproximated = true;
    arr[i] = value;
  };
  if (channel === 'position') flipIndex(0);
  if (channel === 'rotation') {
    flipIndex(0);
    flipIndex(1);
  }
  return arr;
}

function previousKeyframe(sorted: BBKeyframe[], index: number): BBKeyframe | undefined {
  return index > 0 ? sorted[index - 1] : undefined;
}

function compileTransformKeyframe(
  kf: BBKeyframe,
  sorted: BBKeyframe[],
  index: number,
  channel: TransformChannel,
  tracker: FlipTracker
): unknown {
  const dataPoints = kf.data_points?.length ?? 0;
  if (kf.interpolation === 'catmullrom') {
    const previous = previousKeyframe(sorted, index);
    const includePre =
      (!previous && toNumber(kf.time, 0) > 0) || (previous !== undefined && previous.interpolation !== 'catmullrom');
    const result: Record<string, unknown> = {};
    if (includePre) result.pre = flipArray(channel, getArray(kf, 0), tracker);
    result.post = flipArray(channel, getArray(kf, includePre ? 1 : 0), tracker);
    result.lerp_mode = 'catmullrom';
    return result;
  }
  if (dataPoints <= 1) {
    const previous = previousKeyframe(sorted, index);
    if (previous && previous.interpolation === 'step') {
      return {
        pre: flipArray(channel, getArray(previous, 1), tracker),
        post: flipArray(channel, getArray(kf, 0), tracker),
      };
    }
    return flipArray(channel, getArray(kf, 0), tracker);
  }
  return {
    pre: flipArray(channel, getArray(kf, 0), tracker),
    post: flipArray(channel, getArray(kf, 1), tracker),
  };
}

type CurvePoint = { x: number; y: number };

function sampleBezierCurve(
  before: BBKeyframe,
  after: BBKeyframe,
  axisIndex: number,
  tracker: { molang: boolean }
): CurvePoint[] {
  const t0 = toNumber(before.time, 0);
  const t1 = toNumber(after.time, 0);
  const v0 = getNumericArray(before, 1, tracker)[axisIndex];
  const v1 = getNumericArray(after, 0, tracker)[axisIndex];
  const gap = t1 - t0;
  const rightTime = Math.min(Math.max(toNumber(before.bezier_right_time?.[axisIndex], 0), 0), gap);
  const leftTime = Math.min(Math.max(toNumber(after.bezier_left_time?.[axisIndex], 0), -gap), 0);
  const rightValue = toNumber(before.bezier_right_value?.[axisIndex], 0);
  const leftValue = toNumber(after.bezier_left_value?.[axisIndex], 0);

  const p = [
    { x: t0, y: v0 },
    { x: t0 + rightTime, y: v0 + rightValue },
    { x: t1 + leftTime, y: v1 + leftValue },
    { x: t1, y: v1 },
  ];
  const points: CurvePoint[] = new Array(200);
  for (let i = 0; i < 200; i++) {
    const t = i / 199;
    const u = 1 - t;
    points[i] = {
      x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x,
      y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y,
    };
  }
  return points;
}

function curveValueAt(points: CurvePoint[], time: number): number {
  let closest = points[0];
  let second = points[199];
  let closestDiff = Math.abs(closest.x - time);
  let secondDiff = Math.abs(second.x - time);
  if (secondDiff < closestDiff) {
    [closest, second] = [second, closest];
    [closestDiff, secondDiff] = [secondDiff, closestDiff];
  }
  for (let i = 1; i < 200; i++) {
    const point = points[i];
    const diff = Math.abs(point.x - time);
    if (diff < closestDiff) {
      second = closest;
      secondDiff = closestDiff;
      closest = point;
      closestDiff = diff;
    } else if (diff < secondDiff) {
      second = point;
      secondDiff = diff;
    }
  }
  if (closest.x === second.x) return closest.y;
  const lerp = Math.min(Math.max((time - closest.x) / (second.x - closest.x), 0), 1);
  return closest.y + (second.y - closest.y) * lerp;
}

function keyframesOfChannel(animator: BBAnimator, channel: string): BBKeyframe[] {
  const all = Array.isArray(animator.keyframes) ? animator.keyframes : [];
  return all
    .filter((kf) => kf && kf.channel === channel)
    .slice()
    .sort((a, b) => toNumber(a.time, 0) - toNumber(b.time, 0));
}

function compileEffectKeyframe(kf: BBKeyframe): unknown {
  const points: Record<string, unknown>[] = [];
  for (const dataPoint of kf.data_points ?? []) {
    if (!dataPoint?.effect) continue;
    let script = typeof dataPoint.script === 'string' ? dataPoint.script : undefined;
    if (script && !script.replace(/[\n\s;.]+/g, '')) script = undefined;
    if (script && !/;$/.test(script)) script += ';';
    const point: Record<string, unknown> = { effect: dataPoint.effect };
    if (dataPoint.locator) point.locator = dataPoint.locator;
    if (dataPoint.bind_to_actor === false) point.bind_to_actor = false;
    if (script) point.pre_effect_script = script;
    points.push(point);
  }
  return points.length <= 1 ? points[0] : points;
}

function compileTimelineKeyframe(kf: BBKeyframe): unknown {
  let scripts: string[] = [];
  for (const dataPoint of kf.data_points ?? []) {
    if (typeof dataPoint?.script === 'string') scripts.push(...dataPoint.script.split('\n'));
  }
  scripts = scripts.filter((s) => !!s.replace(/[\n\s;.]+/g, ''));
  scripts = scripts.map((line) => (/;\s*$/.test(line) || line.startsWith('/') ? line : `${line};`));
  return scripts.length <= 1 ? scripts[0] : scripts;
}

function buildGroupNameMap(model: NormalizedModel): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (nodes: NormalizedNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'group') {
        map.set(node.group.uuid, node.group.name);
        walk(node.group.children);
      }
    }
  };
  walk(model.rootNodes);
  return map;
}

function maxKeyframeTime(animation: BBAnimation): number {
  let max = 0;
  for (const animator of Object.values(animation.animators ?? {})) {
    for (const kf of animator?.keyframes ?? []) {
      max = Math.max(max, toNumber(kf?.time, 0));
    }
  }
  return max;
}

function compileAnimation(
  animation: BBAnimation,
  groupNames: Map<string, string>,
  warnings: string[]
): Record<string, unknown> {
  const tag: Record<string, unknown> = {};
  const name = animation.name || 'animation';
  const snapping = toNumber(animation.snapping, 24) || 24;
  const length = toNumber(animation.length, 0);

  if (animation.loop === 'hold') {
    tag.loop = 'hold_on_last_frame';
  } else if (animation.loop === 'loop' || Math.max(length, maxKeyframeTime(animation)) === 0) {
    tag.loop = true;
  }
  if (length) tag.animation_length = cleanNumber(length, 4);
  if (animation.override === true) tag.override_previous_animation = true;
  if (animation.anim_time_update) tag.anim_time_update = exportMolang(animation.anim_time_update);
  if (animation.blend_weight) tag.blend_weight = exportMolang(animation.blend_weight);
  if (animation.start_delay) tag.start_delay = exportMolang(animation.start_delay);
  if (animation.loop_delay && tag.loop) tag.loop_delay = exportMolang(animation.loop_delay);

  const bones: Record<string, Record<string, unknown>> = {};
  const flipTracker: FlipTracker = { molangApproximated: false };
  let bezierBaked = false;
  const molangInBezier = { molang: false };

  for (const [uuid, animator] of Object.entries(animation.animators ?? {})) {
    if (!animator || typeof animator !== 'object') continue;
    const keyframes = Array.isArray(animator.keyframes) ? animator.keyframes : [];
    if (!keyframes.length && animator.rotation_global !== true) continue;

    const isEffect = animator.type === 'effect' || uuid === 'effects';
    if (isEffect) {
      for (const kf of keyframesOfChannel(animator, 'sound')) {
        const sounds = (tag.sound_effects ??= {}) as Record<string, unknown>;
        sounds[timecodeString(toNumber(kf.time, 0), snapping)] = compileEffectKeyframe(kf);
      }
      for (const kf of keyframesOfChannel(animator, 'particle')) {
        const particles = (tag.particle_effects ??= {}) as Record<string, unknown>;
        particles[timecodeString(toNumber(kf.time, 0), snapping)] = compileEffectKeyframe(kf);
      }
      for (const kf of keyframesOfChannel(animator, 'timeline')) {
        const timeline = (tag.timeline ??= {}) as Record<string, unknown>;
        timeline[timecodeString(toNumber(kf.time, 0), snapping)] = compileTimelineKeyframe(kf);
      }
      continue;
    }
    if (animator.type && animator.type !== 'bone') {
      warnings.push(
        `Animation "${name}": animator type "${animator.type}" is not supported in Bedrock output and was skipped.`
      );
      continue;
    }

    const boneName = groupNames.get(uuid) ?? animator.name ?? uuid;
    const boneTag: Record<string, unknown> = (bones[boneName] ??= {});
    if (animator.rotation_global === true) {
      boneTag.relative_to = { rotation: 'entity' };
      boneTag.rotation = [0, 0, 0.01];
    }

    for (const channel of TRANSFORM_CHANNELS) {
      const sorted = keyframesOfChannel(animator, channel);
      if (!sorted.length) continue;

      const channelTag: Record<string, unknown> = {};
      sorted.forEach((kf, index) => {
        const timecode = timecodeString(toNumber(kf.time, 0), snapping);
        let value = compileTransformKeyframe(kf, sorted, index, channel, flipTracker);
        if (
          animator.rotation_global === true &&
          channel === 'rotation' &&
          Array.isArray(value) &&
          value.every((v) => v === 0)
        ) {
          value = [0, 0, 0.01];
        }
        channelTag[timecode] = value;

        const next = sorted[index + 1];
        if (next && (kf.interpolation === 'bezier' || next.interpolation === 'bezier')) {
          bezierBaked = true;
          const interval = 1 / Math.min(Math.max(snapping, 1), 120);
          const start = toNumber(kf.time, 0);
          const end = toNumber(next.time, 0);
          const curves = [0, 1, 2].map((axis) => sampleBezierCurve(kf, next, axis, molangInBezier));
          for (let t = start + interval; t < end - interval / 2; t += interval) {
            const sampled = curves.map((curve) => cleanNumber(curveValueAt(curve, t), 4));
            if (channel === 'position' || channel === 'rotation') sampled[0] = -sampled[0] || 0;
            if (channel === 'rotation') sampled[1] = -sampled[1] || 0;
            channelTag[timecodeString(t, snapping)] = sampled;
          }
        }
      });

      const timecodes = Object.keys(channelTag);
      if (
        timecodes.length === 1 &&
        (sorted[0].data_points?.length ?? 1) <= 1 &&
        sorted[0].interpolation !== 'catmullrom'
      ) {
        const collapsed = channelTag[timecodes[0]];
        if (
          channel === 'scale' &&
          Array.isArray(collapsed) &&
          collapsed.every((v) => v === collapsed[0])
        ) {
          boneTag[channel] = collapsed[0];
        } else {
          boneTag[channel] = collapsed;
        }
      } else {
        boneTag[channel] = channelTag;
      }
    }
  }

  if (Object.keys(bones).length) tag.bones = bones;

  if (flipTracker.molangApproximated) {
    warnings.push(
      `Animation "${name}": Molang expressions on mirrored axes were negated by wrapping them as "-(expr)". ` +
        'This is semantically equivalent but formatted differently than Blockbench would write it.'
    );
  }
  if (bezierBaked) {
    warnings.push(
      `Animation "${name}": bezier interpolation is not supported by Bedrock, so bezier segments were baked ` +
        'into sampled keyframes (approximate, matching Blockbench export behavior).'
    );
  }
  if (molangInBezier.molang) {
    warnings.push(
      `Animation "${name}": a bezier segment uses Molang values, which cannot be evaluated during baking; ` +
        'those axes were treated as 0.'
    );
  }
  return tag;
}

export function convertAnimationsToBedrock(model: NormalizedModel): AnimationsResult {
  const warnings: string[] = [];
  if (!model.animations.length) {
    return { file: null, count: 0, names: [], warnings };
  }

  const groupNames = buildGroupNameMap(model);
  const animations: Record<string, unknown> = {};
  const names: string[] = [];
  const taken = new Set<string>();

  for (const animation of model.animations) {
    let name = typeof animation.name === 'string' && animation.name ? animation.name : 'animation';
    if (taken.has(name)) {
      let i = 2;
      while (taken.has(`${name}_${i}`)) i++;
      warnings.push(`Duplicate animation name "${name}" written as "${name}_${i}".`);
      name = `${name}_${i}`;
    }
    taken.add(name);
    names.push(name);
    animations[name] = compileAnimation(animation, groupNames, warnings);
  }

  return {
    file: { format_version: '1.8.0', animations },
    count: names.length,
    names,
    warnings,
  };
}

export function animationSpan(animation: BBAnimation): string {
  const length = toNumber(animation.length, 0);
  return `${trimFloat(Math.max(length, maxKeyframeTime(animation)), 2)}s`;
}
