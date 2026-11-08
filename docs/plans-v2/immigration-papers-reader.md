# Planner — run 7290de40 participant 11

Recon complete — I have everything needed (our artifact fully read, counterpart verified via the launch article and the reference repo, catalog cross-checked). No execution tool exists in this session (tool_search returns only 3 domain skills, no shell), so I verified the suite statically and against the last recorded run instead of executing it. Deliverable below.

---

**TESTS**: Cannot execute — no shell/runner tool in this session. Static check: `core/core.test.js` defines exactly 16 tests; last recorded run (`tmp/open-legal-artifacts/evidence/test-run.log`) shows `immigration-papers-reader: pass=16 fail=0`.

**1) THEIR EDGE** (evidence: launch article, fetched 2026-11-07; anthropics/claude-for-legal repo; catalog §3.6)
- Reads actual **paperwork** (forms/notices/filings) in; we require pre-structured facts JSON — our "capture" is only a prompt spec, unimplemented.
- Gallery UX: opens with a worked example, every output **links to its source**, conversational adaptation (article).
- Handles any case type / unstructured pile; we cover 4 types (removal defense referred).
- Zero-setup in Claude with nonprofit-funded distribution (article).

**2) OUR GAPS**
1. No paper input — nothing turns a notice into facts.
2. Repo README row 28 overclaims "form-type detection; per-form extraction templates; bilingual output" — none exist in core.
3. `uncertain` is defined in the spec's capture schema but `readCase` ignores `facts.uncertain` — capture honesty stops at the prompt.
4. `today` falls back to `new Date()` → non-deterministic default output, contradicting spec.
5. Key dates are untyped/unsorted — a hearing and a filing deadline get identical weight; no next-action.

**3) IMPROVEMENTS** (each test-first, failing test before code)
1. **Deterministic notice parser** `parseNotice(text)` — per-form rules-as-data templates (I-797C, NTA, EAD, I-693, biometrics) → facts JSON; unmatched/garbled → `uncertain`, never guessed. *Why beats:* auditable extraction vs LLM black box. *Accept:* fictional I-797C text → exact facts; unreadable date → uncertain. **L** — core/core.js, core/core.test.js, spec.md, demo textarea. *(depends: none)*
2. **`uncertain` first-class in readCase** — uncertain docs get status `uncertain`, excluded from ready count; `readiness.has_uncertain`; warnings. *Accept:* present-but-uncertain doc lowers score + warns. **M** — core files. *(depends: 1)*
3. **Key-date taxonomy** — `type: hearing|filing_deadline|expiry`, per-type loud copy (hearing → "missed may mean in-absentia order — refer"), sort by days_until, `next_action`. *Why beats:* their summary can't guarantee a missed hearing is maximally loud. **M** — core files. *(depends: none)*
4. **Determinism fix** — throw when `today` absent. **S** — core. *(none)*
5. **Bilingual EN/ES export** — `exportChecklistMd(r, {lang})` + summary dictionary (catalog explicitly recommends bilingual for A2J). *Accept:* ES headings/disclaimer test. **M** — core, demo toggle. *(none)*
6. **Claims truth-sync** — after 1+3 land, update artifact README/spec; flag repo README row 28 one-line fix (outside artifact dir — needs owner approval per constraints). **S**. *(depends: 1,3)*
7. **+2 case types** (TPS, U-visa) as data; test ≥3 required docs each. **M** — core. *(none)*

**4) VERIFIABLE-BETTER CLAIM**: same fictional paperwork in → byte-identical first read on every run, each line traceable to a named template/rule, uncertainty marked not smoothed, in-absentia risk auto-referred. *Proof:* `node --test` green incl. parser golden tests + two-run diff identical; demo accepts pasted fictional notice text. Theirs can demonstrate none of these.

**5) RISKS**: regex templates brittle on real scans (mitigate: uncertain-first); Spanish terms need native review (label "unofficial translation"); repo-README edit exceeds artifact-dir boundary — approval required; keep demo single-file + arthur.law tokens.

DONE