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

// index filter/search (src/lib/index-filter.ts) against the real catalog
import { readFileSync } from "node:fs";
import { parseState, serializeState, filterOpen, matchesQuery } from "../src/lib/index-filter.ts";

const catalog = JSON.parse(readFileSync(new URL("../src/data/artifacts.json", import.meta.url), "utf8"));
const AREA_IDS = new Set(catalog.taxonomies.practiceAreas.map((a: { id: string }) => a.id));

check(
  "tax: areas + questions each partition all 33",
  new Set(catalog.open.map((a: { practiceArea: string }) => a.practiceArea)).size === 8 &&
    new Set(catalog.open.map((a: { readerQuestion: string }) => a.readerQuestion)).size === 4 &&
    catalog.open.every(
      (a: { practiceArea: string; readerQuestion: string }) =>
        AREA_IDS.has(a.practiceArea) &&
        catalog.taxonomies.readerQuestions.some((q: { id: string }) => q.id === a.readerQuestion),
    ),
);
check(
  "filter: tabular → 1 tile",
  (filterOpen(catalog.open, parseState(new URLSearchParams("q=tabular"), AREA_IDS))).length === 1,
);
check(
  "filter: harvey → intake-benchmark via counterpart",
  filterOpen(catalog.open, parseState(new URLSearchParams("q=harvey"), AREA_IDS))[0].name ===
    "intake-benchmark",
);
check(
  "filter: area=deadlines&q=renewal → 1 tile (renewal-calendar)",
  filterOpen(catalog.open, parseState(new URLSearchParams("area=deadlines&q=renewal"), AREA_IDS))
    .length === 1 &&
    filterOpen(catalog.open, parseState(new URLSearchParams("area=deadlines&q=renewal"), AREA_IDS))[0]
      .name === "renewal-calendar",
);
check(
  "filter: area=deadlines → 3 tiles",
  filterOpen(catalog.open, parseState(new URLSearchParams("area=deadlines"), AREA_IDS)).length === 3,
);
check(
  "filter: zzz → empty",
  filterOpen(catalog.open, parseState(new URLSearchParams("q=zzz"), AREA_IDS)).length === 0,
);
check(
  "filter: AND-match over terms + case-insensitive",
  matchesQuery(
    { title: "Tabular Review", tagline: "grids of cited quotes", name: "tabular-review", anthropicCounterpart: null },
    "TABULAR  GRIDS",
  ),
);
check(
  "parse: unknown area fail-soft to All; duplicate area last wins",
  parseState(new URLSearchParams("area=bogus"), AREA_IDS).area === null &&
    parseState(new URLSearchParams("area=contracts&area=deadlines"), AREA_IDS).area === "deadlines",
);
check(
  "serialize: canonical round-trip",
  serializeState({ area: null, q: "" }) === "#/" &&
    serializeState({ area: "contracts", q: "renewal" }) === "#/?area=contracts&q=renewal" &&
    serializeState({ area: null, q: "a b" }) === "#/?q=a%20b" &&
    parseState(new URLSearchParams("area=contracts&q=renewal"), AREA_IDS).q === "renewal",
);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
