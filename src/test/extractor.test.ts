import { describe, it, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ALL_SECTIONS, extractBBModel, ExtractionCancelledError } from '../core/extractor';
import { NodeFileIO } from '../core/fileio';
import { FIXTURES_DIR, loadFixtureModel, nullLogger } from './helpers';

const io = new NodeFileIO();
const tempRoots: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bbmodel-unpack-test-'));
  tempRoots.push(dir);
  return dir;
}

after(async () => {
  for (const dir of tempRoots) {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

function exists(...segments: string[]): boolean {
  return fs.existsSync(path.join(...segments));
}

describe('extractBBModel (end to end)', () => {
  it('extracts every section of the animated fixture into an organized tree', async () => {
    const outDir = path.join(await makeTempDir(), 'animated_bot_extracted');
    const summary = await extractBBModel({
      model: loadFixtureModel('animated_bot.bbmodel'),
      sourcePath: path.join(FIXTURES_DIR, 'animated_bot.bbmodel'),
      outDir,
      io,
      log: nullLogger,
      options: { sections: ALL_SECTIONS, prettyJson: true, conflict: 'unique' },
    });

    for (const expected of [
      ['bedrock', 'geometry.json'],
      ['bedrock', 'animations.json'],
      ['bedrock', 'animation_controllers.json'],
      ['textures', 'bot.png'],
      ['textures', 'flip.png'],
      ['textures', 'flip.png.mcmeta'],
      ['display', 'display.json'],
    ]) {
      assert.ok(exists(outDir, ...expected), `missing ${expected.join('/')}`);
    }
    assert.ok(!exists(outDir, 'bedrock', 'animated_bot.geo.json'));

    assert.ok(!exists(outDir, 'metadata'));
    assert.ok(!exists(outDir, 'raw'));
    assert.ok(!exists(outDir, 'manifest.json'));
    assert.ok(!exists(outDir, 'extraction-report.md'));

    const geo = JSON.parse(fs.readFileSync(path.join(outDir, 'bedrock', 'geometry.json'), 'utf-8'));
    assert.equal(geo['minecraft:geometry'][0].description.identifier, 'geometry.animated_bot');

    assert.equal(summary.artifacts.length, 7);
    assert.ok(summary.artifacts.every((a) => a.path && a.kind && a.source && a.transform));
    assert.ok(summary.warnings.some((w) => w.includes('mesh')));
  });

  it('extracts only textures when asked to', async () => {
    const outDir = path.join(await makeTempDir(), 'textures_only');
    await extractBBModel({
      model: loadFixtureModel('simple_cube.bbmodel'),
      sourcePath: path.join(FIXTURES_DIR, 'simple_cube.bbmodel'),
      outDir,
      io,
      log: nullLogger,
      options: { sections: ['textures'], prettyJson: true, conflict: 'unique' },
    });
    assert.ok(exists(outDir, 'textures', 'cube.png'));
    assert.ok(!exists(outDir, 'manifest.json'));
    assert.ok(!exists(outDir, 'bedrock'));
    assert.ok(!exists(outDir, 'raw'));
  });

  it('extracts only geometry, and only animations with their controllers', async () => {
    const geometryDir = path.join(await makeTempDir(), 'geometry_only');
    await extractBBModel({
      model: loadFixtureModel('animated_bot.bbmodel'),
      sourcePath: path.join(FIXTURES_DIR, 'animated_bot.bbmodel'),
      outDir: geometryDir,
      io,
      log: nullLogger,
      options: { sections: ['geometry'], prettyJson: true, conflict: 'unique' },
    });
    assert.ok(exists(geometryDir, 'bedrock', 'geometry.json'));
    assert.ok(!exists(geometryDir, 'bedrock', 'animations.json'));
    assert.ok(!exists(geometryDir, 'textures'));

    const animationsDir = path.join(await makeTempDir(), 'animations_only');
    await extractBBModel({
      model: loadFixtureModel('animated_bot.bbmodel'),
      sourcePath: path.join(FIXTURES_DIR, 'animated_bot.bbmodel'),
      outDir: animationsDir,
      io,
      log: nullLogger,
      options: { sections: ['animations', 'controllers'], prettyJson: true, conflict: 'unique' },
    });
    assert.ok(exists(animationsDir, 'bedrock', 'animations.json'));
    assert.ok(exists(animationsDir, 'bedrock', 'animation_controllers.json'));
    assert.ok(!exists(animationsDir, 'bedrock', 'geometry.json'));
    assert.ok(!exists(animationsDir, 'textures'));
  });

  it('never overwrites with the "unique" strategy: second run gets " (2)" names', async () => {
    const outDir = path.join(await makeTempDir(), 'twice');
    const run = () =>
      extractBBModel({
        model: loadFixtureModel('simple_cube.bbmodel'),
        sourcePath: path.join(FIXTURES_DIR, 'simple_cube.bbmodel'),
        outDir,
        io,
        log: nullLogger,
        options: { sections: ['geometry', 'textures'], prettyJson: true, conflict: 'unique' },
      });
    await run();
    const summary = await run();
    assert.ok(exists(outDir, 'bedrock', 'geometry.json'));
    assert.ok(exists(outDir, 'bedrock', 'geometry (2).json'));
    assert.ok(exists(outDir, 'textures', 'cube (2).png'));
    const renamed = summary.artifacts.filter((a) => a.notes.some((n) => n.includes('Renamed')));
    assert.ok(renamed.length >= 2);
  });

  it('overwrites in place with the "overwrite" strategy', async () => {
    const outDir = path.join(await makeTempDir(), 'overwrite');
    const run = () =>
      extractBBModel({
        model: loadFixtureModel('simple_cube.bbmodel'),
        sourcePath: path.join(FIXTURES_DIR, 'simple_cube.bbmodel'),
        outDir,
        io,
        log: nullLogger,
        options: { sections: ['geometry'], prettyJson: true, conflict: 'overwrite' },
      });
    await run();
    await run();
    assert.ok(exists(outDir, 'bedrock', 'geometry.json'));
    assert.ok(!exists(outDir, 'bedrock', 'geometry (2).json'));
  });

  it('honors cancellation tokens', async () => {
    const outDir = path.join(await makeTempDir(), 'cancelled');
    await assert.rejects(
      extractBBModel({
        model: loadFixtureModel('simple_cube.bbmodel'),
        sourcePath: path.join(FIXTURES_DIR, 'simple_cube.bbmodel'),
        outDir,
        io,
        log: nullLogger,
        options: { sections: ALL_SECTIONS, prettyJson: true, conflict: 'unique' },
        token: { isCancellationRequested: true },
      }),
      (err: unknown) => err instanceof ExtractionCancelledError
    );
  });

  it('copies textures referenced by relative_path next to the model', async () => {
    const tempDir = await makeTempDir();
    const modelDir = path.join(tempDir, 'models');
    await fsp.mkdir(path.join(modelDir, 'textures'), { recursive: true });
    const pngBytes = await fsp.readFile(path.join(FIXTURES_DIR, '..', 'media', 'icon.png'));
    await fsp.writeFile(path.join(modelDir, 'textures', 'linked.png'), pngBytes);

    const model = loadFixtureModel('simple_cube.bbmodel');
    model.textures[0] = { name: 'linked.png', relative_path: './textures/linked.png' };

    const outDir = path.join(tempDir, 'out');
    const summary = await extractBBModel({
      model,
      sourcePath: path.join(modelDir, 'simple_cube.bbmodel'),
      outDir,
      io,
      log: nullLogger,
      options: { sections: ['textures'], prettyJson: true, conflict: 'unique' },
    });
    assert.ok(exists(outDir, 'textures', 'linked.png'));
    const artifact = summary.artifacts.find((a) => a.path === 'textures/linked.png');
    assert.ok(artifact?.source.includes('relative_path'));
  });
});
