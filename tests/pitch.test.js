import test from 'node:test';
import assert from 'node:assert/strict';

import {
  midiToName,
  midiToFrequency,
  midiToPitchClass,
  nameToMidi,
  stoppedMidi,
} from '../src/model/pitch.js';
import { resolveTuning, openStringMidi, stringLabel } from '../src/model/tuning.js';

test('MIDI numbers read back as note names', () => {
  assert.equal(midiToName(40), 'E2');
  assert.equal(midiToName(64), 'E4');
  assert.equal(midiToName(69), 'A4');
  assert.equal(midiToName(60), 'C4');
});

test('note names parse to MIDI numbers', () => {
  assert.equal(nameToMidi('E2'), 40);
  assert.equal(nameToMidi('A4'), 69);
  assert.equal(nameToMidi('Eb4'), 63);
  assert.equal(nameToMidi('D#4'), 63);
  assert.equal(nameToMidi('F#3'), 54);
  assert.throws(() => nameToMidi('H2'), /Not a note name/);
});

test('A4 is 440 Hz', () => {
  assert.equal(Math.round(midiToFrequency(69)), 440);
  assert.equal(Math.round(midiToFrequency(57)), 220);
});

test('pitch classes lose the octave', () => {
  assert.equal(midiToPitchClass(64), 'E');
  assert.equal(midiToPitchClass(61), 'C#');
});

test('standard tuning is E A D G B e, low to high', () => {
  const tuning = resolveTuning('standard');
  assert.equal(tuning.midi.length, 6);
  assert.deepEqual(tuning.midi, [40, 45, 50, 55, 59, 64]);
});

test('tab string 1 is the highest string', () => {
  const tuning = resolveTuning('standard');
  assert.equal(openStringMidi(tuning, 1), 64);
  assert.equal(openStringMidi(tuning, 6), 40);
  assert.equal(stringLabel(tuning, 1), 'E');
  assert.equal(stringLabel(tuning, 6), 'E');
});

test('tunings can be named, aliased or spelled out', () => {
  assert.equal(resolveTuning('dadgad').midi[0], 38);
  assert.equal(resolveTuning('Drop D').midi[0], 38);
  assert.deepEqual(resolveTuning('D2 A2 D3 G3 A3 D4').midi, resolveTuning('dadgad').midi);
  assert.deepEqual(resolveTuning([40, 45, 50, 55, 59, 64]).midi, [40, 45, 50, 55, 59, 64]);
  assert.throws(() => resolveTuning('nonsense'), /Unknown tuning/);
});

test('stopped notes add the fret to the open string', () => {
  const tuning = resolveTuning('standard');
  assert.equal(stoppedMidi(tuning.midi, 1, 0), 64);
  assert.equal(stoppedMidi(tuning.midi, 1, 5), 69);
  assert.equal(stoppedMidi(tuning.midi, 6, 3), 43);
  assert.throws(() => stoppedMidi(tuning.midi, 7, 0), /out of range/);
});
