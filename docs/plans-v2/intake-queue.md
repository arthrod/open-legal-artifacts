# Planner — run 7290de40 participant 13

Recon complete — I have our full artifact (spec, core, 18 tests, examples, demo), the local catalog's counterpart entry (§2.22), the launch article, and the reference repo README (Clinic Intake / Matter Intake agents). One limitation to report honestly: this session has no shell/exec tool (tool_search returned none for shell/bash/val-town), so tests could not be executed; I did a static verification instead.

**intake-queue improvement plan** (counterpart: Claude for Legal "Client intake queue")

**1) THEIR EDGE** (evidence: local catalog §2.22/S4#27; repo README fetched 2026-11-07; launch article)
- End-to-end: "screens for conflicts, drafts the letter" — engagement/declination letters; ours stops at assignment.
- Decision output accept/decline/escalate, not just triage states.
- Ingests raw requests (emails/forms) via LLM; ours requires pre-structured JSON.
- Repo `Clinic Intake` writes matter.md/history.md + log: persistent matter trail; ours is stateless per run.
- 60+ live connectors; conflict DB stays current vs our static roster snapshot.

**2) OUR GAPS (top 5)**
1. No accept/decline/escalate decision record.
2. No letter drafting (the counterpart's headline output).
3. No audit trail (catalog §2.8: "who checked what when").
4. No aliases/former names in roster matching.
5. Deadlines dead-end in the queue (no calendar export); LLM-extraction boundary unvalidated.

**3) IMPROVEMENTS** (all: failing-test-first, no new deps, artifact dir only)
1. **Decision layer** `decide(queue,id,{accept|decline|escalate},by,reason)` → guarded states + reason. Beats: their routing is LLM-opaque; ours deterministic+auditable. Test: decline from conflict-review ok; from duplicate rejected. **M** core/core.js|core.test.js, spec.md.
2. **Deterministic letters** `renderLetter(q,id,kind)` — engagement/declination templates citing conflict score/matter; jurisdiction placeholders (UPL-safe referral note per catalog). Beats: no hallucination possible; every line traceable to queue fields. Test: letter names matched roster party + score; zero unresolved `{{`. **M** core+demo+examples.
3. **Audit trail** — `queue.audit[]` appended by processQueue/assign/decide; exported. Test: 3 actions → 3 ordered entries. **S** core.
4. **Alias-aware roster** — roster `aliases[]` matched as first-class, flagged `aliasMatch`. Test: alias hit scores 1 with flag. **S** core.
5. **ICS export** `toICS(q)` — one VEVENT per deadline. Beats: counterpart reminds no one (catalog §2.9). Test: output parses, contains deadline date. **S** core+demo.
6. **Ingest verifier** `ingestSubmission(extracted, sourceText)` — rejects names not verbatim in source (enforces spec's LLM prompt "copy verbatim"). Test: altered name → `unverified-extraction` flag. **M** core.
7. **Demo/example parity** — expose 1–6 in demo/index.html + regen examples. Test: manual review vs tokens. **M** demo.

**4) VERIFIABLE-BETTER CLAIM**: every screening call in ours is deterministic, scored, threshold-auditable, test-covered, and exportable (CSV/MD/ICS + audit log + grounded letters); theirs is LLM-screened behind a login with unpublished logic. **Proof**: `node --test core/core.test.js` green (18→~30 tests) in `open-artifacts/intake-queue`; `node examples/run.js` twice → byte-identical outputs (`diff` empty).

**5) RISKS**: (a) I can't confirm their letter/decision UX details — gallery artifact itself is login-walled; claims limited to catalog+repo; (b) letter templates must stay jurisdiction-neutral (no legal advice); (c) alias lists are only as good as roster maintenance; (d) scope creep in demo.

**Tests**: NOT RUN — no shell/exec tool available in this session (searched; none). Static review of core.test.js (18 tests) against core.js found no evident failure; examples/ outputs present and consistent with input.json. Re-run required post-implementation.

STATUS: DONE_WITH_CONCERNS