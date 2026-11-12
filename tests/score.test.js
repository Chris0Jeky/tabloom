import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createScore,
  flattenScore,
  beatCount,
  highestFret,
  stepDurationMs,
  validateScore,
} from '../src/model/score.js';

function sampleScore() {
  return createScore({
    title: 'Sample',
    tuning: 'standard',
    sections: [
      { title: 'One', events: [[[1, 0]], [[2, 1]]] },
      { title: 'Two', bars: [1], events: [[[6, 3]], [[1, 12]]] },
    ],
  });
}

test('notes get pitches from the score tuning', () => {
  const score = createScore({
    title: 'x',
    tuning: 'standard',
    sections: [{ events: [[[1, 0]], [[6, 0]], [[1, 5]]] }],
  });
  assert.equal(score.sections[0].events[0].notes[0].name, 'E4');
  assert.equal(score.sections[0].events[1].notes[0].name, 'E2');
  assert.equal(score.sections[0].events[2].notes[0].name, 'A4');
});

test('bars become barBefore flags on the following beat', () => {
  const score = createScore({
    title: 'x',
    sections: [{ bars: [2, 4], events: [[[1, 0]], [[1, 1]], [[1, 2]], [[1, 3]], [[1, 4]]] }],
  });
  const flags = score.sections[0].events.map((event) => event.barBefore);
  assert.deepEqual(flags, [false, false, true, false, true]);
});

test('default section titles are numbered', () => {
  const score = createScore({ sections: [{ events: [] }, { events: [] }] });
  assert.equal(score.sections[0].title, 'Section 1');
  assert.equal(score.sections[1].title, 'Section 2');
});

test('flattening keeps order, section and beat numbers', () => {
  const score = sampleScore();
  const steps = flattenScore(score);
  assert.equal(steps.length, 4);
  assert.deepEqual(
    steps.map((step) => [step.sectionIndex, step.beatIndex]),
    [[0, 0], [0, 1], [1, 0], [1, 1]],
  );
  assert.equal(steps[0].label, 'E-0');
  assert.equal(steps[3].label, 'E-12');
  assert.equal(steps[3].pitch, 'E5');
});

test('counts and ranges', () => {
  const score = sampleScore();
  assert.equal(beatCount(score), 4);
  assert.equal(highestFret(score), 12);
  assert.equal(highestFret(createScore({ sections: [] })), 0);
});

test('bad input is rejected with a useful message', () => {
  assert.throws(
    () => createScore({ sections: [{ events: [[[7, 0]]] }] }),
    /String 7 out of range 1\.\.6/,
  );
  assert.throws(() => createScore({ sections: [{ events: [[[1, -1]]] }] }), /Invalid fret/);
});

test('tempo maps to a step duration', () => {
  assert.equal(stepDurationMs(60), 1000);
  assert.equal(stepDurationMs(120), 500);
  assert.throws(() => stepDurationMs(0), /Invalid bpm/);
});

test('validation reports empty beats and wild frets', () => {
  const problems = validateScore(
    createScore({ sections: [{ events: [[[1, 0]], [], [[1, 30]]] }] }),
  );
  assert.ok(problems.some((problem) => problem.includes('empty beat')));
  assert.ok(problems.some((problem) => problem.includes('Fret 30')));
});
