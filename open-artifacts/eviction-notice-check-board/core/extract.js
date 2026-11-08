/**
 * eviction-notice-check-board — paste-the-notice intake bridge.
 *
 * Deterministic, LLM-free extractor: reads the raw text of a notice and
 * DRAFTS attestations for a human to confirm. Extraction ≠ attestation —
 * every drafted field carries the verbatim quote it came from, fields not
 * found are null/absent (never guessed, never present:false), and nothing
 * is mapped onto a ruleset enum by inference.
 *
 * All example text is fictional; matchers are deliberately conservative.
 */

const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
};

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Gazetteer: state name literally on the notice → bundled ruleset key.
// The extractor never maps a state to a rule it cannot see written down.
const STATE_GAZETTEER = [
  [/california/i, 'california-example'],
  [/texas/i, 'texas-example'],
  [/new york/i, 'new-york-example'],
  [/washington/i, 'washington-example'],
  [/ohio/i, 'ohio-example'],
  [/florida/i, 'florida-example'],
  [/georgia/i, 'georgia-example'],
  [/arizona/i, 'arizona-example'],
  [/illinois/i, 'illinois-example'],
  [/oregon/i, 'oregon-example'],
];

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Draft facts from notice text.
 * @param {string} text — the notice as pasted text
 * @returns {Object} draft with every field nullable; contentHints only ever
 *   contain {present: true, quote} entries (absence of a match is NOT
 *   evidence of absence — the human decides).
 */
export function extractDraft(text) {
  const s = typeof text === 'string' ? text : '';
  const draft = {
    statedPeriodDays: null,
    statedPeriodDaysQuote: null,
    amounts: [],
    dates: [],
    contentHints: {},
    jurisdictionHint: null,
    serviceMethod: null,
    serviceMethodDescription: null,
  };
  if (!s.trim()) return draft;

  // --- stated notice period: "three (3) day" / "3-day" / "fourteen (14) days" ---
  const digitPeriod = s.match(/(\d+)\s*(?:\(\s*\d+\s*\)\s*)?-?\s*days?/i);
  if (digitPeriod) {
    draft.statedPeriodDays = Number(digitPeriod[1]);
    draft.statedPeriodDaysQuote = digitPeriod[0];
  } else {
    const wordPeriod = s.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen)\s*(?:\(\s*\d+\s*\)\s*)?-?\s*days?/i);
    if (wordPeriod) {
      draft.statedPeriodDays = WORD_NUMBERS[wordPeriod[1].toLowerCase()];
      draft.statedPeriodDaysQuote = wordPeriod[0];
    }
  }
  if (draft.statedPeriodDays === 0) {
    draft.statedPeriodDays = null;
    draft.statedPeriodDaysQuote = null;
  }

  // --- amounts: verbatim $ figures ---
  for (const m of s.matchAll(/\$\s?\d[\d,]*(?:\.\d{2})?/g)) {
    draft.amounts.push({ amount: m[0], quote: m[0] });
  }

  // --- dates: ISO, "Month DD, YYYY", M/D/YYYY — raw kept verbatim ---
  for (const m of s.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {
    draft.dates.push({ raw: m[0], iso: m[0] });
  }
  for (const m of s.matchAll(/\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo && Number(m[2]) >= 1 && Number(m[2]) <= 31) {
      draft.dates.push({ raw: m[0], iso: `${m[3]}-${pad2(mo)}-${pad2(Number(m[2]))}` });
    }
  }
  for (const m of s.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
    if (Number(m[1]) >= 1 && Number(m[1]) <= 12) {
      draft.dates.push({ raw: m[0], iso: `${m[3]}-${pad2(Number(m[1]))}-${pad2(Number(m[2]))}` });
    }
  }

  // --- content hints: only PRESENT with a verbatim quote; no present:false ever ---
  const hint = (id, present, quote) => { draft.contentHints[id] = { present, quote }; };
  if (draft.amounts.length > 0 && /\brent\b|\bdue\b/i.test(s)) {
    hint('amount-due', true, draft.amounts[0].quote);
  }
  const payLine = s.split('\n').map((l) => l.trim())
    .find((l) => /\b(?:pay to|payable to|paid (?:to|at)|remit to|payment to|payments? (?:to|at|may be made)|online at|in person)\b/i.test(l));
  if (payLine) {
    hint('payment-instructions', true, payLine);
  }
  const vacate = s.match(/\b(?:surrender|vacate|deliver up)\b[^.\n]{0,120}premises[^.\n]{0,60}/i)
    ?? s.match(/\bpremises\b[^.\n]{0,120}\b(?:surrender|vacate)\b[^.\n]{0,60}/i)
    ?? s.match(/\bmust\s+(?:surrender|vacate)\b[^.\n]{0,120}/i);
  if (vacate) hint('vacate-demand', true, vacate[0].trim());

  // --- jurisdiction: only a state name literally written on the notice ---
  for (const [re, key] of STATE_GAZETTEER) {
    if (re.test(s)) { draft.jurisdictionHint = key; break; }
  }

  // --- service: verbatim description only; NEVER mapped to a ruleset enum ---
  const svc = s.match(/\b(?:posted (?:on|and|or) [^.]{0,80}|personally (?:delivered|served)[^.]{0,80}|hand[- ]delivered[^.]{0,80}|certified mail[^.]{0,80}|first[- ]class mail[^.]{0,80}|mail(?:ed)? to[^.]{0,80})\./i);
  if (svc) draft.serviceMethodDescription = svc[0].trim();

  return draft;
}
