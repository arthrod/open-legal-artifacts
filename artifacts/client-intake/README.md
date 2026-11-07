# Client Intake (Val Town)

[Open the demo](https://arthrod--bf6161ba-d937-11f1-a5d4-1607ee4eb77e.web.val.run/) · [Val Town project](https://www.val.town/x/arthrod/intake-demo-jandira)

A guided **legal client intake** that turns a plain-language description of a
matter into a structured intake the firm can act on — with an AI that **suggests
answers you can accept or change**, a **conflict-check party list**, and
**urgency/deadline flags**.

Built on the same structured-elicitation engine as the sibling `playbook-from-doc`
val: free `gpt-5-nano`, strict JSON schema, repair + assert, confirm-before-save.

## Who it's for

- **Clients** describing their own situation — plain language, terms explained.
- **Firm staff / secretaries** taking an intake — fast, standard terminology.

## Flow

```
start            persona (client / staff) + matter area + "what's going on"
  ↓ elicit       AI proposes the right questions (each with suggestions) for the
                 matter area, and flags time-sensitivity
  ↓ review       you confirm / edit every answer
  ↓ finalize     AI builds a firm-facing summary + conflict-party list + urgency
  ↓ saved        reference number, "what happens next", printable summary
```

## Matter areas

Family · Criminal · Personal injury · Employment · Immigration · Wills/estate ·
Business · Real estate · Landlord/tenant · IP · Bankruptcy · Other.

## Endpoints

| Route | Purpose |
|---|---|
| `POST /api/elicit-intake` | narrative + area → proposed intake fields (suggestions) |
| `POST /api/finalize-intake` | answers → summary + conflict parties + urgency + next steps |
| `POST /api/submit` | persist the reviewed `IntakeRecord`, return a reference |
| `POST /api/help` | plain-language explanation of a term/question |
| `GET /api/intakes` | list stored intakes (admin only: `Authorization: Bearer $ADMIN_TOKEN`; 503 while unset) |
| `GET /api/intakes/:id` | one stored intake (admin only, as above) |

## Not legal advice

This gathers information to help a firm evaluate a matter. It is not legal advice
and creates no attorney–client relationship until the firm accepts the matter.

## Dev

`deno task test` runs the suite. See `AGENTS.md` for the hard rules (structured
output, modular frontend under Val Town's 80 KB/file cap, confidentiality).

## Lineage

`elicitation` (an MCP `elicitation/create` form lab, March 2026; no model, no storage) →
`legal-intake` (first model-backed intake, for in-house requests; retired) →
`playbook-from-doc` (the engine with tests, redaction and versioning) →
`client-intake` (the same engine, for law-firm intake). Stored records on all three model-backed
vals are readable only with `ADMIN_TOKEN` (`backend/auth.ts`).

## Getting started

This repository is a Val Town multi-file project, cloned from
[`arthrod/client-intake`](https://www.val.town/x/arthrod/client-intake). It is
intended as a demonstration, not a production legal intake system. Use fictional
facts when trying it. You need a Val Town account, Deno 2, and the `vt` CLI.

```sh
git clone https://github.com/jandira-tech/intake-demo.git
cd intake-demo
deno task test
```

To deploy your own copy, remix the source with `vt remix arthrod/client-intake
<your-val-name> <directory>`, copy the repository files into that directory
without overwriting its `.vt` directory, and run `vt push` there. `vt status`
shows what will be uploaded. `.vt` is local linkage and is deliberately excluded
from Git; do not copy it from another val. Tests and documentation are excluded
from uploads by `.vtignore`. Configure settings and environment variables on
*your* val, not the source. Val Town's hosted OpenAI proxy and val-scoped SQLite
are runtime services; a standalone local Deno server is not equivalent to the
hosted environment.

### Configuration and data

| Setting | Behavior |
| --- | --- |
| `ADMIN_TOKEN` unset or blank | Demo mode: validated submissions return a `DEMO-` reference and are **not stored**; read endpoints return 503. |
| `ADMIN_TOKEN` set | Submissions are stored in the val-scoped `intakes_v1` table. Read endpoints require `Authorization: Bearer <ADMIN_TOKEN>` and return 401 for a wrong token. Set it in the val's environment settings; never commit it. |

The read-only firm dashboard prompts for the configured admin token when storage
is enabled; it sends the bearer token on read requests and keeps it only in memory
until the view is locked or closed. When the token is unset, the dashboard explains
that demo submissions are not stored. Rate limiting is in-memory per running isolate, not a distributed
security boundary. Drafts are stored in the browser's `localStorage`; resetting
the flow clears its draft. Submitting the discard-narrative option removes the
narrative from the database payload, but generated summaries and answers may
still contain sensitive information. Model calls send the entered text to Val
Town's model service. Review hosting, retention, access, and legal requirements
before considering real data.

Example authenticated read (provide the token via your shell environment; avoid
putting it in a command history or repository):

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://YOUR-HTTP-VAL-URL/api/intakes"
```

## Architecture and behavior

- `backend/index.http.tsx` serves the app and API; `llm.ts` performs elicitation,
  finalization and help calls; `db.ts` persists records. `auth.ts`, `mode.ts`,
  `ratelimit.ts` and `http_util.ts` hold request safeguards.
- `shared/catalog.ts` defines fields, prompts, schemas and validation;
  `shared/types.ts` defines request and record shapes. `shared/intake_client.ts`
  and `shared/firm.ts` hold browser-independent transformations.
- `frontend/` contains the React step views, session state, dashboard and export.
  The app supports a printable result and Markdown download.
- `DESIGN.md` records the original design tokens; styles remain in the existing
  Twind classes and HTML to preserve the interface.

Elicitation and finalization use strict structured output from `gpt-5-nano`,
followed by repair and validation. Help is a free-text explanation. The model can
make mistakes: a human must review the answers, conflict parties and urgency.
The intake does not establish an attorney–client relationship or give advice.

## Verification and troubleshooting

`deno task test` runs the local behavior tests for access control, demo mode,
rate limits and the matter/urgency catalog. These do not call the model or SQLite.
The source val excludes its original test files from `vt clone`, so this suite is
not a claim of complete end-to-end coverage. On a deployed copy, exercise the
start → elicit → review → finalize → save flow with fictional data; check the
network and Val Town logs if a model call fails. A 429 means the shared model
quota or in-memory limiter was reached; wait and retry. A 503 on read routes
means `ADMIN_TOKEN` is unset; 401 means the bearer token is missing or wrong.

## Elicitation Lab

The navigation links to `/lab`, an interactive companion based on the ZIP's
Elicitation Lab design. Choose a request from the queue, fill the form, and send
an accept, decline, or cancel response. The server validates the response against
its plan; responses are not stored. The lab's context editor and notes remain
local to the browser and are not sent to the model or server.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/lab/plans` | Return the available elicitation plans and schemas. |
| `POST /api/lab/plans/:id/respond` | Validate a response to a selected plan. |
| `POST /api/lab/rpc` | Validate a synthetic `elicitation/create` request and report that interactive transport is unavailable. |

The RPC endpoint returns JSON-RPC error 501 for a valid request because an interactive
MCP transport is unavailable; it does not pretend to return a human response. Use the queue's response controls for the interactive demonstration.
