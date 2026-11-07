/** @jsxImportSource https://esm.sh/react@18.2.0 */
import React, { useEffect, useState } from "https://esm.sh/react@18.2.0?deps=react@18.2.0";
import { MATTER_AREAS, PERSONA_OPTIONS } from "../shared/catalog.ts";
import { Card, ErrorBox, HelpInline, PrimaryButton } from "./ui.tsx";
import type { IntakeBrief, MatterArea, Persona } from "../shared/types.ts";

/** Minimum narrative length before elicitation is worthwhile. */
export const MIN_NARRATIVE_CHARS = 20;

function StartStep({
  brief,
  onStart,
}: {
  brief: IntakeBrief;
  /** Persona + area + narrative + name → begin elicitation. */
  onStart: (patch: Partial<IntakeBrief>) => void;
}) {
  const [persona, setPersona] = useState<Persona>(brief.persona);
  const [area, setArea] = useState<MatterArea | null>(
    brief.matter_area === "other" && !brief.narrative ? null : brief.matter_area,
  );
  const [name, setName] = useState(brief.contact_name ?? "");
  const [narrative, setNarrative] = useState(brief.narrative ?? "");
  const [err, setErr] = useState<string | null>(null);
  // Public demo (no ADMIN_TOKEN on the server): say plainly that nothing is stored.
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    fetch("/api/mode")
      .then((r) => (r.ok ? r.json() : { demo: false }))
      .then((m: { demo?: boolean }) => setDemo(m.demo === true))
      .catch(() => {});
  }, []);

  const client = persona === "client";

  function submit() {
    if (!area) {
      setErr("Pick the kind of matter so we can ask the right questions.");
      return;
    }
    if (narrative.trim().length < MIN_NARRATIVE_CHARS) {
      setErr(
        client
          ? "Tell us a little more — a sentence or two about what's going on."
          : "Add a sentence or two of matter detail before eliciting.",
      );
      return;
    }
    setErr(null);
    onStart({ persona, matter_area: area, contact_name: name.trim(), narrative: narrative.trim() });
  }

  return (
    <Card>
      {demo && (
        <p className="mb-5 rounded border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          Public demo. Do not enter real names or confidential facts. What you type is sent to
          OpenAI through Val Town to generate suggestions. Nothing is stored on this server.
        </p>
      )}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
        Who's filling this out?
      </h2>
      <div className="grid sm:grid-cols-2 gap-2 mb-6">
        {PERSONA_OPTIONS.map((p) => (
          <button
            key={p.id}
            type="button"
            data-testid={`persona-${p.id}`}
            aria-pressed={persona === p.id}
            onClick={() => setPersona(p.id)}
            className={"text-left rounded-lg border px-4 py-3 transition " +
              (persona === p.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 hover:border-slate-400")}
          >
            <div className="font-medium text-sm">{p.label}</div>
            <div className={"text-xs mt-0.5 " + (persona === p.id ? "text-slate-300" : "text-slate-500")}>
              {p.blurb}
            </div>
          </button>
        ))}
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
        What kind of matter?
      </h2>
      <div className="flex flex-wrap gap-2 mb-6">
        {MATTER_AREAS.map((m) => (
          <button
            key={m.id}
            type="button"
            data-testid={`area-${m.id}`}
            aria-pressed={area === m.id}
            onClick={() => setArea(m.id)}
            title={m.blurb}
            className={"rounded-full border px-3 py-1.5 text-sm transition " +
              (area === m.id
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 hover:border-slate-500")}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mb-5">
        <label htmlFor="contact-name" className="block text-sm font-medium mb-1">
          {client ? "Your name" : "Client name"}{" "}
          <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <input
          id="contact-name"
          data-testid="contact-name"
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
          placeholder={client ? "e.g. Dana Rivera" : "Name to open the file under"}
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
        />
      </div>

      <div className="mb-2">
        <label htmlFor="narrative" className="block text-sm font-medium mb-1">
          {client ? "Describe what's going on" : "Matter description"}
          <span className="text-rose-600"> *</span>
        </label>
        <p className="text-xs text-slate-500 mb-2">
          {client
            ? "In your own words — what happened, who's involved, and what you're worried about. Don't worry about legal terms."
            : "Key facts, parties, and posture. The AI will elicit structured detail next."}
        </p>
        <textarea
          id="narrative"
          data-testid="narrative"
          className="w-full border border-slate-300 focus:border-slate-500 rounded px-3 py-2 text-sm min-h-[140px]"
          placeholder={client
            ? "e.g. I was rear-ended at a red light last week and my neck still hurts. The other driver's insurer keeps calling…"
            : "e.g. Rear-end MVA, client injured, adverse carrier making early contact…"}
          value={narrative}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNarrative(e.target.value)}
        />
        <div className="text-[11px] text-slate-400 mt-1">
          {narrative.trim().length}/{MIN_NARRATIVE_CHARS} characters minimum
        </div>
      </div>

      {client && (
        <HelpInline
          brief={{ persona, matter_area: area ?? undefined }}
          label="Not sure what to write? Ask us"
        />
      )}

      {err && <ErrorBox message={err} />}

      <div className="mt-6 flex justify-end">
        <PrimaryButton onClick={submit} testid="get-guided-questions">
          Get guided questions
        </PrimaryButton>
      </div>
    </Card>
  );
}

export { StartStep };
