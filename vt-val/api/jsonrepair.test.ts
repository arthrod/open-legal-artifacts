import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, stripTrailingCommas } from "./jsonrepair.ts";

// JSON-mode repair: models wrap JSON in prose or fences, leave trailing
// commas, or prepend "Here is the JSON:". extractJson must recover the first
// balanced JSON object or return null — never throw, never guess.

test("clean JSON object parses as-is", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

test("markdown-fenced JSON (```json … ```) is recovered", () => {
  assert.deepEqual(extractJson('```json\n{"verdict":"supported"}\n```'), { verdict: "supported" });
  assert.deepEqual(extractJson('```\n{"verdict":"supported"}\n```'), { verdict: "supported" });
});

test("prose-wrapped JSON is recovered (prefix and suffix)", () => {
  const raw = 'Here is the requested JSON:\n{"issue":"housing-eviction","confidence":0.8}\nHope that helps!';
  assert.deepEqual(extractJson(raw), { issue: "housing-eviction", confidence: 0.8 });
});

test("braces inside string literals do not break the balance scan", () => {
  const raw = 'note {"reason":"set {braces} inside","n":1} trailing';
  assert.deepEqual(extractJson(raw), { reason: "set {braces} inside", n: 1 });
});

test("escaped quotes inside strings do not end the string scan", () => {
  // build the payload with stringify so the escaped quotes are unambiguous at every layer
  const obj = { reason: 'he said "ok {"} done', n: 2 };
  const raw = "prefix " + JSON.stringify(obj) + " suffix";
  assert.deepEqual(extractJson(raw), obj);
});

test("trailing commas are repaired (object and nested array)", () => {
  assert.deepEqual(extractJson('{"a":1,}'), { a: 1 });
  assert.deepEqual(extractJson('{"a":[1,2,],}'), { a: [1, 2] });
  assert.equal(stripTrailingCommas('{"a":1,}'), '{"a":1}');
  assert.equal(stripTrailingCommas('{"a":[1,2,],}'), '{"a":[1,2]}');
  // a double comma BETWEEN values is a missing value, not a trailing comma — must not be guessed away
  assert.equal(stripTrailingCommas('{"a":1,,"b":2}'), '{"a":1,,"b":2}');
});

test("garbage returns null, never throws", () => {
  assert.equal(extractJson(""), null);
  assert.equal(extractJson("no json here at all"), null);
  assert.equal(extractJson("{not json"), null);
  assert.equal(extractJson(null as unknown as string), null);
  assert.equal(extractJson(undefined as unknown as string), null);
  assert.equal(extractJson("{"), null);
});

test("first object wins when several appear", () => {
  const raw = 'first {"a":1} second {"b":2}';
  assert.deepEqual(extractJson(raw), { a: 1 });
});
