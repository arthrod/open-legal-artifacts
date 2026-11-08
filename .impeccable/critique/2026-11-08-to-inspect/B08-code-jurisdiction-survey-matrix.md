# B08 — jurisdiction-survey-matrix (ours) vs "Survey matrix (Copy) (Copy)" (theirs)

Pair inspected 2026-11-08. Theirs: `_to_verify/Survey matrix (Copy) (Copy).html` (3.18 MB single-file Cowork page; extracted to /tmp/b08/: notes.txt, main1.js = SM model, app2.js = C4LOffice docx/xlsx writer, app3.js = 3,566-line UI, sample-data.json = ArtifactData dump). Ours: `open-artifacts/jurisdiction-survey-matrix/` (895 lines total: core 314, tests 179, demo 216). Screenshots: `tmp/shots/to-inspect/jurisdiction-survey-matrix/{ours,theirs}-default.png`.

## 1. Verdict

**Fix before ship — 2 must-fix, both security-layer** (an executable-URL sink in the demo/Markdown export, and unhardened CSV export). Beyond those, ours is a clean, honest, well-tested deterministic core (16/16 tests pass, example runner reproduces) — but it is a *component* next to their *product*, and the product gap is brutal: theirs ships a database-backed multi-survey app with Claude research orchestration, a 51-jurisdiction × 5-question fully-researched real sample (255 cells, real citations to leginfo/courtlistener with verbatim quotes and honest "unclear" cells), verification fingerprints, a review queue, filters, a US map view, PDF document ingestion, and dependency-free docx/xlsx/csv export with formula-injection hardening. Ours ships a paste-JSON table viewer with a 7×4 fictional example. The README's core claim — cite-before-claim, unverified cells never surfaced — survives inspection; almost every claim in "What's better than the closed counterpart" does not survive contact with their actual bundle, because theirs enforces the same discipline (human-only verification, "never invent a citation") *and* implements it deeper (fingerprints that void a check when the answer or question text changes).

## 2. Must fix

**M1 (security, correctness). `sourceUrl` is never validated anywhere — a `javascript:` URI renders as a clickable link and the cell is "verified".**
- Location: `open-artifacts/jurisdiction-survey-matrix/core/core.js:69` (hasSourceUrl = any non-empty string), `core/core.js:303` (`[${citation}](${sourceUrl})` in Markdown export), `demo/index.html:180` (`<a href="${esc(cell.sourceUrl)}">` — esc() handles `&<>"` only, not schemes).
- Problem: reproduced on-run — a cell with `sourceUrl: "javascript:alert(document.domain)"` classifies `verified`, exports as `[cite](javascript:alert(document.domain))` in `toMarkdown`, and renders as a live clickable link in the demo.
- Impact: the artifact's stated pipeline has LLM drafts entering as input; any survey JSON received from a third party (or an LLM-drafted one) turns every citation link in the demo into a potential script-execution sink. The whole point of the artifact is that users click through to the underlying law.
- Evidence: node repro (this run): `status: verified`, `MD cell … [cite](javascript:alert(document.domain))`. Contrast: theirs `main1.js` `safeUrl()` accepts https-only, rejects credentials, and renders non-https links "as text to fix, never drawn as a link".
- Fix direction: validate scheme at classify time (reject non-http(s) as failing `requireSourceUrl`, or downgrade with reason) and defensively at render/export time.

**M2 (security). CSV export has no formula-injection hardening.**
- Location: `core/core.js:255` (`csvEscape` quotes/escapes delimiters only), `core/core.js:279`.
- Problem: reproduced on-run — `answer: '=HYPERLINK("http://evil.example","click") …'` and `citation: '@SUM(1+1)*cmd|' /C calc'!A0'` pass through verbatim into `jurisdiction-survey.csv`.
- Impact: README/spec position the CSV as something that "survives round-trips into memos and diligence trackers" — i.e. it is opened in Excel/Sheets. A weaponized survey JSON produces a weaponized spreadsheet. OWASP-class CSV injection.
- Evidence: node repro (this run), full CSV line quoted in inspection log. Contrast: theirs `app3.js:2111-2118` `csvField()` prefixes `'` to leading `= + - @ \t \r` and their importer strips it back (`csvUnharden`), and their xlsx writer states "a value can't become markup or a spreadsheet formula".
- Fix direction: harden leading `=+-@` cells (quote-and-prefix as theirs does) in `csvEscape`.

## 3. Worth considering

**W1. Verification is not bound to content — a "verified" stamp survives edits.** `core/core.js` takes `verifiedBy`/`verifiedDate` at face value; nothing detects that the answer (or the question text) changed after the check. Theirs fingerprints the answer (`printOf`/`hashOf`, `main1.js`) and the question-as-asked (`askedOf`), so an edited answer or renamed jurisdiction/jurisdiction-question voids the check and the cell reads unverified again. For an artifact whose entire value proposition is auditability of verification, this is the single deepest design idea in their bundle that ours lacks. Suggestion: store a hash of {answer, citation, question text} at verification time and re-check on build.

**W2. Duplicate jurisdictions/questions in the input go unflagged.** `buildMatrix` warns on duplicate cells, orphans, and empty lists — but a `jurisdictions` list containing "US-CA" twice renders two identical rows with no warning, and duplicate question ids collide silently in `knownQuestions` coverage keys. The "nothing dropped silently" claim is 90% true; duplication is the hole. Suggestion: warn on duplicate jurisdiction/question-id inputs like duplicate cells.

**W3. Demo realism: fictional 7×4 vs real 51×5.** Ours ships only fictional data (reserved domain fictional.example — good hygiene), theirs ships a complete, genuinely researched non-compete survey (51 jurisdictions × 5 questions, 247/255 cells with authorities, real case citations with pinpoints and verbatim quotes, 8 honest "unclear" cells explaining exactly what was searched). Anyone evaluating the two demos side by side sees a toy versus a tool. Suggestion: even one realistically-sized real-data example would change the demo's credibility; the core handles 255 cells fine (deterministic, trivially fast).

## 4. Record only

- Ours has no persistence, no editing, no research request path — every cell must be authored elsewhere and pasted as JSON; theirs is a full CRUD app with drafts, request rows, and multi-survey projects.
- No docx/xlsx export (lawyers' native formats); theirs writes both dependency-free with deterministic bytes.
- No map view, no filters (category/state/provenance/stale), no review queue ("Mark checked and next"), no a11y surface (focus trap, aria-current) — theirs has all of these.
- Their notes-for-Claude contract ("never answer from memory", "never invent a citation or link", "silence when no authority found") matches our spec's research-draft prompt discipline — ours is not differentiated on prompt ethics either.
- Ours' figure-consistency check (digits-in-answer vs quotedText) is a genuine feature theirs lacks at cell level (they store quotes but don't diff digits); warning-only, over-flag tolerated — keep it.
- Their bundle's own unit tests (`test/unit.mjs`) are not shipped in the export; only a `window.__surveyMatrix` hook. Their test count is unverifiable from the bundle alone.

## 5. Scope & coverage

Checked: full read of our core/test/demo/example; their bundle extracted and read (notes, model, office writer, UI skimmed with targeted greps; sample DB fully analyzed — record counts, category/state distribution, authority spot-checks); our `node --test` 16/16 pass; our example runner reproduces; coverage math independently recomputed (8/28 verified = 29%, per-jurisdiction breakdown matches demo); both sides served from 127.0.0.1:8923 and screenshotted at initial render (ours auto-renders the example; theirs opens on the sample-data US map with "sample data" banner). Injections in M1/M2 reproduced with node against the real core.

Not covered: their live Cowork research round-trip (requires a Claude session with ArtifactData — the sample adapter is the only in-bundle approximation); interactive states of their UI beyond initial render (headless static screenshot only — verify/flag flows, import, exports were read in code, not clicked); their exported docx/xlsx byte-level validation; cross-browser rendering. Standard applied: our own spec.md/README claims as baseline, plus security/robustness defaults the counterpart demonstrably meets.
