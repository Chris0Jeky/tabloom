/**
 * Serialising a reconstructed tab back into the ASCII format the engine parses.
 * Every beat uses a fixed-width field, so columns line up by construction and
 * the output round-trips through `parseAsciiTab`.
 */

import { stringLabel } from '../../src/model/tuning.js';

/**
 * @param {{notes:{string:number,fret:number}[], barBefore?:boolean}[]} events
 * @param {{tuning:object, sectionsPerBlock?:number}} options
 */
export function eventsToTab(events, options) {
  const { tuning } = options;
  const stringCount = tuning.midi.length;
  const fretDigits = Math.max(
    1,
    ...events.flatMap((event) => event.notes.map((note) => String(note.fret).length)),
  );
  const field = fretDigits + 2;

  const rows = Array.from({ length: stringCount }, () => '');

  for (const event of events) {
    if (event.barBefore) {
      for (let row = 0; row < stringCount; row += 1) rows[row] += '|';
    }
    for (let string = 1; string <= stringCount; string += 1) {
      const note = event.notes.find((candidate) => candidate.string === string);
      rows[string - 1] += note
        ? `-${String(note.fret).padStart(fretDigits, '-')}-`
        : '-'.repeat(field);
    }
  }

  // Closing bar so the last bar is visible.
  for (let row = 0; row < stringCount; row += 1) rows[row] += '|';

  return rows
    .map((row, index) => `${stringLabel(tuning, index + 1)}|${row}`)
    .join('\n');
}

/** Human-readable summary of the reconstruction. */
export function renderReport(report) {
  const lines = [];
  lines.push(`tabloom capture: ${report.input}`);
  if (report.video) {
    lines.push(
      `  video      ${report.video.width}x${report.video.height} @ ${report.video.fps.toFixed(2)} fps, ` +
        `${report.video.duration.toFixed(1)}s`,
    );
  }
  if (report.analysis) {
    lines.push(
      `  analysis   ${report.analysis.frames} frames at ${report.analysis.width}x${report.analysis.height} ` +
        `(${report.analysis.fps} fps)`,
    );
  }
  if (report.segmentation) {
    lines.push(`  shots      ${report.shots.length} kept of ${report.segmentation.totalSegments}`);
  } else {
    lines.push(`  shots      ${report.shots.length} image(s)`);
  }
  if (report.band?.found) {
    lines.push(`  tab band   y ${report.band.top}-${report.band.bottom} (confidence ${report.band.confidence.toFixed(2)})`);
  } else {
    lines.push(`  tab band   not detected${report.band?.reason ? ` (${report.band.reason})` : ''}`);
  }

  lines.push(`  ocr        ${report.ocr.engine}${report.ocr.available ? '' : ' (unavailable)'}`);
  lines.push(`  beats      ${report.result.beats} reconstructed`);
  if (report.result.joins.length) {
    lines.push('  joins');
    for (const join of report.result.joins) {
      lines.push(
        `    ${join.time.toFixed(1).padStart(6)}s  overlap ${String(join.overlap).padStart(2)}  +${join.appended}` +
          (join.gap ? '  GAP' : ''),
      );
    }
  }
  if (report.warnings.length) {
    lines.push('  warnings');
    for (const warning of report.warnings) lines.push(`    - ${warning}`);
  }
  return lines.join('\n');
}
