import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAsciiTab, parseTabLines } from '../src/parse/ascii-tab.js';

const SIMPLE = [
  'e|--0--2--|',
  'B|--1-----|',
  'G|--------|',
  'D|--------|',
  'A|--------|',
  'E|--------|',
];

test('columns become beats and same-column notes become chords', () => {
  const parsed = parseTabLines(SIMPLE);
  assert.equal(parsed.events.length, 2);
  assert.deepEqual(parsed.events[0].notes, [
    { string: 1, fret: 0 },
    { string: 2, fret: 1 },
  ]);
  assert.deepEqual(parsed.events[1].notes, [{ string: 1, fret: 2 }]);
});

test('bar lines mark the beat that follows them', () => {
  const parsed = parseTabLines(['e|--0--|--2--|', 'B|-----|-----|']);
  assert.equal(parsed.events[1].barBefore, true);
  assert.equal(parsed.events[0].barBefore, false);
  assert.equal(parsed.trailingBar, true);
});

test('two-digit frets stay one number and still form chords', () => {
  const parsed = parseTabLines(['e|--12--|', 'B|---0--|']);
  assert.equal(parsed.events.length, 1);
  assert.deepEqual(parsed.events[0].notes, [
    { string: 1, fret: 12 },
    { string: 2, fret: 0 },
  ]);
});

test('technique glyphs are ignored', () => {
  const parsed = parseTabLines(['e|--0h2--5/7--|', 'B|-------------|']);
  assert.deepEqual(
    parsed.events.map((event) => event.notes[0].fret),
    [0, 2, 5, 7],
  );
});

test('a trailing annotation is not read as a fret', () => {
  const parsed = parseTabLines(['e|--0--2--| x2', 'B|--------|    ']);
  assert.deepEqual(
    parsed.events.map((event) => event.notes[0].fret),
    [0, 2],
  );
});

test('sections, headings and directives are understood', () => {
  const text = [
    'Tuning: DADGAD',
    'Title: Test Piece',
    '# Opening',
    'D|--0--|',
    'A|-----|',
    'D|-----|',
    'G|-----|',
    'A|-----|',
    'D|-----|',
    '',
    '[Chorus]',
    'D|--5--|',
    'A|-----|',
    'D|-----|',
    'G|-----|',
    'A|-----|',
    'D|-----|',
  ].join('\n');

  const score = parseAsciiTab(text);
  assert.equal(score.title, 'Test Piece');
  assert.equal(score.tuning.id, 'dadgad');
  assert.equal(score.sections.length, 2);
  assert.equal(score.sections[0].title, 'Opening');
  assert.equal(score.sections[1].title, 'Chorus');
  assert.equal(score.beatCount, 2);
});

test('the first non-tab line is used as a title when none is given', () => {
  const score = parseAsciiTab(`Some Song\n\n${SIMPLE.join('\n')}`);
  assert.equal(score.title, 'Some Song');
});

test('parsed notes carry real pitches for the tuning', () => {
  const score = parseAsciiTab(SIMPLE.join('\n'));
  assert.deepEqual(
    score.sections[0].events.map((event) => event.notes.map((note) => note.name)),
    [['E4', 'C4'], ['F#4']],
  );
});

test('a short tab warns instead of throwing', () => {
  const parsed = parseTabLines(['e|--0--|', 'B|-----|'], { stringCount: 6 });
  assert.equal(parsed.warnings.length, 1);
  assert.match(parsed.warnings[0], /2 string line/);
});

test('empty input produces an empty score', () => {
  const score = parseAsciiTab('');
  assert.equal(score.sections.length, 0);
  assert.equal(score.beatCount, 0);
});
