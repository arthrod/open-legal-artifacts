import { el } from "../router.js";
import { demoHeader } from "./header.js";
import { buildChronology, sampleFacts } from "../lib/chronology.js";

export function chronologyPage(): HTMLElement {
  const root = demoHeader({
    title: "Fact chronology",
    lede:
      "Paste facts as JSON; the timeline renders sorted by date, each entry locked to its source. Where two documents disagree on the same topic, the conflict is flagged deterministically — impeachment work, surfaced.",
    counterpart: "Fact chronology — timeline from your documents, flags conflicts.",
    better:
      "Per-fact evidence graph (entry ↔ source span), conflict flags computed by code from topic + value disagreement, and lockable entries once an attorney verifies them.",
    repoName: "fact-chronology",
  });

  const demo = el(`<section class="demo">
    <h2>Interactive demo (mock data, computed in your browser)</h2>
    <p class="demo-sub">The sample has three sources disagreeing on <code>employment-status</code> (employed / resigned / terminated) — all three entries get conflict flags. Edit the JSON and re-render.</p>
    <label for="fc-facts">Facts (JSON array)</label>
    <textarea id="fc-facts" rows="14"></textarea>
    <div class="actions"><button id="fc-run">Build chronology →</button></div>
    <div class="result" id="fc-result"></div>
  </section>`);

  (demo.querySelector("#fc-facts") as HTMLTextAreaElement).value = JSON.stringify(
    sampleFacts,
    null,
    2,
  );

  const result = demo.querySelector("#fc-result")!;

  const run = () => {
    const text = (demo.querySelector("#fc-facts") as HTMLTextAreaElement).value;
    let facts;
    try {
      const parsed: unknown = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("expected a JSON array of entries");
      facts = parsed as Parameters<typeof buildChronology>[0];
    } catch (e) {
      result.innerHTML = "";
      result.appendChild(
        el(`<p><span class="pill bad">error</span> Facts JSON is invalid: ${(e as Error).message}</p>`),
      );
      return;
    }
    const { timeline, conflicts } = buildChronology(facts);
    result.innerHTML = "";
    result.appendChild(
      el(`<p>${conflicts > 0 ? `<span class="pill bad">${conflicts} conflicted ${conflicts === 1 ? "entry" : "entries"}</span>` : '<span class="pill ok">no conflicts</span>'} <span class="pill muted">${timeline.length} entries</span></p>
      <ul class="timeline">${timeline
        .map(
          (t) => `<li class="${t.conflictWith.length > 0 ? "conflict" : ""}">
            <div class="date">${escapeHtml(t.date)}${t.topic ? ` · ${escapeHtml(t.topic)}` : ""}${t.value ? ` = ${escapeHtml(t.value)}` : ""}</div>
            <p class="fact">${escapeHtml(t.fact)}</p>
            <div class="src">Source: ${escapeHtml(t.source)}${
              t.conflictWith.length > 0
                ? ` — <strong>conflicts with:</strong> ${t.conflictWith.map(escapeHtml).join("; ")}`
                : ""
            }</div>
          </li>`,
        )
        .join("")}</ul>`),
    );
  };

  demo.querySelector("#fc-run")!.addEventListener("click", run);
  run();
  root.appendChild(demo);
  return root;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
