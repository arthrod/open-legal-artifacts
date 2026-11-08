/** Tests for venture-term-sheet-benchmark core. Run: node --test "core/*.test.js" */ import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkTermSheet, compareTerm, exportCsv, exportMd, withGrid, DEFAULT_GRID, TERM_CATALOG } from './core.js';

describe('compareTerm', () => {
  test('range: inside and outside with direction', () => {
    const e = { kind: 'range', min: 1, max: 1, unit: 'x', source: { name: 's', asOf: '2026-01' } };
    assert.equal(compareTerm(1, e).verdict, 'inside_market');
    assert.equal(compareTerm(2, e).verdict, 'outside_market');
    assert.match(compareTerm(2, e).detail, /above/);
    assert.match(compareTerm(0.5, e).detail, /below/);
  });
  test('range: non-numeric value is unknown_value_type, never guessed', () => {
    const e = { kind: 'range', min: 1, max: 2, unit: 'seats', source: { name: 's', asOf: '2026-01' } };
    assert.equal(compareTerm('two', e).verdict, 'unknown_value_type');
  });
  test('enum: membership decides', () => {
    const e = { kind: 'enum', values: ['pari_passu'], source: { name: 's', asOf: '2026-01' } };
    assert.equal(compareTerm('pari_passu', e).verdict, 'inside_market');
    assert.equal(compareTerm('senior_to_all', e).verdict, 'outside_market');
    assert.match(compareTerm('senior_to_all', e).detail, /pari_passu/);
  });
  test('range with distribution bands states the band in the detail, labeled EXAMPLE', () => {
    const e = { kind: 'range', min: 0, max: 3, p25: 0.5, p50: 1, p75: 1.5, unit: 'x', source: { name: 's', asOf: '2026-01' } };
    const hi = compareTerm(2, e);
    assert.equal(hi.verdict, 'inside_market');
    assert.match(hi.detail, /above p75/);
    assert.match(hi.detail, /EXAMPLE/);
    assert.match(compareTerm(0.75, e).detail, /p25–p50/);
    assert.match(compareTerm(1, e).detail, /at p50/);
  });
  test('flag kind: boolean terms get real verdicts', () => {
    const e = { kind: 'flag', values: [false], source: { name: 's', asOf: '2026-01' } };
    assert.equal(compareTerm(false, e).verdict, 'inside_market');
    const out = compareTerm(true, e);
    assert.equal(out.verdict, 'outside_market');
    assert.match(out.detail, /false/);
    assert.equal(compareTerm('yes', e).verdict, 'unknown_value_type');
  });
});

describe('benchmarkTermSheet', () => {
  test('typical series_a sheet: mixed verdicts with cited sources', () => {
    const r = benchmarkTermSheet({ term_sheet: {
      round: 'series_a', vintage: 2026, company: 'Fictional Co',
      terms: {
        liquidation_preference_multiple: 1,
        participation: 'non_participating',
        anti_dilution: 'full_ratchet',
        seniority: 'pari_passu',
        investor_board_seats: 2,
        dividends: 'non_cumulative',
        redemption: 'none',
        pro_rata_rights: 'granted_major_investors',
        pay_to_play: 'none',
      },
    } });
    assert.equal(r.counts.outside_market, 1);
    assert.equal(r.counts.inside_market, 8);
    const ad = r.terms.find((t) => t.name === 'anti_dilution');
    assert.equal(ad.verdict, 'outside_market');
    assert.ok(ad.source.name.length > 0 && ad.source.asOf.length > 0);
  });
  test('term absent from the grid gets no_benchmark, not a guess', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'seed', terms: { founder_vesting_cliff_months: 12 } } });
    assert.equal(r.counts.no_benchmark, 1);
    assert.match(r.terms[0].detail, /add one rather than guessing/);
  });
  test('unknown round warns and scores nothing', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'series_z', terms: { dividends: 'none' } } });
    assert.equal(r.counts.no_benchmark, 1);
    assert.ok(r.warnings.some((w) => /No benchmark grid/.test(w) && w.includes('seed')));
  });
  test('vintage postdating the grid triggers a staleness warning', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'seed', vintage: 2027, terms: {} } });
    assert.ok(r.warnings.some((w) => /postdates/.test(w)));
  });
  test('withGrid merges per entry: override one term, keep the rest of the round', () => {
    const custom = withGrid({ rounds: { seed: { dividends: { kind: 'enum', values: ['cumulative'], source: { name: 'My 2026 deal corpus', asOf: '2026-06' } } } } });
    const r = benchmarkTermSheet({ term_sheet: { round: 'seed', terms: { dividends: 'non_cumulative', anti_dilution: 'broad_based_weighted_average' } } }, custom);
    assert.equal(r.counts.outside_market, 1); // dividends against the user's entry
    const ad = r.terms.find((t) => t.name === 'anti_dilution');
    assert.equal(ad.verdict, 'inside_market'); // retained from the default round
    assert.match(ad.source.name, /NVCA/);
    // other rounds still default
    const r2 = benchmarkTermSheet({ term_sheet: { round: 'series_a', terms: { dividends: 'non_cumulative' } } }, custom);
    assert.equal(r2.counts.inside_market, 1);
  });
  test('every default grid entry carries a named, dated source', () => {
    for (const [round, terms] of Object.entries(DEFAULT_GRID.rounds)) {
      for (const [name, e] of Object.entries(terms)) {
        assert.ok(e.source && e.source.name.length > 3 && /^\d{4}-\d{2}$/.test(e.source.asOf), `${round}.${name}`);
      }
    }
  });
  test('typo guard: a near-miss enum value is unknown_value_type, never a false off-market', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'series_a', terms: { participation: 'participatng' } } });
    assert.equal(r.counts.unknown_value_type, 1);
    assert.equal(r.counts.outside_market, 0);
    assert.match(r.terms[0].detail, /participating/); // suggested correction
  });
  test('typo guard: a recognized but nonstandard value still scores outside_market', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'series_a', terms: { participation: 'participating' } } });
    assert.equal(r.counts.outside_market, 1);
    assert.equal(r.counts.unknown_value_type, 0);
  });
  test('typo guard: a value matching no vocabulary anywhere is unknown_value_type', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'series_a', terms: { dividends: 'payable_in_gold' } } });
    assert.equal(r.counts.unknown_value_type, 1);
    assert.match(r.terms[0].detail, /no vocabulary/i);
  });
  test('outside rows carry favor direction', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'series_a', terms: { anti_dilution: 'full_ratchet', investor_board_seats: 5 } } });
    const ad = r.terms.find((t) => t.name === 'anti_dilution');
    assert.equal(ad.verdict, 'outside_market');
    assert.equal(ad.favor, 'investor'); // full ratchet drift favors investors
    const seats = r.terms.find((t) => t.name === 'investor_board_seats');
    assert.equal(seats.verdict, 'outside_market');
    assert.equal(seats.favor, 'investor'); // above the range
    const low = benchmarkTermSheet({ term_sheet: { round: 'series_a', terms: { investor_board_seats: 0 } } });
    assert.equal(low.terms[0].verdict, 'outside_market');
    assert.equal(low.terms[0].favor, 'company'); // below the range favors the company
  });
  test('boolean term with a flag entry scores a real verdict (founder_vesting_restart)', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'seed', terms: { founder_vesting_restart: true } } });
    assert.equal(r.counts.outside_market, 1);
    assert.equal(r.terms[0].favor, 'investor'); // restarting founder vesting favors investors
    const r2 = benchmarkTermSheet({ term_sheet: { round: 'seed', terms: { founder_vesting_restart: false } } });
    assert.equal(r2.counts.inside_market, 1);
  });
  test('every default grid term has a TERM_CATALOG entry with an NVCA url and definition', () => {
    const names = new Set();
    for (const terms of Object.values(DEFAULT_GRID.rounds)) for (const n of Object.keys(terms)) names.add(n);
    assert.ok(names.size >= 10);
    for (const n of names) {
      assert.ok(TERM_CATALOG[n], `missing catalog entry for ${n}`);
      assert.match(TERM_CATALOG[n].url, /^https:\/\/nvca\.org\//, n);
      assert.ok(TERM_CATALOG[n].definition.length > 10, n);
    }
  });
});

describe('exportMd', () => {
  test('report cites benchmark + source per term and carries disclaimers', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'series_a', vintage: 2026, company: 'Fictional Co', terms: { anti_dilution: 'full_ratchet', liquidation_preference_multiple: 1 } } });
    const md = exportMd(r);
    assert.ok(md.includes('| Term | Value | Verdict | Benchmark | Source |'));
    assert.ok(md.includes('NVCA'));
    assert.ok(md.includes('outside_market'));
    assert.ok(md.includes('replace'));
    assert.ok(md.includes('Not legal advice'));
  });
  test('report renders favor direction and a per-term NVCA reference section', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'series_a', terms: { anti_dilution: 'full_ratchet' } } });
    const md = exportMd(r);
    assert.match(md, /favors investor/);
    assert.match(md, /## Term references/);
    assert.match(md, /\[NVCA model docs\]\(https:\/\/nvca\.org\//);
    assert.match(md, /anti_dilution/);
  });
});

describe('exportCsv', () => {
  test('emits exactly one row per term, with quoted cells', () => {
    const r = benchmarkTermSheet({ term_sheet: { round: 'series_a', terms: { anti_dilution: 'full_ratchet', dividends: 'non_cumulative', liquidation_preference_multiple: 1 } } });
    const csv = exportCsv(r);
    const lines = csv.trimEnd().split('\n');
    assert.equal(lines.length, r.terms.length + 1); // header + one row per term
    assert.match(lines[0], /^Term,Value,Verdict/);
    const dividendsLine = lines.find((l) => l.startsWith('dividends'));
    assert.match(dividendsLine, /"/); // benchmark "none, non_cumulative" contains a comma → must be quoted
  });
});
