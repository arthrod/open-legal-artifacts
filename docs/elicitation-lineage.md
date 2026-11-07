# Elicitation lineage

How one structured-elicitation engine became four artifacts. The pattern is the
same everywhere: **strict JSON schema → repair → assert → human confirm →
save**, with fail-closed reads.

```
elicitation            (MCP elicitation/create form lab, March 2026)
   │  no model, no storage — just the form/validate idea
   ▼
legal-intake           (first model-backed intake, for in-house requests)
   │  strict schema + free gpt-5-nano + confirm gate; retired
   ▼
playbook-from-doc  →   artifacts/contracts-playbook/
   │  the engine grown up: tests, pattern redaction, quote verification,
   │  version families (SQLite), counterparty redline review
   ▼
client-intake      →   artifacts/client-intake/
      the same engine, aimed at law-firm intake: AI-proposed questions with
      suggested answers, conflict-party list, urgency flags, fail-closed reads
```

## The shared engine (what actually repeats)

Each model-backed artifact carries the same core in `shared/catalog.ts`:

- **A fixed output schema** (`EXTRACT_SCHEMA` / intake equivalents) — the model
  is locked to JSON, not coaxed toward it.
- **A repair pass** — invalid JSON gets one structured repair attempt before
  the request fails loudly, never a silent best-effort parse.
- **Assert before accept** — `assertPlaybookRecord` (playbook) and the intake
  equivalents type-check every field the UI will rely on.
- **Confirm before save** — nothing reaches SQLite without an explicit human
  confirmation step; drafts live in `localStorage` until then.
- **Fail-closed reads** — stored records need `ADMIN_TOKEN`
  (`backend/auth.ts`); unset ⇒ read endpoints return **503**, not open data.
- **Demo mode when unauthenticated** — with `ADMIN_TOKEN` unset, submissions
  return a `DEMO-` reference and are **not stored**.

## Why this lineage matters

The interesting artifact was never intake or playbooks — it was the elicitation
*engine* both share. Documenting the lineage keeps the extraction path (see the
[plan](../README.md#roadmap)) honest: phase-1 reimplementations should lift
`shared/catalog.ts` schemas/prompts/repair into a framework-agnostic `engine/`
package rather than growing a third private copy.

## Live descendants

| Artifact | Repo directory | Live |
|---|---|---|
| contracts-playbook (`playbook-from-doc`) | [`artifacts/contracts-playbook/`](../artifacts/contracts-playbook/README.md) | [demo](https://arthrod--cdf728ae-d937-11f1-a239-1607ee4eb77e.web.val.run/) |
| client-intake | [`artifacts/client-intake/`](../artifacts/client-intake/README.md) | [demo](https://arthrod--bf6161ba-d937-11f1-a5d4-1607ee4eb77e.web.val.run/) |

`legal-intake` is retired (no live URL); `elicitation` survives conceptually as
the `/lab` Elicitation Lab inside the client-intake demo clone
(`arthrod/intake-demo-jandira`).
