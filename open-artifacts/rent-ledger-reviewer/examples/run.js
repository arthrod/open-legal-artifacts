/**
 * Reproducible worked example: reads examples/input.json, runs the deterministic
 * core, writes examples/output.json, examples/report.md and examples/ledger.csv.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { reviewLedger, renderReport, toCSV } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));
const review = reviewLedger(input);
writeFileSync(join(here, "output.json"), JSON.stringify(review, null, 2) + "\n");
writeFileSync(join(here, "report.md"), renderReport(review));
writeFileSync(join(here, "ledger.csv"), toCSV(review));
console.log(
  `recomputed ${review.rows.length} entries -> ${review.disputes.length} disputes, ` +
    `overcharge identified: ${review.balance.overchargeTotal.toFixed(2)}`,
);
