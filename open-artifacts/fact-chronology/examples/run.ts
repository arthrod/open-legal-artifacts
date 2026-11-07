/**
 * Reproducible worked example: reads examples/input.json, runs the
 * deterministic core, writes examples/output.json + examples/chronology.md.
 * Run:  npx tsx examples/run.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildChronology, renderChronology } from '../core/chronology';
import type { ChronInput } from '../core/chronology';

const here = dirname(fileURLToPath(import.meta.url));
const input: ChronInput = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const out = buildChronology(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(out, null, 2) + '\n');
writeFileSync(join(here, 'chronology.md'), renderChronology(out));
console.log(
  `${out.summary.facts} facts -> ${out.summary.dated} dated, ${out.summary.conflicts} conflicts, ${out.summary.gaps} gaps -> output.json, chronology.md`,
);
