/** node:test suite for discovery-response-log core. Run: node --test core/ */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OBJECTION_GROUNDS, DEFAULT_SERVICE_EXTENSIONS,
  addDays, diffDays, calculateDeadline, deadlineStatus,
  assessPrivilegeSafety, draftResponse, reviseDraft, buildLog, toMarkdown,
  setReviewState, assertReleasable, toCSV,
} from './core.js';
import { readFileSync } from 'node:fs';

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

// ---------------------------------------------------------------------------
// Citation-manifest check (plan improvement 1)
// ---------------------------------------------------------------------------

test('citations outside the production manifest are flagged', () => {
  const log = buildLog(
    {
      servedDate: '2026-03-10',
      requests: [{
        requestNo: 'RFP 2', type: 'rfp', text: 'x',
        responseText: 'Vestra produces Bates VEST 0001-0500.',
        citations: ['VEST 0001-0500', 'VEST 9999'],
      }],
    },
    { productionManifest: [{ prefix: 'VEST', start: 1, end: 5000 }] },
  );
  const e = log.entries[0];
  assert.deepEqual(e.citations, ['VEST 0001-0500', 'VEST 9999']);
  assert.equal(e.citationFlags.length, 1);
  assert.ok(e.citationFlags[0].includes('VEST 9999'));
  assert.equal(log.counts.citationFlags, 1);
});

test('unparseable citations and foreign prefixes are flagged, not guessed', () => {
  const log = buildLog(
    {
      servedDate: '2026-03-10',
      requests: [{
        requestNo: 'RFP 3', type: 'rfp', text: 'x',
        citations: ['see the deposition', 'WIDG 0100'],
      }],
    },
    { productionManifest: [{ prefix: 'VEST', start: 1, end: 5000 }] },
  );
  const flags = log.entries[0].citationFlags;
  assert.equal(flags.length, 2);
  assert.ok(flags.some((f) => f.includes('see the deposition')));
  assert.ok(flags.some((f) => f.includes('WIDG 0100')));
});

// ---------------------------------------------------------------------------
// reviseDraft honors config + throws on unknown grounds (plan improvement 2)
// ---------------------------------------------------------------------------

test('reviseDraft validates objection ids against config and throws on unknown', () => {
  const custom = [{ id: 'custom-ground', label: 'C', authority: 'State R. 33', description: 'Y' }];
  const e = draftResponse({ requestNo: 'RFP 1', type: 'rfp', text: 'a' }, { objectionGrounds: custom });
  reviseDraft(e, { objectionIds: ['custom-ground'] }, 'M&C round 1', { objectionGrounds: custom });
  assert.equal(e.objections[0].id, 'custom-ground'); // currently silently dropped -> fails pre-fix
  assert.throws(() => reviseDraft(e, { objectionIds: ['nope'] }, 'bad'), /unknown objection ground/);
});

// ---------------------------------------------------------------------------
// Release gate (plan improvement 3)
// ---------------------------------------------------------------------------

test('reviewState defaults to draft; assertReleasable throws until approved', () => {
  const log = buildLog({
    servedDate: '2026-03-10',
    requests: [{ requestNo: 'RFP 1', type: 'rfp', text: 'a', responseText: 'b' }],
  });
  assert.equal(log.entries[0].reviewState, 'draft');
  assert.throws(() => assertReleasable(log), /not approved|draft/);
  setReviewState(log.entries[0], 'in-review');
  assert.throws(() => assertReleasable(log), /in-review/);
  setReviewState(log.entries[0], 'approved');
  assert.equal(assertReleasable(log), true);
});

test('assertReleasable blocks privilege-unsafe drafts even when approved', () => {
  const log = buildLog({
    servedDate: '2026-03-10',
    requests: [{ requestNo: 'RFP 9', type: 'rfp', text: 'a', responseText: 'See privileged work product memo.' }],
  });
  setReviewState(log.entries[0], 'approved');
  assert.throws(() => assertReleasable(log), /privilege|RFP 9/);
});

test('setReviewState rejects invalid states loudly', () => {
  const e = draftResponse({ requestNo: 'RFP 1', type: 'rfp', text: 'a' });
  assert.throws(() => setReviewState(e, 'signed-off'), /invalid reviewState/);
});

// ---------------------------------------------------------------------------
// Stipulated extensions, FRCP 29(b) (plan improvement 4)
// ---------------------------------------------------------------------------

test('FRCP 29(b) stipulated extension shifts due date and is audited', () => {
  const d = calculateDeadline({
    servedDate: '2026-03-10', serviceMethod: 'mail',
    extensions: [{ days: 14, basis: 'stipulation between counsel', agreedDate: '2026-03-24' }],
  });
  assert.equal(d.dueDate, '2026-04-26'); // 2026-04-12 base + 14
  assert.equal(d.stipulatedDays, 14);
  assert.ok(d.calculation.some((l) => l.includes('FRCP 29(b)') && l.includes('14') && l.includes('2026-03-24')));
});

test('stipulated extensions with invalid day counts are rejected', () => {
  assert.throws(
    () => calculateDeadline({ servedDate: '2026-03-10', extensions: [{ days: 0, basis: 'x' }] }),
    /invalid stipulated extension/,
  );
});

// ---------------------------------------------------------------------------
// Deterministic ids (plan improvement 5)
// ---------------------------------------------------------------------------

test('ids derive from requestNo; repeated builds deep-equal', () => {
  const params = {
    servedDate: '2026-03-10',
    requests: [
      { requestNo: 'RFP 7', type: 'rfp', text: 'a', responseText: 'b' },
      { requestNo: 'ROG 3', type: 'interrogatory', text: 'c' },
    ],
  };
  const a = buildLog(params);
  const b = buildLog(params);
  assert.deepEqual(a, b); // module counter would give dr-001..002 then dr-003..004
  assert.equal(a.entries[0].id, 'dr-rfp-7');
  assert.equal(a.entries[1].id, 'dr-rog-3');
});

test('buildLog rejects duplicate request numbers within a set', () => {
  assert.throws(
    () => buildLog({ servedDate: '2026-03-10', requests: [
      { requestNo: 'RFP 1', type: 'rfp', text: 'a' },
      { requestNo: 'RFP 1', type: 'rfp', text: 'b' },
    ] }),
    /duplicate requestNo/,
  );
});

// ---------------------------------------------------------------------------
// Export parity: toCSV + markdown diff table (plan improvement 6)
// ---------------------------------------------------------------------------

test('toCSV emits a header plus one row per entry, with CSV escaping', () => {
  const log = buildLog(
    {
      servedDate: '2026-03-10',
      requests: [{ requestNo: 'RFP 1', type: 'rfp', text: 'a', responseText: 'b', objectionIds: ['comma-ground'] }],
    },
    { objectionGrounds: [...DEFAULT_OBJECTION_GROUNDS,
      { id: 'comma-ground', label: 'Overbroad, as to time period', authority: 'FRCP 26(b)(1)', description: 'x' }] },
  );
  const rows = toCSV(log).trim().split('\n');
  assert.equal(rows.length, 2);
  assert.ok(rows[0].startsWith('requestNo,'));
  assert.ok(rows[1].includes('"Overbroad, as to time period"'));
  assert.ok(rows[1].endsWith(',draft,'));
});

test('toMarkdown includes a per-round diff table after revisions', () => {
  const log = buildLog({
    servedDate: '2026-03-10',
    requests: [{ requestNo: 'RFP 1', type: 'rfp', text: 'a', responseText: 'first draft' }],
  });
  reviseDraft(log.entries[0], { responseText: 'second draft' }, 'M&C round 1 — narrowed');
  const md = toMarkdown(log);
  assert.ok(md.includes('responseText:'));
  assert.ok(md.includes('M&C round 1 — narrowed'));
  assert.ok(md.includes('first draft'));
  assert.ok(md.includes('second draft'));
});

// ---------------------------------------------------------------------------
// Privilege-screen context rules (plan improvement 7)
// ---------------------------------------------------------------------------

test('waiver boilerplate does not trip the privilege screen', () => {
  const r = assessPrivilegeSafety(
    'Vestra produces Bates VEST 0001-0500 without waiver of privilege and work product.',
  );
  assert.equal(r.privilegeSafe, true);
  assert.deepEqual(r.flags, []);
});

test('plain negation does not trip the privilege screen', () => {
  assert.equal(assessPrivilegeSafety('The requested files are not privileged.').privilegeSafe, true);
  assert.equal(assessPrivilegeSafety('Nothing is withheld from this production.').privilegeSafe, true);
  // affirmative mentions still flag
  assert.equal(assessPrivilegeSafety('These files are privileged.').privilegeSafe, false);
});

test('config.privilegeMarkers overrides the default marker list', () => {
  const r = assessPrivilegeSafety('The AX-9 appendix is attached.', { privilegeMarkers: ['ax-9 appendix'] });
  assert.equal(r.privilegeSafe, false);
  assert.ok(r.flags[0].includes('ax-9 appendix'));
});

// ---------------------------------------------------------------------------
// Examples stay in sync with core behavior (byte-identical rebuild)
// ---------------------------------------------------------------------------

test('examples/output.json matches a fresh deterministic rebuild', () => {
  const input = JSON.parse(readFileSync(new URL('../examples/input.json', import.meta.url), 'utf8'));
  const log = buildLog(input, input.config || {});
  for (const round of input.meetAndConferRounds || []) {
    const entry = log.entries.find((e) => e.requestNo === round.requestNo);
    reviseDraft(entry, round.patch, round.label, input.config || {});
  }
  const output = JSON.parse(readFileSync(new URL('../examples/output.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    { deadline: log.deadline, counts: log.counts, entries: log.entries },
    { deadline: output.deadline, counts: output.counts, entries: output.entries },
  );
});
