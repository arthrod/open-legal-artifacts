/**
 * cite-check core — deterministic quote verification against source documents.
 * NO LLM: every classification is reproducible from the inputs alone.
 *
 * Plain-JavaScript port of core/citecheck.ts + pinpoint.ts + textutil.ts +
 * diff.ts + extract.ts (the TypeScript sources stay authoritative for tests).
 * Exports the same engine functions; browser + Node compatible, dependency-free.
 * core/propositions.ts is TS-only (a harness around the engine, not part of it).
 *
 * Classification ladder (first match wins):
 *   exact       — quote appears verbatim (whitespace-trimmed) in the source
 *   normalized  — near-verbatim: same tokens modulo case/punctuation (score ≥ 0.95)
 *   fuzzy       — best window similarity ≥ fuzzyThreshold (default 0.7) and coverage ≥ 0.6
 *   not_found   — everything below the fuzzy threshold
 *
 * Guards (deterministic, never silent):
 *   number guard   — an altered numeric token caps the class at fuzzy and is noted
 *   insert guard   — tokens present in the quote but absent from the located span
 *                    are noted and cap the class at fuzzy (a quote must not add words)
 *   negation guard — an inserted or dropped negator ("not", "never", …) flips
 *                    meaning: divergence is noted and caps the class at fuzzy
 *   omission check — tokens dropped from the located span are noted; an explicit
 *                    ellipsis in the quote marks the omission as accepted
 *
 * Every located quote carries a verbatim anchor (source id, segment, char
 * offsets), a machine-checkable token diff (LCS ops), and pinpoint validation.
 * @module core
 */

/* ============================================================
 * textutil (port of core/textutil.ts)
 * ============================================================ */

/** Token with char span in the ORIGINAL string.
 * @typedef {{ norm: string, start: number, end: number }} Tok */

/**
 * Split on runs of non [A-Za-z0-9.] characters; trim leading/trailing dots
 * from each token so "p." -> "p" while "5.2" stays "5.2".
 * @param {string} text @returns {Tok[]} */
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

/**
 * Slide windows of ~quote length (± padding) over the source and return the
 * best-scoring window. Purely deterministic; O(sourceTokens * windowSizes).
 * @param {string} source @param {string} quote @param {number} [pad]
 * @returns {{ score: number, coverage: number, start: number, end: number, verbatim: string } | null}
 */
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
        best = {
          score,
          coverage,
          start: S[st].start,
          end: S[st + size - 1].end,
          verbatim: source.slice(S[st].start, S[st + size - 1].end),
        };
      }
    }
  }
  return best;
}

/** Whitespace-tolerant verbatim containment check on the raw strings.
 * @param {string} source @param {string} quote @returns {boolean} */
export function rawContains(source, quote) {
  const q = quote.trim();
  return q.length > 0 && source.includes(q);
}

/** Jaccard similarity between token multisets of two texts.
 * @param {string} a @param {string} b @returns {number} */
export function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 && tb.length === 0) return 1;
  if (ta.length === 0 || tb.length === 0) return 0;
  const ma = multiset(ta);
  const mb = multiset(tb);
  let inter = 0;
  for (const [t, c] of ma) inter += Math.min(c, mb.get(t) ?? 0);
  return inter / (ta.length + tb.length - inter);
}

/** Numeric token: digits with an optional interior decimal point ("90", "5.2").
 * @param {string} t @returns {boolean} */
export function isNumericToken(t) {
  return /^\d+(?:\.\d+)?$/.test(t);
}

/**
 * Deterministic number guard: multiset-diff the numeric tokens of quote vs.
 * the located source span. Any difference is potential material alteration
 * ("90" -> "120") and must never pass as near-verbatim.
 * @param {string[]} quote @param {string[]} source
 * @returns {{ paired: Array<{ quote: string, source: string }>, quoteOnly: string[], sourceOnly: string[] }} */
export function numericMismatches(quote, source) {
  const qNums = quote.filter(isNumericToken);
  const sNums = source.filter(isNumericToken);
  const qCounts = multiset(qNums);
  const sCounts = multiset(sNums);
  const qDiff = [];
  const sDiff = [];
  for (const [t, c] of qCounts) {
    const extra = c - (sCounts.get(t) ?? 0);
    for (let k = 0; k < extra; k++) qDiff.push(t);
  }
  for (const [t, c] of sCounts) {
    const extra = c - (qCounts.get(t) ?? 0);
    for (let k = 0; k < extra; k++) sDiff.push(t);
  }
  const pairedCount = Math.min(qDiff.length, sDiff.length);
  const paired = [];
  for (let k = 0; k < pairedCount; k++) paired.push({ quote: qDiff[k], source: sDiff[k] });
  return { paired, quoteOnly: qDiff.slice(pairedCount), sourceOnly: sDiff.slice(pairedCount) };
}

/** Negation tokens: inserting or dropping one flips a quote's meaning.
 * @type {Set<string>} */
const NEGATORS = new Set(["not", "no", "never", "none", "neither", "nor", "nobody", "nothing", "nowhere", "cannot"]);

/**
 * Deterministic negation guard: multiset-diff the negation tokens of quote
 * vs. the located source span (mirrors numericMismatches). Inserting "not"
 * into a quote — or silently dropping it — flips meaning, so any divergence
 * must never pass as near-verbatim.
 * @param {string[]} quote @param {string[]} source
 * @returns {{ quoteOnly: string[], sourceOnly: string[] }} */
export function negationDivergence(quote, source) {
  const qNeg = multiset(quote.filter((t) => NEGATORS.has(t)));
  const sNeg = multiset(source.filter((t) => NEGATORS.has(t)));
  const quoteOnly = [];
  const sourceOnly = [];
  for (const [t, c] of qNeg) {
    for (let k = 0; k < c - (sNeg.get(t) ?? 0); k++) quoteOnly.push(t);
  }
  for (const [t, c] of sNeg) {
    for (let k = 0; k < c - (qNeg.get(t) ?? 0); k++) sourceOnly.push(t);
  }
  return { quoteOnly, sourceOnly };
}

/* ============================================================
 * diff (port of core/diff.ts)
 * ============================================================ */

/**
 * Token-level LCS walk (deterministic tie-break: skip quote first).
 * @param {Tok[]} quote @param {Tok[]} source
 * @returns {Array<{ type: "equal", q: number, s: number } | { type: "del", s: number } | { type: "ins", q: number }>} */
function lcsWalk(quote, source) {
  const n = quote.length;
  const m = source.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = quote[i].norm === source[j].norm ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const steps = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (quote[i].norm === source[j].norm) {
      steps.push({ type: "equal", q: i, s: j });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // skipping quote[i] preserves the LCS (quote-only token → insert)
      steps.push({ type: "ins", q: i });
      i++;
    } else {
      // skipping source[j] preserves the LCS (source-only token → delete)
      steps.push({ type: "del", s: j });
      j++;
    }
  }
  while (j < m) steps.push({ type: "del", s: j++ });
  while (i < n) steps.push({ type: "ins", q: i++ });
  return steps;
}

/** LCS alignment pairs (quote index ↔ source index), in order.
 * @param {Tok[]} quote @param {Tok[]} source
 * @returns {Array<{ q: number, s: number }>} */
export function alignTokens(quote, source) {
  return lcsWalk(quote, source)
    .filter((st) => st.type === "equal")
    .map((st) => ({ q: st.q, s: st.s }));
}

/** Grouped diff ops; consecutive del+ins runs merge into a single replace.
 * @param {Tok[]} quote @param {Tok[]} source */
export function diffTokens(quote, source) {
  const steps = lcsWalk(quote, source);
  const ops = [];
  let equalRun = [];
  let delRun = [];
  let insRun = [];

  const flushEqual = () => {
    if (equalRun.length > 0) {
      ops.push({ op: "equal", source: equalRun });
      equalRun = [];
    }
  };
  const flushChange = () => {
    if (delRun.length === 0 && insRun.length === 0) return;
    flushEqual();
    if (delRun.length > 0 && insRun.length > 0) {
      ops.push({
        op: "replace",
        quote: insRun.map((t) => t.norm),
        source: delRun.map((t) => t.norm),
        sourceSpan: { start: delRun[0].start, end: delRun[delRun.length - 1].end },
      });
    } else if (delRun.length > 0) {
      ops.push({
        op: "delete",
        source: delRun.map((t) => t.norm),
        sourceSpan: { start: delRun[0].start, end: delRun[delRun.length - 1].end },
      });
    } else {
      ops.push({ op: "insert", quote: insRun.map((t) => t.norm) });
    }
    delRun = [];
    insRun = [];
  };

  for (const st of steps) {
    if (st.type === "equal") {
      flushChange();
      equalRun.push(source[st.s].norm);
    } else if (st.type === "del") {
      delRun.push(source[st.s]);
    } else {
      insRun.push(quote[st.q]);
    }
  }
  flushChange();
  flushEqual();
  return ops;
}

/** Inline marks for non-equal ops, e.g. `del:"on the document" sub:"120"->"90"`.
 * @param {any[]} ops @returns {string} */
export function formatDiffOps(ops) {
  return ops
    .filter((o) => o.op !== "equal")
    .map((o) => {
      switch (o.op) {
        case "delete":
          return `del:"${o.source.join(" ")}"`;
        case "insert":
          return `ins:"${o.quote.join(" ")}"`;
        case "replace":
          return `sub:"${o.quote.join(" ")}"->"${o.source.join(" ")}"`;
      }
    })
    .join(" ");
}

/* ============================================================
 * pinpoint (port of core/pinpoint.ts)
 * ============================================================ */

const NUM = "[0-9]+(?:\\.[0-9]+)*";
const SEC_RANGE = new RegExp(`^(?:§§|secs\\.|sections?)\\s*(${NUM})\\s*[-–—]\\s*(${NUM})$`, "i");
const SEC_SINGLE = new RegExp(`^(?:§+|secs?\\.|sections?)\\s*(${NUM})$`, "i");
const ART = new RegExp(`^art(?:icle)?\\.?\\s*(${NUM})$`, "i");
const CL = new RegExp(`^cl(?:ause)?\\.?\\s*(${NUM})$`, "i");

/**
 * Pinpoint citation parsing: "p. 12", "pp. 12-13", "§ 5.2", "¶ 8", "at 123",
 * plus v2 forms: transcript page:line ("Tr. 12:4", "12:4-12:8"), ranges
 * ("§§ 5-6", "¶¶ 7-8"), "id. at 123", "n. 12", "art. 3", "cl. 8".
 * Deterministic, dependency-free. Unparseable strings return null (never guessed).
 * @param {string} raw
 * @returns {any} Pinpoint | null
 */
export function parsePinpoint(raw) {
  const s = raw.trim();
  let m;
  if ((m = s.match(/^id\.\s+at\s+(\d+)$/i))) return { kind: "page", from: Number(m[1]) };
  if ((m = s.match(/^id\.\s+at\s+(\d+):(\d+)$/i))) return { kind: "page-line", page: Number(m[1]), lineFrom: Number(m[2]) };
  if ((m = s.match(/^(?:tr\.|transcript)?\s*(\d+):(\d+)(?:\s*[-–—]\s*(?:(\d+):)?(\d+))?$/i))) {
    const pl = { kind: "page-line", page: Number(m[1]), lineFrom: Number(m[2]) };
    if (m[4] !== undefined) {
      pl.lineTo = Number(m[4]);
      if (m[3] !== undefined) pl.pageTo = Number(m[3]);
    }
    return pl;
  }
  if ((m = s.match(/^pp?\.\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?$/i))) {
    const page = { kind: "page", from: Number(m[1]) };
    if (m[2] !== undefined) page.to = Number(m[2]);
    return page;
  }
  if ((m = s.match(/^at\s+(\d+)$/i))) {
    return { kind: "page", from: Number(m[1]) };
  }
  if ((m = s.match(SEC_RANGE))) {
    return { kind: "section", label: m[1], to: m[2] };
  }
  if ((m = s.match(SEC_SINGLE))) {
    return { kind: "section", label: m[1] };
  }
  if ((m = s.match(/^(?:¶¶|paras\.|paragraphs?)\s*(\d+)\s*[-–—]\s*(\d+)$/i))) {
    return { kind: "paragraph", number: Number(m[1]), to: Number(m[2]) };
  }
  if ((m = s.match(/^(?:¶+|paras?\.|paragraphs?)\s*(\d+)$/i))) {
    return { kind: "paragraph", number: Number(m[1]) };
  }
  if ((m = s.match(/^(?:n\.|note)\s*(\d+)$/i))) return { kind: "footnote", number: Number(m[1]) };
  if ((m = s.match(ART))) return { kind: "article", label: m[1] };
  if ((m = s.match(CL))) return { kind: "clause", label: m[1] };
  return null;
}

/** @param {any} p @returns {string} */
export function formatPinpoint(p) {
  switch (p.kind) {
    case "page":
      return p.to !== undefined ? `pp. ${p.from}-${p.to}` : `p. ${p.from}`;
    case "page-line":
      if (p.pageTo !== undefined) return `Tr. ${p.page}:${p.lineFrom}-${p.pageTo}:${p.lineTo}`;
      if (p.lineTo !== undefined) return `Tr. ${p.page}:${p.lineFrom}-${p.lineTo}`;
      return `Tr. ${p.page}:${p.lineFrom}`;
    case "section":
      return p.to !== undefined ? `§§ ${p.label}-${p.to}` : `§ ${p.label}`;
    case "paragraph":
      return p.to !== undefined ? `¶¶ ${p.number}-${p.to}` : `¶ ${p.number}`;
    case "footnote":
      return `n. ${p.number}`;
    case "article":
      return `art. ${p.label}`;
    case "clause":
      return `cl. ${p.label}`;
  }
}

/* ============================================================
 * extract (port of core/extract.ts)
 * ============================================================ */

const FOOTNOTE_RE = /^\[(\d+)\]\s+(.+)$/;

/**
 * Deterministic extractor: pull quoted passages + footnote pinpoints from the
 * reviewed document's text and resolve each footnote to a source by name/alias.
 * Unresolvable footnotes and unmarked quotations become warnings, never
 * fabricated entries.
 * @param {string} documentText @param {any[]} sources
 * @returns {{ quotes: any[], warnings: string[] }} */
export function extractQuotes(documentText, sources) {
  const warnings = [];
  const footnotes = new Map();
  const bodyLines = [];
  for (const line of documentText.split("\n")) {
    const m = line.match(FOOTNOTE_RE);
    if (m) footnotes.set(Number(m[1]), m[2].trim());
    else bodyLines.push(line);
  }
  const bodyText = bodyLines.join("\n");

  const resolved = new Map();
  for (const [n, noteText] of footnotes) {
    const lower = noteText.toLowerCase();
    let best = null;
    for (const src of sources) {
      for (const name of [src.name, ...(src.aliases ?? [])]) {
        const idx = lower.indexOf(name.toLowerCase());
        if (idx >= 0 && (best === null || name.length > best.len)) {
          best = { id: src.id, len: name.length, end: idx + name.length };
        }
      }
    }
    if (!best) {
      warnings.push(`footnote ${n}: no matching source for "${noteText}"`);
      continue;
    }
    let rest = noteText.slice(best.end).trim();
    if (rest.startsWith(",")) rest = rest.slice(1).trim();
    if (rest.endsWith(".")) rest = rest.slice(0, -1);
    if (rest.length > 0) resolved.set(n, { sourceId: best.id, pinpoint: rest });
    else resolved.set(n, { sourceId: best.id });
  }

  const quotes = [];
  const QUOTE_RE = /["“]([^"”“\n]+)["”]\s*\[(\d+)\]/g;
  let qm;
  while ((qm = QUOTE_RE.exec(bodyText)) !== null) {
    const text = qm[1].trim();
    const n = Number(qm[2]);
    const r = resolved.get(n);
    if (!r) {
      warnings.push(`footnote ${n}: quoted passage has no resolvable footnote`);
      continue;
    }
    const entry = { id: `Q${n}`, text, sourceId: r.sourceId };
    if (r.pinpoint !== undefined) entry.pinpoint = r.pinpoint;
    quotes.push(entry);
  }

  const UNMARKED_RE = /["“]([^"”“\n]{15,})["”](?!\s*\[\d+\])/g;
  let um;
  while ((um = UNMARKED_RE.exec(bodyText)) !== null) {
    const t = um[1].trim();
    warnings.push(`unmarked quotation: "${t.length > 40 ? t.slice(0, 40) + "…" : t}"`);
  }

  return { quotes, warnings };
}

/* ============================================================
 * citecheck (port of core/citecheck.ts)
 * ============================================================ */

function buildDoc(doc) {
  const segments = [];
  let full = "";
  const append = (text) => {
    if (full.length > 0) full += "\n";
    const start = full.length;
    full += text;
    return start;
  };
  if (doc.text !== undefined) append(doc.text);
  const pageList = (doc.pages ?? []).map((p) => ({ kind: "page", label: String(p.number), text: p.text }));
  const secList = (doc.sections ?? []).map((p) => ({ kind: "section", label: p.label, text: p.text }));
  const paraList = (doc.paragraphs ?? []).map((p) => ({ kind: "paragraph", label: String(p.number), text: p.text }));
  for (const seg of [...pageList, ...secList, ...paraList]) {
    const start = append(seg.text);
    segments.push({ kind: seg.kind, label: seg.label, start, end: full.length });
  }
  return { doc, fullText: full, toks: tokenizeWithSpans(full), segments };
}

function segmentAt(built, char) {
  for (const seg of built.segments) {
    if (char >= seg.start && char < seg.end) return seg;
  }
  return null;
}

function anchorFromWindow(built, useWin) {
  if (!useWin) return null;
  const seg = segmentAt(built, useWin.start);
  return {
    sourceId: built.doc.id,
    sourceName: built.doc.name,
    segmentKind: seg?.kind ?? null,
    segmentLabel: seg?.label ?? null,
    charStart: useWin.start,
    charEnd: useWin.end,
    verbatim: useWin.verbatim,
  };
}

/**
 * Near-verbatim anchor: LCS-align the quote against the segment containing the
 * best window, then extend the span to the end of that sentence, so dropped
 * tail tokens stay inside the anchor and surface in the diff.
 */
function alignedAnchor(built, quoteToks, win) {
  if (!win) return { anchor: null, diff: null };
  const seg = segmentAt(built, win.start);
  const regionEnd = seg ? seg.end : built.fullText.length;
  // region starts at the best window (never before it) so early duplicate
  // tokens from a preceding sentence cannot capture the alignment
  const wsIdx = built.toks.findIndex((t) => t.start >= win.start);
  const regionToks = wsIdx < 0 ? [] : built.toks.filter((t, idx) => idx >= wsIdx && t.end <= regionEnd);
  const pairs = alignTokens(quoteToks, regionToks);
  if (pairs.length === 0) {
    const fallback = anchorFromWindow(built, win);
    return { anchor: fallback, diff: fallback ? diffTokens(quoteToks, tokenizeWithSpans(fallback.verbatim)) : null };
  }
  const first = regionToks[pairs[0].s];
  const lastIdx = pairs[pairs.length - 1].s;
  let endIdx = lastIdx;
  for (let j = lastIdx + 1; j < regionToks.length && j <= lastIdx + 30; j++) {
    const gap = built.fullText.slice(regionToks[j - 1].end, regionToks[j].start);
    if (/[.!?\n]/.test(gap)) break; // sentence (or line) already ended
    endIdx = j;
  }
  const endTok = regionToks[endIdx];
  const anchorSeg = segmentAt(built, first.start);
  const anchor = {
    sourceId: built.doc.id,
    sourceName: built.doc.name,
    segmentKind: anchorSeg?.kind ?? null,
    segmentLabel: anchorSeg?.label ?? null,
    charStart: first.start,
    charEnd: endTok.end,
    verbatim: built.fullText.slice(first.start, endTok.end),
  };
  return { anchor, diff: diffTokens(quoteToks, tokenizeWithSpans(anchor.verbatim)) };
}

function segmentKindOf(p) {
  if (p.kind === "page" || p.kind === "page-line") return "page";
  if (p.kind === "section") return "section";
  if (p.kind === "paragraph") return "paragraph";
  return null; // footnote / article / clause — not modeled
}

function checkPinpoint(quote, anchor, built) {
  if (quote.pinpoint === undefined) return null;
  const parsed = parsePinpoint(quote.pinpoint);
  if (parsed === null) {
    return { raw: quote.pinpoint, parsed: null, status: "unparseable", detail: "pinpoint syntax not recognized" };
  }
  const kindWord = segmentKindOf(parsed);
  if (kindWord === null) {
    return {
      raw: quote.pinpoint,
      parsed,
      status: "unverifiable",
      detail: `core does not model ${parsed.kind} segments, so the pinpoint cannot be validated`,
    };
  }
  if (anchor === null || anchor.segmentKind === null) {
    if (built === null) {
      return { raw: quote.pinpoint, parsed, status: "unverifiable", detail: "source not provided, so the pinpoint cannot be validated" };
    }
    if (!built.segments.some((s) => s.kind === kindWord)) {
      return {
        raw: quote.pinpoint,
        parsed,
        status: "unverifiable",
        detail: `source does not declare ${kindWord} segments, so the pinpoint cannot be validated`,
      };
    }
    if (anchor === null) {
      return { raw: quote.pinpoint, parsed, status: "unverifiable", detail: "quote not located in the source, so the pinpoint cannot be validated" };
    }
    return {
      raw: quote.pinpoint,
      parsed,
      status: "unverifiable",
      detail: `the quote is not located in a segmented part of the source, so the ${kindWord} pinpoint cannot be validated`,
    };
  }
  if (parsed.kind !== anchor.segmentKind && parsed.kind !== "page-line") {
    return {
      raw: quote.pinpoint,
      parsed,
      status: "unverifiable",
      detail: `the quote is located in a ${anchor.segmentKind} segment, so the ${kindWord} pinpoint cannot be validated`,
    };
  }
  if (parsed.kind === "page-line") {
    if (anchor.segmentKind !== "page" || built === null) {
      return {
        raw: quote.pinpoint,
        parsed,
        status: "unverifiable",
        detail: "the quote is not located in a page segment, so the page:line pinpoint cannot be validated",
      };
    }
    const anchorPage = Number(anchor.segmentLabel);
    const pageFrom = parsed.page;
    const pageTo = parsed.pageTo ?? parsed.page;
    if (anchorPage < pageFrom || anchorPage > pageTo) {
      return {
        raw: quote.pinpoint,
        parsed,
        status: "mismatch",
        detail: `pinpoint says ${formatPinpoint(parsed)} but the quote is located on page ${anchorPage}`,
      };
    }
    const seg = segmentAt(built, anchor.charStart);
    if (!seg) {
      return { raw: quote.pinpoint, parsed, status: "unverifiable", detail: "quote not located in the source, so the pinpoint cannot be validated" };
    }
    const pageText = built.fullText.slice(seg.start, seg.end);
    const lineTo = parsed.lineTo ?? parsed.lineFrom;
    if (!pageText.includes("\n")) {
      return {
        raw: quote.pinpoint,
        parsed,
        status: "unverifiable",
        detail: `page ${anchorPage} is not line-segmented, so line ${parsed.lineFrom} cannot be validated`,
      };
    }
    const line = pageText.slice(0, anchor.charStart - seg.start).split("\n").length;
    const ok = line >= parsed.lineFrom && line <= lineTo;
    return {
      raw: quote.pinpoint,
      parsed,
      status: ok ? "ok" : "mismatch",
      detail: ok
        ? `quote is located on page ${anchorPage} line ${line}`
        : `pinpoint says ${formatPinpoint(parsed)} but the quote is located on page ${anchorPage} line ${line}`,
    };
  }
  if (parsed.kind === "page" && anchor.segmentKind === "page") {
    const citedFrom = parsed.from;
    const citedTo = parsed.to ?? parsed.from;
    const anchorPage = Number(anchor.segmentLabel);
    const ok = anchorPage >= citedFrom && anchorPage <= citedTo;
    return {
      raw: quote.pinpoint,
      parsed,
      status: ok ? "ok" : "mismatch",
      detail: ok
        ? `quote is located on ${anchor.segmentLabel}`
        : `pinpoint says ${formatPinpoint(parsed)} but the quote is located on ${anchor.segmentLabel}`,
    };
  }
  if (parsed.kind === "section" && anchor.segmentKind === "section") {
    let ok;
    if (parsed.to === undefined) {
      ok = anchor.segmentLabel === parsed.label;
    } else {
      const fromNum = Number(parsed.label);
      const toNum = Number(parsed.to);
      const aNum = Number(anchor.segmentLabel);
      ok = !Number.isNaN(fromNum) && !Number.isNaN(toNum) && !Number.isNaN(aNum) && aNum >= fromNum && aNum <= toNum;
    }
    return {
      raw: quote.pinpoint,
      parsed,
      status: ok ? "ok" : "mismatch",
      detail: ok
        ? `quote is located in § ${anchor.segmentLabel}`
        : `pinpoint says ${formatPinpoint(parsed)} but the quote is located in § ${anchor.segmentLabel}`,
    };
  }
  // paragraph
  const anchorNum = Number(anchor.segmentLabel);
  const ok = parsed.to !== undefined ? anchorNum >= parsed.number && anchorNum <= parsed.to : anchorNum === parsed.number;
  return {
    raw: quote.pinpoint,
    parsed,
    status: ok ? "ok" : "mismatch",
    detail: ok
      ? `quote is located in ¶ ${anchor.segmentLabel}`
      : `pinpoint says ${formatPinpoint(parsed)} but the quote is located in ¶ ${anchor.segmentLabel}`,
  };
}

/**
 * Run the deterministic cite check over the input's quotes (or over quotes
 * extracted from document.text when none are supplied).
 * @param {{ document: { name: string, text?: string }, sources: any[], quotes?: any[], fuzzyThreshold?: number }} input
 * @returns {any} CiteCheckReport
 */
export function runCiteCheck(input) {
  const fuzzyThreshold = input.fuzzyThreshold ?? 0.7;
  const byId = new Map();
  for (const doc of input.sources) byId.set(doc.id, buildDoc(doc));

  let quoteList;
  let extractionWarnings;
  if (input.quotes !== undefined) {
    quoteList = input.quotes;
  } else if (input.document.text !== undefined) {
    const extracted = extractQuotes(input.document.text, input.sources);
    quoteList = extracted.quotes;
    extractionWarnings = extracted.warnings;
  } else {
    quoteList = [];
  }

  const results = quoteList.map((quote) => {
    const notes = [];
    const built = byId.get(quote.sourceId);
    const base = {
      id: quote.id,
      ...(quote.proposition !== undefined ? { proposition: quote.proposition } : {}),
    };
    if (!built) {
      return {
        ...base,
        classification: "not_found",
        similarity: 0,
        coverage: 0,
        anchor: null,
        pinpoint: checkPinpoint(quote, null, null),
        bestCandidate: null,
        diff: null,
        notes: [`source "${quote.sourceId}" not provided`],
      };
    }

    const quoteToks = tokenizeWithSpans(quote.text);
    const win = bestWindow(built.fullText, quote.text);
    const similarity = win?.score ?? 0;
    const coverage = win?.coverage ?? 0;

    let classification;
    let anchor = null;
    let diff = null;

    if (rawContains(built.fullText, quote.text)) {
      classification = "exact";
      // the window search can tie on a case/punctuation-drifted look-alike;
      // re-verify byte equality and fall back to the literal indexOf position
      const exactWin = win !== null && win.verbatim === quote.text.trim() ? win : locateRaw(built.fullText, quote.text);
      anchor = anchorFromWindow(built, exactWin);
      if (anchor) diff = diffTokens(quoteToks, tokenizeWithSpans(anchor.verbatim));
    } else if (similarity >= 0.95 && coverage >= 0.95) {
      classification = "normalized";
      notes.push("matches modulo case/punctuation/whitespace");
      const aligned = alignedAnchor(built, quoteToks, win);
      anchor = aligned.anchor;
      diff = aligned.diff;
      // omission detection: pure deletions from the located span
      const hasEllipsis = /\.\.\.|…/.test(quote.text);
      if (anchor && diff) {
        for (const op of diff) {
          if (op.op !== "delete") continue;
          // diff spans are relative to anchor.verbatim (the diffed string)
          const omitted = anchor.verbatim.slice(op.sourceSpan.start, op.sourceSpan.end);
          notes.push(hasEllipsis ? `omits "${omitted}" — explicit ellipsis, accepted` : `omits "${omitted}" without an ellipsis`);
        }
        // number guard: altered digits never pass as near-verbatim
        const mism = numericMismatches(
          quoteToks.map((t) => t.norm),
          tokenizeWithSpans(anchor.verbatim).map((t) => t.norm),
        );
        for (const p of mism.paired) notes.push(`quote "${p.quote}" vs source "${p.source}"`);
        for (const q of mism.quoteOnly) notes.push(`quote "${q}" not found in the located source text`);
        for (const s of mism.sourceOnly) notes.push(`source "${s}" appears in the located text but not in the quote`);
        if (mism.paired.length + mism.quoteOnly.length > 0) {
          classification = "fuzzy";
          notes.push("number alteration caps the classification at fuzzy — requires human review");
        }
        // insert guard: tokens present in the quote but absent from the located span
        let insertCapped = false;
        for (const op of diff) {
          if (op.op !== "insert") continue;
          notes.push(`inserts "${op.quote.join(" ")}" — absent from the located source text`);
          insertCapped = true;
        }
        if (insertCapped) {
          classification = "fuzzy";
          notes.push("inserted tokens cap the classification at fuzzy — requires human review");
        }
        // negation guard: an inserted or dropped negator flips meaning
        const neg = negationDivergence(
          quoteToks.map((t) => t.norm),
          tokenizeWithSpans(anchor.verbatim).map((t) => t.norm),
        );
        for (const q of neg.quoteOnly) notes.push(`negation "${q}" in the quote has no counterpart in the located source text — meaning may be flipped`);
        for (const s of neg.sourceOnly) notes.push(`negation "${s}" in the located source text has no counterpart in the quote — meaning may be flipped`);
        if (neg.quoteOnly.length + neg.sourceOnly.length > 0) {
          classification = "fuzzy";
          notes.push("negation divergence caps the classification at fuzzy — requires human review");
        }
      }
    } else if (similarity >= fuzzyThreshold && coverage >= 0.6) {
      classification = "fuzzy";
      notes.push("substantial overlap but not verbatim — requires human review");
      anchor = anchorFromWindow(built, win);
      if (anchor) diff = diffTokens(quoteToks, tokenizeWithSpans(anchor.verbatim));
    } else {
      classification = "not_found";
      anchor = anchorFromWindow(built, win); // kept as bestCandidate evidence below
      if (win) notes.push(`best candidate similarity ${similarity.toFixed(2)} below threshold ${fuzzyThreshold}`);
    }

    const bestCandidate = classification === "not_found" ? anchor : null;
    if (classification === "not_found") anchor = null;

    const pinpoint = checkPinpoint(quote, anchor, built);
    if (pinpoint?.status === "mismatch") notes.push(`PINPOINT ISSUE: ${pinpoint.detail}`);
    if (quote.proposition !== undefined && classification !== "not_found") {
      notes.push("proposition support is an LLM/human judgment — not evaluated by this core");
    }

    return { ...base, classification, similarity, coverage, anchor, bestCandidate, pinpoint, diff, notes };
  });

  const count = (c) => results.filter((r) => r.classification === c).length;
  const summary = {
    total: results.length,
    exact: count("exact"),
    normalized: count("normalized"),
    fuzzy: count("fuzzy"),
    not_found: count("not_found"),
    checked: results.length - count("not_found"),
    couldNotCheck: count("not_found"),
    unparseablePinpoints: results.filter((r) => r.pinpoint?.status === "unparseable").length,
    pinpointIssues: results.filter((r) => r.pinpoint?.status === "mismatch").length,
  };
  const report = { documentName: input.document.name, summary, results };
  if (extractionWarnings !== undefined) report.extractionWarnings = extractionWarnings;
  return report;
}

/** Anchor for an exactly-contained quote (window search also finds these; kept precise). */
function locateRaw(source, quote) {
  const idx = source.indexOf(quote.trim());
  if (idx < 0) return null;
  return { score: 1, coverage: 1, start: idx, end: idx + quote.trim().length, verbatim: source.slice(idx, idx + quote.trim().length) };
}

/** Markdown report — deterministic rendering of a CiteCheckReport.
 * @param {any} report @returns {string} */
export function renderReport(report) {
  const s = report.summary;
  const lines = [];
  lines.push(`# Cite check — ${report.documentName}`);
  lines.push("");
  lines.push(
    `**Checked ${s.checked} of ${s.total} quotes:** ${s.exact} exact · ${s.normalized} normalized · ${s.fuzzy} fuzzy · ` +
      `${s.couldNotCheck} not checked (never reported as "confirmed") · ${s.unparseablePinpoints} unparseable pinpoint(s) · ` +
      `${s.pinpointIssues} pinpoint issue(s)`,
  );
  if (report.extractionWarnings !== undefined && report.extractionWarnings.length > 0) {
    lines.push("");
    for (const w of report.extractionWarnings) lines.push(`- extraction: ${w}`);
  }
  lines.push("");
  lines.push("| Quote | Verdict | Similarity | Anchor | Pinpoint |");
  lines.push("|---|---|---|---|---|");
  for (const r of report.results) {
    const anchor = r.anchor
      ? `${r.anchor.sourceName}${r.anchor.segmentLabel !== null ? `, ${r.anchor.segmentKind} ${r.anchor.segmentLabel}` : ""} (chars ${r.anchor.charStart}–${r.anchor.charEnd})`
      : "—";
    const pin = r.pinpoint ? `${r.pinpoint.raw}: ${r.pinpoint.status}` : "—";
    lines.push(`| ${r.id} | ${r.classification} | ${r.similarity.toFixed(2)} | ${anchor} | ${pin} |`);
  }
  lines.push("");
  for (const r of report.results) {
    lines.push(`## ${r.id} — ${r.classification}`);
    lines.push("");
    if (r.anchor) {
      lines.push(`> ${r.anchor.verbatim.replace(/\n/g, " ")}`);
      lines.push("");
      lines.push(`Anchored at ${r.anchor.sourceName} chars ${r.anchor.charStart}–${r.anchor.charEnd}.`);
    } else {
      lines.push("No locating anchor in the provided sources.");
    }
    const marks = r.diff ? formatDiffOps(r.diff) : "";
    if (marks) lines.push(`Token diff: ${marks}`);
    if (r.pinpoint) lines.push(`Pinpoint: ${r.pinpoint.raw} — ${r.pinpoint.status} (${r.pinpoint.detail}).`);
    for (const n of r.notes) lines.push(`- ${n}`);
    lines.push("");
  }
  return lines.join("\n");
}
