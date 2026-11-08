import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triage } from '../core/core.js';
import { renderResult } from './render.js';

// Demo-level rendering tests. renderResult must branch on result status:
// an `invalid-pick` after a post-escalate edit is escalate-shaped and has
// no `matchedKeywords`, so classified rendering must never see it
// (review 62: demo pick-button handler crashed on r.matchedKeywords.map).

test('post-escalate edit yielding invalid-pick renders as escalation, not a crash', () => {
  // Repro: demo served a clarifying question for a low-confidence split,
  // the user edited the textarea to a different problem, then clicked the
  // now-stale option button.
  const r = triage('My landlord gave me an eviction notice and I am behind on rent.', { pick: 'benefits-denial' });
  assert.equal(r.status, 'escalate');
  assert.equal(r.reason, 'invalid-pick');
  assert.equal(r.matchedKeywords, undefined); // why classified rendering crashed on .map
  const html = renderResult(r);
  assert.match(html, /Escalated to a human — invalid-pick/);
  assert.ok(!html.includes('undefined'), 'no "undefined" may leak into rendered output');
});

test('classified results still render matched keywords and referral info', () => {
  const r = triage('My landlord gave me an eviction notice and I am behind on rent.');
  const html = renderResult(r);
  assert.match(html, /matched keywords:/);
  assert.match(html, /legalAidCategory|referral/);
});

test('clarifying-question pick resolving the split renders as resolved, with re-asked question when it goes stale', () => {
  const split = 'My landlord says my benefits paperwork is late and my wages got cut.';
  const picked = triage(split, { pick: 'benefits-denial' });
  assert.equal(picked.resolvedBy, 'clarifying-question');
  assert.match(renderResult(picked), /resolved by clarifying question/);
  // A stale pick after editing falls back to the escalate view — the demo
  // re-renders whatever triage returns instead of assuming classified.
  const stale = triage('Something completely unrelated to any issue.', { pick: 'benefits-denial' });
  assert.equal(stale.reason, 'no-keyword-match');
  assert.match(renderResult(stale), /Escalated to a human/);
});

test('low-confidence escalate renders the clarifying question and pick buttons for demo wiring', () => {
  const r = triage('My landlord says my benefits paperwork is late and my wages got cut.');
  assert.equal(r.reason, 'low-confidence');
  const html = renderResult(r);
  assert.match(html, /Which of these comes closest/);
  assert.match(html, /class="pick"/);
  assert.match(html, /Possibilities reviewed but not served automatically/);
});
