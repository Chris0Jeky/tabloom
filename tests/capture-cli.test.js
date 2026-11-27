import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../tools/capture/cli.mjs', import.meta.url));
const mediaTools = ['ffmpeg', 'ffprobe'].every((tool) =>
  spawnSync(tool, ['-version'], { stdio: 'ignore', windowsHide: true }).status === 0);

test('capture CLI can skip band detection without overriding an explicit crop', {
  skip: mediaTools ? false : 'requires ffmpeg and ffprobe',
  timeout: 30000,
}, () => {
  const dir = mkdtempSync(join(tmpdir(), 'tabloom-crop-'));
  try {
    const video = join(dir, 'six-lines.mkv');
    const frame = Buffer.alloc(64 * 96, 20);
    for (const row of [20, 30, 40, 50, 60, 70]) frame.fill(220, row * 64, (row + 1) * 64);
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pixel_format', 'gray',
      '-video_size', '64x96', '-framerate', '2', '-i', 'pipe:0', '-c:v', 'ffv1', video,
    ], { input: Buffer.concat(Array(6).fill(frame)), timeout: 10000, windowsHide: true });

    const capture = (name, ...args) => {
      const out = join(dir, name);
      const result = spawnSync(process.execPath, [cli, video, '--out', out, '--ocr', 'none',
        '--width', '64', '--ocr-width', '64', ...args], {
        encoding: 'utf8', timeout: 10000, windowsHide: true,
      });
      assert.equal(result.status, 0, result.stderr || String(result.error));
      if (args.includes('--no-auto-crop')) {
        assert.match(readFileSync(join(out, 'report.txt'), 'utf8'), /skipped \(--no-auto-crop\)/);
      }
      return JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    };

    const auto = capture('auto');
    assert.equal(auto.band.found, true);
    assert.ok(auto.crop.h < 96);

    const noAuto = capture('off', '--no-auto-crop');
    assert.equal(noAuto.band.skipped, true);
    assert.equal(noAuto.crop, null);
    assert.equal(noAuto.analysis.frames, 6);
    assert.ok(!noAuto.warnings.some((warning) => warning.includes('band not detected')));

    const manual = capture('manual', '--no-auto-crop', '--crop', '0,12,64,64');
    assert.equal(manual.band.skipped, true);
    assert.deepEqual(manual.crop, { x: 0, y: 12, w: 64, h: 64 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
