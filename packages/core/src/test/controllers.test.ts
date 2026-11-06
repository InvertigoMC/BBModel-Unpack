import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { convertControllersToBedrock } from '../controllers';
import { get, loadFixtureModel } from './helpers';

describe('convertControllersToBedrock', () => {
  const model = loadFixtureModel('animated_bot.bbmodel');
  const result = convertControllersToBedrock(model.controllers);
  const controller = get(result.file, 'animation_controllers', 'controller.animation.bot');

  it('wraps controllers in a format_version 1.19.0 file', () => {
    assert.ok(result.file);
    assert.equal(get(result.file, 'format_version'), '1.19.0');
    assert.equal(result.count, 1);
  });

  it('omits initial_state when it is the state named "default"', () => {
    assert.equal(controller.initial_state, undefined);
    assert.deepEqual(Object.keys(controller.states), ['default', 'active']);
  });

  it('writes plain animation keys and {key: blend} entries', () => {
    assert.deepEqual(controller.states.default.animations, ['animation.bot.idle']);
    assert.deepEqual(controller.states.active.animations, [{ 'animation.bot.wave': '0.5' }]);
  });

  it('resolves transition targets from uuids to state names', () => {
    assert.deepEqual(controller.states.default.transitions, [{ active: 'q.is_moving' }]);
    assert.deepEqual(controller.states.active.transitions, [{ default: '!q.is_moving' }]);
  });

  it('normalizes on_entry scripts into ;-terminated lines', () => {
    assert.deepEqual(controller.states.active.on_entry, ['v.t = 0;']);
  });

  it('keeps blend settings', () => {
    assert.equal(controller.states.active.blend_transition, 0.2);
    assert.equal(controller.states.active.blend_via_shortest_path, true);
  });

  it('warns when a transition targets a missing state', () => {
    const broken = convertControllersToBedrock([
      {
        name: 'controller.animation.broken',
        states: [
          {
            uuid: 's1',
            name: 'default',
            transitions: [{ uuid: 't1', target: 'nonexistent-uuid', condition: 'q.x' }],
          },
        ],
      },
    ]);
    const state = get(broken.file, 'animation_controllers', 'controller.animation.broken', 'states', 'default');
    assert.deepEqual(state.transitions, [{ missing_state: 'q.x' }]);
    assert.ok(broken.warnings.some((w) => w.includes('missing_state')));
  });

  it('returns null when there are no controllers', () => {
    const empty = convertControllersToBedrock([]);
    assert.equal(empty.file, null);
  });
});
