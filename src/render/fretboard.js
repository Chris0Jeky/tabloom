/**
 * Fretboard renderer: a compact grid whose rows are frets and whose columns
 * are strings, with the strings currently sounding highlighted.
 */

import { escapeHtml } from '../util/html.js';
import { stringLabel } from '../model/tuning.js';
import { highestFret } from '../model/score.js';

/**
 * @param {object} score
 * @param {object} [options]
 * @param {{string:number, fret:number}[]} [options.activeNotes=[]]
 * @param {number} [options.frets] how many frets to draw (0..frets)
 * @param {boolean} [options.showFretNumbers=true]
 */
export function renderFretboard(score, options = {}) {
  const { activeNotes = [], showFretNumbers = true } = options;
  const stringCount = score.tuning.midi.length;

  const used = highestFret(score);
  const frets = options.frets ?? Math.min(Math.max(used + 1, 5), 24);

  // Low string on the left, high string on the right, like a chart.
  const strings = [];
  for (let string = stringCount; string >= 1; string -= 1) strings.push(string);

  const active = new Set(activeNotes.map((note) => `${note.string}:${note.fret}`));
  const activeStrings = new Set(activeNotes.map((note) => note.string));

  const parts = [
    '<div class="tl-fb-corner"></div>',
    ...strings.map((string) => {
      const label = escapeHtml(stringLabel(score.tuning, string));
      const hot = activeStrings.has(string) ? ' tl-hot' : '';
      return `<div class="tl-fb-head${hot}">${label}</div>`;
    }),
  ];

  for (let fret = 0; fret <= frets; fret += 1) {
    parts.push(
      `<div class="tl-fb-fret">${showFretNumbers ? (fret === 0 ? 'open' : `F${fret}`) : ''}</div>`,
    );
    for (const string of strings) {
      const on = active.has(`${string}:${fret}`);
      parts.push(
        `<div class="tl-fb-cell${on ? ' tl-hot' : ''}" data-string="${string}" data-fret="${fret}">` +
          (on ? '\u25cf' : '\u00b7') +
          '</div>',
      );
    }
  }

  return (
    '<div class="tl-fretboard" data-role="fretboard" ' +
    `style="grid-template-columns:36px repeat(${stringCount},1fr)">` +
    parts.join('') +
    '</div>'
  );
}
