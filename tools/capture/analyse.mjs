/**
 * Frame analysis: deciding which frames are worth OCRing.
 *
 * Three cheap passes over the low-resolution greyscale stream:
 *
 * 1. Signature  - the frame reduced to a 32x18 luminance grid. Comparing two
 *                 signatures is 576 byte comparisons, so we can afford to do it
 *                 on every frame.
 * 2. Change     - a jump above `changeThreshold` starts a new shot. Huge jumps
 *                 are cuts, small ones are noise.
 * 3. Sharpness  - mean absolute gradient. A frame caught mid-scroll or
 *                 mid-dissolve is blurred, so within each shot we keep the
 *                 sharpest frame instead of the first one.
 *
 * The result is typically a dozen OCR jobs for a ten-minute video.
 */

export const GRID_COLS = 64;
export const GRID_ROWS = 36;

/** Reduce a greyscale frame (or a horizontal band of it) to a coarse luminance grid. */
export function signatureOf(frame, width, height, options = {}) {
  const {
    cols = GRID_COLS,
    rows = GRID_ROWS,
    top = 0,
    bottom = height,
  } = options;

  const bandTop = Math.max(0, Math.min(height - 1, Math.round(top)));
  const bandBottom = Math.max(bandTop + 1, Math.min(height, Math.round(bottom)));
  const bandHeight = bandBottom - bandTop;

  const signature = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    const y0 = bandTop + Math.floor((row * bandHeight) / rows);
    const y1 = Math.max(y0 + 1, bandTop + Math.floor(((row + 1) * bandHeight) / rows));
    for (let col = 0; col < cols; col += 1) {
      const x0 = Math.floor((col * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * width) / cols));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        const offset = y * width;
        for (let x = x0; x < x1; x += 1) {
          sum += frame[offset + x];
          count += 1;
        }
      }
      signature[row * cols + col] = count ? Math.round(sum / count) : 0;
    }
  }
  return signature;
}

/** Mean absolute difference between two signatures (0-255 scale). */
export function difference(a, b) {
  const length = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < length; i += 1) total += Math.abs(a[i] - b[i]);
  return length ? total / length : 0;
}

/**
 * Share of cells whose luminance moved by at least `cellThreshold`.
 *
 * This is the metric that catches a tab scrolling: moving text only shifts a
 * few percent of the cells, so the mean difference stays small while the
 * changed fraction jumps from 0 to a couple of percent.
 */
export function cellChangeFraction(a, b, cellThreshold = 6) {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let changed = 0;
  for (let i = 0; i < length; i += 1) {
    if (Math.abs(a[i] - b[i]) >= cellThreshold) changed += 1;
  }
  return changed / length;
}

/** Mean absolute gradient: high for crisp frames, low for motion blur. */
export function sharpnessOf(frame, width, height, options = {}) {
  const { top = 0, bottom = height } = options;
  const bandTop = Math.max(1, Math.min(height - 2, Math.round(top)));
  const bandBottom = Math.max(bandTop + 1, Math.min(height - 1, Math.round(bottom)));

  let total = 0;
  let count = 0;
  for (let y = bandTop; y < bandBottom; y += 1) {
    const offset = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const centre = frame[offset + x];
      total += Math.abs(centre - frame[offset + x + 1]) + Math.abs(centre - frame[offset + width + x]);
      count += 2;
    }
  }
  return count ? total / count : 0;
}

/**
 * Feed frames in order, get back the shots worth reading.
 *
 * `region` restricts both the change signature and the sharpness measure to a
 * horizontal band (the tab). Without it a tab that occupies a fifth of the
 * frame barely moves the global average, and slow scrolls would be missed.
 */
export class Segmenter {
  constructor(options = {}) {
    this.fps = Math.max(0.1, Number(options.fps) || 2);
    this.changeThreshold = Number(options.changeThreshold ?? 3);
    this.changeFraction = Number(options.changeFraction ?? 0.005);
    this.cellThreshold = Number(options.cellThreshold ?? 6);
    this.duplicateThreshold = Number(options.duplicateThreshold ?? 1.5);
    this.minShotSeconds = Number(options.minShotSeconds ?? 0.6);
    this.region = options.region ?? null;

    this.segments = [];
    this.current = null;
    this.previousSignature = null;
    this.frameCount = 0;
  }

  get measureOptions() {
    if (!this.region) return {};
    return { top: this.region.top, bottom: this.region.bottom };
  }

  push(frame, width, height, time) {
    const measure = this.measureOptions;
    const signature = signatureOf(frame, width, height, measure);
    const sharpness = sharpnessOf(frame, width, height, measure);

    const deltaPrevious = this.previousSignature ? difference(signature, this.previousSignature) : Infinity;
    const deltaStart = this.current ? difference(signature, this.current.startSignature) : Infinity;
    const movedPrevious = this.previousSignature
      ? cellChangeFraction(signature, this.previousSignature, this.cellThreshold)
      : Infinity;
    const movedStart = this.current
      ? cellChangeFraction(signature, this.current.startSignature, this.cellThreshold)
      : Infinity;

    const changed =
      deltaPrevious >= this.changeThreshold ||
      movedPrevious >= this.changeFraction ||
      deltaStart >= this.changeThreshold * 2.5 ||
      movedStart >= this.changeFraction * 3;

    if (!this.current || changed) {
      this.current = {
        startTime: time,
        endTime: time,
        startSignature: signature,
        lastSignature: signature,
        frameCount: 0,
        best: { time, sharpness, signature: signature.slice() },
        cut: deltaPrevious,
      };
      this.segments.push(this.current);
    }

    this.current.endTime = time;
    this.current.frameCount += 1;
    this.current.lastSignature = signature;
    if (sharpness > this.current.best.sharpness) {
      this.current.best = { time, sharpness, signature: signature.slice() };
    }

    this.previousSignature = signature;
    this.frameCount += 1;
    return changed;
  }

  /**
   * Drop shots too short to be real, then remove shots whose best frame shows
   * the same content as one already kept (a scroll that comes back).
   *
   * A short shot at the very start (usually the first frame, caught before the
   * video settles) is absorbed into the first real shot instead of becoming a
   * shot of its own.
   */
  finish() {
    const minFrames = Math.max(1, Math.round(this.minShotSeconds * this.fps));

    const kept = [];
    let pendingStart = null;

    for (const segment of this.segments) {
      if (segment.frameCount < minFrames) {
        if (kept.length > 0) {
          const previous = kept[kept.length - 1];
          previous.endTime = segment.endTime;
          previous.frameCount += segment.frameCount;
        } else if (pendingStart === null) {
          pendingStart = segment.startTime;
        }
        continue;
      }

      kept.push({
        startTime: pendingStart ?? segment.startTime,
        endTime: segment.endTime,
        frameCount: segment.frameCount,
        time: segment.best.time,
        sharpness: segment.best.sharpness,
        signature: segment.best.signature,
        duplicateOf: null,
      });
      pendingStart = null;
    }

    for (const segment of kept) {
      segment.duration = segment.endTime - segment.startTime + 1 / this.fps;
    }

    // A video shorter than one shot: fall back to a single shot for the whole
    // clip rather than returning nothing.
    let relaxed = false;
    if (kept.length === 0 && this.segments.length > 0) {
      relaxed = true;
      const first = this.segments[0];
      const last = this.segments[this.segments.length - 1];
      let best = first.best;
      let frames = 0;
      for (const segment of this.segments) {
        frames += segment.frameCount;
        if (segment.best.sharpness > best.sharpness) best = segment.best;
      }
      kept.push({
        startTime: first.startTime,
        endTime: last.endTime,
        frameCount: frames,
        duration: last.endTime - first.startTime + 1 / this.fps,
        time: best.time,
        sharpness: best.sharpness,
        signature: best.signature,
        duplicateOf: null,
      });
    }

    const unique = [];
    let order = 0;
    for (const segment of kept) {
      const match = unique.find(
        (candidate) =>
          difference(candidate.signature, segment.signature) < this.duplicateThreshold &&
          cellChangeFraction(candidate.signature, segment.signature, this.cellThreshold) <
            this.changeFraction,
      );
      if (match) {
        segment.duplicateOf = match.order;
        continue;
      }
      segment.order = order;
      order += 1;
      unique.push(segment);
    }

    return {
      shots: unique,
      dropped: kept.length - unique.length,
      totalFrames: this.frameCount,
      totalSegments: kept.length,
      relaxed,
    };
  }
}
