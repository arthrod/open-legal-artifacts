# Planner — run 7290de40 participant 26

Recon complete. Delivering the plan inline (read-only task; nothing persisted).

**1) THEIR EDGE** — artifact code is closed (repo has only Anthropic's own plugins, last commit July 2026; gallery is hosted), so evidence = launch article + local catalog S1/S4#30:
- Real D.C. law: flags interest miscalculation + overcharges vs D.C. rent-control limits (catalog S1) — we have neither check.
- Document-first: attorney brings the scanned ledger, "Claude completes the first pass" (article) — ours needs hand-built JSON.
- Zero-setup hosted app; opens with worked example, every output linked to source, shareable (article).

**2) OUR GAPS (top 5)**
1. No interest validation at all (theirs: "interest miscalculation").
2. No rent-schedule/increase-cap logic — one static `monthlyRent` (theirs: rent-control limits).
3. Correctness bug: unknown charge types hit the else-branch in the balance loop → silently counted LAWFUL (core.js), understating overcharge.
4. Malformed entries (bad dates) silently dropped; no amount/id validation — violates our own "never guessed silently" spec.
5. JSON-only input; no claimed-balance-mismatch check; no citation field in rules; demo isn't self-contained (`tokens.css`, `fonts/` external — violates single-file contract).

**3) IMPROVEMENTS** (change / why beats theirs / acceptance / S-M-L / files)
1. Fix unknown-charge bug → `unknown_charge_type` dispute, excluded from lawful balance. Correctness provable by test, theirs can't prove. Test: DC `convenience_fee` 25 → dispute, lawfulFinal excludes it. S. core.js+test.
2. Hardening: bad dates, non-positive amounts, dup ids → `ignoredEntries[]`/errors, never silent. Test: row dated 2026-13-01 → listed as ignored. S. core.
3. `claimedBalance` input → `claimed_balance_mismatch` dispute (landlord's claimed due vs recomputed delta) — the eviction-defense question. Test: claimed 1870 vs recomputed 1470 → 400 flagged. S-M. core, spec, demo.
4. Deterministic `parseLedgerTable()` (CSV/TSV subset) + paste box + inline tokens.css/fonts in demo (restore single file). LLM-free ingestion beats theirs' LLM-first pass: reproducible. Test: sample CSV with dirty row → entries + ignoredRows. M. core, demo.
5. Interest: rules `depositInterestPct`/`judgmentInterestPct` + `interest` entry validation → `interest_miscalculation`. Parity + cited + tested. Test: claimed 6%/yr vs rule's 25% → delta dispute. M. core, rules.
6. `lease.rentSchedule[{from,amount}]` + rules `annualIncreaseCapPct` → `rent_increase_over_cap`. Test: +20% jump under 10% cap → dispute. L. core, spec, example.
7. `citation` field per rule, surfaced in disputes + report Rule column. Test: dispute cites DC-LF citation string. S. core, rules, report.

**4) VERIFIABLE-BETTER CLAIM + PROOF**
After 1–7, ours is the only version of the two with a public deterministic engine, byte-reproducible outputs, ≥30-test green suite, LLM-free table ingestion, never-silent unknown handling, and portable multi-jurisdiction rules with citations — while covering both named counterpart checks we lacked (interest, rent caps). Proof: `node --test 'core/*.test.js'` green; `node examples/run.js` then `git diff` empty (byte-identical regen); capability matrix in README keyed to article/catalog text.

**TESTS: NOT RUN** — this planning environment exposes no shell/execution tool (tool_search returned none). Static check: suite = 18 tests, matching README; tests cohere with core.js by read. Run them before executing this plan.

**5) RISKS**
- Rule numbers stay illustrative; citations risk implying legal accuracy → keep gate text, mark cites "verify".
- rentSchedule touches expected-month logic (regression risk) — all items failing-test-first.
- Closed counterpart: claims limited to its named behavior; unseen features possible.
- Inlining fonts grows demo file (~100KB base64) — fallback to system fonts if budget tight.

DONE_WITH_CONCERNS