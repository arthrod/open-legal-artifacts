# Planner — run 7290de40 participant 3

Recon complete: our artifact read in full, counterpart studied via the repo README, launch article, and local catalog; both web sources reachable. One hard limitation found: this environment exposes no shell/exec/eval tool (searched bash, sandbox, exec, val-town — all empty), so the suite could not be executed; I did a full static trace instead and report it as inference, not a run.

---

**1) THEIR EDGE** (evidence: local catalog §2.3; launch article 2026-10-28; anthropics/claude-for-legal README)
- Conversation loop: lawyer's reply returns to the asker in-channel (Harvey Intake, same pattern per article).
- Jurisdiction-aware Q&A ("Wage & Hour Q&A" agent); repo guardrail: "jurisdiction assumptions surfaced".
- 60+ connectors pull playbooks (Ironclad/Harvey/iManage) — no manual KB curation.
- Escalation Router "routes issues… and drafts the ask" — escalation carries a drafted request, not a team name.
- Every output has a source link; each artifact opens with a worked example.

**2) OUR GAPS (top 5)**
1. `jurisdiction` field is dead — core never reads it (verified in core.js).
2. No feedback loop: catalog §2.3 names "lawyer corrections update the guidance base" as the better-open feature; we have none.
3. Medium answers not labeled provisional in core (spec promises it; `answerQuestion` returns raw text).
4. Escalation outputs only a route string — no ticket/intake summary for the lawyer.
5. Retrieval/validation brittle: exact tokens ("vendor" misses answer's "vendors" — verified by trace); substring tag match over-matches short tags (tag "ip" hits "tips"); no KB validation (missing `approvedBy`/`updated` silently served).

**3) IMPROVEMENTS** (change / why beats theirs / acceptance test / size / files = core/core.js + core/core.test.js, spec.md, README.md, examples/, demo/index.html)
- **A Jurisdiction gating** — `opts.jurisdiction`; mismatch downgrades one tier + reason. Theirs surfaces assumptions in prose; ours enforces with receipts. Test: US entry asked under EU → medium + mismatch reason. **S**
- **B applyCorrection(kb,{auditId,answer,approvedBy,updated})** — lawyer fix on an escalation creates a `pending-approval` entry + audit link; unretrievable until approved. Closes the loop they don't have. Test: pending entry not retrieved; approved entry is. **M**
- **C escalationTicket(result,log)** — {route,question,asker,matchedIds,reasons,suggestedEntry}. Deterministic "drafts the ask". Test: exact fields, JSON-serializable. **S**
- **D provisional flag** — medium results carry `provisional:true` + label. Spec-core alignment. Test: medium→flag set, low→answer null. **S**
- **E validateKb(kb)→issues[]; answerQuestion refuses invalid KB.** Never serves unapproved guidance. Test: missing `approvedBy` flagged and question refused. **S**
- **F Routing SLAs {team,slaDays} + overdueEscalations(log,asOf).** Catalog-named per-topic SLAs, absent theirs. Test: 4d-old escalation vs 3d SLA → overdue. **M**
- **G Retrieval hardening** — plural folding + rules-as-data synonym map; tighten substring tag rule to length≥4. Fixes vendor/vendors miss. Test: "vendors" query hits kb-nda answer terms; "tips" ≠ tag "ip". **S–M**

All failing-test-first; deterministic, dependency-free; confined to the artifact dir.

**4) VERIFIABLE-BETTER CLAIM**
Every answer/escalation decision is deterministic code with machine-readable reasons, configurable thresholds, append-only exportable audit, and one test per behavior. Theirs (article + repo evidence) delivers answers/routing via prompt-borne logic with source links and "visibility for Legal", but no executable confidence criteria, no exportable audit, no KB validation, no correction loop. **Proof:** `node --test` green including A–G; README feature-diff table citing their public descriptions.

**5) RISKS**
- Tests **not executed** here — no shell/exec tool exists in this environment (verified). Static trace of all 11 existing tests = PASS, but that is inference; run `node --test` first.
- Theirs is LLM-native (conversation, connectors); keep our LLM at the polish layer per spec or we lose the determinism moat.
- G may shift scores/ties; re-pin default thresholds and re-baseline demo outputs after.
- Demo stays one self-contained file — inline any new output shapes.

STATUS: DONE_WITH_CONCERNS