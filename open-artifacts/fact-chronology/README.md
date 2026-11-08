# fact-chronology (open legal artifact)

Builds a dated fact chronology from structured fact entries — with every
judgment machine-checked instead of asserted: sorted timeline
(day/month/year precision), source anchors (document + verbatim quote +
pinpoint) on every entry, and

- **deterministic de-dupe** — the same event reported across documents
  (same topic + date-compatible + similarity ≥ `mergeThreshold`) becomes
  one entry citing all sources; `mergedFrom` preserves absorbed ids,
  nothing is ever deleted; `mergeThreshold` must stay strictly above the
  divergent-accounts threshold (enforced — the core throws otherwise);
- **quote verification** — when a document supplies its full text, each
  quote is checked: `verified` (verbatim substring), `approximate`
  (best-window near match), or `unfound` (re-extract before use);
- **significance / case-theory tie** — key-term hits score each fact
  🔴 key / 🟡 supporting / ⚪ background; borderline (fractional) scores
  get the lower tag plus `[SME VERIFY]`; an explicit attorney tag wins;
- **provenance** — `document | user | unverified`; unverified facts render
  `[verify]` and are never silently presented as sourced;
- **privilege posture** — per-document `ok | flag | review` passthrough;
  flagged entries stay visible in the working view and are excluded from
  the statement-of-facts variant;
- **conflicts & gaps** — `date_mismatch`, `divergent_accounts` (potential
  conflicts for attorney review) and gap detection, each rendered with
  `[computed from: …]` so every derived judgment names its inputs;
- **variants & versioning** — `renderChronology(out, {format:
  working | sof | witness})` and `diffChronology(prev, next)` →
  deterministic added/removed/changed plus a version bump.

Unparseable dates like "Spring 2024" are surfaced, never guessed. Full IO
contract and LLM extraction prompt in [spec.md](spec.md).

Fictional worked example in [examples/](examples/): *Delgado v. Summit Ridge
Hospitality* — 10 facts from 5 documents → 7 dated entries (1 merged hire),
2 conflicts (a warning-that-never-happened impeachment flag and a
termination-date discrepancy), 1 gap (1,734 days), 2 undated entries, 1
unfound quote, plus a v1→v2 diff.

## Layout

- `core/` — dependency-free TypeScript, no LLM: `chronology.ts` (engine +
  renderer + diff), `textutil.ts` (token similarity, quote window match),
  `chronology.test.ts`; `core.js` is the plain-JS mirror imported by the
  demo (kept behaviorally equivalent — same logic, enforced invariants and
  renders; the TypeScript sources stay authoritative for tests).
- `examples/` — `input.json`, `run.ts`, generated `output.json`,
  `output-diff.json`, `chronology.md` / `chronology-sof.md` /
  `chronology-witness.md`.
- `demo/` — standalone browser demo (variant switcher, verification
  badges, version diff).

## Run

```bash
npx tsx --test core/*.test.ts     # 22 tests
npx tsx examples/run.ts           # regenerates examples/ outputs
```
