import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractQuotes } from './extract';
import type { SourceDoc } from './citecheck';

const SOURCES: SourceDoc[] = [
  { id: 'okafor-depo', name: 'Deposition of Sandra Okafor (Jan. 14, 2026)', aliases: ['Okafor Deposition'] },
  { id: 'msa', name: 'Master Services Agreement (Halcyon–Meridian, 2024)', aliases: ['Master Services Agreement'] },
];

const BRIEF = `The record shows that “Mr. Beltran signed the delivery receipt at 4:20 p.m. without noting any exception on the document.”[1] The contract further provides that “Customer may terminate this Agreement for convenience.”[2] One passing phrase “too vague to matter here” goes unmarked, and “The seal was already broken when our team inspected it.”[3] closes the argument.

[1] Deposition of Sandra Okafor (Jan. 14, 2026), p. 12.
[2] Master Services Agreement, § 5.2.
[3] Ghost Transcript, Tr. 12:4.`;

test('extractor pulls quoted passages and resolves footnote pinpoints deterministically', () => {
  const { quotes, warnings } = extractQuotes(BRIEF, SOURCES);
  assert.deepEqual(quotes, [
    {
      id: 'Q1',
      text: 'Mr. Beltran signed the delivery receipt at 4:20 p.m. without noting any exception on the document.',
      sourceId: 'okafor-depo',
      pinpoint: 'p. 12',
    },
    {
      id: 'Q2',
      text: 'Customer may terminate this Agreement for convenience.',
      sourceId: 'msa',
      pinpoint: '§ 5.2',
    },
  ]);
  assert.ok(warnings.some((w) => w.includes('footnote 3') && w.includes('no matching source')), JSON.stringify(warnings));
  assert.ok(warnings.some((w) => w.includes('unmarked quotation')), JSON.stringify(warnings));
});

test('extractor matches by alias when the full source name is absent', () => {
  const brief = `She testified that “the seal was already broken.”[7]\n\n[7] Okafor Deposition, Tr. 12:4.`;
  const { quotes, warnings } = extractQuotes(brief, SOURCES);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].sourceId, 'okafor-depo');
  assert.equal(quotes[0].pinpoint, 'Tr. 12:4');
  assert.deepEqual(warnings, []);
});
