/**
 * Stitching shots into one tab.
 *
 * A tab video scrolls, so consecutive shots overlap: the last few beats of shot
 * N are the first few beats of shot N+1. We match on the beat sequence (which
 * string plays which fret), find the longest suffix/prefix match, and append
 * only the new tail. No overlap means we say so instead of silently fabricating
 * a join.
 */

/** Comparable identity of a beat, independent of position. */
export function beatSignature(event) {
  return event.notes
    .map((note) => `${note.string}:${note.fret}`)
    .sort()
    .join('+');
}

/**
 * Is the whole incoming shot already somewhere in the tab? A shot can be a
 * subset of what we have when the video pauses or repeats a section.
 */
function findContained(events, incoming) {
  if (incoming.length === 0 || incoming.length > events.length) return -1;
  const target = incoming.map(beatSignature).join('\u0001');
  for (let start = events.length - incoming.length; start >= 0; start -= 1) {
    const candidate = events
      .slice(start, start + incoming.length)
      .map(beatSignature)
      .join('\u0001');
    if (candidate === target) return start;
  }
  return -1;
}

/**
 * @param {{time:number, events:object[]}[]} shots in chronological order
 * @param {{minOverlap?:number}} [options]
 */
export function stitchShots(shots, options = {}) {
  const minOverlap = options.minOverlap ?? 2;
  const events = [];
  const joins = [];
  const warnings = [];

  for (const shot of shots) {
    const incoming = shot.events ?? [];
    if (incoming.length === 0) {
      joins.push({ time: shot.time, overlap: 0, appended: 0, empty: true });
      warnings.push(`shot at ${shot.time.toFixed(1)}s produced no beats`);
      continue;
    }

    const containedAt = findContained(events, incoming);
    if (containedAt !== -1) {
      joins.push({
        time: shot.time,
        overlap: incoming.length,
        appended: 0,
        contained: true,
        at: containedAt,
      });
      continue;
    }

    const limit = Math.min(events.length, incoming.length);
    let overlap = 0;
    for (let k = limit; k >= minOverlap; k -= 1) {
      let matches = true;
      for (let i = 0; i < k; i += 1) {
        if (beatSignature(events[events.length - k + i]) !== beatSignature(incoming[i])) {
          matches = false;
          break;
        }
      }
      if (matches) {
        overlap = k;
        break;
      }
    }

    const tail = incoming.slice(overlap);
    if (tail.length === 0) {
      joins.push({ time: shot.time, overlap, appended: 0, contained: true });
      continue;
    }

    events.push(...tail);
    joins.push({
      time: shot.time,
      overlap,
      appended: tail.length,
      gap: overlap === 0,
    });

    if (overlap === 0 && events.length > tail.length) {
      warnings.push(
        `no overlap between the shot at ${shot.time.toFixed(1)}s and the tab so far; ` +
          'the join is a guess',
      );
    }
  }

  return { events, joins, warnings };
}
