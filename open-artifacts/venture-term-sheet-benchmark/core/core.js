/**
 * venture-term-sheet-benchmark — deterministic core.
 *
 * Compares a venture financing term sheet's terms against an editable,
 * DATED market-standard grid (rules-as-data). Every verdict cites the
 * benchmark entry and its source — nothing is invented here: structural
 * enums follow the public NVCA Model Legal Documents as a baseline, and all
 * NUMERIC ranges (including optional p25/p50/p75 distribution bands) ship
 * as explicitly-labeled EXAMPLE defaults you must replace with your own
 * dated market data before relying on them.
 * No LLM, no network, no dependencies. Browser + Node ES module.
 *
 * @module core
 */

/**
 * The default grid. Shape:
 *   { asOf: 'YYYY-MM', sourceNote, rounds: { <round>: { <term>: entry } } }
 * entry = { kind:'range', min, max, unit?, p25?, p50?, p75?, favor?, source }
 *       | { kind:'enum', values, favor?, source }
 *       | { kind:'flag', values: boolean[], favor?, source }
 * source = { name, asOf }  — cited verbatim in every output.
 * favor  = 'investor' | 'company' | 'neutral' — which side off-market drift
 *          on this term favors (for ranges: drift ABOVE the range; falling
 *          below flips it). Emitted on outside_market rows only.
 * @typedef {Object} BenchmarkGrid
 */
const SRC_NVCA = Object.freeze({ name: 'NVCA Model Legal Documents (public structural baseline, nvca.org)', asOf: '2026-01' });
const SRC_NVCA_EXAMPLE = Object.freeze({ name: 'NVCA structure + EXAMPLE numeric default — replace with dated market data', asOf: '2026-01' });
const SRC_EXAMPLE = Object.freeze({ name: 'EXAMPLE DEFAULT — not market data; replace with your own dated source', asOf: '2026-01' });

/** Public NVCA model documents index — the per-term reference every row can cite. */
const NVCA_MODEL_DOCS_URL = 'https://nvca.org/model-legal-docs/';

/**
 * Per-term catalog: one-line definition + the public NVCA model-docs URL.
 * Definitions describe the standard concept only — no market claims.
 */
export const TERM_CATALOG = Object.freeze({
  liquidation_preference_multiple: Object.freeze({ url: NVCA_MODEL_DOCS_URL, definition: 'Multiple of the original purchase price repaid to preferred stock before common stock in a liquidation (NVCA Certificate of Incorporation).' }),
  participation: Object.freeze({ url: NVCA_MODEL_DOCS_URL, definition: 'Whether preferred stock also shares in remaining proceeds after its liquidation preference is paid.' }),
  anti_dilution: Object.freeze({ url: NVCA_MODEL_DOCS_URL, definition: 'Adjustment to the preferred conversion price when the company issues shares at a lower price (weighted-average vs full-ratchet forms).' }),
  seniority: Object.freeze({ url: NVCA_MODEL_DOCS_URL, definition: 'Ranking of this series’ liquidation preference relative to other preferred series (pari passu or senior).' }),
  investor_board_seats: Object.freeze({ url: NVCA_MODEL_DOCS_URL, definition: 'Board seats allocated to investors under the financing’s governance documents (NVCA Voting Agreement).' }),
  dividends: Object.freeze({ url: NVCA_MODEL_DOCS_URL, definition: 'Dividend on preferred stock: none, non-cumulative when declared, or accruing cumulative.' }),
  redemption: Object.freeze({ url: NVCA_MODEL_DOCS_URL, definition: 'Right of investors to require the company to repurchase their shares after a set period.' }),
  pro_rata_rights: Object.freeze({ url: NVCA_MODEL_DOCS_URL, definition: 'Right of investors to purchase a proportional share of a future round (NVCA Investor Rights Agreement).' }),
  pay_to_play: Object.freeze({ url: NVCA_MODEL_DOCS_URL, definition: 'Requirement that investors keep investing pro rata or lose senior preferred rights.' }),
  founder_vesting_restart: Object.freeze({ url: NVCA_MODEL_DOCS_URL, definition: 'Whether founder shares restart vesting at this round (NVCA Stock Purchase Agreement context).' }),
});

/**
 * NVCA structural vocabulary known beyond the default grid's per-round sets.
 * A value found here (or anywhere in the passed grid) is a REAL structure:
 * it scores outside_market against a narrower round entry, never a typo.
 */
const NVCA_KNOWN_VALUES = Object.freeze([
  'non_participating', 'participating',
  'broad_based_weighted_average', 'narrow_weighted_average', 'full_ratchet', 'none',
  'pari_passu', 'senior_to_this_series_only', 'senior_to_all_prior',
  'non_cumulative', 'cumulative',
  'investor_demand_after_5y',
  'granted_major_investors', 'granted_all',
  'present',
]);

export const DEFAULT_GRID = Object.freeze({
  asOf: '2026-01',
  sourceNote: 'Structural enums follow the NVCA Model Legal Documents (public at nvca.org) as a STRUCTURE baseline only. All numeric ranges and percentile bands are EXAMPLE defaults for demonstration — replace them with your own dated market data (deal corpus or published surveys) before relying on any verdict.',
  rounds: Object.freeze({
    pre_seed: Object.freeze({
      liquidation_preference_multiple: rng(1, 1, 'x', SRC_NVCA_EXAMPLE, { favor: 'investor' }),
      participation: enu(['non_participating'], SRC_NVCA, { favor: 'investor' }),
      anti_dilution: enu(['broad_based_weighted_average', 'narrow_weighted_average', 'none'], SRC_NVCA, { favor: 'investor' }),
      seniority: enu(['pari_passu'], SRC_NVCA, { favor: 'investor' }),
      investor_board_seats: rng(0, 1, 'seats', SRC_EXAMPLE, { bands: [0, 0, 1], favor: 'investor' }),
      dividends: enu(['none', 'non_cumulative'], SRC_NVCA, { favor: 'investor' }),
      redemption: enu(['none'], SRC_NVCA, { favor: 'investor' }),
      pro_rata_rights: enu(['granted_major_investors', 'granted_all'], SRC_NVCA, { favor: 'neutral' }),
      pay_to_play: enu(['none'], SRC_NVCA_EXAMPLE, { favor: 'company' }),
      founder_vesting_restart: flg([false], SRC_NVCA, { favor: 'investor' }),
    }),
    seed: Object.freeze({
      liquidation_preference_multiple: rng(1, 1, 'x', SRC_NVCA_EXAMPLE, { favor: 'investor' }),
      participation: enu(['non_participating'], SRC_NVCA, { favor: 'investor' }),
      anti_dilution: enu(['broad_based_weighted_average', 'narrow_weighted_average'], SRC_NVCA, { favor: 'investor' }),
      seniority: enu(['pari_passu'], SRC_NVCA, { favor: 'investor' }),
      investor_board_seats: rng(0, 1, 'seats', SRC_EXAMPLE, { bands: [0, 1, 1], favor: 'investor' }),
      dividends: enu(['none', 'non_cumulative'], SRC_NVCA, { favor: 'investor' }),
      redemption: enu(['none'], SRC_NVCA, { favor: 'investor' }),
      pro_rata_rights: enu(['granted_major_investors', 'granted_all'], SRC_NVCA, { favor: 'neutral' }),
      pay_to_play: enu(['none'], SRC_NVCA_EXAMPLE, { favor: 'company' }),
      founder_vesting_restart: flg([false], SRC_NVCA, { favor: 'investor' }),
    }),
    series_a: Object.freeze({
      liquidation_preference_multiple: rng(1, 1, 'x', SRC_NVCA_EXAMPLE, { favor: 'investor' }),
      participation: enu(['non_participating'], SRC_NVCA, { favor: 'investor' }),
      anti_dilution: enu(['broad_based_weighted_average'], SRC_NVCA, { favor: 'investor' }),
      seniority: enu(['pari_passu'], SRC_NVCA, { favor: 'investor' }),
      investor_board_seats: rng(1, 2, 'seats', SRC_EXAMPLE, { bands: [1, 1, 2], favor: 'investor' }),
      dividends: enu(['none', 'non_cumulative'], SRC_NVCA, { favor: 'investor' }),
      redemption: enu(['none'], SRC_NVCA, { favor: 'investor' }),
      pro_rata_rights: enu(['granted_major_investors'], SRC_NVCA, { favor: 'neutral' }),
      pay_to_play: enu(['none', 'present'], SRC_NVCA_EXAMPLE, { favor: 'company' }),
      founder_vesting_restart: flg([false], SRC_NVCA, { favor: 'investor' }),
    }),
    series_b: Object.freeze({
      liquidation_preference_multiple: rng(1, 1.5, 'x', SRC_NVCA_EXAMPLE, { bands: [1, 1, 1.5], favor: 'investor' }),
      participation: enu(['non_participating'], SRC_NVCA, { favor: 'investor' }),
      anti_dilution: enu(['broad_based_weighted_average'], SRC_NVCA, { favor: 'investor' }),
      seniority: enu(['pari_passu', 'senior_to_this_series_only'], SRC_NVCA, { favor: 'investor' }),
      investor_board_seats: rng(1, 2, 'seats', SRC_EXAMPLE, { bands: [1, 1, 2], favor: 'investor' }),
      dividends: enu(['none', 'non_cumulative'], SRC_NVCA, { favor: 'investor' }),
      redemption: enu(['none'], SRC_NVCA, { favor: 'investor' }),
      pro_rata_rights: enu(['granted_major_investors'], SRC_NVCA, { favor: 'neutral' }),
      pay_to_play: enu(['none', 'present'], SRC_NVCA_EXAMPLE, { favor: 'company' }),
      founder_vesting_restart: flg([false], SRC_NVCA, { favor: 'investor' }),
    }),
  }),
});

/**
 * @param {number} min @param {number} max @param {string} unit @param {{name:string,asOf:string}} src
 * @param {{bands?: [number,number,number], favor?: string}} [opts] p25/p50/p75 EXAMPLE bands + favor direction
 */
function rng(min, max, unit, src, opts = {}) {
  const e = { kind: 'range', min, max, unit, source: src };
  if (opts.bands) [e.p25, e.p50, e.p75] = opts.bands;
  if (opts.favor) e.favor = opts.favor;
  return e;
}
/** @param {string[]} values @param {{name:string,asOf:string}} src @param {{favor?: string}} [opts] */
function enu(values, src, opts = {}) {
  const e = { kind: 'enum', values: [...values], source: src };
  if (opts.favor) e.favor = opts.favor;
  return e;
}
/** @param {boolean[]} values @param {{name:string,asOf:string}} src @param {{favor?: string}} [opts] */
function flg(values, src, opts = {}) {
  const e = { kind: 'flag', values: [...values], source: src };
  if (opts.favor) e.favor = opts.favor;
  return e;
}

/* ------------------------------------------------------------------ *
 * Comparison logic
 * ------------------------------------------------------------------ */

/** favor for a value that moved ABOVE a range entry (below flips sides). */
function invertFavor(f) { return f === 'investor' ? 'company' : f === 'company' ? 'investor' : 'neutral'; }

/** Levenshtein edit distance — typo detection only, no fuzzy matching of verdicts. */
function editDistance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Band label for a value inside a banded range entry (EXAMPLE percentiles). */
function bandLabel(v, e) {
  if (v < e.p25) return 'below p25';
  if (v === e.p25) return 'at p25';
  if (v < e.p50) return 'p25–p50';
  if (v === e.p50) return 'at p50';
  if (v < e.p75) return 'p50–p75';
  if (v === e.p75) return 'at p75';
  return 'above p75';
}

/** Value with its unit for prose, e.g. `1.5 x` / `0.5` when unitless. */
function valueLabel(v, e) { return e.unit ? `${v} ${e.unit}` : `${v}`; }

/** Human range label: point ranges collapse to one value — `1 x`, never `1–1 x`. */
function rangeLabel(e) {
  const unit = e.unit ? ` ${e.unit}` : '';
  return e.min === e.max ? `${e.min}${unit}` : `${e.min}–${e.max}${unit}`;
}

/**
 * Compare one term value against one benchmark entry.
 * Vocabulary (optional, whole-grid + NVCA structural set) enables the typo
 * guard: a near-miss of a known value is unknown_value_type — never a false
 * off-market flag — and a value matching no vocabulary anywhere is likewise
 * not scored as off-market.
 *
 * @param {unknown} value
 * @param {{kind:'range',min:number,max:number,unit?:string,p25?:number,p50?:number,p75?:number,favor?:string,source:{name:string,asOf:string}}|
 *         {kind:'enum',values:string[],favor?:string,source:{name:string,asOf:string}}|
 *         {kind:'flag',values:boolean[],favor?:string,source:{name:string,asOf:string}}} entry
 * @param {string[]} [vocabulary]
 * @returns {{verdict:'inside_market'|'outside_market'|'unknown_value_type', detail: string, favor?: 'investor'|'company'|'neutral'}}
 */
export function compareTerm(value, entry, vocabulary = null) {
  if (entry.kind === 'range') {
    if (!Number.isFinite(entry.min) || !Number.isFinite(entry.max)) return { verdict: 'unknown_value_type', detail: 'Benchmark range entry has no finite bounds — fix the grid entry; nothing was guessed.' };
    if (entry.min > entry.max) return { verdict: 'unknown_value_type', detail: `Benchmark range entry is degenerate (min ${entry.min} > max ${entry.max}) — fix the grid entry; nothing was guessed.` };
    const v = Number(value);
    if (typeof value === 'boolean' || !Number.isFinite(v)) return { verdict: 'unknown_value_type', detail: `Value ${JSON.stringify(value)} is ${typeof value === 'boolean' ? 'a boolean' : 'not numeric'}; benchmark is a ${rangeLabel(entry)} range.` };
    if (v >= entry.min && v <= entry.max) {
      const band = Number.isFinite(entry.p25) && Number.isFinite(entry.p50) && Number.isFinite(entry.p75)
        ? ` — ${bandLabel(v, entry)} band (EXAMPLE percentiles — replace with your own dated data)` : '';
      return { verdict: 'inside_market', detail: `${valueLabel(v, entry)} is within the ${rangeLabel(entry)} range${band}.` };
    }
    const out = { verdict: 'outside_market', detail: `${valueLabel(v, entry)} is ${v > entry.max ? 'above' : 'below'} the ${rangeLabel(entry)} range.` };
    if (entry.favor) out.favor = v > entry.max ? entry.favor : invertFavor(entry.favor);
    return out;
  }
  if (entry.kind === 'enum') {
    const v = String(value);
    if (entry.values.includes(v)) return { verdict: 'inside_market', detail: `“${v}” is in the standard set (${entry.values.join(', ')}).` };
    if (vocabulary && !vocabulary.includes(v)) {
      let best = null, bestD = Infinity;
      for (const known of vocabulary) {
        const d = editDistance(v, known);
        if (d < bestD) { bestD = d; best = known; }
      }
      if (bestD <= 1) return { verdict: 'unknown_value_type', detail: `“${v}” matches no grid vocabulary anywhere — looks like a typo of “${best}”. Fix the value or extend the grid; not scored as off-market.` };
      return { verdict: 'unknown_value_type', detail: `“${v}” matches no vocabulary in the grid or the NVCA structural set (${vocabulary.slice(0, 8).join(', ')}…). Fix the value or extend the grid; not scored as off-market.` };
    }
    const out = { verdict: 'outside_market', detail: `“${v}” is not in the standard set (${entry.values.join(', ')}).` };
    if (entry.favor) out.favor = entry.favor;
    return out;
  }
  if (entry.kind === 'flag') {
    if (typeof value !== 'boolean') return { verdict: 'unknown_value_type', detail: `Flag benchmarks take booleans; got ${JSON.stringify(value)}.` };
    const standard = entry.values.map(String).join(', ');
    if (entry.values.includes(value)) return { verdict: 'inside_market', detail: `${value} is the standard setting (${standard}).` };
    const out = { verdict: 'outside_market', detail: `${value} is not the standard setting (${standard}).` };
    if (entry.favor) out.favor = entry.favor;
    return out;
  }
  return { verdict: 'unknown_value_type', detail: 'Unrecognized benchmark entry kind.' };
}

/** Union of every enum value in the grid + the NVCA structural set (typo-guard pool). */
function gridVocabulary(grid) {
  const vocab = [...NVCA_KNOWN_VALUES];
  for (const terms of Object.values(grid.rounds ?? {})) {
    for (const e of Object.values(terms)) if (e.kind === 'enum') vocab.push(...e.values);
  }
  return vocab;
}

/**
 * Benchmark a whole term sheet against a grid.
 *
 * @param {{term_sheet: {round: string, vintage?: number, company?: string, terms: Record<string, unknown>}}} input
 * @param {BenchmarkGrid} [grid] default DEFAULT_GRID; pass your own dated grid
 * @returns {{
 *   round: string, vintage: number|null, company: string,
 *   gridAsOf: string, sourceNote: string,
 *   terms: Array<{name: string, value: unknown, verdict: 'inside_market'|'outside_market'|'unknown_value_type'|'no_benchmark',
 *                 detail: string, benchmark: string, favor?: 'investor'|'company'|'neutral',
 *                 source: {name: string, asOf: string}|null}>,
 *   counts: {inside_market: number, outside_market: number, unknown_value_type: number, no_benchmark: number},
 *   warnings: string[]
 * }}
 */
export function benchmarkTermSheet(input, grid = DEFAULT_GRID) {
  const { round, vintage = null, company = '', terms = {} } = input?.term_sheet ?? {};
  const warnings = [];
  const roundGrid = grid.rounds?.[round];
  if (!roundGrid) {
    warnings.push(`No benchmark grid for round “${round}”. Available: ${Object.keys(grid.rounds ?? {}).join(', ')}. Nothing was guessed.`);
  }
  if (vintage && Number.isFinite(vintage)) {
    const gridYear = Number(grid.asOf.slice(0, 4));
    if (vintage > gridYear) warnings.push(`Term sheet vintage ${vintage} postdates the grid (as of ${grid.asOf}); refresh your market data before relying on numeric verdicts.`);
  }
  const vocabulary = gridVocabulary(grid);

  const out = [];
  for (const [name, value] of Object.entries(terms)) {
    const entry = roundGrid?.[name];
    if (!entry) {
      out.push({ name, value, verdict: 'no_benchmark', detail: 'No benchmark entry for this term in this round’s grid; add one rather than guessing.', benchmark: '—', source: null });
      continue;
    }
    const { verdict, detail, favor } = compareTerm(value, entry, vocabulary);
    const benchmark = entry.kind === 'range' ? rangeLabel(entry)
      : entry.kind === 'flag' ? entry.values.map(String).join(', ') : entry.values.join(', ');
    const row = { name, value, verdict, detail, benchmark, source: { ...entry.source } };
    if (verdict === 'outside_market' && favor) row.favor = favor;
    out.push(row);
  }

  const counts = { inside_market: 0, outside_market: 0, unknown_value_type: 0, no_benchmark: 0 };
  for (const t of out) counts[t.verdict]++;
  return {
    round: round ?? '(unspecified)', vintage, company,
    gridAsOf: grid.asOf, sourceNote: grid.sourceNote,
    terms: out, counts, warnings,
  };
}

/**
 * Merge a user grid over the default, PER ENTRY within each round: a term
 * key you supply replaces that term only; terms you omit are inherited.
 * A round key absent from the default starts a fresh round; grid-level
 * asOf/sourceNote override wholesale (explicit beats inherited).
 * @param {BenchmarkGrid} userGrid
 * @returns {BenchmarkGrid}
 */
export function withGrid(userGrid) {
  const rounds = { ...DEFAULT_GRID.rounds };
  for (const [round, entries] of Object.entries(userGrid?.rounds ?? {})) {
    rounds[round] = { ...(DEFAULT_GRID.rounds[round] ?? {}), ...entries };
  }
  return { ...DEFAULT_GRID, ...userGrid, rounds };
}

/** Verdict cell text with favor direction on outside rows. @param {{verdict: string, favor?: string}} t */
function verdictCell(t) {
  return t.verdict === 'outside_market' && t.favor && t.favor !== 'neutral'
    ? `**outside_market** (favors ${t.favor})` : `**${t.verdict}**`;
}

/** Markdown report. @param {ReturnType<benchmarkTermSheet>} r */
export function exportMd(r) {
  const L = [];
  L.push(`# Term sheet benchmark — ${r.company || 'term sheet'} (${r.round}${r.vintage ? `, ${r.vintage}` : ''})`, '',
    `Benchmark grid as of **${r.gridAsOf}**. ${r.counts.inside_market} inside market · ${r.counts.outside_market} outside market · ${r.counts.no_benchmark} without benchmark.`, '',
    '| Term | Value | Verdict | Benchmark | Source |', '|---|---|---|---|---|');
  for (const t of r.terms) {
    L.push(`| ${t.name} | ${String(t.value)} | ${verdictCell(t)} | ${t.benchmark} | ${t.source ? `${t.source.name} (as of ${t.source.asOf})` : '—'} |`);
  }
  const refd = [...new Set(r.terms.map((t) => t.name))].filter((n) => TERM_CATALOG[n]);
  if (refd.length) {
    L.push('', '## Term references', '');
    for (const n of refd) L.push(`- **${n}** — ${TERM_CATALOG[n].definition} ([NVCA model docs](${TERM_CATALOG[n].url}))`);
  }
  if (r.warnings.length) { L.push('', '## Warnings', ''); for (const w of r.warnings) L.push(`- ⚠ ${w}`); }
  L.push('', '---', '', `> ${r.sourceNote}`, '', '_Deterministic output of the open venture-term-sheet-benchmark. Not legal advice; verdicts describe distance from an editable grid, not deal quality._');
  return L.join('\n');
}

/** RFC-4180-ish CSV cell: quote on comma/quote/newline, double internal quotes. @param {unknown} x */
function csvCell(x) {
  const s = String(x ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV export: exactly one row per term. @param {ReturnType<benchmarkTermSheet>} r */
export function exportCsv(r) {
  const L = ['Term,Value,Verdict,Favor,Benchmark,Source,Detail'];
  for (const t of r.terms) {
    L.push([
      t.name,
      typeof t.value === 'boolean' || typeof t.value === 'number' ? t.value : t.value,
      t.verdict,
      t.favor ?? '',
      t.benchmark,
      t.source ? `${t.source.name} (as of ${t.source.asOf})` : '',
      t.detail,
    ].map(csvCell).join(','));
  }
  return L.join('\n');
}
