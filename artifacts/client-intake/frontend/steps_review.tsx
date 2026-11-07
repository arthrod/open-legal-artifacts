/** @jsxImportSource https://esm.sh/react@18.2.0 */
import React, { useState } from "https://esm.sh/react@18.2.0?deps=react@18.2.0";
import { INTAKE_FIELD_META } from "../shared/catalog.ts";
import { buildRecord, callSubmit, type ClientSession } from "./session.ts";
import { Card, ErrorBox, GhostButton, PrimaryButton, UrgencyBanner } from "./ui.tsx";
import type { ConflictRole, IntakeFieldId, SubmitIntakeResponse } from "../shared/types.ts";

const ROLE_LABEL: Record<ConflictRole, string> = {
  client: "Client",
  opposing: "Opposing party",
  related: "Related party",
  witness: "Witness",
  entity: "Company / entity",
  other: "Other",
};

const ROLE_CLS: Record<ConflictRole, string> = {
  client: "bg-slate-900 text-white border-slate-900",
  opposing: "bg-rose-50 text-rose-800 border-rose-300",
  related: "bg-amber-50 text-amber-900 border-amber-300",
  witness: "bg-sky-50 text-sky-900 border-sky-300",
  entity: "bg-slate-50 text-slate-700 border-slate-300",
  other: "bg-slate-50 text-slate-700 border-slate-300",
};

function answerLabel(id: string): string {
  return INTAKE_FIELD_META[id as IntakeFieldId]?.label ?? id;
}

/** Thinking state while /api/finalize-intake runs. */
function FinalizingStep({ persona }: { persona: ClientSession["brief"]["persona"] }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
        <div>
          <div className="text-sm font-semibold">Structuring your intake…</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {persona === "client"
              ? "We're organizing everything for the firm. Almost there."
              : "Finalizing the structured record. Up to ~45s."}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ReviewStep({
  session,
  onChange,
  onBack,
  onSaved,
}: {
  session: ClientSession;
  onChange: (patch: Partial<ClientSession>) => void;
  onBack: () => void;
  onSaved: (res: SubmitIntakeResponse) => void;
}) {
  const [askingSure, setAskingSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalize = session.finalize;
  const client = session.brief.persona === "client";

  if (!finalize) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Nothing to review yet.</p>
        <div className="mt-4">
          <GhostButton onClick={onBack}>Back</GhostButton>
        </div>
      </Card>
    );
  }

  async function reallySubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await callSubmit(buildRecord(session));
      onSaved(res);
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : String(e)));
      setAskingSure(false);
    } finally {
      setBusy(false);
    }
  }

  const answerKeys = Object.keys(session.answers).filter((k) => (session.answers[k] ?? "").trim());

  return (
    <Card>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1">
        Review
      </div>
      <h2 className="text-xl font-semibold mb-3">Check your intake before submitting</h2>

      <div className="mb-4">
        <UrgencyBanner flag={finalize.urgency} />
      </div>

      {/* Firm-facing summary */}
      <section className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Summary</h3>
        <p className="text-sm text-slate-800 leading-relaxed" data-testid="review-summary">
          {finalize.summary}
        </p>
        {finalize.jurisdiction && (
          <p className="text-xs text-slate-500 mt-1">Jurisdiction: {finalize.jurisdiction}</p>
        )}
      </section>

      {/* Conflict parties — prominent, load-bearing */}
      <section className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="conflict-parties">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Conflict-check parties
        </h3>
        {finalize.conflict_parties.length === 0
          ? <p className="text-sm text-slate-500">No parties captured.</p>
          : (
            <ul className="space-y-1.5">
              {finalize.conflict_parties.map((p, i) => (
                <li key={`${p.name}-${i}`} className="flex items-center gap-2 text-sm" data-testid="conflict-party">
                  <span className="font-medium text-slate-900">{p.name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded border ${ROLE_CLS[p.role] ?? ROLE_CLS.other}`}>
                    {ROLE_LABEL[p.role] ?? p.role}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </section>

      {/* What happens next */}
      {finalize.next_steps.length > 0 && (
        <section className="mb-5" data-testid="next-steps">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            What happens next
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700">
            {finalize.next_steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </section>
      )}

      {/* Confirmed answers (edit by going back) */}
      {answerKeys.length > 0 && (
        <section className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Details you confirmed
          </h3>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {answerKeys.map((k) => (
              <div key={k}>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {answerLabel(k)}
                </dt>
                <dd className="text-sm text-slate-800 break-words">{session.answers[k]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-slate-500 mt-2">
            Need to change something?{" "}
            <button type="button" className="underline hover:text-slate-900" onClick={onBack}>
              Go back to the questions
            </button>
            .
          </p>
        </section>
      )}

      {/* Data-handling notice + discard opt-out */}
      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
          How your information is handled
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed mb-3">
          Your answers are sent to an AI model (through Val Town) to organize this intake and are
          stored with the intake for the firm to review. We never use it to give legal advice. By default a copy of your
          free-text description is kept with the intake; you can opt out below.
        </p>
        <label className="flex items-start gap-2.5 rounded border border-slate-200 bg-slate-50 px-3 py-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            data-testid="discard-narrative-toggle"
            checked={session.discard_narrative}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ discard_narrative: e.target.checked })}
            aria-label="Save my intake but discard the free-text description"
            className="mt-0.5 h-4 w-4 accent-slate-900"
          />
          <span className="text-sm text-slate-700">
            <span className="font-medium text-slate-900">
              Save my intake but discard the free-text description.
            </span>{" "}
            The structured details above are kept; the paragraph you wrote is not stored.
          </span>
        </label>
      </section>

      {error && <ErrorBox message={error} />}

      <div className="mt-6 flex items-center justify-between gap-3">
        <GhostButton onClick={onBack} disabled={busy} testid="review-back">Back</GhostButton>
        {askingSure
          ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-700">Are you sure?</span>
              <GhostButton onClick={() => setAskingSure(false)} disabled={busy}>Not yet</GhostButton>
              <PrimaryButton onClick={reallySubmit} disabled={busy} testid="confirm-submit">
                {busy ? "Submitting…" : "Yes, submit intake"}
              </PrimaryButton>
            </div>
          )
          : (
            <PrimaryButton onClick={() => setAskingSure(true)} testid="submit-intake">
              Submit intake
            </PrimaryButton>
          )}
      </div>

      <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
        Submitting shares this information with the firm. It is not legal advice and does not create
        an attorney–client relationship until the firm accepts your matter.
      </p>
    </Card>
  );
}

export { FinalizingStep, ReviewStep };
