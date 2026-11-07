/**
 * Reproducible worked example: reads examples/input.json, processes the
 * queue, writes output.json, queue.md, queue.csv.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { processQueue, toCSV, renderQueue } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const q = processQueue(input);
// demonstrate one assignment: the most urgent open item goes to staff
const urgent = q.items.find((i) => i.state === 'urgent');
if (urgent) {
  urgent.assignedTo = 'staff-kim (fictional)';
  urgent.state = 'assigned';
}
writeFileSync(join(here, 'output.json'), JSON.stringify(q, null, 2) + '\n');
writeFileSync(join(here, 'queue.md'), renderQueue(q));
writeFileSync(join(here, 'queue.csv'), toCSV(q));

const s = q.summary;
console.log(
  `${s.total} submissions -> ${s.duplicates} duplicates, ${s.conflicts} conflicts, ` +
  `${s.urgent} urgent; states ${Object.entries(s.byState).map(([k, v]) => `${k} ${v}`).join(', ')} -> output.json, queue.md, queue.csv`,
);
