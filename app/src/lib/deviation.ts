// playbook-deviation-board deterministic core.
// Tri-state classification of a clause against a versioned playbook.

export type Classification = "standard" | "fallback" | "deviation";

export interface PlaybookRule {
  id: string;
  topic: string;
  keywords: string[]; // topic signals used to pick the rule
  standard: string[]; // preferred language -> standard (green)
  fallback: string[]; // acceptable fallback -> fallback (yellow)
  avoid: string[]; // unacceptable -> deviation (red)
}

export interface Playbook {
  version: string;
  rules: PlaybookRule[];
}

export interface DeviationFinding {
  ruleId: string;
  topic: string;
  classification: Classification;
  matched: string; // the playbook phrase or "no term matched"
  clauseQuote: string; // the clause span that triggered the match
  reason: string;
}

const longest = (xs: string[]): string => xs.reduce((a, b) => (b.length >= a.length ? b : a));

const norm = (s: string): string =>
  s
    .normalize("NFC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .toLowerCase();

function findRule(playbook: Playbook, clause: string): PlaybookRule | null {
  const n = norm(clause);
  let best: { rule: PlaybookRule; hits: number } | null = null;
  for (const rule of playbook.rules) {
    const hits = rule.keywords.filter((k) => n.includes(norm(k))).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { rule, hits };
  }
  return best?.rule ?? null;
}

/** Classify one clause against the playbook. Deterministic, fail-closed. */
export function classifyClause(playbook: Playbook, clause: string): DeviationFinding {
  const rule = findRule(playbook, clause);
  if (!rule) {
    return {
      ruleId: "—",
      topic: "unmapped",
      classification: "deviation",
      matched: "no playbook term matched",
      clauseQuote: clause.trim().slice(0, 160),
      reason:
        "No playbook rule matches this clause's topic — routed for human review rather than guessed.",
    };
  }
  const n = norm(clause);
  const hit = (phrases: string[]): string[] =>
    phrases.filter((p) => n.includes(norm(p)));

  // Longest matching phrase wins; avoid always escalates, and on a length
  // tie the more conservative category wins (fallback > standard). Fail-closed.
  const avoidHits = hit(rule.avoid);
  if (avoidHits.length > 0) {
    const phrase = longest(avoidHits);
    return {
      ruleId: rule.id,
      topic: rule.topic,
      classification: "deviation",
      matched: phrase,
      clauseQuote: clause.trim().slice(0, 160),
      reason: `Clause contains language the playbook marks AVOID ("${phrase}"). Escalate to the approver.`,
    };
  }
  const stdHits = hit(rule.standard);
  const fbHits = hit(rule.fallback);
  const candidates: { cls: Classification; phrase: string; order: number }[] = [
    ...stdHits.map((p) => ({ cls: "standard" as Classification, phrase: p, order: 1 })),
    ...fbHits.map((p) => ({ cls: "fallback" as Classification, phrase: p, order: 2 })),
  ];
  if (candidates.length > 0) {
    const win = candidates.reduce((a, b) =>
      b.phrase.length > a.phrase.length ||
      (b.phrase.length === a.phrase.length && b.order > a.order)
        ? b
        : a,
    );
    return {
      ruleId: rule.id,
      topic: rule.topic,
      classification: win.cls,
      matched: win.phrase,
      clauseQuote: clause.trim().slice(0, 160),
      reason:
        win.cls === "standard"
          ? `Clause contains playbook-preferred language ("${win.phrase}").`
          : `Clause matches a playbook FALLBACK ("${win.phrase}"). Acceptable, but log it.`,
    };
  }
  return {
    ruleId: rule.id,
    topic: rule.topic,
    classification: "deviation",
    matched: "no term matched",
    clauseQuote: clause.trim().slice(0, 160),
    reason: `Topic matched (${rule.topic}) but no standard/fallback term present — treated as a deviation, fail-closed.`,
  };
}

export const samplePlaybook: Playbook = {
  version: "2026-11-07.1",
  rules: [
    {
      id: "lol-1",
      topic: "limitation-of-liability",
      keywords: ["limitation of liability", "liability", "liable", "damages"],
      standard: [
        "liability shall not exceed the fees paid",
        "aggregate liability shall not exceed the fees paid",
      ],
      fallback: ["twice the fees paid", "two times the fees paid"],
      avoid: ["unlimited liability", "consequential damages howsoever arising"],
    },
    {
      id: "governing-law-1",
      topic: "governing-law",
      keywords: ["governing law", "governed by", "jurisdiction"],
      standard: ["governed by the laws of the State of New York"],
      fallback: ["governed by the laws of Delaware"],
      avoid: ["governed by the laws of any jurisdiction outside the United States"],
    },
  ],
};
