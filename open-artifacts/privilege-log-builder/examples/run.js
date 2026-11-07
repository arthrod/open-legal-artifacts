/**
 * Reproducible worked example: reads examples/input.json, runs the deterministic
 * core, writes examples/output.json, examples/log.md and examples/log.csv.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildLog, renderLog, toCSV } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));
const log = buildLog(input);
writeFileSync(join(here, "output.json"), JSON.stringify(log, null, 2) + "\n");
writeFileSync(join(here, "log.md"), renderLog(log));
writeFileSync(join(here, "log.csv"), toCSV(log));
console.log(
  `built draft log: ${log.summary.total} entries -> output.json, log.md, log.csv ` +
    `(${log.summary.attorneyClient} attorney-client, ${log.summary.workProduct} work-product, ` +
    `${log.summary.incomplete} incomplete, ${log.summary.nearDuplicateGroups} near-dup groups)`,
);
