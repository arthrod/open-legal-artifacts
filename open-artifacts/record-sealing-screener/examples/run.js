/**
 * Reproducible worked example: reads examples/input.json, runs the deterministic
 * core, writes examples/output.json and examples/report.md.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { screenRecord, renderReport } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));
const report = screenRecord(input);
writeFileSync(join(here, "output.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(join(here, "report.md"), renderReport(report));
console.log(
  `screened ${report.summary.total} cases -> output.json, report.md ` +
    `(${report.summary.potentially_eligible} potentially eligible)`,
);
