import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePinpoint, formatPinpoint } from './pinpoint';
import { runCiteCheck } from './citecheck';
import type { CiteCheckInput } from './citecheck';

test('pinpoint parser handles v2 forms (page:line, ranges, id., n., art., cl.)', () => {
  assert.deepEqual(parsePinpoint('Tr. 12:4'), { kind: 'page-line', page: 12, lineFrom: 4 });
  assert.deepEqual(parsePinpoint('Tr. 12:4-12:8'), { kind: 'page-line', page: 12, lineFrom: 4, lineTo: 8, pageTo: 12 });
  assert.deepEqual(parsePinpoint('12:4-8'), { kind: 'page-line', page: 12, lineFrom: 4, lineTo: 8 });
  assert.deepEqual(parsePinpoint('¶¶ 7-8'), { kind: 'paragraph', number: 7, to: 8 });
  assert.deepEqual(parsePinpoint('§§ 5-6'), { kind: 'section', label: '5', to: '6' });
  assert.deepEqual(parsePinpoint('Secs. 5.2-5.4'), { kind: 'section', label: '5.2', to: '5.4' });
  assert.deepEqual(parsePinpoint('id. at 123'), { kind: 'page', from: 123 });
  assert.deepEqual(parsePinpoint('id. at 12:4'), { kind: 'page-line', page: 12, lineFrom: 4 });
  assert.deepEqual(parsePinpoint('n. 12'), { kind: 'footnote', number: 12 });
  assert.deepEqual(parsePinpoint('art. 3'), { kind: 'article', label: '3' });
  assert.deepEqual(parsePinpoint('cl. 8'), { kind: 'clause', label: '8' });
  // legacy forms keep working
  assert.deepEqual(parsePinpoint('p. 12'), { kind: 'page', from: 12 });
  assert.deepEqual(parsePinpoint('pp. 12-13'), { kind: 'page', from: 12, to: 13 });
  assert.equal(parsePinpoint('somewhere in there'), null);
});

test('pinpoint v2 forms round-trip through formatPinpoint', () => {
  assert.equal(formatPinpoint(parsePinpoint('Tr. 12:4-12:8')!), 'Tr. 12:4-12:8');
  assert.equal(formatPinpoint(parsePinpoint('12:4-8')!), 'Tr. 12:4-8');
  assert.equal(formatPinpoint(parsePinpoint('¶¶ 7-8')!), '¶¶ 7-8');
  assert.equal(formatPinpoint(parsePinpoint('§§ 5-6')!), '§§ 5-6');
  assert.equal(formatPinpoint(parsePinpoint('n. 12')!), 'n. 12');
  assert.equal(formatPinpoint(parsePinpoint('art. 3')!), 'art. 3');
});

test('page:line pinpoints validate against line-segmented pages', () => {
  const input: CiteCheckInput = {
    document: { name: 'Transcript test (fictional)' },
    sources: [
      {
        id: 'tr',
        name: 'Trial Transcript (fictional)',
        pages: [
          {
            number: 12,
            text: 'Q. You saw the seal?\nA. The seal was intact when I checked it at the gate.\nQ. At what time?\nA. Around 4 p.m., before the rain started.',
          },
        ],
      },
    ],
    quotes: [
      { id: 'T1', text: 'The seal was intact when I checked it at the gate.', sourceId: 'tr', pinpoint: 'Tr. 12:2' },
      { id: 'T2', text: 'The seal was intact when I checked it at the gate.', sourceId: 'tr', pinpoint: 'Tr. 12:4-12:8' },
      { id: 'T3', text: 'Around 4 p.m., before the rain started.', sourceId: 'tr', pinpoint: '12:4' },
      { id: 'T4', text: 'The seal was intact when I checked it at the gate.', sourceId: 'tr', pinpoint: 'Tr. 12:2-2' },
    ],
  };
  const res = runCiteCheck(input).results;
  assert.equal(res[0].pinpoint?.status, 'ok');
  assert.equal(res[1].pinpoint?.status, 'mismatch');
  assert.ok(res[1].pinpoint!.detail.includes('line 2'), res[1].pinpoint!.detail);
  assert.equal(res[2].pinpoint?.status, 'ok');
  assert.equal(res[3].pinpoint?.status, 'ok');
});

test('range pinpoints validate across their span (§§ / ¶¶)', () => {
  const input: CiteCheckInput = {
    document: { name: 'Range test (fictional)' },
    sources: [
      {
        id: 'doc',
        name: 'Fictional Contract',
        sections: [{ label: '5.2', text: 'Customer may terminate for convenience.' }],
        paragraphs: [{ number: 8, text: 'The witness recalled the alarm.' }],
      },
    ],
    quotes: [
      { id: 'R1', text: 'Customer may terminate for convenience.', sourceId: 'doc', pinpoint: '§§ 5-6' },
      { id: 'R2', text: 'Customer may terminate for convenience.', sourceId: 'doc', pinpoint: '§§ 7-8' },
      { id: 'R3', text: 'The witness recalled the alarm.', sourceId: 'doc', pinpoint: '¶¶ 7-8' },
    ],
  };
  const res = runCiteCheck(input).results;
  assert.equal(res[0].pinpoint?.status, 'ok');
  assert.equal(res[1].pinpoint?.status, 'mismatch');
  assert.equal(res[2].pinpoint?.status, 'ok');
});

test('footnote/article/clause pinpoints parse but stay unverifiable (never guessed)', () => {
  const input: CiteCheckInput = {
    document: { name: 'Unverifiable test (fictional)' },
    sources: [{ id: 's', name: 'Source', text: 'Some unsegmented free text.' }],
    quotes: [{ id: 'U1', text: 'Some unsegmented free text.', sourceId: 's', pinpoint: 'n. 12' }],
  };
  const r = runCiteCheck(input).results[0];
  assert.equal(r.pinpoint?.status, 'unverifiable');
  assert.ok(r.pinpoint!.detail.includes('does not model footnote'), r.pinpoint!.detail);
});
