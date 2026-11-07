# Catalog: Anthropic's legal artifacts

Anthropic's "Claude for Legal" artifacts gallery (announced 2026-10-28) holds
32 artifacts: 22 Anthropic-built + 10 partner/nonprofit-built. Each is an
interactive tracker/board/table that takes documents + connectors, produces a
lawyer-reviewed first pass, and links outputs to sources.

- Launch announcement: <https://claude.com/resources/articles/introducing-artifacts-for-legal-work>
- Open reference repo (Apache-2.0 — agents, skills, MCP connectors behind much
  of the same ground): <https://github.com/anthropics/claude-for-legal>

Per-artifact URLs are product-internal (no public pages); descriptions above
come from the announcement and secondary enumerations of the gallery.

## Our commitment map

The full mapping — gallery artifact ↔ our counterpart ↔ status ↔ what's
better — lives in the [root README](../README.md#the-anthropic-gallery-mapped).
Statuses: **shipped** (client-intake, contracts-playbook), **phase-1**
(cite-check, playbook-deviation-board, fact-chronology, tabular-review),
**phase-2** (the rest), **external-link** (this page).

## Why link instead of fork the reference repo

`anthropics/claude-for-legal` is Apache-2.0, so forking is *allowed* — but it
is a moving, vendor-curated surface tied to Claude runtime surfaces. Our
counterparts are built to be model-agnostic and self-hostable, so we treat the
repo as a reference (and cite its agents, e.g. `Tabular Diligence Review`,
`Docket Watcher`, `Chronology Builder`, `Renewal Watcher`) rather than a base.

## Priorities (where open is verifiably better, not just cheaper)

1. **Cite check** — deterministic core (quote diff, citation parsing via
   eyecite); LLM only judges proposition support.
2. **Rent ledger reviewer / record sealing / eviction check** — the law is the
   logic: rules-as-data with statutory cites, arithmetic as pure code.
3. **Entity compliance calendar** — maintained ruleset is the moat, and it
   belongs in the commons.
