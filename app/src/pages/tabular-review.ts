import { el } from "../router.js";
import { demoHeader } from "./header.js";
import {
  buildTable,
  toCSV,
  downloadCSV,
  sampleDocs,
  sampleQuestions,
} from "../lib/tabular.js";

export function tabularReviewPage(): HTMLElement {
  const root = demoHeader({
    title: "Tabular review",
    lede:
      "Documents × questions. Every cell is either quoted from the document or an explicit unverified cell — never guessed. Exports to CSV with the anchors intact.",
    counterpart: "Tabular review — one row per contract, every cell linked to the exact language.",
    better:
      "Cell-level provenance that survives export (CSV keeps quotes/UNVERIFIED markers), re-runnable against new document versions, and question templates you own.",
    repoName: "tabular-review",
  });

  const demo = el(`<section class="demo">
    <h2>Interactive demo (mock data, computed in your browser)</h2>
    <p class="demo-sub">Try adding a question with <code>field</code> set to something no document has — the whole column renders unverified. Or delete a question.</p>
    <label for="tr-docs">Documents (JSON array)</label>
    <textarea id="tr-docs" rows="12"></textarea>
    <label for="tr-questions">Questions (JSON array)</label>
    <textarea id="tr-questions" rows="8"></textarea>
    <div class="actions">
      <button id="tr-run">Build table</button>
      <button id="tr-csv" class="secondary">Download CSV</button>
    </div>
    <div class="result" id="tr-result"></div>
  </section>`);

  (demo.querySelector("#tr-docs") as HTMLTextAreaElement).value = JSON.stringify(
    sampleDocs,
    null,
    2,
  );
  (demo.querySelector("#tr-questions") as HTMLTextAreaElement).value = JSON.stringify(
    sampleQuestions,
    null,
    2,
  );

  const result = demo.querySelector("#tr-result")!;
  let current: ReturnType<typeof buildTable> | null = null;

  const parse = <T,>(text: string, id: string): T[] => {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error(`${id}: expected a JSON array`);
    return parsed as T[];
  };

  const run = () => {
    let docs, questions;
    try {
      docs = parse<typeof sampleDocs[number]>(
        (demo.querySelector("#tr-docs") as HTMLTextAreaElement).value,
        "documents",
      );
      questions = parse<typeof sampleQuestions[number]>(
        (demo.querySelector("#tr-questions") as HTMLTextAreaElement).value,
        "questions",
      );
    } catch (e) {
      result.innerHTML = "";
      result.appendChild(
        el(`<p><span class="pill bad">error</span> ${(e as Error).message}</p>`),
      );
      return;
    }
    current = buildTable(docs, questions);
    const unverified = current.cells.flat().filter((c) => c.status === "unverified").length;
    result.innerHTML = "";
    result.appendChild(
      el(`<div class="table-wrap"><table>
        <thead><tr><th>Document</th>${questions
          .map((q) => `<th>${escapeHtml(q.label)}</th>`)
          .join("")}</tr></thead>
        <tbody>${current.docs
          .map((d, i) => {
            const cells = current!.cells[i]
              .map((c) =>
                c.status === "verified"
                  ? `<td>${escapeHtml(c.quote)}</td>`
                  : `<td class="unverified">unverified</td>`,
              )
              .join("");
            return `<tr><td><strong>${escapeHtml(d.name)}</strong></td>${cells}</tr>`;
          })
          .join("")}</tbody>
      </table></div>
      <p class="note">${unverified} of ${current.cells.flat().length} cells are unverified — left blank on purpose: the artifact never guesses an answer that is not in the document.</p>`),
    );
  };

  demo.querySelector("#tr-run")!.addEventListener("click", run);
  demo.querySelector("#tr-csv")!.addEventListener("click", () => {
    if (!current) run();
    if (current) downloadCSV("tabular-review.csv", toCSV(current));
  });
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
