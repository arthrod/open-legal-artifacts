import { Hono } from "npm:hono@4.13.12";
import { plans, validateResponse } from "../lab/model.ts";
import { readJsonBody } from "./http_util.ts";

/** Illustrative, stateless elicitation validation; this is not an MCP transport. */
export const labApi = new Hono();
labApi.get("/plans", (c) => c.json(plans));
labApi.get("/plans/:id", (c) => {
  const plan = plans.find((p) => p.id === c.req.param("id"));
  return plan ? c.json(plan) : c.json({ error: "Plan not found" }, 404);
});
labApi.post("/plans/:id/respond", async (c) => {
  const plan = plans.find((p) => p.id === c.req.param("id"));
  if (!plan) return c.json({ error: "Plan not found" }, 404);
  const body = await readJsonBody(c);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);
  const result = validateResponse(plan, body);
  return c.json(result, result.valid ? 200 : 422);
});

// Do not return a fabricated acceptance: this HTTP demo is not an interactive
// MCP transport and cannot wait for a human to answer a JSON-RPC request.
labApi.post("/rpc", async (c) => {
  const body = await readJsonBody<Record<string, unknown>>(c);
  if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }, 400);
  const id = typeof body.id === "string" || typeof body.id === "number" ? body.id : null;
  if (body.method !== "elicitation/create") return c.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }, 400);
  const params = body.params as Record<string, unknown> | undefined;
  const schema = params?.requestedSchema as Record<string, unknown> | undefined;
  if (!schema || typeof schema !== "object" || schema.type !== "object" || !schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
    return c.json({ jsonrpc: "2.0", id, error: { code: -32602, message: "params.requestedSchema.properties is required" } }, 400);
  }
  const keys = Object.keys(schema.properties).sort().join(",");
  const match = plans.find((plan) => Object.keys(plan.requestedSchema.properties).sort().join(",") === keys);
  const base = new URL(c.req.url).origin;
  return c.json({ jsonrpc: "2.0", id, error: {
    code: -32000,
    message: "Interactive MCP transport is not implemented; no response was collected.",
    data: {
      matched_plan: match?.id ?? null,
      ui_url: `${base}/lab`,
      respond_url: match ? `${base}/api/lab/plans/${match.id}/respond` : null,
    },
  } }, 501);
});
