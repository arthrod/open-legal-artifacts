#!/usr/bin/env node
/** Regenerates examples/output.json + comparison.csv + comparison.md (run 1)
 *  and, when input-v2.json is present, drift.json + drift.md (run 1 → run 2). */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { benchmark, exportCsv, exportMd, compare } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const result = benchmark(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(join(here, 'comparison.csv'), exportCsv(result));
writeFileSync(join(here, 'comparison.md'), exportMd(result) + '\n');
console.log(result.flows.map((f) => `#${f.rank} ${f.name}: composite ${f.composite}`).join('\n'));

const v2Path = join(here, 'input-v2.json');
if (existsSync(v2Path)) {
  const before = result;
  const after = benchmark(JSON.parse(readFileSync(v2Path, 'utf8')));
  const drift = compare(after, before);
  writeFileSync(join(here, 'drift.json'), JSON.stringify(drift, null, 2) + '\n');

  const lines = [`# Intake flow benchmark — drift (run 1 → run 2)`, '',
    `Scenario: ${drift.scenario}. Deltas are run 2 − run 1; blank = no data on one side.`, ''];
  for (const f of drift.flows) {
    const rank = f.rank.changed ? `rank ${f.rank.from} → ${f.rank.to} ⚠ flip` : `rank ${f.rank.to} (unchanged)`;
    lines.push(`- **${f.name}**: composite ${f.composite >= 0 ? '+' : ''}${f.composite}, ${rank}`);
    for (const [dim, delta] of Object.entries(f.dimensions)) {
      if (delta !== 0) lines.push(`  - ${dim} ${delta >= 0 ? '+' : ''}${delta}`);
    }
  }
  lines.push('', '---', '', '_Deterministic output of the open intake-benchmark rubric. Fictional data; not legal advice._');
  writeFileSync(join(here, 'drift.md'), lines.join('\n') + '\n');
  console.log(drift.flows.map((f) => `${f.name}: composite ${f.composite >= 0 ? '+' : ''}${f.composite}, rank ${f.rank.from} → ${f.rank.to}${f.rank.changed ? ' (flip)' : ''}`).join('\n'));
}
