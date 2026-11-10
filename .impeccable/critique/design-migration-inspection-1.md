# Inspector — run 2fdfcfb8 participant 6

Evidence gathering is complete. Here is my inspection report.

---

# Final Completion Inspection — pfa Design Migration (open-legal-artifacts)

**Context:** I inspected `tmp/open-legal-artifacts` @ main `7895f40` (ref file `.git/refs/heads/main` = `7895f40d…`, reflog chain `983d596→7895f40` with the exact design commit message). I had **no exec and no live fetch** this run (`fetch_content` failed 3× on both hosts: `fetch_content_unavailable`), so bytes, git refs, on-disk build output, and one pixel-verified screenshot are my evidence. I did not implement any of this work.

## Per-claim verification

| # | Claim | My finding | Ruling |
|---|---|---|---|
| 1 | Reference unpacked at `tmp/pfa-design/` | Confirmed: 11 css files + 2 woff2 + 2 LICENSEs + README | VERIFIED |
| 2 | Planner + pushbacks recorded | `docs/plans-v4/design-migration.md` lines 3–4 record all four pushbacks (12px floor, `:focus-visible`, on-dark-dim, `--fs-body:18px`) — all four honored in `design/tokens.css` (`--fs-label/--fs-micro: 12px`, line 242 focus block, dim token documented "no demo may use it for body text") | VERIFIED |
| 3 | Canonical v3 = pfa DNA | `design/tokens.css`: Libre Franklin + Roboto Mono self-hosted `@font-face`, 5-value palette (`--ink:#0A0A0A`), `--mark:#FFD400` background-only with `--mark-text`, `--radius:0`, hard-offset `--lift: 7px 7px 0 var(--mark)`, `--page-max:1180px`, fluid clamp scale, `LEGACY ALIAS` layer resolving every v2 name (`--text→var(--ink)` etc., `--t-base: 0.2s ease` kept unaliased as planned) | VERIFIED |
| 4 | Fleet propagation, all 36 demos | All 33 `open-artifacts/*/demo/tokens.css` carry the v3 header at line 3, alias layer at line 93, `:focus-visible` at line 242 — identical line numbers across 33 files is strong byte-identity evidence (full byte-diff impossible without exec). All 3 `artifacts/` originals (client-intake, contracts-playbook, pii-ptbr-lgpd) match too; `prompting-for-attorneys` correctly left as the donor. **Zero** `Manrope\|Departure` in `open-artifacts/` and `app/`; remaining refs only in the donor project, the plan text, and `artifacts/client-intake/lab/` (pre-existing dev sandbox — **not shipped**: `deploy/build-site.mjs` ships only `demo/index.html` per root) | VERIFIED |
| 5 | tabular-review dark rebased | `tabular-review/demo/tokens.css` = canonical + `LOCAL` block at line 253 rebasing dark onto `--ink:#f2f2ee`/`--muted`/`--faint`, with `prefers-color-scheme` and `data-theme="dark"` both kept | VERIFIED |
| 6 | Guard test 8/8 red-first | `tests/design-tokens.test.mjs` exists with exactly 8 tests incl. the strengthened clamp-floor regex. **I could not execute it**; instead I re-derived its assertions on the bytes — every one I could check holds (fonts present, no old fonts, floors ≥12px, focus-visible, status tokens, alias resolution, fonts dirs = exactly 2 woff2 + 2 LICENSEs — spot-checked `cite-check`) | VERIFIED-BY-PROXY |
| 7 | Deployed: 37 files, no phone-home | `vt-val/site/` holds exactly 37 HTML files; **zero** `@font-face` and zero `fonts.googleapis` across all 37. Landing `app/` self-hosts both woff2 (`public/fonts/` + `dist/fonts/`) with no CDN link | VERIFIED (bytes) |
| 8 | gh-pages mirror cbcf403 | `.git/refs/heads/gh-pages` = `cbcf403f…`, reflog: "Mirror: pfa design system — Libre Franklin + Roboto Mono fleet-wide, landing fix", 25s after the main commit | VERIFIED |
| 9 | Visual gate findings fixed | Pixel-verified `tmp/shots/trackB/tabular-review.png` via vision analysis: dark theme, bold sans headings, mono uppercase labels, yellow used **as fill** (not text — the gate fix held), square corners. 17+ screenshots archived. Landing screenshot analysis failed on a transient parse error — landing verified by bytes only | PARTIALLY VERIFIED |
| 10 | Nothing renamed | 33 + 3 artifact directory names unchanged across the reflog's history; deployed filenames match source dirs | VERIFIED |
| 11 | **Suites: 809 JS + 130 TS + 123 _shared + 8 guard, 0 fail** | **NOT VERIFIED.** `evidence/test-run.log`'s last entry is 2026-11-08T23:06Z — **predates the migration commit** (2026-11-10) — and shows different totals (873/890 JS, 64 _shared). No archived post-migration suite output exists anywhere in the repo. The claim is a summary with no artifact | **UPHELD** |
| 12 | VT live, fonts/CSS 200 | `fetch_content` unavailable this run — 3 attempts, both hosts. Liveness rests on the reflog + on-disk build output, not on a live observation | NOT INDEPENDENTLY VERIFIED |

## Mandatory rulings

| Axis | Ruling | Evidence |
| --- | --- | --- |
| 1. Actually completed? | **RETRACTED (complete)** — with one unproven claim | main `7895f40` + gh-pages `cbcf403` reflog entries with exact messages; `design/tokens.css` v3 bytes; fleet-wide markers at identical lines 3/93/242 across 33+3 demos; `vt-val/site` 37 pages, zero `@font-face`/CDN; tabular-review.png pixel-verified dark theme with yellow-as-fill. Sole exception: the post-migration test-suite claim (row 11) has no artifact |
| 2. Only partial? | **PARTIAL** | No missing scope items in the deliverable itself — every design-system element the user's request implies is present in bytes. The partiality is evidentiary: (a) claimed suite run (809+130+123+8, 0 fail) unarchived while `evidence/test-run.log` sits stale at 2026-11-08 with different totals; (b) live-URL/200-status receipts from this wave not archived either. Non-blocking observations: `artifacts/client-intake/lab/tokens.css` still carries the pre-migration stack (Departure fallback, 10.5px micro) — dev sandbox, not shipped, but inside the repo; VT pages render system-font fallback by policy (declared honestly) |
| 3. Intent achieved? | **ACHIEVED** | User's verbatim words: "unpack prompting-for-attorneys.zip… update the open legal artifacts to use that design choice (dont change its name)". The zip is unpacked (`tmp/pfa-design/`), its typography/spacing/color DNA is the canonical system inherited by all 36 demos + landing, and no artifact or file was renamed. Caveat: on the VT host the literal font *faces* render only as system fallbacks (80KB single-file cap policy) — real Libre Franklin/Roboto Mono render on gh-pages and locally |

## Final verdict: **BLOCKED — PARTIAL**

The migration itself is done and byte-verified; what blocks DONE is one specific, cheap-to-close item: **the claimed post-migration test-suite run has no archived artifact** (row 11), and the stale `evidence/test-run.log` actively misrepresents the evidence state. Remediation to reach DONE OVER OBJECTION:

1. Run the suites + guard test and **append the dated output** to `evidence/test-run.log` (or archive a new log), then commit.
2. Optionally: archive one live receipt from the val and gh-pages (curl status lines) to cover rows 9 (landing visual) and 12.

Neither requires touching the deliverable. If those receipts land green, all three disagreements retract under evidence and I would rule DONE OVER OBJECTION on the next pass.