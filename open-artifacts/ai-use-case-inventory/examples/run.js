#!/usr/bin/env node
/**
 * examples/run.js — regenerates examples/output.json + examples/inventory.csv.
 * Deterministic (review clock evaluated at input.asOf). Run: node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildInventory, dashboard, reviewDue } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const inventory = buildInventory(input.records);
const view = dashboard(inventory);
const clock = reviewDue(inventory, input.asOf);

writeFileSync(
  join(here, 'output.json'),
  JSON.stringify({ organization: input.organization, asOf: input.asOf, ...view, reviewDue: clock, items: inventory.items, disclaimer: inventory.disclaimer }, null, 2) + '\n',
);
writeFileSync(join(here, 'inventory.csv'), inventory.csv);
console.log(
  `wrote output.json + inventory.csv — ${view.total} use cases: ` +
  `${view.counts.prohibited} prohibited / ${view.counts.high} high / ${view.counts.limited} limited / ${view.counts.minimal} minimal / ` +
  `${view.counts.gpai} gpai / ${view.counts.gpai_systemic} gpai_systemic, ${view.blockers.length} blockers, ` +
  `review clock @ ${input.asOf}: ${clock.dueSoon.length} due soon, ${clock.stale.length} stale >1y`,
);
