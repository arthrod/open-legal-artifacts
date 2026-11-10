import { el } from "../router.js";
import { demoHeader } from "./header.js";
import { classifyClause, samplePlaybook } from "../lib/deviation.js";

const CLAUSES = `10.1 Limitation of Liability. In no event shall Provider's aggregate liability exceed twice the fees paid by Customer in the twelve months preceding the claim.
10.2 Consequential Damages. Provider shall be liable for consequential damages howsoever arising, including lost profits.
11.1 Governing Law. This Agreement shall be governed by the laws of England and Wales.
12.1 Assignment. Customer may assign this Agreement to any successor in interest.`;

const PILLS: Record<string, string> = {
  standard: "ok",
  fallback: "warn",
  deviation: "bad",
};

export function deviationBoardPage(): HTMLElement {
  const root = demoHeader({
    title: "Playbook deviation board",
    lede:
      "Paste contract clauses and the playbook JSON. Each clause is classified standard / fallback / deviation against a versioned playbook, quoting both the clause and the matched rule. Fail-closed: unmapped topics escalate instead of guessing.",
    counterpart: "Playbook deviation board — flags each clause that differs and routes to the approver.",
    better:
      "The playbook is versioned structured data you own; classification is tri-state with the matched playbook phrase quoted; 'different' is never silently treated as 'unacceptable'.",
    repoName: "playbook-deviation-board",
  });

  const demo = el(`<section class="demo">
    <h2>Interactive demo (mock data, computed in your browser)</h2>
    <p class="demo-sub">Four clauses hit four paths: fallback (10.1), deviation-by-avoid-term (10.2), unmapped-topic escalation (11.1/12.1 under this toy playbook). Edit either side and re-run.</p>
    <label for="db-clauses">Contract clauses</label>
    <textarea id="db-clauses" rows="8"></textarea>
    <label for="db-playbook">Playbook (JSON)</label>
    <textarea id="db-playbook" rows="10"></textarea>
    <div class="actions"><button id="db-run">Classify clauses →</button></div>
    <div class="result" id="db-result"></div>
  </section>`);

  (demo.querySelector("#db-clauses") as HTMLTextAreaElement).value = CLAUSES;
  (demo.querySelector("#db-playbook") as HTMLTextAreaElement).value = JSON.stringify(
    samplePlaybook,
    null,
    2,
  );

  const result = demo.querySelector("#db-result")!;

  const run = () => {
    const clausesText = (demo.querySelector("#db-clauses") as HTMLTextAreaElement).value;
    const playbookText = (demo.querySelector("#db-playbook") as HTMLTextAreaElement).value;
    let playbook;
    try {
      playbook = JSON.parse(playbookText);
    } catch (e) {
      result.innerHTML = "";
      result.appendChild(
        el(`<p><span class="pill bad">error</span> Playbook JSON is invalid: ${(e as Error).message}</p>`),
      );
      return;
    }
    const clauses = clausesText
      .split(/\n(?=\d+\.\d+\.)/)
      .map((c) => c.trim())
      .filter(Boolean);
    const findings = clauses.map((c) => classifyClause(playbook, c));
    result.innerHTML = "";
    result.appendChild(
      el(`<div class="table-wrap"><table>
        <thead><tr><th>Clause</th><th>Rule / topic</th><th>Classification</th><th>Matched</th><th>Reason</th></tr></thead>
        <tbody>${findings
          .map(
            (f) => `<tr>
              <td><code>${escapeHtml(f.clauseQuote.slice(0, 80))}…</code></td>
              <td>${f.ruleId} · ${f.topic}</td>
              <td><span class="pill ${PILLS[f.classification]}">${f.classification}</span></td>
              <td>${escapeHtml(f.matched)}</td>
              <td>${escapeHtml(f.reason)}</td>
            </tr>`,
          )
          .join("")}</tbody>
      </table></div>`),
    );
  };

  demo.querySelector("#db-run")!.addEventListener("click", run);
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
