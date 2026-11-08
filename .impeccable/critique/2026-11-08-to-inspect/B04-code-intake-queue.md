# B04 — intake-queue vs "New client intake (Copy).html"

Pair: OURS `open-artifacts/intake-queue/` vs THEIRS `_to_verify/New client intake (Copy).html`.
Method: theirs extracted to `/tmp/b04/` (25 scripts, ~5.7k lines JS excluding two pdf.js builds); both sides loaded live at `http://127.0.0.1:8923/`; our tests run (`node --test core/core.test.js` → 32/32 pass); both matchers executed head-to-head on the same name pairs; examples re-derived in memory (no repo files touched). Screenshots: `tmp/shots/to-inspect/intake-queue/` — authoritative: `ours-initial.png`, `theirs-initial.png`, `theirs-home2.png`, `theirs-sample-board.png`, `theirs-sample-enquiry.png`, `theirs-sample-conflict-index.png` (earlier `theirs-board/enquiry/list/insights.png` from a prior pass are empty-state captures; ignore).

## Verdict

**Not shippable as a conflict checker against this counterpart; theirs wins decisively.** Theirs is a full intake product — staged pipeline (new → conflict check → decision → engagement → opened/declined), shared multi-queue storage with permission and degradation handling, audited conflict-check runs with human marks carried across runs, outcome gating, sample queue, e-signature, DOCX/CSV/print-clean report exports. Ours is a small deterministic core (436 lines, 32 passing tests, zero deps) that is genuinely stronger on exactly three axes — RFC-5545 ICS export (theirs has none), runtime-configurable thresholds, and a deterministic verbatim-ingest verifier — but our conflict matcher has a **total blind spot for non-Latin-script names** and no tolerance for typos/nicknames/initials/abbreviations, and we ship a stale, non-conformant example ICS. Must-fix: 3.

## Must fix

1. **normalizeName deletes every non-Latin letter → exact-match conflicts on non-Latin names are silently missed.** `core/core.js:19` (`.replace(/[^a-z0-9\s]/g, ' ')` after NFKD deaccenting). Verified live: a submission whose client is `西山物流株式会社` against a roster entry of the *identical string* (role `adverse`) yields `conflicts: []`, state `assignable` — the item sails through with zero flags. Cyrillic/Arabic/Thai same. For a conflict checker whose only job is "a human must look", silent false negatives are the worst failure mode and a disqualification/malpractice vector. Theirs normalizes with `[^\p{L}\p{N}]` (any script) and scores the CJK pair 1.0 `exact`. Fix: keep Unicode letters/numbers (`\p{L}\p{N}`), drop only punctuation; add a non-Latin test case to `core.test.js`.

2. **Matching recall: no typo, nickname, initial, or abbreviation tolerance — all real-world conflict variants score ≤ 0.5 against the 0.8 threshold.** `core/core.js:30-43` (`nameSimilarity`, token Jaccard + containment bonus). Measured (ours vs theirs, same pairs): "Acme Holdings LLC"/"Acme Holtings LLC" 0.33 vs **0.97 sound**; "Robert Meyer"/"Bob Meyer" 0.33 vs **0.95 nickname** (with their shipped nicknames config); "John Iwata"/"J. Iwata" 0.33 vs **0.96 initials**; "Sable Insurance Company"/"Sable Ins Co" 0.33 vs **0.92 spelling**; "John Smith"/"Jon Smyth" 0 vs **0.91 sound**. Our own README claims initials are preserved "so conflict checks stay conservative" — conservative to the point of missing "J. Iwata" = "John Iwata" entirely. Fix: add fuzzy token alignment (Jaro-Winkler or edit distance), an initials rule, and an expandable nicknames/abbreviations table; or lower the default threshold and show near-misses below threshold as advisory rows.

3. **Shipped `examples/intake.ics` is stale and non-conformant.** The current `toICS()` emits CRLF (RFC 5545 §3.4); the checked-in file uses bare `\n` line endings throughout and still contains pre-decision states (`urgent`, `conflict-review` where a re-run now yields `assigned`, `declined`…). Any strict calendar parser may reject or misparse the shipped example, and it contradicts the repo's own regeneration claim (`node examples/run.js` → outputs). All other examples (`output.json`, `queue.md`, `queue.csv`, `letters.md`) re-derive byte-identical; only the ICS is stale. Fix: re-run `node examples/run.js` and commit; consider a test asserting every checked-in example is byte-identical to a fresh run.

## Worth considering

- **Audit `at` is always `queue.asOf`** (`core/core.js:215`, `appendAudit`). An accept recorded three days after screening is logged with the screening date — "who did what, when" is only as true as `asOf`. Theirs stamps real run times (`ranAt`, `at`) per action. Suggest an optional `at` argument to `decide`/`assign`.
- **Demo `esc()` escapes only `<`** (`demo/index.html:158`). Values are interpolated into an attribute: `<option value="${esc(i.id)}">` — an id like `x" onfocus=alert(1) autofocus=` breaks out. Self-XSS only (input is the user's own JSON in their own tab), but the fix is one line: escape `& < > " '`.
- **No path from `conflict-review` to assignment in the demo.** `transition()` is exported and `conflict-review → assignable → assigned` is legal, but the demo only exposes decide/assign, so a cleared conflict can only be accepted, never assigned, from the UI.
- **README says "29 tests"; the suite is 32.** Stale count in `README.md` (Run section).

## Record only

- Ours has zero persistence: reload erases every decision; theirs degrades explicitly (memory store with a notice, shared db when granted).
- Ours records one deadline and no source text/contact/referral source; theirs keeps the enquiry as received (with quotes) plus contact, source, key dates per matter type.
- Ours has no conflict *resolution* record (marks same/different/potential, consent details) — decisions are free-text reasons; theirs gates "Clear" on marked hits and recorded consent.
- Theirs ships a rich sample queue (11 enquiries, 255-name index) auto-loading after ~12 s; ours prefills instantly. Theirs costs ~$0.40 LLM per enquiry (disclosed in a pill); ours is free and offline.
- Theirs has no ICS/calendar export; ours does (correctly, once examples are regenerated) — our one unambiguous feature win, alongside runtime-editable thresholds and the verbatim-ingest verifier, which theirs has no deterministic equivalent of.

## Scope & not covered

Verified: our core logic by reading + running (tests 32/32; all examples byte-reproduced in memory except `intake.ics`); matcher behavior on 7 adversarial name pairs both sides; both demos loaded over HTTP and screenshotted; their scripts read in full or in part (s00 notes, s04 sample adapter, s05 config, s09 matcher, s11 enquiry model, s13 exports, s15 conflict runs, s16 storage, s19 state, s23 letter; s01/s07/s08 monitoring+pdf.js skimmed by header only). Not covered: their e-signature flow end-to-end (needs a live connector), their Cowork/Claude call paths (need a host with `claude.use`), accessibility and mobile behavior of either side beyond one desktop viewport, and their docx/eml/pdf ingestion on real files — blocked by capability/environment, not by time.
