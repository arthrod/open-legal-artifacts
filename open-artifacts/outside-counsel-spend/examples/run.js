/**
 * Worked example runner — reads input.json (ledger + rate cards + budgets),
 * runs the deterministic audit, writes audit.json + findings.csv + report.md.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runSpendAudit, auditToCsv, auditToJson, renderReport } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));

const audit = runSpendAudit(input);
writeFileSync(join(here, "audit.json"), auditToJson(audit));
writeFileSync(join(here, "findings.csv"), auditToCsv(audit));
writeFileSync(join(here, "report.md"), renderReport(audit, { firmNames: input.meta?.firmNames, matterNames: input.meta?.matterNames }));

const s = audit.summary;
console.log(
  `${s.entries} entries: ${s.rateExceptions} rate exceptions, ${s.overBudget} over budget, ${s.unbudgeted} unbudgeted, ${s.writeOffFlags} write-off flags, net spend ${s.netSpend} — wrote audit.json, findings.csv, report.md`
);
