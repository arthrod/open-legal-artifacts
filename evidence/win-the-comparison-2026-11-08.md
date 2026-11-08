# Win-the-comparison exercise — 2026-11-08

**Premise:** 10 competitor Claude-artifact bundles (dropped in `_to_verify/`)
red-teamed 1:1 against our counterparts. 22 reports:
`.impeccable/critique/2026-11-08-to-inspect/` (A01–A10 visual, biased against
ours by instruction; B01–B10 code/functionality; C synthesis; D ledger).
Their bundles won 10/10 on product depth; our defensible axes: determinism,
tests, self-hostable, audit, exports — with real must-fix holes.

**Closed in this exercise (all TDD, all suites green — 1,001 pass / 0 fail):**

- 17 must-fix core defects repaired across 10 artifacts (negation-passes-
  normalized in cite-check; CJK-blind + typo-deaf name matching in
  intake-queue; cycle-window + future-dated bugs in obligations-checker;
  buried-deal-breaker + routing + YAML in playbook-deviation-board; dedupe
  collapse + US-FED profile + falsified README claims in regulatory-horizon-
  scan; javascript: links + CSV injection + keyed-cells crash in
  jurisdiction-survey-matrix; $1.5M→1.5 + ghost cells + 16s verification in
  tabular-review; latency=100 in intake-benchmark; garbled/boolean bugs in
  venture-term-sheet-benchmark; audit-wipes-on-reload in ask-legal).
- New shared dependency-free library `open-artifacts/_shared/` (64 tests):
  hardening (URL allowlist, CSV-injection guard), unicode fuzzy names, ICS
  utils, persistence (degradation-aware JSONL/localStorage), docio (real
  DOCX/XLSX read+write, zip reader/writer).
- 10 demos rebuilt from static exhibits into product shells: workflows over
  previously-hidden core functions, persistence surviving reload, citation
  click-through with highlighted source spans, guided paste inputs, real
  .docx/.xlsx exports where budget allowed, 12px floor + ARIA labels +
  aria-live fleet-wide, XSS-hardened (venture attr breakout fixed).
- Fleet learnings applied to ALL artifacts (user directive): 12px floor
  canonized in tokens.css (31 copies), a11y sweep + inline favicons over 24
  non-pair demos (+2 originals' demos), Google-Fonts phone-home eliminated —
  Manrope + Departure Mono now self-hosted (fonts/ in every demo dir).
- Deploy pipeline fixed for the richer pages: single-file builds strip
  @font-face (system fallback) and never data-URI fonts; the 5 over-cap
  pages slimmed ≤78KB (rhs 109.7→71.5KB via corpus compaction + classic-
  script core inlining). All 37 deployed files ≤80,000B.

**Verification:** full suite `evidence/test-run.log` (1,001/0); puppeteer
smokes per rewritten demo (0 pageerrors); 3 code-review verdicts (backend
10/10 SHIP after 1 fix; frontend SHIP after XSS + budget fixes; _shared
SHIP after 8 fixes); screenshots `tmp/shots/to-inspect/<name>/`.

**Known open (honest):** dark mode only in tabular-review's local tokens;
concurrent-tab persistence documented limitation; corpus realism still
behind their seeded datasets on some pairs; venture WSGR-data gap addressed
by honest EXAMPLE labeling, not by copying unverifiable data.
