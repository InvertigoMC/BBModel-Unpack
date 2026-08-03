/**
 * Blockbench animation controllers -> Bedrock `.animation_controllers.json`.
 *
 * Mirrors `AnimationController.compileForBedrock()` and
 * `AnimationControllerState.compileForBedrock()` in Blockbench
 * (`js/animations/animation_controllers.js`):
 *
 * - `initial_state` is omitted when it is the state literally named "default".
 * - State animations are written as `"key"` or `{"key": "blend expression"}`.
 * - `on_entry` / `on_exit` become arrays of `;`-terminated Molang lines
 *   (lines starting with `/` are slash commands and stay untouched).
 * - Transitions become `[{ "<target state name>": "<condition>" }]`.
 * - `bind_to_actor` is written as `false` only when disabled (Bedrock's
 *   default is true).
 * - The file wrapper uses format_version 1.19.0, like Blockbench.
 */

import { BBAnimationController, BBControllerState } from './types';
import { cleanNumber, toNumber, trimFloat } from './mathUtil';

export interface ControllersResult {
  file: Record<string, unknown> | null;
  count: number;
  names: string[];
  warnings: string[];
}

/** Split a Molang script block into normalized instruction lines. */
function scriptLines(script: string | undefined): string[] | undefined {
  if (!script || script === '\\n') return undefined;
  let lines = script.split('\n');
  lines = lines.filter((line) => !!line.replace(/[\n\s;.]+/g, ''));
  lines = lines.map((line) => (/;\s*$/.test(line) || line.startsWith('/') ? line : `${line};`));
  return lines.length ? lines : undefined;
}

function compileState(
  state: BBControllerState,
  controller: BBAnimationController,
  warnings: string[]
): Record<string, unknown> {
  const object: Record<string, unknown> = {};

  const animations = Array.isArray(state.animations) ? state.animations : [];
  if (animations.length) {
    object.animations = animations.map((animation) => {
      const key = animation?.key || animation?.animation || '';
      const blend = typeof animation?.blend_value === 'string' ? animation.blend_value.trim() : '';
      return blend ? { [key]: blend } : key;
    });
  }

  const onEntry = scriptLines(state.on_entry);
  if (onEntry) object.on_entry = onEntry;
  const onExit = scriptLines(state.on_exit);
  if (onExit) object.on_exit = onExit;

  const particles = Array.isArray(state.particles) ? state.particles : [];
  if (particles.length) {
    object.particle_effects = particles.map((particle) => {
      const entry: Record<string, unknown> = { effect: particle?.effect || '' };
      if (particle?.locator) entry.locator = particle.locator;
      // Bedrock defaults bind_to_actor to true; only write it when disabled.
      if (!particle?.bind_to_actor) entry.bind_to_actor = false;
      if (particle?.pre_effect_script) entry.pre_effect_script = particle.pre_effect_script;
      return entry;
    });
  }

  const sounds = Array.isArray(state.sounds) ? state.sounds : [];
  if (sounds.length) {
    object.sound_effects = sounds.map((sound) => ({ effect: sound?.effect || '' }));
  }

  const transitions = Array.isArray(state.transitions) ? state.transitions : [];
  if (transitions.length) {
    object.transitions = transitions.map((transition) => {
      const target = (controller.states ?? []).find((s) => s?.uuid === transition?.target);
      if (!target) {
        warnings.push(
          `Controller "${controller.name ?? 'controller'}": a transition in state "${state.name ?? 'state'}" ` +
            'points to a state that no longer exists; written as "missing_state".'
        );
      }
      const condition = typeof transition?.condition === 'string' ? transition.condition.replace(/\n/g, '') : '';
      return { [target?.name || 'missing_state']: condition };
    });
  }

  if (state.blend_transition) {
    object.blend_transition = toNumber(state.blend_transition, 0);
    const curve = state.blend_transition_curve;
    if (curve && typeof curve === 'object') {
      const points = Object.keys(curve)
        .map((key) => ({ time: Number.parseFloat(key), value: toNumber(curve[key], 0) }))
        .filter((p) => Number.isFinite(p.time))
        .sort((a, b) => a.time - b.time);
      if (points.length) {
        const curveOutput: Record<string, number> = {};
        for (const point of points) {
          let timecode = trimFloat(point.time * toNumber(state.blend_transition, 0), 4);
          if (!timecode.includes('.')) timecode += '.0';
          curveOutput[timecode] = cleanNumber(point.value, 6);
        }
        object.blend_transition = curveOutput;
      }
    }
    if (state.blend_via_shortest_path) object.blend_via_shortest_path = true;
  }

  return object;
}

function compileController(
  controller: BBAnimationController,
  warnings: string[]
): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  const states = Array.isArray(controller.states) ? controller.states : [];
  if (!states.length) return object;

  const initialState = states.find((s) => s?.uuid === controller.initial_state) ?? states[0];
  if (initialState?.name !== 'default') object.initial_state = initialState?.name ?? 'default';

  const stateMap: Record<string, unknown> = {};
  for (const state of states) {
    if (!state || typeof state !== 'object') continue;
    stateMap[state.name || 'state'] = compileState(state, controller, warnings);
  }
  object.states = stateMap;
  return object;
}

/** Convert all animation controllers into one Bedrock controllers file. */
export function convertControllersToBedrock(controllers: BBAnimationController[]): ControllersResult {
  const warnings: string[] = [];
  const valid = controllers.filter((c) => c && typeof c === 'object');
  if (!valid.length) return { file: null, count: 0, names: [], warnings };

  const compiled: Record<string, unknown> = {};
  const names: string[] = [];
  for (const controller of valid) {
    const name = controller.name || 'controller.animation.unnamed';
    names.push(name);
    compiled[name] = compileController(controller, warnings);
  }

  return {
    file: { format_version: '1.19.0', animation_controllers: compiled },
    count: names.length,
    names,
    warnings,
  };
}
