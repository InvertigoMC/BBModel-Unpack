import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { convertAnimationsToBedrock } from '../animations';
import { loadBBModel } from '../parse';
import { get, loadFixtureModel } from './helpers';

describe('convertAnimationsToBedrock', () => {
  const result = convertAnimationsToBedrock(loadFixtureModel('animated_bot.bbmodel'));
  const idle = get(result.file, 'animations', 'animation.bot.idle');
  const wave = get(result.file, 'animations', 'animation.bot.wave');

  it('wraps everything in a format_version 1.8.0 file', () => {
    assert.ok(result.file);
    assert.equal(get(result.file, 'format_version'), '1.8.0');
    assert.equal(result.count, 2);
  });

  it('maps loop modes ("loop" -> true, "hold" -> hold_on_last_frame)', () => {
    assert.equal(idle.loop, true);
    assert.equal(wave.loop, 'hold_on_last_frame');
    assert.equal(wave.override_previous_animation, true);
    assert.equal(idle.animation_length, 1);
    assert.equal(wave.animation_length, 2);
  });

  it('keys bones by group name and keyframes by "0.0"-style timecodes', () => {
    const rotation = get(idle, 'bones', 'head', 'rotation');
    assert.deepEqual(Object.keys(rotation), ['0.0', '0.5', '1.0']);
  });

  it('negates rotation X/Y back into Bedrock space and keeps catmullrom', () => {
    const rotation = get(idle, 'bones', 'head', 'rotation');
    assert.deepEqual(rotation['0.0'], { post: [0, 0, 0], lerp_mode: 'catmullrom' });
    assert.deepEqual(rotation['0.5'], { post: [0, -10, 0], lerp_mode: 'catmullrom' });
    assert.deepEqual(rotation['1.0'], [-5, 0, 0]); // numeric strings became numbers
  });

  it('wraps Molang on mirrored axes as -(expr) and collapses single keyframes', () => {
    const position = get(idle, 'bones', 'head', 'position');
    assert.deepEqual(position, ['-(math.sin(query.anim_time * 90))', 1, 0]);
    assert.ok(result.warnings.some((w) => w.includes('-(expr)')));
  });

  it('collapses a uniform single scale keyframe to one number', () => {
    assert.equal(get(idle, 'bones', 'head', 'scale'), 1.2);
  });

  it('renders step interpolation as a pre/post jump on the next keyframe', () => {
    const position = get(idle, 'bones', 'body', 'position');
    assert.deepEqual(position['0.0'], [0, 0, 0]);
    assert.deepEqual(position['0.5'], { pre: [0, 0, 0], post: [0, 2, 0] });
  });

  it('exports effect animators (sound, particle with script, timeline lines)', () => {
    assert.deepEqual(get(wave, 'sound_effects', '0.25'), { effect: 'mob.bot.hi' });
    const particle = get(wave, 'particle_effects', '0.5');
    assert.equal(particle.effect, 'sparkle');
    assert.equal(particle.locator, 'lead');
    assert.equal(particle.pre_effect_script, 'v.x = 1;');
    assert.deepEqual(get(wave, 'timeline', '1.0'), ['v.x = 1;', '/say hi', 'query.foo;']);
  });

  it('keeps Molang strings (newline-stripped) in animation-level fields', () => {
    assert.equal(wave.anim_time_update, 'query.anim_time + query.delta_time');
  });

  it('exports two-data-point keyframes as pre/post pairs', () => {
    const model = loadBBModel(
      JSON.stringify({
        meta: { format_version: '4.9', model_format: 'bedrock' },
        elements: [],
        outliner: [{ uuid: 'g1', name: 'bone', origin: [0, 0, 0], children: [] }],
        animations: [
          {
            name: 'anim.jump',
            loop: 'once',
            length: 1,
            snapping: 24,
            animators: {
              g1: {
                name: 'bone',
                type: 'bone',
                keyframes: [
                  {
                    channel: 'position',
                    time: 0.5,
                    data_points: [
                      { x: '0', y: '1', z: '0' },
                      { x: '3', y: '4', z: '0' },
                    ],
                  },
                  { channel: 'position', time: 1, data_points: [{ x: '0', y: '0', z: '0' }] },
                ],
              },
            },
          },
        ],
      })
    );
    const converted = convertAnimationsToBedrock(model);
    const position = get(converted.file, 'animations', 'anim.jump', 'bones', 'bone', 'position');
    assert.deepEqual(position['0.5'], { pre: [0, 1, 0], post: [-3, 4, 0] }); // position X negated
    assert.equal(get(converted.file, 'animations', 'anim.jump', 'loop'), undefined); // "once"
  });

  it('snaps keyframe times to the animation snapping grid', () => {
    const model = loadBBModel(
      JSON.stringify({
        meta: { format_version: '4.9', model_format: 'bedrock' },
        elements: [],
        outliner: [{ uuid: 'g1', name: 'bone', origin: [0, 0, 0], children: [] }],
        animations: [
          {
            name: 'anim.snap',
            loop: 'loop',
            length: 1,
            snapping: 20,
            animators: {
              g1: {
                name: 'bone',
                type: 'bone',
                keyframes: [
                  { channel: 'rotation', time: 0.333333, data_points: [{ x: '0', y: '0', z: '1' }] },
                  { channel: 'rotation', time: 0.75, data_points: [{ x: '0', y: '0', z: '2' }] },
                ],
              },
            },
          },
        ],
      })
    );
    const converted = convertAnimationsToBedrock(model);
    const rotation = get(converted.file, 'animations', 'anim.snap', 'bones', 'bone', 'rotation');
    assert.deepEqual(Object.keys(rotation).sort(), ['0.35', '0.75']);
  });

  it('returns null for models without animations', () => {
    const converted = convertAnimationsToBedrock(loadFixtureModel('simple_cube.bbmodel'));
    assert.equal(converted.file, null);
    assert.equal(converted.count, 0);
  });
});
