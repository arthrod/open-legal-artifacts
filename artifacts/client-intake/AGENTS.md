# Agents working on client-intake

A guided legal **client intake** built on the same structured-elicitation engine
as `playbook-from-doc` (a sibling val). A client — or firm staff on their behalf —
describes a matter; the AI elicits the right details (with alternatives to pick),
the user reviews, and we produce a structured `IntakeRecord` for the firm.

## Hard rules for any change

1. **Structured LLM only.** Every model call for elicit/finalize MUST use
   `response_format: { type: "json_schema", json_schema: … }` with strict mode —
   every property under `properties` must also be in `required` (for `gpt-5-nano`).
   `/api/help` is the only free-text exception. The frontend renders structured
   data; it is NOT a chat UI. If the model drifts, fix the schema/prompt — don't
   add string cleaners.
2. **Free `gpt-5-nano` via `https://esm.town/v/std/openai`.** No API key, no secrets.
3. **Repair + assert** every model response before use (mirror playbook-from-doc's
   `repairExtract`/`assertExtract`).
4. **Frontend must stay MODULAR.** Val Town rejects any single file over ~80 KB
   ("File is too large"). Split `frontend/*.tsx` into modules well under 72 KB.
   Every JSX file: `/** @jsxImportSource https://esm.sh/react@18.2.0 */` and React
   pinned via `?deps=react@18.2.0`. The val serves `/frontend/*`, so relative
   `./x.tsx` imports transpile per-file.
5. **SQLite:** `https://esm.town/v/std/sqlite/main.ts` (val-scoped). Bump the table
   name (`intakes_v2`, …) on schema change — no `ALTER TABLE`.
6. **Confidentiality first.** This handles sensitive legal facts. Provide a
   data-handling notice, a "discard narrative on save" opt-out, and never log raw
   model output or free-form user text. Parse any uploads client-side.
7. **Conflict check + urgency are load-bearing.** Finalize MUST extract every named
   person/entity into `conflict_parties` and surface an `urgency` flag; emergency /
   urgent levels get an attorney-escalation cue.

## Domain model (do not invent a different shape)

See `shared/types.ts`. Two stages: **elicit** (`IntakeElicitation` → fields with
≥2 suggestions each) then **finalize** (`FinalizeIntakeResponse` → summary,
`conflict_parties`, `urgency`, `next_steps`, jurisdiction, contact). `IntakeRecord`
is the persisted shape.

## Persona gates tone

`client` → plain language, define terms, empathetic. `staff` → efficient, standard
terminology. Never give legal advice; this gathers information only.

## Flow

`start (persona + area + narrative) → elicit → review → saved`

## Testing / deploy

`deno task test` (deno test -A). Tests are `shared/*_test.ts`, excluded from deploy
via `.vtignore`. Red-green TDD, stacked PRs. Deploy with `vt push` (orchestrator).
No production DB writes in E2E (gated) — stub reads, verify save out-of-band.
