/**
 * Transport: the clock behind playback.
 *
 * No DOM, no globals required. Pass a `scheduler` in tests to drive it by hand.
 *
 * Behaviour
 * ---------
 * - `play()` jumps to the first step immediately if nothing has been played yet,
 *   so the UI reacts on the first click rather than a beat later.
 * - Playback stops on the last step unless `loop` is on.
 * - `next()`/`prev()` always wrap, because manual navigation should never
 *   dead-end.
 */

import { stepDurationMs } from '../model/score.js';

const DEFAULT_BPM = 60;
const MIN_BPM = 20;
const MAX_BPM = 400;

function clampBpm(value) {
  const bpm = Number(value);
  if (!Number.isFinite(bpm)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, bpm));
}

/**
 * @param {object} options
 * @param {number} [options.length=0] number of steps
 * @param {number} [options.bpm=60]
 * @param {boolean} [options.loop=false]
 * @param {{setInterval:Function, clearInterval:Function}} [options.scheduler]
 */
export function createTransport(options = {}) {
  const length = Math.max(0, Math.floor(Number(options.length) || 0));
  const setTimer = options.scheduler?.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearTimer = options.scheduler?.clearInterval ?? ((id) => globalThis.clearInterval(id));

  const listeners = new Map();
  let index = -1;
  let playing = false;
  let timer = null;
  let tempo = clampBpm(options.bpm ?? DEFAULT_BPM);
  let looping = Boolean(options.loop);

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(handler);
    return () => listeners.get(event)?.delete(handler);
  }

  function emit(event, payload) {
    const handlers = listeners.get(event);
    if (!handlers) return;
    for (const handler of [...handlers]) handler(payload);
  }

  function emitStep() {
    emit('step', { index, total: length, playing });
  }

  function stopTimer() {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  }

  function schedule() {
    stopTimer();
    timer = setTimer(tick, stepDurationMs(tempo));
  }

  function tick() {
    if (length === 0) return;
    if (index >= length - 1) {
      if (looping) {
        index = 0;
        emitStep();
        return;
      }
      index = length - 1;
      emitStep();
      pause();
      emit('end', { index, total: length });
      return;
    }
    index += 1;
    emitStep();
  }

  function play() {
    if (playing || length === 0) return;
    playing = true;
    emit('play', { index });
    if (index < 0) {
      index = 0;
      emitStep();
    }
    schedule();
  }

  function pause(reason = 'user') {
    if (!playing && timer === null) return;
    playing = false;
    stopTimer();
    emit('pause', { index, reason });
  }

  function toggle() {
    if (playing) pause();
    else play();
  }

  function stop() {
    pause('stop');
    index = -1;
    emitStep();
  }

  /** Manual navigation; always wraps. */
  function step(delta) {
    if (length === 0) return index;
    const next = (((index + delta) % length) + length) % length;
    index = next;
    emitStep();
    return index;
  }

  function next() {
    return step(1);
  }

  function prev() {
    return step(-1);
  }

  function goTo(target) {
    if (length === 0) return index;
    const numeric = Math.floor(Number(target));
    if (!Number.isFinite(numeric)) return index;
    index = Math.min(length - 1, Math.max(0, numeric));
    emitStep();
    return index;
  }

  function setBpm(value) {
    const next_ = clampBpm(value);
    if (next_ === tempo) return tempo;
    tempo = next_;
    emit('tempo', { bpm: tempo });
    if (playing) schedule();
    return tempo;
  }

  function setLoop(value) {
    looping = Boolean(value);
    emit('loop', { loop: looping });
    return looping;
  }

  function destroy() {
    stopTimer();
    playing = false;
    listeners.clear();
  }

  return {
    get index() {
      return index;
    },
    get length() {
      return length;
    },
    get playing() {
      return playing;
    },
    get bpm() {
      return tempo;
    },
    get loop() {
      return looping;
    },
    on,
    play,
    pause,
    toggle,
    stop,
    next,
    prev,
    goTo,
    setBpm,
    setLoop,
    destroy,
  };
}
