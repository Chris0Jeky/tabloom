/**
 * Locating the tab in a frame.
 *
 * A tab is a stack of evenly spaced horizontal lines, and a horizontal line is
 * a strong vertical-gradient ridge that runs across the whole width. So we
 * build a row profile of vertical edge energy, pick the peaks, and look for a
 * run of them with consistent spacing. That is the tab band.
 *
 * If nothing convincing turns up we fall back to the middle of the frame and
 * say so, rather than guessing silently.
 */

function rowEdgeProfile(frame, width, height) {
  const profile = new Float64Array(height);
  for (let y = 0; y < height - 1; y += 1) {
    const top = y * width;
    const bottom = (y + 1) * width;
    let total = 0;
    for (let x = 0; x < width; x += 1) {
      total += Math.abs(frame[top + x] - frame[bottom + x]);
    }
    profile[y] = total / width;
  }
  return profile;
}

function mean(values) {
  let total = 0;
  for (const value of values) total += value;
  return values.length ? total / values.length : 0;
}

function peaksOf(profile, { minHeight, minSeparation = 3 }) {
  const peaks = [];
  for (let y = 1; y < profile.length - 1; y += 1) {
    const value = profile[y];
    if (value <= minHeight) continue;
    if (value < profile[y - 1] || value < profile[y + 1]) continue;

    const last = peaks[peaks.length - 1];
    if (last && y - last.y < minSeparation) {
      if (value > last.value) peaks[peaks.length - 1] = { y, value };
      continue;
    }
    peaks.push({ y, value });
  }
  return peaks;
}

function spacingScore(peaks) {
  if (peaks.length < 2) return { score: 0, spacing: 0 };
  const gaps = [];
  for (let i = 1; i < peaks.length; i += 1) gaps.push(peaks[i].y - peaks[i - 1].y);
  const average = mean(gaps);
  if (average <= 0) return { score: 0, spacing: 0 };
  const variance =
    gaps.reduce((total, gap) => total + (gap - average) ** 2, 0) / gaps.length;
  const spread = Math.sqrt(variance) / average;

  // Six evenly spaced lines within 12% of each other is a tab.
  return { score: Math.max(0, 1 - spread * 4), spacing: average, spread };
}

/**
 * @param {Uint8Array|Buffer} frame greyscale frame
 * @param {number} width
 * @param {number} height
 * @param {{stringCount?:number, padding?:number}} [options]
 */
export function detectTabBand(frame, width, height, options = {}) {
  const stringCount = options.stringCount ?? 6;
  const padding = options.padding ?? 1.6;

  const profile = rowEdgeProfile(frame, width, height);
  const average = mean(profile);
  const highest = profile.reduce((max, value) => Math.max(max, value), 0);

  if (highest < 3) {
    return {
      found: false,
      lines: [],
      confidence: 0,
      reason: 'frame has no horizontal structure',
    };
  }

  const minHeight = Math.max(average * 1.8, highest * 0.2);

  const peaks = peaksOf(profile, { minHeight });
  if (peaks.length < stringCount) {
    return {
      found: false,
      lines: peaks.map((peak) => peak.y),
      confidence: 0,
      reason: `found ${peaks.length} horizontal ridge(s), need ${stringCount}`,
    };
  }

  let best = null;
  for (let start = 0; start + stringCount <= peaks.length; start += 1) {
    const window = peaks.slice(start, start + stringCount);
    const { score, spacing } = spacingScore(window);
    if (!best || score > best.score) best = { score, spacing, window };
  }

  if (!best || best.score < 0.35) {
    return {
      found: false,
      lines: peaks.map((peak) => peak.y),
      confidence: best?.score ?? 0,
      reason: 'ridges were not evenly spaced',
    };
  }

  const top = Math.max(0, Math.round(best.window[0].y - best.spacing * padding));
  const bottom = Math.min(height, Math.round(best.window[best.window.length - 1].y + best.spacing * padding));

  return {
    found: true,
    top,
    bottom,
    left: 0,
    right: width,
    spacing: best.spacing,
    lines: best.window.map((peak) => peak.y),
    confidence: best.score,
    reason: 'evenly spaced horizontal ridges',
  };
}

/**
 * Collects band detections across a sample of frames and reports the median, so
 * a single bad frame (a hand crossing the tab, a cutaway) cannot move the crop.
 */
export class BandTracker {
  constructor(options = {}) {
    this.stringCount = options.stringCount ?? 6;
    this.sampleEvery = options.sampleEvery ?? 5;
    this.seen = 0;
    this.hits = [];
  }

  push(frame, width, height) {
    if (this.seen % this.sampleEvery !== 0) {
      this.seen += 1;
      return null;
    }
    this.seen += 1;
    const band = detectTabBand(frame, width, height, { stringCount: this.stringCount });
    if (band.found) this.hits.push(band);
    return band;
  }

  resolve() {
    if (this.hits.length === 0) {
      return { found: false, hits: 0, reason: 'no frame contained an evenly spaced line stack' };
    }
    const tops = this.hits.map((hit) => hit.top).sort((a, b) => a - b);
    const bottoms = this.hits.map((hit) => hit.bottom).sort((a, b) => a - b);
    const middle = Math.floor(tops.length / 2);
    return {
      found: true,
      top: tops[middle],
      bottom: bottoms[middle],
      hits: this.hits.length,
      confidence: this.hits.reduce((total, hit) => total + hit.confidence, 0) / this.hits.length,
    };
  }
}

/** Parse a `x,y,w,h` crop string. */
export function parseCrop(value) {
  if (!value) return null;
  const parts = String(value).split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`--crop must be "x,y,w,h", got "${value}"`);
  }
  const [x, y, w, h] = parts;
  return { x, y, w, h };
}
