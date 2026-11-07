import { plans, validateResponse } from "./model.ts";

Deno.test("accept validates required fields, booleans and production ticket", () => {
  const plan = plans[0];
  const missing = validateResponse(plan, { action: "accept", content: { environment: "production", runMigrations: false } });
  if (missing.valid || !missing.errors?.some((e) => e.includes("ticket"))) throw new Error("production ticket must be required");
  const valid = validateResponse(plan, { action: "accept", content: { environment: "staging", runMigrations: false } });
  if (!valid.valid) throw new Error(JSON.stringify(valid));
});

Deno.test("validates numeric bounds, integer type and unknown fields", () => {
  const bad = validateResponse(plans[2], { action: "accept", content: { mode: "all-pii", threshold: 95.5, extra: true } });
  if (bad.valid || bad.errors?.length !== 2) throw new Error(JSON.stringify(bad));
  const good = validateResponse(plans[2], { action: "accept", content: { mode: "all-pii", threshold: 95, keepNames: false } });
  if (!good.valid) throw new Error(JSON.stringify(good));
});

Deno.test("decline and cancel return no content; bad input fails cleanly", () => {
  for (const action of ["decline", "cancel"]) {
    const result = validateResponse(plans[0], { action, content: { x: "ignored" } });
    if (!result.valid || "content" in result) throw new Error(JSON.stringify(result));
  }
  for (const input of [null, [], {}, {action:"accept", content:[]}, {action:"other"}]) {
    if (validateResponse(plans[0], input).valid) throw new Error(JSON.stringify(input));
  }
});

Deno.test("lab API validates submissions and handles missing plans and malformed JSON", async () => {
  const { labApi } = await import("../backend/lab.ts");
  const call = (path: string, body: string) => labApi.request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  if ((await call("/plans/nope/respond", "{}" )).status !== 404) throw new Error("unknown plan");
  if ((await call("/plans/deploy-confirm/respond", "{" )).status !== 400) throw new Error("malformed JSON");
  if ((await call("/plans/deploy-confirm/respond", '{"action":"accept","content":{}}')).status !== 422) throw new Error("invalid accepted response");
  const res = await call("/plans/deploy-confirm/respond", '{"action":"cancel","content":{"secret":"ignored"}}');
  const data = await res.json();
  if (res.status !== 200 || data.action !== "cancel" || "content" in data) throw new Error(JSON.stringify(data));
});

Deno.test("RPC rejects synthetic approval, handles invalid params and matches schemas", async () => {
  const { labApi } = await import("../backend/lab.ts");
  const call = (body: unknown) => labApi.request("/rpc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const invalid = await call({ jsonrpc: "2.0", id: 1, method: "elicitation/create", params: { requestedSchema: {} } });
  if (invalid.status !== 400) throw new Error("expected invalid schema");
  const res = await call({ jsonrpc: "2.0", id: 2, method: "elicitation/create", params: { requestedSchema: plans[0].requestedSchema } });
  const data = await res.json();
  if (res.status !== 501 || data.error.code !== -32000 || data.error.data.matched_plan !== plans[0].id || data.result) throw new Error(JSON.stringify(data));
});
