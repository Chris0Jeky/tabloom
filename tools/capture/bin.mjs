/**
 * Process helpers. The capture pipeline shells out to ffmpeg/ffprobe,
 * optionally to yt-dlp for fetching and tesseract for reading frames.
 * Nothing here is required for the browser engine.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export class MissingToolError extends Error {
  constructor(tool, hint) {
    super(`${tool} is not installed or not on PATH${hint ? ` (${hint})` : ''}`);
    this.name = 'MissingToolError';
    this.tool = tool;
  }
}

/** Run a tool and return stdout. */
export async function execTool(bin, args, options = {}) {
  const { timeout = 0, maxBuffer = 32 * 1024 * 1024 } = options;
  try {
    const { stdout, stderr } = await exec(bin, args, { timeout, maxBuffer, windowsHide: true });
    return { stdout, stderr };
  } catch (error) {
    if (error.code === 'ENOENT') throw new MissingToolError(bin);
    const detail = (error.stderr || error.stdout || error.message || '').toString().trim();
    throw new Error(`${bin} failed (${error.code ?? 'error'}): ${detail.slice(0, 800)}`);
  }
}

/** Is a binary available? */
export async function hasTool(bin) {
  try {
    await execTool(bin, ['-version'], { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

/** ffprobe -> { duration, width, height, fps, codec } */
export async function probeVideo(input, { ffprobe = 'ffprobe' } = {}) {
  const { stdout } = await execTool(ffprobe, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    input,
  ]);

  const info = JSON.parse(stdout);
  const stream = (info.streams ?? []).find((entry) => entry.codec_type === 'video');
  if (!stream) throw new Error(`No video stream found in ${input}`);

  const [num, den] = String(stream.r_frame_rate ?? '0/1').split('/').map(Number);
  const fps = den ? num / den : Number(stream.r_frame_rate) || 0;

  return {
    duration: Number(info.format?.duration ?? stream.duration ?? 0),
    width: Number(stream.width),
    height: Number(stream.height),
    fps,
    codec: stream.codec_name,
    container: info.format?.format_name,
  };
}

/** Height that keeps a source frame's aspect ratio at a target width (even). */
export function scaledHeight(targetWidth, sourceWidth, sourceHeight) {
  const height = Math.round((sourceHeight * targetWidth) / sourceWidth);
  return height % 2 === 0 ? height : height - 1;
}
