// Client-intake session state, localStorage persistence, and API callers.
// No JSX; runs in the browser. Pure record/markdown logic lives in
// ../shared/intake_client.ts (unit-tested); this module wires it to fetch + state.
import { defaultBrief } from "../shared/catalog.ts";
import { buildIntakeRecord } from "../shared/intake_client.ts";
import type {
  ElicitIntakeResponse,
  FinalizeIntakeResponse,
  IntakeBrief,
  IntakeElicitation,
  IntakeRecord,
  Stage,
  SubmitIntakeResponse,
} from "../shared/types.ts";

/** The whole client-side draft, persisted to localStorage between reloads. */
export interface ClientSession {
  stage: Stage;
  brief: IntakeBrief;
  elicitation: IntakeElicitation | null;
  /** field_id → confirmed answer. */
  answers: Record<string, string>;
  finalize: FinalizeIntakeResponse | null;
  /** Privacy opt-out chosen at review: discard the free-text narrative on save. */
  discard_narrative: boolean;
  saved_id: number | null;
  saved_reference: string | null;
  error_message: string | null;
}

const STATE_KEY = "client-intake.session.v1";

function emptySession(): ClientSession {
  return {
    stage: "start",
    brief: defaultBrief(),
    elicitation: null,
    answers: {},
    finalize: null,
    discard_narrative: false,
    saved_id: null,
    saved_reference: null,
    error_message: null,
  };
}

function loadSession(): ClientSession {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      const s = { ...emptySession(), ...(JSON.parse(raw) as ClientSession) };
      // In-flight stages never survive a reload — drop back to the last stable one.
      if (s.stage === "eliciting") s.stage = "start";
      if (s.stage === "finalizing") s.stage = "elicit";
      s.brief = { ...defaultBrief(), ...(s.brief ?? {}) };
      s.answers = s.answers ?? {};
      s.elicitation = s.elicitation ?? null;
      s.finalize = s.finalize ?? null;
      s.discard_narrative = typeof s.discard_narrative === "boolean" ? s.discard_narrative : false;
      return s;
    }
  } catch (_e) { /* fall through to a fresh session */ }
  return emptySession();
}

function persist(s: ClientSession) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch (_e) { /* quota — ignore */ }
}

function resetSession(): ClientSession {
  const s = emptySession();
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch (_e) { /* quota — ignore */ }
  return s;
}

// ---------- API callers ----------

async function callElicit(brief: IntakeBrief): Promise<IntakeElicitation> {
  const r = await fetch("/api/elicit-intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brief }),
  });
  if (!r.ok) throw new Error(`/api/elicit-intake ${r.status}: ${await r.text()}`);
  const json = (await r.json()) as ElicitIntakeResponse;
  return json.elicitation;
}

async function callFinalize(
  brief: IntakeBrief,
  answers: Record<string, string>,
): Promise<FinalizeIntakeResponse> {
  const r = await fetch("/api/finalize-intake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brief, answers }),
  });
  if (!r.ok) throw new Error(`/api/finalize-intake ${r.status}: ${await r.text()}`);
  return (await r.json()) as FinalizeIntakeResponse;
}

async function callSubmit(intake: IntakeRecord): Promise<SubmitIntakeResponse> {
  const r = await fetch("/api/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ intake }),
  });
  if (!r.ok) throw new Error(`/api/submit ${r.status}: ${await r.text()}`);
  return (await r.json()) as SubmitIntakeResponse;
}

async function callHelp(brief: Partial<IntakeBrief>, question: string): Promise<string> {
  const r = await fetch("/api/help", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brief, question }),
  });
  if (!r.ok) throw new Error(`/api/help ${r.status}: ${await r.text()}`);
  const json = (await r.json()) as { explanation: string };
  return json.explanation;
}

/** Assemble the IntakeRecord to submit from the current session. */
function buildRecord(session: ClientSession): IntakeRecord {
  if (!session.finalize) throw new Error("cannot build record before finalize");
  return buildIntakeRecord({
    brief: session.brief,
    answers: session.answers,
    finalize: session.finalize,
    discardNarrative: session.discard_narrative,
  });
}

export {
  buildRecord,
  callElicit,
  callFinalize,
  callHelp,
  callSubmit,
  emptySession,
  loadSession,
  persist,
  resetSession,
  STATE_KEY,
};
