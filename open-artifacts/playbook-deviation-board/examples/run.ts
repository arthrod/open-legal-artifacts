/**
 * Reproducible worked example: parses examples/playbook.yaml with the
 * dependency-free YAML-subset parser, classifies examples/contract.json, and
 * writes examples/output.json + examples/board.md.
 * Run:  npx tsx examples/run.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseYaml } from '../core/yaml';
import { buildBoard, renderBoard } from '../core/board';
import type { Playbook, BoardInput } from '../core/board';

const here = dirname(fileURLToPath(import.meta.url));
const playbook = parseYaml(readFileSync(join(here, 'playbook.yaml'), 'utf8')) as unknown as Playbook;
const contractInput = JSON.parse(readFileSync(join(here, 'contract.json'), 'utf8')) as Pick<BoardInput, 'contract'>;

const board = buildBoard({ playbook, contract: contractInput.contract });
writeFileSync(join(here, 'output.json'), JSON.stringify(board, null, 2) + '\n');
writeFileSync(join(here, 'board.md'), renderBoard(board));
console.log(`classified ${board.rows.length} clauses -> output.json, board.md`);
