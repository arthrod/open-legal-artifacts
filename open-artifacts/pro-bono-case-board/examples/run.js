/**
 * Reproducible worked example: reads examples/input.json, runs the
 * deterministic board, writes output.json, board.md, board.csv,
 * board.ics (deadline calendar), and — against examples/input-changed.json —
 * board-diff.json (regen audit: what changed between the two snapshots).
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildBoard, renderBoard, toCSV, toICS, diffBoards } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const inputChanged = JSON.parse(readFileSync(join(here, 'input-changed.json'), 'utf8'));

const board = buildBoard(input);
const changed = buildBoard(inputChanged);
writeFileSync(join(here, 'output.json'), JSON.stringify(board, null, 2) + '\n');
writeFileSync(join(here, 'board.md'), renderBoard(board));
writeFileSync(join(here, 'board.csv'), toCSV(board));
writeFileSync(join(here, 'board.ics'), toICS(board));
writeFileSync(join(here, 'board-diff.json'), JSON.stringify({ from: input.asOf, to: inputChanged.asOf, diff: diffBoards(board, changed) }, null, 2) + '\n');

const i = board.impact;
const d = diffBoards(board, changed);
console.log(
  `${board.cases.length} cases -> open ${i.openCases}, closed ${i.closedCases}, ` +
  `stale ${i.staleCases}, overdue deadlines ${i.overdueDeadlines}, SLA breaches ${i.slaBreaches}, ` +
  `hours ${i.totalHours} -> output.json, board.md, board.csv, board.ics` +
  ` | diff vs changed snapshot: +${d.added.length} added, ${d.stageChanged.length} stage-changed, ` +
  `${d.deadlineMoved.length} deadline-moved, ${d.closed.length} closed -> board-diff.json`,
);
