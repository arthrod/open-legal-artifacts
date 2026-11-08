# Planner — run 7290de40 participant 18

Audit complete — artifact read in full, counterpart studied from on-run sources (official Academy page fetched, repo agent table fetched, launch article fetched). Here is the deliverable.

---

**1) THEIR EDGE** (evidence on-run)
- Prose billing guidelines as the rulebook — "the flag is your block-billing or staffing rule, not a textbook one" (official: academy.claude.com/use-cases/outside-counsel-review, fetched).
- Variance + driver: "each row names the activity that pushed it" — over-budget rows carry the *why* (same source).
- Ends in a deliverable: partner-review talking points, scheduled monthly across panel firms (same source).
- Full coverage via iManage/NetDocuments connectors — "every matter and invoice, not the ones that made it into a spreadsheet" (same source); gallery one-liner: "checks invoices against your billing guidelines" (S4 LinkedIn, secondary).
- Uncertainty flagging of entries to verify against the invoice (same source).

**2) OUR GAPS (top 5)**
1. Guidelines = rate cards + 2 thresholds only; no block-billing, staffing, or disallowed-expense rules — their core function.
2. No driver attribution on over-budget rows.
3. No invoice ingestion: LEDES (deterministic pipe-delimited text) is delegated to an LLM; no invoice→findings path exists in code.
4. No unusual-pattern detection (rate creep, hours spikes) though spec claims it.
5. Spec/README quote an unverified counterpart description ("track spending…flag unusual billing patterns" — no source found); no talking-points output.

**3) IMPROVEMENTS** (change / why it beats theirs / acceptance / size / files)
1. **Guideline-rules engine**: typed rules-as-data — `block_billing` (narrative separator/word-count heuristics), `disallowed_expense` (category caps), `max_hours_per_day`, `staffing_ratio`. Deterministic + versioned vs. their LLM re-reading prose each run. Test: "Draft brief; call; research" entry → `block_billing` with rule id; meals > cap → flag. **M** — core/core.js, core.test.js, spec.md, examples/input.json.
2. **Variance drivers**: top-3 contributing entries per `over` pair (id+amount). Computed+cited vs. their narrated. Test: M-210×HPL over 3673.75 → drivers include L-001 (3400). **S** — core.js, test, report, demo.
3. **LEDES 1998B parser**: `parseLedes(text)→ledger`; malformed line → structured error, never guessed. Zero-hallucination numbers vs. their model-read invoices. Test: 3-line fixture → exact entries; bad line → error row. **M** — core/ledes.js+test (fails first), spec, examples/.
4. **Anomaly flags**: `rate_creep` (realized rate up >X% over consecutive periods), `hours_spike` (>2× prior period) — flags as ledger rows, not dashboard glances. Test: rising-rate fixture → flag with periods+delta. **M** — core.js, test.
5. **Talking-points renderer**: `renderTalkingPoints(audit)` per firm — totals tie to summary, every claim cites a finding id. Reproducible vs. their LLM prose. Test: firm section lists exactly its finding ids. **S** — core.js, test, examples/run.js, demo button.
6. **Fix counterpart attribution**: spec/README quote the verified description + cite Academy/S4. Truthful comparison beats an invented one. Test: grep — no unverified quote remains. **XS** — spec.md, README.md.

**4) VERIFIABLE-BETTER CLAIM**: after this plan, every compliance decision is code (theirs: an LLM interprets prose guidelines per run); identical input → byte-identical audit.json/CSV; every finding carries rule id + entry id + dollar impact; LEDES parsed deterministically. **Proof**: `node --test core/*.test.js` green incl. new tests; two-run export diff empty; every CSV row cites a rule.

**5) RISKS**: tests **NOT RUN this session** (no execution tool exists here — static hand-trace of all 14 tests' arithmetic is consistent: checked=9, impacts 150/250, variance 3673.75, rollup 20092.5, CSV 8 lines; predicted PASS); implementer must run first. Block-billing heuristics must stay countable/deterministic or the LLM-free claim breaks. LEDES dialects vary (1998B only, documented). Period-scoped budget path is subtle — don't disturb. Example ledger (11 entries) too small for trend flags — extend with fictional quarters.

Status: DONE_WITH_CONCERNS (concern: test suite could not be executed — no shell tool in this environment; statically verified only).