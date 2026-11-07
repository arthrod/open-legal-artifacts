/** Tests for venture-term-sheet-benchmark core. Run: node --test "core/*.test.js" */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkTermSheet, compareTerm, exportMd, withGrid, DEFAULT_GRID } from './core.js';

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
  test('user grid replaces a round entirely via withGrid', () => {
    const custom = withGrid({ rounds: { seed: { dividends: { kind: 'enum', values: ['cumulative'], source: { name: 'My 2026 deal corpus', asOf: '2026-06' } } } } });
    const r = benchmarkTermSheet({ term_sheet: { round: 'seed', terms: { dividends: 'non_cumulative' } } }, custom);
    assert.equal(r.counts.outside_market, 1);
    assert.equal(r.terms[0].source.name, 'My 2026 deal corpus');
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
});
