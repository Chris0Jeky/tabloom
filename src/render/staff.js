/**
 * Staff renderer: turns a score into a playable tab grid.
 *
 * Returns an HTML string, so it works in the browser, in a worker, or on a
 * server that streams markup. Highlighting is a separate cheap pass so a
 * transport can move without re-rendering the whole tab.
 */

import { cx, escapeHtml, pitchClassLabel } from '../util/html.js';
import { stringLabel } from '../model/tuning.js';

function renderRow(score, section, sectionIndex, string, options) {
  const label = stringLabel(score.tuning, string);
  const cells = [];

  section.events.forEach((event, beatIndex) => {
    if (options.showBarLines && event.barBefore) {
      cells.push('<td class="tl-bar" aria-hidden="true"></td>');
    }
    const note = event.notes.find((candidate) => candidate.string === string);
    cells.push(
      `<td class="tl-cell" data-col="${sectionIndex}:${beatIndex}" data-string="${string}">` +
        (note
          ? `<span class="tl-note">${escapeHtml(note.fret)}</span>`
          : '<span class="tl-rest">\u00b7</span>') +
        '</td>',
    );
  });

  return (
    `<tr><th class="tl-string" data-string="${string}">${escapeHtml(label)}</th>` +
    cells.join('') +
    '</tr>'
  );
}

function renderBeatNumbers(section, sectionIndex, options) {
  const cells = [];
  section.events.forEach((event, beatIndex) => {
    if (options.showBarLines && event.barBefore) {
      cells.push('<td class="tl-bar" aria-hidden="true"></td>');
    }
    cells.push(`<td>${beatIndex + 1}</td>`);
  });
  return `<tr class="tl-beats"><th class="tl-string">#</th>${cells.join('')}</tr>`;
}

function renderNoteNames(section) {
  const cells = [];
  section.events.forEach((event) => {
    if (event.barBefore) cells.push('<td class="tl-bar" aria-hidden="true"></td>');
    const names = event.notes.map((note) => pitchClassLabel(note.name)).join('+');
    cells.push(`<td>${escapeHtml(names)}</td>`);
  });
  return `<tr class="tl-names"><th class="tl-string">note</th>${cells.join('')}</tr>`;
}

/**
 * @param {object} score
 * @param {object} [options]
 * @param {{sectionIndex:number, beatIndex:number}|null} [options.active]
 * @param {number} [options.sectionFilter=-1] -1 shows everything
 * @param {boolean} [options.showNoteNames=false]
 * @param {boolean} [options.showBeatNumbers=true]
 * @param {boolean} [options.showBarLines=true]
 */
export function renderStaff(score, options = {}) {
  const {
    sectionFilter = -1,
    showNoteNames = false,
    showBeatNumbers = true,
    showBarLines = true,
  } = options;

  const stringCount = score.tuning.midi.length;
  const sections = [];

  score.sections.forEach((section, sectionIndex) => {
    if (sectionFilter !== -1 && sectionFilter !== sectionIndex) return;

    const rows = [];
    for (let string = 1; string <= stringCount; string += 1) {
      rows.push(renderRow(score, section, sectionIndex, string, { showBarLines }));
    }
    if (showBeatNumbers) rows.push(renderBeatNumbers(section, sectionIndex, { showBarLines }));
    if (showNoteNames) rows.push(renderNoteNames(section));

    sections.push(
      '<section class="tl-section" data-section="' + sectionIndex + '">' +
        '<h2 class="tl-section-title">' +
        `<span class="tl-section-index">${sectionIndex + 1}</span>` +
        `<span>${escapeHtml(section.title)}</span>` +
        `<span class="tl-section-count">${section.events.length} beats</span>` +
        '</h2>' +
        '<div class="tl-card">' +
        `<div class="tl-card-bar">${escapeHtml(section.title)} \u00b7 left \u2192 right \u00b7 top line = highest string</div>` +
        '<div class="tl-scroll"><table class="tl-grid">' +
        '<tbody>' +
        rows.join('') +
        '</tbody></table></div>' +
        '</div>' +
        '</section>',
    );
  });

  return `<div class="tl-staff" data-role="staff">${sections.join('')}</div>`;
}

/**
 * Move the "you are here" highlight without rebuilding the tab.
 * @param {ParentNode} root element containing the rendered staff
 * @param {{sectionIndex:number, beatIndex:number, strings?:number[]}|null} active
 */
export function highlightStaff(root, active) {
  if (!root) return;
  root.querySelectorAll('.tl-cur').forEach((el) => el.classList.remove('tl-cur'));
  root.querySelectorAll('.tl-hot').forEach((el) => el.classList.remove('tl-hot'));
  if (!active) return;

  const selector = `[data-col="${active.sectionIndex}:${active.beatIndex}"]`;
  root.querySelectorAll(selector).forEach((el) => el.classList.add('tl-cur'));

  (active.strings ?? []).forEach((string) => {
    const label = root.querySelector(`.tl-string[data-string="${string}"]`);
    if (label) label.classList.add('tl-hot');
  });
}

export const staffClassName = cx('tl-staff');
