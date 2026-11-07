/**
 * tabular-review core — deterministic documents × questions review matrix.
 * NO LLM: the core VERIFIES extraction, it never answers.
 *
 * Plain-JavaScript port of core/matrix.ts (+ the shared textutil subset);
 * the TypeScript sources stay authoritative for tests. Dependency-free ES
 * module; browser + Node compatible.
 *
 * Contract (catalog §2.1): one row per document, one column per question,
 * every answered cell source-anchored. A cell is `answered` ONLY when the
 * supplied answer carries a quote that locates in the document (exact or
 * normalized; fuzzy anchors the answer but is flagged for review). Anything
 * else is `unverified` with a machine reason — never guessed:
 *   not_answered | missing_quote | quote_not_verified | no_such_document
 *
 * Exports: RFC-4180 CSV and Markdown, with anchors preserved in the export.
 * @module core
 */

/* ---------- textutil (shared subset; port of core/textutil.ts) ---------- */

/** @param {string} text */
export function tokenizeWithSpans(text) {
  const toks = [];
  const re = /[^A-Za-z0-9.]+/g;
  let last = 0;
  let m;
  const push = (start, end) => {
    let ls = start;
    let le = end;
    while (ls < le && text[ls] === ".") ls++;
    while (le > ls && text[le - 1] === ".") le--;
    if (le > ls) toks.push({ norm: text.slice(ls, le).toLowerCase(), start: ls, end: le });
  };
  while ((m = re.exec(text)) !== null) {
    push(last, m.index);
    last = m.index + m[0].length;
  }
  push(last, text.length);
  return toks;
}

/** @param {string} text @returns {string[]} */
export function tokens(text) {
  return tokenizeWithSpans(text).map((t) => t.norm);
}

function multiset(xs) {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** @param {string} source @param {string} quote @param {number} [pad] */
export function bestWindow(source, quote, pad = 6) {
  const S = tokenizeWithSpans(source);
  const q = tokens(quote);
  if (S.length === 0 || q.length === 0) return null;
  const qSet = multiset(q);
  let best = null;
  for (let size = Math.max(1, q.length - 2); size <= q.length + pad; size++) {
    for (let st = 0; st + size <= S.length; st++) {
      let inter = 0;
      const wSet = multiset(S.slice(st, st + size).map((t) => t.norm));
      for (const [tok, c] of qSet) inter += Math.min(c, wSet.get(tok) ?? 0);
      const union = q.length + size - inter;
      const score = union === 0 ? 1 : inter / union;
      const coverage = inter / q.length;
      if (best === null || score > best.score || (score === best.score && coverage > best.coverage)) {
        best = { score, coverage, start: S[st].start, end: S[st + size - 1].end, verbatim: source.slice(S[st].start, S[st + size - 1].end) };
      }
    }
  }
  return best;
}

/** @param {string} source @param {string} quote @returns {boolean} */
export function rawContains(source, quote) {
  const q = quote.trim();
  return q.length > 0 && source.includes(q);
}

/* ---------- matrix (port of core/matrix.ts) ---------- */

function verifyQuote(doc, cell, fuzzyThreshold) {
  if (!cell.quote) return null;
  const win = bestWindow(doc.text, cell.quote);
  const exact = rawContains(doc.text, cell.quote);
  if (exact) {
    const start = doc.text.indexOf(cell.quote.trim());
    return {
      classification: "exact",
      similarity: 1,
      charStart: start,
      charEnd: start + cell.quote.trim().length,
      verbatim: doc.text.slice(start, start + cell.quote.trim().length),
      pinpoint: cell.pinpoint ?? null,
    };
  }
  if (win && win.score >= 0.95 && win.coverage >= 0.95) {
    return { classification: "normalized", similarity: win.score, charStart: win.start, charEnd: win.end, verbatim: win.verbatim, pinpoint: cell.pinpoint ?? null };
  }
  if (win && win.score >= fuzzyThreshold && win.coverage >= 0.6) {
    return { classification: "fuzzy", similarity: win.score, charStart: win.start, charEnd: win.end, verbatim: win.verbatim, pinpoint: cell.pinpoint ?? null };
  }
  return null; // quote does not locate in the document
}

/**
 * Build the verification matrix: one cell per document × question.
 * @param {{ documents: any[], questions: any[], cells: any[], fuzzyThreshold?: number }} input
 * @returns {any} MatrixOutput
 */
export function buildMatrix(input) {
  const fuzzyThreshold = input.fuzzyThreshold ?? 0.7;
  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const questions = new Map(input.questions.map((q) => [q.id, q]));
  const supplied = new Map(input.cells.map((c) => [`${c.documentId}::${c.questionId}`, c]));

  const cells = [];
  for (const doc of input.documents) {
    for (const q of input.questions) {
      if (!questions.has(q.id)) continue;
      const c = supplied.get(`${doc.id}::${q.id}`);
      if (!c || c.answer === undefined || c.answer === null || c.answer.trim() === "") {
        cells.push({ documentId: doc.id, questionId: q.id, status: "unverified", answer: null, unverifiedReason: "not_answered", verification: null });
        continue;
      }
      const docObj = docs.get(c.documentId);
      if (!docObj) {
        cells.push({ documentId: c.documentId, questionId: q.id, status: "unverified", answer: null, unverifiedReason: "no_such_document", verification: null });
        continue;
      }
      if (!c.quote || c.quote.trim() === "") {
        cells.push({ documentId: doc.id, questionId: q.id, status: "unverified", answer: null, unverifiedReason: "missing_quote", verification: null });
        continue;
      }
      const verification = verifyQuote(docObj, c, fuzzyThreshold);
      if (!verification) {
        cells.push({ documentId: doc.id, questionId: q.id, status: "unverified", answer: null, unverifiedReason: "quote_not_verified", verification: null });
        continue;
      }
      cells.push({ documentId: doc.id, questionId: q.id, status: "answered", answer: c.answer, unverifiedReason: null, verification });
    }
  }

  return {
    summary: {
      cells: cells.length,
      answered: cells.filter((c) => c.status === "answered").length,
      unverified: cells.filter((c) => c.status === "unverified").length,
      flaggedForReview: cells.filter((c) => c.verification?.classification === "fuzzy").length,
    },
    cells,
  };
}

/** RFC-4180: quote fields containing commas, quotes, or newlines.
 * @param {string} value @returns {string} */
export function csvEscape(value) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV export with anchors preserved.
 * @param {any} input @param {any} out @returns {string} */
export function toCSV(input, out) {
  const lines = [];
  lines.push(csvEscape("Document") + "," + input.questions.map((q) => csvEscape(q.question)).join(","));
  for (const doc of input.documents) {
    const row = [csvEscape(doc.name)];
    for (const q of input.questions) {
      const cell = out.cells.find((c) => c.documentId === doc.id && c.questionId === q.id);
      if (!cell || cell.status === "unverified") {
        row.push(csvEscape(`UNVERIFIED (${cell?.unverifiedReason ?? "not_answered"})`));
      } else {
        const pin = cell.verification?.pinpoint ? ` [${cell.verification.pinpoint}]` : "";
        const flag = cell.verification?.classification === "fuzzy" ? " [quote fuzzy — review]" : "";
        row.push(csvEscape(`${cell.answer}${pin}${flag}`));
      }
    }
    lines.push(row.join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** Markdown export.
 * @param {any} input @param {any} out @returns {string} */
export function toMarkdown(input, out) {
  const esc = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const lines = [];
  lines.push(`| Document | ${input.questions.map((q) => esc(q.question)).join(" | ")} |`);
  lines.push(`|---|${input.questions.map(() => "---").join("|")}|`);
  for (const doc of input.documents) {
    const row = [esc(doc.name)];
    for (const q of input.questions) {
      const cell = out.cells.find((c) => c.documentId === doc.id && c.questionId === q.id);
      if (!cell || cell.status === "unverified") {
        row.push(`**UNVERIFIED** (${cell?.unverifiedReason ?? "not_answered"})`);
      } else {
        const pin = cell.verification?.pinpoint ? ` [${cell.verification.pinpoint}]` : "";
        const flag = cell.verification?.classification === "fuzzy" ? " ⚠ quote fuzzy — review" : "";
        row.push(esc(cell.answer) + esc(pin) + flag);
      }
    }
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}
