import { test } from "node:test";
import assert from "node:assert/strict";
import { assessUrgency, extractDates } from "./textsignals.ts";

// Vendored urgency/date signals (verbatim logic from
// open-artifacts/access-to-justice-front-door/core/core.js) so /api/triage
// can fill the same meta fields the deterministic core fills. Pinned here.

test("urgency: emergency phrases beat urgent phrases beat routine", () => {
  assert.equal(assessUrgency("my partner hit me and I am unsafe"), "emergency");
  assert.equal(assessUrgency("I have a court date tomorrow"), "urgent");
  assert.equal(assessUrgency("my landlord taped a notice to quit on my door"), "routine");
});

test("urgency: 'hearing' in the disability sense never signals a court hearing", () => {
  assert.equal(assessUrgency("I am hard of hearing and need help with my landlord"), "routine");
});

test("dates: plain-language fragments are captured in order, deduped, info-only", () => {
  assert.deepEqual(extractDates("She said March 3 was the day, and again on March 3 or 3/15/2026"), ["March 3", "3/15/2026"]);
  assert.deepEqual(extractDates("no dates in here"), []);
});
