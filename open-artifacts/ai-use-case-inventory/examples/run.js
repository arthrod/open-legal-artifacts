#!/usr/bin/env node
/**
 * examples/run.js — regenerates examples/output.json + examples/inventory.csv.
 * Deterministic. Run: node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildInventory, dashboard } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const inventory = buildInventory(input.records);
const view = dashboard(inventory);

writeFileSync(
  join(here, 'output.json'),
  JSON.stringify({ organization: input.organization, ...view, items: inventory.items, disclaimer: inventory.disclaimer }, null, 2) + '\n',
);
writeFileSync(join(here, 'inventory.csv'), inventory.csv);
console.log(
  `wrote output.json + inventory.csv — ${view.total} use cases: ` +
  `${view.counts.prohibited} prohibited / ${view.counts.high} high / ${view.counts.limited} limited / ${view.counts.minimal} minimal, ` +
  `${view.blockers.length} blockers`,
);
