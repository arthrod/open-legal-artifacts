#!/usr/bin/env node
/** Regenerates examples/output.json + comparison.csv + comparison.md. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { benchmark, exportCsv, exportMd } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const result = benchmark(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(join(here, 'comparison.csv'), exportCsv(result));
writeFileSync(join(here, 'comparison.md'), exportMd(result) + '\n');
console.log(result.flows.map((f) => `#${f.rank} ${f.name}: composite ${f.composite}`).join('\n'));
