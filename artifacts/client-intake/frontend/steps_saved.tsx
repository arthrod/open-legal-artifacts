/** @jsxImportSource https://esm.sh/react@18.2.0 */
import React from "https://esm.sh/react@18.2.0?deps=react@18.2.0";
import { Card, GhostButton, PrimaryButton } from "./ui.tsx";
import { downloadMarkdown } from "./exporters.ts";
import type { IntakeRecord } from "../shared/types.ts";

function SavedStep({
  record,
  reference,
  onAgain,
}: {
  record: IntakeRecord;
  reference: string;
  onAgain: () => void;
}) {
  const client = record.persona === "client";
  // The public demo answers with a DEMO- reference and stores nothing (backend/mode.ts).
  const demo = reference.startsWith("DEMO-");
  return (
    <Card className="text-center py-10">
      <div className="text-emerald-600 text-sm font-semibold uppercase tracking-wider mb-2">
        {demo ? "Demo finished" : "Intake submitted"}
      </div>
      <h2 className="text-lg font-semibold text-slate-700 mb-1">
        {demo ? "This was a demo." : client ? "Thank you — we've got it." : "Intake saved."}
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        {demo
          ? "Nothing was stored and the firm did not receive it. You can download the summary below."
          : client
          ? "Your matter is with the firm. Keep your reference number for any follow-up."
          : "Reference assigned. Share it with the client for follow-up."}
      </p>

      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
        Your reference number
      </div>
      <div
        data-testid="reference-number"
        className="text-3xl font-bold tracking-tight text-slate-900 mb-6"
      >
        {reference}
      </div>

      {record.next_steps.length > 0 && (
        <div className="max-w-md mx-auto text-left mb-6" data-testid="saved-next-steps">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            What happens next
          </div>
          <ol className="list-decimal list-inside space-y-1 text-sm text-slate-700">
            {record.next_steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <GhostButton onClick={() => downloadMarkdown(record)} testid="export-markdown">
          Export / print summary (.md)
        </GhostButton>
        <PrimaryButton onClick={onAgain} testid="start-new-intake">
          Start a new intake
        </PrimaryButton>
      </div>

      <p className="text-[11px] text-slate-400 mt-6 leading-relaxed max-w-md mx-auto">
        This intake gathered information only. It is not legal advice and no attorney–client
        relationship exists until the firm accepts your matter.
      </p>
    </Card>
  );
}

export { SavedStep };
