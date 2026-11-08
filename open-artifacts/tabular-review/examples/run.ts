/**
 * Reproducible worked example: reads examples/input.json, builds the matrix,
 * writes examples/output.json + examples/matrix.csv + examples/matrix.md,
 * plus examples/diff.json — the re-run diff after the extractor fixes the one
 * hallucinated quote (harbor-saas × Q5) the core rejected in this run.
 * Run:  npx tsx examples/run.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildMatrix, toCSV, toMarkdown, diffMatrices } from '../core/matrix';
import type { MatrixInput } from '../core/matrix';

const here = dirname(fileURLToPath(import.meta.url));
const input: MatrixInput = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const out = buildMatrix(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(out, null, 2) + '\n');
writeFileSync(join(here, 'matrix.csv'), toCSV(input, out));
writeFileSync(join(here, 'matrix.md'), toMarkdown(input, out));

// Simulated re-run: the same extraction with the rejected harbor-saas × Q5
// quote corrected to text that actually appears in the document.
const rerun = buildMatrix({
  ...input,
  cells: input.cells.map((c) =>
    c.documentId === 'harbor-saas' && c.questionId === 'Q5'
      ? { ...c, answer: 'California', quote: 'Governing law: California.' }
      : c,
  ),
});
writeFileSync(join(here, 'diff.json'), JSON.stringify(diffMatrices(out, rerun), null, 2) + '\n');

console.log(`${out.summary.cells} cells: ${out.summary.answered} answered, ${out.summary.unverified} unverified -> output.json, matrix.csv, matrix.md, diff.json`);
