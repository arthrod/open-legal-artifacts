/**
 * Urgency + plain-language date signals for /api/triage — logic vendored
 * VERBATIM from open-artifacts/access-to-justice-front-door/core/core.js
 * (assessUrgency, extractDates) so the AI route fills the same meta fields
 * the deterministic core fills. Info-only: no interpretation, no deadline
 * math. Keep in sync with the core.
 */

/** Immediate-safety phrases → emergency (word-boundary match, case-insensitive). */
const EMERGENCY_PHRASES = [
  "immediate danger", "in danger", "emergency", "unsafe", "hit me", "beats me",
  "threatening to kill", "strangled", "choked me", "afraid for my life", "scared for my life",
];

/** Time-pressure phrases → urgent (word-boundary match, case-insensitive). */
const URGENT_PHRASES = [
  "court date", "deadline", "hearing", "tonight", "tomorrow", "right now",
  "asap", "this week", "next week", "by friday",
];

export function assessUrgency(text: string): "emergency" | "urgent" | "routine" {
  // Strip disability-sense hearing phrases first so 'hearing' only signals a
  // court hearing ('hard of hearing' must not fire).
  const lower = String(text).toLowerCase()
    .replace(/hard of hearing|hearing aids?|hearing impaired|hearing loss/g, " ");
  const has = (phrases: string[]) => phrases.some((p) => new RegExp(`\\b${p}\\b`).test(lower));
  if (has(EMERGENCY_PHRASES)) return "emergency";
  if (has(URGENT_PHRASES)) return "urgent";
  return "routine";
}

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_PATTERNS = [
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "gi"), // March 3
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b`, "gi"),      // 3 March
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,                                    // 3/15, 3/15/2026
];

/** Capture plain-language dates, info-only, order of appearance, deduped. */
export function extractDates(text: string): string[] {
  const found: Array<{ raw: string; index: number }> = [];
  for (const re of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(String(text ?? ""))) !== null) found.push({ raw: m[0], index: m.index });
  }
  const seen = new Set();
  return found
    .sort((a, b) => a.index - b.index)
    .filter((d) => (seen.has(d.raw) ? false : seen.add(d.raw)))
    .map((d) => d.raw);
}
