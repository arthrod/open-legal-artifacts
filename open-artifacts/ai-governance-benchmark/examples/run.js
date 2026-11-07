#!/usr/bin/env node
/** Regenerates examples/output.json + examples/report.md from examples/input.json. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scoreAssessment, exportReportMd } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const result = scoreAssessment(input, { gapThreshold: 1 });

writeFileSync(join(here, 'output.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(join(here, 'report.md'), exportReportMd(result) + '\n');
console.log(`overall ${result.overall.score.toFixed(2)} (${result.overall.maturity.label}); ${result.gaps.length} gaps -> output.json, report.md`);
