# B03 — code inspection: intake-benchmark vs Harvey Intake (Copy)

Date: 2026-11-08. Theirs: `_to_verify/Harvey Intake (Copy).html` (75,952 B; extracted to /tmp/b03/: script0 = platform health/telemetry shim, script1 = 40 KB app, 2 stylesheets). Ours: `open-artifacts/intake-benchmark/` (core.js 505 lines, core.test.js 284, demo/index.html 135, spec.md, examples/, meta.json). Both served and rendered over http://127.0.0.1:8923/ and verified headlessly this run. Screenshots: tmp/shots/to-inspect/intake-benchmark/ (theirs-list.png, ours-default.png new this run; theirs-default/new-request/submitted/filled/mobile, ours-canon-housing/error/mobile from the earlier visual pass).

## 1. Verdict

**Deliverable after one must-fix.** Ours is a different species from theirs — a deterministic scoring engine, not an intake portal — and that pivot itself is legitimate and defensible: every formula is stated, 32/32 core tests pass, reruns are byte-identical, the demo renders the full table/rank-stability/CSV output headlessly, and the "vendor-neutral benchmark" claim against Harvey is real (Harvey cannot benchmark itself against a paper process). But the speed dimension **rewards flows that omit latency data** (scored as 0 s → speed 100), which contradicts the artifact's own stated principle ("unmeasured is a blank, not a zero" — abandonment is null, latency becomes the *best possible* score). That is a real rubric-integrity bug in the product's core promise and must be fixed before this ships as a benchmarking tool. Separately, be clear-eyed in any comparison writeup: their artifact is a genuinely well-engineered product-grade MCP integration (permission flows, ~15-case error taxonomy with honest ambiguous-outcome copy, XSS-disciplined rendering, accessibility touches). Our demo — a JSON textarea plus a results table — loses decisively on product polish; ours wins only on the axis of measurability, and the must-fix below sits exactly on that axis.

## 2. Must fix (1)

**M1 — Unmeasured latency scores speed = 100; fair mode cannot rescue it. [correctness]**
- Location: `core/core.js` L226–233 (`speed` block; warning at L229 says "counted as 0"), interacting with fair mode at L313–321.
- Problem: steps lacking `latency_seconds` contribute 0 to `total_latency`, so a flow with *no* latency data gets `min(1, target/max(0,1))` → speed **100**, while a measured flow (e.g. 1200 s vs 900 s target) scores 75. Reproduced this run (node, core imported directly): measured speed=75, unmeasured speed=100. `fairMode` only intersects dimensions that are non-null; speed is non-null (100) for the unmeasured flow, so the inflation survives fair mode — reproduced.
- Impact: in the artifact's flagship scenario (software flow with telemetry vs human paper flow without), the paper flow silently wins the speed axis by *not being measured* — a perverse incentive for whoever supplies the flow JSON, and a wrong ranking in a real comparison. It directly contradicts spec.md §"What it does" and README ("Unmeasured data is a blank, never a guessed zero"): abandonment gets null, latency gets the optimal guess.
- Fix direction: if *no* step has latency → `speed = null` (blank, excluded, warning); if some steps lack latency, either exclude the dimension, scale by measured coverage, or score on measured steps only with a loud warning — but never substitute 0.

## 3. Worth considering (4)

**W1 — CSV export breaks on commas/quotes in flow names.** `core/core.js` L340–L352: header row interpolates `f.name` unquoted (reproduced: `dimension,Form, v2 (draft)` → 3 columns), and the quoted `missing_fields` cell does not escape embedded `"`. CSV consumers mis-parse. Quote/escape all interpolated cells.

**W2 — spec implies risk dimensions are excludable weights, code forbids it.** spec.md ("stay outside the composite weights **by default**") vs `core/core.js` L282 (`Unknown weight key` thrown for anything beyond the 5 defaults — reproduced with `weights:{deadline_capture:0.2}`). Either support risk-dimension weights or delete the "by default" phrasing; as is, spec overpromises.

**W3 — capture-QA gap: `fields` structure never validated.** `core/core.js` L193 iterates `st.fields ?? []` — a string value (e.g. `"full_name"`) is iterated per character into garbage field asks, and `validateCapture()` (L455–487) checks ids/purpose/latency but not `fields`. The LLM-capture audit the spec sells should catch this shape.

**W4 — `benchmark()` mutates the caller's input.** `core/core.js` L304: `input.scenario.name = canon.name` writes into the user's object; a library advertising determinism should treat inputs as read-only (copy the name into the result instead).

## 4. Notes only (no action required for this delivery)

- Rubric design: `extra_field_asks` (L215) reaches only metrics, never a score — a flow spamming off-canon questions loses nothing (per spec formula, so documented behavior, but worth a think when weighting).
- Tie-break `localeCompare` (L323, L414): same-machine reruns byte-identical (verified), cross-ICU environments unverified.
- Shipped demo sample includes an 86,400 s mail step (demo/index.html L73) — under the 7-day `CAPTURE_LATENCY_CEILING_SECONDS`, so the "elapsed wait ≠ step latency" smell the docs describe goes undetected exactly where it occurs.
- A flow with zero field asks scores non_redundancy 100 (L213).
- Theirs, read with charity and audited: no correctness or XSS issue found in script1 (esc/linkify/safeUrl discipline holds; innerHTML sinks are constants or escaped); example mode persists to localStorage `harvey-intake:examples-v5`; scope hard-capped to `requested_by_me`, limit 50. No export/audit path — product scope, not a defect.

## 5. Scope & what was not covered

Verified this run: full read of both codebases (core.js, core.test.js, demo/index.html, spec.md, README, meta.json, examples listing; both their script blocks and both stylesheets); 32/32 `node --test` pass; targeted node reproductions of M1/W1/W2; determinism re-run of `rankStability`; headless DOM render of our demo (full table, stability badge, CSV textarea present) and their bundle (4 example requests in Open/Completed groups). Screenshots captured but not machine-vision-verified this run (vision tool unavailable in this environment); DOM dumps used as render evidence instead. Not covered: their MCP paths beyond code reading (no live Harvey connector — example-mode only, by design); cross-browser/cross-ICU determinism; the `deploy/` build pipeline; the other 9 bundles in `_to_verify/`. Standards used: spec.md's own formulas and honesty claims as the baseline, plus the shared-context red-team stance (ours must prove itself).
