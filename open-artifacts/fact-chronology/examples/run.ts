/**
 * Reproducible worked example: reads examples/input.json (v2 of the timeline),
 * derives the prior version v1 in code, runs the deterministic core, and
 * writes output.json, the three render variants (chronology.md working,
 * chronology-sof.md, chronology-witness.md) and the version diff
 * (output-diff.json). Run:  npx tsx examples/run.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildChronology, renderChronology, diffChronology } from '../core/chronology';
import type { ChronInput } from '../core/chronology';

const here = dirname(fileURLToPath(import.meta.url));
const input: ChronInput = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

// v1 baseline for the diff demo: before the final amendment — F4 was narrower,
// F8 (filing) did not exist yet, and F11 (schedules) was later dropped.
const v1: ChronInput = {
  ...input,
  version: 1,
  facts: input.facts
    .filter((f) => f.id !== 'F8')
    .map((f) => (f.id === 'F4' ? { ...f, text: 'Delgado never received any written warning during her employment.' } : f))
    .concat([
      {
        id: 'F11',
        date: '2024-06-15',
        text: 'Summit Ridge posted weekly shift schedules in the break room.',
        source: { docId: 'answer', quote: 'Shift schedules were posted weekly in the break room.', pinpoint: '¶ 4' },
      },
    ]),
};

const prev = buildChronology(v1);
const out = buildChronology(input);
const diff = diffChronology(prev, out);

writeFileSync(join(here, 'output.json'), JSON.stringify(out, null, 2) + '\n');
writeFileSync(join(here, 'output-diff.json'), JSON.stringify(diff, null, 2) + '\n');
writeFileSync(join(here, 'chronology.md'), renderChronology(out));
writeFileSync(join(here, 'chronology-sof.md'), renderChronology(out, { format: 'sof' }));
writeFileSync(join(here, 'chronology-witness.md'), renderChronology(out, { format: 'witness' }));
console.log(
  `${out.summary.facts} facts -> ${out.summary.dated} dated (${out.summary.merged} merged), ` +
    `${out.summary.conflicts} conflicts, ${out.summary.gaps} gaps, ${out.summary.unfoundQuotes} unfound quote(s) ` +
    `-> output.json, chronology{,-sof,-witness}.md; diff v${diff.fromVersion}->v${diff.toVersion}: ${diff.summary}`,
);
