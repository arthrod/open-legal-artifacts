# open-legal-artifacts

> Open legal artifacts: every legal AI artifact, open and better.

**Playground: <https://arthrod--4075ab70dae211f1929a1607ee4eb77e.web.val.run/>** (Val Town — canonical) ·
<https://arthrod.github.io/open-legal-artifacts/> (mirror) ·
Repo: <https://github.com/arthrod/open-legal-artifacts>

An open playground of legal-AI artifacts by [Arthur Souza Rodrigues](https://arthur.law) —
law-firm intake, contracts playbooks, prompting education for attorneys, and pt-BR/LGPD
PII detection — plus a public commitment map: for every legal artifact in Anthropic's
"Claude for Legal" gallery, an open counterpart that is auditable, self-hostable, and
where possible *verifiably better* (deterministic cores, rules-as-data, source-linked
outputs that survive export).

Everything in this repo is MIT-licensed. Live demos run on [Val Town](https://val.town)
(read the source in this repo, not just the demo).

## Arthur's artifacts

| Artifact | What it does | Links |
|---|---|---|
| [`artifacts/client-intake/`](artifacts/client-intake/README.md) | Guided law-firm intake: narrative → AI-proposed questions with suggested answers → human review → firm summary, conflict-party list, urgency flags. Strict JSON + repair + assert; confirm-before-save. | [Live demo](https://arthrod--bf6161ba-d937-11f1-a5d4-1607ee4eb77e.web.val.run/) · [Val Town source](https://www.val.town/x/arthrod/client-intake) · [GitHub mirror](https://github.com/jandira-tech/intake-demo) |
| [`artifacts/contracts-playbook/`](artifacts/contracts-playbook/README.md) | Pasted or uploaded agreement → ACC-style contracts playbook draft (preferred / ordered fallbacks / avoid, risk RYG, escalation), with source-quote verification, optional pattern redaction, version families, and counterparty redline review. | [Live demo](https://arthrod--cdf728ae-d937-11f1-a239-1607ee4eb77e.web.val.run/) · [Val Town source](https://www.val.town/x/arthrod/playbook-from-doc) |
| [`artifacts/prompting-for-attorneys/`](artifacts/prompting-for-attorneys/README.md) | Ten-lesson interactive prompting course for lawyers. Static site, no build step, no dependencies. | [Open `index.html`](artifacts/prompting-for-attorneys/index.html) |
| [`artifacts/pii-ptbr-lgpd/`](artifacts/pii-ptbr-lgpd/README.md) | Portuguese (pt-BR) PII detection under LGPD: GLiNER fine-tune + OpenAI Privacy Filter fine-tune, benchmark dataset, two HF Space demos. | [GLiNER demo](https://huggingface.co/spaces/arthrod/gliner-ptbr-pii-demo) · [OPF demo](https://huggingface.co/spaces/arthrod/gliner-opf-ptbr-pii-demo) · [Model](https://huggingface.co/arthrod/gliner-opf-ptbr-pii-v1) |

Adjacent work that already has a better home elsewhere — benchmarks, datasets, tooling —
is linked, not forked, in [`catalog/`](catalog/):

- [`catalog/benchmarks.md`](catalog/benchmarks.md) — benchmarks.law, editors_trial, neurotic_docx_bench, Bench 03/04 (cited only)
- [`catalog/data.md`](catalog/data.md) — live-contracts, amd_pii_generator, Hugging Face datasets
- [`catalog/anthropic.md`](catalog/anthropic.md) — Anthropic's own legal-artifact surface and open reference repo

## The Anthropic gallery, mapped

Anthropic's [Claude for Legal artifacts gallery](https://claude.com/resources/articles/introducing-artifacts-for-legal-work)
(announced 2026-10-28) holds 32 artifacts: 22 Anthropic-built + 10 partner/nonprofit-built.
Our goal: an open counterpart for **every one of them** — source-available, self-hostable,
with deterministic cores where determinism is possible and rules-as-data where law is the logic.

Status legend: **shipped** (in this repo today) · **phase-2** (backlog) · **external-link** (better home elsewhere).

### Anthropic-built (22)

| # | Gallery artifact | Our counterpart | Status | What's better |
|---|---|---|---|---|
| 1 | Tabular review | `open-artifacts/tabular-review` | **shipped** | Cell-level provenance that survives export (CSV/PDF anchors), re-run diffing when a contract version changes, user-owned question templates |
| 2 | Regulatory horizon scan | [`open-artifacts/regulatory-horizon-scan/`](open-artifacts/regulatory-horizon-scan/) | **shipped** | Open regulatory feeds (Federal Register, EUR-Lex) with diffing + dedupe; transparent, versioned impact-scoring rubric you can audit |
| 3 | Ask legal | [`open-artifacts/ask-legal/`](open-artifacts/ask-legal/) | **shipped** | Guidance base in open formats under your control, per-topic escalation SLAs, confidence gating, full question audit log |
| 4 | Jurisdiction survey matrix | [`open-artifacts/jurisdiction-survey-matrix/`](open-artifacts/jurisdiction-survey-matrix/) | **shipped** | Authoritative open-law sources per cell (CourtListener, state codes, EUR-Lex), verification dates, "unverified" cells never guessed |
| 5 | Cite check | `open-artifacts/cite-check` | **shipped** | Deterministic quote-diff + citation parsing core (eyecite); LLM only judges proposition support; every flag carries quote evidence |
| 6 | Playbook deviation board | [`artifacts/contracts-playbook/`](artifacts/contracts-playbook/README.md) | **shipped** | Playbook as versioned data with family lineage + clause-level diffs, source-quote verification, redaction before model calls, free model (`gpt-5-nano`), self-hostable |
| 7 | Matter board | [`open-artifacts/matter-board/`](open-artifacts/matter-board/) | **shipped** | Change-detection instead of snapshot staleness; export to open formats |
| 8 | New client intake | [`artifacts/client-intake/`](artifacts/client-intake/README.md) | **shipped** | Full source available; demo mode fails closed (no storage without `ADMIN_TOKEN`); conflict-party list generated at finalize; no connector lock-in |
| 9 | Renewal calendar | [`open-artifacts/renewal-calendar/`](open-artifacts/renewal-calendar/) | **shipped** | Deadline store with ICS export + notifications; human confirmation of each extracted date |
| 10 | Fact chronology | `open-artifacts/fact-chronology` | **shipped** | Per-fact evidence graph (supporting vs contradicting spans), date normalization for ambiguous documents, lockable verified entries |
| 11 | Discovery response log | [`open-artifacts/discovery-response-log/`](open-artifacts/discovery-response-log/) | **shipped** | Privilege-safe routing, versioned drafts per meet-and-confer round, objection library with jurisdiction-aware grounds |
| 12 | Patent claim comparison | [`open-artifacts/patent-claim-comparison/`](open-artifacts/patent-claim-comparison/) | **shipped** | Structured claim-limitation parsing, pinpoint disclosure spans, explicit "no teaching found" rows |
| 13 | Docket watch wall | [`open-artifacts/docket-watch-wall/`](open-artifacts/docket-watch-wall/) | **shipped** | CourtListener RECAP API as the open backbone — no product lock-in; scheduled diffing with per-judge filters |
| 14 | AI use-case inventory | [`open-artifacts/ai-use-case-inventory/`](open-artifacts/ai-use-case-inventory/) | **shipped** | Register as versioned structured data; risk tiers mapped to NIST AI RMF / EU AI Act, rubric published |
| 15 | Sell-side Q&A log | [`open-artifacts/sell-side-qa-log/`](open-artifacts/sell-side-qa-log/) | **shipped** | Buyer-isolated access control, approval workflow, disclosure-schedule consistency checks |
| 16 | Outside counsel spend | [`open-artifacts/outside-counsel-spend/`](open-artifacts/outside-counsel-spend/) | **shipped** | LEDES parsing as deterministic code; billing guidelines as structured data; per-firm exception reports |
| 17 | Entity compliance calendar | [`open-artifacts/entity-compliance-calendar/`](open-artifacts/entity-compliance-calendar/) | **shipped** | Deadline rules as a maintained, versioned dataset with statutory cites and effective dates |
| 18 | Litigation portfolio | [`open-artifacts/litigation-portfolio/`](open-artifacts/litigation-portfolio/) | **shipped** | Self-hosted (reserve data stays yours), scenario roll-ups, consistency checks |
| 19 | Eviction notice check board | [`open-artifacts/eviction-notice-check-board/`](open-artifacts/eviction-notice-check-board/) | **shipped** | Codified per-jurisdiction rulesets open to inspection; plain-language output for non-lawyer advocates |
| 20 | Pro bono case board | [`open-artifacts/pro-bono-case-board/`](open-artifacts/pro-bono-case-board/) | **shipped** | Multi-tenant for small nonprofits, offline-friendly, malpractice-aware deadline warnings |
| 21 | Access-to-justice front door | [`open-artifacts/access-to-justice-front-door/`](open-artifacts/access-to-justice-front-door/) | **shipped** | Self-hostable at nonprofit cost (open-weight models), published guidance library that compounds across orgs; see [`artifacts/prompting-for-attorneys/`](artifacts/prompting-for-attorneys/README.md) for the shipped education layer |
| 22 | Intake queue | [`artifacts/client-intake/`](artifacts/client-intake/README.md) | **shipped** (partial) | Screens intakes and builds the conflict-party list today (letter drafting not included); full source, fail-closed reads |

### Partner-built (10)

| # | Gallery artifact | Builder | Our counterpart | Status | What's better |
|---|---|---|---|---|---|
| 23 | Obligations checker | Foley & Lardner | [`open-artifacts/obligations-checker/`](open-artifacts/obligations-checker/) | **shipped** | Obligation graph with owner + date feeding calendars; amendment-aware re-extraction; verified quote per obligation |
| 24 | AI governance benchmark | Goodwin | [`open-artifacts/ai-governance-benchmark/`](open-artifacts/ai-governance-benchmark/) | **shipped** | Question bank built on published frameworks (NIST AI RMF, ISO/IEC 42001, EU AI Act), not a firm's proprietary questionnaire |
| 25 | Harvey Intake | Harvey | [`open-artifacts/intake-benchmark/`](open-artifacts/intake-benchmark/) | **shipped** | Guidance RAG in open formats (Markdown + embeddings under org control); intervention points where Legal overrides |
| 26 | Subpoena response | PwC | [`open-artifacts/subpoena-response/`](open-artifacts/subpoena-response/) | **shipped** | Per-jurisdiction objections/precedent library you own; every adopted objection traced to precedent |
| 27 | Venture term sheet benchmark | Wilson Sonsini | [`open-artifacts/venture-term-sheet-benchmark/`](open-artifacts/venture-term-sheet-benchmark/) | **shipped** | Open benchmark corpus (anonymized, dated) instead of one firm's deal base; NVCA model docs as baseline |
| 28 | Immigration papers reader | Mobile Pathways | [`open-artifacts/immigration-papers-reader/`](open-artifacts/immigration-papers-reader/) | **shipped** | Deterministic form-type detection; per-form extraction templates; bilingual output with explicit uncertainty markers |
| 29 | Record sealing screener | Rising for Justice | [`open-artifacts/record-sealing-screener/`](open-artifacts/record-sealing-screener/) | **shipped** | D.C. eligibility rules as versioned data files with statutory cites; rule chain shown for every determination |
| 30 | Rent ledger reviewer | Rising for Justice | [`open-artifacts/rent-ledger-reviewer/`](open-artifacts/rent-ledger-reviewer/) | **shipped** | Recalculation as pure, publishable code with D.C. rules as versioned parameters — auditable arithmetic |
| 31 | Record clearance | The Access Project | [`open-artifacts/record-clearance/`](open-artifacts/record-clearance/) | **shipped** | Per-state ruleset repo with local maintainers (Clear My Record model); deterministic eligibility engine |
| 32 | Criminal charge reality check | Zealous | [`open-artifacts/criminal-charge-reality-check/`](open-artifacts/criminal-charge-reality-check/) | **shipped** | Statutory ranges as deterministic NY Penal Law lookup; outcome data with published methodology and per-point cites |

Anthropic also ships an Apache-2.0 reference repo — [anthropics/claude-for-legal](https://github.com/anthropics/claude-for-legal)
(agents, skills, MCP connectors behind much of the same ground) — which we link rather than
fork: [catalog/anthropic.md](catalog/anthropic.md).

## Roadmap

- **Shipped:** client-intake, contracts-playbook, prompting-for-attorneys, pii-ptbr-lgpd; and
  in `open-artifacts/`: cite-check, playbook-deviation-board (extends the shipped playbook
  artifact), fact-chronology, tabular-review — each with a spec (`spec.md`), a deterministic
  core where possible, tests, and recorded outputs.
- **All 32 gallery counterparts + 2 original ideas are shipped** (v0.2–v0.3, 2026-11-07). Next:
  deepen the rules-as-data layers (more jurisdictions per artifact), wire live open-data feeds
  (CourtListener RECAP, Federal Register), and extend the in-app interactive demos beyond the
  current set. Evidence: `evidence/` (test-run.log, browser-verify.log, inspection reports).

Detailed notes on the shared elicitation engine and Val Town portability live in
[`docs/`](docs/):

- [docs/elicitation-lineage.md](docs/elicitation-lineage.md) — how one structured-elicitation engine became four artifacts
- [docs/val-town-portability.md](docs/val-town-portability.md) — runtime couplings, remix/clone recipe, demo mode, fail-closed reads

## License

[MIT](LICENSE) — everything in this repo. External links keep their own licenses.
Not legal advice; these are engineering artifacts for legal workflows.
