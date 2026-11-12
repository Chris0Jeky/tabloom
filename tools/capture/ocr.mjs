/**
 * OCR adapter: tesseract's `makebox` output gives one box per character, which
 * is exactly what a tab needs. A character box tells us which string (by y) and
 * which column (by x), so chord grouping becomes geometry rather than guesswork.
 *
 * tesseract is optional. If it is missing the pipeline still produces the
 * selected frames so you can transcribe by eye.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { execTool, hasTool } from './bin.mjs';

const BAR_CHARS = /[|Il\u00a6\u2502]/;
const DIGIT_CHARS = /[0-9]/;

export async function detectOcr() {
  const found = await hasTool('tesseract');
  return { available: found, tool: 'tesseract' };
}

/**
 * Box file lines look like: `0 114 231 9 17 0`
 * i.e. char, left, bottom, width, height, page. `bottom` is measured from the
 * top of the image, so the top edge is `bottom - height`.
 */
export function parseBoxFile(text) {
  const boxes = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 5) continue;

    const [char, left, bottom, width, height] = parts;
    const x = Number(left);
    const yBottom = Number(bottom);
    const w = Number(width);
    const h = Number(height);
    if (![x, yBottom, w, h].every(Number.isFinite)) continue;
    if (w <= 0 || h <= 0) continue;

    boxes.push({
      char,
      x,
      y: yBottom - h,
      w,
      h,
      width: w,
      height: h,
      centerX: x + w / 2,
      centerY: yBottom - h / 2,
    });
  }
  return boxes;
}

/** Run tesseract on one image and return its character boxes. */
export async function readBoxes(imagePath, options = {}) {
  const {
    psm = 6,
    lang = 'eng',
    tesseract = 'tesseract',
    keepTemp = false,
    whitelist = '0123456789|',
  } = options;

  const dir = await mkdtemp(join(tmpdir(), 'tabloom-ocr-'));
  const base = join(dir, 'frame');
  try {
    const args = [imagePath, base, '-l', lang, '--psm', String(psm)];
    if (whitelist) args.push('-c', `tessedit_char_whitelist=${whitelist}`);
    args.push('makebox');

    await execTool(tesseract, args, { timeout: 120000 });
    const text = await readFile(`${base}.box`, 'utf8');
    return parseBoxFile(text);
  } finally {
    if (!keepTemp) await rm(dir, { recursive: true, force: true });
  }
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Turn character boxes into tab events.
 *
 * @param {object[]} boxes
 * @param {{stringCount?:number, mergeGap?:number}} [options]
 */
export function boxesToShot(boxes, options = {}) {
  const stringCount = options.stringCount ?? 6;
  const warnings = [];

  const digits = boxes.filter((box) => DIGIT_CHARS.test(box.char));
  const bars = boxes.filter((box) => BAR_CHARS.test(box.char));

  if (digits.length === 0) {
    return { events: [], warnings: ['no digits recognised in this frame'], confidence: 0 };
  }

  const glyphHeight = median(digits.map((box) => box.height));

  // 1. Cluster characters into rows = strings.
  const sorted = [...digits].sort((a, b) => a.centerY - b.centerY);
  const rows = [];
  for (const box of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(box.centerY - row.center) <= glyphHeight * 0.6) {
      row.items.push(box);
      row.center = median(row.items.map((item) => item.centerY));
    } else {
      rows.push({ center: box.centerY, items: [box] });
    }
  }

  let selected = rows;
  if (rows.length > stringCount) {
    selected = [...rows]
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, stringCount)
      .sort((a, b) => a.center - b.center);
    warnings.push(`found ${rows.length} text rows, kept the ${stringCount} densest`);
  } else if (rows.length < stringCount) {
    warnings.push(`only ${rows.length} of ${stringCount} string rows were readable`);
  }

  // 2. Merge adjacent digits into fret numbers.
  const numbers = [];
  selected.forEach((row, rowIndex) => {
    const items = [...row.items].sort((a, b) => a.x - b.x);
    const rowNumbers = [];
    for (const item of items) {
      const last = rowNumbers[rowNumbers.length - 1];
      if (last && item.x - (last.x + last.w) <= glyphHeight * 0.5) {
        last.value += item.char;
        last.w = item.x + item.w - last.x;
      } else {
        rowNumbers.push({ value: item.char, x: item.x, w: item.w, y: item.centerY });
      }
    }
    for (const number of rowNumbers) {
      numbers.push({ ...number, string: rowIndex + 1 });
    }
  });

  // 3. Group overlapping x-ranges into chord columns.
  const ordered = [...numbers].sort((a, b) => a.x - b.x);
  const columns = [];
  for (const number of ordered) {
    const last = columns[columns.length - 1];
    if (last && number.x < last.end) {
      if (!last.notes.some((note) => note.string === number.string)) {
        last.notes.push({ string: number.string, fret: Number(number.value) });
      }
      last.end = Math.max(last.end, number.x + number.w);
    } else {
      columns.push({
        x: number.x,
        end: number.x + number.w,
        notes: [{ string: number.string, fret: Number(number.value) }],
      });
    }
  }

  // 4. Bar lines tell us where a bar starts.
  const barColumns = bars.map((bar) => bar.centerX).sort((a, b) => a - b);
  columns.forEach((column, index) => {
    const previousEnd = index === 0 ? -Infinity : columns[index - 1].end;
    column.barBefore = barColumns.some((x) => x > previousEnd && x < column.x);
  });

  const events = columns.map((column) => ({
    notes: column.notes.sort((a, b) => a.string - b.string),
    barBefore: column.barBefore,
  }));

  const badNote = events
    .flatMap((event) => event.notes)
    .find((note) => note.fret > 24 || Number.isNaN(note.fret));
  if (badNote) warnings.push(`suspicious fret ${badNote.fret} on string ${badNote.string}`);

  const confidence = Math.min(1, selected.length / stringCount);

  return { events, warnings, confidence, rows: selected.length };
}
