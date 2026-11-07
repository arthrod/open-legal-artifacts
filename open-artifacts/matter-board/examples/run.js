/**
 * Worked example runner — reads input.json (two snapshots), diffs them,
 * builds the board, writes diff.json + diff.csv + board.json + report.md.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { diffSnapshots, buildBoard, diffToCsv, diffToJson } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));

const diff = diffSnapshots(input.previous, input.current);
const board = buildBoard(input.current, input.asOf, { soonDays: 14 });

writeFileSync(join(here, "diff.json"), diffToJson(diff));
writeFileSync(join(here, "diff.csv"), diffToCsv(diff));
writeFileSync(join(here, "board.json"), JSON.stringify(board, null, 2) + "\n");

const md = [
  `# matter-board — change report (${input.previous.capturedAt} → ${input.current.capturedAt})`,
  "",
  `Snapshot sources: \`${input.previous.source}\` → \`${input.current.source}\``,
  "",
  `**${diff.counts.changed} field changes** (${diff.counts.critical} critical) · ${diff.counts.added} added · ${diff.counts.removed} removed matters`,
  "",
  "## Changed fields (chronological, with timestamps)",
  "",
  ...diff.changed.map(
    (c) => `- \`${c.changedAt}\` (${c.source}) · **${c.name}** \`${c.id}\` — ${c.field} \`${c.from ?? "—"}\` → \`${c.to ?? "—"}\` ${c.severity === "critical" ? "**[CRITICAL]**" : `_[${c.severity}]_`}`
  ),
  "",
  "## Deadline risk (as of " + input.asOf + ")",
  "",
  ...(board.flagged.length
    ? board.flagged.map((f) => `- ${f.flag === "overdue" ? "**OVERDUE**" : "due soon"} · **${f.name}** \`${f.id}\` — ${f.deadline} (${f.days >= 0 ? "+" : ""}${f.days}d)`)
    : ["- none within window"]),
  "",
  "_All data fictional. Deadlines extracted from source systems still require human confirmation._",
  "",
].join("\n");
writeFileSync(join(here, "report.md"), md);

console.log(
  `${diff.counts.changed} changes (${diff.counts.critical} critical), ${diff.counts.added} added, ${diff.counts.removed} removed, ${board.flagged.length} deadline flags — wrote diff.json, diff.csv, board.json, report.md`
);
