/**
 * Reproducible worked example: reads examples/input.json, builds the
 * obligations register, writes output.json, register.md, register.csv.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRegister, renderRegister, toCSV } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const reg = buildRegister(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(reg, null, 2) + '\n');
writeFileSync(join(here, 'register.md'), renderRegister(reg));
writeFileSync(join(here, 'register.csv'), toCSV(reg));

const s = reg.summary;
console.log(
  `${s.total} obligations -> open ${s.open}, satisfied ${s.satisfied} (${s.satisfiedLate} late), ` +
  `breach risk ${s.breachRisk}, unscheduled/conditional ${s.unscheduledOrConditional} -> output.json, register.md, register.csv`,
);
