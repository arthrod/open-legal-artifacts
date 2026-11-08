# Planner — run 7290de40 participant 17

Recon complete: our artifact (core, 16 tests, examples, demo), local catalogs, launch article, and the reference repo tree all read. One load-bearing find: the counterpart is Foley & Lardner's partner-built "Obligations Checker" (our meta.json mislabels it), and our demo/index.html imports `../core/core.js` + `tokens.css` — it is not actually self-contained.

**TESTS: not executed** — this environment exposes no shell/exec tool (tool_search: none; val-town tools unregistered). Static verification instead: all 16 tests in core/core.test.js traced against core/core.js — every assertion consistent with the implementation; examples/output.json hand-recomputed from input.json (statuses, day counts, summary rollups all match). Inferred, not run-proof.

**1) THEIR EDGE** — counterpart = "Obligations Checker built by Foley & Lardner" (launch article, verified; repo tree has no obligations skill — adjacent: Amendment Tracer, Renewal Watcher)
- Ingests raw agreements via Claude + 60 connectors; we require hand-built obligations JSON (article; catalog §3.1)
- "Lists obligations in the contract's own words"; "each answer or output has a link to its source" (article)
- One artifact for pre-closing validation AND post-closing tracking of both parties (article)
- Sharing/collaboration built in, no manual uploads (article)

**2) OUR GAPS (top 5)**
1. No contract-text path: extraction prompt documented but nothing consumes it; `sourceQuote` never carried through
2. demo/index.html not self-contained: imports ../core/core.js + tokens.css → breaks deployer inlining (verified in file)
3. No recurrence: quarterly duty is one static row (catalog: "a row won't send the reminder")
4. No register diff / amendment awareness; no owner field, per-party rollup, or exposure
5. meta.json category wrong ("anthropic-built" vs partner-built); README claims lack evidence links

**3) IMPROVEMENTS** (change / why beats / acceptance / size / files)
- **I1** Inline core+tokens into demo/index.html — deployer contract. Test: zero external refs, works from file://. **S** / demo/index.html
- **I2** `sourceQuote` → output row, CSV column, MD citation — quote becomes auditable data, not a link. Test: quote in toCSV+renderRegister. **S** / core.js, core.test.js, spec.md, examples/
- **I3** `diffRegisters(a,b)` → per-id status transitions, added/removed, new flags (+MD) — amendment-aware tracking their static list can't do. Test: transition + add/remove, fail-first. **M** / core.js, test, examples/run.js
- **I4** `recurrence` (monthly|quarterly|annual + anchor) → per-cycle due dates; missed cycles counted overdue. Test: 2 missed quarters flagged; month-end/leap clamps pinned. **M-L** / core.js, test, examples
- **I5** `toICS(register)` → VEVENT+VALARM per open obligation — reminders reach any calendar. Test: N VEVENTs, escaping pinned. **S-M** / core.js, test, demo button
- **I6** `owner` field + `summary.byParty` (open/overdue/exposure = Σ overdue pay amounts) — the pre-closing both-parties view. Test: rollup math. **S** / core.js, test, demo cards
- **I7** Fix meta.json category + README evidence links. **XS** / meta.json, README.md

**4) VERIFIABLE-BETTER CLAIM**
Ours = deterministic zero-dep register engine with quote-level audit trail, diffing, recurrence, calendar alerts, party exposure — reproducible at any asOf, green node:test suite, offline single-file demo. Theirs (per public sources only) = LLM first-pass inside Claude, no published determinism/exports. Proof: `node --test core/core.test.js` (≥28 green after I2–I6), regenerate examples, open demo offline.

**5) RISKS**
- Their internals undocumented → comparison scoped to article+repo; nothing invented
- Recurrence/ICS edge bugs → pinned tests (leap year, month-end, escaping)
- Id drift across re-extraction breaks diffing → stable-id rule added to spec prompt
- Tests unrun in this env; implementer must run the 16-test baseline first

STATUS: DONE_WITH_CONCERNS