/**
 * patent-claim-comparison — deterministic core.
 *
 * Parses patent claims into numbered limitations, compares two claim sets
 * limitation-by-limitation, and emits matched / added / removed / modified
 * rows with span anchors into the source text. Unmatched limitations are
 * reported explicitly — "no teaching found" rows are NEVER guessed.
 *
 * Plain-JavaScript ES module, zero dependencies, browser + Node compatible.
 * ALL DATA IS FICTIONAL. Not legal advice; charts are attorney work product.
 */

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/** Legal-noise stopwords excluded from similarity scoring (not from text). */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'to', 'for', 'in', 'by', 'with', 'at',
  'is', 'are', 'be', 'being', 'that', 'which', 'wherein', 'whereby', 'said',
  'including', 'comprising', 'comprises', 'configured', 'configure',
]);

/**
 * Normalize text into a token set for similarity scoring.
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokenize(text) {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9%.\-\s]/g, ' ')
      .split(/\s+/)
      .map((t) => t.replace(/^[-.]+|[-.]+$/g, ''))
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/**
 * Jaccard similarity between two token sets, 0..1.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function similarity(a, b) {
  const A = a instanceof Set ? a : tokenize(a);
  const B = b instanceof Set ? b : tokenize(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

// ---------------------------------------------------------------------------
// Claim parsing: text → numbered limitations with span anchors
// ---------------------------------------------------------------------------

/**
 * Parse one claim into preamble + numbered limitations.
 *
 * Split points: semicolons and the words "wherein"/"whereby" (a following
 * "wherein" starts a new limitation). The claim number ("12." / "12 (…)")
 * and the transitional phrase (comprising / consisting of) start the
 * preamble. Every limitation carries [start,end) span anchors into the
 * original claim text, so any comparison row can be highlighted at source.
 *
 * @param {string} claimText
 * @returns {{ number: number|null, text: string, preamble: {text:string, span:[number,number]},
 *             transitional: 'comprising'|'consisting'|'consisting-essentially-of'|null, dependsOn: number|null,
 *             limitations: Array<{ id:string, text:string, span:[number,number] }>,
 *             type: 'independent'|'dependent' }}
 */
export function parseClaim(claimText) {
  const text = (claimText || '').trim();
  const rest = () => text;
  let body = text;
  let number = null;
  let offset = 0;

  const numMatch = body.match(/^(\d+)\s*[.)]\s*/);
  if (numMatch) {
    number = Number(numMatch[1]);
    offset += numMatch[0].length;
    body = body.slice(numMatch[0].length);
  }

  // dependency: "The ... of claim 5, ..." or "according to any one of claims 1 to 3"
  let dependsOn = null;
  const dep = body.match(/\bclaim\s+(\d+)|\bclaims\s+(\d+)\s+to\s+(\d+)/i);
  if (dep) dependsOn = Number(dep[1] || dep[2]);

  // transitional phrase — three-way: comprising (open) / consisting of (closed) /
  // consisting essentially of (semi-open). Collapsing the last two would hide
  // a real scope difference, so they stay distinct values.
  const transMatch = body.match(/\b(comprising|comprises|consisting\s+essentially\s+of|consisting\s+of)\b/i);
  let transitional = null;
  if (transMatch) {
    const t = transMatch[0];
    transitional = /^compris/i.test(t) ? 'comprising'
      : /^consisting\s+essentially/i.test(t) ? 'consisting-essentially-of'
      : 'consisting';
  }

  // split on semicolons and "wherein"/"whereby" boundaries
  const bounds = [];
  const re = /;|\bwherein\b|\bwhereby\b/gi;
  let m;
  while ((m = re.exec(body)) !== null) bounds.push({ index: m.index, delim: m[0] });
  const segments = [];
  let start = 0;
  for (const b of bounds) {
    // "wherein" attaches to the FOLLOWING clause; semicolon ends the current one
    if (b.delim === ';') {
      segments.push({ start, end: b.index + 1, kind: 'clause' });
      start = b.index + 1;
    } else {
      if (b.index > start) segments.push({ start, end: b.index, kind: 'clause' });
      start = b.index;
    }
  }
  segments.push({ start, end: body.length, kind: 'clause' });

  const clean = segments
    .map((s) => ({ ...s, text: body.slice(s.start, s.end).replace(/^[\s;,]+|[\s;,]+$/g, '').replace(/^(and|or|further)\s+/i, '') }))
    .filter((s) => s.text.length > 0)
    .filter((s) => !/^(and|or|further|and\s+further)$/i.test(s.text));

  if (!clean.length) {
    return {
      number, text, preamble: { text, span: [0, text.length] }, transitional,
      dependsOn, limitations: [], type: dependsOn ? 'dependent' : 'independent',
    };
  }
  // first segment containing the transitional phrase (or first segment) is the preamble
  const preIdx = Math.max(0, clean.findIndex((s) => transitional && s.text.includes(transMatch[0])));
  const preamble = clean[preIdx];
  const lims = clean.slice(transitional ? preIdx + 1 : 1);

  // "...comprising:" — anything after the colon is a limitation, not preamble
  const colonIdx = preamble.text.indexOf(':');
  let headLim = null;
  let preText = preamble.text;
  let preEnd = preamble.end;
  if (colonIdx >= 0 && colonIdx < preamble.text.length - 1) {
    preText = preamble.text.slice(0, colonIdx + 1);
    headLim = preamble.text.slice(colonIdx + 1).replace(/^[\s;,]+|[\s;,]+$/g, '');
    preEnd = preamble.start + colonIdx + 1;
  }
  const limitations = [];
  if (headLim) {
    limitations.push({ id: 'L1', text: headLim, span: [offset + preEnd, offset + preamble.end] });
  }
  lims.forEach((s, i) => limitations.push({
    id: `L${limitations.length + 1}`,
    text: s.text,
    span: [offset + s.start, offset + s.end],
  }));

  return {
    number,
    text: rest(),
    preamble: { text: preText, span: [offset + preamble.start, offset + preEnd] },
    transitional,
    dependsOn,
    limitations,
    type: dependsOn ? 'dependent' : 'independent',
  };
}

/**
 * Parse a multi-claim document (claims separated by newlines starting "N.").
 * @param {string} claimsText
 * @returns {ReturnType<typeof parseClaim>[]}
 */
export function parseClaimSet(claimsText) {
  return (claimsText || '')
    .split(/\n(?=\s*\d+\s*[.)]\s)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseClaim);
}

// ---------------------------------------------------------------------------
// Limitation-by-limitation comparison
// ---------------------------------------------------------------------------

/** Default thresholds (tunable). matched ≥ exactAt, modified ≥ modifiedAt. */
export const DEFAULT_THRESHOLDS = { exactAt: 0.96, modifiedAt: 0.45 };

/**
 * Greedy best-match alignment of two limitation lists (stable, deterministic:
 * pairs sorted by descending similarity, ties broken by (aIdx, bIdx)).
 *
 * @param {Array<{id:string,text:string,span:[number,number]}>} limsA
 * @param {Array<{id:string,text:string,span:[number,number]}>} limsB
 * @param {Object} [thresholds]
 * @returns {{ rows: Array<Object>, counts: Object }}
 */
export function compareLimitations(limsA, limsB, thresholds = {}) {
  const { exactAt, modifiedAt } = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const pairs = [];
  limsA.forEach((a, ai) => {
    limsB.forEach((b, bi) => {
      const sim = similarity(a.text, b.text);
      if (sim > 0) pairs.push({ ai, bi, sim });
    });
  });
  pairs.sort((p, q) => q.sim - p.sim || p.ai - q.ai || p.bi - q.bi);

  const usedA = new Set(), usedB = new Set(), matched = [];
  for (const p of pairs) {
    if (usedA.has(p.ai) || usedB.has(p.bi)) continue;
    usedA.add(p.ai); usedB.add(p.bi);
    matched.push(p);
  }

  const rows = [];
  for (const p of matched) {
    const a = limsA[p.ai], b = limsB[p.bi];
    rows.push({
      relation: p.sim >= exactAt ? 'matched' : 'modified',
      aId: a.id, aText: a.text, aSpan: a.span,
      bId: b.id, bText: b.text, bSpan: b.span,
      similarity: Math.round(p.sim * 1000) / 1000,
      note: p.sim >= exactAt ? 'substantively identical wording' : 'wording changed — review amendment scope',
    });
  }
  limsA.forEach((a, ai) => {
    if (!usedA.has(ai)) {
      rows.push({
        relation: 'removed', aId: a.id, aText: a.text, aSpan: a.span,
        bId: null, bText: null, bSpan: null, similarity: 0,
        note: 'no teaching found in set B — absent, not inferred',
      });
    }
  });
  limsB.forEach((b, bi) => {
    if (!usedB.has(bi)) {
      rows.push({
        relation: 'added', aId: null, aText: null, aSpan: null,
        bId: b.id, bText: b.text, bSpan: b.span, similarity: 0,
        note: 'new limitation in set B — not present in set A',
      });
    }
  });
  // stable order: A-major
  rows.sort((r, s) => (r.aId || 'zz').localeCompare(s.aId || 'zz', undefined, { numeric: true }) ||
                       (r.bId || '').localeCompare(s.bId || '', undefined, { numeric: true }));

  const counts = { matched: 0, modified: 0, removed: 0, added: 0 };
  for (const r of rows) counts[r.relation] += 1;
  return { rows, counts };
}

/** Transitional phrase → plain-phrase + scope reading (three-way, never collapsed). */
export const TRANSITIONAL_SCOPE = {
  'comprising': { phrase: 'comprising', scope: 'open' },
  'consisting': { phrase: 'consisting of', scope: 'closed' },
  'consisting-essentially-of': { phrase: 'consisting essentially of', scope: 'semi-open' },
};

/**
 * Renumber-robust pairing criterion: an A-only claim and a B-only claim are
 * the SAME claim renumbered only when type, dependency and transitional
 * match AND every limitation pairs at ≥ exactAt (conservative on purpose —
 * a real amendment must stay removed+added, not be laundered into
 * "renumbered"). Returns the comparison when it qualifies, else null.
 */
function renumberComparison(a, b, thresholds) {
  if (a.type !== b.type || a.dependsOn !== b.dependsOn || a.transitional !== b.transitional) return null;
  if (!a.limitations.length || !b.limitations.length) {
    // nothing to align (e.g. degenerate one-clause claims) — require byte-identical text
    return a.text === b.text ? { rows: [], counts: { matched: 0, modified: 0, removed: 0, added: 0 } } : null;
  }
  if (a.limitations.length !== b.limitations.length) return null;
  const cmp = compareLimitations(a.limitations, b.limitations, thresholds);
  return cmp.counts.matched === a.limitations.length ? cmp : null;
}

/**
 * Compare two claim sets claim-by-claim (paired by claim number when both
 * have numbers; otherwise by order). Unpaired claims are reported whole —
 * except when an A-only and a B-only claim are limitation-identical, which
 * is reported as `renumbered` rather than a false removed+added pair.
 *
 * @param {string|ReturnType<typeof parseClaim>[]} setA
 * @param {string|ReturnType<typeof parseClaim>[]} setB
 * @param {Object} [thresholds]
 * @returns {{ claims: Array<Object>, totals: Object, noTeachingFound: number }}
 */
export function compareClaimSets(setA, setB, thresholds = {}) {
  const A = typeof setA === 'string' ? parseClaimSet(setA) : setA;
  const B = typeof setB === 'string' ? parseClaimSet(setB) : setB;
  const byNum = (set) => new Map(set.filter((c) => c.number != null).map((c) => [c.number, c]));
  const mapA = byNum(A), mapB = byNum(B);
  const claims = [];
  const totals = { matched: 0, modified: 0, removed: 0, added: 0, renumbered: 0, claimsOnlyInA: 0, claimsOnlyInB: 0 };
  let noTeachingFound = 0;

  const seenB = new Set();
  const unpairedA = [];
  A.forEach((a, i) => {
    const b = a.number != null ? mapB.get(a.number) : B[i] || null;
    if (b) seenB.add(b);
    if (!b) { unpairedA.push(a); return; }
    const cmp = compareLimitations(a.limitations, b.limitations, thresholds);
    noTeachingFound += cmp.rows.filter((r) => r.note.startsWith('no teaching found')).length;
    totals.matched += cmp.counts.matched;
    totals.modified += cmp.counts.modified;
    totals.removed += cmp.counts.removed;
    totals.added += cmp.counts.added;
    claims.push({
      claimNo: a.number,
      aClaim: a.text, bClaim: b.text,
      aDependsOn: a.dependsOn, bDependsOn: b.dependsOn,
      dependencyChanged: a.dependsOn !== b.dependsOn,
      aTransitional: a.transitional, bTransitional: b.transitional,
      transitionalChanged: a.transitional !== b.transitional,
      result: 'compared',
      comparison: cmp,
    });
  });

  // renumber pass: pair A-only with B-only claims that are limitation-identical
  const unpairedB = B.filter((b) => !seenB.has(b));
  for (const a of unpairedA) {
    let hit = -1, cmp = null;
    for (let j = 0; j < unpairedB.length; j++) {
      if (!unpairedB[j]) continue;
      const c = renumberComparison(a, unpairedB[j], thresholds);
      if (c) { hit = j; cmp = c; break; }
    }
    if (hit >= 0) {
      const b = unpairedB[hit];
      unpairedB[hit] = null;
      totals.renumbered += 1;
      totals.matched += cmp.counts.matched;
      totals.modified += cmp.counts.modified;
      totals.removed += cmp.counts.removed;
      totals.added += cmp.counts.added;
      claims.push({
        claimNo: a.number, aClaim: a.text, bClaim: b.text,
        aDependsOn: a.dependsOn, bDependsOn: b.dependsOn,
        dependencyChanged: a.dependsOn !== b.dependsOn,
        aTransitional: a.transitional, bTransitional: b.transitional,
        transitionalChanged: a.transitional !== b.transitional,
        result: 'claim renumbered in set B', renumberedTo: b.number,
        comparison: cmp,
      });
    } else {
      totals.claimsOnlyInA += 1;
      claims.push({
        claimNo: a.number, aClaim: a.text, bClaim: null,
        result: 'claim removed in set B', comparison: null,
      });
    }
  }
  for (const b of unpairedB) {
    if (!b) continue;
    totals.claimsOnlyInB += 1;
    claims.push({ claimNo: b.number, aClaim: null, bClaim: b.text, result: 'claim added in set B', comparison: null });
  }
  return { claims, totals, noTeachingFound };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render a claim-chart markdown table. Every "removed"/no-teaching row is
 * explicit — silence is never allowed to imply a teaching.
 * @param {ReturnType<typeof compareClaimSets>} result
 * @returns {string}
 */
export function toClaimChart(result) {
  const lines = ['# Claim comparison chart', ''];
  for (const c of result.claims) {
    lines.push(`## Claim ${c.claimNo ?? '(unnumbered)'} — ${c.result}${c.renumberedTo ? ` (as claim ${c.renumberedTo})` : ''}`);
    if (c.dependencyChanged) lines.push(`> dependency changed: A→claim ${c.aDependsOn} vs B→claim ${c.bDependsOn}`);
    if (c.transitionalChanged) {
      const aT = TRANSITIONAL_SCOPE[c.aTransitional] || { phrase: c.aTransitional || 'none', scope: 'none' };
      const bT = TRANSITIONAL_SCOPE[c.bTransitional] || { phrase: c.bTransitional || 'none', scope: 'none' };
      lines.push(`> transitional scope changed: A "${aT.phrase}" (${aT.scope}) → B "${bT.phrase}" (${bT.scope}) — claim scope narrowed or shifted; review excluded matter`);
    }
    if (!c.comparison) { lines.push('', c.aClaim || c.bClaim || '', ''); continue; }
    lines.push('',
      '| # | Set A limitation | Relation | Set B limitation | Sim | Note |',
      '|---|-----------------|----------|------------------|-----|------|');
    for (const r of c.comparison.rows) {
      lines.push(`| ${r.aId || '—'} | ${r.aText || '—'} | **${r.relation}** | ${r.bText || '—'} | ${r.similarity || '—'} | ${r.note} |`);
    }
    lines.push('');
  }
  lines.push(`Totals: ${result.totals.matched} matched · ${result.totals.modified} modified · ` +
    `${result.totals.removed} removed · ${result.totals.added} added · ` +
    `${result.noTeachingFound} "no teaching found" rows (never inferred).`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Reference mapping: limitations → verbatim spans in a prior-art reference
// ---------------------------------------------------------------------------

/** Lexical-overlap threshold for a "partial" mapping (share of limitation
 *  tokens found in one reference sentence). Below it → honest `notFound`. */
export const DEFAULT_REFERENCE_THRESHOLDS = { partialAt: 0.5 };

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split text into sentences, each with [start,end) span anchors. */
function sentencesWithSpans(text) {
  const out = [];
  let start = 0, m;
  const re = /\.(?=\s|$)/g;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + 1;
    if (text.slice(start, end).trim()) out.push({ text: text.slice(start, end), span: [start, end] });
    start = end;
  }
  if (start < text.length && text.slice(start).trim()) {
    out.push({ text: text.slice(start), span: [start, text.length] });
  }
  return out;
}

/**
 * Map each limitation of a claim onto a reference text.
 *
 * States are machine-checkable, never gestured:
 * - `verbatim`  — limitation text appears in the reference verbatim
 *                 (whitespace-flexible); refSpan slices to the exact quote.
 * - `partial`   — best reference sentence covers ≥ partialAt of the
 *                 limitation's tokens; flagged as lexical first pass only.
 * - `notFound`  — neither; an honest "no teaching found" row, never "support".
 *
 * @param {string|ReturnType<typeof parseClaim>} claim
 * @param {string} refText
 * @param {Object} [thresholds]
 * @returns {{ rows: Array<Object>, counts: { verbatim:number, partial:number, notFound:number } }}
 */
export function mapLimitationsToReference(claim, refText, thresholds = {}) {
  const { partialAt } = { ...DEFAULT_REFERENCE_THRESHOLDS, ...thresholds };
  const c = typeof claim === 'string' ? parseClaim(claim) : claim;
  const ref = refText || '';
  const sents = sentencesWithSpans(ref).map((s) => ({ ...s, tokens: tokenize(s.text) }));
  const rows = c.limitations.map((lim) => {
    const pattern = escapeRegExp(lim.text.trim()).replace(/\s+/g, '\\s+');
    const vm = ref.match(new RegExp(pattern, 'i'));
    if (vm) {
      return {
        id: lim.id, text: lim.text, span: lim.span,
        state: 'verbatim', quote: vm[0], refSpan: [vm.index, vm.index + vm[0].length],
        note: 'verbatim span — machine-checkable quote; construction still requires attorney review',
      };
    }
    const limTokens = tokenize(lim.text);
    let best = null, bestCov = 0;
    for (const s of sents) {
      if (!limTokens.size) break;
      let hit = 0;
      for (const t of limTokens) if (s.tokens.has(t)) hit += 1;
      const cov = hit / limTokens.size;
      if (cov > bestCov) { bestCov = cov; best = s; }
    }
    if (best && bestCov >= partialAt) {
      return {
        id: lim.id, text: lim.text, span: lim.span,
        state: 'partial', quote: best.text, refSpan: best.span,
        tokenCoverage: Math.round(bestCov * 1000) / 1000,
        note: 'first pass — lexical overlap only, not construction; quote is the best-matching sentence',
      };
    }
    return {
      id: lim.id, text: lim.text, span: lim.span,
      state: 'notFound', quote: null, refSpan: null,
      note: 'no teaching found in reference — not inferred',
    };
  });
  const counts = { verbatim: 0, partial: 0, notFound: 0 };
  for (const r of rows) counts[r.state] += 1;
  return { rows, counts };
}

// ---------------------------------------------------------------------------
// Construction-risk flags (deterministic, always-on)
// ---------------------------------------------------------------------------

/** Risk patterns: [kind, sourceRegExp, note]. Never construes — only flags. */
const CONSTRUCTION_RISK_PATTERNS = [
  ['means-plus-function', /\bmeans\s+for\b/gi,
    'possible means-plus-function (35 U.S.C. §112(f)) [verify] — means-for language invokes functional claiming'],
  ['functional-limitation', /\b(?:configured|adapted|operable)\s+to\b/gi,
    'functional language ("configured/adapted/operable to") — breadth depends on the specification'],
  ['approximate-term', /\b(?:substantially|approximately|about)\b/gi,
    'approximate term — breadth disputed; not a definite boundary on its face'],
];

/**
 * Flag construction-risk phrases in a claim with span anchors.
 * Deterministic regex screening — this never construes the claim.
 * @param {string|ReturnType<typeof parseClaim>} claim
 * @returns {Array<{ kind:string, text:string, span:[number,number], note:string }>}
 */
export function flagConstructionRisks(claim) {
  const c = typeof claim === 'string' ? parseClaim(claim) : claim;
  const flags = [];
  for (const [kind, re, note] of CONSTRUCTION_RISK_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(c.text)) !== null) {
      flags.push({ kind, text: m[0], span: [m.index, m.index + m[0].length], note });
    }
  }
  flags.sort((a, b) => a.span[0] - b.span[0] || a.kind.localeCompare(b.kind));
  return flags;
}

// ---------------------------------------------------------------------------
// CSV export with spreadsheet formula-injection neutralization
// ---------------------------------------------------------------------------

/**
 * CSV cell: apostrophe-prefix any cell that starts with = + - @ or contains
 * tab/CR/LF (formula-injection neutralization), then quote when needed.
 * Normal text is never prefixed and only quoted for commas/quotes.
 */
function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  let prefixed = false;
  if (/^[=+\-@\t\r]/.test(s) || /[\t\r\n]/.test(s)) { s = "'" + s; prefixed = true; }
  if (prefixed || /[",]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Render the comparison result as CSV (one row per chart row; whole-claim
 * rows for claims without a limitation comparison).
 * @param {ReturnType<typeof compareClaimSets>} result
 * @returns {string}
 */
export function toCSV(result) {
  const lines = ['claimNo,aId,aText,relation,bId,bText,similarity,note'];
  for (const c of result.claims) {
    if (c.comparison) {
      for (const r of c.comparison.rows) {
        lines.push([c.claimNo, r.aId, r.aText, r.relation, r.bId, r.bText, r.similarity, r.note].map(csvCell).join(','));
      }
    } else {
      // whole-claim row: the claim text itself goes in the aText/bText columns
      lines.push([c.claimNo, null, c.aClaim ?? '',
        c.result, null, c.bClaim ?? '', '', ''].map(csvCell).join(','));
    }
  }
  return lines.join('\n');
}

/**
 * Companion `_sources` CSV: one row per chart row carrying only the span
 * anchors, so every CSV cell can be verified against the source texts.
 * @param {ReturnType<typeof compareClaimSets>} result
 * @returns {string}
 */
export function toSourcesCSV(result) {
  const lines = ['claimNo,aId,aSpanStart,aSpanEnd,bId,bSpanStart,bSpanEnd'];
  for (const c of result.claims) {
    if (c.comparison) {
      for (const r of c.comparison.rows) {
        lines.push([c.claimNo, r.aId, r.aSpan ? r.aSpan[0] : null, r.aSpan ? r.aSpan[1] : null,
          r.bId, r.bSpan ? r.bSpan[0] : null, r.bSpan ? r.bSpan[1] : null].map(csvCell).join(','));
      }
    } else {
      lines.push([c.claimNo, '', '', '', '', '', ''].map(csvCell).join(','));
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Claim × reference coverage matrix
// ---------------------------------------------------------------------------

/**
 * Build a claim-by-reference coverage matrix: which references (if any)
 * read on every limitation of each claim.
 *
 * - `anticipation-candidate` — ONE reference covers all limitations (first
 *   pass only; anticipation is a legal conclusion, never emitted here).
 * - `combination` — no single reference covers all, but references jointly
 *   do; combinationRefs lists a greedy first-fit cover in input order
 *   (not necessarily the smallest such set).
 * - `gaps` — limitations no reference covers at all, listed honestly.
 *
 * Coverage means `verbatim`, or `partial` whose token coverage is complete
 * (every limitation token present in one sentence) — conservative on purpose,
 * because "anticipation-candidate" is a legally loaded label. Partial rows
 * with weaker overlap stay visible in the per-ref counts but do NOT count as
 * coverage. Lexical first pass, NOT a construction or support opinion.
 *
 * @param {string|ReturnType<typeof parseClaim>[]} claims
 * @param {Array<{id:string, text:string}>} refs
 * @param {Object} [thresholds]
 * @returns {{ claims: Array<Object>, totals: Object }}
 */
export function buildClaimReferenceMatrix(claims, refs, thresholds = {}) {
  const set = typeof claims === 'string' ? parseClaimSet(claims) : claims;
  const out = { claims: [], totals: { claims: 0, anticipationCandidates: 0, combination: 0, gaps: 0 } };
  for (const c of set) {
    const maps = (refs || []).map((r) => {
      const { rows, counts } = mapLimitationsToReference(c, r.text, thresholds);
      const coveredIds = rows
        .filter((x) => x.state === 'verbatim' || (x.state === 'partial' && x.tokenCoverage === 1))
        .map((x) => x.id);
      return { id: r.id, rows, counts, coveredIds };
    });
    const allIds = c.limitations.map((l) => l.id);
    const refSummary = maps.map((m) => ({
      id: m.id, covered: m.coveredIds.length,
      verbatim: m.counts.verbatim, partial: m.counts.partial, notFound: m.counts.notFound,
    }));
    const single = maps.find((m) => m.coveredIds.length === allIds.length && allIds.length > 0);
    const union = new Set();
    for (const m of maps) for (const id of m.coveredIds) union.add(id);
    const uncovered = allIds.filter((id) => !union.has(id));

    let coverage, combinationRefs = null;
    if (single) {
      coverage = 'anticipation-candidate';
      out.totals.anticipationCandidates += 1;
    } else if (allIds.length > 0 && uncovered.length === 0) {
      coverage = 'combination';
      const covered = new Set();
      const chosen = [];
      for (const m of maps) {
        let added = false;
        for (const id of m.coveredIds) if (!covered.has(id)) { covered.add(id); added = true; }
        if (added) chosen.push(m.id);
        if (covered.size === allIds.length) break;
      }
      combinationRefs = chosen;
      out.totals.combination += 1;
    } else {
      coverage = 'gaps';
      out.totals.gaps += 1;
    }
    out.claims.push({ claimNo: c.number, coverage, refs: refSummary, uncoveredLimitations: uncovered, combinationRefs });
    out.totals.claims += 1;
  }
  return out;
}
