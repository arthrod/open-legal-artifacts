# Val Town portability

`artifacts/client-intake/` and `artifacts/contracts-playbook/` are Val Town
multi-file projects (Deno 2 + Hono). They run **on Val Town**; this page is the
honest list of what couples them to that platform and how to take them anyway.

## Runtime couplings

| Coupling | What it is | Portability |
|---|---|---|
| `std/openai` proxy | Free hosted OpenAI access (`gpt-5-nano`), **no API key** | Substitute any OpenAI-compatible endpoint in `backend/llm.ts`; schema/repair/assert logic is model-agnostic |
| Val-scoped SQLite | `intakes_v1` / `playbooks_v2` tables inside the val's own database (`backend/db.ts`) | Schema is plain SQLite; bring your own database, keep the version-family logic in `shared/versioning.ts` |
| 80 KB/file cap | Val Town rejects oversized files ⇒ frontend is deliberately modular (`frontend/steps_*.tsx`, `shared/`) | Not a limit off-platform, but keep the modularity — it's also readability |
| `.vt` tooling | `vt` CLI linkage; `.vt/` is local state, deliberately never committed or copied between vals | Repo copies here have no `.vt/`; that's correct |
| `.vtignore` | Excludes tests/docs from uploads | Keep when pushing back to a val |

## Remix / clone recipe

Deploy your own copy without touching the source tree:

```sh
# client-intake (also mirrored on GitHub)
git clone https://github.com/jandira-tech/intake-demo.git
vt remix arthrod/client-intake <your-val-name> <directory>
# copy repo files into <directory> WITHOUT overwriting its .vt/ directory
cd <directory> && vt push        # vt status first shows what uploads
```

```sh
# contracts-playbook (no GitHub mirror; remix straight from the val)
vt remix arthrod/playbook-from-doc <your-val-name> <directory>
cd <directory> && vt push
```

Then, on **your** val (not the source): set `ADMIN_TOKEN` in environment
settings to enable storage; never commit it. `vt watch` for live editing.

## Demo mode & fail-closed reads (the security model)

- `ADMIN_TOKEN` **unset/blank** → demo mode: submissions validate fully, get a
  `DEMO-` reference, and are **not stored**; read endpoints answer **503**.
- `ADMIN_TOKEN` **set** → submissions persist; reads require
  `Authorization: Bearer <token>` (401 otherwise).
- Rate limiting is in-memory per isolate — a dampener, not a distributed
  security boundary.
- Client-intake: the discard-narrative option removes the narrative from the DB
  payload, but generated summaries may still contain sensitive text.
- Contracts-playbook: `.docx`/`.pdf` are parsed **client-side only** (mammoth /
  pdfjs) — files never leave the browser; model calls receive extracted text
  (optionally redacted via `shared/redact.ts`).

## Local (non-Val) runs

`deno task test` works offline in each artifact directory (env stubbed).
A standalone local Deno server is **not** equivalent to the hosted environment:
no `std/openai` proxy and no val SQLite without extra wiring — treat local runs
as test/type-check environments, and the val (or your own port with the
substitutions above) as the runtime.
