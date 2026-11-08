# Planner — run 7290de40 participant 4

Recon complete — artifact, catalog, launch article, and repo evidence all read. One load-bearing finding beyond the catalog: our own example report shows Q2 silently dropping "on the document" yet scoring *normalized, similarity 1.00*, and Q4/Q9 getting a false "source does not declare page segments" detail — concrete correctness gaps. Here is the improvement plan.

**TESTS: NOT RUN** — this session exposes no shell/exec tool (tool_search for shell/terminal/desktop-commander returned 0 hits), so `npx tsx --test core/*.test.ts` could not be executed. README claims 12 passing; unverified this run. Implementer must run it first.

**1) THEIR EDGE** (evidence: S1 launch article; S4 enumeration; repo `brief-section-drafter` SKILL.md)
- Ingests the real document: "compares a legal document with its sources" (S1); "checks every footnote against your files" (S4#3). We require hand-built JSON quotes.
- Flags "sources that don't support the claim" (S1) — the "misgrounded citation" / partial-support doctrine detailed in the repo skill. We punt wholly to LLM/human.
- Exhaustive coverage discipline: repo skill mandates "Checked N of M citations… never say 'confirmed' when source unavailable." We report only what we're fed.
- Ecosystem: 60+ connectors, shared artifacts with ethical walls (S1). We're local-only (accepted by design).

**2) OUR GAPS (top 5)**
1. No document-side extraction — the riskiest step (pulling quotes/pinpoints from prose) is offloaded to the user.
2. Omission blindness: [report.md](tmp/open-legal-artifacts/open-artifacts/cite-check/examples/report.md) Q2 drops "on the document" yet = normalized 1.00; windows trim to quote length, so silent excision never flags.
3. Number alterations pass: one changed digit in a long quote stays ≥0.95 ⇒ "normalized" (spec admits; window math confirms) — the most sanctionable class ($90→$120).
4. No token-diff evidence payload; no coverage roll-up; false detail "source does not declare page segments" for not_found quotes in page-bearing sources (Q4/Q9).
5. Pinpoint grammar narrow: no page:line (Tr. 12:4), ¶¶ ranges, id., n., art./cl.; proposition prompt schema exists only in [spec.md](tmp/open-legal-artifacts/open-artifacts/cite-check/spec.md), unshipped.

**3) IMPROVEMENTS** (change / why beats theirs / acceptance / size / files)
1. **Number guard** — numeric token mismatch caps class at fuzzy + note `quote "120" vs source "90"`. Deterministic catch of material alteration, LLM-free. Test: 40-token quote, 90→120 ⇒ fuzzy+note. **S** · textutil.ts, citecheck.ts, core.js, tests.
2. **Omission detection** — compare vs anchor windows ≥ quote length; flag dropped tokens (`omits "on the document"`), handle explicit ellipsis. Test: Q2 fixture ⇒ note lists tokens; ellipsis ⇒ ok-with-ellipsis. **S-M** · same files.
3. **Token diff payload** — LCS diff ops quote↔anchor in JSON + inline report marks. Machine-checkable evidence per flag vs their prose. Test: exact diff array for sub/drop fixtures. **M** · core/diff.ts, citecheck.ts, core.js, demo.
4. **Deterministic extractor** — parse quoted passages + footnote pinpoints from `document.text`, resolve sourceId by name/alias. Their LLM extraction, made reproducible. Test: fictional brief ⇒ expected QuoteEntry[]. **M** · core/extract.ts+test, citecheck.ts, spec.md.
5. **Coverage roll-up** — "Checked N of M; K could-not-check (never 'confirmed'); J unparseable"; fix Q4/Q9 detail. Test: report contains "3 of 4". **S** · citecheck.ts, core.js.
6. **Pinpoint v2** — Tr./page:line spans, ¶¶/Secs. ranges, id. at N, n. N, art./cl.; never guess. Test: `parsePinpoint('Tr. 12:4-12:8')` + validation vs line-segmented page. **M** · pinpoint.ts, citecheck.ts, core.js, tests.
7. **Proposition harness** — prompt-builder + `mergeVerdicts` (only exact/normalized eligible; others refused with note). Auditable two-stage pipeline where the deterministic core gates judgment. Test: verdict on fuzzy ⇒ refused. **S** · core/propositions.ts+test, spec.md.

**4) VERIFIABLE-BETTER CLAIM + PROOF**
Ours is the only one of the two whose every flag is reproducible and machine-auditable: byte-identical re-run output, char-offset anchors, scores, and (post #1–3) per-token diffs + number/omission flags. Theirs is product-internal LLM (no public per-artifact URL — catalog §Pending), unauditable by construction. Proof: run `examples/run.ts` twice ⇒ identical bytes; failing-test-first tests for #1/2/3/5/6 all green under `npx tsx --test core/*.test.ts`.

**5) RISKS**
- `core.js` is a hand-port: every change must be mirrored; add a shared-fixture TS↔JS parity test.
- Extractor scope-creep: unparsed forms ⇒ `unparseable`, documented in spec.
- Example/README counts shift ⇒ regenerate outputs.
- Their internals inferred from S1/S4/repo-adjacent skill only — claim determinism superiority, not connector parity.

DONE_WITH_CONCERNS