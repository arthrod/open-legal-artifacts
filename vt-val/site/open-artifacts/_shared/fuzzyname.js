/**
 * fuzzyname.js — unicode-aware person/party-name matching (dependency-free ESM).
 *
 *   normalizeName(s)     — NFKC + casefold + diacritic strip; keeps \p{L}\p{N}
 *                          tokens in any script, drops punctuation/emoji and
 *                          corporate suffix tokens (Inc., LLC, …).
 *   similarity(a, b)     — deterministic score in [0,1]: max(whole-string
 *                          edit distance, token alignment with initial
 *                          expansion + nickname map, compact CJK form,
 *                          containment bonus).
 *   similarityReason(a,b)— the same score plus a matchedVia trace explaining
 *                          exactly how each token matched (or why it didn't).
 *
 * Canonical source: open-artifacts/_shared/ (see README.md for vendoring).
 * Zero console side effects. All example names fictional.
 */

/** Small nickname → canonical given-name table. Data only; extend per domain. */
const NICKNAMES = {
  al: 'albert', alex: 'alexander', andy: 'andrew', drew: 'andrew',
  ben: 'benjamin', beth: 'elizabeth', liz: 'elizabeth', lizzie: 'elizabeth',
  betsy: 'elizabeth', bob: 'robert', bobby: 'robert', rob: 'robert',
  billy: 'william', bill: 'william', will: 'william', charlie: 'charles',
  chuck: 'charles', dave: 'david', davey: 'david', ed: 'edward',
  eddie: 'edward', fred: 'frederick', gene: 'eugene', greg: 'gregory',
  hank: 'henry', harry: 'henry', jack: 'john', johnny: 'john', jim: 'james',
  jimmy: 'james', joe: 'joseph', joey: 'joseph', kate: 'katherine',
  katie: 'katherine', kathy: 'katherine', ken: 'kenneth', kenny: 'kenneth',
  larry: 'lawrence', maggie: 'margaret', meg: 'margaret', peggy: 'margaret',
  mike: 'michael', mickey: 'michael', rich: 'richard', rick: 'richard',
  dick: 'richard', stan: 'stanley', steve: 'steven', sue: 'susan',
  sunny: 'susan', ted: 'theodore', theo: 'theodore', tom: 'thomas',
  tommy: 'thomas', tony: 'anthony', vicky: 'victoria',
};

const canon = (t) => NICKNAMES[t] ?? t;

/** Legal-entity suffix tokens dropped before comparison (fleet convention:
 *  intake-queue normalizeName). Person-name given names are never dropped. */
const CORP_SUFFIXES = new Set([
  'inc', 'incorporated', 'llc', 'llp', 'ltd', 'limited', 'co', 'corp',
  'corporation', 'company', 'plc', 'pc', 'pa',
]);

/**
 * Normalize a name for comparison: NFKC compatibility fold, casefold,
 * strip combining marks (Latin diacritics), drop everything that is not
 * a letter, number, or whitespace, drop corporate suffix tokens, collapse
 * whitespace. Non-Latin scripts (CJK, Cyrillic, Greek…) survive intact.
 *
 * @param {unknown} s
 * @returns {string}
 */
export function normalizeName(s) {
  if (s == null) return '';
  return String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ß/g, 'ss') // casefold edge NFKC+toLowerCase misses
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // combining marks (é → e); harmless for CJK
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t && !CORP_SUFFIXES.has(t))
    .join(' ');
}

const tokens = (s) => normalizeName(s).split(' ').filter(Boolean);

/** Levenshtein edit distance (iterative DP). */
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
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

const ratio = (a, b) => {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
};

/** Score one token pair; the trace kind names HOW they matched. */
function tokenScore(a, b) {
  if (a === b) return { score: 1, kind: 'exact' };
  // Initial expansion: single-letter token matching a longer token's first
  // letter ("j" ≈ "john") — conflicts keep initials but make them comparable.
  if (a.length === 1 && b.length > 1 && b[0] === a[0]) return { score: 0.9, kind: 'initial' };
  if (b.length === 1 && a.length > 1 && a[0] === b[0]) return { score: 0.9, kind: 'initial' };
  if (canon(a) === canon(b)) return { score: 0.95, kind: 'nickname' };
  if (Math.min(a.length, b.length) >= 3) {
    const r = ratio(a, b);
    if (r >= 0.75) return { score: r, kind: 'edit' };
  }
  return { score: 0, kind: 'none' };
}

/**
 * Deterministic name similarity in [0,1]. Takes the best of:
 *  - whole normalized-string edit ratio,
 *  - greedy best-pair token alignment (exact > nickname > initial > edit),
 *  - compact (whitespace-removed) comparison so CJK "田中 太郎" ≡ "田中太郎".
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number}
 */
export function similarity(a, b) {
  return similarityReason(a, b).score;
}

/**
 * Same score as similarity(), plus the matchedVia trace: one entry per
 * aligned token pair {kind, a, b, score} (kinds: exact | nickname |
 * initial | edit), empty when nothing matched.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {{score: number, matchedVia: {kind: string, a: string, b: string, score: number}[]}}
 */
export function similarityReason(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return { score: 0, matchedVia: [] };

  // Character-level ratios overvalue single-char swaps on short strings
  // ("j iwata" vs "k iwata" would score 0.86), so they are trusted only for
  // longer strings; exact equality is always trusted at any length.
  const whole = na === nb ? 1 : Math.max(na.length, nb.length) >= 12 ? ratio(na, nb) : 0;
  const ca = na.replace(/ /g, '');
  const cb = nb.replace(/ /g, '');
  const compact = ca === cb ? 1 : Math.max(ca.length, cb.length) >= 10 ? ratio(ca, cb) : 0;

  // Token alignment: score every pair, greedily take best (deterministic:
  // ties broken by (−score, ai, bi)).
  const A = tokens(a);
  const B = tokens(b);
  const pairs = [];
  for (let ai = 0; ai < A.length; ai++) {
    for (let bi = 0; bi < B.length; bi++) {
      const t = tokenScore(A[ai], B[bi]);
      if (t.score > 0) pairs.push({ score: t.score, kind: t.kind, ai, bi, a: A[ai], b: B[bi] });
    }
  }
  pairs.sort((p, q) => q.score - p.score || p.ai - q.ai || p.bi - q.bi);
  const usedA = new Set();
  const usedB = new Set();
  const matchedVia = [];
  let sum = 0;
  for (const p of pairs) {
    if (usedA.has(p.ai) || usedB.has(p.bi)) continue;
    usedA.add(p.ai);
    usedB.add(p.bi);
    sum += p.score;
    matchedVia.push({ kind: p.kind, a: p.a, b: p.b, score: p.score });
  }
  const align = A.length && B.length ? sum / Math.max(A.length, B.length) : 0;

  // Containment: every token of the shorter name matched, the longer name
  // just adds tokens (suffix drift like "… Solar" vs "… Solar Group").
  // Capped at 0.8 — containment alone is weaker evidence than a full match.
  const minLen = Math.min(A.length, B.length);
  const minSideMatched = (A.length <= B.length ? usedA : usedB).size;
  const containment = minLen ? (minSideMatched / minLen) * 0.8 : 0;

  return { score: Math.max(whole, compact, align, containment), matchedVia };
}
