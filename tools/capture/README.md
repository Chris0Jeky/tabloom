# tools/capture

Turns a scrolling tab video into a tab. Full documentation, thresholds and
troubleshooting live in [../../docs/CAPTURE.md](../../docs/CAPTURE.md).

```
tabloom-capture <url | video-file | frames-dir> [options]
```

| module | responsibility |
| --- | --- |
| `cli.mjs` | argument parsing, orchestration, output files |
| `bin.mjs` | process helpers, ffprobe |
| `frames.mjs` | greyscale raw decode, single-frame extraction |
| `analyse.mjs` | signatures, change detection, shot segmentation |
| `locate.mjs` | tab band detection, band voting |
| `ocr.mjs` | tesseract box files → beats |
| `assemble.mjs` | overlap stitching |
| `emit.mjs` | ASCII tab output and the report |

Nothing here is imported by the browser engine. `analyse.mjs`, `assemble.mjs`,
`emit.mjs`, `ocr.mjs` and `locate.mjs` are pure functions and are tested in
`tests/capture.test.js` without ffmpeg or tesseract.
