import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYaml } from './yaml';
import { buildBoard, renderBoard, buildPortfolio, renderPortfolio } from './board';
import type { Playbook, BoardInput } from './board';
import { decide, diffBoards, boardHash } from './diff';
import { detectDrift } from './drift';
import type { DriftEntry } from './drift';
import { numericTokens } from './textutil';

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

test('yaml: inline " #" comments are stripped per YAML, values never mangled', () => {
  const y = parseYaml(
    'a: "hello world" # a note\nb: 3-year fixed term # plain note\nc: "hash # inside" # after quoted\nd: PB#1\nflag: true # yes\ne: # whole-value comment\nitems:\n  - one # list comment\n',
  ) as Record<string, unknown>;
  assert.equal(y.a, 'hello world'); // quoted value, trailing comment gone
  assert.equal(y.b, '3-year fixed term'); // plain scalar, comment gone
  assert.equal(y.c, 'hash # inside'); // # inside quotes is part of the value
  assert.equal(y.d, 'PB#1'); // # glued to a token is NOT a comment (YAML spec)
  assert.equal(y.flag, true); // scalar typing still applies after comment strip
  assert.equal(y.e, null); // value was only a comment
  assert.deepEqual(y.items, ['one']);
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

test('avoid similarity mode: verbatim deal-breaker text buried in a long clause is still a deal-breaker', () => {
  const yaml = `
playbookId: PB-TEST-3
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
        text: "Provider shall be liable for all consequential damages and lost profits of the customer without cap"
        threshold: 0.6
`;
  const playbook = parseYaml(yaml) as unknown as Playbook;
  const boilerplate =
    'Provider shall perform the services in a professional and workmanlike manner consistent with generally accepted ' +
    'industry standards, and shall comply with all applicable laws, regulations, and customer policies reasonably ' +
    'communicated in writing, including those governing data protection, information security, and confidentiality, ' +
    'throughout the term of this Agreement and any renewal thereof.';
  const out = buildBoard({
    playbook,
    contract: {
      name: 'T',
      clauses: [
        {
          id: 'L1',
          heading: 'Liability',
          text: `9.2 Provider shall be liable for all consequential damages and lost profits of the customer without cap. ${boilerplate}`,
        },
      ],
    },
  });
  assert.equal(out.rows[0].classification, 'deal_breaker');
  assert.ok(out.rows[0].reason.includes('uncapped'));
});

test('avoid similarity mode: near-verbatim (non-exact) deal-breaker buried in a long clause is still a deal-breaker', () => {
  const yaml = `
playbookId: PB-TEST-5
defaultApprover: Legal Operations
rules:
  - id: cap
    topic: Liability
    preferred:
      text: "Liability is capped at the fees paid."
    fallbacks: []
    avoid:
      - id: uncapped-variant
        mode: similarity
        text: "Provider shall be liable for all consequential damages and lost profits of the customer without cap"
        threshold: 0.8
`;
  const playbook = parseYaml(yaml) as unknown as Playbook;
  const boilerplate =
    'Provider shall perform the services in a professional and workmanlike manner consistent with generally accepted ' +
    'industry standards, and shall comply with all applicable laws, regulations, and customer policies reasonably ' +
    'communicated in writing, including those governing data protection, information security, and confidentiality, ' +
    'throughout the term of this Agreement and any renewal thereof.';
  // "will" vs "shall" makes the hit near-verbatim rather than contained; the long
  // clause dilutes whole-text similarity below the threshold, so only a
  // best-window score can catch it.
  const out = buildBoard({
    playbook,
    contract: {
      name: 'T',
      clauses: [
        {
          id: 'L2',
          heading: 'Liability',
          text: `9.3 Provider will be liable for all consequential damages and lost profits of the customer without cap. ${boilerplate}`,
        },
      ],
    },
  });
  assert.equal(out.rows[0].classification, 'deal_breaker');
  assert.ok(out.rows[0].reason.includes('uncapped-variant'));
});

test('deal-breaker on a rule without escalation routes to the default approver with an explicit reason', () => {
  const playbook: Playbook = {
    playbookId: 'PB-TEST-4',
    defaultApprover: 'Legal Operations',
    rules: [
      {
        id: 'term',
        topic: 'Term',
        preferred: { text: 'This Agreement continues for three (3) years.' },
        fallbacks: [],
        avoid: [{ mode: 'contains', text: 'in perpetuity' }],
      },
    ],
  };
  const out = buildBoard({
    playbook,
    contract: { name: 'T', clauses: [{ id: 'C1', heading: 'Term', text: 'This Agreement continues in perpetuity.' }] },
  });
  assert.equal(out.rows[0].classification, 'deal_breaker');
  assert.equal(out.rows[0].routedTo, 'Legal Operations');
  assert.match(out.rows[0].reason, /default approver/);
  const md = renderBoard(out);
  assert.ok(md.includes('Routed to: **Legal Operations**'));
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

test('word-form number spans numeric-match after normalization ("eighteen months" ≡ "eighteen (18) months")', () => {
  const [row] = board([{ id: 'C10', heading: 'Term', text: '3.1 This Agreement continues for eighteen months.' }]).rows;
  assert.equal(row.classification, 'deviates');
  assert.equal(row.matchedTier, 2);
  assert.equal(row.routedTo, 'General Counsel');
});

test('number-word restatement collapses: "two (2)" counts once, bare "18" still matches "eighteen (18)"', () => {
  const rows = board([
    { id: 'C11', heading: 'Term', text: 'This Agreement continues for two (2) years.' },
    { id: 'C12', heading: 'Term', text: 'This Agreement continues for 18 months.' },
  ]).rows;
  assert.equal(rows[0].matchedTier, 1);
  assert.equal(rows[1].classification, 'deviates');
  assert.equal(rows[1].matchedTier, 2);
});

test('playbook/contract side mismatch is flagged on the board and in every row reason', () => {
  const playbook = { ...(parseYaml(PLAYBOOK_YAML) as unknown as Playbook), side: 'sales' as const };
  const clause = { id: 'C1', heading: 'Term', text: 'This Agreement continues for three (3) years.' };
  const bad = buildBoard({ playbook, contract: { name: 'T', side: 'purchasing', clauses: [clause] } });
  assert.ok(bad.sideMismatch && bad.sideMismatch.includes('side mismatch'));
  assert.ok(bad.rows.every((r) => r.reason.includes('side mismatch')));
  assert.ok(renderBoard(bad).includes('side mismatch'));
  const good = buildBoard({ playbook, contract: { name: 'T', side: 'sales', clauses: [clause] } });
  assert.equal(good.sideMismatch, null);
  assert.ok(good.rows.every((r) => !r.reason.includes('side mismatch')));
});

test('deviates rows carry a deterministic redline vs the preferred standard, rendered as −/+ diff lines', () => {
  const [row] = board([{ id: 'C2', heading: 'Term', text: '3.1 This Agreement continues for two (2) years.' }]).rows;
  assert.equal(row.classification, 'deviates');
  assert.ok(row.redline, 'deviates rows must carry a redline');
  assert.equal(row.redline!.removals.join(' | '), 'two (2)');
  assert.ok(row.redline!.additions.join(' | ').includes('three (3)'));
  const md = renderBoard(board([{ id: 'C2', heading: 'Term', text: '3.1 This Agreement continues for two (2) years.' }]));
  assert.ok(md.includes('```diff'));
  assert.ok(md.includes('- two (2)'));
  assert.ok(md.includes('+ three (3)'));
});

test('decide() records a decision log bound to a board hash; rejects unknown and duplicate clauseIds', () => {
  const out = board([{ id: 'C2', heading: 'Term', text: '3.1 This Agreement continues for two (2) years.' }]);
  const log = decide(out, [{ clauseId: 'C2', decision: 'approve', by: 'Legal Operations', note: 'tier 1 acceptable for this deal' }]);
  assert.equal(log.contractName, 'Test NDA');
  assert.equal(log.playbookId, 'PB-TEST-1');
  assert.equal(log.boardHash, boardHash(out));
  assert.equal(log.decisions.length, 1);
  assert.equal(log.decisions[0].by, 'Legal Operations');
  assert.throws(() => decide(out, [{ clauseId: 'C99', decision: 'approve', by: 'X' }]), /C99/);
  assert.throws(() => decide(out, [
    { clauseId: 'C2', decision: 'approve', by: 'X' },
    { clauseId: 'C2', decision: 'reject', by: 'Y' },
  ]), /duplicate/);
});

test('diffBoards(): same clause moving tier 1 → tier 2 is changed, not new/resolved', () => {
  const a = board([{ id: 'C2', heading: 'Term', text: '3.1 This Agreement continues for two (2) years.' }]);
  const b = board([{ id: 'C2', heading: 'Term', text: '3.1 This Agreement continues for eighteen (18) months.' }]);
  const d = diffBoards(a, b);
  assert.deepEqual(d.summary, { new: 0, resolved: 0, changed: 1, unchanged: 0, dropped: 0 });
  assert.equal(d.changedRows[0].clauseId, 'C2');
  assert.ok(d.changedRows[0].changes.includes('matchedTier'));
  assert.ok(d.changedRows[0].changes.includes('routedTo'));
});

test('diffBoards(): new, resolved, and unchanged rows are separated', () => {
  const a = board([
    { id: 'C1', heading: 'Term', text: 'This Agreement continues for three (3) years.' },
    { id: 'C2', heading: 'Term', text: 'This Agreement continues for two (2) years.' },
  ]);
  const b = board([
    { id: 'C1', heading: 'Term', text: 'This Agreement continues for three (3) years.' },
    { id: 'C2', heading: 'Term', text: 'This Agreement continues for three (3) years.' },
    { id: 'C3', heading: 'Term', text: 'This Agreement continues for two (2) years.' },
  ]);
  const d = diffBoards(a, b);
  assert.deepEqual(d.summary, { new: 1, resolved: 1, changed: 0, unchanged: 1, dropped: 0 });
  assert.equal(d.newRows[0].clauseId, 'C3');
  assert.equal(d.resolvedRows[0].clauseId, 'C2');
});

test('diffBoards(): rows present only in v1 surface as droppedRows with a summary count', () => {
  const a = board([
    { id: 'C2', heading: 'Term', text: 'This Agreement continues for two (2) years.' },
    { id: 'C4', heading: 'Term', text: 'This Agreement continues in perpetuity.' },
  ]);
  const b = board([{ id: 'C2', heading: 'Term', text: 'This Agreement continues for two (2) years.' }]);
  const d = diffBoards(a, b);
  assert.deepEqual(d.summary, { new: 0, resolved: 0, changed: 0, unchanged: 1, dropped: 1 });
  assert.equal(d.droppedRows.length, 1);
  assert.equal(d.droppedRows[0].clauseId, 'C4');
  assert.equal(d.droppedRows[0].classification, 'deal_breaker'); // a deleted deal-breaker must not vanish silently
});

test('numericTokens: bare number words in prose ("no one party") are not quantities', () => {
  assert.deepEqual(numericTokens('No one party may assign this Agreement.'), []);
  assert.deepEqual(numericTokens('either party may do one or more of the foregoing'), []);
});

test('numericTokens: word-form numbers normalize only next to a unit or a "(n)" restatement', () => {
  assert.deepEqual(numericTokens('continues for eighteen (18) months'), ['18']); // restatement
  assert.deepEqual(numericTokens('continues for eighteen months'), ['18']); // unit
  assert.deepEqual(numericTokens('ninety days prior written notice'), ['90']); // unit
  assert.deepEqual(numericTokens('successive one-year terms'), ['1']); // hyphenated unit
});

test('bare number words inside the matched span cannot flip the numeric guard ("one to three (3) years" stays compliant)', () => {
  const [row] = board([{ id: 'C13', heading: 'Term', text: 'This Agreement continues for one to three (3) years.' }]).rows;
  assert.equal(row.classification, 'compliant');
  assert.equal(row.matchedTier, 'preferred');
});

test('beyond-playbook redline drops the leading heading tokens ("3.1 Term.") from removals', () => {
  const [row] = board([{ id: 'C14', heading: 'Term', text: '3.1 Term. This Agreement continues for six (6) months.' }]).rows;
  assert.equal(row.classification, 'deviates');
  assert.equal(row.matchedTier, null); // beyond playbook
  assert.ok(row.redline);
  assert.ok(!row.redline!.removals.some((r) => r.includes('3.1') || r.includes('Term')));
  assert.ok(row.redline!.removals.join(' | ').includes('six (6)'));
});

test('detectDrift(): ≥5 same-direction deviations in the window ⇒ Revise', () => {
  const entries: DriftEntry[] = Array.from({ length: 6 }, (_, i) => ({
    date: `2026-0${i + 1}-10`,
    ruleId: 'term',
    direction: 'term:shorter',
  }));
  const r = detectDrift(entries, { threshold: 5, lookbackMonths: 12 });
  assert.equal(r.rules.length, 1);
  assert.equal(r.rules[0].count, 6);
  assert.equal(r.rules[0].proposal, 'Revise');
  assert.equal(r.rules[0].directions[0].direction, 'term:shorter');
});

test('detectDrift(): split directions at threshold ⇒ Clarify', () => {
  const entries: DriftEntry[] = [
    ...Array.from({ length: 3 }, (_, i) => ({ date: `2026-0${i + 1}-10`, ruleId: 'term', direction: 'term:shorter' })),
    ...Array.from({ length: 3 }, (_, i) => ({ date: `2026-0${i + 4}-10`, ruleId: 'term', direction: 'term:longer' })),
  ];
  const r = detectDrift(entries, { threshold: 5, lookbackMonths: 12 });
  assert.equal(r.rules[0].proposal, 'Clarify');
});

test('detectDrift(): repeated avoid-language (deal_breaker kind) at threshold ⇒ Flag', () => {
  const entries: DriftEntry[] = Array.from({ length: 5 }, (_, i) => ({
    date: `2026-0${i + 1}-10`,
    ruleId: 'term',
    direction: 'term:perpetual',
    kind: 'deal_breaker' as const,
  }));
  const r = detectDrift(entries, { threshold: 5, lookbackMonths: 12 });
  assert.equal(r.rules[0].proposal, 'Flag');
});

test('detectDrift(): rejects impossible calendar dates', () => {
  assert.throws(() => detectDrift([{ date: '2026-99-99', ruleId: 'term', direction: 'term:shorter' }]), /2026-99-99/);
  assert.throws(() => detectDrift([{ date: '2026-02-30', ruleId: 'term', direction: 'term:shorter' }]), /2026-02-30/);
});

test('detectDrift(): entries older than the lookback window are excluded', () => {
  const entries: DriftEntry[] = [
    ...Array.from({ length: 4 }, (_, i) => ({ date: `2024-0${i + 1}-10`, ruleId: 'term', direction: 'term:shorter' })),
    { date: '2026-05-10', ruleId: 'term', direction: 'term:shorter' },
    { date: '2026-06-10', ruleId: 'term', direction: 'term:shorter' },
  ];
  const r = detectDrift(entries, { threshold: 5, lookbackMonths: 12 });
  assert.equal(r.asOf, '2026-06-10');
  assert.equal(r.rules[0].count, 2);
  assert.equal(r.rules[0].proposal, null);
});

test('buildPortfolio(): per-rule rollup sums deviation counts across contracts', () => {
  const playbook = parseYaml(PLAYBOOK_YAML) as unknown as Playbook;
  const p = buildPortfolio({
    playbook,
    contracts: [
      {
        name: 'NDA A',
        clauses: [
          { id: 'A1', heading: 'Term', text: 'This Agreement continues for three (3) years.' },
          { id: 'A2', heading: 'Term', text: 'This Agreement continues for two (2) years.' },
        ],
      },
      {
        name: 'NDA B',
        clauses: [{ id: 'B1', heading: 'Term', text: 'This Agreement continues for two (2) years.' }],
      },
    ],
  });
  assert.equal(p.boards.length, 2);
  const term = p.rollup.find((r) => r.ruleId === 'term')!;
  assert.equal(term.clauses, 3);
  assert.equal(term.compliant, 1);
  assert.equal(term.deviates, 2);
  assert.equal(term.deviationRate, 2 / 3);
  const md = renderPortfolio(p);
  assert.ok(md.includes('| term |'));
  assert.ok(md.includes('NDA A'));
  assert.ok(md.includes('NDA B'));
});

test('renderBoard(): includes the per-rule deviation-frequency rollup table and resolved thresholds', () => {
  const out = board([
    { id: 'C1', heading: 'Term', text: 'This Agreement continues for three (3) years.' },
    { id: 'C2', heading: 'Term', text: 'This Agreement continues for two (2) years.' },
    { id: 'C3', heading: 'Boilerplate', text: 'Notice clause.' },
  ]);
  assert.deepEqual(out.thresholds, { preferred: 0.7, fallback: 0.7, topic: 0.3 });
  const md = renderBoard(out);
  assert.ok(md.includes('| term |'));
  assert.ok(md.includes('—'));
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
