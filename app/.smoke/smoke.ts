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

// search interaction: typing clears the inherited area filter (item 2)
import { nextStateOnSearch } from "../src/lib/index-filter.ts";

check(
  "search-state: typing with area active clears area",
  JSON.stringify(nextStateOnSearch({ area: "deadlines", q: "" }, "tabular")) ===
    JSON.stringify({ area: null, q: "tabular" }),
);
check(
  "search-state: deleting all text keeps the clicked area filter",
  JSON.stringify(nextStateOnSearch({ area: "deadlines", q: "tab" }, "   ")) ===
    JSON.stringify({ area: "deadlines", q: "" }),
);
check(
  "search-state: hash coherence after auto-clear",
  serializeState(nextStateOnSearch({ area: "deadlines", q: "" }, "tabular")) === "#/?q=tabular",
);
check(
  "search-state: deep-link recovery counts (dogfood scenario)",
  filterOpen(catalog.open, { area: null, q: "tabular" }).length === 1 &&
    filterOpen(
      catalog.open,
      parseState(new URLSearchParams("area=deadlines&q=tabular"), AREA_IDS),
    ).length === 0,
);

// 404 pure helpers (item 1)
import { attemptedSlug, suggestArtifacts } from "../src/lib/notfound.ts";
import { notFoundHtml } from "../../vt-val/notfound.ts";

const NAMES = catalog.open.map((a: { name: string }) => a.name);
check(
  "404: attemptedSlug extracts typo'd slugs",
  attemptedSlug("#/a/cite-chek") === "cite-chek" &&
    attemptedSlug("/open-artifacts/tabular-revie/demo/index.html") === "tabular-revie" &&
    attemptedSlug("/nope") === "nope" &&
    attemptedSlug("#/?q=x") === "" &&
    attemptedSlug("/a/a%20b") === "ab",
);
check(
  "404: suggestArtifacts ranks the near-miss first; empty slug → default trio",
  suggestArtifacts("cite-chek", NAMES)[0] === "cite-check" &&
    JSON.stringify(suggestArtifacts("", NAMES)) === JSON.stringify(NAMES.slice(0, 3)) &&
    suggestArtifacts("zzz-no-overlap-at-all", NAMES).length === 3,
);
check(
  "404: suggestArtifacts always returns 3 (padding with defaults)",
  suggestArtifacts("cite-chek", NAMES).length === 3 &&
    suggestArtifacts("cite-chek", NAMES)[0] === "cite-check" &&
    new Set(suggestArtifacts("cite-chek", NAMES)).size === 3 &&
    suggestArtifacts("cite-chek", NAMES).slice(1).includes("cite-check") === false,
);
const nfHtml = notFoundHtml("/a/<script>");
check(
  "404html: escapes input, states 404 · text/html, links to catalog search",
  nfHtml.includes("&lt;script&gt;") &&
    !nfHtml.includes("<script>") &&
    nfHtml.includes("404") &&
    nfHtml.includes("text/html") &&
    nfHtml.includes("/#/?q="),
);
check(
  "404html: search link carries the encoded attempted slug",
  notFoundHtml("/a/cite-chek").includes("/#/?q=cite-chek"),
);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
