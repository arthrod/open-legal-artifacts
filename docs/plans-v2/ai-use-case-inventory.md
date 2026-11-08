# Planner — run 7290de40 participant 2

Recon complete: their counterpart read in full from the repo, our artifact read in full. One execution note: this environment exposes no shell/exec tool, so I could not run `node --test` — I report that honestly below rather than fabricating a pass. Here is the improvement plan.

---

**1) THEIR EDGE** (source: `ai-governance-legal/skills/ai-inventory/SKILL.md` @ anthropics/claude-for-legal, fetched today)
- **Per-system role** (provider/deployer/importer/distributor/auth-rep/manufacturer) + **dual-role flag** on substantial modification (Art. 25) — obligations hinge on role; we have no role concept.
- **GPAI tiers** (`gpai`, `gpai_systemic`, 10^25 FLOPs test, Art. 51) — our 4-tier space misses model-side duties.
- **Living register**: status, owner, next_review, review_trigger, created/updated + "N systems flagged for review within 30 days" — ours is a static one-shot tiering.
- **EU-nexus gate** scopes whether the Act applies before tiering; we tier unconditionally.
- **"Never classify silently" + `[verify]` tags** — our substring matcher would tier "detects dark patterns" as *prohibited*.

**2) OUR GAPS (top 5)**
1. No role dimension → no role-aware obligations or dual-role detection.
2. No GPAI/systemic-risk tiers; Annex III misses critical infrastructure + migration/asylum.
3. No lifecycle/review clock (status, owner, nextReview, staleness).
4. No EU-nexus scoping.
5. No exclusion/negation handling in keyword matching; no needs-human-review gate.

**3) IMPROVEMENTS** (change / why beats / acceptance / size / files; all in `open-artifacts/ai-use-case-inventory/`)
1. **Role + dual-role**: `role` enum + `substantialModification?`; `assessRole()` flags deployer→provider shift. Deterministic+tested vs their conversational-only. Test: fine-tuned deployer ⇒ `dualRoleFlag:true`. S — core/core.js, core.test.js, spec.md.
2. **GPAI tiers**: `trainingComputeFlops?` ⇒ `gpai`/`gpai_systemic` (≥1e25), basis cites threshold; NIST entries. Test: 2e25 ⇒ gpai_systemic. S — core.
3. **Lifecycle register**: `status`,`owner`,`nextReview?`; `reviewDue(inv, asOfISO)` lists ≤30d + stale >1y. Deterministic clock beats manual dates. Test: due-in-20d listed. M — core, examples/run.js, demo.
4. **EU-nexus gate**: `euNexus:false` ⇒ tier computed but `outOfScope:true` + note. Test asserts both. S — core.
5. **Negation-safe matching**: rules gain `noneOfKeywords` (detect|flag|block|moderate); excluded hit ⇒ tier stays minimal + `needsHumanReview:true`. Their guardrail, made deterministic. Test: "detects dark patterns" ⇒ minimal+needsReview. M — core.
6. **Obligations as cited data**: `OBLIGATION_NOTES[role][tier]` with `[verify]` tags (deployer×high ⇒ Art. 26-style list). Auditable diff vs their "in conversation only". Test: every role×tier combo covered. M — core, README.
7. **Coverage + exports**: critical-infrastructure & migration/asylum rules; CSV/dashboard add role, status, nextReview, needsReview + tier/status/nexus filters. Test: new rules fire; exact CSV header. M — core, demo.

**4) VERIFIABLE-BETTER CLAIM + PROOF**
After 1–7 ours is a testable superset: every capability of their conversational register (role, 6 tiers incl. GPAI, lifecycle, nexus, review clock, verify-tagged bases) reproduced deterministically, plus CSV export — theirs is prompts with no tests or export. Proof: `node --test core/` green with new tests mapped 1:1 to their SKILL.md features; README diff table vs anthropics/claude-for-legal@main.

**5) RISKS**
- Article semantics drift (Art. 25/26/51): keep "-style" citations + `[verify]` tags.
- Negation lists could over-suppress: needsReview must be loud in demo/CSV.
- **Tests NOT run here** (no exec tool in this environment): 13 tests statically reviewed, expected green; implementers must run before/after.
- Their interactive add-interview stays out of the deterministic core (README notes it).

DONE_WITH_CONCERNS