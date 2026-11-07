/** Tests for regulatory-horizon-scan core. Run: node --test core/ */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTitle, parseDate, normalizeJurisdiction, dedupeItems,
  classifyItem, scoreItem, scanFeed, diffFeeds, diffRubrics, toCsv,
} from "./core.js";

const RUBRIC = {
  version: "2026.11",
  maxScore: 100,
  factors: [
    { id: "jurisdiction", label: "Operating jurisdiction", points: { exact: 30, adjacent: 15, other: 0 } },
    { id: "topic", label: "Topic relevance", points: { core: 25, related: 12, other: 0 } },
    { id: "proximity", label: "Time to effective date", points: { other: 0 }, thresholds: [{ withinDays: 90, points: 25 }, { withinDays: 180, points: 15 }, { withinDays: 365, points: 8 }] },
    { id: "status", label: "Rulemaking status", points: { effective: 20, final: 15, proposed: 8, rumored: 0, other: 0 } },
  ],
  topicTaxonomy: {
    privacy: ["privacy", "data protection", "ccpa", "gdpr"],
    ai: ["artificial intelligence", " ai ", "automated decision"],
    employment: ["employment", "workplace", "wage"],
  },
};
const PROFILE = { jurisdictions: ["US-FED", "US-CA"], coreTopics: ["privacy", "ai"], relatedTopics: ["employment"] };
const AS_OF = "2026-11-07";

const ITEM = {
  id: "ca-ccpa-amend",
  title: "CCPA Amendment: Children's Data Opt-In",
  jurisdiction: "California",
  status: "final",
  effectiveDate: "2027-01-01",
  summary: "Requires opt-in consent for minors' data processing.",
  link: "https://example.gov/ca-ccpa-amend",
};

test("normalizeTitle collapses punctuation, case, and apostrophes", () => {
  assert.equal(normalizeTitle("CCPA  Amendment — children's data!"), "ccpa amendment childrens data");
  assert.equal(normalizeTitle("children's"), normalizeTitle("childrens"));
});

test("parseDate rejects malformed dates and returns null", () => {
  assert.equal(parseDate("2027-02-30"), null);
  assert.equal(parseDate("not-a-date"), null);
  assert.equal(parseDate(undefined), null);
  assert.equal(fmtOf(parseDate("2027-01-01")), "2027-01-01");
});

function fmtOf(d) { return d ? d.toISOString().slice(0, 10) : null; }

test("normalizeJurisdiction maps state names/codes", () => {
  assert.equal(normalizeJurisdiction("California"), "US-CA");
  assert.equal(normalizeJurisdiction("new york"), "US-NY");
  assert.equal(normalizeJurisdiction("ca"), "US-CA");
  assert.equal(normalizeJurisdiction("Federal"), "US-FED");
  assert.equal(normalizeJurisdiction("EU"), "EU");
  assert.equal(normalizeJurisdiction("Parts Unknown"), "PARTS UNKNOWN"); // never guessed into a code
});

test("dedupeItems drops duplicate ids, title+jurisdiction matches (incl. apostrophe variants), reporting reasons", () => {
  const { unique, duplicates } = dedupeItems([
    ITEM,
    { ...ITEM, link: "other-source" }, // same id
    { ...ITEM, id: "ca-ccpa-amend-dup", title: "CCPA amendment: childrens data opt-in" }, // apostrophe-free variant, same juris
    { ...ITEM, id: "ny-diff", jurisdiction: "New York" }, // different juris -> kept
  ]);
  assert.equal(unique.length, 2);
  assert.equal(duplicates.length, 2);
  assert.ok(duplicates.every((d) => d.reason.length > 0));
});

test("classifyItem matches taxonomy keywords and falls back to other", () => {
  assert.equal(classifyItem(ITEM, RUBRIC).topic, "privacy");
  assert.equal(classifyItem({ ...ITEM, title: "Wage transparency rule", summary: "" }, RUBRIC).topic, "employment");
  assert.equal(classifyItem({ ...ITEM, title: "Import tariff schedule", summary: "tariffs" }, RUBRIC).topic, "other");
  // " ai " must not match inside words like "certain"
  assert.equal(classifyItem({ ...ITEM, title: "Certain grain standards", summary: "" }, RUBRIC).topic, "other");
});

test("scoreItem produces transparent breakdown and correct band", () => {
  const s = scoreItem(ITEM, RUBRIC, PROFILE, AS_OF);
  // jurisdiction US-CA (30) + privacy core (25) + 55d proximity (25) + final (15) = 95
  assert.equal(s.score, 95);
  assert.equal(s.band, "high");
  assert.equal(s.breakdown.length, 4);
  assert.ok(s.breakdown.every((b) => typeof b.points === "number" && b.rule.length > 0));
});

test("scoreItem: unknown status and missing date score low but never guess", () => {
  const s = scoreItem({ ...ITEM, status: "rumored", effectiveDate: null }, RUBRIC, PROFILE, AS_OF);
  assert.equal(s.score, 55); // 30 + 25 + 0 + 0
  const b = s.breakdown.find((x) => x.factor === "proximity");
  assert.equal(b.points, 0);
  assert.match(b.rule, /no parseable effective date/);
});

test("scoreItem: already-effective rules get no proximity points", () => {
  const s = scoreItem({ ...ITEM, effectiveDate: "2026-10-01" }, RUBRIC, PROFILE, AS_OF);
  assert.equal(s.scoring ?? s ? s.breakdown.find((x) => x.factor === "proximity").points : 0, 0);
});

test("scanFeed sorts by score then title, builds timeline by effective date", () => {
  const scan = scanFeed([ITEM, { ...ITEM, id: "eu-ai-act", title: "EU AI Act GPAI obligations", jurisdiction: "EU", status: "proposed", effectiveDate: "2026-12-01", summary: "AI obligations" }], RUBRIC, PROFILE, AS_OF);
  assert.equal(scan.items[0].id, "ca-ccpa-amend");
  assert.equal(scan.rubricVersion, "2026.11");
  assert.ok(scan.timeline.every((it, i, a) => i === 0 || String(a[i - 1].effectiveDate) <= String(it.effectiveDate)));
});

test("diffFeeds detects added, removed, and field changes", () => {
  const prev = [ITEM, { id: "old-rule", title: "Old rule", jurisdiction: "US-FED" }];
  const curr = [
    { ...ITEM, status: "effective", effectiveDate: "2026-12-15" },
    { id: "new-rule", title: "New rule", jurisdiction: "US-FED" },
  ];
  const d = diffFeeds(prev, curr);
  assert.equal(d.added.length, 1);
  assert.equal(d.removed.length, 1);
  const status = d.changed.find((c) => c.field === "status");
  const eff = d.changed.find((c) => c.field === "effectiveDate");
  assert.deepEqual(status, { id: "ca-ccpa-amend", field: "status", from: "final", to: "effective" });
  assert.deepEqual(eff, { id: "ca-ccpa-amend", field: "effectiveDate", from: "2027-01-01", to: "2026-12-15" });
});

test("diffRubrics reports weight and taxonomy changes with paths", () => {
  const next = JSON.parse(JSON.stringify(RUBRIC));
  next.version = "2026.12";
  next.factors.find((f) => f.id === "status").points.final = 18;
  next.topicTaxonomy.privacy.push("data broker");
  const d = diffRubrics(RUBRIC, next);
  assert.ok(d.some((x) => x.path === "version" && x.from === "2026.11" && x.to === "2026.12"));
  assert.ok(d.some((x) => x.path === "factors.status.points.final" && x.from === 15 && x.to === 18));
  assert.ok(d.some((x) => x.path === "topicTaxonomy.privacy"));
});

test("toCsv emits header + one row per item with escaped fields", () => {
  const scan = scanFeed([ITEM], RUBRIC, PROFILE, AS_OF);
  const csv = toCsv(scan);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "rank,id,title,jurisdiction,topic,status,effectiveDate,score,band,scoringRules,link");
  assert.match(lines[1], /1,"?ca-ccpa-amend/);
  assert.match(lines[1], /95,high/);
});
