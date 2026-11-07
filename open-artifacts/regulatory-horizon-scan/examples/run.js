/**
 * Worked example runner — reads input.json, runs the core, writes outputs.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanFeed, diffFeeds, diffRubrics, toCsv } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));

// 1. Full scan of the current feed (dedupe + classify + score + timeline)
const scan = scanFeed(input.currentFeed, input.rubric, input.profile, input.asOf);
writeFileSync(join(here, "scan.json"), JSON.stringify(scan, null, 2) + "\n");
writeFileSync(join(here, "scan.csv"), toCsv(scan));

// 2. Diff view: what changed since the previous feed snapshot
const feedDiff = diffFeeds(input.previousFeed, input.currentFeed);

// 3. Rubric evolution example (weight tuned between snapshots)
const nextRubric = structuredClone(input.rubric);
nextRubric.version = "2026.11-r2";
nextRubric.factors.find((f) => f.id === "status").points.proposed = 10; // proposed rules weigh more in r2
const rubricDiff = diffRubrics(input.rubric, nextRubric);

const md = [
  `# Regulatory horizon scan — worked example (as of ${input.asOf})`,
  "",
  `Company profile: **${input.profile.company}** · jurisdictions ${input.profile.jurisdictions.join(", ")} · rubric \`${scan.rubricVersion}\``,
  "",
  "## Ranked scan (deduped feed)",
  "",
  "| # | Rule | Juris | Topic | Status | Effective | Score | Band |",
  "|---|---|---|---|---|---|---|---|",
  ...scan.items.map(
    (it, i) =>
      `| ${i + 1} | ${it.title} | ${it.jurisdiction} | ${it.topic} | ${it.status} | ${it.effectiveDate ?? "—"} | **${it.scoring.score}** | ${it.scoring.band} |`
  ),
  "",
  scan.duplicates.length
    ? `Deduped ${scan.duplicates.length} duplicate entr${scan.duplicates.length === 1 ? "y" : "ies"}: ${scan.duplicates
        .map((d) => `\`${d.droppedId}\` → kept \`${d.keptId}\` (${d.reason})`)
        .join("; ")}`
    : "No duplicates found.",
  "",
  "## Score transparency (rubric breakdown for the top item)",
  "",
  ...scan.items[0].scoring.breakdown.flatMap((b) => [
    `- **${b.factor}** +${b.points} — ${b.rule} _(${b.note})_`,
  ]),
  "",
  "## Timeline (by effective date)",
  "",
  ...scan.timeline.map((it) => `- ${it.effectiveDate} · score ${it.scoring.score} · ${it.title} (${it.jurisdiction})`),
  "",
  "## Diff since previous snapshot",
  "",
  feedDiff.added.length ? `**Added:** ${feedDiff.added.map((i) => i.id).join(", ")}` : "**Added:** none",
  "",
  feedDiff.removed.length ? `**Removed:** ${feedDiff.removed.map((i) => i.id).join(", ")}` : "**Removed:** none",
  "",
  "**Changed:**",
  ...(feedDiff.changed.length
    ? feedDiff.changed.map((c) => `- \`${c.id}\` ${c.field}: \`${c.from}\` → \`${c.to}\``)
    : ["- none"]),
  "",
  "## Rubric diff (2026.11 → 2026.11-r2)",
  "",
  ...(rubricDiff.length ? rubricDiff.map((c) => `- \`${c.path}\`: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`) : ["- no changes"]),
  "",
  "_All data fictional. Not legal advice._",
  "",
].join("\n");
writeFileSync(join(here, "report.md"), md);
console.log("wrote scan.json, scan.csv, report.md —", scan.items.length, "unique items,", feedDiff.changed.length, "field changes,", rubricDiff.length, "rubric changes");
