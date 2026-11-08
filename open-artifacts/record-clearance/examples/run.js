/**
 * Reproducible worked example: reads examples/input.json, runs the deterministic
 * core, writes examples/output.json and examples/report.md. Also runs the LLM
 * intake boundary: examples/intake.json → validateIntake → trackClearance,
 * writing examples/intake-output.json and examples/intake-report.md.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { trackClearance, renderReport, validateIntake } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));
const report = trackClearance(input);
writeFileSync(join(here, "output.json"), JSON.stringify(report, null, 2) + "\n");
writeFileSync(join(here, "report.md"), renderReport(report));

const intake = JSON.parse(readFileSync(join(here, "intake.json"), "utf8"));
const { input: intakeInput, issues } = validateIntake(intake);
const intakeReport = trackClearance(intakeInput);
writeFileSync(join(here, "intake-output.json"), JSON.stringify({ issues, report: intakeReport }, null, 2) + "\n");
writeFileSync(join(here, "intake-report.md"), renderReport(intakeReport));

console.log(
  `tracked ${report.summary.total} conviction x relief pairs -> output.json, report.md ` +
    `(${report.summary.ready_to_file} ready, ${report.summary.filed} filed, ${report.referrals.length} referrals)`,
);
console.log(
  `intake: validateIntake logged ${issues.length} issue(s) -> intake-output.json, intake-report.md ` +
    `(${intakeReport.summary.data_needed} data_needed of ${intakeReport.summary.total})`,
);
