#!/usr/bin/env node
/** Regenerates examples/output.json + checklist.md from examples/input.json. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readCase, exportChecklistMd } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const facts = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));
const result = readCase(facts);
writeFileSync(join(here, 'output.json'), JSON.stringify(result, null, 2) + '\n');
writeFileSync(join(here, 'checklist.md'), exportChecklistMd(result) + '\n');
console.log(`readiness ${result.readiness.score}% · referral ${result.referral.flag} · warnings ${result.warnings.length}`);
