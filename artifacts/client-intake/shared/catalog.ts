// Catalog: fixed option lists + field metadata + pure helpers that steer the
// intake. The LLM schemas/prompts/repair land in later PRs (elicit + finalize);
// this file is the domain foundation and is fully offline-testable (type-only
// imports).

import type {
  ConflictParty,
  ConflictRole,
  FinalizeIntakeResponse,
  IntakeBrief,
  IntakeElicitation,
  IntakeField,
  IntakeFieldId,
  IntakeRecord,
  MatterArea,
  Persona,
  Urgency,
  UrgencyFlag,
} from "./types.ts";

export const PERSONA_OPTIONS: ReadonlyArray<{
  id: Persona;
  label: string;
  blurb: string;
}> = [
  {
    id: "client",
    label: "I need legal help",
    blurb: "You're describing your own situation. We'll keep it plain and explain any legal terms.",
  },
  {
    id: "staff",
    label: "I'm firm staff",
    blurb: "You're taking an intake for the firm. We'll move quickly and use standard terminology.",
  },
];

export const MATTER_AREAS: ReadonlyArray<{
  id: MatterArea;
  label: string;
  blurb: string;
}> = [
  { id: "family", label: "Family & divorce", blurb: "Divorce, custody, support, adoption." },
  { id: "criminal", label: "Criminal defense", blurb: "Charges, arrests, court dates." },
  { id: "personal_injury", label: "Personal injury", blurb: "Accidents, injuries, insurance claims." },
  { id: "employment", label: "Employment", blurb: "Firing, discrimination, wages, contracts." },
  { id: "immigration", label: "Immigration", blurb: "Visas, green cards, deportation, citizenship." },
  { id: "estate", label: "Wills & estate", blurb: "Wills, trusts, probate, inheritance." },
  { id: "business", label: "Business", blurb: "Contracts, formation, disputes." },
  { id: "real_estate", label: "Real estate", blurb: "Buying, selling, title, boundaries." },
  { id: "landlord_tenant", label: "Landlord / tenant", blurb: "Leases, evictions, deposits, repairs." },
  { id: "ip", label: "Intellectual property", blurb: "Trademarks, copyright, patents." },
  { id: "bankruptcy", label: "Bankruptcy & debt", blurb: "Debt relief, filings, creditors." },
  { id: "other", label: "Something else", blurb: "Not sure or none of the above." },
];

export const URGENCY_OPTIONS: ReadonlyArray<{
  id: Urgency;
  label: string;
  /** True for levels that should be flagged to an attorney promptly. */
  escalate: boolean;
}> = [
  { id: "emergency", label: "Emergency — today / this week", escalate: true },
  { id: "urgent", label: "Urgent — there's a deadline soon", escalate: true },
  { id: "soon", label: "Soon — within a month or so", escalate: false },
  { id: "routine", label: "No rush — planning ahead", escalate: false },
  { id: "unsure", label: "Not sure", escalate: false },
];

/** Default label/help/input_type per field — used by prompts and the UI. */
export const INTAKE_FIELD_META: Record<
  IntakeFieldId,
  { label: string; help: string; input_type: "text" | "textarea" }
> = {
  full_name: { label: "Your full name", help: "The name to open the file under.", input_type: "text" },
  contact_method: { label: "Best way to reach you", help: "Phone, email, or text.", input_type: "text" },
  contact_detail: { label: "Contact details", help: "The number or email address.", input_type: "text" },
  opposing_parties: {
    label: "Who is on the other side?",
    help: "The other people or companies involved — needed for a conflict check.",
    input_type: "textarea",
  },
  other_parties: {
    label: "Anyone else involved?",
    help: "Related people or entities (family, witnesses, insurers, co-owners).",
    input_type: "textarea",
  },
  jurisdiction: { label: "Where did this happen / where do you live?", help: "State, county, or country.", input_type: "text" },
  key_dates: {
    label: "Any important dates or deadlines?",
    help: "Court dates, incident date, notice dates — even approximate.",
    input_type: "textarea",
  },
  prior_representation: {
    label: "Have you worked with a lawyer on this?",
    help: "Current or prior representation on this matter.",
    input_type: "text",
  },
  documents: {
    label: "What documents do you have?",
    help: "Contracts, notices, police reports, correspondence, filings.",
    input_type: "textarea",
  },
  desired_outcome: { label: "What outcome are you hoping for?", help: "In your own words.", input_type: "textarea" },
  urgency: { label: "How time-sensitive is this?", help: null as unknown as string, input_type: "text" },
  budget: { label: "Any budget or fee expectations?", help: "Optional — helps us match the right option.", input_type: "text" },
  how_heard: { label: "How did you hear about us?", help: "Optional.", input_type: "text" },
  matter_detail: { label: "Anything else we should know?", help: "Details that don't fit above.", input_type: "textarea" },
};

/** Base fields elicited for every matter, in order. */
const BASE_FIELDS: IntakeFieldId[] = [
  "full_name",
  "contact_method",
  "contact_detail",
  "opposing_parties",
  "jurisdiction",
  "desired_outcome",
  "urgency",
  "matter_detail",
];

/** Area-specific fields inserted before `desired_outcome`. */
const AREA_EXTRA: Record<MatterArea, IntakeFieldId[]> = {
  family: ["other_parties", "key_dates", "prior_representation"],
  criminal: ["key_dates", "prior_representation", "documents"],
  personal_injury: ["key_dates", "other_parties", "documents"],
  employment: ["key_dates", "documents"],
  immigration: ["key_dates", "documents"],
  estate: ["other_parties", "documents"],
  business: ["other_parties", "documents"],
  real_estate: ["key_dates", "documents"],
  landlord_tenant: ["key_dates", "documents"],
  ip: ["documents", "key_dates"],
  bankruptcy: ["documents", "budget"],
  other: [],
};

/**
 * Which field ids to elicit for a matter area, de-duped and ordered. This is a
 * hint to the AI (and the UI fallback), not a hard cap — the model may adapt.
 */
export function fieldsForArea(area: MatterArea): IntakeFieldId[] {
  const extra = AREA_EXTRA[area] ?? [];
  const out: IntakeFieldId[] = [];
  const seen = new Set<IntakeFieldId>();
  const push = (id: IntakeFieldId) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  // base up to (not including) desired_outcome, then area extras, then the rest.
  const splitAt = BASE_FIELDS.indexOf("desired_outcome");
  BASE_FIELDS.slice(0, splitAt).forEach(push);
  extra.forEach(push);
  BASE_FIELDS.slice(splitAt).forEach(push);
  return out;
}

export function matterAreaLabel(area: MatterArea): string {
  return MATTER_AREAS.find((m) => m.id === area)?.label ?? "Legal matter";
}

export function isEscalatingUrgency(level: Urgency): boolean {
  return URGENCY_OPTIONS.find((u) => u.id === level)?.escalate ?? false;
}

export function defaultBrief(): IntakeBrief {
  return { persona: "client", matter_area: "other", narrative: "", contact_name: "" };
}

/**
 * A human-friendly intake reference. Pure: the caller supplies the seed (the
 * backend passes a timestamp + random suffix) so this stays deterministic and
 * testable. Shape: INT-YYMM-XXXX.
 */
export function formatReference(yy: number, mm: number, suffix: string): string {
  const m = String(mm).padStart(2, "0");
  const s = (suffix || "0000").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4).padEnd(4, "0");
  return `INT-${String(yy).padStart(2, "0")}${m}-${s}`;
}

/**
 * Derive a reference from a caller-supplied epoch-ms and random 0..1, then hand
 * off to `formatReference`. Pure: the backend passes `Date.now()`/`Math.random()`
 * at call time so `Date.now`/`Math.random` stay OUT of shared and this is
 * deterministic (hence testable). Uses UTC so the result is timezone-independent.
 */
export function makeReference(nowMs: number, rand: number): string {
  const d = new Date(nowMs);
  const yy = d.getUTCFullYear() % 100;
  const mm = d.getUTCMonth() + 1;
  const r = Math.min(Math.max(rand, 0), 0.999999);
  const suffix = Math.floor(r * 36 ** 4).toString(36).padStart(4, "0");
  return formatReference(yy, mm, suffix);
}

// ============================================================================
// Structured-LLM engine — elicit / finalize / help (adapted from
// playbook-from-doc). Every model call uses strict json_schema (every property
// also in `required`), then parse → repair → assert. Self-contained: no imports
// from the sibling val.
// ============================================================================

/** Max chars of narrative sent to the model (keeps gpt-5-nano reliable). */
export const MAX_NARRATIVE_CHARS = 12000;

/** Narrative is user free-text: cap it before it hits the model. Pure/testable. */
export function truncateNarrative(text: string, max = MAX_NARRATIVE_CHARS): string {
  const t = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (t.length <= max) return t;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 80;
  return t.slice(0, head) + "\n\n…[middle truncated for length]…\n\n" + t.slice(-tail);
}

/** Fields the user always confirms even if the model forgets, and which are required. */
const REQUIRED_INTAKE_FIELDS = new Set<IntakeFieldId>([
  "full_name",
  "contact_detail",
  "opposing_parties",
]);

const KNOWN_FIELD_IDS = new Set<IntakeFieldId>(
  Object.keys(INTAKE_FIELD_META) as IntakeFieldId[],
);

const URGENCY_LEVELS: Urgency[] = ["emergency", "urgent", "soon", "routine", "unsure"];
const CONFLICT_ROLES: ConflictRole[] = [
  "client",
  "opposing",
  "related",
  "witness",
  "entity",
  "other",
];

// ---------- Strict JSON-schema enum fragments ----------

const URGENCY_ENUM = { type: "string", enum: URGENCY_LEVELS } as const;
const CONFLICT_ROLE_ENUM = { type: "string", enum: CONFLICT_ROLES } as const;
const INPUT_TYPE_ENUM = { type: "string", enum: ["text", "textarea"] } as const;
const FIELD_ID_ENUM = {
  type: "string",
  enum: Object.keys(INTAKE_FIELD_META) as IntakeFieldId[],
} as const;

/** Shared shape for an urgency flag (level + reason + deadline note). */
const URGENCY_FLAG_OBJECT = {
  type: "object",
  additionalProperties: false,
  required: ["level", "reason", "deadline_note"],
  properties: {
    level: URGENCY_ENUM,
    reason: { type: "string" },
    deadline_note: { type: "string" },
  },
} as const;

// ---------- ELICIT schema ----------

export const ELICIT_INTAKE_SCHEMA = {
  name: "IntakeElicitation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["intro", "detected_area", "empathy_note", "urgency_flag", "fields"],
    properties: {
      intro: { type: "string" },
      detected_area: { type: "string" },
      empathy_note: { type: "string" },
      urgency_flag: { anyOf: [URGENCY_FLAG_OBJECT, { type: "null" }] },
      fields: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "label",
            "help",
            "suggestions",
            "recommended",
            "required",
            "input_type",
          ],
          properties: {
            id: FIELD_ID_ENUM,
            label: { type: "string" },
            help: { type: ["string", "null"] },
            suggestions: { type: "array", items: { type: "string" } },
            recommended: { type: "string" },
            required: { type: "boolean" },
            input_type: INPUT_TYPE_ENUM,
          },
        },
      },
    },
  },
} as const;

// ---------- FINALIZE schema ----------

export const FINALIZE_INTAKE_SCHEMA = {
  name: "FinalizeIntake",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "summary",
      "jurisdiction",
      "conflict_parties",
      "urgency",
      "next_steps",
      "contact_method",
      "contact_detail",
    ],
    properties: {
      summary: { type: "string" },
      jurisdiction: { type: "string" },
      conflict_parties: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "role"],
          properties: {
            name: { type: "string" },
            role: CONFLICT_ROLE_ENUM,
          },
        },
      },
      urgency: URGENCY_FLAG_OBJECT,
      next_steps: { type: "array", items: { type: "string" } },
      contact_method: { type: "string" },
      contact_detail: { type: "string" },
    },
  },
} as const;

// ---------- Prompts ----------

function personaToneBlock(persona: Persona): string {
  return persona === "client"
    ? `PERSONA = client (a person describing their own situation).
- Use plain language; define any legal term the first time you use it.
- Warm, reassuring, and human. A brief empathetic acknowledgement is welcome.
- Keep questions short and concrete. Never assume legal sophistication.`
    : `PERSONA = staff (firm personnel taking an intake).
- Be terse and efficient; use standard legal-intake terminology.
- No hand-holding, no empathy filler. empathy_note MUST be "".`;
}

export function buildElicitIntakePrompt(brief: IntakeBrief): string {
  const area = matterAreaLabel(brief.matter_area);
  const baseline = fieldsForArea(brief.matter_area);
  const baselineList = baseline
    .map((id) => `- ${id}: ${INTAKE_FIELD_META[id].label}`)
    .join("\n");

  return `You are a legal client-intake assistant. You gather INFORMATION only.
You DO NOT give legal advice, opinions on the merits, or predictions of outcome.
You emit ONE JSON object matching the IntakeElicitation schema. No prose, no chat.

# Matter
Practice area (user-selected): ${area}
${brief.contact_name ? `Name on file so far: ${brief.contact_name}` : "No name captured yet."}

# ${personaToneBlock(brief.persona)}

# Your job
Read the narrative below and propose the RIGHT questions to open this file.
Use this baseline set for a ${area} matter as your starting point, but ADAPT to
what the narrative actually says (drop irrelevant ones, keep the essentials):
${baselineList}

For EACH field you emit:
- id MUST be one of the known ids above (closed set).
- Give ≥2 realistic \`suggestions\` GROUNDED IN THE NARRATIVE (concrete options the
  user can tap), plus a \`recommended\` best guess (usually suggestions[0]).
- Write a \`label\` and (for the client persona) a plain-language \`help\`.
- Set \`required\` true for full_name, contact details, and opposing_parties.

# Conflict check (LOAD-BEARING)
Emphasize capturing the NAMES of the opposing party and any other people/companies
involved — the firm runs a conflict check before it can act. Always include an
opposing_parties (and, when relevant, other_parties) field with name-oriented
suggestions.

# Urgency
If the narrative shows time pressure (arrest, court date, deadline, statute of
limitations, eviction, emergency), set \`urgency_flag\` = { level, reason,
deadline_note } using level from: emergency, urgent, soon, routine, unsure.
Otherwise set urgency_flag to null.

# Output
Fill every required property. Use "" for empty strings, null for help when none.
Never give legal advice. JSON only.`;
}

export function buildFinalizeIntakePrompt(brief: IntakeBrief): string {
  const area = matterAreaLabel(brief.matter_area);
  return `You are a legal client-intake assistant finalizing a matter into a
structured record for the firm. You gather INFORMATION only — never give legal
advice. You emit ONE JSON object matching the FinalizeIntake schema. No chat.

# Matter
Practice area: ${area}
${brief.contact_name ? `Client name on file: ${brief.contact_name}` : "Client name: capture from the answers."}

# ${personaToneBlock(brief.persona)}

# From the confirmed answers, produce:
1. summary — a NEUTRAL, firm-facing paragraph describing the matter. No advice,
   no merits opinion. First sentence names the practice area.
2. jurisdiction — the relevant state/county/country from the answers ("" if unknown).
3. conflict_parties — EVERY named person or entity across the narrative and the
   answers, each { name, role } with role from: client, opposing, related,
   witness, entity, other. Include the CLIENT (the intake person) as role "client".
   This list is LOAD-BEARING for the firm's conflict check — be exhaustive, but
   DO NOT invent parties or facts that are not present in the input.
4. urgency — { level, reason, deadline_note }; level from emergency, urgent, soon,
   routine, unsure. emergency/urgent will be escalated to an attorney.
5. next_steps — 2–4 plain-language "what happens next" items appropriate to the
   ${brief.persona} persona (for a client: reassuring, concrete, no legalese).
6. contact_method + contact_detail — how and where to reach the client.

# Hard rules
- Do NOT invent parties, dates, jurisdictions, or facts not present in the input.
- No legal advice, no outcome predictions, no markdown. JSON only.`;
}

export function buildHelpPrompt(
  brief: Partial<IntakeBrief>,
  question: string,
): { system: string; user: string } {
  const persona = brief.persona === "staff" ? "staff" : "client";
  const tone = persona === "client"
    ? "Explain in plain language and define any legal term you use."
    : "Be concise and use standard legal terminology.";
  return {
    system:
      "You help someone completing a legal client-intake form understand a term " +
      "or question. You gather information only — you NEVER give legal advice, " +
      "opinions on the merits, or predictions about their case. " +
      `${tone} Answer in 2–4 short sentences. Plain text only — no markdown, no ` +
      "bullets. NEVER ask a question back. " +
      `Current intake context: ${JSON.stringify(brief)}.`,
    user: question,
  };
}

// ---------- Repair + assert ----------

function asStr(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

function clampUrgency(v: unknown): Urgency {
  return URGENCY_LEVELS.includes(v as Urgency) ? (v as Urgency) : "unsure";
}

function asConflictRole(v: unknown): ConflictRole {
  return CONFLICT_ROLES.includes(v as ConflictRole) ? (v as ConflictRole) : "other";
}

function coerceUrgencyFlag(raw: unknown): UrgencyFlag {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    level: clampUrgency(o.level),
    reason: asStr(o.reason).trim(),
    deadline_note: asStr(o.deadline_note).trim(),
  };
}

/** ≥2 tap-able suggestions per field when the model skimped. Grounded, generic. */
function seedSuggestions(id: IntakeFieldId, brief: IntakeBrief): string[] {
  switch (id) {
    case "full_name":
      return [brief.contact_name || "Your full legal name", "Name as it appears on your ID"];
    case "contact_method":
      return ["Phone call", "Email", "Text message"];
    case "contact_detail":
      return ["Phone number", "Email address"];
    case "opposing_parties":
      return ["The other person's full name", "The company / business name", "Not sure yet"];
    case "other_parties":
      return ["A witness", "A family member", "An insurance company", "No one else"];
    case "jurisdiction":
      return ["The state I live in", "Where the incident happened", "Not sure"];
    case "key_dates":
      return ["Incident date", "Court or hearing date", "Notice / deadline date", "None yet"];
    case "prior_representation":
      return ["No prior lawyer", "Consulted but did not hire", "Currently represented"];
    case "documents":
      return ["A contract or agreement", "A notice or letter", "Photos or records", "None yet"];
    case "desired_outcome":
      return ["Resolve this as quickly as possible", "Financial compensation", "Protect my rights", "Not sure yet"];
    case "urgency":
      return ["Emergency — today / this week", "Urgent — a deadline is coming", "Soon — within a month", "No rush"];
    case "budget":
      return ["Not sure yet", "Prefer a flat fee", "Hourly is fine", "Budget is limited"];
    case "how_heard":
      return ["Referral from someone I know", "Online search", "Social media", "Prior client"];
    case "matter_detail":
      return ["Additional background", "Special circumstances", "Nothing else"];
    default:
      return ["Yes", "No"];
  }
}

function fallbackIntakeField(id: IntakeFieldId, brief: IntakeBrief): IntakeField {
  const meta = INTAKE_FIELD_META[id];
  const suggestions = seedSuggestions(id, brief);
  return {
    id,
    label: meta.label,
    help: meta.help ?? null,
    suggestions,
    recommended: suggestions[0] ?? "",
    required: REQUIRED_INTAKE_FIELDS.has(id),
    input_type: meta.input_type,
  };
}

/**
 * Coerce messy model output into a valid IntakeElicitation: keep only known ids,
 * ≥2 suggestions each (seeded if the model skimped), recommended in-suggestions,
 * required flags for the load-bearing fields, missing baseline fields backfilled,
 * stable order by fieldsForArea. Mirrors playbook-from-doc's repairElicitBrief.
 */
export function repairElicitIntake(raw: unknown, brief: IntakeBrief): IntakeElicitation {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fieldsIn = Array.isArray(o.fields) ? o.fields : [];
  const fields: IntakeField[] = [];
  const seen = new Set<IntakeFieldId>();

  for (const f of fieldsIn) {
    const row = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    const id = String(row.id ?? "") as IntakeFieldId;
    if (!KNOWN_FIELD_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);

    const meta = INTAKE_FIELD_META[id];
    let suggestions = (Array.isArray(row.suggestions) ? row.suggestions : [])
      .map((s) => asStr(s).trim())
      .filter(Boolean);
    if (suggestions.length < 2) suggestions = seedSuggestions(id, brief);

    let recommended = asStr(row.recommended).trim();
    if (!recommended && suggestions[0]) recommended = suggestions[0];
    if (recommended && !suggestions.includes(recommended)) {
      suggestions = [recommended, ...suggestions];
    }

    fields.push({
      id,
      label: asStr(row.label).trim() || meta.label,
      help: row.help == null ? (meta.help ?? null) : asStr(row.help),
      suggestions,
      recommended,
      required: Boolean(row.required) || REQUIRED_INTAKE_FIELDS.has(id),
      input_type: row.input_type === "textarea" || row.input_type === "text"
        ? row.input_type
        : meta.input_type,
    });
  }

  // Backfill baseline fields the model omitted so the form is always usable.
  for (const id of fieldsForArea(brief.matter_area)) {
    if (!seen.has(id)) {
      seen.add(id);
      fields.push(fallbackIntakeField(id, brief));
    }
  }

  // Stable order = fieldsForArea order; extra known ids fall to the end.
  const order = fieldsForArea(brief.matter_area);
  const rank = (id: IntakeFieldId) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  fields.sort((a, b) => rank(a.id) - rank(b.id));

  const urgency_flag = o.urgency_flag == null ? null : coerceUrgencyFlag(o.urgency_flag);

  return {
    intro: asStr(o.intro).trim() ||
      "A few quick questions so we can open your file correctly.",
    detected_area: asStr(o.detected_area).trim() || matterAreaLabel(brief.matter_area),
    // Staff persona never gets empathy filler.
    empathy_note: brief.persona === "staff" ? "" : asStr(o.empathy_note).trim(),
    urgency_flag,
    fields,
  };
}

/** Case-insensitive name key for de-duping conflict parties. */
function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Coerce model output into a valid FinalizeIntakeResponse: conflict_parties
 * deduped with valid roles and the client always included (by known name),
 * urgency clamped, next_steps non-empty, contact/jurisdiction backfilled from
 * the confirmed answers. Mirrors playbook-from-doc's repairExtract.
 */
export function repairFinalizeIntake(
  raw: unknown,
  brief: IntakeBrief,
  answers: Record<string, string>,
): FinalizeIntakeResponse {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ans = answers ?? {};

  // Conflict parties: dedupe by name, keep first role; ensure the client is present.
  const partiesIn = Array.isArray(o.conflict_parties) ? o.conflict_parties : [];
  const byName = new Map<string, ConflictParty>();
  for (const p of partiesIn) {
    const row = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
    const name = asStr(row.name).trim();
    if (!name) continue;
    const key = nameKey(name);
    if (!byName.has(key)) byName.set(key, { name, role: asConflictRole(row.role) });
  }

  const clientName = (brief.contact_name || ans.full_name || "").trim();
  if (clientName) {
    const key = nameKey(clientName);
    // The client always wins the "client" role even if the model tagged them otherwise.
    byName.set(key, { name: byName.get(key)?.name || clientName, role: "client" });
  }
  const conflict_parties = Array.from(byName.values());

  let next_steps = (Array.isArray(o.next_steps) ? o.next_steps : [])
    .map((s) => asStr(s).trim())
    .filter(Boolean);
  if (next_steps.length === 0) {
    next_steps = ["A member of the firm will review your intake and follow up with you."];
  }

  return {
    summary: asStr(o.summary).trim(),
    jurisdiction: asStr(o.jurisdiction).trim() || asStr(ans.jurisdiction).trim(),
    conflict_parties,
    urgency: coerceUrgencyFlag(o.urgency),
    next_steps,
    contact_method: asStr(o.contact_method).trim() || asStr(ans.contact_method).trim(),
    contact_detail: asStr(o.contact_detail).trim() || asStr(ans.contact_detail).trim(),
  };
}

/** Final gate before use: summary present and conflict_parties an array. */
export function assertFinalizeIntake(res: FinalizeIntakeResponse): void {
  if (!res || typeof res !== "object") throw new Error("finalize: missing response");
  if (!res.summary || !res.summary.trim()) throw new Error("finalize: missing summary");
  if (!Array.isArray(res.conflict_parties)) {
    throw new Error("finalize: conflict_parties must be an array");
  }
}

/**
 * Guard a client-supplied IntakeRecord before persisting. Throws if the identity
 * fields (reference/persona/matter_area/contact_name) or summary are missing, or
 * if conflict_parties is not an array. Mirrors `assertFinalizeIntake`'s style.
 */
export function assertIntakeRecord(r: IntakeRecord): void {
  if (!r || typeof r !== "object") throw new Error("intake: missing record");
  if (!r.reference || !String(r.reference).trim()) throw new Error("intake: missing reference");
  if (!r.persona || !String(r.persona).trim()) throw new Error("intake: missing persona");
  if (!r.matter_area || !String(r.matter_area).trim()) throw new Error("intake: missing matter_area");
  if (!r.summary || !String(r.summary).trim()) throw new Error("intake: missing summary");
  if (!Array.isArray(r.conflict_parties)) {
    throw new Error("intake: conflict_parties must be an array");
  }
  if (!r.contact_name || !String(r.contact_name).trim()) throw new Error("intake: missing contact_name");
}
