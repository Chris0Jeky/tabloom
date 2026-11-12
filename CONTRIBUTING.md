# Contributing

Thanks for looking. This project is small on purpose: no build step, no
dependencies, no framework. Please keep it that way unless there is a strong
reason not to.

## Getting started

```bash
git clone https://github.com/Chris0Jeky/tabloom.git
cd tabloom
npm test          # no install step; node:test only
npm start         # http://localhost:8080 for the demos
```

Node 20 or newer. The capture pipeline additionally wants `ffmpeg`, and
optionally `yt-dlp` and `tesseract` — but none of those are needed to develop or
test the engine.

## What is easy to contribute

- **A tab.** Add an example under `examples/` and a case to the parser tests.
- **A tuning.** Add it to `TUNINGS` in `src/model/tuning.js`, plus a test line.
- **A parser edge case.** Paste the tab that breaks into
  `tests/ascii-tab.test.js` as a literal, then make it pass.
- **A capture heuristic.** The thresholds in `tools/capture/analyse.mjs` were
  chosen from measurements; if you have a video that defeats them, the measurement
  is more useful than the tweak.

## Ground rules

1. **Tests first for behaviour.** `npm test` must pass, and new behaviour needs a
   test that would fail without it.
2. **No dependencies in `src/`.** If a feature genuinely needs a package, it goes
   in `tools/` and stays optional.
3. **Keep the invariants.** Tuning low→high, note strings 1 = highest, MIDI
   internally. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
4. **Match the surrounding code.** Two-space indent, ESM, named exports, JSDoc on
   exported functions, comments that explain *why*.
5. **Warnings over exceptions** where a human could still use the result — the
   parser and capture pipeline both collect warnings rather than failing.

## Pull requests

- One concern per PR.
- Say what you measured, if you changed a threshold.
- If you touched rendering, include a before/after screenshot.
- Commits: `area: what changed and why` — for example
  `parse: group two-digit frets with overlapping single digits`.

## Reporting bugs

Include the smallest tab (or the video timestamp) that reproduces it, the tuning,
and what you expected. For capture issues, attach the relevant shot PNG from
`capture/frames/` — that usually answers the question immediately.

## Code of conduct

Be decent. Assume the other person is trying. Critique the code, not the coder.
