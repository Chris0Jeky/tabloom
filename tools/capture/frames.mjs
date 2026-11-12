/**
 * Frame I/O.
 *
 * The trick that keeps this cheap: ffmpeg writes frames as raw 8-bit greyscale
 * (`-f rawvideo -pix_fmt gray`), so a frame is just `width * height` bytes and
 * we can stream them without any image-decoding dependency.
 *
 * Full-resolution frames are only produced for the handful of timestamps that
 * survive shot selection, and only those go to OCR.
 */

import { execTool } from './bin.mjs';

/**
 * Decode the video to a greyscale raw stream at a low resolution and frame rate.
 * @returns {Promise<{file:string,width:number,height:number,fps:number}>}
 */
export async function extractGrayStream(options) {
  const {
    input,
    outFile,
    fps = 2,
    width = 480,
    height,
    start,
    end,
    ffmpeg = 'ffmpeg',
  } = options;

  const filters = [`fps=${fps}`, `scale=${width}:${height}:flags=area`, 'format=gray'];

  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  if (start) args.push('-ss', String(start));
  args.push('-i', input);
  if (start && end) args.push('-t', String(end - start));
  args.push(
    '-an',
    '-sn',
    '-dn',
    '-vf', filters.join(','),
    '-f', 'rawvideo',
    '-pix_fmt', 'gray',
    outFile,
  );

  await execTool(ffmpeg, args);
  return { file: outFile, width, height, fps };
}

/** Grab one full-resolution PNG at a timestamp, optionally cropped. */
export async function grabFrame(options) {
  const {
    input,
    time,
    outFile,
    crop,
    width,
    ffmpeg = 'ffmpeg',
  } = options;

  const filters = [];
  if (crop) {
    const { x, y, w, h } = crop;
    filters.push(`crop=${Math.round(w)}:${Math.round(h)}:${Math.round(x)}:${Math.round(y)}`);
  }
  if (width) filters.push(`scale=${width}:-2:flags=lanczos`);

  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  args.push('-ss', String(Math.max(0, time)));
  args.push('-i', input, '-frames:v', '1');
  if (filters.length) args.push('-vf', filters.join(','));
  args.push(outFile);

  await execTool(ffmpeg, args);
  return outFile;
}

/**
 * Stream a raw greyscale file frame by frame without holding them all in memory.
 * `onFrame(buffer, index, time)` is called synchronously.
 */
export async function readGrayFrames(file, width, height, fps, onFrame) {
  const { open } = await import('node:fs/promises');
  const handle = await open(file, 'r');
  const frameSize = width * height;
  const buffer = Buffer.allocUnsafe(frameSize);

  try {
    let index = 0;
    for (;;) {
      let read = 0;
      while (read < frameSize) {
        const { bytesRead } = await handle.read(buffer, read, frameSize - read, null);
        if (bytesRead === 0) break;
        read += bytesRead;
      }
      if (read < frameSize) break;
      onFrame(buffer, index, index / fps);
      index += 1;
    }
    return index;
  } finally {
    await handle.close();
  }
}
