/**
 * Pitch helpers.
 *
 * Everything downstream works in MIDI note numbers (0-127), where
 * 60 = middle C (C4) and 69 = A4 = 440 Hz.
 */

export const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

const LETTER_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTALS = { '': 0, '#': 1, b: -1, '\u266f': 1, '\u266d': -1 };

export const MIDI_MIN = 0;
export const MIDI_MAX = 127;

/** Format a MIDI number as a scientific pitch name, e.g. 40 -> "E2". */
export function midiToName(midi) {
  const m = Math.round(Number(midi));
  if (!Number.isFinite(m)) throw new TypeError(`Not a MIDI number: ${midi}`);
  const pitchClass = ((m % 12) + 12) % 12;
  const octave = Math.floor(m / 12) - 1;
  return NOTE_NAMES[pitchClass] + octave;
}

/** Pitch class name only, e.g. 64 -> "E". */
export function midiToPitchClass(midi) {
  return NOTE_NAMES[((Math.round(Number(midi)) % 12) + 12) % 12];
}

/** Equal-temperament frequency in Hz for a MIDI number. */
export function midiToFrequency(midi) {
  return 440 * 2 ** ((Number(midi) - 69) / 12);
}

/** Parse "E2", "Eb4", "F#3", "C-1" into a MIDI number. */
export function nameToMidi(name) {
  const match = /^([A-Ga-g])([#b\u266f\u266d]?)(-?\d+)$/.exec(String(name).trim());
  if (!match) throw new TypeError(`Not a note name: ${name}`);
  const letter = match[1].toUpperCase();
  const accidental = ACCIDENTALS[match[2]] ?? 0;
  const octave = Number.parseInt(match[3], 10);
  const pitchClass = (((LETTER_SEMITONES[letter] + accidental) % 12) + 12) % 12;
  return (octave + 1) * 12 + pitchClass;
}

/**
 * Pitch of a stopped note. `string` follows tab convention:
 * 1 = highest-pitched string, N = lowest.
 */
export function stoppedMidi(tuningMidi, string, fret) {
  const count = tuningMidi.length;
  const index = count - Number(string);
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(`String ${string} out of range 1..${count}`);
  }
  return tuningMidi[index] + Number(fret);
}
