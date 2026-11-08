import { el } from "../router.js";
import { demoHeader } from "./header.js";
import { citeCheck, type MatchKind } from "../lib/citecheck.js";

const SOURCE = `In the matter of Jones v. Acme Corp., the court held that "an employer who
fails to maintain accurate payroll records for three consecutive quarters may be
deemed to have acted with gross negligence." The panel further noted that
statutory damages remain available regardless of intent. 124 F.4th 221, 228 (2026).`;

const KIND_LABEL: Record<MatchKind, { label: string; cls: string; note: string }> = {
  exact: { label: "exact", cls: "ok", note: "Verbatim match — cite checks out." },
  normalized: {
    label: "normalized",
    cls: "warn",
    note: "Matches only after normalization — check formatting before filing.",
  },
  fuzzy: {
    label: "fuzzy",
    cls: "warn",
    note: "Close but not identical — likely altered; attorney review required.",
  },
  not_found: {
    label: "not_found",
    cls: "bad",
    note: "Source does not contain this quote — unsupported citation.",
  },
};

export function citeCheckPage(): HTMLElement {
  const root = demoHeader({
    title: "Cite check",
    lede:
      "Paste a quote and its source text. Matching is deterministic code — exact, normalized, fuzzy, or not_found — never an LLM guess. The LLM (in the full artifact) is only asked whether a source supports a proposition.",
    counterpart: "Cite check — checks every footnote against your files.",
    better:
      "Non-LLM diff core with normalization (whitespace, curly quotes, dashes, case) and a similarity score per flag; unverified is a first-class result, never a guess.",
    repoName: "cite-check",
  });

  // The standalone demo is the real artifact (worked example, 10 quotes);
  // this in-app page is only a taste of the core — lead with the link, keep
  // the quick demo below, clearly labeled (round-7: dual-shells cleanup).
  const fullTool = el(`<a class="fulltool-card" href="open-artifacts/cite-check/demo/index.html" rel="noopener" target="_blank">
    <span class="fulltool-title">Open the full tool \u2197</span>
    <span class="fulltool-sub">The standalone cite-check demo — a fictional appellant's brief with 10 quotes checked against the record, on its own page.</span>
  </a>`);
  root.appendChild(fullTool);

  const demo = el(`<section class="demo">
    <h2>Quick preview (mock data, computed in your browser)</h2>
    <p class="demo-sub">Try: (1) the pre-filled quote \u2192 exact; (2) change "three" to "3" and curly quotes to straight \u2192 normalized; (3) alter a few words \u2192 fuzzy; (4) replace with text not in the source \u2192 not_found.</p>
    <label for="cc-quote">Quote (from the legal document)</label>
    <textarea id="cc-quote" rows="3">"an employer who fails to maintain accurate payroll records for three consecutive quarters may be deemed to have acted with gross negligence."</textarea>
    <label for="cc-source">Source text</label>
    <textarea id="cc-source" rows="8"></textarea>
    <div class="actions"><button id="cc-run">Check quote</button></div>
    <div class="result" id="cc-result"></div>
  </section>`);

  (demo.querySelector("#cc-source") as HTMLTextAreaElement).value = SOURCE;

  const result = demo.querySelector("#cc-result")!;
  const run = () => {
    const quote = (demo.querySelector("#cc-quote") as HTMLTextAreaElement).value;
    const source = (demo.querySelector("#cc-source") as HTMLTextAreaElement).value;
    const r = citeCheck(quote, source);
    const k = KIND_LABEL[r.kind];
    result.innerHTML = "";
    result.appendChild(
      el(`<div>
        <p><span class="pill ${k.cls}">${k.label}</span>
        ${r.similarity !== undefined ? `<span class="pill muted">similarity ${(r.similarity * 100).toFixed(0)}%</span>` : ""}</p>
        <p>${k.note} ${r.detail}</p>
        ${r.matchedText ? `<p class="demo-sub">Closest source span:</p><pre></pre>` : ""}
      </div>`),
    );
    const pre = result.querySelector("pre");
    if (pre && r.matchedText) pre.textContent = r.matchedText;
  };

  demo.querySelector("#cc-run")!.addEventListener("click", run);
  run();
  root.appendChild(demo);
  return root;
}
