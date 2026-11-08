/**
 * Reproducible worked example: reads examples/input.json, processes the
 * queue, records worked decisions via the guarded APIs, writes
 * output.json, queue.md, queue.csv, letters.md, intake.ics.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { processQueue, assign, decide, renderLetter, toCSV, renderQueue, toICS } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const q = processQueue(input);
// worked decisions — every action goes through the guarded APIs so the
// audit trail records who did what, when, and why (all actors fictional)
assign(q, 'INT-1041', 'staff-kim (fictional)'); // most urgent open item
decide(q, 'INT-1042', 'decline', 'gc-lee (fictional)', 'conflict: Brightpath Solar LLC adverse on LIT-2025-003');
decide(q, 'INT-1043', 'accept', 'gc-lee (fictional)', 'capacity confirmed at screening');
decide(q, 'INT-1046', 'escalate', 'partner-oh (fictional)', 'existing firm client — relationship check needed');

writeFileSync(join(here, 'output.json'), JSON.stringify(q, null, 2) + '\n');
writeFileSync(join(here, 'queue.md'), renderQueue(q));
writeFileSync(join(here, 'queue.csv'), toCSV(q));
writeFileSync(join(here, 'intake.ics'), toICS(q));
writeFileSync(
  join(here, 'letters.md'),
  [
    renderLetter(q, 'INT-1042', 'declination'),
    '',
    '---',
    '',
    renderLetter(q, 'INT-1043', 'engagement'),
    '',
  ].join('\n'),
);

const s = q.summary;
console.log(
  `${s.total} submissions -> ${s.duplicates} duplicates, ${s.conflicts} conflicts, ` +
  `${s.urgent} urgent; states ${Object.entries(s.byState).map(([k, v]) => `${k} ${v}`).join(', ')}; ` +
  `${q.audit.length} audit entries -> output.json, queue.md, queue.csv, letters.md, intake.ics`,
);
