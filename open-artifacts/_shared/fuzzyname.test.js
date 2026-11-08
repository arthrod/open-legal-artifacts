// fuzzyname.test.js — unicode-aware name normalization + similarity.
// Adversarial: CJK names, emoji, NFKC quirks, initials, nicknames.
// All names fictional. Run: node --test fuzzyname.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, similarity, similarityReason } from './fuzzyname.js';

// ------------------------------------------------------ normalizeName

test('normalizeName: casefold, strip punctuation and diacritics (Latin)', () => {
  assert.equal(normalizeName('José MUÑOZ'), 'jose munoz');
  assert.equal(normalizeName('  Zoë   Brontë '), 'zoe bronte');
  assert.equal(normalizeName('O\'Brien-Smith'), 'o brien smith');
});

test('normalizeName: NFKC compatibility folding (ﬁ→fi, fullwidth→ascii)', () => {
  assert.equal(normalizeName('Baﬁle'), 'bafile'); // ligature ﬁ
  assert.equal(normalizeName('ＡＢＣ　太郎'), 'abc 太郎'); // fullwidth + ideographic space
});

test('normalizeName: keeps non-Latin script tokens (CJK, Cyrillic, Greek)', () => {
  assert.equal(normalizeName('田中 太郎'), '田中 太郎');
  assert.equal(normalizeName('ИВАНОВ Иван'), 'иванов иван');
  assert.equal(normalizeName('Γιώργος Παπαδόπουλος'), 'γιωργος παπαδοπουλος');
});

test('normalizeName: drops emoji and symbols, keeps letters/numbers', () => {
  assert.equal(normalizeName('Zoë 🌟⚖️ Lane'), 'zoe lane');
  assert.equal(normalizeName('Unit 7 ✅'), 'unit 7');
});

test('normalizeName: nullish/empty → empty string, never throws', () => {
  assert.equal(normalizeName(null), '');
  assert.equal(normalizeName(undefined), '');
  assert.equal(normalizeName(''), '');
  assert.equal(normalizeName('!!! ...'), '');
});

// ------------------------------------------------------ similarity

test('similarity: exact after normalization → 1', () => {
  assert.equal(similarity('Northwind Logistics, Inc.', 'northwind logistics'), 1);
  assert.equal(similarity('José Muñoz', 'JOSE MUNOZ'), 1);
});

test('similarity: initial expansion (J. Iwata ≈ John Iwata)', () => {
  const s = similarity('J. Iwata', 'John Iwata');
  assert.ok(s >= 0.85, `expected >= 0.85, got ${s}`);
  assert.ok(similarity('J. Iwata', 'K. Iwata') < 0.7, 'different initials must not match');
});

test('similarity: nickname map (Bob ≈ Robert)', () => {
  const s = similarity('Bob Huang', 'Robert Huang');
  assert.ok(s >= 0.9, `expected >= 0.9, got ${s}`);
  assert.ok(similarity('Bob Huang', 'Robert Huang') > similarity('Bob Huang', 'Reginald Huang'));
});

test('similarity: CJK — space difference does not defeat the match', () => {
  assert.equal(similarity('田中 太郎', '田中太郎'), 1);
  assert.ok(similarity('田中 太郎', '佐藤 花子') < 0.4);
});

test('similarity: small edits (typos, suffix drift) score high', () => {
  assert.ok(similarity('Brightpath Solar', 'Brightpath Solar Group') >= 0.7);
  assert.ok(similarity('Northwind Logistics', 'Northwind Logistica') >= 0.85);
});

test('similarity: unrelated names score low; empty → 0', () => {
  assert.ok(similarity('Northwind Logistics', 'Zephyr Wind Farms') < 0.4);
  assert.equal(similarity('', 'Anyone'), 0);
  assert.equal(similarity(null, 'Anyone'), 0);
});

// ------------------------------------------------ similarityReason

test('similarityReason: returns a trace explaining how tokens matched', () => {
  const r = similarityReason('J. Iwata', 'John Iwata');
  assert.equal(typeof r.score, 'number');
  assert.equal(r.score, similarity('J. Iwata', 'John Iwata'));
  assert.ok(Array.isArray(r.matchedVia));
  const kinds = r.matchedVia.map((m) => m.kind);
  assert.ok(kinds.includes('initial'), `expected an initial match in trace: ${JSON.stringify(r.matchedVia)}`);
});

test('similarityReason: nickname match is traced as nickname', () => {
  const r = similarityReason('Bob Huang', 'Robert Huang');
  const kinds = r.matchedVia.map((m) => m.kind);
  assert.ok(kinds.includes('nickname'), `expected a nickname match: ${JSON.stringify(r.matchedVia)}`);
});

test('similarityReason: exact normalization match is traced as exact', () => {
  const r = similarityReason('José Muñoz', 'JOSE MUNOZ');
  assert.ok(r.matchedVia.every((m) => m.kind === 'exact'));
});

test('similarityReason: no match → empty trace, low score', () => {
  const r = similarityReason('Northwind Logistics', 'Zephyr Wind Farms');
  assert.equal(r.matchedVia.length, 0);
  assert.ok(r.score < 0.4);
});
