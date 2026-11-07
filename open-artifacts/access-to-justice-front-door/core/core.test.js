import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triage, matchKeywords, renderTriage, TAXONOMY } from './core.js';

test('clear eviction description classifies as housing-eviction with referral', () => {
  const r = triage('My landlord gave me an eviction notice and I am behind on rent.');
  assert.equal(r.status, 'classified');
  assert.equal(r.primaryIssue, 'housing-eviction');
  assert.ok(r.confidence >= 0.4);
  assert.equal(r.referrals[0].legalAidCategory, 'legal-aid-housing');
});

test('debt collection language routes to consumer-debt', () => {
  const r = triage('A debt collector is calling me and they want to garnish my wages.');
  assert.equal(r.status, 'classified');
  assert.equal(r.primaryIssue, 'consumer-debt');
});

test('safety language routes to domestic-violence, not employment', () => {
  const r = triage('My partner hit me and I feel unsafe at home. I need a restraining order.');
  assert.equal(r.primaryIssue, 'domestic-violence');
});

test('single-word keywords match whole words only (rent ≠ present)', () => {
  const m = matchKeywords('I want to present my case', TAXONOMY);
  assert.equal(m['housing-eviction'], undefined);
});

test('no keyword match escalates to a human, never guesses an issue', () => {
  const r = triage('I would like to talk about something else entirely.');
  assert.equal(r.status, 'escalate');
  assert.equal(r.reason, 'no-keyword-match');
  assert.match(r.escalate, /staff member will review/);
  assert.equal('primaryIssue' in r, false);
});

test('low-confidence split escalates with candidates listed but unserved', () => {
  // one housing hit (landlord w2) vs one benefits hit (benefits w2) → 0.5/0.5 top confidence 0.5 OK…
  // craft: employer/benefits split → use minConfidence high
  const r = triage('My landlord says my benefits paperwork is late.', { minConfidence: 0.99 });
  assert.equal(r.status, 'escalate');
  assert.equal(r.reason, 'low-confidence');
  assert.ok(r.candidates.length >= 2);
  assert.ok(r.candidates.every((c) => typeof c.confidence === 'number'));
});

test('close second issue triggers multiIssue and serves both referrals', () => {
  // landlord (2, housing-eviction) + mold (2, housing-conditions) vs nothing else → 0.5/0.5, gap 0 < 0.15
  const r = triage('My landlord ignores the mold.');
  assert.equal(r.status, 'classified');
  assert.equal(r.multiIssue, true);
  assert.equal(r.referrals.length, 2);
  assert.deepEqual(r.referrals.map((x) => x.issue).sort(), ['housing-conditions', 'housing-eviction']);
});

test('strong single-issue signal stays single-referral', () => {
  const r = triage('I got an eviction notice and a notice to quit and a lockout threat.');
  assert.equal(r.multiIssue, false);
  assert.equal(r.referrals.length, 1);
});

test('referral-only output: no advice field ever appears in the response', () => {
  for (const text of [
    'My landlord gave me an eviction notice.',
    'A debt collector sued me.',
    'Something unmatchable.',
  ]) {
    const r = triage(text);
    const flat = JSON.stringify(r).toLowerCase();
    assert.ok(!flat.includes('"advice"'), 'no advice key');
    for (const banned of ['you should', 'you can claim', 'you will win', 'file a motion']) {
      assert.ok(!flat.includes(banned), `response must not contain "${banned}"`);
    }
  }
});

test('every served referral string comes verbatim from the taxonomy data', () => {
  const r = triage('I was not paid for my overtime wages.');
  const dataStrings = new Set();
  for (const def of Object.values(TAXONOMY)) {
    dataStrings.add(def.referral.serviceDescription);
    dataStrings.add(def.referral.whereToGo);
    dataStrings.add(def.referral.legalAidCategory);
  }
  for (const ref of r.referrals) {
    assert.ok(dataStrings.has(ref.serviceDescription));
    assert.ok(dataStrings.has(ref.whereToGo));
    assert.ok(dataStrings.has(ref.legalAidCategory));
  }
});

test('disclaimer is attached to both classified and escalated results', () => {
  assert.match(triage('eviction notice').disclaimer, /referral information only/i);
  assert.match(triage('nothing matches here at all').disclaimer, /referral information only/i);
});

test('classification is deterministic — same input, identical output', () => {
  const t = 'My landlord gave me an eviction notice.';
  assert.deepEqual(triage(t), triage(t));
});

test('case-insensitive matching', () => {
  const r = triage('EVICTION NOTICE POSTED ON MY DOOR');
  assert.equal(r.status, 'classified');
  assert.equal(r.primaryIssue, 'housing-eviction');
});

test('editable taxonomy plugs in via opts', () => {
  const custom = {
    'wildlife-dispute': {
      label: 'Wildlife dispute (test)',
      keywords: [{ k: 'goose', w: 3 }],
      referral: { legalAidCategory: 'legal-aid-test', serviceDescription: 'Test.', whereToGo: 'Test office.' },
    },
  };
  const r = triage('A goose is blocking my driveway.', { taxonomy: custom });
  assert.equal(r.status, 'classified');
  assert.equal(r.primaryIssue, 'wildlife-dispute');
});

test('confidence is a normalized share of matched keyword weight', () => {
  // landlord(2) only vs nothing else → confidence exactly 1
  const r = triage('My landlord is unresponsive.');
  assert.equal(r.status, 'classified');
  assert.equal(r.confidence, 1);
});

test('renderTriage renders referrals for classified and escalation for unknown', () => {
  const ok = renderTriage(triage('I got an eviction notice after falling behind on rent.'));
  assert.match(ok, /# Triage — Eviction \/ loss of housing/);
  assert.match(ok, /legal-aid-housing/);
  assert.match(ok, /> This tool provides referral information only/);
  const esc = renderTriage(triage('completely unrelated words'));
  assert.match(esc, /ESCALATE/);
});
