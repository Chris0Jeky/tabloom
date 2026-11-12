/**
 * ASCII tab parser.
 *
 * Turns the text format that guitarists already write:
 *
 *   # Verse
 *   e|--0--2--|
 *   B|--1-----|
 *   G|--------|
 *   ...
 *
 * into a score. Column alignment *is* the rhythm: everything that starts on the
 * same character column is one chord/beat, and `|` marks a bar line.
 *
 * Conventions
 * -----------
 * - The first tab line is string 1 (the highest string), matching how tabs are
 *   written. Pass `{ reversed: true }` for low-to-high tabs.
 * - Multi-digit frets (`-12-`) are read as one number.
 * - A token is grouped with the previous one when their character ranges
 *   overlap, which is what makes wide two-digit frets line up with single
 *   digits next to them.
 * - Non-digit glyphs (h, p, /, \, ~, x, *) are ignored, so hammer-ons and
 *   slides do not break parsing.
 */

import { createScore } from '../model/score.js';
import { resolveTuning } from '../model/tuning.js';

const TAB_CHARS = /^[\s\-–—0-9|/\\~hpbHPBxX*.]*$/;
const LABEL_PREFIX = /^\s*(?:[A-Ga-g][#b\u266f\u266d]?\s*\|)/;
const DIRECTIVE = /^\s*(title|artist|tuning|capo|source)\s*[:=]\s*(.+?)\s*$/i;
const HEADING = /^\s*(?:#{1,6}\s*(.+)|\[(.+?)\])\s*$/;

function isTabLine(line) {
  if (!line || line.trim().length < 3) return false;
  const body = stripLabel(line);
  if (!TAB_CHARS.test(body)) return false;
  return body.includes('-') || body.includes('|');
}

/** Drop trailing annotations such as `x2` or a comment two spaces away. */
function stripAnnotation(line) {
  return line
    .replace(/\s+[x×]\s*\d+\s*$/i, '')
    .replace(/\s{2,}.*$/, '')
    .replace(/\s+$/, '');
}

function stripLabel(line) {
  const match = LABEL_PREFIX.exec(line);
  return match ? line.slice(match[0].length) : line;
}

/**
 * Read a block of tab lines into `{ events, bars, width, warnings }`.
 * Events are ordered left to right; `barBefore` says a bar line sits
 * immediately before that event.
 */
export function parseTabLines(lines, options = {}) {
  const { reversed = false, stringCount = lines.length } = options;
  const warnings = [];

  const stripped = lines.map((line) => stripAnnotation(stripLabel(line)));
  const width = stripped.reduce((max, line) => Math.max(max, line.length), 0);
  const padded = stripped.map((line) => line.padEnd(width, ' '));

  const barColumns = [];
  for (let column = 0; column < width; column += 1) {
    if (padded.some((line) => line[column] === '|')) barColumns.push(column);
  }

  const lineCount = Math.min(padded.length, stringCount);
  if (padded.length !== stringCount) {
    warnings.push(
      `Tab has ${padded.length} string line(s) but the tuning has ${stringCount}; using the first ${lineCount}`,
    );
  }

  const tokens = [];
  for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
    const string = reversed ? lineIndex + 1 : lineIndex + 1;
    const line = padded[lineIndex];
    const pattern = /\d+/g;
    let match;
    while ((match = pattern.exec(line)) !== null) {
      tokens.push({
        string: reversed ? stringCount - string + 1 : string,
        fret: Number(match[0]),
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  tokens.sort((a, b) => a.start - b.start || a.string - b.string);

  const events = [];
  let group = null;
  for (const token of tokens) {
    if (group && token.start < group.end) {
      if (!group.notes.some((note) => note.string === token.string)) {
        group.notes.push({ string: token.string, fret: token.fret });
      } else {
        warnings.push(
          `Two frets on string ${token.string} at column ${token.start}; keeping the first`,
        );
      }
      group.end = Math.max(group.end, token.end);
    } else {
      group = { start: token.start, end: token.end, notes: [{ string: token.string, fret: token.fret }] };
      events.push(group);
    }
  }

  events.forEach((event, index) => {
    const previousStart = index === 0 ? -1 : events[index - 1].start;
    event.barBefore = barColumns.some(
      (column) => column > previousStart && column < event.start,
    );
  });

  const lastStart = events.length ? events[events.length - 1].start : -1;
  const trailingBar = barColumns.some((column) => column > lastStart);

  return {
    events: events.map((event) => ({ notes: event.notes, barBefore: event.barBefore })),
    bars: barColumns.length + (trailingBar ? 1 : 0),
    barColumns,
    trailingBar,
    width,
    stringCount: lineCount,
    warnings,
  };
}

/**
 * Parse a whole tab document into a score.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {string|string[]} [options.tuning='standard']
 * @param {string} [options.title]
 * @param {string} [options.artist]
 * @param {boolean} [options.reversed=false]
 * @param {boolean} [options.strict=false] Throw instead of collecting warnings.
 */
export function parseAsciiTab(text, options = {}) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  const lines = source.split('\n');

  let tuningInput = options.tuning ?? 'standard';
  let title = options.title ?? '';
  let artist = options.artist ?? '';

  const blocks = [];
  const warnings = [];
  let buffer = [];
  let pendingTitle = '';

  const flush = () => {
    if (buffer.length === 0) return;
    blocks.push({ lines: buffer, title: pendingTitle });
    buffer = [];
    pendingTitle = '';
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');

    if (isTabLine(line)) {
      buffer.push(line);
      continue;
    }

    flush();
    if (!line.trim()) continue;

    const directive = DIRECTIVE.exec(line);
    if (directive) {
      const key = directive[1].toLowerCase();
      const value = directive[2].trim();
      if (key === 'tuning') tuningInput = value;
      else if (key === 'title') title = title || value;
      else if (key === 'artist') artist = artist || value;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      pendingTitle = (heading[1] ?? heading[2]).trim();
      continue;
    }

    if (blocks.length === 0 && !title && line.trim().length < 80) {
      title = line.trim();
    }
  }
  flush();

  const tuning = resolveTuning(tuningInput);
  const sections = blocks.map((block, index) => {
    const parsed = parseTabLines(block.lines, {
      reversed: options.reversed,
      stringCount: tuning.midi.length,
    });
    warnings.push(...parsed.warnings.map((warning) => `Section ${index + 1}: ${warning}`));
    return {
      id: `s${index + 1}`,
      title: block.title || `Section ${index + 1}`,
      events: parsed.events,
      meta: { bars: parsed.bars, columns: parsed.width },
    };
  });

  const score = createScore({
    title,
    artist,
    tuning,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      events: section.events,
    })),
    source,
    meta: { warnings, sections: sections.map((section) => section.meta) },
  });

  if (options.strict && warnings.length) {
    throw new Error(`Tab warnings:\n${warnings.join('\n')}`);
  }

  return score;
}
