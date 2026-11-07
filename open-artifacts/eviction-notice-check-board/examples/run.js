/**
 * Reproducible worked example: reads examples/input.json, checks each
 * notice against the bundled example jurisdiction rules, writes
 * output.json, board.md, board.csv.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { checkNotice, renderBoard, toCSV } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const boards = input.notices.map((n) => ({ id: n.id, caption: n.caption, ...checkNotice(n) }));
writeFileSync(join(here, 'output.json'), JSON.stringify(boards, null, 2) + '\n');
writeFileSync(
  join(here, 'board.md'),
  boards.map((b) => `## ${b.id} — ${b.caption}\n\n` + renderBoard(b)).join('\n\n---\n\n') + '\n',
);
writeFileSync(
  join(here, 'board.csv'),
  ['notice_id,notice_caption,check_id,requirement,status,detail,ruleCite']
    .concat(boards.flatMap((b) => b.checks.map((c) => `${b.id},"${b.caption}",${c.id},"${c.requirement.replace(/"/g, '""')}",${c.status},"${c.detail.replace(/"/g, '""')}",${c.ruleCite ?? ''}`)))
    .join('\n') + '\n',
);

for (const b of boards) {
  console.log(`${b.id} [${b.jurisdiction}/${b.noticeType}] -> ${b.summary.verdict.toUpperCase()} (pass ${b.summary.pass} · fail ${b.summary.fail} · unverified ${b.summary.unverified})`);
}
