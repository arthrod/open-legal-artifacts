/**
 * venture-term-sheet-benchmark — deterministic core.
 *
 * Compares a venture financing term sheet's terms against an editable,
 * DATED market-standard grid (rules-as-data). Every verdict cites the
 * benchmark entry and its source — nothing is invented here: structural
 * enums follow the public NVCA Model Legal Documents as a baseline, and all
 * NUMERIC ranges ship as explicitly-labeled EXAMPLE defaults you must
 * replace with your own dated market data before relying on them.
 * No LLM, no network, no dependencies. Browser + Node ES module.
 *
 * @module core
 */

/**
 * The default grid. Shape:
 *   { asOf: 'YYYY-MM', sourceNote, rounds: { <round>: { <term>: entry } } }
 * entry = { kind:'range', min, max, unit?, source } | { kind:'enum', values, source }
 * source = { name, asOf }  — cited verbatim in every output.
 * @typedef {Object} BenchmarkGrid
 */
const SRC_NVCA = Object.freeze({ name: 'NVCA Model Legal Documents (public structural baseline, nvca.org)', asOf: '2026-01' });
const SRC_NVCA_EXAMPLE = Object.freeze({ name: 'NVCA structure + EXAMPLE numeric default — replace with dated market data', asOf: '2026-01' });
const SRC_EXAMPLE = Object.freeze({ name: 'EXAMPLE DEFAULT — not market data; replace with your own dated source', asOf: '2026-01' });

export const DEFAULT_GRID = Object.freeze({
  asOf: '2026-01',
  sourceNote: 'Structural enums follow the NVCA Model Legal Documents (public at nvca.org) as a STRUCTURE baseline only. All numeric ranges are EXAMPLE defaults for demonstration — replace them with your own dated market data (deal corpus or published surveys) before relying on any verdict.',
  rounds: Object.freeze({
    pre_seed: Object.freeze({
      liquidation_preference_multiple: rng(1, 1, 'x', SRC_NVCA_EXAMPLE),
      participation: enu(['non_participating'], SRC_NVCA),
      anti_dilution: enu(['broad_based_weighted_average', 'narrow_weighted_average', 'none'], SRC_NVCA),
      seniority: enu(['pari_passu'], SRC_NVCA),
      investor_board_seats: rng(0, 1, 'seats', SRC_EXAMPLE),
      dividends: enu(['none', 'non_cumulative'], SRC_NVCA),
      redemption: enu(['none'], SRC_NVCA),
      pro_rata_rights: enu(['granted_major_investors', 'granted_all'], SRC_NVCA),
      pay_to_play: enu(['none'], SRC_NVCA_EXAMPLE),
    }),
    seed: Object.freeze({
      liquidation_preference_multiple: rng(1, 1, 'x', SRC_NVCA_EXAMPLE),
      participation: enu(['non_participating'], SRC_NVCA),
      anti_dilution: enu(['broad_based_weighted_average', 'narrow_weighted_average'], SRC_NVCA),
      seniority: enu(['pari_passu'], SRC_NVCA),
      investor_board_seats: rng(0, 1, 'seats', SRC_EXAMPLE),
      dividends: enu(['none', 'non_cumulative'], SRC_NVCA),
      redemption: enu(['none'], SRC_NVCA),
      pro_rata_rights: enu(['granted_major_investors', 'granted_all'], SRC_NVCA),
      pay_to_play: enu(['none'], SRC_NVCA_EXAMPLE),
    }),
    series_a: Object.freeze({
      liquidation_preference_multiple: rng(1, 1, 'x', SRC_NVCA_EXAMPLE),
      participation: enu(['non_participating'], SRC_NVCA),
      anti_dilution: enu(['broad_based_weighted_average'], SRC_NVCA),
      seniority: enu(['pari_passu'], SRC_NVCA),
      investor_board_seats: rng(1, 2, 'seats', SRC_EXAMPLE),
      dividends: enu(['none', 'non_cumulative'], SRC_NVCA),
      redemption: enu(['none'], SRC_NVCA),
      pro_rata_rights: enu(['granted_major_investors'], SRC_NVCA),
      pay_to_play: enu(['none', 'present'], SRC_NVCA_EXAMPLE),
    }),
    series_b: Object.freeze({
      liquidation_preference_multiple: rng(1, 1.5, 'x', SRC_NVCA_EXAMPLE),
      participation: enu(['non_participating'], SRC_NVCA),
      anti_dilution: enu(['broad_based_weighted_average'], SRC_NVCA),
      seniority: enu(['pari_passu', 'senior_to_this_series_only'], SRC_NVCA),
      investor_board_seats: rng(1, 2, 'seats', SRC_EXAMPLE),
      dividends: enu(['none', 'non_cumulative'], SRC_NVCA),
      redemption: enu(['none'], SRC_NVCA),
      pro_rata_rights: enu(['granted_major_investors'], SRC_NVCA),
      pay_to_play: enu(['none', 'present'], SRC_NVCA_EXAMPLE),
    }),
  }),
});

/** @param {number} min @param {number} max @param {string} unit @param {{name:string,asOf:string}} src */
function rng(min, max, unit, src) { return { kind: 'range', min, max, unit, source: src }; }
/** @param {string[]} values @param {{name:string,asOf:string}} src */
function enu(values, src) { return { kind: 'enum', values: [...values], source: src }; }

/* ------------------------------------------------------------------ *
 * Comparison logic
 * ------------------------------------------------------------------ */

/**
 * Compare one term value against one benchmark entry.
 * @param {unknown} value
 * @param {{kind:'range',min:number,max:number,unit?:string,source:{name:string,asOf:string}}|
 *         {kind:'enum',values:string[],source:{name:string,asOf:string}}} entry
 * @returns {{verdict:'inside_market'|'outside_market'|'unknown_value_type', detail: string}}
 */
export function compareTerm(value, entry) {
  if (entry.kind === 'range') {
    const v = Number(value);
    if (!Number.isFinite(v)) return { verdict: 'unknown_value_type', detail: `Value ${JSON.stringify(value)} is not numeric; benchmark is a ${entry.min}–${entry.max} ${entry.unit ?? ''}range.` };
    if (v >= entry.min && v <= entry.max) return { verdict: 'inside_market', detail: `${v} ${entry.unit ?? ''}within ${entry.min}–${entry.max} ${entry.unit ?? ''}range.` };
    return { verdict: 'outside_market', detail: `${v} ${entry.unit ?? ''}is ${v > entry.max ? 'above' : 'below'} the ${entry.min}–${entry.max} ${entry.unit ?? ''}range.` };
  }
  if (entry.kind === 'enum') {
    const v = String(value);
    if (entry.values.includes(v)) return { verdict: 'inside_market', detail: `“${v}” is in the standard set (${entry.values.join(', ')}).` };
    return { verdict: 'outside_market', detail: `“${v}” is not in the standard set (${entry.values.join(', ')}).` };
  }
  return { verdict: 'unknown_value_type', detail: 'Unrecognized benchmark entry kind.' };
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
 *                 detail: string, benchmark: string, source: {name: string, asOf: string}|null}>,
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

  const out = [];
  for (const [name, value] of Object.entries(terms)) {
    const entry = roundGrid?.[name];
    if (!entry) {
      out.push({ name, value, verdict: 'no_benchmark', detail: 'No benchmark entry for this term in this round’s grid; add one rather than guessing.', benchmark: '—', source: null });
      continue;
    }
    const { verdict, detail } = compareTerm(value, entry);
    const benchmark = entry.kind === 'range' ? `${entry.min}–${entry.max} ${entry.unit ?? ''}`.trim() : entry.values.join(', ');
    out.push({ name, value, verdict, detail, benchmark, source: { ...entry.source } });
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
 * Merge a user grid over the default (shallow per round; a round key in the
 * user grid replaces that round entirely — explicit beats inherited).
 * @param {BenchmarkGrid} userGrid
 * @returns {BenchmarkGrid}
 */
export function withGrid(userGrid) {
  return { ...DEFAULT_GRID, ...userGrid, rounds: { ...DEFAULT_GRID.rounds, ...(userGrid?.rounds ?? {}) } };
}

/** Markdown report. @param {ReturnType<benchmarkTermSheet>} r */
export function exportMd(r) {
  const L = [];
  L.push(`# Term sheet benchmark — ${r.company || 'term sheet'} (${r.round}${r.vintage ? `, ${r.vintage}` : ''})`, '',
    `Benchmark grid as of **${r.gridAsOf}**. ${r.counts.inside_market} inside market · ${r.counts.outside_market} outside market · ${r.counts.no_benchmark} without benchmark.`, '',
    '| Term | Value | Verdict | Benchmark | Source |', '|---|---|---|---|---|');
  for (const t of r.terms) {
    L.push(`| ${t.name} | ${String(t.value)} | **${t.verdict}** | ${t.benchmark} | ${t.source ? `${t.source.name} (as of ${t.source.asOf})` : '—'} |`);
  }
  if (r.warnings.length) { L.push('', '## Warnings', ''); for (const w of r.warnings) L.push(`- ⚠ ${w}`); }
  L.push('', '---', '', `> ${r.sourceNote}`, '', '_Deterministic output of the open venture-term-sheet-benchmark. Not legal advice; verdicts describe distance from an editable grid, not deal quality._');
  return L.join('\n');
}
