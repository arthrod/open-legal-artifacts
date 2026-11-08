#!/usr/bin/env node
/**
 * examples/run.js — regenerates examples/output.json + examples/claim-chart.md.
 * Deterministic. Run: node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compareClaimSets, toClaimChart, parseClaimSet, buildClaimReferenceMatrix } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const result = compareClaimSets(input.setA, input.setB);
const parsed = { setA: parseClaimSet(input.setA), setB: parseClaimSet(input.setB) };
const matrix = buildClaimReferenceMatrix(parsed.setA, input.references || []);

writeFileSync(
  join(here, 'output.json'),
  JSON.stringify({ matter: input.matter, parsed, result, matrix }, null, 2) + '\n',
);
writeFileSync(join(here, 'claim-chart.md'), toClaimChart(result) + '\n');
console.log(
  `wrote output.json + claim-chart.md — ${result.totals.matched} matched, ` +
  `${result.totals.modified} modified, ${result.totals.removed} removed, ${result.totals.added} added, ` +
  `${result.totals.renumbered} renumbered, ${result.noTeachingFound} "no teaching found" rows; ` +
    `matrix: ${matrix.totals.anticipationCandidates} anticipation-candidate, ` +
    `${matrix.totals.combination} combination, ${matrix.totals.gaps} gaps (first pass, fictional refs)`,
);
