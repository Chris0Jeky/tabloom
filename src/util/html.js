/**
 * Small, dependency-free helpers for building HTML strings.
 */

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape a value for safe interpolation into HTML text or an attribute. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

/** Join class names, skipping falsy entries. */
export function cx(...names) {
  return names.filter(Boolean).join(' ');
}

/** Strip a trailing octave number, e.g. "E4" -> "E". */
export function pitchClassLabel(name) {
  return String(name ?? '').replace(/-?\d+$/, '');
}
