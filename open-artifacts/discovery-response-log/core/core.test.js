/** node:test suite for discovery-response-log core. Run: node --test core/ */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OBJECTION_GROUNDS, DEFAULT_SERVICE_EXTENSIONS,
  addDays, diffDays, calculateDeadline, deadlineStatus,
  assessPrivilegeSafety, draftResponse, reviseDraft, buildLog, toMarkdown,
} from './core.js';

test('addDays / diffDays round-trip across month boundary', () => {
  assert.equal(addDays('2026-03-10', 30), '2026-04-09');
  assert.equal(diffDays('2026-03-10', '2026-04-09'), 30);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('FRCP default deadline: 30 days, electronic service, no extension', () => {
  const d = calculateDeadline({ servedDate: '2026-03-10', serviceMethod: 'electronic' });
  assert.equal(d.dueDate, '2026-04-09');
  assert.equal(d.extensionDays, DEFAULT_SERVICE_EXTENSIONS.electronic);
  assert.ok(d.ruleBasis.includes('FRCP'));
});

test('Mail service adds 3 days under FRCP 6(d) default', () => {
  const d = calculateDeadline({ servedDate: '2026-03-10', serviceMethod: 'mail' });
  assert.equal(d.extensionDays, 3);
  assert.equal(d.dueDate, '2026-04-12');
});

test('Jurisdiction override: state rule 45-day responses, mail +5', () => {
  const d = calculateDeadline(
    { servedDate: '2026-03-10', serviceMethod: 'mail' },
    { responseDays: 45, serviceExtensions: { mail: 5 } },
  );
  assert.equal(d.dueDate, addDays('2026-03-10', 50));
});

test('Unknown service method is rejected loudly, never guessed', () => {
  assert.throws(() => calculateDeadline({ servedDate: '2026-03-10', serviceMethod: 'carrier-pigeon' }), /unknown serviceMethod/);
});

test('deadlineStatus classifies overdue / due-soon / ok', () => {
  assert.equal(deadlineStatus('2026-04-09', '2026-04-10').status, 'overdue');
  assert.equal(deadlineStatus('2026-04-09', '2026-04-05').status, 'due-soon');
  assert.equal(deadlineStatus('2026-04-09', '2026-03-20').status, 'ok');
});

test('assessPrivilegeSafety flags privilege markers', () => {
  const bad = assessPrivilegeSafety('Documents are withheld as privileged attorney work product.');
  assert.equal(bad.privilegeSafe, false);
  assert.ok(bad.flags.some((f) => f.includes('work product')));
  const fine = assessPrivilegeSafety('Responsive emails from the general ledger are produced as BATE 0001-0450.');
  assert.equal(fine.privilegeSafe, true);
  assert.deepEqual(fine.flags, []);
});

test('draftResponse: objection + response entry with library grounds', () => {
  const e = draftResponse({
    requestNo: 'RFP 7', type: 'rfp',
    text: 'All documents concerning the Widget project.',
    responseText: 'Bates WIDG 0100-2200 produced.',
    objectionIds: ['overbroad', 'vague-ambiguous'],
  });
  assert.equal(e.status, 'objection-and-response');
  assert.equal(e.objections.length, 2);
  assert.ok(e.objections[0].authority.includes('FRCP'));
  assert.equal(e.privilegeSafe, true);
  assert.equal(e.versions.length, 1);
});

test('draftResponse: withholding is never marked privilege-safe', () => {
  const e = draftResponse({
    requestNo: 'ROG 3', type: 'interrogatory', text: 'Identify all counsel consulted.',
    privilegeBasis: 'attorney-client privilege',
  });
  assert.equal(e.status, 'withheld-logged');
  assert.equal(e.privilegeSafe, false);
  assert.ok(e.safetyFlags[0].includes('privilege log'));
});

test('draftResponse rejects unknown objection ids', () => {
  assert.throws(() => draftResponse({ requestNo: 'RFP 1', type: 'rfp', text: 'x', objectionIds: ['made-up'] }), /unknown objection ground/);
});

test('reviseDraft records deterministic per-round diffs', () => {
  const e = draftResponse({
    requestNo: 'RFP 7', type: 'rfp', text: 'All documents.',
    responseText: 'Bates WIDG 0100-2200 produced.', objectionIds: ['overbroad'],
  });
  reviseDraft(e, { responseText: 'Bates WIDG 0100-2200 and 4000-4310 produced.', objectionIds: [] }, 'M&C round 1 — narrowed scope agreed');
  assert.equal(e.versions.length, 2);
  assert.equal(e.versions[1].round, 1);
  assert.ok(e.versions[1].changes.some((c) => c.startsWith('responseText:')));
  assert.ok(e.versions[1].changes.some((c) => c.startsWith('objectionIds:')));
  assert.equal(e.objections.length, 0);
  assert.equal(e.status, 'response-only');
  // a no-op revision is recorded as such, never silently dropped
  reviseDraft(e, {});
  assert.ok(e.versions[2].changes.some((c) => c.includes('no substantive change')));
});

test('buildLog assembles deadline + counts + disclaimer', () => {
  const log = buildLog({
    servedDate: '2026-03-10', serviceMethod: 'mail',
    requests: [
      { requestNo: 'RFP 1', type: 'rfp', text: 'a', responseText: 'b' },
      { requestNo: 'ROG 1', type: 'interrogatory', text: 'c', objectionIds: ['privileged'] },
    ],
  });
  assert.equal(log.deadline.dueDate, '2026-04-12');
  assert.equal(log.counts.total, 2);
  assert.equal(log.counts.responseOnly, 1);
  assert.ok(log.disclaimer.includes('configurable FRCP defaults'));
});

test('toMarkdown renders one row per entry plus deadline', () => {
  const log = buildLog({
    servedDate: '2026-03-10',
    requests: [{ requestNo: 'RFP 1', type: 'rfp', text: 'a', responseText: 'b', objectionIds: ['vague-ambiguous'] }],
  });
  const md = toMarkdown(log);
  assert.ok(md.includes('| RFP 1 |'));
  assert.ok(md.includes('Vague and ambiguous'));
  assert.ok(md.includes('Response deadline'));
});

test('objection grounds library is non-trivial and FRCP-anchored', () => {
  assert.ok(DEFAULT_OBJECTION_GROUNDS.length >= 8);
  assert.ok(DEFAULT_OBJECTION_GROUNDS.every((g) => g.id && g.label && g.authority && g.description));
});
