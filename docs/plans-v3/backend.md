# Backend plan — win-the-comparison (Planner 2 of 2, run a3df9bf2/22)

# BACKEND PLAN — open-legal-artifacts cores (planner 2 of 2)

**Goal:** Fix every §4/C S1–S3 finding in the 10 inspected cores (failing-test-first), add shared LLM-free infrastructure (ingestion, persistence, exports, fuzzy names, hardening) vendored fleet-wide, and seed real-cited corpora — exposing the exact signatures below for the frontend planner.

**Rule for every fix:** write the report's repro as a named failing test → minimal fix → full artifact suite green → `examples/` regenerates byte-identical (TS cores: parity test too).

## P0-A — Core must-fixes (wave 1; all independent)

1. **cite-check** (B02): normalized branch handles insert/replace ops symmetric to deletes — note inserted tokens, cap to `fuzzy` on substantive insert; exact branch verifies `anchor.verbatim === quote.trim()` else falls back to `locateRaw` indexOf; `Tr. N:1` on a page with no `\n` → `unverifiable` ("page not line-segmented"). S
2. **intake-queue** (B04): `normalizeName` keeps `\p{L}\p{N}` (Unicode), drops only punctuation; add `matchNames()` (below) — Jaro–Winkler token alignment, initial rule (`J. Iwata`≈`John Iwata`), compact nickname/abbrev table as data; regen `examples/intake.ics` (CRLF, post-decision states); add example-byte-identity test. M
3. **obligations-checker** (B05): map each record to the cycle whose window contains `satisfiedOn` (boundary date → that cycle, on time — kills the paid-on-due-date false breach); `satisfiedOn > asOf` → excluded + `future_dated` warning, never flips status. S
4. **playbook-deviation-board** (B06): avoid-rule score = `max(wholeSimilarity, bestWindow coverage)` (machinery exists in `scoreStandard`); deal-breaker `routedTo` falls back to `defaultApprover`; YAML `scalar()` rejects post-quoted-scalar `#` remainders with line-numbered error ("never a guess"). S–M
5. **regulatory-horizon-scan** (B07): `dedupeItems` — empty id skips id-branch, keys on normalized title+jurisdiction; state law w/ US-FED-only profile scores adjacent tier (not exact), rule text corrected. S
6. **jurisdiction-survey-matrix** (B08): `safeUrl()` (below) at classify, demo render, and `toMarkdown` — non-http(s) fails `requireSourceUrl`; `csvEscape` hardens leading `= + - @ \t \r` (lift patent-claim-comparison's tested impl). S
7. **tabular-review** (B09): `currencyAmount` parses scale words (k/m/mm/million/bn) via exact text-shift decimal move; ambiguous/unparseable → null → `constraint_violation`, never a wrong number; validate `input.cells` join-keys against doc/question sets → real `no_such_document`/`no_such_question` cells; per-document tokenization cache (one `makeLocator(source)` reused across cells — 16s→<1s). M
8. **intake-benchmark** (B03): zero measured latencies → `speed: null` + warning (blank, never 100); partial coverage → score measured steps with loud coverage warning. S
9. **venture-term-sheet-benchmark** (B10): fix range detail template (`${v} ${unit} — …`); reject `typeof value === 'boolean'` in numeric branch → `unknown_value_type`. S
10. **ask-legal**: no core bug; adopts shared modules only.

## P0-B — Shared hardening, fleet-wide (all 33)

`_shared/` canonical modules, node:test-tested; each consuming core vendors verbatim with provenance header + byte-parity test against canonical (cores stay dependency-free; demos stay single-file): `csv.js`, `urls.js`, `ics.js` (CRLF + 75-octet fold + escaping — fixes B05-W5, applies to every date-bearing core), `esc.js` (browser), `name.js`. Plus: per-artifact example-byte-identity test (kills stale ICS/README drift — README asserts suite's live test count); rewrite B07's two falsified "better" claims to defensible ones (field-level diff + rubric-version diff; provenance tiers as tested code).

## P1-C — Ingestion / persistence / exports (new shared modules)

- `_shared/ingest/zip.js`: minimal ZIP reader (central-directory parse; `zlib.inflateSync` in Node, `DecompressionStream` in browser) — no JSZip.
- `readDocx(buf): Promise<{text: string; paragraphs: {text: string}[]}>` — `w:p`/`w:t`, preserves line segmentation (feeds cite-check pinpoints + verbatim verifier).
- `readXlsx(buf): Promise<{sheets: {name: string; rows: string[][]}[]}>` — sharedStrings + inline strings; no formula eval.
- `createStore(ns): {get<T>(k): T|null; set(k, v): void; append(k, entry): void; exportJsonl(): string}` — localStorage (browser) / JSONL file (node), versioned keys, append-only for logs.
- `buildDocx(doc: {title: string; blocks: ({type:'p'|'h2'|'li'; text: string; bold?: boolean} | {type:'table'; header: string[]; rows: string[][]})[]}): Uint8Array` and `buildXlsx(sheets: {name: string; rows: (string|number)[][]}[]): Uint8Array` — deterministic bytes, no deps; `redline` support via `blocks` item `{type:'redline'; text: string; del?: string[]; ins?: string[]}` → `w:del`/`w:ins`.
- **PDF: SKIP in P1 — my pushback.** C ranks in-browser PDF ingestion P0; a correct dependency-free PDF text extractor does not exist at ≤80KB/deployed-file (theirs inlines ~1.8MB pdf.js). Demanding it is a cope that would force vendoring we can't carry. Ship DOCX/XLSX + paste-text, label PDF "not supported" honestly; P2 option: minimal digital-native-PDF text extractor behind a flag with documented may-fail/no-OCR disclosure. Our wedge is ingestion→verbatim-verifier, a combo theirs structurally lacks.

Signatures above are the FE contract; frozen at merge, changes via `_shared/CHANGELOG.md`.

## P1-D — Real-cited corpora

Schema: items `{id, title, jurisdiction, citation, sourceUrl, quote, accessedOn, status:'fictional'|'verify'}`; real cites carry `[verify]` until checked against the live source (web-verified this mission, quote copied verbatim). Targets: horizon-scan ≥30 real developments; jurisdiction-survey 20 jurisdictions × 4 questions with real statutes; VTSB one dated public survey grid loaded via existing `withGrid()`; corpora live in `data/`, never in cores. Research-heavy, L.

## P2

`insights(log, routing, asOf)` for ask-legal (self-serve rate, escalations by route, unmatched patterns) from our JSONL log; `toIcs` for horizon-scan/action dates; `[verify]`-tag checker script (CI fails on unverified real cites).

**NON-goals:** no LLM calls in cores; no eyecite-class citation parsing; no OCR, no PDF rendering/highlighting; no multi-tab concurrency-safe storage, no auth/multi-desk; no demo UI work (frontend planner owns it — they consume only the signatures above).

**Fleet generalization:** csvEscape/safeUrl/ICS/name-match/example-byte-identity/README-count tests apply to all 33 cores (audit shows ≥7 duplicate `csvEscape`s today); cached-locator pattern applies to cite-check + tabular-review now, any quote-verifying core later.

**Risks:** ZIP/OOXML edge formats (accept "unsupported" with named error, never silent garbage); corpora research time (P1-D can land per-artifact incrementally); FE coupling (signatures frozen first).

DONE