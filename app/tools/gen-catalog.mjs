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

  open.push({
    name: meta.name,
    title: titleFromName(meta.name),
    tagline: meta.tagline,
    category: meta.category,
    anthropicCounterpart: meta.anthropic_counterpart ?? null,
    status: meta.status ?? "shipped",
    hasDemo: existsSync(join(dir, "demo", "index.html")),
    hasSpec: existsSync(join(dir, "spec.md")),
    hasReadme: existsSync(join(dir, "README.md")),
    inAppDemo: IN_APP_DEMOS[meta.name] ?? null,
  });
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
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(catalog, null, 2) + "\n", "utf8");

console.log(
  `gen-catalog: wrote src/data/artifacts.json — ` +
    `${catalog.counts.originals} originals · ${catalog.counts.open} open artifacts ` +
    `(${catalog.counts.originalIdeas} original-idea) · ${catalog.counts.external} external`,
);
