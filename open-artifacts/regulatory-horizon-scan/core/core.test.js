/** Tests for regulatory-horizon-scan core. Run: node --test core/core.test.js */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeTitle, parseDate, normalizeJurisdiction, dedupeItems,
  classifyItem, scoreItem, scanFeed, diffFeeds, diffRubrics, toCsv,
  coverageGaps, toMarkdown,
} from "./core.js";

const RUBRIC = {
  version: "2026.11",
  maxScore: 100,
  factors: [
    { id: "jurisdiction", label: "Operating jurisdiction", points: { exact: 30, adjacent: 15, other: 0 } },
    { id: "topic", label: "Topic relevance", points: { core: 25, related: 12, other: 0 } },
    { id: "proximity", label: "Time to effective date", points: { other: 0 }, thresholds: [{ withinDays: 90, points: 25 }, { withinDays: 180, points: 15 }, { withinDays: 365, points: 8 }] },
    { id: "commentWindow", label: "Open comment window", points: { other: 0 }, thresholds: [{ withinDays: 30, points: 15 }] },
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
  provenance: "primary",
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
  // jurisdiction US-CA (30) + privacy core (25) + 55d proximity (25) + no comment window (0) + final (15) = 95
  assert.equal(s.score, 95);
  assert.equal(s.band, "high");
  assert.equal(s.breakdown.length, 5);
  assert.ok(s.breakdown.every((b) => typeof b.points === "number" && b.rule.length > 0));
  assert.deepEqual(s.flags, []);
});

test("scoreItem: unknown status and missing date score low but never guess", () => {
  const s = scoreItem({ ...ITEM, status: "rumored", effectiveDate: null }, RUBRIC, PROFILE, AS_OF);
  assert.equal(s.score, 55); // 30 + 25 + 0 + 0 + 0
  const b = s.breakdown.find((x) => x.factor === "proximity");
  assert.equal(b.points, 0);
  assert.match(b.rule, /no parseable effective date/);
});

test("scoreItem: US state law outside profile scores adjacent (never exact) when only US-FED is in profile", () => {
  const tx = { ...ITEM, id: "tx-rule", title: "Texas Biometric Retention Schedule", jurisdiction: "Texas" };
  const fedOnly = scoreItem(tx, RUBRIC, { jurisdictions: ["US-FED"], coreTopics: ["privacy"] }, AS_OF)
    .breakdown.find((b) => b.factor === "jurisdiction");
  assert.equal(fedOnly.points, 15); // adjacent tier — a TX-only rule is not a US-FED match
  assert.ok(!/nationwide/.test(fedOnly.rule), `rule text must not claim a state rule applies nationwide: "${fedOnly.rule}"`);
  // state listed in profile -> still exact
  const inProfile = scoreItem({ ...tx, jurisdiction: "California" }, RUBRIC, { jurisdictions: ["US-CA"], coreTopics: ["privacy"] }, AS_OF)
    .breakdown.find((b) => b.factor === "jurisdiction");
  assert.equal(inProfile.points, 30);
  assert.match(inProfile.rule, /exact/);
  // no US jurisdiction in profile at all -> other
  const none = scoreItem(tx, RUBRIC, { jurisdictions: ["EU"], coreTopics: ["privacy"] }, AS_OF)
    .breakdown.find((b) => b.factor === "jurisdiction");
  assert.equal(none.points, 0);
});

test("scoreItem: already-effective rules get no proximity points", () => {
  const s = scoreItem({ ...ITEM, effectiveDate: "2026-10-01" }, RUBRIC, PROFILE, AS_OF);
  assert.equal(s.scoring ?? s ? s.breakdown.find((x) => x.factor === "proximity").points : 0, 0);
});

/* ---------- improvement 1: commentWindow factor + itemType (ANPR/RFI) cap ---------- */

test("commentWindow: open comment deadline within 30d earns threshold points", () => {
  const s = scoreItem({ ...ITEM, status: "rumored", effectiveDate: null, commentDeadline: "2026-11-27" }, RUBRIC, PROFILE, AS_OF);
  const cw = s.breakdown.find((b) => b.factor === "commentWindow");
  assert.equal(cw.points, 15);
  assert.match(cw.rule, /closes in 20d/);
  assert.equal(s.score, 70); // 30 + 25 + 0 + 15 + 0
});

test("commentWindow: closed windows and beyond-threshold deadlines earn nothing", () => {
  const closed = scoreItem({ ...ITEM, commentDeadline: "2026-10-01" }, RUBRIC, PROFILE, AS_OF);
  assert.equal(closed.breakdown.find((b) => b.factor === "commentWindow").points, 0);
  assert.match(closed.breakdown.find((b) => b.factor === "commentWindow").rule, /closed/);
  const far = scoreItem({ ...ITEM, commentDeadline: "2027-06-01" }, RUBRIC, PROFILE, AS_OF);
  assert.equal(far.breakdown.find((b) => b.factor === "commentWindow").points, 0);
  assert.match(far.breakdown.find((b) => b.factor === "commentWindow").rule, /beyond all thresholds/);
});

test("itemType ANPR/RFI is capped below high band with an explanatory flag", () => {
  for (const itemType of ["ANPR", "rfi"]) {
    const s = scoreItem({ ...ITEM, itemType }, RUBRIC, PROFILE, AS_OF);
    assert.equal(s.score, 95); // score unchanged — only the band is capped
    assert.equal(s.band, "medium");
    assert.equal(s.flags.length, 1);
    assert.match(s.flags[0], /ANPR\/RFI/);
  }
});

/* ---------- improvement 2: provenance tiers ---------- */

test("provenance: non-primary sources cap band at medium with a trace-to-primary flag", () => {
  const s = scoreItem({ ...ITEM, provenance: "secondary" }, RUBRIC, PROFILE, AS_OF);
  assert.equal(s.score, 95);
  assert.equal(s.band, "medium");
  assert.match(s.flags.join(" "), /trace to primary/);
});

test("provenance: primary is never capped; missing or invalid provenance is treated as unknown and capped", () => {
  assert.equal(scoreItem(ITEM, RUBRIC, PROFILE, AS_OF).flags.length, 0);
  const missing = scoreItem({ ...ITEM, provenance: undefined }, RUBRIC, PROFILE, AS_OF);
  assert.equal(missing.band, "medium");
  assert.equal(missing.provenance, "unknown");
  const invalid = scoreItem({ ...ITEM, provenance: "some-blog" }, RUBRIC, PROFILE, AS_OF);
  assert.equal(invalid.band, "medium");
  assert.equal(invalid.provenance, "unknown");
  assert.match(invalid.flags.join(" "), /provenance=unknown/);
});

/* ---------- improvement 3: merge-dedupe (richest wins) ---------- */

test("dedupeItems merges richest fields: kept item without link gains the duplicate's link", () => {
  const { unique, duplicates } = dedupeItems([
    { ...ITEM, link: undefined },
    { ...ITEM, id: "ca-ccpa-amend-dup", link: "https://example.org/b/ca-ccpa", source: "Aggregator B" },
  ]);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].link, "https://example.org/b/ca-ccpa");
  assert.deepEqual(unique[0].mergedFrom, ["ca-ccpa-amend-dup"]);
  assert.ok(duplicates[0].mergedFields.includes("link"));
});

test("dedupeItems merge fills missing dates but never overwrites existing values", () => {
  const { unique } = dedupeItems([
    { ...ITEM, effectiveDate: null, publishedDate: null, commentDeadline: undefined },
    { ...ITEM, id: "dup-2", effectiveDate: "2027-03-01", publishedDate: "2026-10-01", commentDeadline: "2026-12-01" },
  ]);
  assert.equal(unique[0].effectiveDate, "2027-03-01");
  assert.equal(unique[0].publishedDate, "2026-10-01");
  assert.equal(unique[0].commentDeadline, "2026-12-01");
  // existing values win: kept title/link/status are never replaced
  assert.equal(unique[0].title, ITEM.title);
  assert.equal(unique[0].status, ITEM.status);
});

/* ---------- B07 fix: id-less (manual-entry) items are never collapsed as "duplicate id" ---------- */

test("dedupeItems keeps distinct id-less items separate (manual-entry feeds)", () => {
  const { unique, duplicates } = dedupeItems([
    { title: "Colorado Chatbot Safety Act", jurisdiction: "US-CO" },
    { title: "EU AI Act transparency rules", jurisdiction: "EU" },
    { title: "New York wage rules", jurisdiction: "New York" },
  ]);
  assert.equal(unique.length, 3);
  assert.deepEqual(duplicates, []);
});

test("dedupeItems still merges id-less items sharing normalized title + jurisdiction", () => {
  const { unique, duplicates } = dedupeItems([
    { title: "Colorado Chatbot Safety Act", jurisdiction: "US-CO" },
    { title: "colorado chatbot safety act!", jurisdiction: "Colorado", link: "https://example.gov/co-chatbot" },
  ]);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].link, "https://example.gov/co-chatbot"); // merge still enriches the kept item
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].reason, "same normalized title + jurisdiction");
});

/* ---------- improvement 4: coverage gaps (Step 0) ---------- */

test("coverageGaps reports profile jurisdictions and topics with zero feed items, with severity", () => {
  const gaps = coverageGaps([ITEM], { jurisdictions: ["US-FED", "EU"], coreTopics: ["ai"], relatedTopics: ["employment"] }, RUBRIC);
  const j = gaps.find((g) => g.kind === "jurisdiction" && g.value === "US-FED");
  assert.ok(j && j.severity === "high");
  const e = gaps.find((g) => g.kind === "jurisdiction" && g.value === "EU");
  assert.ok(e && e.severity === "high");
  const t = gaps.find((g) => g.kind === "topic" && g.value === "ai");
  assert.ok(t && t.severity === "medium"); // core topic gap
  const r = gaps.find((g) => g.kind === "topic" && g.value === "employment");
  assert.ok(r && r.severity === "low"); // related topic gap
  // US-CA is covered by ITEM; privacy is covered — neither reported
  assert.ok(!gaps.some((g) => g.value === "US-CA"));
  assert.ok(!gaps.some((g) => g.value === "privacy"));
});

test("coverageGaps returns no gaps when every profile jurisdiction and topic is covered", () => {
  const gaps = coverageGaps(
    [ITEM, { ...ITEM, id: "x", jurisdiction: "US-FED", title: "Artificial intelligence reporting act" }],
    { jurisdictions: ["US-FED", "US-CA"], coreTopics: ["privacy", "ai"] },
    RUBRIC
  );
  assert.deepEqual(gaps, []);
});

/* ---------- improvement 6: timeline completeness ---------- */

test("scanFeed timeline keeps undated and past items in sections and includes comment-deadline milestones", () => {
  const scan = scanFeed([
    ITEM,
    { ...ITEM, id: "past-rule", title: "Past wage disclosure rule", status: "effective", effectiveDate: "2026-09-17" },
    { ...ITEM, id: "undated-rule", title: "Undated rumored privacy bill", effectiveDate: null },
    { ...ITEM, id: "anpr-rule", title: "Agency ANPR on artificial intelligence", itemType: "ANPR", effectiveDate: null, commentDeadline: "2026-11-20", status: "proposed" },
  ], RUBRIC, PROFILE, AS_OF);
  // milestones carry kind + date, sorted ascending, split upcoming/past at asOf
  assert.ok(scan.timeline.upcoming.every((m, i, a) => i === 0 || a[i - 1].date <= m.date));
  assert.ok(scan.timeline.past.every((m) => m.date < AS_OF));
  const cw = scan.timeline.upcoming.find((m) => m.itemId === "anpr-rule");
  assert.equal(cw.kind, "comment-deadline");
  assert.equal(cw.date, "2026-11-20");
  // undated items are kept, not dropped
  assert.ok(scan.timeline.undated.some((u) => u.itemId === "undated-rule"));
  // actionBy = min(effectiveDate, commentDeadline); null when both absent
  assert.equal(scan.items.find((i) => i.id === "anpr-rule").actionBy, "2026-11-20");
  assert.equal(scan.items.find((i) => i.id === "undated-rule").actionBy, null);
  assert.equal(scan.items.find((i) => i.id === "ca-ccpa-amend").actionBy, "2027-01-01");
});

test("scanFeed sorts by score then title and includes coverage gaps in the scan result", () => {
  const scan = scanFeed([ITEM, { ...ITEM, id: "eu-ai-act", title: "EU AI Act GPAI obligations", jurisdiction: "EU", status: "proposed", effectiveDate: "2026-12-01", summary: "AI obligations" }], RUBRIC, PROFILE, AS_OF);
  assert.equal(scan.items[0].id, "ca-ccpa-amend");
  assert.equal(scan.rubricVersion, "2026.11");
  assert.equal(scan.timeline.upcoming[0].itemId, "eu-ai-act");
  // profile jurisdiction US-FED has zero feed items (exact-match coverage check)
  assert.ok(scan.coverageGaps.some((g) => g.kind === "jurisdiction" && g.value === "US-FED"));
  assert.ok(!scan.coverageGaps.some((g) => g.value === "US-CA" || g.value === "EU"));
});

/* ---------- improvement 5: toMarkdown digest ---------- */

const EXAMPLE_INPUT = JSON.parse(readFileSync(new URL("../examples/input.json", import.meta.url), "utf8"));

test("toMarkdown emits a digest with bottom line, coverage gaps, and per-item breakdown (exact snapshot)", () => {
  const scan = scanFeed(EXAMPLE_INPUT.currentFeed, EXAMPLE_INPUT.rubric, EXAMPLE_INPUT.profile, EXAMPLE_INPUT.asOf);
  const md = toMarkdown(scan);
  assert.equal(md, EXPECTED_DIGEST);
});

const EXPECTED_DIGEST = `# Regulatory horizon scan digest

**Bottom line:** 3 action items (band=high); earliest action date 2026-11-25 (comment window closes — Texas Biometric Retention Schedule). As of 2026-11-07, rubric \`2026.11\`.

## Coverage gaps

- **[high]** jurisdiction UK — profile jurisdiction has zero feed items
- **[low]** topic security — related topic has zero feed items

## High band (3 items)

### 1. CCPA Amendment: Children's Data Opt-In — score 95

\`ca-ccpa-amend\` · US-CA · privacy · status final · effective 2027-01-01 · comments close — · provenance primary
- jurisdiction +30 (exact profile jurisdiction match)
- topic +25 (core topic)
- proximity +25 (effective in 55d (<= 90d threshold))
- commentWindow +0 (no comment deadline)
- status +15 (status="final")

### 2. FCC AI Voice Disclosure in Outreach Calls — score 85

\`us-fcc-ai-disclosure\` · US-FED · ai · status final · effective 2027-02-15 · comments close — · provenance primary
- jurisdiction +30 (exact profile jurisdiction match)
- topic +25 (core topic)
- proximity +15 (effective in 100d (<= 180d threshold))
- commentWindow +0 (no comment deadline)
- status +15 (status="final")

### 3. Texas Biometric Retention Schedule — score 78

\`tx-biometric-retention\` · US-TX · privacy · status proposed · NPRM · effective 2027-04-01 · comments close 2026-11-25 · provenance primary
- jurisdiction +15 (US state rule outside profile jurisdictions; adjacent tier only (US-FED in profile, but a state rule binds in its state))
- topic +25 (core topic)
- proximity +15 (effective in 145d (<= 180d threshold))
- commentWindow +15 (comment window open, closes in 18d (<= 30d threshold))
- status +8 (status="proposed")

## Medium band (2 items)

### 4. SEC ANPR: Artificial Intelligence Model Risk — score 78 (band capped)

\`us-sec-ai-anpr\` · US-FED · ai · status proposed · ANPR · effective — · comments close 2026-12-01 · provenance primary
- jurisdiction +30 (exact profile jurisdiction match)
- topic +25 (core topic)
- proximity +0 (no parseable effective date)
- commentWindow +15 (comment window open, closes in 24d (<= 30d threshold))
- status +8 (status="proposed")
- flag: itemType=anpr is pre-rule exploratory (ANPR/RFI) — band capped below high

### 5. NY Wage Transparency for Remote Roles — score 62

\`ny-pay-transparency\` · US-NY · employment · status effective · effective 2026-09-17 · comments close — · provenance primary
- jurisdiction +30 (exact profile jurisdiction match)
- topic +12 (related topic)
- proximity +0 (already effective)
- commentWindow +0 (no comment deadline)
- status +20 (status="effective")

## Low band (1 item)

### 6. EU Umbrella Data Regulation 2026 — score 8

\`eu-umbrella-2026\` · EU · other · status proposed · effective 2028-03-01 · comments close — · provenance primary
- jurisdiction +0 (no profile jurisdiction match)
- topic +0 (topic outside profile)
- proximity +0 (effective in 480d (beyond all thresholds))
- commentWindow +0 (no comment deadline)
- status +8 (status="proposed")

_All data fictional. Not legal advice._
`;

/* ---------- diffing ---------- */

test("diffFeeds detects added, removed, and field changes (incl. commentDeadline)", () => {
  const prev = [{ ...ITEM, commentDeadline: "2026-11-20" }, { id: "old-rule", title: "Old rule", jurisdiction: "US-FED" }];
  const curr = [
    { ...ITEM, status: "effective", effectiveDate: "2026-12-15", commentDeadline: "2026-12-15" },
    { id: "new-rule", title: "New rule", jurisdiction: "US-FED" },
  ];
  const d = diffFeeds(prev, curr);
  assert.equal(d.added.length, 1);
  assert.equal(d.removed.length, 1);
  const status = d.changed.find((c) => c.field === "status");
  const eff = d.changed.find((c) => c.field === "effectiveDate");
  const cdl = d.changed.find((c) => c.field === "commentDeadline");
  assert.deepEqual(status, { id: "ca-ccpa-amend", field: "status", from: "final", to: "effective" });
  assert.deepEqual(eff, { id: "ca-ccpa-amend", field: "effectiveDate", from: "2027-01-01", to: "2026-12-15" });
  assert.deepEqual(cdl, { id: "ca-ccpa-amend", field: "commentDeadline", from: "2026-11-20", to: "2026-12-15" });
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

/* ---------- export ---------- */

test("toCsv emits header + one row per item with escaped fields", () => {
  const scan = scanFeed([ITEM], RUBRIC, PROFILE, AS_OF);
  const csv = toCsv(scan);
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0], "rank,id,title,jurisdiction,topic,status,effectiveDate,score,band,scoringRules,link");
  assert.match(lines[1], /1,"?ca-ccpa-amend/);
  assert.match(lines[1], /95,high/);
});

test("toCsv carries band-cap flags into the scoringRules cell (audit trail)", () => {
  const scan = scanFeed([{ ...ITEM, provenance: "secondary" }], RUBRIC, PROFILE, AS_OF);
  assert.match(toCsv(scan), /trace to primary/);
});

/* ---------- review 86: demo XSS sweep (paste-a-feed is the advertised workflow) ---------- */

const DEMO_HTML = readFileSync(new URL("../demo/index.html", import.meta.url), "utf8");

// Unescaped interpolations are allowlisted: core-computed enums/numbers only —
// topic/kind/field names come from fixed taxonomy/DIFF_FIELDS lists, gap chips
// come from the profile (not the pasted feed), and the weights editor's
// f.id/k/t.withinDays come from the bundled rubric and are bound via textContent.
// Everything else must go through esc().
const SAFE_UNESCAPED = new Set([
  "b.factor", "b.points", "i + 1", "it.topic", "it.scoring.score", "it.scoring.band",
  "flags", 'd.mergedFields.length ? " (+" + d.mergedFields.join("/") + ")" : ""', "g.severity", "g.kind", "g.value",
  "m.kind", "m.score", "u.score", "c.field", "f.id", "k", "t.withinDays", "i",
]);

test("demo escapes every feed-derived interpolation reaching innerHTML", () => {
  const exprs = [...DEMO_HTML.matchAll(/\$\{([^{}]*)\}/g)].map((m) => m[1].trim());
  assert.ok(exprs.length > 20, "sweep found the demo's interpolations");
  for (const e of exprs) {
    assert.ok(
      e.startsWith("esc(") || SAFE_UNESCAPED.has(e),
      `unescaped interpolation \`${e}\` reaches innerHTML — wrap feed-derived strings in esc()`
    );
  }
});

/* ---------- B07 fix: "better than counterpart" claims stay defensible ---------- */

const README_MD = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const SPEC_MD = readFileSync(new URL("../spec.md", import.meta.url), "utf8");

test("README/spec contain no falsified counterpart claims (snapshot-only, LLM-prose wording)", () => {
  for (const [name, doc] of [["README.md", README_MD], ["spec.md", SPEC_MD]]) {
    assert.ok(!doc.includes("LLM prose"), `${name}: "counterpart policies are LLM prose" was falsified — keep the defensible tested-code claim`);
    assert.ok(!/closed artifact snapshots|shows a snapshot/.test(doc), `${name}: "counterpart has no diff" was falsified — claim field-level + rubric-version diff instead`);
  }
  // the defensible replacements must actually be present
  assert.match(README_MD, /field-level/i);
  assert.match(SPEC_MD, /rubric/);
});

test("demo score cell renders the actual cap flag text, not a literal per flag", () => {
  assert.ok(!/>capped<\/span>/.test(DEMO_HTML), "flags cell must not hardcode 'capped'");
  assert.ok(DEMO_HTML.includes('<span class="flag">${esc(f)}</span>'), "flags cell renders esc(f)");
});
