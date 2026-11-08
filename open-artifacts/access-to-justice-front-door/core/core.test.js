import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    for (const g of def.guidance ?? []) {
      dataStrings.add(g.point);
      dataStrings.add(g.source?.name);
      dataStrings.add(g.source?.url);
    }
  }
  for (const ref of r.referrals) {
    assert.ok(dataStrings.has(ref.serviceDescription));
    assert.ok(dataStrings.has(ref.whereToGo));
    assert.ok(dataStrings.has(ref.legalAidCategory));
    assert.ok(Array.isArray(ref.guidance) && ref.guidance.length >= 1, 'guidance served per referral');
    for (const g of ref.guidance) {
      assert.ok(dataStrings.has(g.point), 'guidance point verbatim from data');
      assert.ok(dataStrings.has(g.source?.name) && dataStrings.has(g.source?.url), 'guidance source verbatim from data');
    }
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

// ------------------------------------------------------- wave-2 improvements

test('alias layer: paraphrases that escalated before now classify deterministically', () => {
  const cases = [
    ["I'm being kicked out of my apartment.", 'housing-eviction'],
    ['They threw me out of my place last night.', 'housing-eviction'],
    ['My husband beats me and I am scared to go home.', 'domestic-violence'],
    ['My boss owes me for two weeks of work.', 'employment-wage'],
    ['They cut off my cash assistance without telling me why.', 'benefits-denial'],
    ['My check was garnished over an old hospital bill.', 'consumer-debt'],
  ];
  for (const [text, issue] of cases) {
    const r = triage(text);
    assert.equal(r.status, 'classified', text);
    assert.equal(r.primaryIssue, issue, text);
  }
});

test('aliases are rules-as-data and match like keywords', () => {
  assert.ok(Array.isArray(TAXONOMY['housing-eviction'].aliases), 'aliases are a data field');
  const m = matchKeywords('kicked out', TAXONOMY);
  assert.ok(m['housing-eviction'].hits.length >= 1);
});

test('alias word boundaries: "ebt" does not fire inside "debt"', () => {
  const m = matchKeywords('I have a lot of debt and nothing else matches', TAXONOMY);
  assert.equal(m['benefits-denial'], undefined);
});

test('alias cross-match guard: wages + garnished stays consumer-debt, single referral', () => {
  const r = triage('My wages were garnished.');
  assert.equal(r.status, 'classified');
  assert.equal(r.primaryIssue, 'consumer-debt');
  assert.equal(r.multiIssue, false);
});

test('urgency flag: safety language → emergency; court date → urgent; plain → routine', () => {
  assert.equal(triage('My partner hit me and I feel unsafe at home. I need a restraining order.').urgency, 'emergency');
  assert.equal(triage('I have a court date on March 3 about my eviction notice.').urgency, 'urgent');
  assert.equal(triage('My landlord ignores the mold.').urgency, 'routine');
});

test('date extraction captures plain-language dates, info-only, in text order', () => {
  const r = triage('I have a court date on March 3 and a hearing on 3/15.');
  assert.deepEqual(r.dates, ['March 3', '3/15']);
  assert.deepEqual(triage('nothing about dates here, just mold').dates, []);
});

test('urgency phrases match on word boundaries (hearing ≠ hard of hearing)', () => {
  // review 62 nit: substring 'hearing' misfired on 'hard of hearing'
  const hardOfHearing = triage('I am hard of hearing and my landlord gave me an eviction notice.');
  assert.equal(hardOfHearing.status, 'classified');
  assert.equal(hardOfHearing.urgency, 'routine');
  const courtHearing = triage('My landlord gave me an eviction notice and I have a hearing coming up.');
  assert.equal(courtHearing.urgency, 'urgent');
});

test('urgency and dates are also attached to escalations', () => {
  const r = triage('I have a court deadline tomorrow about something unmatchable.');
  assert.equal(r.status, 'escalate');
  assert.equal(r.urgency, 'urgent');
});

test('low-confidence split returns a clarifying question with option ids; pick resolves it', () => {
  const text = 'My landlord says my benefits paperwork is late and my wages got cut.';
  const esc = triage(text);
  assert.equal(esc.status, 'escalate');
  assert.equal(esc.reason, 'low-confidence');
  assert.ok(esc.clarifyingQuestion.options.length >= 3);
  assert.ok(esc.clarifyingQuestion.options.every((o) => typeof o.id === 'string' && o.label));
  const picked = triage(text, { pick: 'benefits-denial' });
  assert.equal(picked.status, 'classified');
  assert.equal(picked.primaryIssue, 'benefits-denial');
  assert.equal(picked.resolvedBy, 'clarifying-question');
  assert.equal(picked.multiIssue, false);
});

test('pick outside the candidate set never classifies', () => {
  const r = triage('My landlord says my benefits paperwork is late.', { pick: 'family-custody' });
  assert.equal(r.status, 'escalate');
  assert.equal(r.reason, 'invalid-pick');
});

test('served guidance is process-only and carries a source on every entry', () => {
  for (const def of Object.values(TAXONOMY)) {
    assert.ok(Array.isArray(def.guidance) && def.guidance.length >= 1, 'every issue has guidance data');
    for (const g of def.guidance) {
      assert.ok(g.source && g.source.name && /^https:\/\//.test(g.source.url), 'source link required');
    }
  }
  const r = triage('My landlord gave me an eviction notice.');
  const flat = JSON.stringify(r).toLowerCase();
  for (const banned of ['you should', 'you can claim', 'you will win', 'file a motion']) {
    assert.ok(!flat.includes(banned), `guidance must not contain "${banned}"`);
  }
});

test('escalation packet: full candidates with labels and matched fragments for staff review', () => {
  const r = triage('My landlord says my benefits paperwork is late and my wages got cut.');
  assert.ok(r.candidates.every((c) => c.label && Array.isArray(c.matchedKeywords) && c.matchedKeywords.length >= 1));
  assert.ok(r.matchedFragments.length >= 3);
  const md = renderTriage(r);
  assert.match(md, /low-confidence/);
  assert.match(md, /Public benefits denied or cut off/);
  assert.match(md, /landlord/);
});

test('20-paraphrase golden set (examples/paraphrases.json) matches recorded outcomes', () => {
  const golden = JSON.parse(readFileSync(new URL('../examples/paraphrases.json', import.meta.url), 'utf8'));
  assert.equal(golden.cases.length, 20);
  for (const { text, expect } of golden.cases) {
    const r = triage(text);
    assert.equal(r.status, expect.status, text);
    if (expect.issue) assert.equal(r.primaryIssue, expect.issue, text);
  }
});
