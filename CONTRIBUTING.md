# Contributing

Thanks for helping make every legal AI artifact open — and better.

## Ground rules

1. **Not legal advice.** Everything here is an engineering artifact for legal
   workflows. Never present output as legal advice or filed work product.
2. **Confidentiality first.** Never commit real client data, real matter facts,
   or anything privileged. Test with fictional facts and the fixtures in each
   artifact's `fixtures/`.
3. **Deterministic over model, where possible.** If a step can be plain code
   (parsing, diffing, arithmetic, date math), it must be plain code. The LLM's
   job is judgment, and judgment gets verified.
4. **Every claim links to its source.** New artifacts follow the house pattern:
   source-linked outputs, "unverified" cells rendered as unverified — never guessed.
5. **License.** Contributions are MIT, same as the repo. Don't copy proprietary
   content (e.g., a firm's question bank); build on published frameworks.

## Repo layout

- `artifacts/<name>/` — a working artifact (source + README + fixtures)
- `catalog/` — pointers to external-only work (link, don't fork)
- `docs/` — engine lineage and portability notes
- `open-artifacts/` — open reimplementations (phase 1+), each with `spec.md`,
  a deterministic core, and recorded outputs

## Adding or changing an artifact

1. Read the artifact's `README.md` and, for Val Town projects, its `AGENTS.md`
   (hard rules on structured output, file size caps, confidentiality).
2. Keep diffs minimal and complete: implementation, call sites, error paths,
   docs, and tests in one change.
3. `artifacts/client-intake/` and `artifacts/contracts-playbook/` are Deno
   projects — run `deno task test` in the artifact directory before proposing a
   change (client-intake ships tests; contracts-playbook defines the task).
4. New artifacts need: a `README.md` (what it does, how to run, live links if
   any), a license header-free source tree (repo LICENSE covers it), and
   fictional fixtures only.

## Reporting problems

Open an issue with: what you ran (command or URL), what you expected, what
happened, and whether you were in demo mode. Screenshots help.
