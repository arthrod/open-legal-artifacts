/**
 * Worked example runner — reads input.json (deal, buyers, Q&A items), builds
 * the log, writes output.json + qa-log.csv + report.md.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildQaLog, qaLogToCsv, qaLogToJson, renderReport } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));

const log = buildQaLog(input);
writeFileSync(join(here, "output.json"), qaLogToJson(log));
writeFileSync(join(here, "qa-log.csv"), qaLogToCsv(log));
writeFileSync(join(here, "report.md"), renderReport(log));

const s = log.summary;
console.log(
  `${s.items} questions: ${s.sent} sent, ${s.open} open, ${s.pendingDrafts} draft-pending · ${s.contradictions} contradiction(s) · readiness ${log.readiness.score}/100 (${log.readiness.band}) — wrote output.json, qa-log.csv, report.md`
);
