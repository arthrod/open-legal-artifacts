/**
 * Worked example runner — reads input.json, builds the renewal calendar
 * (incl. urgency tiers, escalation owners, coverage audit, attorney
 * confirmations), writes calendar.json + renewal-calendar.ics + report.md.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildCalendar, toICS } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));

const cal = buildCalendar(input, input.rules, input.confirmations);
writeFileSync(join(here, "calendar.json"), JSON.stringify(cal, null, 2) + "\n");
writeFileSync(join(here, "renewal-calendar.ics"), toICS(cal));

const tierCell = (e) =>
  `**${e.urgency.tier}**${e.urgency.daysUntil < 0 ? ` (${Math.abs(e.urgency.daysUntil)}d overdue)` : ` (${e.urgency.daysUntil}d)`}`;

const md = [
  `# renewal-calendar — worked example (${input.asOf}, ${input.company})`,
  "",
  `**${cal.summary.confirmed} confirmed · ${cal.summary.ambiguous} ambiguous · ${cal.summary.unresolved} unresolved · ${cal.summary.coverageGaps} coverage gap(s)**. Unresolved items produce NO calendar entry; coverage gaps are contracts with no dated clause at all — quiet is not clean.`,
  "",
  "## Notice deadlines (chronological, by urgency tier)",
  "",
  "| Notice deadline | Event date | Contract | Clause | Lead time | Urgency | Escalation | Status |",
  "|---|---|---|---|---|---|---|---|",
  ...cal.events.map(
    (e) =>
      `| ${e.noticeDeadline} | ${e.date}${e.recurrence ? ` (cycle ${e.recurrence.cycle}/${e.recurrence.termMonths}mo)` : ""} | ${e.contractName} | ${e.clauseType} | ${e.leadTimeDays}d (${e.leadTimeSource}) | ${tierCell(e)} | ${e.escalation ? `${e.escalation.owner}` : "—"} | ${e.status}${e.ambiguityFlag ? " ⚠" : ""} |`
  ),
  "",
  ...cal.events.filter((e) => e.confirmation).flatMap((e) => [
    `### ✓ Confirmed — ${e.contractName} (${e.clauseType})`,
    "",
    `- pinned date: \`${e.confirmation.date}\` by ${e.confirmation.confirmedBy}${e.confirmation.on ? ` on ${e.confirmation.on}` : ""} (resolved \`${e.confirmation.resolvedFlag}\` flag)`,
    "",
  ]),
  ...cal.events.filter((e) => e.ambiguityFlag).flatMap((e) => [
    `### ⚠ Ambiguity — ${e.contractName} (${e.clauseType})`,
    "",
    `- expression: \`${e.expression}\``,
    `- interpretation: ${e.reason}`,
    `- flag (${e.ambiguityFlag.type}): ${e.ambiguityFlag.note}`,
    "",
  ]),
  ...cal.unappliedConfirmations.flatMap((c) => [
    "### ✗ Refused confirmation",
    "",
    `- \`${c.contractId}/${c.clauseType}\` pinned \`${c.date}\`: ${c.reason}`,
    "",
  ]),
  "## Unresolved (excluded from calendar — human review required)",
  "",
  ...(cal.unresolved.length
    ? cal.unresolved.map((u) => `- **${u.contractName}** \`${u.clauseType}\` — \`${u.expression}\`: ${u.reason}`)
    : ["- none"]),
  "",
  "## Coverage audit (quiet is not clean)",
  "",
  ...(cal.coverage.length
    ? [
        "Contracts with **no dated renewal/notice clause** — nothing above is tracking them:",
        "",
        ...cal.coverage.map((c) => `- **${c.contractName}** [${c.contractId}]: ${c.reason}`),
      ]
    : ["- none — every contract has at least one dated clause"]),
  "",
  "## Rules applied (rules-as-data)",
  "",
  `Default lead time ${input.rules.defaultLeadTimeDays}d; by clause type: ` +
    Object.entries(input.rules.byClauseType).map(([k, v]) => `\`${k}\`=${v}d`).join(", ") +
    ". Clause-level overrides win.",
  ...(Array.isArray(input.rules.escalation) && input.rules.escalation.length
    ? ["", "Escalation (most urgent first): " + input.rules.escalation.map((r) => `≤${r.maxDaysOut}d → **${r.owner}**`).join(", ") + "."]
    : []),
  "",
  "_All data fictional. Extracted dates require human confirmation — an ambiguous reading is a prompt to read the clause, not a deadline to rely on. Not legal advice._",
  "",
].join("\n");
writeFileSync(join(here, "report.md"), md);

console.log(
  `${cal.summary.confirmed} confirmed, ${cal.summary.ambiguous} ambiguous, ${cal.summary.unresolved} unresolved, ${cal.summary.coverageGaps} coverage gap(s) — wrote calendar.json, renewal-calendar.ics, report.md`
);
