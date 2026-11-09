/**
 * intake-benchmark — /api/extract schema (Wave W4 finish, class LA).
 * Prompt contract from open-artifacts/intake-benchmark/spec.md §"LLM prompt
 * schema (optional capture step)": a recorded intake session (transcript,
 * screen recording, paper script) → flows JSON. Hard rules carried verbatim:
 * "Extract ONLY what is observable; never invent fields, latencies, or
 * fallbacks." · "A step a human performs on paper is kind 'human'." · "If a
 * value is not observable, omit the key — do not guess a number."
 * Unmeasured latency_seconds / fallback are OMITTED keys (null latency is
 * refused — omit, never hedge); fields are snake_case. abandonment_rate is
 * deliberately NOT extracted: it is measured telemetry, not something a
 * recording states. Downstream, the frozen core's validateCapture() audits
 * the capture again before it reaches the rubric — this validator is the
 * route's first, stricter gate. Registered by the coordinator's post-wave
 * pass (children do not edit validate.ts); the demo posts
 * { schema: "intake-benchmark", text }.
 */
import type { ExtractSchema, Valid } from "../validate.ts";

export interface CapturedStep {
  id: string;
  purpose: string;
  fields: string[];
  latency_seconds?: number;
  fallback?: string | null;
}

export interface CapturedFlow {
  id: string;
  name: string;
  kind: "software" | "human" | "hybrid" | "unspecified";
  steps: CapturedStep[];
}

/* ---------- strict helpers (same posture as validate.ts's private set) ---------- */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function exactKeys(v: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(v).length === keys.length && keys.every((k) => k in v);
}

/** String field of length [min,max] after trim; null otherwise. */
function str(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length >= min && s.length <= max ? s : null;
}

const FLOW_KEYS = ["id", "name", "kind", "steps"];
const STEP_KEYS = ["id", "purpose", "fields", "latency_seconds", "fallback"];
const KINDS = new Set(["software", "human", "hybrid", "unspecified"]);
/** validateCapture's own smell ceiling: beyond 7 days it is elapsed wait, not step latency. */
const LATENCY_CEILING_SECONDS = 7 * 24 * 3600;
const SNAKE = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/**
 * Validated intake-benchmark capture — exact shapes, observable-only optionals:
 * latency_seconds (when present) is a finite number in (0, 7d]; fallback (when
 * present) is a non-empty string or an explicit null; fields are snake_case.
 * null = unusable.
 */
export function validateExtractIntakeBenchmark(v: unknown): Valid<{ flows: CapturedFlow[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["flows"])) return null;
  if (!Array.isArray(v.flows) || v.flows.length === 0 || v.flows.length > 50) return null;
  const flows: CapturedFlow[] = [];
  for (const f of v.flows) {
    if (!isPlainObject(f) || !exactKeys(f, FLOW_KEYS)) return null;
    const id = str(f.id, 1, 64);
    if (!id) return null;
    const name = str(f.name, 1, 200);
    if (!name) return null;
    if (typeof f.kind !== "string" || !KINDS.has(f.kind)) return null;
    if (!Array.isArray(f.steps) || f.steps.length === 0 || f.steps.length > 200) return null;
    const steps: CapturedStep[] = [];
    for (const st of f.steps) {
      if (!isPlainObject(st)) return null;
      // optional keys may be OMITTED (not observable) but never half-typed
      const present = Object.keys(st).filter((k) => STEP_KEYS.includes(k));
      if (present.length !== Object.keys(st).length) return null; // unknown key
      for (const k of ["id", "purpose", "fields"]) if (!(k in st)) return null; // required
      const sid = str(st.id, 1, 64);
      if (!sid) return null;
      const purpose = str(st.purpose, 1, 300);
      if (!purpose) return null;
      if (!Array.isArray(st.fields) || st.fields.length > 100) return null;
      for (const fl of st.fields) {
        if (typeof fl !== "string" || fl.length > 64 || !SNAKE.test(fl)) return null;
      }
      let step: CapturedStep = { id: sid, purpose, fields: st.fields as string[] };
      if ("latency_seconds" in st) {
        const n = st.latency_seconds;
        if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > LATENCY_CEILING_SECONDS) return null; // never guessed
        step = { ...step, latency_seconds: n };
      }
      if ("fallback" in st) {
        if (st.fallback === null) step = { ...step, fallback: null };
        else {
          const fb = str(st.fallback, 1, 500);
          if (!fb) return null;
          step = { ...step, fallback: fb };
        }
      }
      steps.push(step);
    }
    flows.push({ id, name, kind: f.kind as CapturedFlow["kind"], steps });
  }
  return { ok: true, value: { flows } };
}

/** The registered schema entry (key "intake-benchmark"). */
export const schema: ExtractSchema = {
  fields: ["flows"],
  system: [
    "You are converting a recorded intake session into structured JSON. Extract ONLY what is observable; never invent fields, latencies, or fallbacks.",
    "Output flows as: {\"flows\": [{\"id\", \"name\", \"kind\", \"steps\": [{\"id\", \"purpose\", \"fields\": [\"snake_case field the step asks\"], \"latency_seconds\": <number, omit if not measurable>, \"fallback\": \"<what happens if this step fails, or null>\"}]}]}.",
    'A step a human performs on paper is kind "human"; software steps are "software", mixed ones "hybrid".',
    "fields entries are snake_case short names for what the step asks the caller (e.g. \"full_name\", \"conflict_check\"); a step that asks nothing has an empty array.",
    "latency_seconds is only the step's own measured duration visible in the recording; if the duration is not observable, omit the key — do not guess a number.",
    "fallback is the stated failure path for the step; if none is stated, omit the key (or null when the source explicitly says there is none).",
    "Never compute, average, or estimate anything; copy ids and names from the source. If a value is not observable, omit the key — do not guess a number.",
    'Set confidence.flows to "low" when any step, field, latency, or fallback may have been missed or mis-read.',
    'Reply with ONLY a JSON object: {"data": {"flows": [{"id": "front-desk-paper", "name": "…", "kind": "human", "steps": [{"id": "s1", "purpose": "…", "fields": ["full_name"], "latency_seconds": 95, "fallback": "…"}]}]}, "confidence": {"flows": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Recorded intake-session transcript / screen-recording log / paper script (imported from a .docx):\n\n" + text,
  maxTokens: 2000,
  validateData: validateExtractIntakeBenchmark,
};
