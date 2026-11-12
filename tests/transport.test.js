import test from 'node:test';
import assert from 'node:assert/strict';

import { createTransport } from '../src/play/transport.js';

function fakeScheduler() {
  const state = { handler: null, delay: 0, id: 0 };
  return {
    state,
    setInterval(handler, delay) {
      state.handler = handler;
      state.delay = delay;
      state.id += 1;
      return state.id;
    },
    clearInterval() {
      state.handler = null;
    },
    tick() {
      state.handler?.();
    },
  };
}

function make(length = 4, options = {}) {
  const scheduler = fakeScheduler();
  const transport = createTransport({ length, scheduler, ...options });
  return { transport, scheduler };
}

test('play jumps to the first step immediately', () => {
  const { transport } = make();
  assert.equal(transport.index, -1);
  transport.play();
  assert.equal(transport.index, 0);
  assert.equal(transport.playing, true);
});

test('ticks advance one step at a time', () => {
  const { transport, scheduler } = make();
  transport.play();
  scheduler.tick();
  assert.equal(transport.index, 1);
  scheduler.tick();
  assert.equal(transport.index, 2);
});

test('playback stops on the last step unless looping', () => {
  const { transport, scheduler } = make(3);
  const events = [];
  transport.on('end', () => events.push('end'));

  transport.play();
  scheduler.tick();
  scheduler.tick();
  assert.equal(transport.index, 2);
  assert.equal(transport.playing, true);

  scheduler.tick();
  assert.equal(transport.playing, false);
  assert.deepEqual(events, ['end']);
});

test('looping wraps back to the first step', () => {
  const { transport, scheduler } = make(2, { loop: true });
  transport.play();
  scheduler.tick();
  assert.equal(transport.index, 1);
  scheduler.tick();
  assert.equal(transport.index, 0);
  assert.equal(transport.playing, true);
});

test('manual navigation always wraps', () => {
  const { transport } = make(3);
  transport.next();
  assert.equal(transport.index, 0);
  transport.prev();
  assert.equal(transport.index, 2);
  transport.next();
  assert.equal(transport.index, 0);
});

test('goTo clamps to the score', () => {
  const { transport } = make(5);
  assert.equal(transport.goTo(99), 4);
  assert.equal(transport.goTo(-3), 0);
  assert.equal(transport.goTo(2.5), 2);
});

test('tempo changes the tick delay and reschedules while playing', () => {
  const { transport, scheduler } = make(10, { bpm: 60 });
  transport.play();
  assert.equal(scheduler.state.delay, 1000);
  transport.setBpm(120);
  assert.equal(scheduler.state.delay, 500);
  assert.equal(transport.bpm, 120);
});

test('tempo is clamped to something playable', () => {
  const { transport } = make(4);
  assert.equal(transport.setBpm(5), 20);
  assert.equal(transport.setBpm(10000), 400);
  assert.equal(transport.setBpm('nonsense'), 60);
});

test('pause stops the clock but keeps the position', () => {
  const { transport, scheduler } = make();
  transport.play();
  scheduler.tick();
  transport.pause();
  assert.equal(transport.playing, false);
  assert.equal(transport.index, 1);
  assert.equal(scheduler.state.handler, null);
});

test('stop returns to the start', () => {
  const { transport } = make();
  transport.next();
  transport.next();
  transport.stop();
  assert.equal(transport.index, -1);
});

test('subscribers fire and can unsubscribe', () => {
  const { transport } = make();
  const seen = [];
  const off = transport.on('step', ({ index }) => seen.push(index));
  transport.next();
  off();
  transport.next();
  assert.deepEqual(seen, [0]);
});

test('an empty transport does nothing', () => {
  const { transport, scheduler } = make(0);
  transport.play();
  transport.next();
  assert.equal(transport.index, -1);
  assert.equal(transport.playing, false);
  assert.equal(scheduler.state.handler, null);
});
