/**
 * Reproducible worked example: reads examples/input.json, runs the deterministic
 * core, writes examples/output.json, examples/report.md and examples/deadlines.ics.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runRadar, renderReport, toICS } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));
const report = runRadar(input);
writeFileSync(join(here, "output.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(join(here, "report.md"), renderReport(report));
writeFileSync(join(here, "deadlines.ics"), toICS(report));
console.log(
  `radar: ${report.summary.total} claims -> output.json, report.md, deadlines.ics ` +
    `(${report.summary.deadline_upcoming} upcoming, ${report.summary.filed_timely} timely, ` +
    `${report.summary.filed_late} late, ${report.summary.conflicts} conflicts)`,
);
