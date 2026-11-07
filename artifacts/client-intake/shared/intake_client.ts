// Pure client-side intake helpers, kept out of the browser-only frontend so they
// are unit-testable under `deno test`. No JSX, no DOM, no `Deno.*` — type-only
// imports plus the pure catalog helpers.
//
//   buildIntakeRecord  — assemble an IntakeRecord from brief + answers + finalize
//                        result (reference left "" so the backend assigns it).
//   firstMissingRequired — validation: first required field with a blank answer.
//   intakeToMarkdown   — the Export/Print summary (mirrors playbook's toMarkdown).
import { isEscalatingUrgency, matterAreaLabel } from "./catalog.ts";
import { INTAKE_FIELD_META } from "./catalog.ts";
import type {
  ConflictRole,
  FinalizeIntakeResponse,
  IntakeBrief,
  IntakeField,
  IntakeFieldId,
  IntakeRecord,
} from "./types.ts";

export interface BuildIntakeRecordInput {
  brief: IntakeBrief;
  answers: Record<string, string>;
  finalize: FinalizeIntakeResponse;
  /** Privacy opt-out: when true the free-text narrative is dropped on save. */
  discardNarrative: boolean;
}

/**
 * Assemble the persisted IntakeRecord from the confirmed session. Reference is
 * left "" on purpose — the backend owns the non-deterministic reference seed and
 * assigns it at submit. contact_name falls back to the answered full_name so the
 * record always satisfies `assertIntakeRecord`.
 */
export function buildIntakeRecord(input: BuildIntakeRecordInput): IntakeRecord {
  const { brief, answers, finalize, discardNarrative } = input;
  const contactName = (brief.contact_name || answers.full_name || "").trim();
  return {
    reference: "",
    persona: brief.persona,
    matter_area: brief.matter_area,
    jurisdiction: finalize.jurisdiction,
    narrative: discardNarrative ? "" : brief.narrative,
    summary: finalize.summary,
    answers: { ...answers },
    conflict_parties: finalize.conflict_parties,
    urgency: finalize.urgency,
    next_steps: finalize.next_steps,
    contact_name: contactName,
    contact_method: finalize.contact_method,
    contact_detail: finalize.contact_detail,
    discard_narrative: discardNarrative,
  };
}

/**
 * First required field whose answer is blank (after trimming), or null when
 * every required field has a value. Optional fields never block. Used by the
 * elicit step to gate "Review my intake".
 */
export function firstMissingRequired(
  fields: IntakeField[],
  answers: Record<string, string>,
): IntakeField | null {
  for (const f of fields) {
    if (f.required && !(answers[f.id] ?? "").trim()) return f;
  }
  return null;
}

const ROLE_LABEL: Record<ConflictRole, string> = {
  client: "Client",
  opposing: "Opposing party",
  related: "Related party",
  witness: "Witness",
  entity: "Company / entity",
  other: "Other",
};

function answerLabel(id: string): string {
  return INTAKE_FIELD_META[id as IntakeFieldId]?.label ?? id;
}

/**
 * Firm-facing Markdown summary for Export/Print. Pure: record → string, so the
 * bytes are unit-tested here and the download wiring is covered by the E2E.
 */
export function intakeToMarkdown(record: IntakeRecord): string {
  const md: string[] = [];
  md.push(`# Client intake — ${record.reference || "(pending reference)"}`, "");

  const meta: string[] = [`**Matter:** ${matterAreaLabel(record.matter_area)}`];
  if (record.jurisdiction) meta.push(`**Jurisdiction:** ${record.jurisdiction}`);
  if (record.contact_name) meta.push(`**Contact:** ${record.contact_name}`);
  md.push(meta.join(" · "), "");

  const u = record.urgency;
  if (isEscalatingUrgency(u.level)) {
    md.push(`> ⚠ **Time-sensitive (${u.level}).** ${u.reason || ""}`.trimEnd());
    if (u.deadline_note) md.push(`> ${u.deadline_note}`);
    md.push("");
  } else {
    md.push(`**Urgency:** ${u.level}${u.reason ? ` — ${u.reason}` : ""}`, "");
  }

  if (record.summary) md.push("## Summary", "", record.summary, "");

  md.push("## Conflict-check parties", "");
  if (record.conflict_parties.length === 0) {
    md.push("_No parties captured._", "");
  } else {
    for (const p of record.conflict_parties) {
      md.push(`- **${p.name}** — ${ROLE_LABEL[p.role] ?? p.role}`);
    }
    md.push("");
  }

  if (record.next_steps.length) {
    md.push("## What happens next", "");
    record.next_steps.forEach((s, i) => md.push(`${i + 1}. ${s}`));
    md.push("");
  }

  const answerKeys = Object.keys(record.answers).filter((k) => (record.answers[k] ?? "").trim());
  if (answerKeys.length) {
    md.push("## Details you confirmed", "");
    for (const k of answerKeys) {
      md.push(`- **${answerLabel(k)}:** ${record.answers[k]}`);
    }
    md.push("");
  }

  if (!record.discard_narrative && record.narrative.trim()) {
    md.push("## In your words", "", record.narrative.trim(), "");
  }

  md.push(
    "---",
    "",
    "_This intake gathers information only. It is not legal advice and does not " +
      "create an attorney–client relationship until the firm accepts the matter._",
  );
  return md.join("\n");
}
