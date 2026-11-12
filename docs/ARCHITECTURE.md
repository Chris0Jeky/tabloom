# Architecture

`tabloom` is layered so that each layer can be used on its own. Nothing below the
player imports the DOM, and nothing in `src/` imports Node built-ins.

```
            ┌──────────────┐
  capture   │ video frames │  tooling, not shipped to browsers
            └──────┬───────┘
                   │ OCR -> beats
┌──────────────────▼───────────────────────────────────────────┐
│ src/model      tunings, pitch, score, flattening, validation  │
├──────────────────────────────────────────────────────────────┤
│ src/parse      ASCII tab  ──►  score                          │
│ src/render     score      ──►  HTML strings                   │
│ src/play       transport: tempo, loop, stepping, events       │
├──────────────────────────────────────────────────────────────┤
│ src/ui         player: mounts model + render + transport      │
└──────────────────────────────────────────────────────────────┘
```

## Invariants

Three conventions hold everywhere. Breaking one is a bug, not a style choice.

1. **Tuning is low string → high string.** `['E2','A2','D3','G3','B3','E4']`, the
   way a guitarist says it.
2. **Notes refer to strings as 1 = highest.** `{ string: 1, fret: 0 }` in standard
   tuning is E4. This matches how tabs are written: the top line is the thinnest
   string. Index arithmetic lives in exactly one function
   (`stoppedMidi` in `src/model/pitch.js`).
3. **Pitches are MIDI numbers.** 60 is C4, 69 is A4. Names are derived, never
   stored as the source of truth.

## The score

```js
{
  title, artist, meta, source,
  tuning: { id, label, midi: [40,45,50,55,59,64], names: ['E2',...] },
  sections: [
    { id, title, events: [ { notes: [{ string, fret, midi, name }], barBefore } ] }
  ],
  beatCount
}
```

An *event* is one beat; the notes inside it sound together. `barBefore` says a
bar line sits immediately before the beat. Scores are normalised in one place
(`createScore`), so anything built by hand, by the parser or by the capture
pipeline ends up identical in shape.

`flattenScore` gives the linear playback order the transport and the "now
playing" panel need, including a display label (`E-0`) and pitch label (`E4`).

## Parsing

The ASCII parser turns column alignment into rhythm, because that is what the
format already means to a guitarist:

- every token start column is compared with the previously seen token's *range*,
  so a wide `12` on one line groups with a `0` on another line inside that range;
- bar lines are columns owned by `|`, and become `barBefore` on the next beat;
- technique glyphs (`h p / \ ~ x *`) are ignored rather than rejected;
- tuning, title and artist can be declared in the text (`Tuning: DADGAD`).

See [TAB-FORMAT.md](TAB-FORMAT.md) for the full rules.

## Rendering

Both renderers return **strings**, not DOM nodes. That makes them usable in a
worker, in a server render, and in a test without a headless browser.

The staff is a `<table>` with fixed layout: one row per string, one column per
beat, bar lines as narrow cells. Every beat cell carries `data-col="section:beat"`.

Highlighting is deliberately *not* a re-render. `highlightStaff(root, active)`
removes `.tl-cur`/`.tl-hot` and re-applies them with two `querySelectorAll`
calls, so stepping through a 400-beat tab at 180 BPM never rebuilds the DOM. The
fretboard is tiny, so it *is* re-rendered each step.

## Transport

`createTransport` owns a counter and a clock. Two details matter:

- **The clock is injected.** Pass `{ scheduler: { setInterval, clearInterval } }`
  and a test can drive playback by hand, which is why 13 transport tests run in
  under a millisecond each.
- **Manual stepping wraps, playback stops.** Clicking *Next* on the last beat
  should wrap; reaching the last beat during playback should stop and emit `end`.
  Those are different intentions, so they are different code paths.

`play()` jumps to beat 0 immediately rather than waiting a full beat, because the
first click should do something visible.

## Player

`createPlayer(root, { score })` mounts a header, transport controls, progress
bar, fretboard, section filters and the staff. It delegates one click listener on
the container rather than binding per control, keeps a
`"section:beat" → global step` map so clicking a column can jump, and adds
arrow-key/space control that it removes again on `destroy()`.

Theme CSS is injected once per document and every colour is a custom property on
`.tl-player`, so a host can restyle it without forking.

## Capture pipeline

Lives in `tools/capture` and is described in [CAPTURE.md](CAPTURE.md). The one
architectural point worth repeating: it is a **two-pass** design over a raw
greyscale stream. Pass one finds the tab band; pass two segments using only that
band. Segmenting on the whole frame was tried and failed — a tab occupying a fifth
of the frame produced a 1.8% change when it scrolled, indistinguishable from a
blur transition, because the static background diluted the average.

## Testing

`npm test` runs `node:test` with no install step. The capture tests cover the
pure parts (signatures, segmentation, band detection, box parsing, stitching,
ASCII round-tripping) so CI needs neither ffmpeg nor tesseract. The
decode-and-OCR path is exercised by running the CLI against a synthetic video, as
described in CAPTURE.md.
