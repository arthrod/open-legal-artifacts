/**
 * tabular-review core - deterministic documents x questions review matrix.
 * NO LLM: the core VERIFIES extraction, it never answers.
 *
 * GENERATED from core/matrix.ts (+ core/textutil.ts) - the TypeScript
 * sources stay authoritative; keep this file in sync via the parity test
 * (`core/core.js port stays in sync`). Dependency-free ES module;
 * browser + Node compatible. Regenerate:
 *   esbuild core/matrix.ts --bundle --format=esm
 *
 * Contract (catalog 2.1): one row per document, one column per question,
 * every answered cell source-anchored. A cell is `answered` ONLY when the
 * supplied answer carries a quote that locates in the document (exact or
 * normalized; fuzzy anchors the answer but is flagged for review) AND the
 * answer satisfies the question's typed schema, if any. Anything else is
 * `unverified` with a machine reason - never guessed:
 *   not_answered | missing_quote | quote_not_verified | no_such_document
 *   | constraint_violation | not_present | unclear | needs_review
 *
 * Also runs a deterministic consistency pass (minority classify values in a
 * column are flagged `outlier_value`; the answer is kept) and exports:
 * RFC-4180 CSV (with an empty reviewer `Verified` column), Markdown, a
 * per-cell sources audit CSV, and a re-run diff (`diffMatrices`).
 * @module core
 */
// core/textutil.ts
function tokenizeWithSpans(text) {
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
function tokens(text) {
  return tokenizeWithSpans(text).map((t) => t.norm);
}
function multiset(xs) {
  const m = /* @__PURE__ */ new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}
function bestWindow(source, quote, pad = 6) {
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
      if (best === null || score > best.score || score === best.score && coverage > best.coverage) {
        best = {
          score,
          coverage,
          start: S[st].start,
          end: S[st + size - 1].end,
          verbatim: source.slice(S[st].start, S[st + size - 1].end)
        };
      }
    }
  }
  return best;
}
function rawContains(source, quote) {
  const q = quote.trim();
  return q.length > 0 && source.includes(q);
}

// core/matrix.ts
var REASON_ORDER = [
  "not_answered",
  "missing_quote",
  "quote_not_verified",
  "no_such_document",
  "constraint_violation",
  "not_present",
  "unclear",
  "needs_review"
];
var MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
];
var MONTH_RE = MONTH_NAMES.join("|");
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function classifyMatch(answer, options) {
  const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const a = norm(answer);
  let best = null;
  for (const opt of options) {
    const o = opt.trim();
    if (!o) continue;
    const no = norm(o);
    if (no === a || new RegExp(`\\b${escapeRegExp(no)}\\b`).test(a)) {
      if (best === null || o.length > best.length) best = o;
    }
  }
  return best;
}
function parseDate(s) {
  const iso = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const mdy = s.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "i"));
  if (mdy) return validDate(Number(mdy[3]), MONTH_NAMES.indexOf(mdy[1].toLowerCase()) + 1, Number(mdy[2]));
  const dmy = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?,?\\s+(\\d{4})\\b`, "i"));
  if (dmy) return validDate(Number(dmy[3]), MONTH_NAMES.indexOf(dmy[2].toLowerCase()) + 1, Number(dmy[1]));
  const my = s.match(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{4})\\b`, "i"));
  if (my) return validDate(Number(my[2]), MONTH_NAMES.indexOf(my[1].toLowerCase()) + 1, 1);
  return null;
}
function validDate(year, month, day) {
  if (month < 1 || month > 12 || year < 1) return null;
  const leap = year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
  const lens = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > lens[month - 1]) return null;
  return { year, month, day };
}
function durationMonths(s) {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:calendar\s+)?(day|week|month|year)s?\b/i);
  if (!m) return null;
  const factors = { day: 1 / 30, week: 7 / 30, month: 1, year: 12 };
  return Number(m[1]) * factors[m[2].toLowerCase()];
}
function convertMonths(v, unit) {
  const u = (unit ?? "months").toLowerCase();
  const per = { days: 30, weeks: 30 / 7, months: 1, years: 1 / 12 };
  return { value: v * (per[u] ?? 1), unit: u };
}
function currencyAmount(s) {
  const m = s.match(/[$£€]\s*([\d,]+(?:\.\d+)?)/) ?? s.match(/([\d,]+(?:\.\d+)?)\s*(?:USD|GBP|EUR|dollars|pounds|euros)\b/i);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}
function firstNumber(s) {
  const m = s.match(/\d[\d,]*(?:\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, "")) : null;
}
function withinBounds(v, b) {
  const eps = 1e-9;
  return (b.min === void 0 || v >= b.min - eps) && (b.max === void 0 || v <= b.max + eps);
}
function checkSchema(q, answer, doc) {
  switch (q.type) {
    case void 0:
    case "free":
      return null;
    case "classify": {
      if (!q.options?.length) return null;
      const matched = classifyMatch(answer, q.options);
      return matched === null ? false : { type: "classify", matched };
    }
    case "date":
      return parseDate(answer) === null ? false : { type: "date" };
    case "duration": {
      const months = durationMonths(answer);
      if (months === null) return false;
      const { value, unit } = convertMonths(months, q.bounds?.unit);
      if (q.bounds && !withinBounds(value, q.bounds)) return false;
      return { type: "duration", value, unit };
    }
    case "currency": {
      const amount = currencyAmount(answer);
      if (amount === null) return false;
      if (q.bounds && !withinBounds(amount, q.bounds)) return false;
      return { type: "currency", value: amount };
    }
    case "number": {
      const n = firstNumber(answer);
      if (n === null) return false;
      if (q.bounds && !withinBounds(n, q.bounds)) return false;
      return { type: "number", value: n };
    }
    case "verbatim":
      return rawContains(doc.text, answer) ? { type: "verbatim" } : false;
  }
}
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
      pinpoint: cell.pinpoint ?? null
    };
  }
  if (win && win.score >= 0.95 && win.coverage >= 0.95) {
    return { classification: "normalized", similarity: win.score, charStart: win.start, charEnd: win.end, verbatim: win.verbatim, pinpoint: cell.pinpoint ?? null };
  }
  if (win && win.score >= fuzzyThreshold && win.coverage >= 0.6) {
    return { classification: "fuzzy", similarity: win.score, charStart: win.start, charEnd: win.end, verbatim: win.verbatim, pinpoint: cell.pinpoint ?? null };
  }
  return null;
}
function buildMatrix(input) {
  const fuzzyThreshold = input.fuzzyThreshold ?? 0.7;
  const docs = new Map(input.documents.map((d) => [d.id, d]));
  const questions = new Map(input.questions.map((q) => [q.id, q]));
  const supplied = new Map(input.cells.map((c) => [`${c.documentId}::${c.questionId}`, c]));
  const cells = [];
  for (const doc of input.documents) {
    for (const q of input.questions) {
      if (!questions.has(q.id)) continue;
      const c = supplied.get(`${doc.id}::${q.id}`);
      if (c?.notFound) {
        cells.push({ documentId: doc.id, questionId: q.id, status: "unverified", answer: null, unverifiedReason: c.notFound, verification: null, flags: [], schema: null });
        continue;
      }
      if (!c || c.answer === void 0 || c.answer === null || c.answer.trim() === "") {
        cells.push({ documentId: doc.id, questionId: q.id, status: "unverified", answer: null, unverifiedReason: "not_answered", verification: null, flags: [], schema: null });
        continue;
      }
      const docObj = docs.get(c.documentId);
      if (!docObj) {
        cells.push({ documentId: c.documentId, questionId: q.id, status: "unverified", answer: null, unverifiedReason: "no_such_document", verification: null, flags: [], schema: null });
        continue;
      }
      if (!c.quote || c.quote.trim() === "") {
        cells.push({ documentId: doc.id, questionId: q.id, status: "unverified", answer: null, unverifiedReason: "missing_quote", verification: null, flags: [], schema: null });
        continue;
      }
      const verification = verifyQuote(docObj, c, fuzzyThreshold);
      if (!verification) {
        cells.push({ documentId: doc.id, questionId: q.id, status: "unverified", answer: null, unverifiedReason: "quote_not_verified", verification: null, flags: [], schema: null });
        continue;
      }
      const schema = checkSchema(q, c.answer, docObj);
      if (schema === false) {
        cells.push({ documentId: doc.id, questionId: q.id, status: "unverified", answer: null, unverifiedReason: "constraint_violation", verification: null, flags: [], schema: null });
        continue;
      }
      cells.push({ documentId: doc.id, questionId: q.id, status: "answered", answer: c.answer, unverifiedReason: null, verification, flags: [], schema });
    }
  }
  let outliers = 0;
  for (const q of input.questions) {
    if (q.type !== "classify" || !q.options?.length) continue;
    const col = cells.filter((c) => c.questionId === q.id && c.status === "answered");
    if (col.length < 2) continue;
    const counts = /* @__PURE__ */ new Map();
    for (const c of col) {
      const k = c.schema?.matched ?? c.answer;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const threshold = Math.max(1, 0.1 * col.length);
    if (![...counts.values()].some((n) => n > threshold)) continue;
    for (const c of col) {
      const k = c.schema?.matched ?? c.answer;
      if ((counts.get(k) ?? 0) <= threshold) {
        c.flags.push("outlier_value");
        outliers++;
      }
    }
  }
  const columns = input.questions.map((q) => {
    const col = cells.filter((c) => c.questionId === q.id);
    const reasons = {};
    for (const r of REASON_ORDER) {
      const n = col.filter((c) => c.unverifiedReason === r).length;
      if (n > 0) reasons[r] = n;
    }
    return {
      questionId: q.id,
      answered: col.filter((c) => c.status === "answered").length,
      unverified: col.filter((c) => c.status === "unverified").length,
      outliers: col.filter((c) => c.flags.includes("outlier_value")).length,
      reasons
    };
  });
  return {
    summary: {
      cells: cells.length,
      answered: cells.filter((c) => c.status === "answered").length,
      unverified: cells.filter((c) => c.status === "unverified").length,
      flaggedForReview: cells.filter((c) => c.verification?.classification === "fuzzy").length,
      outliers,
      columns
    },
    cells
  };
}
function csvEscape(value) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function toCSV(input, out) {
  const lines = [];
  lines.push(csvEscape("Document") + "," + input.questions.map((q) => csvEscape(q.question)).join(",") + ",Verified");
  for (const doc of input.documents) {
    const row = [csvEscape(doc.name)];
    for (const q of input.questions) {
      const cell = out.cells.find((c) => c.documentId === doc.id && c.questionId === q.id);
      if (!cell || cell.status === "unverified") {
        row.push(csvEscape(`UNVERIFIED (${cell?.unverifiedReason ?? "not_answered"})`));
      } else {
        const pin = cell.verification?.pinpoint ? ` [${cell.verification.pinpoint}]` : "";
        const flag = cell.verification?.classification === "fuzzy" ? " [quote fuzzy \u2014 review]" : "";
        const outlier = cell.flags.includes("outlier_value") ? " [outlier_value]" : "";
        row.push(csvEscape(`${cell.answer}${pin}${flag}${outlier}`));
      }
    }
    row.push("");
    lines.push(row.join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
function toSourcesCSV(input, out) {
  const docName = new Map(input.documents.map((d) => [d.id, d.name]));
  const qText = new Map(input.questions.map((q) => [q.id, q.question]));
  const lines = [];
  lines.push("Document,Question,Verbatim,Span,Pinpoint,Classification");
  for (const c of out.cells) {
    const v = c.verification;
    lines.push(
      [
        csvEscape(docName.get(c.documentId) ?? c.documentId),
        csvEscape(qText.get(c.questionId) ?? c.questionId),
        v ? csvEscape(v.verbatim) : "",
        v ? `${v.charStart}-${v.charEnd}` : "",
        v?.pinpoint ? csvEscape(v.pinpoint) : "",
        v ? v.classification : c.unverifiedReason ?? ""
      ].join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}
function toMarkdown(input, out) {
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
        const flag = cell.verification?.classification === "fuzzy" ? " \u26A0 quote fuzzy \u2014 review" : "";
        const outlier = cell.flags.includes("outlier_value") ? " \u26A0 outlier_value" : "";
        row.push(esc(cell.answer) + esc(pin) + flag + outlier);
      }
    }
    lines.push(`| ${row.join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}
function sideOf(c) {
  return {
    status: c.status,
    answer: c.answer,
    classification: c.verification?.classification ?? null,
    unverifiedReason: c.unverifiedReason ?? null
  };
}
function diffMatrices(prev, next) {
  const key = (c) => `${c.documentId}::${c.questionId}`;
  const prevMap = new Map(prev.cells.map((c) => [key(c), c]));
  const nextMap = new Map(next.cells.map((c) => [key(c), c]));
  const diffs = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;
  const emit = (k, p, n) => {
    const [documentId, questionId] = k.split("::");
    if (p && !n) {
      removed++;
      diffs.push({ documentId, questionId, added: false, removed: true, changed: false, prev: sideOf(p), next: null });
    } else if (!p && n) {
      added++;
      diffs.push({ documentId, questionId, added: true, removed: false, changed: false, prev: null, next: sideOf(n) });
    } else if (p && n) {
      const same = JSON.stringify(sideOf(p)) === JSON.stringify(sideOf(n));
      if (same) unchanged++;
      else changed++;
      diffs.push({ documentId, questionId, added: false, removed: false, changed: !same, prev: sideOf(p), next: sideOf(n) });
    }
  };
  for (const c of prev.cells) emit(key(c), c, nextMap.get(key(c)));
  for (const c of next.cells) if (!prevMap.has(key(c))) emit(key(c), void 0, c);
  return { cells: diffs, summary: { added, removed, changed, unchanged } };
}
export {
  tokenizeWithSpans,
  tokens,
  bestWindow,
  rawContains,  buildMatrix,
  classifyMatch,
  csvEscape,
  currencyAmount,
  diffMatrices,
  durationMonths,
  parseDate,
  toCSV,
  toMarkdown,
  toSourcesCSV
};
