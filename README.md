# tabloom

**An open-source engine for guitar tablature visualisation, a learning hub, and a
pipeline that reconstructs tabs from video.**

[![License: MIT](https://img.shields.io/badge/license-MIT-ffcf4d.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a.svg)](package.json)
[![Tests](https://img.shields.io/badge/tests-62%20passing-7cfc98.svg)](tests)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue.svg)](package.json)

No build step, no runtime dependencies, no framework. Plain ES modules that run in
a browser, in Node, or in a worker.

---

## Why

Tab visualisers get rewritten from scratch every time someone wants a follow-along
tab: one HTML file, one hand-encoded song, one throwaway parser. `tabloom` is the
engine that finds underneath all of them:

- **A model** for tunings, strings, frets and sections that stays correct when you
  change tuning.
- **A parser** for the ASCII tab people already write, where columns are rhythm.
- **Renderers** for a full-width tab staff and a fretboard, as plain HTML strings.
- **A transport** with tempo, looping and step navigation, testable without a DOM.
- **A player** that mounts all of it into one element and supports the keyboard.
- **A capture pipeline** that reads a scrolling tab video and gives you back a tab.

The last point is the one that usually does not exist anywhere: see
[`tools/capture`](tools/capture).

---

## Quick start

```bash
npm start          # http://localhost:8080 — the demos
npm test           # 62 tests, no network, no ffmpeg needed
```

ES modules need `http://`, not `file://`, hence the tiny static server.

### Use the engine

```html
<div id="app"></div>
<script type="module">
  import { parseAsciiTab, createPlayer } from './src/index.js';

  const score = parseAsciiTab(`
e|--0--2--3--2--|
B|--1--1--1--1--|
G|--0--0--0--0--|
D|--2--2--2--2--|
A|--3--3--3--3--|
E|--------------|`, { title: 'Example', tuning: 'standard' });

  createPlayer(document.getElementById('app'), { score, bpm: 60 });
</script>
```

### Build a score without writing text

```js
import { createScore, createPlayer } from 'tabloom';

const score = createScore({
  title: 'Concerning Hobbits',
  tuning: 'dadgad',
  sections: [
    { title: 'Intro', bars: [2, 6], events: [[[2, 3]], [[1, 0]], [[1, 2], [4, 0]]] },
  ],
});

createPlayer(document.querySelector('#app'), { score });
```

`events` are beats, `notes` inside a beat are a chord, and `bars` are beat numbers
after which a bar line falls.

---

## Reconstruct a tab from a video

```bash
npm run capture -- "https://www.youtube.com/watch?v=..." --tuning dadgad
```

```
[1/5] probing and decoding candidate frames
  video 1920x1080 @ 30.00 fps, 402.5s
  decoding candidate frames at 480x270, 2 fps
  tab band y 158-372: segmenting on the tab only
[2/5] segmented into 47 shot(s), keeping 9
[3/5] extracting the sharpest frame of each shot
[4/5] reading 9 frame(s) with tesseract
[5/5] stitching shots into one tab
  beats      268 reconstructed
```

Output lands in `./capture`:

| file | what it is |
| --- | --- |
| `tab.txt` | plain ASCII tab, parseable by the engine |
| `score.json` | the score model, tuning and sections included |
| `report.json` | every decision the pipeline made, with warnings |
| `frames/shot-NN.png` | the exact frames that were read |

### How it stays cheap

Reading every frame of a ten-minute video through OCR would be absurd. Instead:

1. **Decode small.** ffmpeg writes a low-resolution greyscale raw stream, so a
   frame is a `width × height` byte buffer and no image library is needed.
2. **Find the tab once.** Horizontal ridge detection locates the stack of six
   string lines, so the rest of the work happens on a crop.
3. **Split into shots cheaply.** Each frame becomes a 64×36 luminance signature;
   comparing two of them is 2,304 byte comparisons. A shot boundary is when more
   than 0.5% of those cells move.
4. **Keep only the sharpest frame per shot.** Mid-scroll frames are blurred, so
   mean gradient picks the readable one — instead of hoping the first frame was good.
5. **Deduplicate.** A tab that scrolls back to where it was is read once.
6. **Stitch by overlap.** Consecutive shots overlap; the longest suffix/prefix
   match on the beat sequence decides the join, and a missing overlap is reported
   rather than invented.

Full-resolution frames are only decoded for the shots that survive, and only those
go to OCR.

Requirements: **ffmpeg** (required), **yt-dlp** (only for URLs), **tesseract**
(only for reading frames — without it, `--ocr none` still extracts them).

---

## Layout

```
src/                 the engine
  model/             pitch, tunings, scores
  parse/             ASCII tab -> score
  render/            staff and fretboard -> HTML
  play/              transport (tempo, loop, stepping)
  ui/                the mountable player and its theme
tools/capture/       video -> tab pipeline
examples/            runnable demos
docs/                architecture, tab format, capture, roadmap
tests/               node:test suites
```

## Docs

- [Architecture](docs/ARCHITECTURE.md) — how the pieces fit and why
- [Tab format](docs/TAB-FORMAT.md) — exactly what the parser accepts
- [Capture pipeline](docs/CAPTURE.md) — frame selection, OCR, stitching
- [Roadmap](docs/ROADMAP.md) — where this goes next
- [Contributing](CONTRIBUTING.md)

## Status

`v0.1` and honest about it. The engine, parser, renderers, transport and capture
pipeline work and are covered by tests; the things in
[the roadmap](docs/ROADMAP.md) are not built yet. Issues and pull requests welcome.

## Licence

MIT — see [LICENSE](LICENSE).

Only run the capture pipeline on video you have the right to process: your own
recordings, Creative Commons material, or tabs you have permission to transcribe.
The tool is for transcription, not for redistributing other people's work.
