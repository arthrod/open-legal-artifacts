/** @jsxImportSource https://esm.sh/react@18.2.0 */
import React, { useState } from "https://esm.sh/react@18.2.0?deps=react@18.2.0";
import { callHelp } from "./session.ts";
import { isEscalatingUrgency } from "../shared/catalog.ts";
import type { IntakeBrief, Stage, UrgencyFlag } from "../shared/types.ts";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-panel="true" className={`bg-white border border-slate-200 shadow-sm rounded-lg p-6 sm:p-8 ${className}`}>
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  testid,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  testid?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      data-variant="primary"
      className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold uppercase tracking-[0.14em] px-5 py-2.5 rounded"
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  onClick,
  disabled,
  testid,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      data-variant="secondary"
      className="border border-slate-300 hover:border-slate-500 text-slate-700 text-xs font-semibold uppercase tracking-[0.14em] px-4 py-2.5 rounded disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Chip({
  children,
  active,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={!!active}
      data-variant="chip"
      className={"text-xs px-3 py-1.5 rounded-full border transition " +
        (active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white text-slate-700 border-slate-300 hover:border-slate-500")}
    >
      {children}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      data-testid="error-box"
      className="mt-4 rounded border border-rose-300 bg-rose-50 text-rose-900 text-sm px-3 py-2"
    >
      {message}
    </div>
  );
}

/**
 * Attorney-escalation cue for time-sensitive matters. Red for emergency, amber
 * for urgent; both surface the reason + deadline note. Nothing renders for
 * non-escalating levels (soon/routine/unsure) so the banner is a real signal.
 */
function UrgencyBanner({ flag }: { flag: UrgencyFlag | null | undefined }) {
  if (!flag || !isEscalatingUrgency(flag.level)) return null;
  const emergency = flag.level === "emergency";
  const cls = emergency
    ? "border-rose-400 bg-rose-50 text-rose-900"
    : "border-amber-400 bg-amber-50 text-amber-900";
  return (
    <div
      role="alert"
      data-testid="urgency-banner"
      className={`rounded-lg border px-4 py-3 text-sm ${cls}`}
    >
      <div className="font-semibold">
        ⚠ Time-sensitive — we'll flag this to an attorney
      </div>
      {flag.reason && <div className="mt-0.5">{flag.reason}</div>}
      {flag.deadline_note && (
        <div className="mt-0.5 text-xs font-medium">{flag.deadline_note}</div>
      )}
    </div>
  );
}

/** Linear progress rail across the four visible stages. */
function Stepper({ stage }: { stage: Stage }) {
  const steps: { label: string; stages: Stage[] }[] = [
    { label: "1. Your matter", stages: ["start"] },
    { label: "2. Guided questions", stages: ["eliciting", "elicit"] },
    { label: "3. Review", stages: ["finalizing", "review"] },
    { label: "4. Submitted", stages: ["saved"] },
  ];
  const activeIdx = steps.findIndex((s) => s.stages.includes(stage));
  return (
    <nav className="flex flex-wrap gap-2 mb-6" aria-label="Progress" data-testid="stepper">
      {steps.map((s, i) => {
        const active = i === activeIdx;
        const done = activeIdx > -1 && i < activeIdx;
        return (
          <span
            key={s.label}
            data-current={active ? "true" : "false"}
            className={"text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded border " +
              (active
                ? "bg-slate-900 text-white border-slate-900"
                : done
                ? "bg-white text-slate-700 border-slate-300"
                : "bg-transparent text-slate-400 border-slate-200")}
          >
            {s.label}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * Inline "ask what this means" helper backed by /api/help. Persona-aware,
 * information-only. Shown per field for the client persona.
 */
function HelpInline({
  brief,
  question,
  label = "What does this mean?",
}: {
  brief: Partial<IntakeBrief>;
  /** Optional pre-filled question (e.g. the field label). */
  question?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(question ?? "");
  const [ans, setAns] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!q.trim()) return;
    setBusy(true);
    setAns(null);
    try {
      setAns(await callHelp(brief, q.trim()));
    } catch (e: unknown) {
      setAns((e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        className="text-xs text-slate-500 hover:text-slate-900 underline"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && question && !ans && !busy) void ask();
        }}
      >
        {open ? "Hide help" : label}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {!question && (
            <div className="flex gap-2">
              <input
                className="flex-1 border border-slate-300 rounded px-3 py-2 text-sm"
                placeholder='e.g. "What is a conflict check?"'
                value={q}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void ask();
                  }
                }}
              />
              <PrimaryButton onClick={ask} disabled={busy || !q.trim()}>
                {busy ? "…" : "Ask"}
              </PrimaryButton>
            </div>
          )}
          {busy && <p className="text-xs text-slate-400">Thinking…</p>}
          {ans && (
            <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 leading-relaxed">
              {ans}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export {
  Card,
  Chip,
  ErrorBox,
  GhostButton,
  HelpInline,
  PrimaryButton,
  Stepper,
  UrgencyBanner,
};
