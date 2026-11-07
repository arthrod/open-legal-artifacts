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
 *             transitional: 'comprising'|'consisting'|null, dependsOn: number|null,
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

  // transitional phrase
  const transMatch = body.match(/\b(comprising|comprises|consisting\s+of|consisting\s+essentially\s+of)\b/i);
  const transitional = transMatch
    ? /^consisting/i.test(transMatch[1]) ? 'consisting' : 'comprising'
    : null;

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

/**
 * Compare two claim sets claim-by-claim (paired by claim number when both
 * have numbers; otherwise by order). Unpaired claims are reported whole.
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
  const totals = { matched: 0, modified: 0, removed: 0, added: 0, claimsOnlyInA: 0, claimsOnlyInB: 0 };
  let noTeachingFound = 0;

  const seenB = new Set();
  A.forEach((a, i) => {
    const b = a.number != null ? mapB.get(a.number) : B[i] || null;
    if (b) seenB.add(b);
    if (!b) {
      totals.claimsOnlyInA += 1;
      claims.push({
        claimNo: a.number, aClaim: a.text, bClaim: null,
        result: 'claim removed in set B', comparison: null,
      });
      return;
    }
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
      result: 'compared',
      comparison: cmp,
    });
  });
  for (const b of B) {
    if (seenB.has(b)) continue;
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
    lines.push(`## Claim ${c.claimNo ?? '(unnumbered)'} — ${c.result}`);
    if (c.dependencyChanged) lines.push(`> dependency changed: A→claim ${c.aDependsOn} vs B→claim ${c.bDependsOn}`);
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
