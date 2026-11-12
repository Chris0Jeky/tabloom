import test from 'node:test';
import assert from 'node:assert/strict';

import { createScore } from '../src/model/score.js';
import { renderStaff } from '../src/render/staff.js';
import { renderFretboard } from '../src/render/fretboard.js';
import { escapeHtml } from '../src/util/html.js';

function score() {
  return createScore({
    title: 'Rendering <test>',
    tuning: 'standard',
    sections: [
      { title: 'One', events: [[[1, 0], [2, 1]], [[1, 2]], [[1, 3]]] },
      { title: 'Two', events: [[[6, 12]]] },
    ],
  });
}

test('markup is escaped', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.equal(escapeHtml(`a"b'c&d`), 'a&quot;b&#39;c&amp;d');
});

test('every beat gets a column cell on every string', () => {
  const html = renderStaff(score());
  assert.equal(html.match(/class="tl-cell"/g).length, 6 * 4);
  assert.ok(html.includes('data-col="0:0"'));
  assert.ok(html.includes('data-col="1:0"'));
  assert.ok(!html.includes('<script>'));
});

test('note names row is optional', () => {
  assert.ok(renderStaff(score(), { showNoteNames: true }).includes('tl-names'));
  assert.ok(!renderStaff(score()).includes('tl-names'));
});

test('section filter hides other sections', () => {
  const html = renderStaff(score(), { sectionFilter: 1 });
  assert.ok(!html.includes('data-section="0"'));
  assert.ok(html.includes('data-section="1"'));
});

test('bar lines are emitted before the beat they belong to', () => {
  const withBars = createScore({
    sections: [{ events: [[[1, 0]], [[1, 1]]].map((event, index) => ({ notes: event, barBefore: index === 1 })) }],
  });
  const html = renderStaff(withBars);
  // one bar cell per string row, plus one in the beat-number row
  assert.equal(html.match(/class="tl-bar"/g).length, 6 + 1);
});

test('the fretboard sizes itself to the highest fret used', () => {
  const html = renderFretboard(score());
  assert.ok(html.includes('grid-template-columns:36px repeat(6,1fr)'));
  assert.ok(html.includes('F12'));
  assert.ok(html.includes('open'));
});

test('the fretboard marks the sounding notes', () => {
  const html = renderFretboard(score(), { activeNotes: [{ string: 1, fret: 2 }] });
  assert.ok(html.includes('data-string="1" data-fret="2">\u25cf'));
  assert.equal(html.match(/\u25cf/g).length, 1);
});
