// tabular-review deterministic core.
// Documents × questions table. A cell is the quoted document text when the
// answer is present, and explicitly "unverified" otherwise — never guessed.

export interface ReviewQuestion {
  id: string;
  label: string;
  field: string; // key looked up in each document's extracts
}

export interface ReviewDoc {
  name: string;
  extracts: Record<string, string>; // field -> quoted document text
}

export type Cell = { status: "verified"; quote: string } | { status: "unverified" };

export interface ReviewTable {
  questions: ReviewQuestion[];
  docs: ReviewDoc[];
  cells: Cell[][]; // [docIndex][questionIndex]
}

export function buildTable(docs: ReviewDoc[], questions: ReviewQuestion[]): ReviewTable {
  const cells = docs.map((d) =>
    questions.map((q) => {
      const v = d.extracts[q.field];
      return v && v.trim().length > 0
        ? ({ status: "verified", quote: v.trim() } as Cell)
        : ({ status: "unverified" } as Cell);
    }),
  );
  return { questions, docs, cells };
}

export function toCSV(table: ReviewTable): string {
  const esc = (s: string): string => `"${s.replace(/"/g, '""')}"`;
  const header = ["Document", ...table.questions.map((q) => esc(q.label))].join(",");
  const rows = table.docs.map((d, i) =>
    [
      esc(d.name),
      ...table.cells[i].map((c) =>
        c.status === "verified" ? esc(c.quote) : esc("UNVERIFIED — not found in document"),
      ),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const sampleDocs: ReviewDoc[] = [
  {
    name: "NDA — Acme Corp (2026-03-01)",
    extracts: {
      term: '"This Agreement shall commence on March 1, 2026 and continue for two (2) years."',
      governing_law: '"This Agreement shall be governed by the laws of the State of New York."',
      non_compete: "", // not addressed in this document
    },
  },
  {
    name: "MSA — Globex Ltd (2026-04-18)",
    extracts: {
      term: '"The term of this Agreement is thirty-six (36) months from the Effective Date."',
      governing_law: '"Governed by the laws of England and Wales."',
      non_compete: "",
    },
  },
  {
    name: "Employment Agmt — J. Doe (2026-01-05)",
    extracts: {
      term: "",
      governing_law: '"California law applies to this Agreement."',
      non_compete:
        '"Employee shall not engage in any competing business for twelve (12) months following termination."',
    },
  },
];

export const sampleQuestions: ReviewQuestion[] = [
  { id: "q1", label: "Term / duration", field: "term" },
  { id: "q2", label: "Governing law", field: "governing_law" },
  { id: "q3", label: "Non-compete", field: "non_compete" },
];
