#!/usr/bin/env node
/**
 * Guard the demos: pull the tab out of each example page, parse it, render it,
 * and check the shape is what the page claims. Catches the case where an example
 * rots after an engine change but the unit tests still pass.
 */

import { readFile } from 'node:fs/promises';

import { parseAsciiTab, renderStaff, flattenScore } from '../src/index.js';

const HOBBITS_BEATS = 9 + 15 + 10 + 12 + 15 + 14;

const cases = [
  {
    file: 'examples/fur-elise.html',
    tab: (html) => /const TAB = `([\s\S]*?)`;/.exec(html)?.[1],
    check(score, staff, steps) {
      return [
        ['sections', score.sections.length === 4],
        ['beats', score.beatCount >= 40],
        ['staff markup', staff.includes('data-role="staff"') && !staff.includes('undefined')],
        [
          'flattened steps',
          steps.length === score.beatCount && steps.every((step) => step.label && step.pitch),
        ],
      ];
    },
  },
  {
    file: 'examples/concerning-hobbits.html',
    tab: null,
    check() {
      return [];
    },
  },
];

let failures = 0;

function report(name, ok) {
  if (!ok) failures += 1;
  return `${ok ? 'ok' : 'FAIL'} ${name}`;
}

for (const testCase of cases) {
  const html = await readFile(new URL(`../${testCase.file}`, import.meta.url), 'utf8');

  if (!testCase.tab) {
    const notes = [...html.matchAll(/\[\[\d+, ?\d+\]/g)].length;
    const ok = notes >= HOBBITS_BEATS;
    console.log(`${testCase.file}: ${report(`note groups (${notes} >= ${HOBBITS_BEATS})`, ok)}`);
    continue;
  }

  const text = testCase.tab(html);
  if (!text) {
    console.log(`${testCase.file}: FAIL no tab found`);
    failures += 1;
    continue;
  }

  const score = parseAsciiTab(text, { title: testCase.file, tuning: 'standard' });
  const staff = renderStaff(score, { showNoteNames: true });
  const steps = flattenScore(score);
  const results = testCase.check(score, staff, steps).map(([name, ok]) => report(name, ok));

  console.log(
    `${testCase.file}: ${score.sections.length} sections, ${score.beatCount} beats, ` +
      `${staff.length} chars of markup`,
  );
  for (const result of results) console.log(`  ${result}`);
}

console.log(failures === 0 ? '\nall examples ok' : `\n${failures} failure(s)`);
process.exitCode = failures === 0 ? 0 : 1;
