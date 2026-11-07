/** @jsxImportSource https://esm.sh/react@18.2.0 */
import React, { useState } from "https://esm.sh/react@18.2.0?deps=react@18.2.0";
import { firstMissingRequired } from "../shared/intake_client.ts";
import { Card, Chip, ErrorBox, GhostButton, HelpInline, PrimaryButton, UrgencyBanner } from "./ui.tsx";
import type { IntakeBrief, IntakeElicitation } from "../shared/types.ts";

/** Thinking state while /api/elicit-intake runs (slow, ~30–45s). */
function ElicitingStep({ persona }: { persona: IntakeBrief["persona"] }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin" />
        <div>
          <div className="text-sm font-semibold">Reading your matter…</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {persona === "client"
              ? "We're preparing a few guided questions. This can take up to a minute."
              : "Eliciting structured intake fields. Up to ~45s."}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ElicitStep({
  brief,
  elicitation,
  initialAnswers,
  onBack,
  onReview,
}: {
  brief: IntakeBrief;
  elicitation: IntakeElicitation;
  initialAnswers: Record<string, string>;
  onBack: () => void;
  onReview: (answers: Record<string, string>) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    if (initialAnswers && Object.keys(initialAnswers).length) return { ...initialAnswers };
    const init: Record<string, string> = {};
    for (const f of elicitation.fields) init[f.id] = f.recommended || "";
    return init;
  });
  const [err, setErr] = useState<string | null>(null);
  const client = brief.persona === "client";

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function submit() {
    const miss = firstMissingRequired(elicitation.fields, answers);
    if (miss) {
      setErr(`"${miss.label}" is required — pick a suggestion or write your own.`);
      return;
    }
    setErr(null);
    onReview(answers);
  }

  return (
    <Card>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1">
        Guided questions
      </div>
      <h2 className="text-xl font-semibold mb-1">Confirm the details</h2>
      <p className="text-sm text-slate-600 mb-2">{elicitation.intro}</p>
      {client && elicitation.empathy_note && (
        <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 mb-3 leading-relaxed">
          {elicitation.empathy_note}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs font-medium px-2.5 py-1 rounded border border-slate-300 bg-white">
          Detected: {elicitation.detected_area}
        </span>
      </div>

      {elicitation.urgency_flag && (
        <div className="mb-4">
          <UrgencyBanner flag={elicitation.urgency_flag} />
        </div>
      )}

      <div className="space-y-5">
        {elicitation.fields.map((f) => {
          const value = answers[f.id] ?? "";
          return (
            <div key={f.id} className="border border-slate-200 rounded-lg p-4" data-testid={`field-${f.id}`}>
              <label htmlFor={`input-${f.id}`} className="block font-medium text-sm mb-0.5">
                {f.label}
                {f.required && <span className="text-rose-600" data-testid={`required-${f.id}`}> *</span>}
              </label>
              {f.help && <p className="text-xs text-slate-500 mb-2">{f.help}</p>}

              {f.suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {f.suggestions.map((s) => (
                    <Chip
                      key={s}
                      active={value === s}
                      onClick={() => setAnswer(f.id, s)}
                    >
                      {s}
                      {s === f.recommended ? " ★" : ""}
                    </Chip>
                  ))}
                </div>
              )}

              {f.input_type === "textarea" ? (
                <textarea
                  id={`input-${f.id}`}
                  data-testid={`input-${f.id}`}
                  className="w-full border border-slate-300 focus:border-slate-500 rounded px-3 py-2 text-sm min-h-[72px]"
                  placeholder="Pick a suggestion above or write your own…"
                  value={value}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAnswer(f.id, e.target.value)}
                />
              ) : (
                <input
                  id={`input-${f.id}`}
                  data-testid={`input-${f.id}`}
                  className="w-full border border-slate-300 focus:border-slate-500 rounded px-3 py-2 text-sm"
                  placeholder="Pick a suggestion above or write your own…"
                  value={value}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAnswer(f.id, e.target.value)}
                />
              )}

              {client && f.help && (
                <HelpInline brief={brief} question={f.label} label="What does this mean?" />
              )}
            </div>
          );
        })}
      </div>

      {err && <ErrorBox message={err} />}

      <div className="mt-6 flex justify-between gap-3">
        <GhostButton onClick={onBack} testid="elicit-back">Back</GhostButton>
        <PrimaryButton onClick={submit} testid="review-my-intake">Review my intake</PrimaryButton>
      </div>
    </Card>
  );
}

export { ElicitingStep, ElicitStep };
