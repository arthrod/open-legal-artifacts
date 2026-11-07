/**
 * Reproducible worked example: reads examples/input.json, runs the
 * deterministic board, writes output.json, board.md, board.csv.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildBoard, renderBoard, toCSV } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const board = buildBoard(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(board, null, 2) + '\n');
writeFileSync(join(here, 'board.md'), renderBoard(board));
writeFileSync(join(here, 'board.csv'), toCSV(board));

const i = board.impact;
console.log(
  `${board.cases.length} cases -> open ${i.openCases}, closed ${i.closedCases}, ` +
  `stale ${i.staleCases}, hours ${i.totalHours} -> output.json, board.md, board.csv`,
);
