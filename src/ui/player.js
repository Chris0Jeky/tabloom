/**
 * The learning-hub player: one mount call, a tab, a fretboard, a transport.
 *
 *   import { parseAsciiTab, createPlayer } from 'tabloom';
 *   createPlayer(document.querySelector('#app'), {
 *     score: parseAsciiTab(tabText, { title: 'Für Elise' }),
 *   });
 */

import { createTransport } from '../play/transport.js';
import { flattenScore } from '../model/score.js';
import { renderStaff, highlightStaff } from '../render/staff.js';
import { renderFretboard } from '../render/fretboard.js';
import { escapeHtml } from '../util/html.js';
import { ensureTheme } from './theme.js';

const BPM_STEPS = [60, 75, 90, 110, 130, 150, 180];

function nextBpm(current) {
  const next = BPM_STEPS.find((value) => value > current);
  return next ?? BPM_STEPS[0];
}

function subtitle(score) {
  const parts = [];
  if (score.artist) parts.push(escapeHtml(score.artist));
  parts.push(`${escapeHtml(score.tuning.label)} tuning (${score.tuning.names.join(' ')})`);
  parts.push(`${score.beatCount} beats`);
  parts.push(`${score.sections.length} section${score.sections.length === 1 ? '' : 's'}`);
  return parts.join(' \u00b7 ');
}

/**
 * @param {HTMLElement} root
 * @param {object} options
 * @param {object} options.score
 * @param {number} [options.bpm=60]
 * @param {boolean} [options.loop=false]
 * @param {boolean} [options.showNoteNames=false]
 * @param {boolean} [options.showFretboard=true]
 * @param {boolean} [options.keyboard=true]
 * @param {number} [options.frets] fixed number of frets on the fretboard
 */
export function createPlayer(root, options = {}) {
  if (!root) throw new TypeError('createPlayer: a container element is required');
  const { score } = options;
  if (!score) throw new TypeError('createPlayer: options.score is required');

  const doc = root.ownerDocument ?? globalThis.document;
  const steps = flattenScore(score);
  const stepByColumn = new Map();
  steps.forEach((step) => stepByColumn.set(`${step.sectionIndex}:${step.beatIndex}`, step.index));

  ensureTheme(doc);

  root.innerHTML =
    '<div class="tl-player">' +
    '<header class="tl-header">' +
    `<h1>${escapeHtml(score.title)}</h1>` +
    `<p class="tl-sub">${subtitle(score)}</p>` +
    '</header>' +
    '<div class="tl-controls">' +
    '<button type="button" data-action="prev">\u25c0 Prev</button>' +
    '<button type="button" data-action="play">\u25b6 Play</button>' +
    '<button type="button" data-action="next">Next \u25b6</button>' +
    `<button type="button" data-action="bpm" class="tl-ghost">${options.bpm ?? 60} BPM</button>` +
    `<button type="button" data-action="loop" class="tl-ghost${options.loop ? ' tl-on' : ''}">` +
    `Loop: ${options.loop ? 'ON' : 'OFF'}</button>` +
    '<span class="tl-now">Press Next, or hit play.</span>' +
    '</div>' +
    '<div class="tl-progress"><div class="tl-progress-fill"></div></div>' +
    (options.showFretboard === false
      ? ''
      : '<div data-role="fretboard" style="margin:0 12px"></div>') +
    '<div class="tl-filters" data-role="filters"></div>' +
    '<div data-role="staff"></div>' +
    '<p class="tl-foot">Built with <a href="https://github.com/Chris0Jeky/tabloom">tabloom</a>. ' +
    'Arrow keys step, space plays.</p>' +
    '</div>';

  const player = root.querySelector('.tl-player');
  const staffRoot = player.querySelector('[data-role="staff"]');
  const fbRoot = player.querySelector('[data-role="fretboard"]');
  const filters = player.querySelector('[data-role="filters"]');
  const nowEl = player.querySelector('.tl-now');
  const progressEl = player.querySelector('.tl-progress-fill');
  const playBtn = player.querySelector('[data-action="play"]');
  const bpmBtn = player.querySelector('[data-action="bpm"]');
  const loopBtn = player.querySelector('[data-action="loop"]');

  let filter = -1;

  const transport = createTransport({
    length: steps.length,
    bpm: options.bpm ?? 60,
    loop: Boolean(options.loop),
  });

  function renderFilters() {
    const buttons = [
      `<span>Show:</span><button type="button" class="tl-ghost${filter === -1 ? ' tl-on' : ''}" data-filter="-1">All</button>`,
    ];
    score.sections.forEach((section, index) => {
      buttons.push(
        `<button type="button" class="tl-ghost${filter === index ? ' tl-on' : ''}" data-filter="${index}">` +
          `${escapeHtml(section.title)}</button>`,
      );
    });
    filters.innerHTML = buttons.join('');
  }

  function renderStaffArea() {
    staffRoot.innerHTML = renderStaff(score, {
      sectionFilter: filter,
      showNoteNames: Boolean(options.showNoteNames),
    });
  }

  function apply(index) {
    const step = index >= 0 && index < steps.length ? steps[index] : null;
    highlightStaff(staffRoot, step ? {
      sectionIndex: step.sectionIndex,
      beatIndex: step.beatIndex,
      strings: step.strings,
    } : null);

    if (fbRoot) {
      fbRoot.innerHTML = renderFretboard(score, {
        activeNotes: step?.notes ?? [],
        frets: options.frets,
      });
    }

    if (!step) {
      nowEl.textContent = 'Press Next, or hit play.';
      progressEl.style.width = '0%';
      return;
    }

    nowEl.innerHTML =
      `<b>${escapeHtml(step.label)}</b> ` +
      `<span>${escapeHtml(step.pitch)} \u00b7 step ${index + 1}/${steps.length} \u00b7 ` +
      `${escapeHtml(step.sectionTitle)} beat ${step.beatIndex + 1}</span>`;
    progressEl.style.width = `${((index + 1) / steps.length) * 100}%`;

    const active = staffRoot.querySelector('td.tl-cur');
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  transport.on('step', ({ index }) => apply(index));
  transport.on('play', () => {
    playBtn.textContent = '\u23f8 Pause';
    playBtn.classList.add('tl-on');
  });
  transport.on('pause', () => {
    playBtn.textContent = '\u25b6 Play';
    playBtn.classList.remove('tl-on');
  });

  player.addEventListener('click', (event) => {
    const target = event.target.closest('button, td[data-col]');
    if (!target || !player.contains(target)) return;

    if (target.dataset.action) {
      const action = target.dataset.action;
      if (action === 'prev') transport.prev();
      else if (action === 'next') transport.next();
      else if (action === 'play') transport.toggle();
      else if (action === 'bpm') {
        const bpm = transport.setBpm(nextBpm(transport.bpm));
        bpmBtn.textContent = `${bpm} BPM`;
      } else if (action === 'loop') {
        const loop = transport.setLoop(!transport.loop);
        loopBtn.textContent = `Loop: ${loop ? 'ON' : 'OFF'}`;
        loopBtn.classList.toggle('tl-on', loop);
      }
      return;
    }

    if (target.dataset.filter !== undefined) {
      filter = Number(target.dataset.filter);
      renderFilters();
      renderStaffArea();
      apply(transport.index);
      return;
    }

    if (target.dataset.col) {
      const index = stepByColumn.get(target.dataset.col);
      if (index !== undefined) transport.goTo(index);
    }
  });

  function onKeyDown(event) {
    if (event.defaultPrevented) return;
    const tag = (event.target?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (event.key === 'ArrowRight') {
      transport.next();
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      transport.prev();
      event.preventDefault();
    } else if (event.key === ' ') {
      transport.toggle();
      event.preventDefault();
    }
  }

  const keyboardEnabled = options.keyboard !== false;
  if (keyboardEnabled && typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('keydown', onKeyDown);
  }

  renderFilters();
  renderStaffArea();
  apply(-1);

  return {
    transport,
    score,
    steps,
    apply,
    setFilter(value) {
      filter = Number(value);
      renderFilters();
      renderStaffArea();
      apply(transport.index);
    },
    destroy() {
      if (keyboardEnabled && typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener('keydown', onKeyDown);
      }
      transport.destroy();
      root.innerHTML = '';
    },
  };
}
