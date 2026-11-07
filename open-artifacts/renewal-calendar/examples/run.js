/**
 * Worked example runner — reads input.json, builds the renewal calendar,
 * writes calendar.json + renewal-calendar.ics + report.md.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCalendar, toICS } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));

const cal = buildCalendar(input, input.rules);
writeFileSync(join(here, "calendar.json"), JSON.stringify(cal, null, 2) + "\n");
writeFileSync(join(here, "renewal-calendar.ics"), toICS(cal));

const md = [
  `# renewal-calendar — worked example (${input.asOf}, ${input.company})`,
  "",
  `**${cal.summary.confirmed} confirmed · ${cal.summary.ambiguous} ambiguous · ${cal.summary.unresolved} unresolved** events. Unresolved items produce NO calendar entry.`,
  "",
  "## Notice deadlines (chronological)",
  "",
  "| Notice deadline | Event date | Contract | Clause | Lead time | Status |",
  "|---|---|---|---|---|---|",
  ...cal.events.map(
    (e) =>
      `| ${e.noticeDeadline} | ${e.date} | ${e.contractName} | ${e.clauseType} | ${e.leadTimeDays}d (${e.leadTimeSource}) | ${e.status}${e.ambiguityFlag ? " ⚠" : ""} |`
  ),
  "",
  ...cal.events.filter((e) => e.ambiguityFlag).flatMap((e) => [
    `### ⚠ Ambiguity — ${e.contractName} (${e.clauseType})`,
    "",
    `- expression: \`${e.expression}\``,
    `- interpretation: ${e.reason}`,
    `- flag (${e.ambiguityFlag.type}): ${e.ambiguityFlag.note}`,
    "",
  ]),
  "## Unresolved (excluded from calendar — human review required)",
  "",
  ...(cal.unresolved.length
    ? cal.unresolved.map((u) => `- **${u.contractName}** \`${u.clauseType}\` — \`${u.expression}\`: ${u.reason}`)
    : ["- none"]),
  "",
  "## Rules applied (rules-as-data)",
  "",
  `Default lead time ${input.rules.defaultLeadTimeDays}d; by clause type: ` +
    Object.entries(input.rules.byClauseType).map(([k, v]) => `\`${k}\`=${v}d`).join(", ") +
    ". Clause-level overrides win.",
  "",
  "_All data fictional. Extracted dates require human confirmation — an ambiguous reading is a prompt to read the clause, not a deadline to rely on. Not legal advice._",
  "",
].join("\n");
writeFileSync(join(here, "report.md"), md);

console.log(
  `${cal.summary.confirmed} confirmed, ${cal.summary.ambiguous} ambiguous, ${cal.summary.unresolved} unresolved — wrote calendar.json, renewal-calendar.ics, report.md`
);
