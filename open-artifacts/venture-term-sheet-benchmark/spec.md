# venture-term-sheet-benchmark — spec

Open counterpart of Wilson Sonsini's "Venture term sheet benchmark"
(Claude for Legal partner gallery; catalog §3.5). WSGR's moat is its deal
corpus; an open version's honesty is its grid: every benchmark value is
**dated, sourced, and editable**, and terms without a benchmark entry are
flagged rather than guessed.

## What it does

Input a term sheet's terms as JSON (round + vintage + term map); compare
each term against an editable market grid; output a per-term verdict:

- `inside_market` — value within the grid entry (range or enum);
- `outside_market` — value outside it, with direction for ranges (above/
  below) and the standard set for enums;
- `unknown_value_type` — e.g. a non-numeric value against a numeric range —
  never guessed;
- `no_benchmark` — term has no grid entry this round; you add one, the tool
  doesn't invent one.

Every verdict row cites its benchmark entry's `source: {name, asOf}`.

### Sourcing discipline (the whole point)

- **Structural enums** (participation, anti-dilution, seniority, dividends,
  redemption, pro-rata, pay-to-play) follow the public **NVCA Model Legal
  Documents** as a structure baseline — cited as such, not as market data.
- **Numeric ranges** (liquidation multiple, board seats) ship as loudly
  labeled `EXAMPLE DEFAULT — replace with your own dated market data`.
  The tool never presents them as market truth; swap in your deal corpus or
  a dated survey via `withGrid()`.
- A term sheet whose vintage postdates the grid gets a staleness warning.

## IO contract

```js
import { benchmarkTermSheet, exportMd, withGrid } from './core/core.js';
const result = benchmarkTermSheet({
  term_sheet: { round: 'series_a', vintage: 2026, company: '…',
                terms: { liquidation_preference_multiple: 1.5, anti_dilution: 'full_ratchet', … } },
});
const custom = withGrid({ rounds: { seed: { /* your dated entries */ } } });
benchmarkTermSheet(input, custom);
```

Errors: none thrown for data issues — data problems become `verdict`s and
warnings; only programmer errors (missing `term_sheet`) surface in output
fields.

## Deterministic vs LLM-assisted

| Part | Owner |
|---|---|
| Grid entries, sources, dates | rules-as-data (editable; `withGrid` merges per round) |
| Verdicts, direction, staleness checks, MD export | deterministic code |
| Parsing a PDF term sheet into the terms JSON | LLM-assisted (optional capture step) |

### LLM prompt schema (optional capture step)

```
Extract terms from this term sheet into strict JSON. Use ONLY the exact
controlled vocabulary given per term; if the document's wording does not
clearly match a vocabulary value, output null for that term — never map an
ambiguous provision to a category. Schema: { "term_sheet": { "round":
"pre_seed"|"seed"|"series_a"|"series_b", "vintage": <year>, "company": "",
"terms": { "liquidation_preference_multiple": <number|null>,
"participation": "non_participating"|"participating"|null, … } } }.
Vocabulary: <enum values from the grid>.
```

Verdict computation stays in code; an LLM never decides what is "market".

## What's better than the closed counterpart

1. **No hidden data moat** — the grid is visible, dated, and swappable;
   WSGR's comparisons ride an inaccessible deal base.
2. **Honest uncertainty** — `no_benchmark` and `unknown_value_type` exist;
   nothing is silently classified.
3. **Staleness is a feature** — vintage-vs-grid-date warnings force the
   time-sensitivity of market data to the surface.
4. **NVCA-grounded structure** — enum baselines point at the public model
   docs rather than a firm's internal norms.

## Legal accuracy notes

Verdicts measure distance from an editable grid — they are not deal advice
and "outside market" is not "bad." Example ranges are fictional defaults
for demo; replace before real use. Not legal advice.
