// icsutil.test.js — RFC 5545 helpers: CRLF, TEXT escaping, ≤75-octet folding,
// VEVENT/VCALENDAR builders. Run: node --test icsutil.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { icsEscapeText, foldIcsLine, buildVEvent, buildIcs } from './icsutil.js';

// ------------------------------------------------------ TEXT escaping

test('icsEscapeText escapes backslash, semicolon, comma, newlines', () => {
  assert.equal(icsEscapeText('plain'), 'plain');
  assert.equal(icsEscapeText('a;b'), 'a\\;b');
  assert.equal(icsEscapeText('a,b'), 'a\\,b');
  assert.equal(icsEscapeText('a\\b'), 'a\\\\b');
  assert.equal(icsEscapeText('a\nb'), 'a\\nb');
  assert.equal(icsEscapeText('a\rb'), 'a\\nb'); // CR alone also becomes literal \n
  assert.equal(icsEscapeText('Doe; John, Esq.\nLine 2'), 'Doe\\; John\\, Esq.\\nLine 2');
});

// ------------------------------------------------------ folding

test('foldIcsLine: short lines pass through unchanged', () => {
  assert.equal(foldIcsLine('UID:V1@x'), 'UID:V1@x');
});

test('foldIcsLine: 80-char summary folds so every physical line is ≤75 octets', () => {
  const summary = 'S'.repeat(80);
  const line = `SUMMARY:${summary}`; // 88 octets
  const folded = foldIcsLine(line);
  const parts = folded.split('\r\n');
  assert.ok(parts.length >= 2, 'expected folding');
  for (const p of parts) {
    assert.ok(Buffer.byteLength(p, 'utf8') <= 75, `line over 75 octets: ${Buffer.byteLength(p, 'utf8')}`);
  }
  assert.ok(parts.slice(1).every((p) => p.startsWith(' ')), 'continuations start with one space');
  assert.equal(parts.join('').replace(/ /g, ''), line.replace(/ /g, '')); // content preserved modulo fold spaces
});

test('foldIcsLine: never splits a multibyte character across lines', () => {
  const line = 'SUMMARY:' + '田中太郎、訴訟期限のリマインダー'.repeat(4); // 3-octet chars
  const parts = foldIcsLine(line).split('\r\n');
  for (const p of parts) {
    assert.ok(Buffer.byteLength(p, 'utf8') <= 75);
  }
  // Rejoin: strip fold continuation spaces and compare to original.
  const first = parts[0];
  const rest = parts.slice(1).map((p) => p.slice(1));
  assert.equal(first + rest.join(''), line);
});

test('foldIcsLine: emoji (4-octet) does not overflow the limit', () => {
  const line = 'SUMMARY:' + '⚖️🔔'.repeat(30);
  for (const p of foldIcsLine(line).split('\r\n')) {
    assert.ok(Buffer.byteLength(p, 'utf8') <= 75);
  }
});

// ------------------------------------------------------ VEVENT builder

test('buildVEvent: date-only deadline → VALUE=DATE, CRLF, folded', () => {
  const out = buildVEvent({
    uid: 'V1@demo',
    dtStamp: '2026-11-07',
    dtStart: '2026-11-13',
    summary: 'Filing deadline — Doe v. Roe [fictional]',
  });
  assert.ok(out.includes('BEGIN:VEVENT'));
  assert.ok(out.includes('UID:V1@demo'));
  assert.ok(out.includes('DTSTAMP:20261107T000000Z'));
  assert.ok(out.includes('DTSTART;VALUE=DATE:20261113'));
  assert.ok(out.includes('END:VEVENT'));
  assert.ok(out.endsWith('\r\n'));
});

test('buildVEvent: UTC datetime dtStart → basic format', () => {
  const out = buildVEvent({
    uid: 'V2@demo',
    dtStamp: '2026-11-07',
    dtStart: '2026-11-13T14:30:00Z',
    summary: 'Hearing',
  });
  assert.ok(out.includes('DTSTART:20261113T143000Z'));
});

test('buildVEvent: escapes TEXT values', () => {
  const out = buildVEvent({
    uid: 'V3@demo',
    dtStamp: '2026-11-07',
    dtStart: '2026-11-13',
    summary: 'Doe; John, Esq. — deposition',
    description: 'Line 1\nLine 2',
  });
  assert.ok(out.includes('Doe\\; John\\, Esq.'));
  assert.ok(out.includes('Line 1\\nLine 2'));
});

test('buildVEvent: invalid or missing date → null (never a guessed event)', () => {
  assert.equal(buildVEvent({ uid: 'x', dtStamp: '2026-11-07', dtStart: 'not-a-date', summary: 's' }), null);
  assert.equal(buildVEvent({ uid: 'x', dtStamp: '2026-11-07', summary: 's' }), null);
});

test('buildVEvent: invalid dtStamp falls back to dtStart', () => {
  const utc = buildVEvent({ uid: 'V4@demo', dtStart: '2026-11-13T09:00:00Z', dtStamp: 'garbage', summary: 's' });
  assert.ok(utc.includes('DTSTAMP:20261113T090000Z'));
  const dateOnly = buildVEvent({ uid: 'V5@demo', dtStart: '2026-11-13', dtStamp: 'not-a-date' });
  assert.ok(dateOnly.includes('DTSTAMP:20261113T000000Z'));
});

// ------------------------------------------------------ VCALENDAR builder

test('buildIcs: wraps events, CRLF everywhere, skips invalid events', () => {
  const ics = buildIcs([
    { uid: 'A@demo', dtStamp: '2026-11-07', dtStart: '2026-11-13', summary: 'First' },
    { uid: 'B@demo', dtStamp: '2026-11-07', dtStart: 'garbage', summary: 'Bad' },
    { uid: 'C@demo', dtStamp: '2026-11-07', dtStart: '2026-12-01', summary: 'Second' },
  ], { prodId: '-//demo//open-legal-artifacts//EN' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  for (const line of ics.split('\r\n')) {
    assert.ok(!line.includes('\n'), 'no bare LF inside lines');
  }
  assert.ok([...ics.matchAll(/\r\n/g)].length >= ics.split('\r\n').length - 1);
  assert.ok(ics.includes('PRODID:-//demo//open-legal-artifacts//EN'));
  // every physical line ≤75 octets
  for (const line of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(line, 'utf8') <= 75, `line >75 octets: "${line}"`);
  }
});

test('buildIcs: empty input still yields a valid empty calendar', () => {
  const ics = buildIcs([]);
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('END:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 0);
});
