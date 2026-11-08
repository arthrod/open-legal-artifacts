# Planner — run 7290de40 participant 14

**JURISDICTION SURVEY MATRIX — improvement plan** (counterpart studied via launch article + anthropics/claude-for-legal, both fetched today; artifact dir read in full)

**1) THEIR EDGE**
- "Links to the underlying law" is their core promise — our `citation` is inert text; no URL exists in core contract, exports, or demo.
- 60+ legal connectors (Bloomberg Law, Legora…) fill cells from live sources; we're paste-JSON only.
- Gallery artifacts "open with an example" and adapt to your data; our demo is read-only.
- Claude does first-pass per-jurisdiction research (repo analog: Tabular Diligence Review, "every cell cited"); we only sketch a prompt schema.
- Sharing/collab surfaces (ethical walls) — out of our scope by design.

**2) OUR GAPS (top 5)**
1. No `sourceUrl`/`quotedText` in the cell contract — the "link to law" promise is unmet.
2. `demo/index.html` is not self-contained (`tokens.css`, `../core/core.js`, `./example.js` refs) — breaks the deployer/single-file contract.
3. Silent data loss: duplicate cells last-win; orphan cells (unknown jurisdiction/question id) dropped; zero warnings.
4. Coverage is global-only; no re-verification worklist despite staleness being our signature feature.
5. Any non-empty string passes as citation; no verbatim-quote/figure consistency check — the catalog's #1 hallucination vector (transcribed numbers).

**3) IMPROVEMENTS**
1. **Link gate** — add `sourceUrl`+`quotedText`; `policy.requireSourceUrl` (default true) → verified cells must link the law. MD renders `[cite](url)`, CSV gains column. *Why beats theirs:* their link is decoration; ours is a render precondition. *Test:* cited cell w/o URL → unverified. **S** — core/core.js, core.test.js, examples/input.json, demo.
2. **Input integrity** — `buildMatrix` returns `warnings[]`: duplicates, orphans, empty lists; no silent drops. *Test:* dup + orphan each warn. **S** — core.
3. **Figure-consistency** — digits in answer must appear in `quotedText`, else flagged "figures not in quoted source". *Test:* "30 days" + quote w/o "30" → flag. **M** — core.
4. **`toWorklist(matrix)`** — stale+unverified cells as prioritized MD/CSV re-verification queue. *Test:* rows = stale+unverified, stale first. **S** — core + demo button.
5. **Coverage breakdown** — `byJurisdiction`/`byQuestion` + demo bars. *Test:* US-TX = 0 verified. **S** — core.
6. **Self-contained, load-your-own demo** — inline CSS/core/example (zero external refs); paste-JSON/file input + asOf picker, warnings surfaced, client-side only. *Why:* their adaptability, but no data leaves the machine. *Accept:* grep demo for `href=|src=|import` → none; paste edited JSON → re-render. **M** — demo/index.html.

**4) VERIFIABLE-BETTER CLAIM**: ours wins on trust, enforced by tests — no cell renders without citation+date+URL, staleness policy, actionable gap queue; theirs links sources but nothing structurally forces verification before render, and has no staleness concept. Proof: `node --test` green with new failing-first tests (gate, warnings, worklist, consistency) + zero-external-ref grep on demo.

**5) RISKS**: connector-fed auto-research is unreachable for an LLM-free core (compete on verification, not throughput); figure-check may over-flag → ship warning-only; inlined demo grows but stays single-file; fictional URLs must stay fictional.

**Tests**: no shell/exec tool exists in this read-only environment — **not executed**. Static trace of all 10 core.test.js cases against core.js (98d/291d date math, coverage 4/1/3 of 8, CSV 9 lines, MD regexes): all pass by hand → PASS (static), unverified by execution.

DONE_WITH_CONCERNS