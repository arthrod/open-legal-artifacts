/**
 * Reproducible worked example: reads examples/input.json, runs the
 * deterministic core, writes output.json, dashboard.md, portfolio.csv.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPortfolio, renderDashboard, toCSV } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const out = buildPortfolio(input);
writeFileSync(join(here, 'output.json'), JSON.stringify(out, null, 2) + '\n');
writeFileSync(join(here, 'dashboard.md'), renderDashboard(out));
writeFileSync(join(here, 'portfolio.csv'), toCSV(out));

console.log(
  `${out.summary.total} matters -> ${out.summary.solAlerts} SOL alerts, ` +
  `${out.summary.anomalies.total} anomalies (critical ${out.summary.anomalies.bySeverity.critical}), ` +
  `${out.summary.solUnverified} unverified, bands ` +
  `L${out.summary.exposureByBand.low.matters}/M${out.summary.exposureByBand.medium.matters}/` +
  `H${out.summary.exposureByBand.high.matters} -> output.json, dashboard.md, portfolio.csv`,
);
