// Design-tokens guard test — design migration wave 1 (pfa DNA, tokens v3).
// Run: node --test tests/design-tokens.test.mjs
//
// Asserts the invariants of the migrated design system:
//   1. canonical design/tokens.css + every pristine demo copy are byte-identical
//   2. tabular-review carries the v3 base (canonical is a byte-prefix) plus its
//      LOCAL dark-mode additions rebased onto the new token names
//   3. zero Manrope / Departure Mono font-family refs in any demo html or css
//   4. Libre Franklin + Roboto Mono @font-face present in every tokens.css
//   5. every demo fonts/ dir holds exactly the 2 woff2 + 2 LICENSE files
//   6. a11y floors: no --fs-* below 12px, :focus-visible present, status tokens kept
//   7. legacy alias layer present and resolves each old name to var(--new)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OA = join(ROOT, 'open-artifacts');
const CANONICAL = join(ROOT, 'design', 'tokens.css');
const DIVERGENT = 'tabular-review'; // the only demo with a merged local block

const demoDirs = readdirSync(OA).filter((e) => statSync(join(OA, e)).isDirectory());
const canonical = readFileSync(CANONICAL, 'utf8');

function demoTokens(name) {
  return readFileSync(join(OA, name, 'demo', 'tokens.css'), 'utf8');
}

test('canonical tokens.css is the v3 system (pfa marker + fonts + aliases)', () => {
  assert.match(canonical, /Libre Franklin/, 'Libre Franklin family present');
  assert.match(canonical, /Roboto Mono/, 'Roboto Mono family present');
  assert.match(canonical, /--ink:\s*#0A0A0A/, 'pfa core palette (ink) present');
  assert.match(canonical, /LEGACY ALIAS/, 'alias layer marker present');
});

test('every pristine demo copy is byte-identical to the canonical tokens.css', () => {
  const pristine = demoDirs.filter((d) => d !== DIVERGENT && d !== '_shared');
  assert.ok(pristine.length >= 30, `expected ~32 pristine demos, found ${pristine.length}`);
  for (const d of pristine) {
    const p = join(OA, d, 'demo', 'tokens.css');
    assert.ok(existsSync(p), `${d}/demo/tokens.css exists`);
    assert.equal(readFileSync(p, 'utf8'), canonical, `${d}/demo/tokens.css differs from design/tokens.css`);
  }
});

test('tabular-review = v3 base + LOCAL dark additions on new token names', () => {
  const t = demoTokens(DIVERGENT);
  assert.ok(t.startsWith(canonical), 'canonical v3 must be a byte-prefix of the tabular copy');
  assert.match(t, /LOCAL/i, 'LOCAL block marker present');
  assert.match(t, /--ink:\s*#f2f2ee/, 'dark mode rebased onto --ink');
  assert.match(t, /--muted:\s*#9a9a94/, 'dark mode rebased onto --muted');
  assert.match(t, /--faint:\s*#2c2c29/, 'dark mode rebased onto --faint');
  assert.match(t, /prefers-color-scheme: dark/, 'auto dark via prefers-color-scheme kept');
  assert.match(t, /data-theme="dark"/, 'manual [data-theme] override kept');
});

test('zero Manrope / Departure Mono refs in demo html and css', () => {
  for (const d of demoDirs) {
    if (d === '_shared') continue;
    const demoDir = join(OA, d, 'demo');
    for (const f of readdirSync(demoDir)) {
      if (!/\.(html|css)$/.test(f)) continue;
      const src = readFileSync(join(demoDir, f), 'utf8');
      assert.doesNotMatch(src, /Manrope|Departure/, `${d}/demo/${f} still references the old fonts`);
    }
  }
});

test('Libre Franklin + Roboto Mono @font-face in every demo tokens.css', () => {
  for (const d of demoDirs) {
    if (d === '_shared') continue;
    const t = demoTokens(d);
    assert.match(t, /font-family:\s*"Libre Franklin"/, `${d}: Libre Franklin @font-face missing`);
    assert.match(t, /font-family:\s*"Roboto Mono"/, `${d}: Roboto Mono @font-face missing`);
    assert.match(t, /url\("fonts\/libre-franklin\.woff2"\)/, `${d}: libre-franklin.woff2 src missing`);
    assert.match(t, /url\("fonts\/roboto-mono\.woff2"\)/, `${d}: roboto-mono.woff2 src missing`);
  }
});

test('every demo fonts/ dir has exactly 2 woff2 + 2 LICENSE files', () => {
  for (const d of demoDirs) {
    if (d === '_shared') continue;
    const fonts = readdirSync(join(OA, d, 'demo', 'fonts')).sort();
    assert.deepEqual(
      fonts,
      ['LICENSE-libre-franklin.txt', 'LICENSE-roboto-mono.txt', 'libre-franklin.woff2', 'roboto-mono.woff2'],
      `${d}/demo/fonts has unexpected contents`
    );
  }
});

test('a11y floors and kept blocks in every demo tokens.css', () => {
  for (const d of demoDirs) {
    if (d === '_shared') continue;
    const t = demoTokens(d);
    // no --fs-* token below the 12px floor (covers plain px AND clamp() minimums)
    for (const m of t.matchAll(/--fs-[\w-]+:\s*(?:clamp\()?([\d.]+)px/g)) {
      assert.ok(Number(m[1]) >= 12, `${d}: ${m[0]} is below the 12px floor`);
    }
    assert.match(t, /:focus-visible/, `${d}: focus-visible block missing`);
    for (const s of ['--ok', '--warn', '--bad', '--flag-tint']) {
      assert.match(t, new RegExp(s.replace(/-/g, '\\-') + '\\s*:'), `${d}: status token ${s} missing`);
    }
  }
});

test('compliance wave 1: selected toggles are ink at rest, never accent fill', () => {
  // accent-at-rest heuristic: an aria-pressed="true" selector must not fill var(--accent)
  for (const d of demoDirs) {
    if (d === '_shared') continue;
    const demoDir = join(OA, d, 'demo');
    for (const f of readdirSync(demoDir)) {
      if (!/\.(html|css)$/.test(f)) continue;
      const src = readFileSync(join(demoDir, f), 'utf8');
      assert.doesNotMatch(
        src,
        /aria-pressed="true"\]\s*\{[^}]*background:\s*var\(--accent\)/,
        `${d}/demo/${f}: selected toggle fills the accent at rest (spec: selected = ink fill, bg text)`
      );
    }
  }
});

test('compliance wave 1: no accent left/top border stripes in demos', () => {
  // decorative edge stripes in the accent are an anti-pattern; encode via ink
  // structural border + status chip instead. Catches literal px widths,
  // var()-indirected widths (e.g. var(--tile-stripe)), and inset-shadow forms.
  for (const d of demoDirs) {
    if (d === '_shared') continue;
    const demoDir = join(OA, d, 'demo');
    for (const f of readdirSync(demoDir)) {
      if (!/\.(html|css)$/.test(f)) continue;
      const src = readFileSync(join(demoDir, f), 'utf8');
      assert.doesNotMatch(
        src,
        /border-(left|top):\s*(?:\d+px|var\(--[\w-]+\))\s+solid\s+var\(--accent\)/,
        `${d}/demo/${f}: accent border stripe (anti-pattern: coloured edge stripe)`
      );
      assert.doesNotMatch(
        src,
        /box-shadow:\s*inset\s+\d+px\s+0\s+0\s+var\(--accent\)/,
        `${d}/demo/${f}: inset accent shadow stripe (anti-pattern: coloured edge stripe)`
      );
    }
  }
});

test('compliance wave 1: --muted-strong reading token in canonical and every copy', () => {
  // reading-mode secondary text on paper/faint: --muted on --faint is 4.3:1 (fails AA)
  assert.match(canonical, /--muted-strong:\s*#4A4A47/, 'canonical tokens.css: --muted-strong #4A4A47 missing');
  for (const d of demoDirs) {
    if (d === '_shared') continue;
    assert.match(demoTokens(d), /--muted-strong:\s*#4A4A47/, `${d}: --muted-strong #4A4A47 missing`);
  }
});

test('legacy alias layer: each old name resolves to var(--new)', () => {
  const aliases = {
    '--text': '--ink',
    '--text-secondary': '--muted',
    '--accent': '--mark',
    '--border': '--faint',
    '--hover': '--surface',
    '--font-mono': '--mono',
    '--max-width': '--page-max',
  };
  for (const [oldName, newName] of Object.entries(aliases)) {
    const re = new RegExp(oldName.replace(/-/g, '\\-') + '\\s*:\\s*var\\(' + newName.replace(/-/g, '\\-') + '\\)');
    assert.match(canonical, re, `alias ${oldName} → var(${newName}) missing`);
  }
  assert.match(canonical, /--font-body:\s*var\(--ff\)/, 'alias --font-body → var(--ff) missing');
  assert.match(canonical, /--hairline:\s*1px solid var\(--faint\)/, 'alias --hairline missing');
  assert.match(canonical, /--t-base:\s*0\.2s ease/, '--t-base kept at .2s ease');
});

test('compliance wave 2: no raw sub-12px font-size in demo CSS', () => {
  for (const d of demoDirs) {
    if (d === '_shared') continue;
    const demoDir = join(OA, d, 'demo');
    for (const f of readdirSync(demoDir)) {
      if (!/\.(html|css)$/.test(f)) continue;
      const src = readFileSync(join(demoDir, f), 'utf8');
      for (const m of src.matchAll(/font-size:\s*([\d.]+)px/g)) {
        assert.ok(Number(m[1]) >= 12, `${d}/demo/${f}: ${m[0]} is below the 12px floor`);
      }
    }
  }
});

test('compliance wave 2: no muted text on faint/surface fills (paired rule)', () => {
  // the known pairing patterns: a selector setting color:var(--text-secondary|--muted) together with
  // a background of var(--hover|--faint|--flag-tint) in the same rule
  for (const d of demoDirs) {
    if (d === '_shared') continue;
    const demoDir = join(OA, d, 'demo');
    for (const f of readdirSync(demoDir)) {
      if (!/\.(html|css)$/.test(f)) continue;
      const src = readFileSync(join(demoDir, f), 'utf8');
      for (const rule of src.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
        const body = rule[2];
        const muted = /color:\s*var\(--(text-secondary|muted)\)/.test(body);
        const fill = /background(?:-color)?:\s*var\(--(hover|faint|flag-tint|surface)\)/.test(body);
        if (muted && fill) {
          assert.fail(`${d}/demo/${f}: rule '${rule[1].trim().slice(0, 60)}' puts muted text on a faint fill (contrast <4.5:1) — use --muted-strong or ink`);
        }
      }
    }
  }
});

test('compliance wave 2: --hatch texture token present in canonical and every copy', () => {
  const canon = readFileSync(join(ROOT, 'design', 'tokens.css'), 'utf8');
  assert.match(canon, /--hatch:\s*repeating-linear-gradient/);
  for (const d of demoDirs) {
    if (d === '_shared') continue;
    assert.match(demoTokens(d), /--hatch:/, `${d}: --hatch token missing from its tokens.css`);
  }
});
