import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffTokens, formatDiffOps } from './diff';
import { tokenizeWithSpans, numericMismatches } from './textutil';

test('tokenDiff marks a substitution as a replace op with a source span', () => {
  const ops = diffTokens(tokenizeWithSpans('pay 120 dollars now'), tokenizeWithSpans('pay 90 dollars now'));
  assert.deepEqual(ops, [
    { op: 'equal', source: ['pay'] },
    { op: 'replace', quote: ['120'], source: ['90'], sourceSpan: { start: 4, end: 6 } },
    { op: 'equal', source: ['dollars', 'now'] },
  ]);
});

test('tokenDiff marks dropped tokens as delete runs and additions as insert runs', () => {
  const drop = diffTokens(tokenizeWithSpans('the fox ran'), tokenizeWithSpans('the quick brown fox ran'));
  assert.deepEqual(drop.filter((o) => o.op !== 'equal'), [
    { op: 'delete', source: ['quick', 'brown'], sourceSpan: { start: 4, end: 15 } },
  ]);
  const ins = diffTokens(tokenizeWithSpans('the very quick fox'), tokenizeWithSpans('the quick fox'));
  assert.deepEqual(ins.filter((o) => o.op !== 'equal'), [{ op: 'insert', quote: ['very'] }]);
});

test('formatDiffOps renders inline marks for non-equal ops only', () => {
  const ops = diffTokens(tokenizeWithSpans('pay 120 now'), tokenizeWithSpans('pay 90 now'));
  const marks = formatDiffOps(ops);
  assert.ok(marks.includes('120'), marks);
  assert.ok(marks.includes('90'), marks);
  assert.ok(!marks.includes('pay'), marks);
});

test('numericMismatches pairs altered numbers and reports unpaired extras', () => {
  const r = numericMismatches(['pay', '120', 'now'], ['pay', '90', 'now']);
  assert.deepEqual(r.paired, [{ quote: '120', source: '90' }]);
  assert.deepEqual(r.quoteOnly, []);
  assert.deepEqual(r.sourceOnly, []);
  const r2 = numericMismatches(['120'], ['124', '80']);
  assert.deepEqual(r2.paired, [{ quote: '120', source: '124' }]);
  assert.deepEqual(r2.sourceOnly, ['80']);
});
