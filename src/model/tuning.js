/**
 * Tunings are stored low string -> high string, which is how guitarists
 * read them ("E A D G B e"). Tab strings are the other way round:
 * string 1 is the *highest* string, string 6 the lowest.
 */

import { midiToName, nameToMidi } from './pitch.js';

export const TUNINGS = {
  standard: { label: 'Standard', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  dropD: { label: 'Drop D', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  halfStepDown: { label: 'Eb Standard', notes: ['D#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'] },
  dadgad: { label: 'DADGAD', notes: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  openG: { label: 'Open G', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  openD: { label: 'Open D', notes: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
  bass: { label: 'Bass (4)', notes: ['E1', 'A1', 'D2', 'G2'] },
};

export const TUNING_ALIASES = {
  eadgbe: 'standard',
  'e standard': 'standard',
  'drop d': 'dropD',
  dropd: 'dropD',
  'eb standard': 'halfStepDown',
  halfstepdown: 'halfStepDown',
  'half step down': 'halfStepDown',
  'open g': 'openG',
  'open d': 'openD',
};

const TUNING_KEYS = new Map(Object.keys(TUNINGS).map((key) => [key.toLowerCase(), key]));

/**
 * Normalise any tuning input into `{ id, label, midi, names }`.
 * Accepts a known name, an array of note names, or an array of MIDI numbers.
 */
export function resolveTuning(input = 'standard') {
  if (input && typeof input === 'object' && Array.isArray(input.midi)) {
    const names = input.midi.map((m) => midiToName(m));
    return { id: input.id ?? 'custom', label: input.label ?? 'Custom', midi: [...input.midi], names };
  }

  if (Array.isArray(input)) {
    if (input.length === 0) throw new TypeError('Tuning array is empty');
    const midi = input.map((entry) =>
      typeof entry === 'number' ? Math.round(entry) : nameToMidi(entry),
    );
    return { id: 'custom', label: 'Custom', midi, names: midi.map((m) => midiToName(m)) };
  }

  const key = String(input).trim();
  const lower = key.toLowerCase().replace(/[\s-]+/g, '');

  const directKey = TUNING_KEYS.get(key.toLowerCase()) ?? TUNING_KEYS.get(lower);
  if (directKey) {
    const direct = TUNINGS[directKey];
    const midi = direct.notes.map((n) => nameToMidi(n));
    return { id: directKey, label: direct.label, midi, names: [...direct.notes] };
  }

  const alias = TUNING_ALIASES[key.toLowerCase()] ?? TUNING_ALIASES[lower];
  if (alias) {
    const resolved = TUNINGS[alias];
    const midi = resolved.notes.map((n) => nameToMidi(n));
    return { id: alias, label: resolved.label, midi, names: [...resolved.notes] };
  }

  // Space separated note names, e.g. "D A D G A D".
  const tokens = key.split(/[\s,]+/).filter(Boolean);
  if (tokens.length >= 4 && tokens.every((t) => /^[A-Ga-g][#b]?-?\d+$/.test(t))) {
    const midi = tokens.map((t) => nameToMidi(t));
    return { id: 'custom', label: key, midi, names: midi.map((m) => midiToName(m)) };
  }

  throw new RangeError(
    `Unknown tuning "${input}". Known tunings: ${Object.keys(TUNINGS).join(', ')}`,
  );
}

/** MIDI number of an open string (1 = highest string). */
export function openStringMidi(tuning, string) {
  const count = tuning.midi.length;
  const index = count - Number(string);
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(`String ${string} out of range 1..${count}`);
  }
  return tuning.midi[index];
}

/** String label without the octave, e.g. string 1 in standard tuning -> "E". */
export function stringLabel(tuning, string) {
  const count = tuning.midi.length;
  return String(tuning.names[count - Number(string)] ?? '').replace(/-?\d+$/, '');
}
