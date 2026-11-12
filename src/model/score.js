/**
 * The score model.
 *
 * A score is tuning-agnostic at the note level: notes are `{ string, fret }`
 * and every derived pitch is recomputed from the score's tuning.
 *
 *   score = {
 *     title, artist, meta, source,
 *     tuning: { id, label, midi, names },
 *     sections: [{ id, title, events: [{ notes, barBefore }] }],
 *     beatCount
 *   }
 *
 * `string` is 1-based and 1 is the highest-pitched string.
 */

import { midiToName } from './pitch.js';
import { resolveTuning, stringLabel } from './tuning.js';

function readPair(note) {
  if (Array.isArray(note)) return [note[0], note[1]];
  if (note && typeof note === 'object') {
    return [note.string ?? note.s, note.fret ?? note.f];
  }
  throw new TypeError(`Cannot read note: ${JSON.stringify(note)}`);
}

function normaliseNote(note, context) {
  const [rawString, rawFret] = readPair(note);
  const string = Number(rawString);
  const fret = Number(rawFret);

  if (!Number.isInteger(string) || string < 1 || string > context.stringCount) {
    throw new RangeError(
      `String ${rawString} out of range 1..${context.stringCount} in "${context.where}"`,
    );
  }
  if (!Number.isInteger(fret) || fret < 0) {
    throw new RangeError(`Invalid fret ${rawFret} in "${context.where}"`);
  }

  const midi = context.tuning.midi[context.stringCount - string] + fret;
  return { string, fret, midi, name: midiToName(midi) };
}

function normaliseSection(section, index, context) {
  const rawEvents = section.events ?? section.notes ?? [];
  if (!Array.isArray(rawEvents)) {
    throw new TypeError(`Section ${index + 1} has no events array`);
  }
  const bars = new Set((section.bars ?? []).map(Number));
  const title = section.title ?? section.name ?? `Section ${index + 1}`;

  const events = rawEvents.map((raw, beatIndex) => {
    const isBareChord = Array.isArray(raw);
    const rawNotes = isBareChord ? raw : (raw?.notes ?? []);
    const barBefore = isBareChord
      ? bars.has(beatIndex)
      : Boolean(raw?.barBefore ?? bars.has(beatIndex));

    return {
      notes: rawNotes.map((note) =>
        normaliseNote(note, { ...context, where: `${title} beat ${beatIndex + 1}` }),
      ),
      barBefore,
    };
  });

  return { id: section.id ?? `s${index + 1}`, title, events };
}

/** Build a validated score from loose input. */
export function createScore(input = {}) {
  const tuning = resolveTuning(input.tuning ?? 'standard');
  const context = { tuning, stringCount: tuning.midi.length };
  const rawSections = input.sections ?? [];

  if (!Array.isArray(rawSections)) {
    throw new TypeError('createScore: sections must be an array');
  }

  const sections = rawSections.map((section, index) => normaliseSection(section, index, context));

  return {
    title: input.title || 'Untitled',
    artist: input.artist || '',
    tuning,
    sections,
    meta: { ...(input.meta ?? {}) },
    source: input.source ?? '',
    beatCount: sections.reduce((total, section) => total + section.events.length, 0),
  };
}

/**
 * Flatten a score into a single playable sequence, the way a transport or a
 * "now playing" panel needs it.
 */
export function flattenScore(score) {
  const steps = [];
  score.sections.forEach((section, sectionIndex) => {
    section.events.forEach((event, beatIndex) => {
      steps.push({
        index: steps.length,
        sectionIndex,
        sectionTitle: section.title,
        beatIndex,
        barBefore: event.barBefore,
        notes: event.notes,
        strings: event.notes.map((note) => note.string),
        pitch: event.notes.map((note) => note.name).join(' + '),
        label: event.notes
          .map((note) => `${stringLabel(score.tuning, note.string)}-${note.fret}`)
          .join(' + '),
      });
    });
  });
  return steps;
}

/** Number of playable events in the score. */
export function beatCount(score) {
  return score.sections.reduce((total, section) => total + section.events.length, 0);
}

/** Highest fret used anywhere in the score (0 for an empty score). */
export function highestFret(score) {
  let highest = 0;
  score.sections.forEach((section) => {
    section.events.forEach((event) => {
      event.notes.forEach((note) => {
        if (note.fret > highest) highest = note.fret;
      });
    });
  });
  return highest;
}

/** Length of one playback step in milliseconds. */
export function stepDurationMs(bpm) {
  const tempo = Number(bpm);
  if (!Number.isFinite(tempo) || tempo <= 0) throw new RangeError(`Invalid bpm: ${bpm}`);
  return 60000 / tempo;
}

/** Collect non-fatal problems that are worth surfacing in a UI or a report. */
export function validateScore(score) {
  const problems = [];
  if (score.sections.length === 0) problems.push('Score has no sections');
  let empty = 0;
  score.sections.forEach((section, sectionIndex) => {
    if (section.events.length === 0) {
      problems.push(`Section ${sectionIndex + 1} ("${section.title}") has no events`);
    }
    section.events.forEach((event, beatIndex) => {
      if (event.notes.length === 0) empty += 1;
      event.notes.forEach((note) => {
        if (note.fret > 24) {
          problems.push(`Fret ${note.fret} is unusually high (section ${sectionIndex + 1}, beat ${beatIndex + 1})`);
        }
      });
    });
  });
  if (empty > 0) problems.push(`${empty} empty beat(s) in score`);
  return problems;
}
