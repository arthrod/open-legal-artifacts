#!/usr/bin/env node
// Generates src/data/artifacts.json — the single source of truth for the
// Open Legal Artifacts catalog app.
//
// Sources:
// 1. every open-artifacts dir that has a meta.json (scanned)
// 2. Four Arthur originals           (hardcoded below)
// 3. External "link, don't fork"     (hardcoded below)
//
// Run from app/:  node tools/gen-catalog.mjs

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const repoRoot = join(appDir, "..");
const oaDir = join(repoRoot, "open-artifacts");
const outFile = join(appDir, "src", "data", "artifacts.json");

/* ------------------------------------------------------------------ */
/* Arthur's four originals — hardcoded                                 */
/* ------------------------------------------------------------------ */

const ORIGINALS = [
  {
    name: "client-intake",
    title: "Client Intake",
    tagline:
      "Structured law-firm intake: narrative → AI-proposed questions with suggested answers → human review → matter summary, conflict-party list, urgency flags. Fail-closed validation.",
    repoDir: "artifacts/client-intake",
    demoPage: "open-artifacts/client-intake/demo/index.html",
    links: [
      { label: "Interactive demo", url: "open-artifacts/client-intake/demo/index.html" },
      { label: "Live app", url: "https://arthrod--bf6161ba-d937-11f1-a5d4-1607ee4eb77e.web.val.run/" },
      { label: "Val Town source", url: "https://www.val.town/x/arthrod/client-intake" },
    ],
  },
  {
    name: "contracts-playbook",
    title: "Contracts Playbook",
    tagline:
      "Pasted or uploaded agreement → ACC-style playbook draft (preferred / fallbacks / avoid, risk RYG, escalation) with source-quote verification behind every term.",
    repoDir: "artifacts/contracts-playbook",
    demoPage: "open-artifacts/contracts-playbook/demo/index.html",
    links: [
      { label: "Interactive demo", url: "open-artifacts/contracts-playbook/demo/index.html" },
      { label: "Live app", url: "https://arthrod--cdf728ae-d937-11f1-a239-1607ee4eb77e.web.val.run/" },
      { label: "Val Town source", url: "https://www.val.town/x/arthrod/playbook-from-doc" },
    ],
  },
  {
    name: "prompting-for-attorneys",
    title: "Prompting for Attorneys",
    tagline:
      "Ten-lesson interactive course teaching lawyers to write verifiable prompts — schema-first, with documented fallbacks. Static site, no dependencies.",
    repoDir: "artifacts/prompting-for-attorneys",
    demoPage: "open-artifacts/prompting-for-attorneys/demo/index.html",
    links: [
      { label: "Open the course", url: "open-artifacts/prompting-for-attorneys/demo/index.html" },
      { label: "On Val Town", url: "https://www.val.town/x/arthrod/prompting-for-attorneys" },
    ],
  },
  {
    name: "pii-ptbr-lgpd",
    title: "PII pt-BR / LGPD",
    tagline:
      "Portuguese (pt-BR) PII detection under the LGPD: GLiNER fine-tune + OpenAI Privacy Filter fine-tune, benchmark dataset, Hugging Face demos.",
    repoDir: "artifacts/pii-ptbr-lgpd",
    demoPage: "open-artifacts/pii-ptbr-lgpd/demo/index.html",
    links: [
      { label: "Interactive demo (rules-based)", url: "open-artifacts/pii-ptbr-lgpd/demo/index.html" },
      { label: "HF demo · GLiNER", url: "https://huggingface.co/spaces/arthrod/gliner-ptbr-pii-demo" },
      { label: "HF demo · OPF", url: "https://huggingface.co/spaces/arthrod/gliner-opf-ptbr-pii-demo" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* External catalog — link, don't fork                                 */
/* ------------------------------------------------------------------ */

const EXTERNAL = [
  {
    name: "live-contracts",
    title: "live-contracts",
    blurb:
      "SEC EX-10 exhibits converted to Markdown: search site, 4-tool MCP server, HF Parquet dataset (15,360 exhibits).",
    links: [
      { label: "Site", url: "https://live-contracts.arthur.law/" },
      { label: "Code", url: "https://github.com/jandira-tech/live-contracts" },
    ],
  },
  {
    name: "neurotic_docx_bench",
    title: "neurotic_docx_bench",
    blurb:
      "DOCX converters and redline engines scored against Word-as-oracle: 6,427 documents, 3,502 pairs, fixtures on Hugging Face.",
    links: [
      { label: "Code", url: "https://github.com/jandira-tech/neurotic_docx_bench" },
      { label: "Report", url: "https://benchmarks.law/neurotic-docx-bench/" },
    ],
  },
  {
    name: "editors_trial",
    title: "editors_trial",
    blurb:
      "Thirteen DOCX editors put through round-trip fidelity testing: 99 checks, 8 reports, 10 hostile packages.",
    links: [
      { label: "Code", url: "https://github.com/arthrod/editors_trial" },
      { label: "Report", url: "https://benchmarks.law/editors-trial/" },
    ],
  },
  {
    name: "amd_pii_generator",
    title: "amd_pii_generator",
    blurb:
      "Synthetic realistic pt-BR PII generator for privacy testing — the data source behind the PII/LGPD artifact.",
    links: [{ label: "Code", url: "https://github.com/arthrod/amd_pii_generator" }],
  },
  {
    name: "benchmarks-law",
    title: "benchmarks.law",
    blurb: "Independent legal-AI benchmark publication — canonical home of the benchmark projects above.",
    links: [{ label: "Site", url: "https://benchmarks.law/" }],
  },
];

/* ------------------------------------------------------------------ */
/* In-app interactive demos (hash routes) for open-artifacts by name   */
/* ------------------------------------------------------------------ */

const IN_APP_DEMOS = {
  "cite-check": "#/cite-check",
  "playbook-deviation-board": "#/deviation-board",
  "fact-chronology": "#/chronology",
  "tabular-review": "#/tabular-review",
};

/* ------------------------------------------------------------------ */
/* Taxonomies — practice areas (filter axis) + reader questions        */
/* (at-rest grouping axis). Both are per-artifact and independent.     */
/*                                                                     */
/* Assignment rule: assign by the data the tool is organized around,   */
/* not its engine — renewal-calendar's data is contract notice dates   */
/* → Deadlines; discovery-response-log's data is responses/objections  */
/* → Litigation.                                                       */
/* Every open artifact MUST appear in both maps (fail loud below) so a */
/* new artifact can't ship unmapped.                                   */
/* ------------------------------------------------------------------ */

const PRACTICE_AREAS = [
  { id: "contracts", label: "Contracts & transactions", filterLabel: "Contracts", caption: "Drafting, review, and deal support" },
  { id: "deadlines", label: "Deadlines & compliance dates", filterLabel: "Deadlines", caption: "Dockets, limitation periods, renewals" },
  { id: "litigation", label: "Litigation & discovery", filterLabel: "Litigation", caption: "Matters, responses, and watch walls" },
  { id: "documents", label: "Document review & evidence", filterLabel: "Documents", caption: "Review grids, cite-checks, chronologies" },
  { id: "a2j", label: "Access to justice", filterLabel: "Access to justice", caption: "Screeners, readers, and case boards" },
  { id: "intake", label: "Intake & triage", filterLabel: "Intake", caption: "Front doors, queues, and benchmarks" },
  { id: "governance", label: "Governance & operations", filterLabel: "Governance", caption: "Inventories, scans, and spend" },
  { id: "research", label: "Research & guidance", filterLabel: "Research", caption: "Answers from cited sources" },
];

const READER_QUESTIONS = [
  { id: "contract", label: "I have a contract", caption: "Obligations, playbook deviations, notice dates, deal terms" },
  { id: "case-deadline", label: "I have a case or a deadline", caption: "Matters, dockets, responses, courts' deadlines" },
  { id: "documents", label: "I have a pile of documents", caption: "Cite-checking, review grids, chronologies, reading papers" },
  { id: "practice", label: "I run a practice or program", caption: "Intake, pro bono programs, governance, spend, research" },
];

const PRACTICE_AREA_BY_NAME = {
  // Contracts & transactions
  "obligations-checker": "contracts",
  "playbook-deviation-board": "contracts",
  "sell-side-qa-log": "contracts",
  "venture-term-sheet-benchmark": "contracts",
  // Deadlines & compliance dates
  "entity-compliance-calendar": "deadlines",
  "limitations-radar": "deadlines",
  "renewal-calendar": "deadlines",
  // Litigation & discovery
  "discovery-response-log": "litigation",
  "docket-watch-wall": "litigation",
  "litigation-portfolio": "litigation",
  "matter-board": "litigation",
  "subpoena-response": "litigation",
  // Document review & evidence
  "cite-check": "documents",
  "fact-chronology": "documents",
  "patent-claim-comparison": "documents",
  "privilege-log-builder": "documents",
  "tabular-review": "documents",
  // Access to justice
  "criminal-charge-reality-check": "a2j",
  "eviction-notice-check-board": "a2j",
  "immigration-papers-reader": "a2j",
  "pro-bono-case-board": "a2j",
  "record-clearance": "a2j",
  "record-sealing-screener": "a2j",
  "rent-ledger-reviewer": "a2j",
  // Intake & triage
  "access-to-justice-front-door": "intake",
  "intake-benchmark": "intake",
  "intake-queue": "intake",
  // Governance & operations
  "ai-governance-benchmark": "governance",
  "ai-use-case-inventory": "governance",
  "outside-counsel-spend": "governance",
  "regulatory-horizon-scan": "governance",
  // Research & guidance
  "ask-legal": "research",
  "jurisdiction-survey-matrix": "research",
};

const READER_QUESTION_BY_NAME = {
  // I have a contract
  "obligations-checker": "contract",
  "playbook-deviation-board": "contract",
  "renewal-calendar": "contract",
  "sell-side-qa-log": "contract",
  "venture-term-sheet-benchmark": "contract",
  // I have a case or a deadline
  "entity-compliance-calendar": "case-deadline",
  "limitations-radar": "case-deadline",
  "discovery-response-log": "case-deadline",
  "subpoena-response": "case-deadline",
  "docket-watch-wall": "case-deadline",
  "litigation-portfolio": "case-deadline",
  "matter-board": "case-deadline",
  "record-clearance": "case-deadline",
  "eviction-notice-check-board": "case-deadline",
  "criminal-charge-reality-check": "case-deadline",
  "record-sealing-screener": "case-deadline",
  // I have a pile of documents
  "cite-check": "documents",
  "tabular-review": "documents",
  "fact-chronology": "documents",
  "privilege-log-builder": "documents",
  "patent-claim-comparison": "documents",
  "rent-ledger-reviewer": "documents",
  "immigration-papers-reader": "documents",
  "jurisdiction-survey-matrix": "documents",
  // I run a practice or program
  "access-to-justice-front-door": "practice",
  "intake-queue": "practice",
  "intake-benchmark": "practice",
  "pro-bono-case-board": "practice",
  "ask-legal": "practice",
  "ai-governance-benchmark": "practice",
  "ai-use-case-inventory": "practice",
  "regulatory-horizon-scan": "practice",
  "outside-counsel-spend": "practice",
};

/* ------------------------------------------------------------------ */
/* Scan every open-artifacts subdir that has a meta.json               */
/* ------------------------------------------------------------------ */

const VALID_CATEGORIES = new Set(["anthropic-built", "partner-built", "original-idea"]);

const TITLE_SMALL = new Set(["to", "of", "a", "an", "in", "for", "and", "vs", "the"]);
const TITLE_ACRONYMS = new Set(["ai", "pii", "qa", "eu", "ip", "hr", "lgpd"]);

function titleFromName(name) {
  return name
    .split("-")
    .map((w) => {
      if (TITLE_ACRONYMS.has(w)) return w.toUpperCase();
      if (TITLE_SMALL.has(w)) return w;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

if (!existsSync(oaDir)) {
  console.error(`gen-catalog: open-artifacts dir not found at ${oaDir}`);
  process.exit(1);
}

const open = [];
for (const entry of readdirSync(oaDir, { withFileTypes: true }).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (!entry.isDirectory()) continue;
  const dir = join(oaDir, entry.name);
  const metaPath = join(dir, "meta.json");
  if (!existsSync(metaPath)) continue; // dirs without meta.json are not catalog artifacts

  let meta;
  try {
    meta = JSON.parse(readFileSync(metaPath, "utf8"));
  } catch (err) {
    console.error(`gen-catalog: cannot parse ${metaPath}: ${err.message}`);
    process.exit(1);
  }
  if (meta.name !== entry.name) {
    console.error(`gen-catalog: meta.json name "${meta.name}" != dir "${entry.name}"`);
    process.exit(1);
  }
  if (!VALID_CATEGORIES.has(meta.category)) {
    console.error(`gen-catalog: unknown category "${meta.category}" in ${metaPath}`);
    process.exit(1);
  }

  const practiceArea = PRACTICE_AREA_BY_NAME[meta.name];
  if (!practiceArea) {
    console.error(`gen-catalog: no practice area mapped for "${meta.name}" — add it to PRACTICE_AREA_BY_NAME in tools/gen-catalog.mjs`);
    process.exit(1);
  }
  const readerQuestion = READER_QUESTION_BY_NAME[meta.name];
  if (!readerQuestion) {
    console.error(`gen-catalog: no reader question mapped for "${meta.name}" — add it to READER_QUESTION_BY_NAME in tools/gen-catalog.mjs`);
    process.exit(1);
  }

  open.push({
    name: meta.name,
    title: titleFromName(meta.name),
    tagline: meta.tagline,
    category: meta.category,
    practiceArea,
    readerQuestion,
    anthropicCounterpart: meta.anthropic_counterpart ?? null,
    status: meta.status ?? "shipped",
    hasDemo: existsSync(join(dir, "demo", "index.html")),
    hasSpec: existsSync(join(dir, "spec.md")),
    hasReadme: existsSync(join(dir, "README.md")),
    inAppDemo: IN_APP_DEMOS[meta.name] ?? null,
  });
}

/* Both taxonomy axes must partition the catalog exactly (fail loud). */
for (const area of PRACTICE_AREAS) {
  const n = open.filter((a) => a.practiceArea === area.id).length;
  if (n === 0) {
    console.error(`gen-catalog: practice area "${area.id}" has zero artifacts`);
    process.exit(1);
  }
}
const areaSum = PRACTICE_AREAS.reduce((s, a) => s + open.filter((o) => o.practiceArea === a.id).length, 0);
const questionSum = READER_QUESTIONS.reduce((s, q) => s + open.filter((o) => o.readerQuestion === q.id).length, 0);
if (areaSum !== open.length || questionSum !== open.length) {
  console.error(`gen-catalog: taxonomy sums (${areaSum} areas / ${questionSum} questions) != ${open.length} artifacts`);
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Write src/data/artifacts.json                                       */
/* ------------------------------------------------------------------ */

const catalog = {
  generatedAt: new Date().toISOString(),
  counts: {
    originals: ORIGINALS.length,
    open: open.length,
    external: EXTERNAL.length,
    originalIdeas: open.filter((a) => a.category === "original-idea").length,
  },
  originals: ORIGINALS,
  open,
  external: EXTERNAL,
  taxonomies: {
    practiceAreas: PRACTICE_AREAS,
    readerQuestions: READER_QUESTIONS,
  },
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(catalog, null, 2) + "\n", "utf8");

console.log(
  `gen-catalog: wrote src/data/artifacts.json — ` +
    `${catalog.counts.originals} originals · ${catalog.counts.open} open artifacts ` +
    `(${catalog.counts.originalIdeas} original-idea) · ${catalog.counts.external} external`,
);
console.log(
  `gen-catalog: taxonomies — ` +
    PRACTICE_AREAS.map((a) => `${a.id}:${open.filter((o) => o.practiceArea === a.id).length}`).join(" ") +
    ` | ` +
    READER_QUESTIONS.map((q) => `${q.id}:${open.filter((o) => o.readerQuestion === q.id).length}`).join(" "),
);
