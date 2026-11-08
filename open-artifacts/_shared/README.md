# _shared — canonical fleet modules (open-legal-artifacts)

Dependency-free ESM modules + `node:test` suites shared across the 33
artifact cores. Each module:

- **pure ESM, zero imports** (only ECMAScript builtins; `persist.js` lazy-
  imports `node:fs` inside its Node-only functions so the module still loads
  in browsers),
- **zero console side effects** (nothing logs at import or call time),
- **≤20 KB source** so single-file demos can vendor them and still fit the
  80 KB deploy cap,
- covered by adversarial `node:test` suites (dangerous URI schemes, formula
  injection, CJK/emoji names, 80-char ICS summaries, throwing localStorage).

## Modules

### hardening.js — `safeExternalUrl(s)`, `csvSafeEscape(v)`

- `safeExternalUrl(s)` → normalized absolute URL string or `null`.
  Allowlist: `http`/`https` only. Strips the control characters browsers
  ignore (`TAB`/`LF`/`CR`/C0) before parsing so `java\tscript:` cannot
  smuggle a scheme; relative and protocol-relative URLs are rejected
  (no base is supplied).
- `csvSafeEscape(v)` → one RFC 4180 CSV cell. Formula-injection guard:
  a leading `= + - @ TAB CR` gets a `'` prefix (never double-prefixed),
  then standard quoting rules (quote if `" , \n \r`; double embedded
  quotes). `null`/`undefined` → empty string.

### fuzzyname.js — `normalizeName(s)`, `similarity(a, b)`, `similarityReason(a, b)`

- `normalizeName`: NFKC → casefold (incl. `ß→ss`) → strip combining marks →
  keep `\p{L}\p{N}` tokens in any script (CJK/Cyrillic/Greek survive),
  drop punctuation/emoji and corporate suffix tokens (`Inc.`, `LLC`, …).
- `similarity(a, b)` → deterministic `[0,1]` = max of:
  whole-string edit ratio (length-gated so short single-char swaps like
  `J. Iwata` vs `K. Iwata` don't over-score), token alignment
  (exact 1.0 > nickname 0.95 > initial 0.9 > edit-distance ≥0.75),
  compact whitespace-free comparison (`田中 太郎` ≡ `田中太郎` → 1),
  and a containment bonus capped at 0.8 (all shorter-side tokens matched).
- `similarityReason(a, b)` → `{score, matchedVia}` where `matchedVia`
  traces every aligned pair with its kind (`exact|nickname|initial|edit`)
  — the audit trail for conflict-check UIs.
- Nicknames live in the small `NICKNAMES` data table (Bob→Robert,
  Bill→William, …); extend per domain, no code changes.

### icsutil.js — `icsEscapeText(s)`, `foldIcsLine(line)`, `buildVEvent(ev)`, `buildIcs(events, opts)`

- RFC 5545 TEXT escaping (`\\ \; \,` + literal `\n` for CR/LF).
- Folding: every physical line ≤75 UTF-8 octets, CRLF joined, single-space
  continuation prefix, never splits a multibyte code point (3-octet CJK,
  4-octet emoji).
- `buildVEvent({uid, dtStart, dtStamp?, summary?, description?,
  location?, url?})` accepts `YYYY-MM-DD`, `YYYYMMDD`, or
  `YYYY-MM-DDTHH:MM:SSZ`; **null** on invalid/missing dtStart — never a
  guessed event; an invalid `dtStamp` falls back to `dtStart`.
- `buildIcs(events, {prodId})` wraps events in `VCALENDAR`/`VEVENT` with
  CRLF everywhere and skips invalid events.

### persist.js — `appendLog(file, x)`, `loadLog(file)`, `createStorage(ns, opts)`

- `appendLog` / `loadLog` (async, Node-only): JSONL files; blank lines
  skipped; a malformed line throws with its 1-based line number — data is
  never silently dropped; missing file → `[]`. `appendLog` accepts one
  entry or a batch array.
- `createStorage(namespace, {backend: 'auto'|'local'|'memory'})` →
  `{get, set, remove, append, entries, exportJsonl, backendName}`.
  Probes localStorage with a real write before trusting it; falls back to
  an in-memory store when absent or throwing (privacy mode / quota hit,
  including degradation mid-session). After mid-session degradation,
  reads fall through to localStorage on memory misses (audit logs never
  vanish) and `backendName` reports `memory-fallback`. Keys are
  namespaced `ns:key`. `backendName` reports what's actually in use
  (`local` / `memory` / `memory-fallback`).
- **Known limitation — concurrent tabs:** there is no cross-tab sync.
  If quota degrades mid-session, the memory fallback is per-tab:
  writes after degradation are visible only in that tab (other tabs see
  the last localStorage snapshot) and are lost on reload. Treat
  degraded-mode storage as a cache, not a system of record — persist
  audit-critical logs with `appendLog` (Node) instead.

## Tests

```bash
cd open-artifacts/_shared && node --test    # 64 tests, fail=0
```

Suites pin the adversarial behaviors: `javascript:`/`data:`/control-char
scheme smuggling, `=cmd()`/`@SUM()`/TAB/CR CSV leaders, CJK spacing,
emoji, NFKC quirks (ﬁ, fullwidth), initials vs wrong initials, 80-char
summary folding, throwing localStorage, malformed JSONL, hostile XML
entities, truncated/zip64 archives, Excel-forbidden sheet names,
mid-session quota degradation.

## Vendoring (into an artifact)

1. Copy the module file(s) verbatim into the artifact's `core/` directory.
2. Add this provenance header comment at the top (keep it — byte-parity
   tests strip nothing):

   ```
   // Vendored from open-artifacts/_shared/<module>.js (commit-anchored).
   // Do not edit here — change the canonical module, then re-vendor.
   ```

3. Import locally: `import { safeExternalUrl } from './hardening.js';`
4. Copy the matching `.test.js` too and add a byte-parity test:

   ```js
   import test from 'node:test'; import assert from 'node:assert/strict';
   import { readFileSync } from 'node:fs';
   test('vendored hardening.js is byte-identical to canonical _shared', () => {
     const canon = readFileSync(new URL('../../../../_shared/hardening.js', import.meta.url), 'utf8');
     const vendored = readFileSync(new URL('./hardening.js', import.meta.url), 'utf8');
     assert.equal(vendored.replace(/^\/\/ Vendored[^\n]*\n\/\/ [^\n]*\n/, ''), canon);
   });
   ```

Cores stay dependency-free (node builtins only); demos that inline a
vendored module stay single-file and under the 80 KB cap (each module
≤20 KB, see sizes above; check with `wc -c`).

All example data in tests is fictional; real-source values, if ever added,
must carry `[verify]` tags per the fleet corpus rules.
