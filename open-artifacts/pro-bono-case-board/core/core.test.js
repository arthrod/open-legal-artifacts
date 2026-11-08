import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBoard, transition, matchScore, rankVolunteers, toCSV, renderBoard, toICS, parseRows, diffBoards, WORKFLOW } from './core.js';

const AS_OF = '2026-11-07';

const VOLUNTEERS = [
  { id: 'V-01', name: 'D. Whitfield (fictional)', skills: ['housing', 'tenant-defense', 'spanish'] },
  { id: 'V-02', name: 'M. Sandoval (fictional)', skills: ['housing', 'benefits', 'spanish'] },
  { id: 'V-03', name: 'K. Osei (fictional)', skills: ['family', 'spanish'] },
  { id: 'V-04', name: 'R. Aronov (fictional)', skills: ['housing', 'tenant-defense', 'benefits', 'spanish'] },
];

function case_(partial) {
  return {
    id: 'PB-2026-010',
    client: 'C. Moreau (fictional)',
    problem: 'eviction defense',
    state: 'triage',
    openedDate: '2026-10-20',
    lastActivityDate: '2026-11-01',
    requiredSkills: ['housing'],
    optionalSkills: ['spanish'],
    ...partial,
  };
}

// ---------------------------------------------------------- workflow

test('legal transition applies and returns a new case object', () => {
  const r = transition(case_({ state: 'intake' }), 'triage');
  assert.equal(r.ok, true);
  assert.equal(r.case_.state, 'triage');
});

test('illegal transition is rejected with allowed list', () => {
  const r = transition(case_({ state: 'intake' }), 'active');
  assert.equal(r.ok, false);
  assert.match(r.error, /intake → active not allowed/);
  assert.match(r.error, /triage, withdrawn/);
});

test('closure without outcome is blocked', () => {
  const r = transition(case_({ state: 'closing' }), 'closed');
  assert.equal(r.ok, false);
  assert.match(r.error, /without an outcome/);
  const ok = transition(case_({ state: 'closing', outcome: 'favorable-settlement' }), 'closed');
  assert.equal(ok.ok, true);
});

test('closed and withdrawn are terminal states', () => {
  assert.deepEqual(WORKFLOW.transitions.closed, []);
  assert.deepEqual(WORKFLOW.transitions.withdrawn, []);
});

test('placement fall-through returns a case to ready', () => {
  assert.equal(transition(case_({ state: 'placed' }), 'ready').ok, true);
});

// ---------------------------------------------------------- matching

test('match score: all required + all optional = 100', () => {
  const c = { requiredSkills: ['housing'], optionalSkills: ['spanish'] };
  assert.equal(matchScore(c, VOLUNTEERS[0]).score, 100);
  assert.equal(matchScore(c, VOLUNTEERS[0]).eligible, true);
});

test('match score: required only = 70; missing required is ineligible with tags listed', () => {
  const c = { requiredSkills: ['housing'], optionalSkills: [] };
  const m = matchScore(c, VOLUNTEERS[0]); // skills: housing, tenant-defense, spanish
  assert.equal(m.score, 70);
  const miss = matchScore(c, VOLUNTEERS[2]); // family, spanish — no housing
  assert.equal(miss.eligible, false);
  assert.deepEqual(miss.missingRequired, ['housing']);
  assert.equal(miss.score, 0);
});

test('match score: partial optional credit is proportional', () => {
  const c = { requiredSkills: ['housing'], optionalSkills: ['spanish', 'benefits'] };
  const m = matchScore(c, VOLUNTEERS[1]); // housing, benefits, spanish -> 70 + 30
  assert.equal(m.score, 100);
  const m2 = matchScore(c, VOLUNTEERS[0]); // housing + spanish only -> 70 + 15
  assert.equal(m2.score, 85);
});

test('case with no required tags matches on optional only and stays eligible', () => {
  const c = { requiredSkills: [], optionalSkills: ['spanish'] };
  const m = matchScore(c, VOLUNTEERS[2]);
  assert.equal(m.eligible, true);
  assert.equal(m.score, 30);
});

test('ranking is deterministic: eligible first, score desc, id asc tie-break', () => {
  const c = { requiredSkills: ['housing'], optionalSkills: ['tenant-defense', 'benefits', 'spanish'] };
  const ranked = rankVolunteers(c, VOLUNTEERS, 10).map((m) => `${m.volunteerId}:${m.score}`);
  assert.deepEqual(ranked, ['V-04:100', 'V-01:90', 'V-02:90', 'V-03:10']); // V-03 ineligible keeps partial optional credit only in score
  // same input again -> identical order (determinism)
  assert.deepEqual(rankVolunteers(c, VOLUNTEERS, 10).map((m) => m.volunteerId),
    rankVolunteers(c, VOLUNTEERS, 10).map((m) => m.volunteerId));
});

// ------------------------------------------------------------- board

test('stale flag fires past threshold and respects configurable staleDays', () => {
  const c = case_({ lastActivityDate: '2026-09-01' }); // 67 days before AS_OF
  const def = buildBoard({ asOf: AS_OF, cases: [c], volunteers: VOLUNTEERS });
  assert.equal(def.cases[0].stale, true);
  assert.equal(def.cases[0].staleFor, 67);
  const lenient = buildBoard({ asOf: AS_OF, cases: [c], volunteers: VOLUNTEERS, settings: { staleDays: 90 } });
  assert.equal(lenient.cases[0].stale, false);
  assert.equal(lenient.impact.staleCases, 0);
});

test('closed and withdrawn cases are never stale and get no matches', () => {
  const b = buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS, cases: [
    case_({ id: 'C1', state: 'closed', outcome: 'represented', lastActivityDate: '2025-01-01', hours: 12 }),
    case_({ id: 'C2', state: 'withdrawn', lastActivityDate: '2025-01-01' }),
  ] });
  assert.equal(b.cases.every((c) => !c.stale), true);
  assert.equal(b.cases.every((c) => c.matches.length === 0), true);
});

test('data-integrity flags: placed without volunteer, unknown volunteer, closed without outcome, bad date', () => {
  const b = buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS, cases: [
    case_({ id: 'C1', state: 'placed' }),
    case_({ id: 'C2', state: 'active', volunteerId: 'V-99' }),
    case_({ id: 'C3', state: 'closed', outcome: null }),
    case_({ id: 'C4', lastActivityDate: 'yesterday-ish' }),
  ] });
  const f = Object.fromEntries(b.cases.map((c) => [c.id, c.flags.join(' | ')]));
  assert.match(f.C1, /no volunteerId set/);
  assert.match(f.C2, /not in roster/);
  assert.match(f.C3, /closed without outcome/);
  assert.match(f.C4, /staleness unverified/);
  assert.equal(b.impact.flaggedCases, 4);
});

test('impact rollups: hours, outcomes, placement counts', () => {
  const b = buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS, cases: [
    case_({ id: 'C1', state: 'closed', outcome: 'favorable-settlement', hours: 10.5, volunteerId: 'V-01', lastActivityDate: '2026-11-05' }),
    case_({ id: 'C2', state: 'closed', outcome: 'favorable-settlement', hours: 4, volunteerId: 'V-02', lastActivityDate: '2026-11-05' }),
    case_({ id: 'C3', state: 'active', volunteerId: 'V-03', hours: 6, lastActivityDate: '2026-11-06' }),
    case_({ id: 'C4', state: 'withdrawn', lastActivityDate: '2026-11-06' }),
    case_({ id: 'C5', state: 'ready', lastActivityDate: '2026-11-06' }),
  ] });
  assert.equal(b.impact.closedCases, 2);
  assert.equal(b.impact.withdrawnCases, 1);
  assert.equal(b.impact.openCases, 2); // C3 active + C5 ready
  assert.equal(b.impact.placedCases, 3); // C1, C2, C3
  assert.equal(b.impact.totalHours, 20.5);
  assert.deepEqual(b.impact.byOutcome, { 'favorable-settlement': 2 });
});

test('CSV has header + one row per case', () => {
  const b = buildBoard({ asOf: AS_OF, volunteers: [], cases: [case_({ id: 'A' }), case_({ id: 'B', client: 'X, Y (fictional)' })] });
  const lines = toCSV(b).trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith('id,client,problem,state'));
  assert.ok(lines[2].includes('"X, Y (fictional)"'));
});

test('renderBoard shows rollup, stale marker, and top match', () => {
  const b = buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS, cases: [
    case_({ id: 'PB-1', requiredSkills: ['housing'], optionalSkills: ['spanish'], lastActivityDate: '2026-10-01' }),
  ] });
  const md = renderBoard(b);
  assert.match(md, /# Pro bono case board — as of 2026-11-07/);
  assert.match(md, /STALE/);
  assert.match(md, /V-01 100/); // V-01 and V-04 both score 100; id-asc tie-break picks V-01
  assert.match(md, /Volunteer hours logged/);
});

test('invalid asOf throws instead of computing nonsense', () => {
  assert.throws(() => buildBoard({ asOf: 'Nov 7', cases: [], volunteers: [] }), /ISO/);
});

// --------------------------------------------------------- deadlines

test('deadline due within 7 days is warn with daysTo computed', () => {
  const b = buildBoard({ asOf: AS_OF, volunteers: [], cases: [
    case_({ id: 'D1', deadlines: [{ label: 'answer filing', dueDate: '2026-11-10', kind: 'court' }] }),
  ] });
  const dl = b.cases[0].deadlines[0];
  assert.equal(dl.daysTo, 3);
  assert.equal(dl.overdue, false);
  assert.equal(dl.severity, 'warn');
  assert.match(b.cases[0].flags.join(' | '), /due in 3 d/);
});

test('overdue court deadline is critical and counted in impact.overdueDeadlines (open cases only)', () => {
  const b = buildBoard({ asOf: AS_OF, volunteers: [], cases: [
    case_({ id: 'D1', state: 'active', deadlines: [
      { label: 'hearing', dueDate: '2026-11-05', kind: 'court' },        // 2 d overdue, court
      { label: 'report', dueDate: '2026-11-04', kind: 'administrative' }, // 3 d overdue, non-court
    ] }),
    case_({ id: 'D2', state: 'closed', outcome: 'advice-only', lastActivityDate: '2026-11-01',
      deadlines: [{ label: 'old hearing', dueDate: '2026-11-01', kind: 'court' }] }),
  ] });
  const [hearing, report] = b.cases[0].deadlines;
  assert.equal(hearing.severity, 'critical');
  assert.equal(hearing.overdue, true);
  assert.equal(hearing.daysTo, -2);
  assert.equal(report.severity, 'warn'); // overdue non-court = warn, not critical
  assert.equal(b.impact.overdueDeadlines, 2); // closed case D2 not counted
  assert.match(b.cases[0].flags.join(' | '), /OVERDUE court deadline "hearing" \(2 d overdue\)/);
});

test('toICS emits one all-day VEVENT per deadline, escaped, deterministic', () => {
  const b = buildBoard({ asOf: AS_OF, volunteers: [], cases: [
    case_({ id: 'D1', deadlines: [
      { label: 'hearing, part 1; pm session', dueDate: '2026-11-10', kind: 'court' },
      { label: 'report', dueDate: '2026-11-20', kind: 'administrative' },
    ] }),
  ] });
  const ics = toICS(b);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /VERSION:2\.0/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261110/);
  assert.match(ics, /DTEND;VALUE=DATE:20261111/); // all-day: end is exclusive next day
  assert.match(ics, /SUMMARY:D1 hearing\\, part 1\\; pm session \[court\]/); // comma/semicolon escaped
  assert.match(ics, /DTSTAMP:20261107T000000Z/); // deterministic stamp from asOf
  assert.equal(ics, toICS(b));
});

// ------------------------------------------------------- intake parse

test('parseRows: messy CSV flags per-row issues and drafts still build a board', () => {
  const messy = [
    'id,client,problem,state,openedDate,lastActivityDate,requiredSkills,volunteerId',
    'PB-1,Ann X (fictional),eviction defense,intake,2026-11-01,2026-11-02,housing;spanish,V-01',
    'PB-1,Dup Id (fictional),wage theft,intake,11/3/2026,2026-11-03,consumer,',
    'PB-2,Bo Y (fictional),custody,mystery,2026-11-01,2026-11-05,family,V-02',
  ].join('\n');
  const parsed = parseRows(messy);
  assert.equal(parsed.cases.length, 3);
  const rowIssues = parsed.issues.map((i) => `row ${i.row}: ${i.issues.join(' | ')}`).join(' ;; ');
  assert.match(rowIssues, /row 3: .*duplicate id "PB-1"/);
  assert.match(rowIssues, /row 3: .*openedDate "11\/3\/2026" is not an ISO date/);
  assert.match(rowIssues, /row 4: .*unknown state "mystery"/);
  const board = buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS, cases: parsed.cases });
  assert.equal(board.cases.length, 3); // tolerant: flagged rows still board-buildable
  assert.match(board.cases[1].flags.join(' | '), /openedDate missing or not ISO — SLA aging unverified/); // bad date carried as flag
});

test('parseRows: never throws — empty, whitespace, non-string, missing header columns', () => {
  assert.deepEqual(parseRows(''), { cases: [], issues: [] });
  assert.deepEqual(parseRows('   \n  \n'), { cases: [], issues: [] });
  assert.equal(parseRows(null).cases.length, 0);
  const noHeader = parseRows('id,state\nPB-1,intake');
  assert.match(noHeader.issues.map((i) => i.issues.join(' ')).join(' '),
    /header missing required column\(s\): client, problem, openedDate, lastActivityDate/);
  assert.equal(noHeader.cases[0].state, 'intake');
});

// ---------------------------------------------------------- capacity

test('volunteer capacity rollup: 6 open > default maxOpen 5 → at capacity, with hours and staleOwned', () => {
  const six = Array.from({ length: 6 }, (_, i) =>
    case_({ id: `S-${i + 1}`, state: 'active', volunteerId: 'V-01', hours: 2,
      lastActivityDate: i === 0 ? '2026-09-01' : '2026-11-06' })); // S-1 stale
  const b = buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS, cases: six });
  const v = b.impact.byVolunteer['V-01'];
  assert.equal(v.openCases, 6);
  assert.equal(v.hours, 12);
  assert.equal(v.staleOwned, 1);
  assert.equal(v.atCapacity, true);
  assert.equal(buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS,
    cases: six.slice(0, 4) }).impact.byVolunteer['V-01'].atCapacity, false); // 4 ≤ 5 default
  assert.equal(buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS,
    cases: six.slice(0, 5), settings: { maxOpenPerVolunteer: 4 } }).impact.byVolunteer['V-01'].atCapacity, true); // 5 > 4
});

// ---------------------------------------------------------- stage SLA

test('stage SLA: intake case open 10 d breaches the 7 d SLA and lands in aging buckets', () => {
  const b = buildBoard({ asOf: AS_OF, volunteers: [], cases: [
    case_({ id: 'SL-1', state: 'intake', openedDate: '2026-10-28', lastActivityDate: '2026-11-06' }), // fresh but stuck
    case_({ id: 'SL-2', state: 'ready', openedDate: '2026-11-05', lastActivityDate: '2026-11-06' }),
  ] });
  const sl = b.cases[0];
  assert.equal(sl.daysOpen, 10);
  assert.equal(sl.slaBreached, true);
  assert.match(sl.flags.join(' | '), /in intake 10 d > SLA 7 d/);
  assert.equal(b.cases[1].slaBreached, false);
  assert.equal(b.impact.slaBreaches, 1);
  assert.deepEqual(b.impact.aging, { '0-7': 1, '8-30': 1, '31-90': 0, '>90': 0 });
  const custom = buildBoard({ asOf: AS_OF, volunteers: [], settings: { stageSla: { intake: 30 } },
    cases: [case_({ id: 'SL-1', state: 'intake', openedDate: '2026-10-28', lastActivityDate: '2026-11-06' })] });
  assert.equal(custom.cases[0].slaBreached, false); // configurable per stage
});

// ---------------------------------------------------------- board diff

test('diffBoards: exact added / stage-changed / deadline-moved / closed diff on fixtures', () => {
  const base = (over = {}) => [
    case_({ id: 'X', state: over.X ?? 'intake', openedDate: '2026-11-01', lastActivityDate: '2026-11-06' }),
    case_({ id: 'Y', state: 'ready', openedDate: '2026-11-01', lastActivityDate: '2026-11-06',
      deadlines: [{ label: 'hearing', dueDate: over.hearing ?? '2026-12-01', kind: 'court' }] }),
    case_({ id: 'Z', state: over.Z ?? 'active', outcome: over.Z === 'closed' ? 'favorable-settlement' : undefined,
      volunteerId: 'V-01', openedDate: '2026-10-01', lastActivityDate: '2026-11-06' }),
  ];
  const bA = buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS, cases: base() });
  const bC = buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS, cases: [...base({ X: 'triage', hearing: '2026-12-15', Z: 'closed' }),
    case_({ id: 'W', state: 'intake', openedDate: '2026-11-07', lastActivityDate: '2026-11-07' })] });
  assert.deepEqual(diffBoards(bA, bC), {
    added: ['W'],
    removed: [],
    stageChanged: [{ id: 'X', from: 'intake', to: 'triage' }],
    closed: [{ id: 'Z', from: 'active', to: 'closed' }],
    deadlineMoved: [{ id: 'Y', label: 'hearing', from: '2026-12-01', to: '2026-12-15' }],
  });
  assert.deepEqual(diffBoards(bA, bC), diffBoards(bA, bC)); // deterministic across runs
  assert.deepEqual(diffBoards(bA, bA), { added: [], removed: [], stageChanged: [], closed: [], deadlineMoved: [] });
});

// -------------------------------------------------------- render/demo

test('renderBoard shows deadline severity, SLA breaches, and volunteer capacity', () => {
  const b = buildBoard({ asOf: AS_OF, volunteers: VOLUNTEERS, cases: [
    case_({ id: 'PB-1', volunteerId: 'V-01', state: 'active',
      deadlines: [{ label: 'hearing', dueDate: '2026-11-05', kind: 'court' }] }),
    case_({ id: 'PB-2', state: 'intake', openedDate: '2026-10-20', lastActivityDate: '2026-11-06' }),
  ] });
  const md = renderBoard(b);
  assert.match(md, /## Volunteer capacity/);
  assert.match(md, /hearing .*2026-11-05.*critical/);
  assert.match(md, /SLA breaches: \*\*1\*\*/);
});

test('demo stays self-contained: no external src= or href="http links', () => {
  const html = readFileSync(new URL('../demo/index.html', import.meta.url), 'utf8');
  assert.equal(/src\s*=\s*["']https?:/.test(html), false);
  assert.equal(/href\s*=\s*["']https?:/.test(html), false);
});
