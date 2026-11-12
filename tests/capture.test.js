/**
 * Tests for the capture pipeline that do not need ffmpeg, yt-dlp or tesseract:
 * frame signatures, shot segmentation, band detection, box parsing, stitching
 * and ASCII round-tripping.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Segmenter, difference, sharpnessOf, signatureOf } from '../tools/capture/analyse.mjs';
import { detectTabBand, BandTracker } from '../tools/capture/locate.mjs';
import { parseBoxFile, boxesToShot } from '../tools/capture/ocr.mjs';
import { stitchShots, beatSignature } from '../tools/capture/assemble.mjs';
import { eventsToTab } from '../tools/capture/emit.mjs';

import { parseAsciiTab } from '../src/parse/ascii-tab.js';
import { resolveTuning } from '../src/model/tuning.js';

const W = 64;
const H = 96;

function flatFrame(value, width = W, height = H) {
  return new Uint8Array(width * height).fill(value);
}

/** Grey frame with full-width ridges at the given rows. */
function linedFrame(rows, { width = W, height = H, background = 20, line = 220 } = {}) {
  const frame = flatFrame(background, width, height);
  for (const row of rows) {
    for (let x = 0; x < width; x += 1) frame[row * width + x] = line;
  }
  return frame;
}

test('identical frames have zero difference and a stable signature', () => {
  const frame = linedFrame([10, 20, 30]);
  const a = signatureOf(frame, W, H);
  const b = signatureOf(frame, W, H);
  assert.equal(difference(a, b), 0);
  assert.equal(a.length, 64 * 36);
});

test('sharpness is lower for a blurred frame', () => {
  const crisp = linedFrame([10, 20, 30]);
  const blurred = flatFrame(20);
  assert.ok(sharpnessOf(crisp, W, H) > sharpnessOf(blurred, W, H));
});

test('a cut starts a new shot', () => {
  const segmenter = new Segmenter({ fps: 2, changeThreshold: 6, minShotSeconds: 0 });
  const dark = flatFrame(10);
  const bright = flatFrame(200);

  segmenter.push(dark, W, H, 0);
  segmenter.push(dark, W, H, 0.5);
  segmenter.push(bright, W, H, 1);
  segmenter.push(bright, W, H, 1.5);

  const result = segmenter.finish();
  assert.equal(result.totalSegments, 2);
  assert.equal(result.shots.length, 2);
  assert.equal(result.shots[0].startTime, 0);
  assert.equal(result.shots[1].startTime, 1);
});

test('a shot that comes back is not read twice', () => {
  const segmenter = new Segmenter({ fps: 2, changeThreshold: 6, minShotSeconds: 0 });
  const dark = flatFrame(10);
  const bright = flatFrame(200);

  [dark, dark, bright, bright, dark, dark].forEach((frame, index) => {
    segmenter.push(frame, W, H, index * 0.5);
  });

  const result = segmenter.finish();
  assert.equal(result.totalSegments, 3);
  assert.equal(result.shots.length, 2);
  assert.equal(result.dropped, 1);
});

test('short flickers are merged into their neighbour', () => {
  const segmenter = new Segmenter({ fps: 2, changeThreshold: 6, minShotSeconds: 2 });
  const dark = flatFrame(10);
  const bright = flatFrame(200);

  // two frames of "bright" at 2 fps = 1s, below the 2s minimum
  [dark, dark, bright, bright, dark, dark].forEach((frame, index) => {
    segmenter.push(frame, W, H, index * 0.5);
  });

  const result = segmenter.finish();
  assert.equal(result.shots.length, 1);
});

test('the tab band is found from evenly spaced ridges', () => {
  const rows = [20, 30, 40, 50, 60, 70];
  const band = detectTabBand(linedFrame(rows), W, H, { stringCount: 6 });
  assert.equal(band.found, true);
  assert.equal(band.lines.length, 6);
  assert.ok(band.top <= 20);
  assert.ok(band.bottom >= 70);
  assert.ok(band.confidence > 0.5);
});

test('uneven ridges are not mistaken for a tab', () => {
  const band = detectTabBand(linedFrame([5, 30, 34, 60, 80, 90]), W, H, { stringCount: 6 });
  assert.equal(band.found, false);
});

test('the band tracker votes across frames', () => {
  const tracker = new BandTracker({ stringCount: 6, sampleEvery: 1 });
  for (let i = 0; i < 3; i += 1) tracker.push(linedFrame([20, 30, 40, 50, 60, 70]), W, H);
  tracker.push(flatFrame(20), W, H);
  const resolved = tracker.resolve();
  assert.equal(resolved.found, true);
  assert.equal(resolved.hits, 3);
});

test('box files are parsed into top-left character boxes', () => {
  const boxes = parseBoxFile('0 20 22 6 8 0\n1 40 32 6 8 0\n');
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].char, '0');
  assert.equal(boxes[0].x, 20);
  assert.equal(boxes[0].y, 14);
  assert.equal(boxes[0].centerY, 18);
});

test('boxes become strings, columns and chords', () => {
  const text = [
    '0 20 22 6 8 0',
    '1 20 32 6 8 0',
    '2 20 42 6 8 0',
    '3 20 52 6 8 0',
    '4 20 62 6 8 0',
    '5 20 72 6 8 0',
    '0 40 22 6 8 0',
  ].join('\n');

  const shot = boxesToShot(parseBoxFile(text), { stringCount: 6 });
  assert.equal(shot.events.length, 2);
  assert.deepEqual(shot.events[0].notes, [
    { string: 1, fret: 0 },
    { string: 2, fret: 1 },
    { string: 3, fret: 2 },
    { string: 4, fret: 3 },
    { string: 5, fret: 4 },
    { string: 6, fret: 5 },
  ]);
  assert.deepEqual(shot.events[1].notes, [{ string: 1, fret: 0 }]);
  assert.equal(shot.confidence, 1);
});

test('adjacent digit boxes form one fret number', () => {
  const text = ['1 20 22 6 8 0', '2 27 22 6 8 0', '0 60 32 6 8 0'].join('\n');
  const shot = boxesToShot(parseBoxFile(text), { stringCount: 6 });
  assert.equal(shot.events[0].notes[0].fret, 12);
});

test('a frame with no digits reports low confidence', () => {
  const shot = boxesToShot([], { stringCount: 6 });
  assert.equal(shot.events.length, 0);
  assert.equal(shot.confidence, 0);
  assert.match(shot.warnings[0], /no digits/);
});

test('beats are identified independently of position', () => {
  const a = { notes: [{ string: 2, fret: 1 }, { string: 1, fret: 0 }] };
  const b = { notes: [{ string: 1, fret: 0 }, { string: 2, fret: 1 }] };
  assert.equal(beatSignature(a), beatSignature(b));
});

test('overlapping shots are stitched without duplicating beats', () => {
  const beat = (string, fret) => ({ notes: [{ string, fret }], barBefore: false });
  const first = [beat(1, 0), beat(1, 1), beat(1, 2), beat(1, 3)];
  const second = [beat(1, 2), beat(1, 3), beat(1, 4), beat(1, 5)];

  const result = stitchShots([
    { time: 0, events: first },
    { time: 5, events: second },
  ]);

  assert.equal(result.events.length, 6);
  assert.equal(result.joins[1].overlap, 2);
  assert.equal(result.joins[1].appended, 2);
  assert.equal(result.joins[1].gap, false);
});

test('a shot fully contained in the tab adds nothing', () => {
  const beat = (fret) => ({ notes: [{ string: 1, fret }], barBefore: false });
  const result = stitchShots([
    { time: 0, events: [beat(0), beat(1), beat(2), beat(3)] },
    { time: 5, events: [beat(1), beat(2)] },
  ]);
  assert.equal(result.events.length, 4);
  assert.equal(result.joins[1].contained, true);
});

test('a join with no overlap is flagged, not silently glued', () => {
  const beat = (fret) => ({ notes: [{ string: 1, fret }], barBefore: false });
  const result = stitchShots([
    { time: 0, events: [beat(0), beat(1)] },
    { time: 5, events: [beat(7), beat(8)] },
  ]);
  assert.equal(result.events.length, 4);
  assert.equal(result.joins[1].gap, true);
  assert.equal(result.warnings.length, 1);
});

test('emitted ASCII tab parses back to the same beats', () => {
  const tuning = resolveTuning('standard');
  const events = [
    { notes: [{ string: 1, fret: 0 }, { string: 2, fret: 1 }], barBefore: false },
    { notes: [{ string: 1, fret: 12 }], barBefore: true },
  ];

  const tab = eventsToTab(events, { tuning });
  const score = parseAsciiTab(tab, { tuning: 'standard' });

  assert.equal(score.beatCount, 2);
  assert.deepEqual(
    score.sections[0].events.map((event) => event.notes.map((note) => `${note.string}:${note.fret}`)),
    [['1:0', '2:1'], ['1:12']],
  );
  assert.equal(score.sections[0].events[1].barBefore, true);
});
