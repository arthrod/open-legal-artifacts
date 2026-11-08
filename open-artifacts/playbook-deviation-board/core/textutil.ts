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

/* ---------- number-word normalization (finite map, deterministic) ---------- */

const ONES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000 };

/**
 * Units that license number-word normalization: "eighteen months",
 * "ninety days", "successive one-year terms" (the hyphen splits into
 * "one" + "year"). A number word NOT followed by one of these units (or by
 * its own "(n)" restatement) is prose — "no one party may…" — and is left
 * out of the numeric comparison entirely.
 */
const UNITS = new Set([
  'second', 'seconds', 'minute', 'minutes', 'hour', 'hours',
  'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years',
  'dollar', 'dollars', 'cent', 'cents', 'euro', 'euros', 'percent',
]);

const isNumWord = (w: string): boolean => w in ONES || w in TENS || w in SCALES;

/**
 * Parse a maximal run of English number words (one–ninety-nine plus
 * hundred/thousand scales) starting at parts[i]. Returns the value and how
 * many parts were consumed ({ value: null, len: 0 } if parts[i] is not a
 * number word).
 */
function parseNumberWordRun(parts: string[], i: number): { value: number | null; len: number } {
  if (i >= parts.length || !isNumWord(parts[i])) return { value: null, len: 0 };
  let total = 0;
  let current = 0;
  let len = 0;
  while (i + len < parts.length && isNumWord(parts[i + len])) {
    const w = parts[i + len];
    if (w === 'hundred') current = (current || 1) * 100;
    else if (w === 'thousand') { total += (current || 1) * 1000; current = 0; }
    else current += ONES[w] ?? TENS[w] ?? 0;
    len++;
  }
  return { value: total + current, len };
}

/**
 * Numeric tokens of a text, with gated number-word normalization: a run of
 * English number words counts as a number ONLY when it is immediately
 * followed by (a) its own digit restatement — "eighteen (18)" counts once —
 * or (b) a unit word ("eighteen months", "ninety days"). Bare number words
 * in prose ("no one party may…") yield no numeric token, so they can never
 * poison the numeric guard. "eighteen (18) months", "18 months", and
 * "eighteen months" all yield ["18"]. Digit tokens (including "3.1"-style
 * section numbers) are kept verbatim, exactly as before normalization
 * existed. Sorted for multiset comparison.
 */
export function numericTokens(text: string): string[] {
  const parts = text
    .toLowerCase()
    .split(/[^0-9a-z.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t.length > 0);
  const isDigits = (p: string): boolean => /^[0-9]+(\.[0-9]+)?$/.test(p);
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    if (isDigits(p)) {
      out.push(p);
      i++;
      continue;
    }
    const { value, len } = parseNumberWordRun(parts, i);
    if (value === null) {
      i++;
      continue;
    }
    const nextIdx = i + len;
    const restated = nextIdx < parts.length && isDigits(parts[nextIdx]) && parts[nextIdx] === String(value);
    const unitNext = nextIdx < parts.length && UNITS.has(parts[nextIdx]);
    if (restated) {
      // collapse "eighteen (18)" — word run immediately followed by the same digit
      out.push(String(value));
      i = nextIdx + 1;
    } else if (unitNext) {
      // "eighteen months" — a real quantity
      out.push(String(value));
      i = nextIdx;
    } else {
      // prose use of a number word ("no one party") — not a quantity; skip the run
      i = nextIdx;
    }
  }
  return out.sort();
}
