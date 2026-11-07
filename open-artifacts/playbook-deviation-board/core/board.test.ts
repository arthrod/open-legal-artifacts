import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml } from './yaml';
import { buildBoard, renderBoard } from './board';
import type { Playbook, BoardInput } from './board';

const PLAYBOOK_YAML = `
# fictional playbook for tests
playbookId: PB-TEST-1
defaultApprover: Legal Operations
rules:
  - id: term
    topic: Term
    preferred:
      label: "3-year term"
      text: "This Agreement continues for three (3) years."
    fallbacks:
      - tier: 1
        label: "2-year term"
        text: "This Agreement continues for two (2) years."
      - tier: 2
        label: "18-month term"
        text: "This Agreement continues for eighteen (18) months."
    avoid:
      - id: perpetual
        mode: contains
        text: "in perpetuity"
    escalation:
      approver: General Counsel
      minFallbackTier: 2
`;

test('yaml subset parser handles nested maps, lists of maps, scalars, comments', () => {
  const y = parseYaml(PLAYBOOK_YAML) as Record<string, unknown>;
  assert.equal(y.playbookId, 'PB-TEST-1');
  assert.equal(y.defaultApprover, 'Legal Operations');
  const rules = y.rules as Array<Record<string, unknown>>;
  assert.equal(rules.length, 1);
  assert.equal(rules[0].topic, 'Term');
  const fbs = rules[0].fallbacks as Array<Record<string, unknown>>;
  assert.equal(fbs[0].tier, 1);
  assert.equal(fbs[1].label, '18-month term');
  const avoid = rules[0].avoid as Array<Record<string, unknown>>;
  assert.equal(avoid[0].mode, 'contains');
  const esc = rules[0].escalation as Record<string, unknown>;
  assert.equal(esc.approver, 'General Counsel');
  assert.equal(esc.minFallbackTier, 2);
});

test('yaml parser handles top-level lists, booleans, numbers, null', () => {
  const y = parseYaml('items:\n  - 1\n  - two\n  - "three"\nflag: true\ncount: 42\nmissing:\nlast: false\n') as Record<string, unknown>;
  assert.deepEqual(y.items, [1, 'two', 'three']);
  assert.equal(y.flag, true);
  assert.equal(y.count, 42);
  assert.equal(y.missing, null);
  assert.equal(y.last, false);
});

test('yaml parser rejects malformed lines', () => {
  assert.throws(() => parseYaml('a: 1\n  broken line here\n'));
});

function board(clauses: BoardInput['contract']['clauses']) {
  const playbook = parseYaml(PLAYBOOK_YAML) as unknown as Playbook;
  return buildBoard({ playbook, contract: { name: 'Test NDA', clauses } });
}

test('verbatim preferred language inside a longer clause is compliant', () => {
  const [row] = board([{ id: 'C1', heading: 'Term', text: '3.1 This Agreement continues for three (3) years. Assignment requires consent.' }]).rows;
  assert.equal(row.classification, 'compliant');
  assert.equal(row.matchedTier, 'preferred');
  assert.equal(row.routedTo, null);
  assert.ok(row.clauseQuote!.text.includes('three (3) years'));
});

test('fallback tier 1 match is a deviation routed to the default approver', () => {
  const [row] = board([{ id: 'C2', heading: 'Term', text: '3.1 This Agreement continues for two (2) years.' }]).rows;
  assert.equal(row.classification, 'deviates');
  assert.equal(row.matchedTier, 1);
  assert.equal(row.routedTo, 'Legal Operations');
});

test('fallback tier 2 escalates to the named approver', () => {
  const [row] = board([{ id: 'C3', heading: 'Term', text: '3.1 This Agreement continues for eighteen (18) months.' }]).rows;
  assert.equal(row.classification, 'deviates');
  assert.equal(row.matchedTier, 2);
  assert.equal(row.routedTo, 'General Counsel');
});

test('avoid contains-match is a deal-breaker regardless of other language', () => {
  const [row] = board([{ id: 'C4', heading: 'Term', text: '3.1 This Agreement continues in perpetuity. Governing law: Delaware.' }]).rows;
  assert.equal(row.classification, 'deal_breaker');
  assert.equal(row.routedTo, 'General Counsel');
  assert.ok(row.reason.includes('perpetual'));
});

test('clause matching no tier is a beyond-playbook deviation', () => {
  const [row] = board([{ id: 'C5', heading: 'Term', text: '3.1 This Agreement continues until the parties complete the Pilot Project.' }]).rows;
  assert.equal(row.classification, 'deviates');
  assert.equal(row.matchedTier, null);
  assert.ok(row.reason.includes('beyond the playbook'));
  assert.equal(row.routedTo, 'General Counsel'); // escalation approver owns beyond-playbook terms
});

test('unmatched heading is unclassified and routed to the default approver', () => {
  const [row] = board([{ id: 'C6', heading: 'Governing Law', text: 'This Agreement is governed by Delaware law.' }]).rows;
  assert.equal(row.classification, 'unclassified');
  assert.equal(row.ruleId, null);
  assert.equal(row.routedTo, 'Legal Operations');
});

test('explicit ruleId overrides heading matching, unknown ruleId is unclassified', () => {
  const rows = board([
    { id: 'C7', heading: 'Duration', text: 'This Agreement continues for three (3) years.', ruleId: 'term' },
    { id: 'C8', heading: 'Term', text: 'This Agreement continues for three (3) years.', ruleId: 'nope' },
  ]).rows;
  assert.equal(rows[0].classification, 'compliant');
  assert.ok(rows[1].reason.includes('not found in playbook'));
  assert.equal(rows[1].classification, 'unclassified');
});

test('avoid similarity mode triggers on a close variant at its threshold', () => {
  const yaml = `
playbookId: PB-TEST-2
defaultApprover: Legal Operations
rules:
  - id: cap
    topic: Liability
    preferred:
      text: "Liability is capped at the fees paid."
    fallbacks: []
    avoid:
      - id: uncapped
        mode: similarity
        text: "Provider accepts unlimited liability for all consequential damages and lost profits"
        threshold: 0.6
`;
  const playbook = parseYaml(yaml) as unknown as Playbook;
  const out = buildBoard({
    playbook,
    contract: {
      name: 'T',
      clauses: [{ id: 'C9', heading: 'Liability', text: 'Provider accepts unlimited liability for all consequential damages and lost profits of customer.' }],
    },
  });
  assert.equal(out.rows[0].classification, 'deal_breaker');
  assert.ok(out.rows[0].reason.includes('uncapped'));
});

test('summary counts and markdown board render', () => {
  const out = board([
    { id: 'C1', heading: 'Term', text: 'This Agreement continues for three (3) years.' },
    { id: 'C2', heading: 'Term', text: 'This Agreement continues for two (2) years.' },
    { id: 'C3', heading: 'Term', text: 'This Agreement continues in perpetuity.' },
    { id: 'C4', heading: 'Boilerplate', text: 'This is a notice clause.' },
  ]);
  assert.deepEqual(out.summary, { compliant: 1, deviates: 1, dealBreaker: 1, unclassified: 1 });
  const md = renderBoard(out);
  assert.ok(md.includes('# Playbook deviation board — Test NDA'));
  assert.ok(md.includes('| C1 (Term) | term | compliant | preferred |'));
  assert.ok(md.includes('Routed to: **General Counsel**'));
});
