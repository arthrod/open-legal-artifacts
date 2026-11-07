/** @jsxImportSource https://esm.sh/react@18.2.0 */
import React, { useState } from "https://esm.sh/react@18.2.0?deps=react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client?deps=react@18.2.0,react-dom@18.2.0";
import {
  buildRecord,
  callElicit,
  callFinalize,
  type ClientSession,
  loadSession,
  persist,
  resetSession,
} from "./session.ts";
import { Card, ErrorBox, GhostButton, PrimaryButton, Stepper } from "./ui.tsx";
import { StartStep } from "./steps_start.tsx";
import { ElicitingStep, ElicitStep } from "./steps_elicit.tsx";
import { FinalizingStep, ReviewStep } from "./steps_review.tsx";
import { SavedStep } from "./steps_saved.tsx";
import { FirmDashboard } from "./firm.tsx";
import type { IntakeBrief, Stage } from "../shared/types.ts";

function App() {
  const [session, setSession] = useState<ClientSession>(() => loadSession());
  // The firm dashboard is a read-only overlay, deliberately kept out of the
  // persisted client `stage` so it never disturbs the linear intake flow.
  const [firmView, setFirmView] = useState(false);

  function update(patch: Partial<ClientSession>) {
    setSession((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }

  function go(stage: Stage) {
    update({ stage, error_message: null });
  }

  function onReset() {
    setSession(resetSession());
  }

  // start → eliciting → elicit
  async function runElicit(patch: Partial<IntakeBrief>) {
    const brief = { ...session.brief, ...patch };
    update({ brief, stage: "eliciting", error_message: null, elicitation: null, answers: {} });
    try {
      const elicitation = await callElicit(brief);
      const answers: Record<string, string> = {};
      for (const f of elicitation.fields) answers[f.id] = f.recommended || "";
      update({ stage: "elicit", elicitation, answers });
    } catch (e: unknown) {
      update({ stage: "error", error_message: (e instanceof Error ? e.message : String(e)) });
    }
  }

  // elicit → finalizing → review
  async function runFinalize(answers: Record<string, string>) {
    update({ answers, stage: "finalizing", error_message: null });
    try {
      const finalize = await callFinalize(session.brief, answers);
      update({ stage: "review", finalize });
    } catch (e: unknown) {
      update({ stage: "error", error_message: (e instanceof Error ? e.message : String(e)) });
    }
  }

  const stage = session.stage;
  const heading = stage === "start" ? "Let's start with the facts."
    : stage === "eliciting" || stage === "elicit" ? "Review the guided questions."
    : stage === "finalizing" || stage === "review" ? "Review your intake."
    : stage === "saved" ? "Your intake is complete."
    : "Return to your intake.";

  if (firmView) {
    return <FirmDashboard onClose={() => setFirmView(false)} />;
  }

  return (
    <div className="intake-shell">
      <header className="site-header">
        <div className="site-nav wrap">
          <a className="wordmark" href="https://arthur.law/">ARTHUR<span>.</span>SOUZA<span>.</span>RODRIGUES <span>/</span> CLIENT INTAKE</a>
          <nav aria-label="Site navigation" className="site-links">
            <a href="#intake">Intake</a>
            <a href="/lab">Elicitation lab</a>
            <a href="https://github.com/jandira-tech/intake-demo">View source ↗</a>
          </nav>
        </div>
      </header>
      <section className="hero wrap">
        <p className="eyebrow">/ Guided intake <span>·</span> Structured elicitation <span>·</span> Human review</p>
        <h1>Tell us about your <mark>legal matter.</mark></h1>
        <p className="hero-copy">A few guided questions help the firm understand your situation. Review the suggested answers and change anything before you submit.</p>
        <p className="process-line"><span>Your matter</span><b>→</b><span>Guided questions</span><b>→</b><span>Review</span><b>→</b><span>Submit</span></p>
      </section>
      <main id="intake" className="wrap intake-main">
        <div className="work-heading">
          <div><span className="section-label"><i /> / Client intake</span><h2>{heading}</h2></div>
          <div className="work-actions">
            {stage !== "start" && stage !== "saved" && (
              <button type="button" data-testid="start-over" onClick={onReset}>Start over</button>
            )}
            <button type="button" data-testid="firm-open" onClick={() => setFirmView(true)}>Firm view</button>
          </div>
        </div>
      {stage !== "error" && <Stepper stage={stage} />}

      {stage === "start" && <StartStep brief={session.brief} onStart={runElicit} />}

      {stage === "eliciting" && <ElicitingStep persona={session.brief.persona} />}

      {stage === "elicit" && session.elicitation && (
        <ElicitStep
          brief={session.brief}
          elicitation={session.elicitation}
          initialAnswers={session.answers}
          onBack={() => go("start")}
          onReview={runFinalize}
        />
      )}

      {stage === "finalizing" && <FinalizingStep persona={session.brief.persona} />}

      {stage === "review" && (
        <ReviewStep
          session={session}
          onChange={update}
          onBack={() => go("elicit")}
          onSaved={(res) =>
            update({ stage: "saved", saved_id: res.intake_id, saved_reference: res.reference })}
        />
      )}

      {stage === "saved" && session.finalize && (
        <SavedStep
          record={{ ...buildRecord(session), reference: session.saved_reference ?? "" }}
          reference={session.saved_reference ?? ""}
          onAgain={onReset}
        />
      )}

      {stage === "error" && (
        <Card>
          <h2 className="text-xl font-semibold text-rose-800 mb-2">Something went wrong</h2>
          <ErrorBox message={session.error_message ?? "Unknown error"} />
          <div className="mt-6 flex gap-3">
            <GhostButton onClick={() => go("start")}>Back to start</GhostButton>
            <PrimaryButton
              onClick={() => {
                if (session.elicitation && Object.keys(session.answers).length) {
                  void runFinalize(session.answers);
                } else {
                  void runElicit({});
                }
              }}
            >
              Retry
            </PrimaryButton>
          </div>
        </Card>
      )}

        <p className="intake-disclaimer">
          This tool helps gather information; it is not legal advice and does not create an
          attorney–client relationship until the firm accepts your matter.
        </p>
      </main>
      <footer className="site-footer"><div className="wrap"><span>CLIENT INTAKE / A GUIDED DEMONSTRATION</span><a href="https://github.com/jandira-tech/intake-demo">View source ↗</a></div></footer>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
