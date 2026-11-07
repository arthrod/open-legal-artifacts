/**
 * cite-check core — deterministic quote verification against source documents.
 * NO LLM: every classification is reproducible from the inputs alone.
 *
 * Plain-JavaScript port of core/citecheck.ts + pinpoint.ts + textutil.ts
 * (the TypeScript sources stay authoritative for tests). Exports the same
 * functions; browser + Node compatible, dependency-free.
 *
 * Classification ladder (first match wins):
 *   exact       — quote appears verbatim (whitespace-trimmed) in the source
 *   normalized  — near-verbatim: same tokens modulo case/punctuation (score ≥ 0.95)
 *   fuzzy       — best window similarity ≥ fuzzyThreshold (default 0.7) and coverage ≥ 0.6
 *   not_found   — everything below the fuzzy threshold
 *
 * Every located quote carries a verbatim anchor: source id, segment (page /
 * section / paragraph when the source declares them), and char offsets.
 * Pinpoint citations are parsed and, when the source declares comparable
 * segments, validated against the anchor's actual segment.
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

/* ============================================================
 * pinpoint (port of core/pinpoint.ts)
 * ============================================================ */

/**
 * Pinpoint citation parsing: "p. 12", "pp. 12-13", "§ 5.2", "¶ 8", "at 123".
 * Deterministic, dependency-free. Unparseable strings return null (never guessed).
 * @param {string} raw
 * @returns {{ kind: "page", from: number, to?: number } | { kind: "section", label: string } | { kind: "paragraph", number: number } | null}
 */
export function parsePinpoint(raw) {
  const s = raw.trim();
  let m;
  if ((m = s.match(/^pp?\.\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?$/i))) {
    const page = { kind: "page", from: Number(m[1]) };
    if (m[2] !== undefined) page.to = Number(m[2]);
    return page;
  }
  if ((m = s.match(/^at\s+(\d+)$/i))) {
    return { kind: "page", from: Number(m[1]) };
  }
  if ((m = s.match(/^(?:§+|secs?\.|sections?)\s*([0-9]+(?:\.[0-9]+)*)$/i))) {
    return { kind: "section", label: m[1] };
  }
  if ((m = s.match(/^(?:¶+|paras?\.|paragraphs?)\s*(\d+)$/i))) {
    return { kind: "paragraph", number: Number(m[1]) };
  }
  return null;
}

/** @param {any} p @returns {string} */
export function formatPinpoint(p) {
  switch (p.kind) {
    case "page":
      return p.to !== undefined ? `pp. ${p.from}-${p.to}` : `p. ${p.from}`;
    case "section":
      return `§ ${p.label}`;
    case "paragraph":
      return `¶ ${p.number}`;
  }
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
  return { doc, fullText: full, segments };
}

function segmentAt(built, char) {
  for (const seg of built.segments) {
    if (char >= seg.start && char < seg.end) return seg;
  }
  return null;
}

function checkPinpoint(quote, anchor) {
  if (quote.pinpoint === undefined) return null;
  const parsed = parsePinpoint(quote.pinpoint);
  if (parsed === null) {
    return { raw: quote.pinpoint, parsed: null, status: "unparseable", detail: "pinpoint syntax not recognized" };
  }
  if (parsed.kind !== anchor?.segmentKind || anchor?.segmentKind === null) {
    return {
      raw: quote.pinpoint,
      parsed,
      status: "unverifiable",
      detail: `source does not declare ${parsed.kind} segments, so the pinpoint cannot be validated`,
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
    const ok = anchor.segmentLabel === parsed.label;
    return {
      raw: quote.pinpoint,
      parsed,
      status: ok ? "ok" : "mismatch",
      detail: ok
        ? `quote is located in § ${anchor.segmentLabel}`
        : `pinpoint says § ${parsed.label} but the quote is located in § ${anchor.segmentLabel}`,
    };
  }
  // paragraph
  const ok = Number(anchor.segmentLabel) === parsed.number;
  return {
    raw: quote.pinpoint,
    parsed,
    status: ok ? "ok" : "mismatch",
    detail: ok
      ? `quote is located in ¶ ${anchor.segmentLabel}`
      : `pinpoint says ¶ ${parsed.number} but the quote is located in ¶ ${anchor.segmentLabel}`,
  };
}

/**
 * Run the deterministic cite check over the input's quotes.
 * @param {{ document: { name: string }, sources: any[], quotes: any[], fuzzyThreshold?: number }} input
 * @returns {any} CiteCheckReport
 */
export function runCiteCheck(input) {
  const fuzzyThreshold = input.fuzzyThreshold ?? 0.7;
  const byId = new Map();
  for (const doc of input.sources) byId.set(doc.id, buildDoc(doc));

  const results = input.quotes.map((quote) => {
    const notes = [];
    const built = byId.get(quote.sourceId);
    if (!built) {
      return {
        id: quote.id,
        classification: "not_found",
        similarity: 0,
        coverage: 0,
        anchor: null,
        pinpoint: checkPinpoint(quote, null),
        bestCandidate: null,
        notes: [`source "${quote.sourceId}" not provided`],
      };
    }

    const win = bestWindow(built.fullText, quote.text);
    const similarityScore = win?.score ?? 0;
    const coverage = win?.coverage ?? 0;

    let classification;
    if (rawContains(built.fullText, quote.text)) {
      classification = "exact";
    } else if (similarityScore >= 0.95 && coverage >= 0.95) {
      classification = "normalized";
      notes.push("matches modulo case/punctuation/whitespace");
    } else if (similarityScore >= fuzzyThreshold && coverage >= 0.6) {
      classification = "fuzzy";
      notes.push("substantial overlap but not verbatim — requires human review");
    } else {
      classification = "not_found";
      if (win) notes.push(`best candidate similarity ${similarityScore.toFixed(2)} below threshold ${fuzzyThreshold}`);
    }

    // Anchor from the verbatim window (even for "exact", so offsets always resolve)
    const useWin = win ?? (rawContains(built.fullText, quote.text) ? locateRaw(built.fullText, quote.text) : null);
    let anchor = null;
    if (useWin) {
      const seg = segmentAt(built, useWin.start);
      anchor = {
        sourceId: built.doc.id,
        sourceName: built.doc.name,
        segmentKind: seg?.kind ?? null,
        segmentLabel: seg?.label ?? null,
        charStart: useWin.start,
        charEnd: useWin.end,
        verbatim: useWin.verbatim,
      };
    }
    const bestCandidate = classification === "not_found" ? anchor : null;
    if (classification === "not_found") anchor = null;

    const pinpoint = checkPinpoint(quote, anchor);
    if (pinpoint?.status === "mismatch") notes.push(`PINPOINT ISSUE: ${pinpoint.detail}`);
    if (quote.proposition !== undefined && classification !== "not_found") {
      notes.push("proposition support is an LLM/human judgment — not evaluated by this core");
    }

    return { id: quote.id, classification, similarity: similarityScore, coverage, anchor, bestCandidate, pinpoint, notes };
  });

  const count = (c) => results.filter((r) => r.classification === c).length;
  return {
    documentName: input.document.name,
    summary: {
      total: results.length,
      exact: count("exact"),
      normalized: count("normalized"),
      fuzzy: count("fuzzy"),
      not_found: count("not_found"),
      pinpointIssues: results.filter((r) => r.pinpoint?.status === "mismatch").length,
    },
    results,
  };
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
    `**${s.total} quotes checked:** ${s.exact} exact · ${s.normalized} normalized · ${s.fuzzy} fuzzy · ${s.not_found} not found · ${s.pinpointIssues} pinpoint issue(s)`,
  );
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
    if (r.pinpoint) lines.push(`Pinpoint: ${r.pinpoint.raw} — ${r.pinpoint.status} (${r.pinpoint.detail}).`);
    for (const n of r.notes) lines.push(`- ${n}`);
    lines.push("");
  }
  return lines.join("\n");
}
