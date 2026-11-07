/** @jsxImportSource https://esm.sh/react@18.2.0 */
import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.2.0?deps=react@18.2.0";
import {
  INTAKE_FIELD_META,
  isEscalatingUrgency,
  MATTER_AREAS,
  matterAreaLabel,
  URGENCY_OPTIONS,
} from "../shared/catalog.ts";
import {
  escalatingCount,
  filterIntakes,
  type IntakeFilter,
  intakeMetaLine,
  sortIntakesByUrgency,
} from "../shared/firm.ts";
import { fetchIntake, fetchIntakes } from "./firm_session.ts";
import { downloadMarkdown } from "./exporters.ts";
import { Card, ErrorBox, GhostButton, PrimaryButton, UrgencyBanner } from "./ui.tsx";
import type {
  ConflictRole,
  IntakeFieldId,
  IntakeRow,
  IntakeSummary,
  Urgency,
} from "../shared/types.ts";

// The firm dashboard is a self-contained overlay, NOT a client-intake stage: it
// is read-only, does not belong in the linear start→…→saved progress, and stays
// out of the persisted `stage`. App toggles it from the header. Mirrors the
// playbook-from-doc library overlay pattern.

type View = { kind: "list" } | { kind: "detail"; id: number };

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

/** Short, locale-friendly date for a list row. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Urgency chip: red for emergency, amber for urgent, neutral otherwise. */
function UrgencyChip({ level }: { level: string }) {
  const escalating = isEscalatingUrgency(level as Urgency);
  const emergency = level === "emergency";
  const cls = emergency
    ? "bg-rose-100 text-rose-900 border-rose-300"
    : level === "urgent"
    ? "bg-amber-100 text-amber-900 border-amber-300"
    : "bg-slate-100 text-slate-600 border-slate-300";
  return (
    <span
      data-testid="urgency-chip"
      data-level={level}
      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}
    >
      {escalating ? "⚠ " : ""}
      {level}
    </span>
  );
}

function FirmDashboard({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [mode, setMode] = useState<"loading" | "demo" | "configured" | "error">("loading");
  const [draftToken, setDraftToken] = useState("");
  const [token, setToken] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/mode", { signal: controller.signal })
      .then((r) => { if (!r.ok) throw new Error("Unable to check demo mode"); return r.json(); })
      .then((data: { demo?: boolean }) => setMode(data.demo ? "demo" : "configured"))
      .catch(() => { if (!controller.signal.aborted) setMode("error"); });
    return () => controller.abort();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" data-testid="firm-dashboard">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 mb-1">
            Firm view
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Submitted intakes
          </h1>
          <p className="text-slate-600 mt-2 text-sm leading-relaxed max-w-xl">
            Every intake clients have submitted, most time-sensitive first. Open one to review the
            matter summary, the conflict-check parties, and what the client was told happens next.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="firm-close"
          className="text-xs text-slate-500 hover:text-slate-900 underline shrink-0 mt-1"
        >
          Close
        </button>
      </header>

      {mode === "loading" && <p>Checking demo mode…</p>}
      {mode === "error" && <ErrorBox message="Unable to check the server mode. Close and reopen the firm view to retry." />}
      {mode === "demo" && <Card><p>This is a public demo. Submissions are not stored, so there are no intakes to show.</p></Card>}
      {mode === "configured" && !token && (
        <Card>
          <form onSubmit={(event) => { event.preventDefault(); setToken(draftToken.trim()); setDraftToken(""); }}>
            <label htmlFor="firm-token" className="block text-sm font-semibold mb-2">Admin token</label>
            <p className="text-sm text-slate-600 mb-3">Enter the token configured for this Val. It stays in this view's memory and is cleared when you close it.</p>
            <input id="firm-token" type="password" autoComplete="off" className="w-full border border-slate-300 px-3 py-2 mb-4" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} />
            <PrimaryButton type="submit" disabled={!draftToken.trim()}>Open intakes</PrimaryButton>
          </form>
        </Card>
      )}
      {mode === "configured" && token && <>
        <div className="mb-4"><GhostButton onClick={() => { setToken(""); setView({ kind: "list" }); }}>Lock firm view</GhostButton></div>
        {view.kind === "list" && <FirmList token={token} onOpen={(id) => setView({ kind: "detail", id })} />}
        {view.kind === "detail" && <FirmDetail id={view.id} token={token} onBack={() => setView({ kind: "list" })} />}
      </>}
    </div>
  );
}

// ---------- List ----------

function FirmList({ onOpen, token }: { onOpen: (id: number) => void; token: string }) {
  const [rows, setRows] = useState<IntakeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [area, setArea] = useState("all");
  const [urgency, setUrgency] = useState("all");

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    fetchIntakes(token)
      .then((r) => live && setRows(r))
      .catch((e) => live && setError((e instanceof Error ? e.message : String(e))));
    return () => {
      live = false;
    };
  }, [token]);

  // Filter first, then surface escalating intakes to the top.
  const visible = useMemo(() => {
    if (!rows) return null;
    const filter: IntakeFilter = { area, urgency };
    return sortIntakesByUrgency(filterIntakes(rows, filter));
  }, [rows, area, urgency]);

  const escalating = rows ? escalatingCount(rows) : 0;

  return (
    <div className="space-y-4" data-testid="firm-list">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-600" data-testid="firm-count">
          {error ? "Unable to load intakes" : visible
            ? `${visible.length} intake${visible.length === 1 ? "" : "s"}${
              escalating > 0 ? ` · ${escalating} need${escalating === 1 ? "s" : ""} attention` : ""
            }`
            : "Loading…"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter by matter area"
            data-testid="firm-filter-area"
            value={area}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setArea(e.target.value)}
            className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white text-slate-700"
          >
            <option value="all">All matters</option>
            {MATTER_AREAS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select
            aria-label="Filter by urgency"
            data-testid="firm-filter-urgency"
            value={urgency}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setUrgency(e.target.value)}
            className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white text-slate-700"
          >
            <option value="all">All urgency</option>
            <option value="escalating">⚠ Needs attention</option>
            {URGENCY_OPTIONS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      {visible && visible.length === 0 && !error && (
        <Card className="text-center py-10">
          <p className="text-sm text-slate-500" data-testid="firm-empty">
            {rows && rows.length > 0
              ? "No intakes match this filter."
              : "No intakes submitted yet. Client submissions will show up here."}
          </p>
        </Card>
      )}

      {visible?.map((p) => {
        const escalate = isEscalatingUrgency(p.urgency_level as Urgency);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onOpen(p.id)}
            data-testid="firm-row"
            data-id={p.id}
            data-urgency={p.urgency_level}
            data-escalating={escalate ? "true" : "false"}
            className="w-full text-left"
          >
            <Card
              className={"hover:border-slate-400 transition " +
                (escalate ? "border-l-4 border-l-rose-400" : "")}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900 text-base">
                      {p.contact_name || "(no name)"}
                    </h3>
                    <UrgencyChip level={p.urgency_level} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{intakeMetaLine(p)}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{p.reference}</p>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">{formatDate(p.created_at)}</span>
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Detail (read-only) ----------

function FirmDetail({ id, onBack, token }: { id: number; onBack: () => void; token: string }) {
  const [row, setRow] = useState<IntakeRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRow(null);
    setError(null);
    fetchIntake(id, token)
      .then((r) => live && setRow(r))
      .catch((e) => live && setError((e instanceof Error ? e.message : String(e))));
    return () => {
      live = false;
    };
  }, [id, token]);

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorBox message={error} />
        <GhostButton onClick={onBack} testid="firm-back">Back to list</GhostButton>
      </div>
    );
  }
  if (!row) {
    return (
      <Card className="text-center py-10">
        <p className="text-sm text-slate-500">Loading intake…</p>
      </Card>
    );
  }

  const record = row.payload;
  const parties = Array.isArray(record.conflict_parties) ? record.conflict_parties : [];
  const nextSteps = Array.isArray(record.next_steps) ? record.next_steps : [];
  const answerKeys = Object.keys(record.answers ?? {}).filter((k) =>
    (record.answers[k] ?? "").trim()
  );
  const narrativeDiscarded = (record.narrative ?? "").trim() === "";

  return (
    <div className="space-y-4" data-testid="firm-detail">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-2xl font-semibold text-slate-900">
                {record.contact_name || "(no name)"}
              </h2>
              <UrgencyChip level={record.urgency.level} />
            </div>
            <p className="text-xs text-slate-500">
              {matterAreaLabel(record.matter_area)}
              {record.jurisdiction ? ` · ${record.jurisdiction}` : ""} · {record.persona}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono" data-testid="firm-detail-reference">
              {record.reference}
            </p>
          </div>
          <GhostButton onClick={onBack} testid="firm-back">Back to list</GhostButton>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <GhostButton onClick={() => downloadMarkdown(record)} testid="firm-export">
            Export summary (.md)
          </GhostButton>
          <GhostButton onClick={() => globalThis.print()} testid="firm-print">
            Print
          </GhostButton>
        </div>
      </Card>

      {/* Attorney-escalation cue for time-sensitive matters. */}
      <UrgencyBanner flag={record.urgency} />

      {/* Firm-facing summary */}
      <Card>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Summary</h3>
        <p className="text-sm text-slate-800 leading-relaxed" data-testid="firm-detail-summary">
          {record.summary || <span className="text-slate-400">No summary.</span>}
        </p>
      </Card>

      {/* Conflict parties — prominent, load-bearing for the conflict check */}
      <Card className="border-slate-300">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Conflict-check parties
        </h3>
        <div data-testid="conflict-parties">
          {parties.length === 0
            ? <p className="text-sm text-slate-500">No parties captured.</p>
            : (
              <ul className="space-y-1.5">
                {parties.map((p, i) => (
                  <li
                    key={`${p.name}-${i}`}
                    className="flex items-center gap-2 text-sm"
                    data-testid="conflict-party"
                  >
                    <span className="font-medium text-slate-900">{p.name}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded border ${
                        ROLE_CLS[p.role] ?? ROLE_CLS.other
                      }`}
                    >
                      {ROLE_LABEL[p.role] ?? p.role}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </Card>

      {/* What the client was told happens next */}
      {nextSteps.length > 0 && (
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            What happens next
          </h3>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700" data-testid="next-steps">
            {nextSteps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </Card>
      )}

      {/* Confirmed answers */}
      {answerKeys.length > 0 && (
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Details the client confirmed
          </h3>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {answerKeys.map((k) => (
              <div key={k}>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {answerLabel(k)}
                </dt>
                <dd className="text-sm text-slate-800 break-words">{record.answers[k]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {/* Contact info */}
      <Card>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Contact
        </h3>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2" data-testid="firm-contact">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Name</dt>
            <dd className="text-sm text-slate-800">{record.contact_name || "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              How to reach
            </dt>
            <dd className="text-sm text-slate-800">
              {[record.contact_method, record.contact_detail].filter(Boolean).join(" · ") || "—"}
            </dd>
          </div>
        </dl>
      </Card>

      {/* The client's own words, or a note that they opted out */}
      <Card>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
          In the client's words
        </h3>
        {narrativeDiscarded
          ? (
            <p className="text-sm text-slate-500 italic" data-testid="firm-narrative-discarded">
              The client opted to discard the free-text description.
            </p>
          )
          : (
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
              {record.narrative}
            </p>
          )}
      </Card>
    </div>
  );
}

export { FirmDashboard };
