#!/usr/bin/env node
/** Regenerates examples/output.json + benchmark.md from examples/input.json. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { benchmarkTermSheet, exportMd } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const result = benchmarkTermSheet(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(join(here, 'benchmark.md'), exportMd(result) + '\n');
console.log(`inside ${result.counts.inside_market} · outside ${result.counts.outside_market} · no_benchmark ${result.counts.no_benchmark}`);
