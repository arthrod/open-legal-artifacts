/**
 * Reproducible worked example: reads examples/input.json, runs the deterministic
 * core, writes examples/output.json and examples/report.md.
 * Run:  npx tsx examples/run.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCiteCheck, renderReport } from '../core/citecheck';
import type { CiteCheckInput } from '../core/citecheck';

const here = dirname(fileURLToPath(import.meta.url));
const input: CiteCheckInput = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const report = runCiteCheck(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(join(here, 'report.md'), renderReport(report));
console.log(`checked ${report.summary.total} quotes -> output.json, report.md`);
