#!/usr/bin/env node
/**
 * tabloom-capture — reconstruct a tab from a video.
 *
 *   tabloom-capture <youtube-url | video-file | frames-dir> [options]
 *
 * Pipeline:
 *   probe -> low-res greyscale stream -> shot segmentation -> sharpest frame
 *   per shot -> optional band auto-crop -> OCR -> overlap stitching -> ASCII tab
 *
 * Only a dozen full-resolution frames are ever decoded, and only those go
 * through OCR, which is what keeps a long video cheap.
 */

import { mkdir, readdir, writeFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { execTool, probeVideo, scaledHeight, hasTool } from './bin.mjs';import { extractGrayStream, grabFrame, readGrayFrames } from './frames.mjs';
import { Segmenter } from './analyse.mjs';
import { BandTracker, parseCrop } from './locate.mjs';
import { detectOcr, readBoxes, boxesToShot } from './ocr.mjs';
import { stitchShots } from './assemble.mjs';
import { eventsToTab, renderReport } from './emit.mjs';
import { parseAsciiTab, createScore, resolveTuning } from '../../src/index.js';

const DEFAULTS = {
  out: 'capture',
  fps: 2,
  width: 480,
  strings: 6,
  tuning: 'standard',
  change: 3,
  changeFraction: 0.5,
  duplicate: 1.5,
  minShot: 0.6,
  ocr: 'auto',
  psm: 6,
  lang: 'eng',
  ocrWidth: 1800,
};

function log(message) {
  process.stderr.write(`${message}\n`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const [rawKey, inline] = token.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inline !== undefined) {
      args[key] = inline;
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function printUsage() {
  log(`tabloom-capture — reconstruct a guitar tab from a video

Usage
  tabloom-capture <url | video-file | frames-dir> [options]

Options
  --out <dir>         Output directory (default ./capture)
  --fps <n>           Candidate frames per second to analyse (default 2)
  --width <n>         Analysis width in pixels (default 480)
  --strings <n>       Strings to expect (default 6)
  --tuning <name>     standard | dropD | dadgad | openG | openD | EB standard (default standard)
  --crop x,y,w,h      Force the tab region in source pixels
  --no-auto-crop      Do not try to find the tab band automatically
  --change <0-255>    Mean frame change that starts a new shot (default 3)
  --change-fraction <pct>  Share of the tab that must change for a new shot (default 0.5)
  --duplicate <0-255> Shots closer than this are treated as repeats (default 1.5)
  --min-shot <s>      Shortest shot worth keeping, in seconds (default 0.6)
  --ocr <mode>        auto | tesseract | none (default auto)
  --psm <n>           Tesseract page segmentation mode (default 6)
  --ocr-width <px>    Width used for the OCR frames (default 1800)
  --start <s> --end <s>  Analyse only part of the video
  --keep-frames       Keep the analysis stream and every shot
  --help              This text

Outputs
  tab.txt      ASCII tab the engine can parse
  score.json   Score model (tuning, sections, beats)
  report.json  What the pipeline decided, and why
`);
}

async function resolveInput(input, outDir) {
  if (/^https?:\/\//i.test(input)) {
    if (!(await hasTool('yt-dlp'))) {
      throw new Error(
        'This input is a URL but yt-dlp is not installed.\n' +
          '  Install it (pipx install yt-dlp, or winget install yt-dlp) and run again,\n' +
          '  or download the video yourself and pass the local file path.',
      );
    }
    await mkdir(outDir, { recursive: true });
    log('  fetching video with yt-dlp (lowest height that keeps the tab legible)');
    await execTool(
      'yt-dlp',
      [
        '-f', 'bv*[height<=480]/b[height<=480]/bv*[height<=720]/b',
        '--no-playlist',
        '--no-progress',
        '-o', join(outDir, 'source.%(ext)s'),
        input,
      ],
      { timeout: 0 },
    );
    const files = await readdir(outDir);
    const source = files.find((file) => /^source\.(mp4|mkv|webm|mov)$/i.test(file));
    if (!source) throw new Error('yt-dlp finished but no video file was found');
    return { file: join(outDir, source), downloaded: true };
  }

  const absolute = resolve(input);
  const info = await stat(absolute);
  if (info.isDirectory()) return { file: absolute, directory: true };
  return { file: absolute, downloaded: false };
}

async function analyseVideo({ file, outDir, settings, args }) {
  const video = await probeVideo(file);
  const height = scaledHeight(settings.width, video.width, video.height);

  log(`  video ${video.width}x${video.height} @ ${video.fps.toFixed(2)} fps, ${video.duration.toFixed(1)}s`);
  log(`  decoding candidate frames at ${settings.width}x${height}, ${settings.fps} fps`);

  const rawFile = join(outDir, 'analyse.raw');
  await extractGrayStream({
    input: file,
    outFile: rawFile,
    fps: settings.fps,
    width: settings.width,
    height,
    start: args.start ? Number(args.start) : undefined,
    end: args.end ? Number(args.end) : undefined,
  });

  // Pass 1: find the tab band from a sample of frames.
  const bandTracker = new BandTracker({ stringCount: settings.strings, sampleEvery: 5 });
  let frames = 0;
  await readGrayFrames(rawFile, settings.width, height, settings.fps, (buffer) => {
    frames += 1;
    bandTracker.push(buffer, settings.width, height);
  });
  const band = bandTracker.resolve();

  // Pass 2: segment on the band only, so a scroll inside the tab is not diluted
  // by an unchanging background. If no band was found, fall back to the frame.
  const region = band.found ? { top: band.top, bottom: band.bottom } : null;
  if (region) {
    log(`  tab band y ${region.top}-${region.bottom}: segmenting on the tab only`);
  } else {
    log('  no tab band found: segmenting on the whole frame');
  }

  const segmenter = new Segmenter({
    fps: settings.fps,
    changeThreshold: settings.change,
    changeFraction: settings.changeFraction / 100,
    duplicateThreshold: settings.duplicate,
    minShotSeconds: settings.minShot,
    region,
  });

  await readGrayFrames(rawFile, settings.width, height, settings.fps, (buffer, index, time) => {
    segmenter.push(buffer, settings.width, height, time);
    if (index > 0 && index % 120 === 0) {
      log(`    analysed ${index} frame(s)`);
    }
  });

  if (!args.keepFrames) await rm(rawFile, { force: true });

  return {
    video,
    analysis: { width: settings.width, height, fps: settings.fps, frames },
    segmentation: segmenter.finish(),
    band,
  };
}

async function captureFrames({ file, outDir, shots, band, video, analysis, settings, args }) {
  const framesDir = join(outDir, 'frames');
  await mkdir(framesDir, { recursive: true });

  const userCrop = parseCrop(args.crop);
  let crop = userCrop;

  if (!crop && args.autoCrop !== false && band.found) {
    const scale = video.height / analysis.height;
    const top = Math.max(0, Math.round(band.top * scale));
    const bottom = Math.min(video.height, Math.round(band.bottom * scale));
    crop = { x: 0, y: top, w: video.width, h: Math.max(8, bottom - top) };
    log(`  auto-cropped the tab band to y ${crop.y}-${crop.y + crop.h} of ${video.height}`);
  }

  const results = [];
  for (const [index, shot] of shots.entries()) {
    const name = `shot-${String(index + 1).padStart(2, '0')}`;
    const pngPath = join(framesDir, `${name}.png`);
    await grabFrame({
      input: file,
      time: shot.time,
      outFile: pngPath,
      crop,
      width: settings.ocrWidth,
    });
    results.push({ shot, pngPath, name });
    log(`    ${name} @ ${shot.time.toFixed(2)}s`);
  }

  return { shots: results, crop };
}

async function ocrFrames({ frameShots, settings, ocrMode, outDir }) {
  const scans = [];
  for (const [index, entry] of frameShots.entries()) {
    if (ocrMode === 'none') {
      scans.push({ ...entry, boxes: [], events: [], warnings: [], confidence: 0 });
      continue;
    }
    const boxes = await readBoxes(entry.pngPath, {
      psm: settings.psm,
      lang: settings.lang,
      keepTemp: Boolean(settings.keepTemp),
    });
    const shot = boxesToShot(boxes, { stringCount: settings.strings });
    scans.push({ ...entry, boxes, ...shot });
    log(
      `    read ${entry.name}: ${shot.events.length} beat(s)` +
        (shot.warnings.length ? ` (${shot.warnings.length} warning(s))` : ''),
    );
  }
  return scans;
}

async function captureFromImages({ dir, settings }) {
  const files = (await readdir(dir))
    .filter((file) => /\.(png|jpe?g|bmp|webp)$/i.test(file))
    .sort();
  if (files.length === 0) throw new Error(`No images found in ${dir}`);
  return files.map((file) => ({ file: join(dir, file), name: file }));
}

async function run(argv) {
  const args = parseArgs(argv);
  if (args.help || args._.length === 0) {
    printUsage();
    return args._.length === 0 && !args.help ? 1 : 0;
  }

  const settings = { ...DEFAULTS };
  for (const key of ['fps', 'width', 'strings', 'change', 'changeFraction', 'duplicate', 'minShot', 'psm', 'ocrWidth']) {
    if (args[key] !== undefined) settings[key] = Number(args[key]);
  }
  if (args.tuning) settings.tuning = args.tuning;
  if (args.out) settings.out = args.out;

  const outDir = resolve(settings.out);
  await mkdir(outDir, { recursive: true });

  const tuning = resolveTuning(settings.tuning);
  if (args.strings === undefined) settings.strings = tuning.midi.length;

  log(`tabloom-capture -> ${outDir}`);
  const input = await resolveInput(args._[0], outDir);

  const ocr = await detectOcr();
  let ocrMode = args.ocr ?? 'auto';
  if (ocrMode === 'auto') ocrMode = ocr.available ? 'tesseract' : 'none';
  if (ocrMode === 'tesseract' && !ocr.available) {
    throw new Error(
      'OCR requested but tesseract is not installed.\n' +
        '  Install it (winget install UB-Mannheim.TesseractOCR) or re-run with --ocr none\n' +
        '  to only extract the frames.',
    );
  }
  if (ocrMode === 'none') log('  OCR disabled: frames will be extracted for manual transcription');

  const warnings = [];
  let analysis = null;
  let frameShots = [];
  let crop = null;

  if (input.directory) {
    log('  input is a directory of images: skipping decoding');
    const images = await captureFromImages({ dir: input.file, settings });
    frameShots = images.map((image) => ({ shot: { time: 0 }, ...image }));
  } else {
    log('[1/5] probing and decoding candidate frames');
    analysis = await analyseVideo({ file: input.file, outDir, settings, args });
    const shots = analysis.segmentation.shots;
    log(`[2/5] segmented into ${analysis.segmentation.totalSegments} shot(s), keeping ${shots.length}`);

    if (shots.length === 0) throw new Error('No usable shots found: is this a static or blank video?');
    if (analysis.band.found) {
      log(`  tab band found in ${analysis.band.hits} sampled frame(s), confidence ${analysis.band.confidence.toFixed(2)}`);
    } else {
      warnings.push(`tab band not detected (${analysis.band.reason}); using the full frame`);
    }

    log('[3/5] extracting the sharpest frame of each shot');
    const extracted = await captureFrames({
      file: input.file,
      outDir,
      shots,
      band: analysis.band,
      video: analysis.video,
      analysis: analysis.analysis,
      settings,
      args,
    });
    frameShots = extracted.shots;
    crop = extracted.crop;
  }

  log(`[4/5] reading ${frameShots.length} frame(s) with ${ocrMode === 'none' ? 'no OCR' : ocrMode}`);
  const scans = await ocrFrames({ frameShots, settings, ocrMode, outDir });
  scans.forEach((scan) => warnings.push(...scan.warnings.map((warning) => `${scan.name}: ${warning}`)));

  log('[5/5] stitching shots into one tab');
  const stitched =
    ocrMode === 'none'
      ? { events: [], joins: [], warnings: [] }
      : stitchShots(
          scans.map((scan) => ({ time: scan.shot.time, events: scan.events })),
          { minOverlap: 2 },
        );
  warnings.push(...stitched.warnings);

  const report = {
    input: args._[0],
    generatedAt: new Date().toISOString(),
    settings,
    video: analysis?.video ?? null,
    analysis: analysis?.analysis ?? null,
    segmentation: analysis?.segmentation
      ? {
          totalSegments: analysis.segmentation.totalSegments,
          totalFrames: analysis.segmentation.totalFrames,
          dropped: analysis.segmentation.dropped,
        }
      : null,
    band: analysis?.band ?? null,
    crop,
    ocr: { engine: ocrMode, available: ocr.available },
    shots: scans.map((scan) => ({
      name: scan.name,
      time: scan.shot.time,
      beats: scan.events.length,
      confidence: scan.confidence ?? 0,
      warnings: scan.warnings,
    })),
    result: { beats: stitched.events.length, joins: stitched.joins },
    warnings,
  };

  await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (ocrMode !== 'none' && stitched.events.length > 0) {
    const tabText = eventsToTab(stitched.events, { tuning });
    await writeFile(join(outDir, 'tab.txt'), `${tabText}\n`, 'utf8');

    // Prove the loop closes: the emitted tab must parse back to the same beats.
    const reparsed = parseAsciiTab(tabText, { tuning: settings.tuning, title: 'captured' });
    const score = createScore({
      title: 'Captured tab',
      tuning: settings.tuning,
      sections: reparsed.sections.map((section) => ({
        title: section.title,
        events: section.events,
      })),
      meta: { capturedFrom: args._[0], report: 'report.json' },
    });
    await writeFile(join(outDir, 'score.json'), `${JSON.stringify(score, null, 2)}\n`, 'utf8');

    report.roundTrip = {
      beats: stitched.events.length,
      reparsedBeats: score.beatCount,
      matches: score.beatCount === stitched.events.length,
    };
    if (!report.roundTrip.matches) {
      report.warnings.push(
        `round-trip mismatch: ${stitched.events.length} beats written, ${score.beatCount} parsed back`,
      );
    }
    await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  const summary = renderReport(report);
  await writeFile(join(outDir, 'report.txt'), `${summary}\n`, 'utf8');
  log(`\n${summary}`);

  if (ocrMode !== 'none' && stitched.events.length === 0) return 2;
  return 0;
}

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    log(`\n${error.name === 'MissingToolError' ? '' : 'error: '}${error.message}`);
    process.exitCode = 1;
  });
