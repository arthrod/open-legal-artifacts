import { Hono } from "npm:hono@4.13.12";
import { labApi } from "./lab.ts";
import { readFile, serveFile } from "https://esm.town/v/std/utils/index.ts";
import { elicitIntake, explain, finalizeIntake } from "./llm.ts";
import { readJsonBody } from "./http_util.ts";
import { protectReads } from "./auth.ts";
import { persistenceEnabled } from "./mode.ts";
import { createLimiter, limitModelCalls } from "./ratelimit.ts";
import { getIntake, listIntakes, saveIntake } from "./db.ts";
import { assertIntakeRecord, makeReference } from "../shared/catalog.ts";
import type {
  ElicitIntakeRequest,
  ElicitIntakeResponse,
  FinalizeIntakeRequest,
  FinalizeIntakeResponse,
  HelpRequest,
  HelpResponse,
  IntakeBrief,
  IntakeRecord,
  SubmitIntakeRequest,
  SubmitIntakeResponse,
} from "../shared/types.ts";

const app = new Hono();

app.onError((err, _c) => {
  throw err;
});

// Stored records are readable only with ADMIN_TOKEN (fails closed when unset).
// Must be registered before the routes it protects.
protectReads(app, () => Deno.env.get("ADMIN_TOKEN"));
// One visitor must not spend the shared model quota (backend/ratelimit.ts).
limitModelCalls(app, ["/api/elicit-intake", "/api/finalize-intake", "/api/help"], createLimiter(), 64 * 1024);

/** Reject path-traversal in static asset routes (decodes then checks for `..`). */
function isSafeAssetPath(p: string): boolean {
  let decoded = p;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    return false;
  }
  return !decoded.includes("..") && !p.includes("..");
}

// ---------- Elicitation lab ----------
app.route("/api/lab", labApi);
app.get("/lab", async (c) => c.html(await readFile("/lab/index.html", import.meta.url)));
app.get("/lab/*", (c) =>
  isSafeAssetPath(c.req.path) ? serveFile(c.req.path, import.meta.url) : c.text("Forbidden", 403));

// ---------- Static frontend ----------
app.get("/frontend/*", (c) =>
  isSafeAssetPath(c.req.path) ? serveFile(c.req.path, import.meta.url) : c.text("Forbidden", 403));
app.get("/shared/*", (c) =>
  isSafeAssetPath(c.req.path) ? serveFile(c.req.path, import.meta.url) : c.text("Forbidden", 403));

app.get("/", async (c) => {
  const html = await readFile("/frontend/index.html", import.meta.url);
  return c.html(html);
});

// ---------- Validation ----------

const PERSONAS = new Set(["client", "staff"]);
const MATTER_AREAS = new Set([
  "family",
  "criminal",
  "personal_injury",
  "employment",
  "immigration",
  "estate",
  "business",
  "real_estate",
  "landlord_tenant",
  "ip",
  "bankruptcy",
  "other",
]);

/** Coerce/validate an incoming brief. Returns the brief or an error string. */
function validateBrief(b: unknown): IntakeBrief | string {
  if (!b || typeof b !== "object") return "missing brief";
  const o = b as Record<string, unknown>;
  if (!PERSONAS.has(String(o.persona))) return "invalid brief.persona";
  if (!MATTER_AREAS.has(String(o.matter_area))) return "invalid brief.matter_area";
  return {
    persona: o.persona as IntakeBrief["persona"],
    matter_area: o.matter_area as IntakeBrief["matter_area"],
    narrative: String(o.narrative ?? ""),
    contact_name: String(o.contact_name ?? "").trim(),
  };
}

// ---------- API ----------

/**
 * POST /api/elicit-intake
 * Narrative + persona + area → AI proposes intake fields with alternatives.
 */
app.post("/api/elicit-intake", async (c) => {
  const body = await readJsonBody<ElicitIntakeRequest>(c);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);
  const briefOrErr = validateBrief(body?.brief);
  if (typeof briefOrErr === "string") return c.json({ error: briefOrErr }, 400);
  if (briefOrErr.narrative.trim().length < 20) {
    return c.json({ error: "narrative too short — describe the matter in a sentence or two" }, 400);
  }

  console.log("[elicit-intake] persona=", briefOrErr.persona, "area=", briefOrErr.matter_area);

  const elicitation = await elicitIntake(briefOrErr);
  const response: ElicitIntakeResponse = { elicitation };
  return c.json(response);
});

/**
 * POST /api/finalize-intake
 * Confirmed answers → structured intake (summary, conflict_parties, urgency, next_steps).
 */
app.post("/api/finalize-intake", async (c) => {
  const body = await readJsonBody<FinalizeIntakeRequest>(c);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);
  const briefOrErr = validateBrief(body?.brief);
  if (typeof briefOrErr === "string") return c.json({ error: briefOrErr }, 400);
  const answers = body?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return c.json({ error: "answers must be an object" }, 400);
  }

  console.log("[finalize-intake] persona=", briefOrErr.persona, "area=", briefOrErr.matter_area);

  const result: FinalizeIntakeResponse = await finalizeIntake(
    briefOrErr,
    answers as Record<string, string>,
  );
  console.log("[finalize-intake] parties=", result.conflict_parties.length, "urgency=", result.urgency.level);
  return c.json(result);
});

/**
 * POST /api/help
 * Plain-language help for an intake term/question. Persona-aware, never advice.
 */
app.post("/api/help", async (c) => {
  const body = await readJsonBody<HelpRequest>(c);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);
  if (!body?.question || typeof body.question !== "string" || !body.question.trim()) {
    return c.json({ error: "missing question" }, 400);
  }
  const brief = (body.brief && typeof body.brief === "object" ? body.brief : {}) as Partial<IntakeBrief>;
  const explanation = await explain(brief, body.question.trim());
  const response: HelpResponse = { explanation };
  return c.json(response);
});

// ---------- API (persistence) ----------

/** Path-safe positive-integer id from a route param, or null. */
function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * POST /api/submit
 * Persist a reviewed IntakeRecord. Assigns a fresh reference when the client
 * omitted one, validates, then saves (honoring the discard-narrative opt-out).
 */
// The page shows a "public demo, nothing stored" banner when this says demo.
app.get("/api/mode", (c) => c.json({ demo: !persistenceEnabled(() => Deno.env.get("ADMIN_TOKEN")) }));

app.post("/api/submit", async (c) => {
  const body = await readJsonBody<SubmitIntakeRequest>(c);
  if (body === null) return c.json({ error: "invalid JSON body" }, 400);
  const intake = body?.intake as IntakeRecord | undefined;
  if (!intake || typeof intake !== "object") {
    return c.json({ error: "missing intake" }, 400);
  }
  // Backend owns the non-deterministic seed; makeReference stays pure/testable.
  if (!intake.reference || !String(intake.reference).trim()) {
    intake.reference = makeReference(Date.now(), Math.random());
  }
  try {
    assertIntakeRecord(intake);
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  if (!persistenceEnabled(() => Deno.env.get("ADMIN_TOKEN"))) {
    // Public demo: validated, not stored (backend/mode.ts).
    const demo: SubmitIntakeResponse = { ok: true, demo: true, intake_id: 0, reference: `DEMO-${intake.reference}` };
    return c.json(demo);
  }
  const { id, reference } = await saveIntake(intake);
  // Never log raw narrative or free-form text — only ids and the privacy flag.
  console.log("[submit] saved intake_id=", id, "discard_narrative=", intake.discard_narrative === true);
  const response: SubmitIntakeResponse = { ok: true, intake_id: id, reference };
  return c.json(response);
});

/** GET /api/intakes — firm list view (summaries, newest first). */
app.get("/api/intakes", async (c) => {
  const intakes = await listIntakes();
  return c.json({ intakes });
});

/** GET /api/intakes/:id — full stored intake (404 if missing, 400 on bad id). */
app.get("/api/intakes/:id", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.json({ error: "invalid id" }, 400);
  const intake = await getIntake(id);
  if (!intake) return c.json({ error: "not found" }, 404);
  return c.json({ intake });
});

export default app.fetch;
