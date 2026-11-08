/**
 * Reproducible worked example: reads examples/input.json, builds the
 * obligations register, writes output.json, register.md, register.csv,
 * register.ics, and a diff.md showing how statuses move one month out.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRegister, renderRegister, renderDiff, diffRegisters, toCSV, toICS } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const reg = buildRegister(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(reg, null, 2) + '\n');
writeFileSync(join(here, 'register.md'), renderRegister(reg));
writeFileSync(join(here, 'register.csv'), toCSV(reg));
writeFileSync(join(here, 'register.ics'), toICS(reg));

// same facts, one month later: shows status transitions + newly appearing flags
const later = buildRegister({ ...input, asOf: '2026-12-07' });
const diff = diffRegisters(reg, later);
writeFileSync(join(here, 'diff.md'), renderDiff(diff));

const s = reg.summary;
console.log(
  `${s.total} obligations -> open ${s.open}, satisfied ${s.satisfied} (${s.satisfiedLate} late), ` +
    `breach risk ${s.breachRisk}, unscheduled/conditional ${s.unscheduledOrConditional} -> output.json, register.md, register.csv, register.ics`,
);
console.log(
  `per party: ${Object.entries(s.byParty).map(([p, b]) => `${p} open ${b.open} / overdue ${b.overdue} / exposure $${b.exposure.toLocaleString('en-US')}`).join(' · ')}`,
);
console.log(`diff to 2026-12-07: ${diff.transitions.length} transition(s), ${diff.newFlags.length} new flag(s) -> diff.md`);
