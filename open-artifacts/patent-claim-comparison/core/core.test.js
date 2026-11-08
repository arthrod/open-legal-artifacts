/** node:test suite for patent-claim-comparison core. Run: node --test core/ */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize, similarity, parseClaim, parseClaimSet,
  compareLimitations, compareClaimSets, toClaimChart,
  mapLimitationsToReference, flagConstructionRisks,
  buildClaimReferenceMatrix, toCSV, toSourcesCSV,
} from './core.js';

const CLAIM_1_A = `1. A thermal management system for a battery module, the system comprising:
a coolant channel defined through a stack of prismatic cells;
a temperature sensor array disposed on at least two faces of the stack;
a controller configured to modulate coolant flow based on the temperature sensor array; and
a pressure-relief valve in fluid communication with the coolant channel.`;

const CLAIM_1_B = `1. A thermal management system for a battery module, the system comprising:
a coolant channel defined through a stack of prismatic cells;
a temperature sensor array disposed on at least two faces of the stack;
a controller configured to modulate coolant flow based on the temperature sensor array and a discharge threshold; and
a pressure-relief valve in fluid communication with the coolant channel.`;

test('tokenize drops legalese stopwords and punctuation', () => {
  const t = tokenize('The controller is configured to modulate said coolant flow.');
  assert.ok(!t.has('the') && !t.has('said') && !t.has('configured'));
  assert.ok(t.has('controller') && t.has('modulate') && t.has('coolant'));
});

test('similarity: identical → 1, disjoint → 0, partial in between', () => {
  assert.equal(similarity('a coolant channel housing', 'a coolant channel housing'), 1);
  assert.equal(similarity('coolant channel housing', 'piezoelectric buzzer ring'), 0);
  const sAB = similarity('controller modulates coolant flow rate', 'controller modulates airflow rate');
  assert.ok(sAB > 0.3 && sAB < 1);
});

test('parseClaim splits independent claim into preamble + numbered limitations with spans', () => {
  const c = parseClaim(CLAIM_1_A);
  assert.equal(c.number, 1);
  assert.equal(c.type, 'independent');
  assert.equal(c.dependsOn, null);
  assert.equal(c.transitional, 'comprising');
  assert.equal(c.limitations.length, 4);
  assert.match(c.limitations[0].text, /^a coolant channel/i);
  assert.match(c.limitations[3].text, /pressure-relief valve/);
  // span anchors round-trip into the original text
  for (const l of c.limitations) {
    assert.equal(c.text.slice(l.span[0], l.span[1]).replace(/^[\s;,]+|[\s;,]+$/g, '').replace(/^(and|or|further)\s+/i, ''), l.text);
  }
});

test('parseClaim detects dependency and wherein boundaries', () => {
  const c = parseClaim(`3. The system of claim 1, wherein the controller derates the stack when any sensor exceeds 60C; and wherein the derating persists for at least 5 minutes.`);
  assert.equal(c.number, 3);
  assert.equal(c.type, 'dependent');
  assert.equal(c.dependsOn, 1);
  assert.equal(c.limitations.length, 2);
  assert.match(c.limitations[0].text, /controller derates/);
  assert.match(c.limitations[1].text, /derating persists/);
});

test('parseClaimSet splits a multi-claim document by leading claim numbers', () => {
  const set = parseClaimSet(`${CLAIM_1_A}\n${'2. The system of claim 1, wherein the coolant is a dielectric fluid.'}`);
  assert.equal(set.length, 2);
  assert.equal(set[0].number, 1);
  assert.equal(set[1].number, 2);
  assert.equal(set[1].dependsOn, 1);
});

test('compareLimitations classifies matched / modified / added / removed', () => {
  const a = parseClaim(CLAIM_1_A).limitations;
  const b = parseClaim(CLAIM_1_B).limitations;
  const { rows, counts } = compareLimitations(a, b);
  assert.equal(counts.matched, 3);   // channel, sensor array, relief valve
  assert.equal(counts.modified, 1);  // controller gains "and a discharge threshold"
  assert.equal(counts.removed, 0);
  assert.equal(counts.added, 0);
  const mod = rows.find((r) => r.relation === 'modified');
  assert.match(mod.aText, /controller/);
  assert.equal(mod.bSpan.length, 2);
});

test('compareLimitations: removed limitation yields explicit "no teaching found", never silence', () => {
  const a = parseClaim(CLAIM_1_A).limitations;
  const b = parseClaim(CLAIM_1_A).limitations.slice(0, 3); // drop the valve
  const { rows, counts } = compareLimitations(a, b);
  assert.equal(counts.removed, 1);
  const removed = rows.find((r) => r.relation === 'removed');
  assert.match(removed.aText, /pressure-relief valve/);
  assert.ok(removed.note.startsWith('no teaching found'));
  assert.equal(removed.bId, null);
});

test('compareLimitations: new limitation in B is "added"', () => {
  const a = parseClaim(CLAIM_1_A).limitations;
  const b = [...parseClaim(CLAIM_1_A).limitations,
    { id: 'L5', text: 'a dielectric fluid filling the coolant channel', span: [0, 10] }];
  const { counts } = compareLimitations(a, b);
  assert.equal(counts.added, 1);
  assert.equal(counts.removed, 0);
});

test('compareClaimSets totals across claims and tracks claim-level adds/removes', () => {
  const setA = `${CLAIM_1_A}\n2. The system of claim 1, wherein the coolant is a dielectric fluid.`;
  const setB = `${CLAIM_1_B}\n3. The system of claim 1, wherein the coolant is a dielectric fluid and includes a corrosion inhibitor.`;
  const res = compareClaimSets(setA, setB);
  assert.equal(res.claims.length, 3);
  assert.equal(res.totals.claimsOnlyInA, 1); // claim 2
  assert.equal(res.totals.claimsOnlyInB, 1); // claim 3
  assert.equal(res.totals.modified, 1);      // claim 1 controller limitation
  const claim1 = res.claims.find((c) => c.claimNo === 1);
  assert.equal(claim1.comparison.counts.matched, 3);
  assert.equal(res.noTeachingFound, 0); // unpaired claims are reported whole, not as missing teachings
});

test('dependency change between sets is flagged', () => {
  const setA = '1. A widget comprising: a housing; and a sensor.\n2. The widget of claim 1, wherein the sensor is optical.';
  const setB = '1. A widget comprising: a housing; and a sensor.\n2. The widget of claim 1, wherein the sensor is optical and wireless.';
  const res = compareClaimSets(setA, setB);
  const c2 = res.claims.find((c) => c.claimNo === 2);
  assert.equal(c2.dependencyChanged, false);
  const setB2 = '1. A widget comprising: a housing; and a sensor.\n2. The widget of claim 1, wherein the sensor is optical.';
  const setA2 = '1. A widget comprising: a housing; and a sensor.\n2. A widget wherein the sensor is optical.';
  const c2b = compareClaimSets(setA2, setB2).claims.find((c) => c.claimNo === 2);
  assert.equal(c2b.dependencyChanged, true);
});

test('determinism: identical inputs produce identical outputs', () => {
  const r1 = JSON.stringify(compareClaimSets(setAB(), setAB()));
  const r2 = JSON.stringify(compareClaimSets(setAB(), setAB()));
  assert.equal(r1, r2);
  function setAB() {
    return `${CLAIM_1_A}\n2. The system of claim 1, wherein the coolant is a dielectric fluid.`;
  }
});

test('toClaimChart renders explicit rows and totals, including no-teaching note', () => {
  const res = compareClaimSets(CLAIM_1_A, CLAIM_1_A.replace(/\na pressure-relief valve[^\n]*/, ''));
  const md = toClaimChart(res);
  assert.ok(md.includes('**removed**'));
  assert.ok(md.includes('no teaching found'));
  assert.ok(md.includes('never inferred'));
  assert.ok(md.includes('Totals:'));
});

// --- reference mapping (improvement 1) ---

const REF_TEXT = `The fictional reference discloses a thermal module. FIG. 1 shows a coolant channel defined through a stack of prismatic cells. A sensor skin is bonded to two faces. The housing is a moulded shell.`;

const CLAIM_REF = `1. A thermal management system comprising:
a coolant channel defined through a stack of prismatic cells;
a sensor skin bonded to two faces; and
a pressure-relief valve in fluid communication with the coolant channel.`;

test('mapLimitationsToReference: verbatim span slices to exact quote; partial and notFound are honest', () => {
  const { rows, counts } = mapLimitationsToReference(parseClaim(CLAIM_REF), REF_TEXT);
  assert.equal(rows.length, 3);
  const verb = rows.find((r) => r.id === 'L1');
  assert.equal(verb.state, 'verbatim');
  assert.equal(REF_TEXT.slice(verb.refSpan[0], verb.refSpan[1]), verb.quote); // span round-trips
  assert.ok(verb.quote.toLowerCase().includes('coolant channel defined through a stack of prismatic cells'));
  const part = rows.find((r) => r.id === 'L2');
  assert.equal(part.state, 'partial');
  assert.equal(REF_TEXT.slice(part.refSpan[0], part.refSpan[1]), part.quote); // slice is exact
  assert.match(part.note, /not construction|first pass/i);
  const none = rows.find((r) => r.id === 'L3');
  assert.equal(none.state, 'notFound');
  assert.equal(none.quote, null);
  assert.equal(none.refSpan, null);
  assert.match(none.note, /not inferred/i);
  assert.deepEqual(counts, { verbatim: 1, partial: 1, notFound: 1 });
});

// --- construction risk flags (improvement 2) ---

test('flagConstructionRisks: fictional claim yields 4 deterministic flagged spans', () => {
  const claim = parseClaim('1. A fastening device comprising: means for clamping a panel to a frame; a processor configured to detect vibration; a housing substantially cylindrical in shape; and a lens about 5 mm in thickness.');
  const flags = flagConstructionRisks(claim);
  assert.equal(flags.length, 4);
  assert.deepEqual(flags.map((f) => f.kind).sort(), ['approximate-term', 'approximate-term', 'functional-limitation', 'means-plus-function']);
  for (const f of flags) {
    assert.equal(claim.text.slice(f.span[0], f.span[1]), f.text); // span round-trips
  }
  assert.equal(flags.find((f) => f.kind === 'means-plus-function').text, 'means for');
  assert.equal(flags.find((f) => f.kind === 'functional-limitation').text, 'configured to');
});

// --- three-way transitional + scope note (improvement 3) ---

test('parseClaim distinguishes comprising / consisting of / consisting essentially of', () => {
  assert.equal(parseClaim('1. A composition comprising: a polymer base; and a dye.').transitional, 'comprising');
  assert.equal(parseClaim('1. A composition consisting of: a polymer base; and a dye.').transitional, 'consisting');
  assert.equal(parseClaim('1. A composition consisting essentially of: a polymer base; and a dye.').transitional, 'consisting-essentially-of');
});

test('toClaimChart notes transitional scope change between sets', () => {
  const A = '1. A composition comprising: a polymer base; and a dye.';
  const B = '1. A composition consisting essentially of: a polymer base; and a dye.';
  const res = compareClaimSets(A, B);
  const md = toClaimChart(res);
  assert.ok(md.includes('transitional scope changed'));
  assert.ok(md.includes('comprising'));
  assert.ok(md.includes('consisting essentially of'));
  assert.ok(md.includes('semi-open'));
});

// --- renumber-robust pairing (improvement 4) ---

test('identical claim renumbered across sets is "renumbered", not removed+added', () => {
  const setA = `${CLAIM_1_A}\n2. The system of claim 1, wherein the coolant is a dielectric fluid.`;
  const setB = `${CLAIM_1_A}\n3. The system of claim 1, wherein the coolant is a dielectric fluid.`;
  const res = compareClaimSets(setA, setB);
  assert.equal(res.totals.renumbered, 1);
  assert.equal(res.totals.claimsOnlyInA, 0);
  assert.equal(res.totals.claimsOnlyInB, 0);
  const rn = res.claims.find((c) => c.result === 'claim renumbered in set B');
  assert.equal(rn.claimNo, 2);
  assert.equal(rn.renumberedTo, 3);
  assert.ok(rn.comparison.rows.every((r) => r.relation === 'matched'));
});

test('renumber detection is conservative: amended wording stays removed+added', () => {
  const setA = `${CLAIM_1_A}\n2. The system of claim 1, wherein the coolant is a dielectric fluid.`;
  const setB = `${CLAIM_1_A}\n3. The system of claim 1, wherein the coolant is a dielectric fluid and includes a corrosion inhibitor.`;
  const res = compareClaimSets(setA, setB);
  assert.equal(res.totals.renumbered, 0);
  assert.equal(res.totals.claimsOnlyInA, 1);
  assert.equal(res.totals.claimsOnlyInB, 1);
});

// --- CSV export + injection neutralization (improvement 5) ---

test('toCSV neutralizes formula-injection cells without corrupting normal text', () => {
  const res = compareClaimSets(CLAIM_1_A, CLAIM_1_B);
  const csv = toCSV(res);
  assert.ok(csv.startsWith('claimNo,aId,aText'));
  assert.ok(csv.includes('coolant channel')); // normal text untouched
  assert.ok(!csv.includes("'coolant")); // no spurious apostrophe prefix
  // crafted hostile rows
  const crafted = {
    claims: [{
      claimNo: 9, result: 'compared', comparison: {
        rows: [
          { relation: 'added', aId: null, aText: null, aSpan: null, bId: 'L1', bText: '=cmd()', bSpan: [0, 6], similarity: 0, note: 'n' },
          { relation: 'removed', aId: 'L2', aText: '+SUM(A1)', aSpan: [0, 8], bId: null, bText: null, bSpan: null, similarity: 0, note: 'n' },
          { relation: 'added', aId: null, aText: null, aSpan: null, bId: 'L3', bText: 'a	b', bSpan: [0, 3], similarity: 0, note: 'n' },
        ],
      },
    }],
    totals: { matched: 0, modified: 0, removed: 1, added: 2, claimsOnlyInA: 0, claimsOnlyInB: 0 },
    noTeachingFound: 1,
  };
  const hostile = toCSV(crafted);
  assert.ok(hostile.includes('"\'=cmd()"'));
  assert.ok(hostile.includes('"\'+SUM(A1)"'));
  assert.ok(hostile.includes('"\'a	b"'));
});

test('toCSV whole-claim rows emit the claim text in the aText/bText columns', () => {
  const setA = `${CLAIM_1_A}\n2. The system of claim 1, wherein the coolant is a dielectric fluid.`;
  const setB = `${CLAIM_1_A}\n3. The system of claim 1, wherein the coolant is a dielectric fluid and includes a corrosion inhibitor.`;
  const csv = toCSV(compareClaimSets(setA, setB));
  const removedRow = csv.split('\n').find((l) => l.includes('claim removed in set B'));
  assert.ok(removedRow, 'removed whole-claim row exists');
  assert.match(removedRow, /^2,,"2\. The system of claim 1/); // claim text in aText column
  assert.ok(removedRow.includes('dielectric fluid'));
  assert.ok(!removedRow.includes('corrosion inhibitor'));
  const addedRow = csv.split('\n').find((l) => l.includes('claim added in set B'));
  assert.ok(addedRow, 'added whole-claim row exists');
  assert.match(addedRow, /^3,,,claim added in set B,,"3\. The system of claim 1/); // claim text in bText column
  assert.ok(addedRow.includes('corrosion inhibitor'));
});

test('toSourcesCSV emits one source row per chart row with span anchors', () => {
  const res = compareClaimSets(CLAIM_1_A, CLAIM_1_B);
  const src = toSourcesCSV(res);
  const expectedRows = res.claims.reduce((n, c) => n + (c.comparison ? c.comparison.rows.length : 1), 0);
  const dataLines = src.split('\n').filter(Boolean).length - 1;
  assert.equal(dataLines, expectedRows);
  assert.ok(src.startsWith('claimNo,aId,aSpanStart,aSpanEnd,bId,bSpanStart,bSpanEnd'));
  // spans must be integers or empty — real parse, not a cell-count proxy
  for (const line of src.split('\n').slice(1)) {
    if (!line) continue;
    const cells = line.split(',');
    assert.equal(cells.length, 7);
    for (const col of [2, 3, 5, 6]) {
      assert.ok(cells[col] === '' || /^-?\d+$/.test(cells[col]),
        `span cell "${cells[col]}" must be an integer or empty`);
    }
  }
});

// --- claim × reference coverage matrix (improvement 6) ---

const MATRIX_CLAIM = `1. A coating apparatus comprising:
a rotating drum;
a spray nozzle aimed at the drum;
a heater surrounding the drum; and
a collector pan beneath the drum.`;

test('buildClaimReferenceMatrix: single ref covering L1-L4 flags anticipation-candidate', () => {
  const refFull = 'The fictional prior art shows a coating apparatus with a rotating drum, a spray nozzle aimed at the drum, a heater surrounding the drum, and a collector pan beneath the drum.';
  const m = buildClaimReferenceMatrix(parseClaimSet(MATRIX_CLAIM), [{ id: 'REF-1 (fictional)', text: refFull }]);
  assert.equal(m.claims.length, 1);
  const row = m.claims[0];
  assert.equal(row.coverage, 'anticipation-candidate');
  assert.deepEqual(row.uncoveredLimitations, []);
  assert.equal(row.refs[0].covered, 4);
  assert.equal(m.totals.anticipationCandidates, 1);
});

test('buildClaimReferenceMatrix: joint-only coverage flags combination; missing coverage stays gaps', () => {
  const refA = { id: 'REF-A (fictional)', text: 'A fictional drum coater has a rotating drum and a spray nozzle aimed at the drum.' };
  const refB = { id: 'REF-B (fictional)', text: 'A fictional oven wraps a heater surrounding the drum plus a collector pan beneath the drum.' };
  const m = buildClaimReferenceMatrix(parseClaimSet(MATRIX_CLAIM), [refA, refB]);
  const row = m.claims[0];
  assert.equal(row.coverage, 'combination');
  assert.deepEqual(row.combinationRefs, ['REF-A (fictional)', 'REF-B (fictional)']);
  assert.deepEqual(row.uncoveredLimitations, []);
  // no ref pair covers everything → gaps, honestly listed
  const m2 = buildClaimReferenceMatrix(parseClaimSet(MATRIX_CLAIM), [refA]);
  assert.equal(m2.claims[0].coverage, 'gaps');
  assert.deepEqual(m2.claims[0].uncoveredLimitations, ['L3', 'L4']);
});
