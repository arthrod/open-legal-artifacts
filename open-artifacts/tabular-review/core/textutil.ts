/**
 * Deterministic text utilities — dependency-free.
 * Tokenization records character spans in the ORIGINAL string so that any
 * window match can be anchored back to a verbatim slice of the source.
 */

export interface Tok {
  norm: string; // lowercased token, interior dots preserved ("5.2")
  start: number; // char offset in original text (inclusive)
  end: number; // char offset in original text (exclusive)
}

/**
 * Split on runs of non [A-Za-z0-9.] characters; trim leading/trailing dots
 * from each token so "p." -> "p" while "5.2" stays "5.2".
 */
export function tokenizeWithSpans(text: string): Tok[] {
  const toks: Tok[] = [];
  const re = /[^A-Za-z0-9.]+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (start: number, end: number): void => {
    let ls = start;
    let le = end;
    while (ls < le && text[ls] === '.') ls++;
    while (le > ls && text[le - 1] === '.') le--;
    if (le > ls) toks.push({ norm: text.slice(ls, le).toLowerCase(), start: ls, end: le });
  };
  while ((m = re.exec(text)) !== null) {
    push(last, m.index);
    last = m.index + m[0].length;
  }
  push(last, text.length);
  return toks;
}

export function tokens(text: string): string[] {
  return tokenizeWithSpans(text).map((t) => t.norm);
}

function multiset(xs: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

export interface WindowMatch {
  score: number; // Jaccard similarity between quote tokens and best window
  coverage: number; // fraction of quote tokens found in the best window
  start: number; // char offset in source (inclusive)
  end: number; // char offset in source (exclusive)
  verbatim: string; // exact original-text slice of the matched window
}

/**
 * Slide windows of ~quote length (± padding) over the source and return the
 * best-scoring window. Purely deterministic; O(sourceTokens * windowSizes).
 */
export function bestWindow(source: string, quote: string, pad = 6): WindowMatch | null {
  const S = tokenizeWithSpans(source);
  const q = tokens(quote);
  if (S.length === 0 || q.length === 0) return null;
  const qSet = multiset(q);
  let best: WindowMatch | null = null;
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

/** Whitespace-tolerant verbatim containment check on the raw strings. */
export function rawContains(source: string, quote: string): boolean {
  const q = quote.trim();
  return q.length > 0 && source.includes(q);
}

/** Jaccard similarity between token multisets of two texts. */
export function similarity(a: string, b: string): number {
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
