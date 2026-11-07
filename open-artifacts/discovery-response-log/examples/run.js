#!/usr/bin/env node
/**
 * examples/run.js — regenerates examples/output.json + examples/log.md from input.json.
 * Deterministic: same input, same output. Run: node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLog, reviseDraft, toMarkdown } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const log = buildLog(input, {});

// apply meet-and-confer rounds to the matching entries
for (const round of input.meetAndConferRounds || []) {
  const entry = log.entries.find((e) => e.requestNo === round.requestNo);
  if (!entry) throw new Error('no such request: ' + round.requestNo);
  reviseDraft(entry, round.patch, round.label);
}

const output = {
  case: input.case,
  deadline: log.deadline,
  counts: log.counts,
  entries: log.entries,
  disclaimer: log.disclaimer,
};
writeFileSync(join(here, 'output.json'), JSON.stringify(output, null, 2) + '\n');
writeFileSync(join(here, 'log.md'), toMarkdown(log) + '\n');
console.log(`wrote output.json (${output.entries.length} entries, deadline ${output.deadline.dueDate}) and log.md`);
