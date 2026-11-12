/**
 * tabloom — an open-source engine for guitar tablature visualisation.
 *
 * Browser-safe: no Node built-ins, no dependencies.
 */

export {
  NOTE_NAMES,
  MIDI_MIN,
  MIDI_MAX,
  midiToName,
  midiToPitchClass,
  midiToFrequency,
  nameToMidi,
  stoppedMidi,
} from './model/pitch.js';

export {
  TUNINGS,
  TUNING_ALIASES,
  resolveTuning,
  openStringMidi,
  stringLabel,
} from './model/tuning.js';

export {
  createScore,
  flattenScore,
  beatCount,
  highestFret,
  stepDurationMs,
  validateScore,
} from './model/score.js';

export { parseAsciiTab, parseTabLines } from './parse/ascii-tab.js';

export { renderStaff, highlightStaff } from './render/staff.js';
export { renderFretboard } from './render/fretboard.js';

export { createTransport } from './play/transport.js';

export { createPlayer } from './ui/player.js';
export { themeStyles, ensureTheme } from './ui/theme.js';

export { escapeHtml, cx, pitchClassLabel } from './util/html.js';
