/**
 * matter-board — /api/extract schema (Wave W2, class LA).
 * Prompt contract from open-artifacts/matter-board/spec.md §"LLM prompt schema
 * (extraction step, optional)": engagement letters / emails / documents →
 * snapshot matters. Hard rules carried verbatim: "Never invent deadlines; omit
 * when the source does not state one." · "Owner unknown → null, never guessed."
 * · "Keep verbatim matter names." capturedAt is CALLER-SUPPLIED per spec — it is
 * deliberately not part of the model's output; the demo adds it on Apply.
 * Registered by the coordinator's post-wave pass (children do not edit
 * validate.ts); the demo posts { schema: "matter-board", text }.
 */
import type { ExtractSchema, Valid } from "../validate.ts";

export interface ExtractedMatter {
  id: string;
  name: string;
  client: string | null;
  owner: string | null;
  stage: string | null;
  nextStep: string | null;
  nextDeadline: string | null;
  updatedAt: string | null;
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

/** Strict "YYYY-MM-DD" with month/day range check — the never-compute-dates guard:
 *  anything the model resolved from prose ("Nov 20", "due next Friday") fails here. */
function isoDay(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

/** ISO date or date-time ("2026-10-28", "2026-10-28T14:00:00Z", "+02:00 offset) —
 *  updatedAt is an opaque stamp the core parses; malformed strings are refused. */
function isoStamp(v: unknown): boolean {
  if (typeof v !== "string" || v.length < 10 || v.length > 40) return false;
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) return false;
  return isoDay(v.slice(0, 10));
}

/** Validated matter-board extraction — exact 8-key matters per the spec's
 *  output_schema; unknowns are null, never guessed. null = unusable. */
export function validateExtractMatterBoard(v: unknown): Valid<{ matters: ExtractedMatter[] }> | null {
  if (!isPlainObject(v) || !exactKeys(v, ["matters"])) return null;
  if (!Array.isArray(v.matters) || v.matters.length > 200) return null;
  const out: ExtractedMatter[] = [];
  for (const m of v.matters) {
    if (!isPlainObject(m) || !exactKeys(m, ["id", "name", "client", "owner", "stage", "nextStep", "nextDeadline", "updatedAt"])) return null;
    const id = str(m.id, 1, 64);
    if (!id) return null;
    const name = str(m.name, 1, 200); // verbatim matter names — required, never dropped
    if (!name) return null;
    let client: string | null = null;
    if (m.client !== null) {
      client = str(m.client, 1, 200);
      if (!client) return null;
    }
    let owner: string | null = null; // "Owner unknown → null, never guessed."
    if (m.owner !== null) {
      owner = str(m.owner, 1, 100);
      if (!owner) return null;
    }
    let stage: string | null = null;
    if (m.stage !== null) {
      stage = str(m.stage, 1, 64);
      if (!stage) return null;
    }
    let nextStep: string | null = null;
    if (m.nextStep !== null) {
      nextStep = str(m.nextStep, 1, 400);
      if (!nextStep) return null;
    }
    if (m.nextDeadline !== null && !isoDay(m.nextDeadline)) return null; // never computed
    if (m.updatedAt !== null && !isoStamp(m.updatedAt)) return null;
    out.push({
      id,
      name,
      client,
      owner,
      stage,
      nextStep,
      nextDeadline: m.nextDeadline as string | null,
      updatedAt: m.updatedAt as string | null,
    });
  }
  return { ok: true, value: { matters: out } };
}

/** The registered schema entry (key "matter-board"). */
export const schema: ExtractSchema = {
  fields: ["matters"],
  system: [
    "Extract matters from the provided email/thread/document into the snapshot schema.",
    "Output one entry per matter with exactly these keys: id, name, client, owner, stage, nextStep, nextDeadline, updatedAt.",
    'id is the stable id from the source system when one appears; otherwise derive a kebab-case id from the matter name (e.g. "quill-trademark-opposition").',
    'Never invent deadlines; omit when the source does not state one — nextDeadline is a "YYYY-MM-DD" string or null.',
    "Owner unknown → null, never guessed.",
    "Keep verbatim matter names.",
    "client, stage, and nextStep are null when the source does not state them; copy stage wording from the source rather than mapping it to a vocabulary.",
    "updatedAt is the ISO date-time the source carries for the matter, else null.",
    'Set confidence.matters to "low" when any matter may have been missed or any field was uncertain.',
    'Reply with ONLY a JSON object: {"data": {"matters": [{"id": "M-101", "name": "…", "client": "…", "owner": "j.moreau", "stage": "discovery", "nextStep": "…", "nextDeadline": "2026-11-20"|null, "updatedAt": "2026-10-28T14:00:00Z"|null}]}, "confidence": {"matters": "high"|"low"}}.',
  ].join(" "),
  user: (text) => "Email / engagement-letter text (imported from a .docx):\n\n" + text,
  maxTokens: 1500,
  validateData: validateExtractMatterBoard,
};
