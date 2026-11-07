// Smoke test for the deterministic demo cores. Run: node .smoke/smoke.ts
// Not part of the app build (outside src/).

import { citeCheck } from "../src/lib/citecheck.ts";
import { classifyClause, samplePlaybook } from "../src/lib/deviation.ts";
import { buildChronology, sampleFacts } from "../src/lib/chronology.ts";
import { buildTable, toCSV, sampleDocs, sampleQuestions } from "../src/lib/tabular.ts";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "ok" : "FAIL"} — ${name}`);
  if (!cond) failed++;
}

const src = `The court held that "an employer who fails to maintain accurate payroll records for three consecutive quarters may be deemed to have acted with gross negligence." 124 F.4th 221, 228 (2026).`;
const quote = `"an employer who fails to maintain accurate payroll records for three consecutive quarters may be deemed to have acted with gross negligence."`;

// cite-check
check("cite: exact", citeCheck(quote, src).kind === "exact");
check(
  "cite: normalized (case+curly+spacing)",
  citeCheck(
    quote.replace(/"/g, "\u201C").replace("three", "Three").replace(" ", "  ", 1),
    src,
  ).kind === "normalized",
);
check(
  "cite: fuzzy (small alteration)",
  citeCheck(
    quote.replace("gross negligence", "ordinary negligence"),
    src,
  ).kind === "fuzzy",
);
check(
  "cite: not_found (absent text)",
  citeCheck("This sentence is nowhere in the source document at all.", src).kind ===
    "not_found",
);
check("cite: empty quote", citeCheck("", src).kind === "not_found");

// deviation board
check(
  "dev: fallback on 2x cap",
  classifyClause(
    samplePlaybook,
    "10.1 Limitation of Liability. Provider's aggregate liability shall not exceed twice the fees paid.",
  ).classification === "fallback",
);
check(
  "dev: deviation on avoid term",
  classifyClause(
    samplePlaybook,
    "10.2 Provider is liable for consequential damages howsoever arising.",
  ).classification === "deviation",
);
check(
  "dev: unmapped topic escalates",
  classifyClause(samplePlaybook, "12.1 Assignment. Customer may assign this Agreement.")
      .classification === "deviation" &&
    classifyClause(samplePlaybook, "12.1 Assignment. Customer may assign this Agreement.")
      .topic === "unmapped",
);

// chronology
const chrono = buildChronology(sampleFacts);
check(
  "chrono: sorted by date",
  chrono.timeline[0].date === "2026-02-03" &&
    chrono.timeline[chrono.timeline.length - 1].date === "2026-08-15",
);
check(
  "chrono: 3 conflicted entries",
  chrono.conflicts === 3 &&
    chrono.timeline.every(
      (t) => t.topic !== "employment-status" || t.conflictWith.length === 2,
    ),
);

// tabular review
const table = buildTable(sampleDocs, sampleQuestions);
check(
  "tab: 9 cells, 3 unverified",
  table.cells.flat().length === 9 &&
    table.cells.flat().filter((c) => c.status === "unverified").length === 3,
);
check(
  "csv: contains UNVERIFIED + quote",
  toCSV(table).includes("UNVERIFIED") && toCSV(table).includes("New York"),
);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
