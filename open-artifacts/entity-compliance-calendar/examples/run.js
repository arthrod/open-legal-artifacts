/**
 * Worked example runner — reads input.json, builds the entities × obligations
 * matrix, writes matrix.json + compliance.csv + compliance.ics + report.md.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildMatrix, toCsv, toICS } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));

const m = buildMatrix(input);
writeFileSync(join(here, "matrix.json"), JSON.stringify(m, null, 2) + "\n");
writeFileSync(join(here, "compliance.csv"), toCsv(m));
writeFileSync(join(here, "compliance.ics"), toICS(m));

const md = [
  `# entity-compliance-calendar — worked example (${input.asOf}, ${input.company})`,
  "",
  `**${m.counts.delinquent} delinquent · ${m.counts["due-soon"]} due soon (≤${input.soonDays}d) · ${m.counts.scheduled} scheduled · ${m.counts.satisfied} satisfied · ${m.counts["n/a"]} n/a** across ${m.counts.cells} entity × obligation cells.`,
  "",
  "## Delinquency flags (most overdue first)",
  "",
  ...(m.delinquent.length
    ? m.delinquent.map(
        (d) => `- 🔴 **${d.entityName}** — ${d.obligationName}: due **${d.dueOn}**, overdue ${d.overdueDays}d`
      )
    : ["- none"]),
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
  ...m.obligations.map((o) => `- \`${o.id}\` ${o.name} — ${o.jurisdiction}, ${(o.entityTypes ?? ["any"]).join("/")}, ${o.recurring}${o.anchor === "calendarFixed" ? ` fixed ${o.dueMonth}/${o.dueDay}` : ""} [${o.statuteCite}]`),
  "",
  "_All entities, obligations, and statutory cites fictional (US-flavored defaults). Obligation rules change — maintain the rule base with effective dates before operational use. Not legal advice._",
  "",
].join("\n");
writeFileSync(join(here, "report.md"), md);

console.log(
  `${m.counts.cells} cells: ${m.counts.delinquent} delinquent, ${m.counts["due-soon"]} due-soon, ${m.counts.scheduled} scheduled — wrote matrix.json, compliance.csv, compliance.ics, report.md`
);
