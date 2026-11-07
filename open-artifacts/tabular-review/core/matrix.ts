/**
 * tabular-review core — deterministic documents × questions review matrix.
 * NO LLM: the core VERIFIES extraction, it never answers.
 *
 * Contract (catalog §2.1): one row per document, one column per question,
 * every answered cell source-anchored. A cell is `answered` ONLY when the
 * supplied answer carries a quote that locates in the document (exact or
 * normalized; fuzzy anchors the answer but is flagged for review). Anything
 * else is `unverified` with a machine reason — never guessed:
 *   not_answered | missing_quote | quote_not_verified | no_such_document
 *
 * Exports: RFC-4180 CSV and Markdown, with anchors preserved in the export.
 */

import { bestWindow, rawContains } from './textutil';

export interface ReviewDoc {
  id: string;
  name: string;
  text: string;
}
export interface Question {
  id: string;
  question: string;
}
export interface CellInput {
  documentId: string;
  questionId: string;
  /** the extracted answer; null/omitted => unverified */
  answer?: string | null;
  /** verbatim supporting quote from the document */
  quote?: string;
  pinpoint?: string;
}
export interface MatrixInput {
  documents: ReviewDoc[];
  questions: Question[];
  cells: CellInput[];
  fuzzyThreshold?: number;
}

export type UnverifiedReason = 'not_answered' | 'missing_quote' | 'quote_not_verified' | 'no_such_document';
export interface CellVerification {
  classification: 'exact' | 'normalized' | 'fuzzy';
  similarity: number;
  charStart: number;
  charEnd: number;
  verbatim: string;
  pinpoint: string | null;
}
export interface Cell {
  documentId: string;
  questionId: string;
  status: 'answered' | 'unverified';
  answer: string | null;
  unverifiedReason: UnverifiedReason | null;
  verification: CellVerification | null;
}
export interface MatrixOutput {
  summary: { cells: number; answered: number; unverified: number; flaggedForReview: number };
  cells: Cell[];
}

function verifyQuote(doc: ReviewDoc, cell: CellInput, fuzzyThreshold: number): CellVerification | null {
  if (!cell.quote) return null;
  const win = bestWindow(doc.text, cell.quote);
  const exact = rawContains(doc.text, cell.quote);
  if (exact) {
    const start = doc.text.indexOf(cell.quote.trim());
    return {
      classification: 'exact',
      similarity: 1,
      charStart: start,
      charEnd: start + cell.quote.trim().length,
      verbatim: doc.text.slice(start, start + cell.quote.trim().length),
      pinpoint: cell.pinpoint ?? null,
    };
  }
  if (win && win.score >= 0.95 && win.coverage >= 0.95) {
    return { classification: 'normalized', similarity: win.score, charStart: win.start, charEnd: win.end, verbatim: win.verbatim, pinpoint: cell.pinpoint ?? null };
  }
  if (win && win.score >= fuzzyThreshold && win.coverage >= 0.6) {
    return { classification: 'fuzzy', similarity: win.score, charStart: win.start, charEnd: win.end, verbatim: win.verbatim, pinpoint: cell.pinpoint ?? null };
  }
  return null; // quote does not locate in the document
}

export function buildMatrix(input: MatrixInput): MatrixOutput {
  const fuzzyThreshold = input.fuzzyThreshold ?? 0.7;
  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const questions = new Map(input.questions.map((q) => [q.id, q]));
  const supplied = new Map(input.cells.map((c) => [`${c.documentId}::${c.questionId}`, c]));

  const cells: Cell[] = [];
  for (const doc of input.documents) {
    for (const q of input.questions) {
      if (!questions.has(q.id)) continue;
      const c = supplied.get(`${doc.id}::${q.id}`);
      if (!c || c.answer === undefined || c.answer === null || c.answer.trim() === '') {
        cells.push({ documentId: doc.id, questionId: q.id, status: 'unverified', answer: null, unverifiedReason: 'not_answered', verification: null });
        continue;
      }
      const docObj = docs.get(c.documentId);
      if (!docObj) {
        cells.push({ documentId: c.documentId, questionId: q.id, status: 'unverified', answer: null, unverifiedReason: 'no_such_document', verification: null });
        continue;
      }
      if (!c.quote || c.quote.trim() === '') {
        cells.push({ documentId: doc.id, questionId: q.id, status: 'unverified', answer: null, unverifiedReason: 'missing_quote', verification: null });
        continue;
      }
      const verification = verifyQuote(docObj, c, fuzzyThreshold);
      if (!verification) {
        cells.push({ documentId: doc.id, questionId: q.id, status: 'unverified', answer: null, unverifiedReason: 'quote_not_verified', verification: null });
        continue;
      }
      cells.push({ documentId: doc.id, questionId: q.id, status: 'answered', answer: c.answer, unverifiedReason: null, verification });
    }
  }

  return {
    summary: {
      cells: cells.length,
      answered: cells.filter((c) => c.status === 'answered').length,
      unverified: cells.filter((c) => c.status === 'unverified').length,
      flaggedForReview: cells.filter((c) => c.verification?.classification === 'fuzzy').length,
    },
    cells,
  };
}

/** RFC-4180: quote fields containing commas, quotes, or newlines. */
export function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCSV(input: MatrixInput, out: MatrixOutput): string {
  const lines: string[] = [];
  lines.push(csvEscape('Document') + ',' + input.questions.map((q) => csvEscape(q.question)).join(','));
  for (const doc of input.documents) {
    const row = [csvEscape(doc.name)];
    for (const q of input.questions) {
      const cell = out.cells.find((c) => c.documentId === doc.id && c.questionId === q.id);
      if (!cell || cell.status === 'unverified') {
        row.push(csvEscape(`UNVERIFIED (${cell?.unverifiedReason ?? 'not_answered'})`));
      } else {
        const pin = cell.verification?.pinpoint ? ` [${cell.verification.pinpoint}]` : '';
        const flag = cell.verification?.classification === 'fuzzy' ? ' [quote fuzzy — review]' : '';
        row.push(csvEscape(`${cell.answer}${pin}${flag}`));
      }
    }
    lines.push(row.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function toMarkdown(input: MatrixInput, out: MatrixOutput): string {
  const esc = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  const lines: string[] = [];
  lines.push(`| Document | ${input.questions.map((q) => esc(q.question)).join(' | ')} |`);
  lines.push(`|---|${input.questions.map(() => '---').join('|')}|`);
  for (const doc of input.documents) {
    const row = [esc(doc.name)];
    for (const q of input.questions) {
      const cell = out.cells.find((c) => c.documentId === doc.id && c.questionId === q.id);
      if (!cell || cell.status === 'unverified') {
        row.push(`**UNVERIFIED** (${cell?.unverifiedReason ?? 'not_answered'})`);
      } else {
        const pin = cell.verification?.pinpoint ? ` [${cell.verification.pinpoint}]` : '';
        const flag = cell.verification?.classification === 'fuzzy' ? ' ⚠ quote fuzzy — review' : '';
        row.push(esc(cell.answer!) + esc(pin) + flag);
      }
    }
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines.join('\n') + '\n';
}
