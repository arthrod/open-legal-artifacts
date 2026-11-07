# Deploying Open Legal Artifacts to Val Town

Everything here is deployable to Val Town as **static http vals** — one val per
artifact demo, plus one for the centralized playground. No server, no secrets.

## Status

Not yet deployed (as of 2026-11-07): no `VAL_TOWN_API_KEY` was available on
this machine and no signed-in browser session. The GitHub Pages mirror is live
at <https://arthrod.github.io/open-legal-artifacts/> in the meantime.

## One-command deploy

```bash
export VAL_TOWN_API_KEY=...   # https://www.val.town/settings/api
node deploy/vt-deploy.mjs     # deploys all artifact demos + the playground
```

The script is idempotent: it creates each val on first run and updates the
code on later runs. It prints the public URL of every val it deploys.

## How it works

1. Each artifact demo is a standalone `demo/index.html` styled with the
   project design tokens, importing its deterministic core as an ES module.
2. `vt-deploy.mjs` inlines every local `<link rel="stylesheet">` and
   `<script type="module" src=…>` (including the woff2 font, base64) into a
   single self-contained HTML file.
3. It wraps that HTML in a Val Town http val:

   ```ts
   export default function () {
     return new Response(HTML, {
       headers: { "content-type": "text/html; charset=utf-8" },
     });
   }
   ```

4. It creates/updates the val via the Val Town API
   (`POST /v1/vals`, then `PATCH /v1/vals/{id}`), named
   `ola-<artifact-name>` (and `open-legal-artifacts` for the playground).

## What gets deployed

| Val name | Source |
|---|---|
| `open-legal-artifacts` | `app/dist/` (inlined single file) — the centralized catalog |
| `ola-<artifact>` | each `open-artifacts/<artifact>/demo/index.html` |

## Notes

- Val code size limit is 80 KB per file; the inliner warns when a bundle
  exceeds it (base64 font ≈ 30 KB is the biggest fixed cost; drop the
  self-hosted Departure Mono and fall back to JetBrains Mono via CDN if a
  demo grows past the cap).
- The playground can also be served from `gh-pages` (already automated) —
  VT is the canonical host per project requirements, GH Pages the mirror.
