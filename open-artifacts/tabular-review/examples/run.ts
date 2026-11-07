/**
 * Reproducible worked example: reads examples/input.json, builds the matrix,
 * writes examples/output.json + examples/matrix.csv + examples/matrix.md.
 * Run:  npx tsx examples/run.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildMatrix, toCSV, toMarkdown } from '../core/matrix';
import type { MatrixInput } from '../core/matrix';

const here = dirname(fileURLToPath(import.meta.url));
const input: MatrixInput = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const out = buildMatrix(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(out, null, 2) + '\n');
writeFileSync(join(here, 'matrix.csv'), toCSV(input, out));
writeFileSync(join(here, 'matrix.md'), toMarkdown(input, out));
console.log(`${out.summary.cells} cells: ${out.summary.answered} answered, ${out.summary.unverified} unverified -> output.json, matrix.csv, matrix.md`);
