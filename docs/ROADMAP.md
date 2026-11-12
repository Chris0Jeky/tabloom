# Roadmap

`v0.1` is the engine plus a working capture pipeline. This is what is next, in
rough dependency order.

## Near

- **Guitar Pro import** — `.gp3`/`.gp4`/`.gp5` and MusicXML → score. Both carry
  durations, which the ASCII format cannot, so the model needs `duration` on a
  beat first.
- **Durations and rests.** A beat today is an event. Add `duration` (in beats) and
  `rest`, keep `beatIndex` derived, and teach the staff renderer about ties.
- **Capo and transposition.** `Capo:` is parsed and ignored; apply it to the
  displayed pitch without moving the fret.
- **Web Audio playback.** The transport already emits a step at a tempo; add an
  oscillator/sample layer so the tab can be *heard*, not just followed. Should be
  optional and silent by default.
- **Print stylesheet.** A tab that prints cleanly on one page, because that is how
  most people actually practise.

## Capture

- **Digit glyph clustering instead of OCR.** Tab digits are rendered from a handful
  of glyphs. Connected-component analysis plus clustering lets a human label each
  cluster once, which should beat OCR on stylised fonts and needs no tesseract.
  OCR stays as the fallback.
- **Bar-line detection from the image**, rather than relying on tesseract reading
  `|`. The band detector already finds horizontal ridges; vertical ones give bars.
- **Vertical scrolling tabs.** Current stitching assumes horizontal scroll. The
  same overlap logic works on rows if the reading order is detected.
- **Confidence per beat.** A beat read from one clear shot is worth more than one
  assembled from an overlap guess. Surface it so a human knows where to look.
- **Hand-off UI.** Open the extracted frames beside the reconstructed tab for a
  human to confirm or correct, then save. This is the biggest accuracy win
  available and it is a UI problem, not an OCR one.

## Learning hub

The "hub" part is deliberately unbuilt. It needs a format first.

- **Lesson documents.** A tab plus annotations: "this is the hard bar", "keep the
  thumb behind the neck here", "loop beats 12–20 at 60".
- **Practice mode.** Loop a range, ramp the tempo, record which bars you fumble.
- **Progress that means something.** Not streaks — "you can play this at 92 BPM
  cleanly; the target is 120".
- **Shared library.** Static hosting of lesson files, each one a JSON document, so
  a lesson is a file you can fork, like this repository.

## Engineering

- **Publish to npm** once the model stops changing.
- **A browser-only capture demo** — no ffmpeg — by decoding with `WebCodecs` in a
  worker and reading frames with `OffscreenCanvas`. Same pipeline, no install.
- **Visual regression tests** for the renderers, currently only asserted
  structurally.
- **Benchmarks** for segmentation over a long video, so "cheap" stays true.
