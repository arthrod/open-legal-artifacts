import { Hono } from "npm:hono@4.13.12";
import { protectReads } from "./auth.ts";
import { persistenceEnabled } from "./mode.ts";
import { createLimiter, LIMITS } from "./ratelimit.ts";
import { fieldsForArea, isEscalatingUrgency, MATTER_AREAS } from "../shared/catalog.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("admin read routes fail closed and require the configured bearer token", async () => {
  let token: string | undefined;
  const app = new Hono();
  protectReads(app, () => token);
  app.get("/api/intakes", (c) => c.json({ intakes: [] }));
  app.get("/api/intakes/:id", (c) => c.json({ id: c.req.param("id") }));
  assert((await app.request("/api/intakes")).status === 503, "unset token must fail closed");
  token = "test-secret";
  assert((await app.request("/api/intakes/1")).status === 401, "missing token must fail");
  assert((await app.request("/api/intakes", { headers: { Authorization: "Bearer wrong" } })).status === 401, "wrong token must fail");
  assert((await app.request("/api/intakes/1", { headers: { Authorization: "Bearer test-secret" } })).status === 200, "valid token must pass");
});

Deno.test("demo mode does not enable storage without a nonblank token", () => {
  assert(!persistenceEnabled(() => undefined), "unset token");
  assert(!persistenceEnabled(() => "  "), "blank token");
  assert(persistenceEnabled(() => "secret"), "configured token");
});

Deno.test("model limiter resets the global window and retains per-client limits", () => {
  let now = 0;
  const limiter = createLimiter(() => now);
  for (let i = 0; i < LIMITS.global; i++) assert(limiter.take("client").ok, "calls within limit pass");
  assert(!limiter.take("other").ok, "global limit applies across clients");
  now += LIMITS.globalWindowMs;
  assert(limiter.take("client").ok && limiter.take("client").ok, "global window expires");
  assert(!limiter.take("client").ok, "per-client limit remains in effect");
  now += LIMITS.perIpWindowMs;
  assert(limiter.take("client").ok, "per-client window expires");
});

Deno.test("every matter has unique elicitation fields and urgent cases escalate", () => {
  for (const area of MATTER_AREAS) {
    const fields = fieldsForArea(area.id);
    assert(fields.length > 0 && new Set(fields).size === fields.length, `invalid fields for ${area.id}`);
  }
  assert(isEscalatingUrgency("emergency") && isEscalatingUrgency("urgent"), "urgent cases escalate");
  assert(!isEscalatingUrgency("routine"), "routine cases do not escalate");
});
