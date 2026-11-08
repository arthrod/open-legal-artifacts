/**
 * Worked example runner — reads input.json, builds the entities × obligations
 * matrix, writes matrix.json + compliance.csv + compliance.ics + report.md.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildMatrix, toCsv, toICS, report, auditHealth } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));

const m = buildMatrix(input);
const rep = report(m);
const health = auditHealth(input);
writeFileSync(join(here, "matrix.json"), JSON.stringify(m, null, 2) + "\n");
writeFileSync(join(here, "compliance.csv"), toCsv(m));
writeFileSync(join(here, "compliance.ics"), toICS(m));

const feeList = Object.entries(m.feeTotals.byEntity).filter(([, v]) => v > 0).map(([id, v]) => `${id} $${v}`).join(", ");
const md = [
  `# entity-compliance-calendar — worked example (${input.asOf}, ${input.company})`,
  "",
  `**${m.counts.delinquent} delinquent · ${m.counts["due-soon"]} due soon (≤${input.soonDays}d) · ${m.counts.scheduled} scheduled · ${m.counts.satisfied} satisfied · ${m.counts.unknown} unknown · ${m.counts["n/a"]} n/a** across ${m.counts.cells} entity × obligation cells.`,
  "",
  `Fees recorded on filings: **$${m.feeTotals.recorded}** (${feeList}).`,
  "",
  "## Delinquency flags (most overdue first)",
  "",
  ...(m.delinquent.length
    ? m.delinquent.map(
        (d) => `- 🔴 **${d.entityName}** — ${d.obligationName}: due **${d.dueOn}**, overdue ${d.overdueDays}d`
      )
    : ["- none"]),
  "",
  "## Filing windows (cumulative; overdue always included)",
  "",
  ...rep.windows.flatMap((w) => [
    `### ≤${w.days}d — ${w.count} filing${w.count === 1 ? "" : "s"}`,
    "",
    ...(w.items.length
      ? w.items.map((x) => `- ${x.dueOn} (${x.daysOut < 0 ? `${-x.daysOut}d overdue` : `in ${x.daysOut}d`}) · **${x.entityName}** — ${x.obligationName} [${x.status}]`)
      : ["- none"]),
    "",
  ]),
  "## Health audit",
  "",
  ...(health.flags.length
    ? health.flags.map((f) => `- ⚠️ \`${f.code}\` — **${f.entityName}**: ${f.detail}`)
    : ["- no health flags"]),
  "",
  "### Good standing (fictional confirmations)",
  "",
  ...m.goodStanding.map((g) => `- ${g.state === "ok" ? "✅" : g.state === "stale" ? "🟡" : "❓"} **${g.entityName}** — ${g.state}${g.confirmedOn ? ` (confirmed ${g.confirmedOn})` : ""}`),
  "",
  "## Upcoming filings (next-due, chronological, actionable cells only)",
  "",
  ...m.entities.flatMap((e, r) =>
    m.obligations.map((o, c) => ({ cell: m.grid[r][c], e, o })).filter(
      (x) => x.cell.dueOn && (x.cell.status === "due-soon" || x.cell.status === "scheduled")
    )
  )
    .sort((a, b) => a.cell.dueOn.localeCompare(b.cell.dueOn))
    .map((x) => `- ${x.cell.dueOn} · **${x.e.name}** — ${x.o.name} (${x.cell.ruleNote}) [${x.o.statuteCite}]`),
  "",
  "## Rules applied (rules-as-data)",
  "",
  ...m.obligations.map((o) => `- \`${o.id}\` ${o.name} — ${o.jurisdiction}, ${(o.entityTypes ?? ["any"]).join("/")}, ${o.recurring}${o.anchor === "calendarFixed" ? ` fixed ${o.dueMonth}/${o.dueDay}` : ""}${o.effectiveFrom ? ` [effective ${o.effectiveFrom}]` : ""}${o.verifiedOn ? ` [verified ${o.verifiedOn}]` : ""} [${o.statuteCite}]`),
  "",
  "_All entities, obligations, and statutory cites fictional (US-flavored defaults). Obligation rules change — maintain the rule base with effective dates before operational use. Not legal advice._",
  "",
].join("\n");
writeFileSync(join(here, "report.md"), md);

console.log(
  `${m.counts.cells} cells: ${m.counts.delinquent} delinquent, ${m.counts["due-soon"]} due-soon, ${m.counts.scheduled} scheduled, ${m.counts.unknown} unknown — ${health.counts.flags} health flags, $${m.feeTotals.recorded} fees recorded — wrote matrix.json, compliance.csv, compliance.ics, report.md`
);
