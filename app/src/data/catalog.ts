// Catalog data for the Open Legal Artifacts gallery.
// Sources: tmp/anthropic-legal-artifacts-catalog.md (workspace research run).

export interface ArthurOriginal {
  name: string;
  blurb: string;
  live?: string; // live demo URL
  repo: string; // repo-relative dir
}

export interface OpenReimplementation {
  name: string; // kebab-case, matches ../open-artifacts/<name>/
  title: string;
  blurb: string;
  anthropicCounterpart: string;
  better: string;
  route: string; // in-app hash route
}

export interface GalleryItem {
  name: string;
  oneLiner: string;
  builtBy: "Anthropic" | "Partner";
}

export const GITHUB = "https://github.com/arthrod/open-legal-artifacts";

export const arthurOriginals: ArthurOriginal[] = [
  {
    name: "Client Intake",
    blurb:
      "Structured client intake with conflict screening before a matter opens — fail-closed validation, no matter created on doubt.",
    live: "https://www.val.town/x/arthrod/client-intake",
    repo: "artifacts/client-intake/",
  },
  {
    name: "Contracts Playbook",
    blurb:
      "Generates an ACC-style contract playbook from your documents, with source-quote verification behind every preferred/fallback/avoid term.",
    live: "https://www.val.town/x/arthrod/playbook-from-doc/code/",
    repo: "artifacts/contracts-playbook/",
  },
  {
    name: "Prompting for Attorneys",
    blurb:
      "A static, self-paced course teaching lawyers to write verifiable prompts — schema-first, with documented fallbacks.",
    repo: "artifacts/prompting-for-attorneys/",
  },
  {
    name: "PII pt-BR / LGPD",
    blurb:
      "Model cards, evaluation metrics, and Hugging Face links for Brazilian-Portuguese PII detection under the LGPD.",
    repo: "artifacts/pii-ptbr-lgpd/",
  },
];

export const openReimplementations: OpenReimplementation[] = [
  {
    name: "cite-check",
    title: "Cite check",
    blurb:
      "Compares a legal document with its sources: exact/normalized/fuzzy quote matching is deterministic code — no LLM guessing.",
    anthropicCounterpart: "Cite check (Anthropic gallery)",
    better:
      "Deterministic diff core: quotes are matched by code, never guessed; the LLM is only ever asked whether a source supports a proposition, and an unsupported cell renders as unverified.",
    route: "#/cite-check",
  },
  {
    name: "playbook-deviation-board",
    title: "Playbook deviation board",
    blurb:
      "Classifies each clause against a versioned playbook as standard / fallback / deviation, quoting the matched playbook rule.",
    anthropicCounterpart: "Playbook deviation board (Anthropic gallery)",
    better:
      "The playbook is versioned structured data (JSON/YAML), classification is tri-state with the matched clause and rule quoted, and every decision routes to an approvals queue with a log.",
    route: "#/deviation-board",
  },
  {
    name: "fact-chronology",
    title: "Fact chronology",
    blurb:
      "Builds a sourced timeline from facts JSON and flags conflicts where documents disagree — each entry locked to its evidence.",
    anthropicCounterpart: "Fact chronology (Anthropic gallery)",
    better:
      "Per-fact evidence graph: every entry carries its source span, conflicts are flagged deterministically when two sources disagree on the same topic, and entries lock once an attorney verifies them.",
    route: "#/chronology",
  },
  {
    name: "tabular-review",
    title: "Tabular review",
    blurb:
      "Documents × questions table with cell-level source anchors; anything not found in the document is an explicit unverified cell.",
    anthropicCounterpart: "Tabular review (Anthropic gallery)",
    better:
      "Every cell is either quoted from the document or marked unverified — never guessed — and the table exports to CSV with anchors intact.",
    route: "#/tabular-review",
  },
];

// The other 28 Anthropic-gallery artifacts (22 Anthropic-built, 10 partner-built;
// the 4 phase-1 open reimplementations above are excluded). Phase-2 cards.
export const fullGallery: GalleryItem[] = [
  { name: "Regulatory horizon scan", oneLiner: "Upcoming regulations on one timeline, scored for impact.", builtBy: "Anthropic" },
  { name: "Ask legal", oneLiner: "Answers routine questions, routes the rest to a lawyer.", builtBy: "Anthropic" },
  { name: "Jurisdiction survey matrix", oneLiner: "One topic compared across states or countries, linked to the law.", builtBy: "Anthropic" },
  { name: "Matter board", oneLiner: "Engagement letters and emails turned into one board of open matters.", builtBy: "Anthropic" },
  { name: "New client intake", oneLiner: "Checks names for conflicts before a matter opens.", builtBy: "Anthropic" },
  { name: "Renewal calendar", oneLiner: "Last day to give notice on each contract, from its terms.", builtBy: "Anthropic" },
  { name: "Discovery response log", oneLiner: "Drafts each discovery response from the case file and logs objections.", builtBy: "Anthropic" },
  { name: "Patent claim comparison", oneLiner: "Compares claims element-by-element against the closest patents.", builtBy: "Anthropic" },
  { name: "Docket watch wall", oneLiner: "Tracks each case's filings since last look.", builtBy: "Anthropic" },
  { name: "AI use-case inventory", oneLiner: "Each internal AI use, with a first-pass risk level.", builtBy: "Anthropic" },
  { name: "Sell-side Q&A log", oneLiner: "Tracks buyer questions to release in M&A diligence.", builtBy: "Anthropic" },
  { name: "Outside counsel spend", oneLiner: "Checks invoices against your billing guidelines.", builtBy: "Anthropic" },
  { name: "Entity compliance calendar", oneLiner: "Filing deadlines across every entity and jurisdiction.", builtBy: "Anthropic" },
  { name: "Litigation portfolio", oneLiner: "Tracks reserves, traced to source.", builtBy: "Anthropic" },
  { name: "Eviction notice check board", oneLiner: "Checks a notice against your checklist, flags failures.", builtBy: "Anthropic" },
  { name: "Pro bono case board", oneLiner: "Each case by stage, owner, due date.", builtBy: "Anthropic" },
  { name: "Access to justice front door", oneLiner: "Staff get approved guidance, escalates the rest.", builtBy: "Anthropic" },
  { name: "Intake queue", oneLiner: "Screens requests for conflicts, drafts the letter.", builtBy: "Anthropic" },
  { name: "Obligations checker", oneLiner: "Lists both parties' obligations in the contract's own words.", builtBy: "Partner" },
  { name: "AI governance benchmark", oneLiner: "Maps governance across 12 questions, 4 areas.", builtBy: "Partner" },
  { name: "Harvey Intake", oneLiner: "One front door for legal questions, answered from Legal's own guidance.", builtBy: "Partner" },
  { name: "Subpoena response", oneLiner: "Drafts objections from your past letters.", builtBy: "Partner" },
  { name: "Venture term sheet benchmark", oneLiner: "Checks terms against the market.", builtBy: "Partner" },
  { name: "Immigration papers reader", oneLiner: "A plain-language first read of key dates and missing documents.", builtBy: "Partner" },
  { name: "Record sealing screener", oneLiner: "Whether a criminal record is eligible for sealing, under D.C. law.", builtBy: "Partner" },
  { name: "Rent ledger reviewer", oneLiner: "Recalculates a ledger against legal limits.", builtBy: "Partner" },
  { name: "Record clearance", oneLiner: "Whether a client's record can be cleared under their state's rules.", builtBy: "Partner" },
  { name: "Criminal charge reality check", oneLiner: "Sentencing range and how those cases usually end. New York only.", builtBy: "Partner" },
];
