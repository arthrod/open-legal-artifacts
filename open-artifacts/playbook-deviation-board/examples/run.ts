/**
 * Reproducible worked example: parses examples/playbook.yaml with the
 * dependency-free YAML-subset parser, classifies examples/contract.json and
 * examples/contract-2.json, and writes per-contract output.json / board.md
 * (contract 1), output-2.json / board-2.md (contract 2), plus portfolio.md
 * (cross-contract per-rule deviation-frequency rollup).
 * Run:  npx tsx examples/run.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseYaml } from '../core/yaml';
import { buildBoard, buildPortfolio, renderBoard, renderPortfolio } from '../core/board';
import type { Playbook, BoardInput } from '../core/board';

const here = dirname(fileURLToPath(import.meta.url));
const playbook = parseYaml(readFileSync(join(here, 'playbook.yaml'), 'utf8')) as unknown as Playbook;
const read = (f: string): BoardInput['contract'] =>
  (JSON.parse(readFileSync(join(here, f), 'utf8')) as Pick<BoardInput, 'contract'>).contract;
const contract1 = read('contract.json');
const contract2 = read('contract-2.json');

const board1 = buildBoard({ playbook, contract: contract1 });
writeFileSync(join(here, 'output.json'), JSON.stringify(board1, null, 2) + '\n');
writeFileSync(join(here, 'board.md'), renderBoard(board1));

const board2 = buildBoard({ playbook, contract: contract2 });
writeFileSync(join(here, 'output-2.json'), JSON.stringify(board2, null, 2) + '\n');
writeFileSync(join(here, 'board-2.md'), renderBoard(board2));

const portfolio = buildPortfolio({ playbook, contracts: [contract1, contract2] });
writeFileSync(join(here, 'portfolio.md'), renderPortfolio(portfolio));

console.log(
  `classified ${board1.rows.length} + ${board2.rows.length} clauses -> output.json, board.md, output-2.json, board-2.md, portfolio.md`,
);
