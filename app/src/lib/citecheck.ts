// cite-check deterministic core.
// Quote-vs-source matching without any LLM: exact, normalized, fuzzy, not_found.

export type MatchKind = "exact" | "normalized" | "fuzzy" | "not_found";

export interface CiteCheckResult {
  kind: MatchKind;
  similarity: number; // 0..1
  matchedText?: string; // the best-matching span in the source
  index?: number; // character offset in the source
  detail: string;
}

const FUZZY_THRESHOLD = 0.85;

/** Collapse whitespace, unify quotes/dashes, case-fold. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Word tokens with character offsets into the original text. */
export function words(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Plain Levenshtein edit distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const d = editDistance(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

/**
 * Compare a quoted passage against source text.
 * Deterministic: same inputs always yield the same result.
 */
export function citeCheck(quote: string, source: string): CiteCheckResult {
  const quoteTrim = quote.trim();
  const sourceTrim = source.trim();
  if (quoteTrim === "") {
    return { kind: "not_found", similarity: 0, detail: "Empty quote." };
  }
  if (sourceTrim === "") {
    return {
      kind: "not_found",
      similarity: 0,
      detail: "Empty source text.",
    };
  }

  // 1. Exact: byte-identical (after outer trim) somewhere in the source.
  const exactIdx = sourceTrim.indexOf(quoteTrim);
  if (exactIdx !== -1) {
    return {
      kind: "exact",
      similarity: 1,
      matchedText: quoteTrim,
      index: exactIdx,
      detail: "Quote appears verbatim in the source.",
    };
  }

  // 2. Normalized: equal after normalization (spacing, quotes, case).
  const nQuote = normalizeText(quoteTrim);
  const nSource = normalizeText(sourceTrim);
  const normIdx = nSource.indexOf(nQuote);
  if (normIdx !== -1) {
    return {
      kind: "normalized",
      similarity: 1,
      index: normIdx,
      matchedText: quoteTrim,
      detail:
        "Quote matches after normalization (whitespace, curly quotes, dashes, case) — cite as-is, but the original formatting differs.",
    };
  }

  // 3. Fuzzy: best-matching word window by Levenshtein similarity.
  const srcWords = words(sourceTrim);
  const qWords = words(nQuote).length;
  let best: { sim: number; start: number; end: number } | null = null;
  for (let w = Math.max(1, qWords - 2); w <= qWords + 2; w++) {
    for (let i = 0; i + w <= srcWords.length; i++) {
      const from = srcWords[i].start;
      const to = srcWords[i + w - 1].end;
      const winNorm = normalizeText(sourceTrim.slice(from, to));
      // Upper bound on similarity from the length difference alone — skip
      // windows that can never reach the threshold (cheap, deterministic).
      if (1 - Math.abs(winNorm.length - nQuote.length) / Math.max(winNorm.length, nQuote.length) < FUZZY_THRESHOLD) {
        continue;
      }
      const sim = similarity(nQuote, winNorm);
      if (!best || sim > best.sim) best = { sim, start: from, end: to };
    }
  }
  if (best && best.sim >= FUZZY_THRESHOLD) {
    return {
      kind: "fuzzy",
      similarity: Math.round(best.sim * 100) / 100,
      matchedText: sourceTrim.slice(best.start, best.end),
      index: best.start,
      detail: `Closest source span matches at ${(best.sim * 100).toFixed(1)}% — likely an altered or mis-transcribed quote. Flag for attorney review.`,
    };
  }

  return {
    kind: "not_found",
    similarity: best ? Math.round(best.sim * 100) / 100 : 0,
    matchedText: best ? sourceTrim.slice(best.start, best.end) : undefined,
    index: best?.start,
    detail: `No match in source (best span similarity ${
      best ? (best.sim * 100).toFixed(1) : "0"
    }%). The source does not contain this quote.`,
  };
}
