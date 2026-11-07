#!/usr/bin/env node
/** Regenerates examples/output.json + checklist.md from examples/input.json. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { trackResponse, exportChecklistMd } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const facts = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const result = trackResponse(facts);
writeFileSync(join(here, 'output.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(join(here, 'checklist.md'), exportChecklistMd(result) + '\n');
console.log(`deadline ${result.deadline.deadline} (${result.deadline_math.status}); ${result.scope.flags.length} scope flags; privilege ${result.privilege.state} (${result.privilege.progress}%)`);
