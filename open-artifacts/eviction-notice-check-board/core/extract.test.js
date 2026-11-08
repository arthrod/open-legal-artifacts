import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDraft } from './extract.js';

// All notice text below is FICTIONAL (Fiction City / Fiction Properties).
const NOTICE = `THREE (3) DAY NOTICE TO PAY RENT OR QUIT

To: Jamie Roe, 999 Fiction Ave, Fiction City

Rent of $1,250.00 is now due and unpaid for the month of October 2026.
Pay to Fiction Properties LLC, 1 Main St, Fiction City, or online at
pay.example (in person during business hours also accepted).

If you fail to pay within three (3) days, your tenancy will terminate
on October 15, 2026 and you must surrender the premises.

A copy of this notice was posted on the premises and mailed to the
tenant's address of record on 2026-10-01.

Dated: October 1, 2026 — Fiction Properties LLC (Fiction State)`;

test('extracts the stated period with a verbatim quote', () => {
  const d = extractDraft(NOTICE);
  assert.equal(d.statedPeriodDays, 3);
  assert.equal(d.statedPeriodDaysQuote, 'THREE (3) DAY');
});

test('extracts amounts and dates with verbatim quotes', () => {
  const d = extractDraft(NOTICE);
  assert.equal(d.amounts.length, 1);
  assert.equal(d.amounts[0].amount, '$1,250.00');
  assert.ok(d.dates.length >= 3);
  const iso = d.dates.find((x) => x.iso === '2026-10-15');
  assert.ok(iso, 'October 15, 2026 normalized to ISO');
  assert.equal(iso.raw, 'October 15, 2026');
  assert.ok(d.dates.some((x) => x.iso === '2026-10-01'));
});

test('content hints carry verbatim quotes and only ever draft PRESENT facts', () => {
  const d = extractDraft(NOTICE);
  const amount = d.contentHints['amount-due'];
  assert.equal(amount.present, true);
  assert.equal(amount.quote, '$1,250.00');
  // payment instructions drafted from the payment sentence
  assert.equal(d.contentHints['payment-instructions'].present, true);
  assert.match(d.contentHints['payment-instructions'].quote, /Pay to Fiction Properties LLC/);
  // vacate/surrender demand drafted from the quoted sentence
  assert.equal(d.contentHints['vacate-demand'].present, true);
  assert.match(d.contentHints['vacate-demand'].quote, /surrender the premises/);
  // absence of a match is NOT evidence of absence: no present:false hints ever
  for (const v of Object.values(d.contentHints)) assert.notEqual(v.present, false);
  // no termination-date hint: the notice has dates but the draft must not
  // decide which date is THE termination date — human confirms
  assert.equal(d.contentHints['termination-date'], undefined);
});

test('jurisdiction hint only from a state name literally on the notice', () => {
  const d = extractDraft(NOTICE);
  assert.equal(d.jurisdictionHint, null); // "Fiction State" matches nothing
  const ca = extractDraft('NOTICE TO PAY RENT OR QUIT — State of California');
  assert.equal(ca.jurisdictionHint, 'california-example');
});

test('service method description is verbatim, never mapped to an enum', () => {
  const d = extractDraft(NOTICE);
  assert.equal(d.serviceMethod, null); // never guessed into the ruleset enum
  assert.match(d.serviceMethodDescription, /posted on the premises and mailed/);
});

test('empty or unrelated text extracts nothing — every field null/empty', () => {
  const d = extractDraft('Dear tenant, hope this finds you well.');
  assert.equal(d.statedPeriodDays, null);
  assert.equal(d.statedPeriodDaysQuote, null);
  assert.equal(d.jurisdictionHint, null);
  assert.equal(d.serviceMethod, null);
  assert.equal(d.serviceMethodDescription, null);
  assert.deepEqual(d.amounts, []);
  assert.deepEqual(d.dates, []);
  assert.deepEqual(d.contentHints, {});
});

test('draft is JSON-serializable (for the demo textarea round-trip)', () => {
  const d = extractDraft(NOTICE);
  assert.equal(typeof JSON.stringify(d), 'string');
});
