# Capture pipeline

`tools/capture` turns a scrolling tab video into a tab the engine can play.

```bash
npm run capture -- <url | video-file | frames-dir> [options]
```

## Stages

### 1. Probe

`ffprobe` gives duration, dimensions and frame rate. Nothing is decoded yet.

### 2. Decode small

```
ffmpeg -i source -vf "fps=2,scale=480:270:flags=area,format=gray" \
       -f rawvideo -pix_fmt gray analyse.raw
```

Frames are raw 8-bit greyscale, so one frame is exactly `width × height` bytes.
That is the whole reason this needs no image library — we `read()` fixed-size
chunks and treat each chunk as a frame.

At 2 fps and 480 px wide, a ten-minute 1080p video becomes about 15 MB and 1,200
frames. Analysis is streamed: only the current frame and the best frame of each
shot are held in memory.

### 3. Find the tab band (pass 1)

A tab is a stack of evenly spaced horizontal lines, and a horizontal line is a
vertical-gradient ridge that runs the full width. So:

- build a row profile: for each row, the mean `|row[y+1] - row[y]|` across the width;
- take peaks above `max(mean × 1.8, max × 0.2)`;
- search every window of six consecutive peaks for consistent spacing, scoring
  `1 - 4 × (standard deviation / mean gap)`;
- accept above 0.35 confidence.

This runs on every fifth frame only, and the median top/bottom across hits wins,
so one occluded or cut-away frame cannot move the crop.

### 4. Segment into shots (pass 2)

Each frame becomes a 64×36 luminance signature — 2,304 cells. Two frames are
compared in 2,304 byte operations.

A new shot starts when any of these is true:

| signal | default | catches |
| --- | --- | --- |
| mean difference vs previous frame | ≥ 3 | cuts, big jumps |
| fraction of cells moving ≥ 6 levels | ≥ 0.5% | a tab scrolling one row |
| mean difference vs shot start | ≥ 7.5 | slow drift, pans |
| cell fraction vs shot start | ≥ 1.5% | long slow scrolls |

The cell-fraction signal exists for a measured reason: when a tab occupying a
fifth of the frame scrolls, the *mean* difference is only ~0.4 (below any sane
threshold) while the fraction of changed cells goes from 0% to ~2%. Mean alone
misses the scroll entirely.

Pass 2 measures only inside the band found in pass 1. Segmenting on the whole
frame lets a static background dilute the signal — the same scroll scored 1.8
mean globally versus a clean separation on the band.

### 5. Pick the readable frame

Within each shot, frames are ranked by mean absolute gradient. A frame caught
mid-scroll is smeared and scores low, so the sharpest frame is the readable one.
Shots shorter than `--min-shot` (0.6 s) are merged into a neighbour, and a shot
whose *content signature* matches one already kept is dropped as a repeat —
a tab that scrolls back is read once.

### 6. Crop and extract

Full-resolution frames are decoded only for the surviving shots, cropped to the
band, and written to `frames/shot-NN.png`. A 400-second video typically needs
fewer than a dozen extractions.

### 7. Read the frame (OCR)

`tesseract … makebox` gives **one box per character** — that is exactly the
geometry a tab needs:

- `box` lines are `char left bottom width height page`; top edge is `bottom - height`;
- digits are clustered into rows (strings) by vertical centre;
- adjacent digits closer than half a glyph height merge into one fret number;
- overlapping horizontal ranges merge into one chord column;
- `|` boxes mark bar lines, which become `barBefore` on the next beat.

Tesseract runs with a digit-and-bar whitelist and `--psm 6` by default.

### 8. Stitch

Each shot is a beat sequence. For shot *n+1*:

1. if the whole sequence already appears in the tab, skip it as contained;
2. otherwise find the longest suffix of the tab equal to the longest prefix of the
   shot (minimum 2 beats) and append only the remainder;
3. if nothing overlaps, append the shot anyway **and report a gap**. Joins are
   never invented silently.

### 9. Emit

| file | contents |
| --- | --- |
| `tab.txt` | ASCII tab with fixed-width beat fields, so columns align by construction |
| `score.json` | the score model |
| `report.json` | settings, band, shots, joins, warnings, round-trip check |
| `report.txt` | the same summary, readable |
| `frames/shot-NN.png` | the frames that were read |

`tab.txt` is immediately re-parsed with `parseAsciiTab`. If the beat count coming
back differs from the count written, the run reports
`round-trip mismatch` rather than claiming success.

## Options

```
--out <dir>            output directory (default ./capture)
--fps <n>              candidate frames per second (default 2)
--width <n>            analysis width (default 480)
--strings <n>          strings to expect (default: length of the tuning)
--tuning <name>        standard | dropD | dadgad | openG | openD | halfStepDown
--crop x,y,w,h         force the tab region in source pixels
--no-auto-crop         do not detect the band
--change <0-255>       mean-change threshold (default 3)
--change-fraction <p>  cell-fraction threshold in percent (default 0.5)
--duplicate <0-255>    repeat threshold (default 1.5)
--min-shot <s>         shortest shot worth keeping (default 0.6)
--ocr <mode>           auto | tesseract | none
--psm <n>              tesseract page segmentation mode (default 6)
--ocr-width <px>       width of the OCR frames (default 1800)
--start <s> --end <s>  analyse part of the video
--keep-frames          keep analyse.raw
```

## Requirements

| tool | needed for | install |
| --- | --- | --- |
| ffmpeg / ffprobe | everything | `winget install Gyan.FFmpeg`, `brew install ffmpeg`, `apt install ffmpeg` |
| yt-dlp | URL inputs | `winget install yt-dlp`, `pipx install yt-dlp` |
| tesseract | reading frames | `winget install UB-Mannheim.TesseractOCR`, `brew install tesseract`, `apt install tesseract-ocr` |

Without tesseract, `--ocr none` still extracts the selected, cropped frames — a
genuinely useful mode: a dozen sharp frames instead of scrubbing a timeline.

## Troubleshooting

**"segmented into 1 shot"** — the tab region is not being found. Try
`--no-auto-crop --crop 0,400,1920,600` with the real tab bounds, and lower
`--change-fraction`.

**"tab band not detected"** — the lines may be thin, low-contrast, or broken by
large chord blocks. Force `--crop`.

**OCR returns nothing** — check `frames/shot-01.png`. If the digits are tiny, raise
`--ocr-width 2400` or `--width 720`. If the crop is wrong, fix `--crop` first.

**Gaps in the report** — consecutive shots did not share beats. Usually means the
video scrolled further than a shot is wide, or a shot was dropped as a repeat.
Lower `--min-shot` and `--duplicate`.

**Wrong string assignment** — every detected text row is a string, top-down as
string 1. If the video's tab is written low-string-first, the notes will be
mirrored; parse the emitted tab with `{ reversed: true }` or fix it by hand.

## Verified behaviour

The pipeline is exercised against a generated video: three shots, each a tab
window with twelve glyph beats on six lines, with two intentionally blurred frames
at the start of each shot. Expected and observed:

```
tab band   y 158-372 (confidence 0.92)     <- lines at 200..330
shots      3 kept of 3                     <- 3 scroll positions
shot-01 @ 0.50s                            <- sharpest frame, not the blurred first frame
shot-02 @ 5.50s
shot-03 @ 11.00s
```

The pure stages are covered by `tests/capture.test.js`, which needs no ffmpeg.

## Ethics and legality

Only process video you have the right to process: your own recordings, Creative
Commons or explicitly licensed material, or tabs you have permission to
transcribe. Published tabs are themselves people's work. This tool exists to turn
*your* performance or a *licensed* teaching video into something you can practise
with — not to strip attribution from someone else's transcription.
