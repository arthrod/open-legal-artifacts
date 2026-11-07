// Shared types for client-intake — must run in both browser and Deno.
// No `Deno.*` references in this file.
//
// Two-stage structured-LLM engine (adapted from playbook-from-doc):
//   1) ELICIT   — AI proposes intake fields (each with ≥2 suggestions) tailored
//                 to the matter area + persona; the user confirms/edits.
//   2) FINALIZE — AI structures the answers into an IntakeRecord: a firm-facing
//                 summary, a conflict-check party list, urgency/deadline flags,
//                 and "what happens next" for the client.

/** Who is filling this out — tunes tone and terminology. */
export type Persona = "client" | "staff";

/** Broad practice area; gates which fields are elicited. */
export type MatterArea =
  | "family"
  | "criminal"
  | "personal_injury"
  | "employment"
  | "immigration"
  | "estate"
  | "business"
  | "real_estate"
  | "landlord_tenant"
  | "ip"
  | "bankruptcy"
  | "other";

/** How time-sensitive the matter is. `emergency` and `urgent` flag to an attorney. */
export type Urgency = "emergency" | "urgent" | "soon" | "routine" | "unsure";

/** Role of a named party for the firm's conflict check. */
export type ConflictRole =
  | "client"
  | "opposing"
  | "related"
  | "witness"
  | "entity"
  | "other";

/** Field ids the AI may elicit. Kept as a closed set for schema strictness. */
export type IntakeFieldId =
  | "full_name"
  | "contact_method"
  | "contact_detail"
  | "opposing_parties"
  | "other_parties"
  | "jurisdiction"
  | "key_dates"
  | "prior_representation"
  | "documents"
  | "desired_outcome"
  | "urgency"
  | "budget"
  | "how_heard"
  | "matter_detail";

/** One field the AI asks the user to confirm — legal-intake style. */
export interface IntakeField {
  id: IntakeFieldId;
  label: string;
  /** Plain-language help (especially for the client persona). Null = none. */
  help: string | null;
  /** ≥2 alternatives the user can pick; the user may always type a custom value. */
  suggestions: string[];
  /** Model's best guess (usually suggestions[0]). */
  recommended: string;
  required: boolean;
  input_type: "text" | "textarea";
}

/** A time-sensitivity flag surfaced during elicitation. */
export interface UrgencyFlag {
  level: Urgency;
  reason: string;
  /** e.g. "Possible statute of limitations" / "Court date noted" / "". */
  deadline_note: string;
}

/** AI's proposed intake questions after reading the narrative. */
export interface IntakeElicitation {
  intro: string;
  detected_area: string;
  /** A short empathetic acknowledgement for the client persona; "" for staff. */
  empathy_note: string;
  /** Non-null when the narrative suggests time pressure. */
  urgency_flag: UrgencyFlag | null;
  fields: IntakeField[];
}

/** What the user provides BEFORE elicitation. */
export interface IntakeBrief {
  persona: Persona;
  matter_area: MatterArea;
  /** Free-text: "describe what's going on." */
  narrative: string;
  /** Optional up-front name (secretary may know it). */
  contact_name: string;
}

// ---------- Elicit request/response ----------

export interface ElicitIntakeRequest {
  brief: IntakeBrief;
}

export interface ElicitIntakeResponse {
  elicitation: IntakeElicitation;
}

// ---------- Finalize request/response ----------

export interface ConflictParty {
  name: string;
  role: ConflictRole;
}

/** The structured intake, produced at finalize and persisted on submit. */
export interface IntakeRecord {
  reference: string;
  persona: Persona;
  matter_area: MatterArea;
  jurisdiction: string;
  narrative: string;
  /** Neutral, firm-facing summary of the matter. */
  summary: string;
  /** field_id → confirmed answer. */
  answers: Record<string, string>;
  /** Every named person/entity, for the firm's conflict check. */
  conflict_parties: ConflictParty[];
  urgency: UrgencyFlag;
  /** Plain-language "what happens next" for the client. */
  next_steps: string[];
  contact_name: string;
  contact_method: string;
  contact_detail: string;
  /** Whether the source narrative should be discarded on save (privacy opt-out). */
  discard_narrative?: boolean;
}

export interface FinalizeIntakeRequest {
  brief: IntakeBrief;
  answers: Record<string, string>;
}

/** The AI-produced portion of an IntakeRecord (reference/answers added client-side). */
export interface FinalizeIntakeResponse {
  summary: string;
  jurisdiction: string;
  conflict_parties: ConflictParty[];
  urgency: UrgencyFlag;
  next_steps: string[];
  contact_method: string;
  contact_detail: string;
}

// ---------- Persistence (firm-facing list + detail) ----------

/** Lightweight row for the firm's intake list (no narrative/payload). */
export interface IntakeSummary {
  id: number;
  reference: string;
  created_at: string;
  persona: string;
  matter_area: string;
  jurisdiction: string;
  urgency_level: string;
  conflict_count: number;
  contact_name: string;
}

/** A full stored intake: the summary columns plus the parsed payload. */
export interface IntakeRow extends IntakeSummary {
  payload: IntakeRecord;
}

export interface SubmitIntakeRequest {
  intake: IntakeRecord;
}

export interface SubmitIntakeResponse {
  ok: true;
  intake_id: number;
  reference: string;
  /** True when the val is a public demo and the intake was validated but not stored. */
  demo?: boolean;
}

export interface HelpRequest {
  brief: Partial<IntakeBrief>;
  question: string;
}

export interface HelpResponse {
  explanation: string;
}

/** UI session stages. */
export type Stage =
  | "start" // persona + matter area + narrative
  | "eliciting" // AI thinking
  | "elicit" // user answers AI questions
  | "finalizing"
  | "review" // confirm structured intake
  | "saved"
  | "error";
