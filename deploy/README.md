# Deploying Open Legal Artifacts to Val Town

Everything is deployed to Val Town as one multi-file val, **`arthrod/open-legal-artifacts`** (public):

**Live: <https://arthrod--4075ab70dae211f1929a1607ee4eb77e.web.val.run/>**

- `/` — the centralized catalog (landing page)
- `/a/<artifact-name>` — one self-contained page per artifact (33)
- `/open-artifacts/<name>/demo/index.html` — gh-pages-compatible alias of the same pages

## How it deploys (current, vt CLI)

The val is linked to the local folder `vt-val/` (see `.vt/state.json` inside it).

```bash
export PATH="$HOME/.deno/bin:$PATH"   # deno 2.9.8 + vt 0.1.59 installed on this machine, already authenticated

node deploy/build-site.mjs            # rebuilds app/, inlines landing + 33 demo pages into vt-val/site/
cd vt-val && vt push                  # pushes to Val Town (idempotent)
```

`vt-val/index.http.tsx` is the router (serves `/` and `/a/<name>` from `site/`).
`deploy/build-site.mjs` also injects the back-nav bar, disclaimer footer,
normalized H1 styles, and an auto-run-on-load script (so no page opens on a
"Press Run" placeholder).

## Fallback: API-based deploy without the CLI

`deploy/vt-deploy.mjs` deploys each page as its own http val via the Val Town
HTTP API (`VAL_TOWN_API_KEY`, https://www.val.town/settings/api):

```bash
export VAL_TOWN_API_KEY=...
node deploy/vt-deploy.mjs             # --dry lists targets without a key
```

It is **not the path in use** — the canonical deployment is the single val
above. Kept for environments where the `vt` CLI is unavailable.

## Notes

- Val file cap is 80 KB; the inliner warns past 75 KB (largest page is ~62 KB).
- GH Pages mirror of the same build: https://arthrod.github.io/open-legal-artifacts/
- `vt tail` (from `vt-val/`) streams live logs if a page misbehaves.
