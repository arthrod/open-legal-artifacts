import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "./ratelimit.ts";

// Naive in-memory sliding-window rate limiter (10 req/min per IP on the val).
// Pure: the clock is injected so every case is deterministic.

test("allows up to max hits per window, then blocks the overflow", () => {
  const rl = createRateLimiter({ windowMs: 60_000, max: 3 });
  assert.equal(rl.allow("ip1", 1_000), true);
  assert.equal(rl.allow("ip1", 1_001), true);
  assert.equal(rl.allow("ip1", 1_002), true);
  assert.equal(rl.allow("ip1", 1_003), false, "4th hit inside the window must be refused");
  assert.equal(rl.allow("ip1", 1_004), false);
});

test("window slides: expired hits free capacity again", () => {
  const rl = createRateLimiter({ windowMs: 60_000, max: 2 });
  assert.equal(rl.allow("a", 0), true);
  assert.equal(rl.allow("a", 30_000), true);
  assert.equal(rl.allow("a", 31_000), false);
  assert.equal(rl.allow("a", 60_001), true, "hit at t=0 is outside the window at t=60001");
});

test("keys are isolated — one IP's burst never blocks another", () => {
  const rl = createRateLimiter({ windowMs: 60_000, max: 1 });
  assert.equal(rl.allow("a", 0), true);
  assert.equal(rl.allow("a", 1), false);
  assert.equal(rl.allow("b", 1), true);
  assert.equal(rl.allow("b", 2), false);
});

test("boundary: a hit exactly windowMs old has expired", () => {
  const rl = createRateLimiter({ windowMs: 1_000, max: 1 });
  assert.equal(rl.allow("k", 0), true);
  assert.equal(rl.allow("k", 1_000), true);
  assert.equal(rl.allow("k", 1_999), false);
});

test("prune removes only stale keys and returns how many went", () => {
  const rl = createRateLimiter({ windowMs: 1_000, max: 5 });
  rl.allow("stale", 0);
  rl.allow("fresh", 900);
  assert.equal(rl.prune(1_500), 1, "only the key whose every hit is stale is dropped");
  assert.equal(rl.prune(1_500), 0);
  // 'fresh' keeps its history: at 1900 its 900-hit is still inside the window
  const rl2 = createRateLimiter({ windowMs: 10_000, max: 1 });
  rl2.allow("keep", 0);
  assert.equal(rl2.prune(10), 0);
  assert.equal(rl2.allow("keep", 11), false, "history survived pruning");
});

test("size reports tracked keys (bounded memory check)", () => {
  const rl = createRateLimiter({ windowMs: 1_000, max: 9 });
  rl.allow("x", 0);
  rl.allow("y", 0);
  assert.equal(rl.size(), 2);
});
