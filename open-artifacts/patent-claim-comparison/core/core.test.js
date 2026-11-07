/** node:test suite for patent-claim-comparison core. Run: node --test core/ */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenize, similarity, parseClaim, parseClaimSet,
  compareLimitations, compareClaimSets, toClaimChart,
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
