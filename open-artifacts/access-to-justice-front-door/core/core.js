/**
 * access-to-justice-front-door core — plain-language triage:
 *   - classifies a person's problem description against an issue taxonomy
 *     with a deterministic keyword/rule matcher
 *   - confidence-gated: below threshold (or no match) the matter is
 *     ESCALATED TO A HUMAN instead of guessed
 *   - referral mapping to legal-aid categories
 *
 * OUTPUT IS REFERRAL INFORMATION ONLY. The core never produces legal
 * advice, strategy, or predicted outcomes: every user-facing string in
 * the response is copied verbatim from the referral data. This is
 * enforced by construction and pinned by tests.
 *
 * NO LLM in the classifier; the taxonomy and referral map are editable
 * rules-as-data. An optional LLM pass (spec.md) may *pre-normalize*
 * spelling, never classify.
 */

// ------------------------------------------------------------- taxonomy

/**
 * Issue taxonomy + referral map (editable data).
 * Keywords are matched case-insensitively; single words use word
 * boundaries so "rent" does not fire inside "present".
 */
export const TAXONOMY = {
  'housing-eviction': {
    label: 'Eviction / loss of housing',
    keywords: [
      { k: 'evict', w: 3 }, { k: 'eviction', w: 3 }, { k: 'notice to quit', w: 3 },
      { k: 'landlord', w: 2 }, { k: 'court papers', w: 2 }, { k: 'behind on rent', w: 3 }, { k: 'lockout', w: 3 },
    ],
    referral: {
      legalAidCategory: 'legal-aid-housing',
      serviceDescription: 'Eviction defense and housing stability help through your local legal aid housing unit.',
      whereToGo: 'Your nearest legal aid office or court self-help center; bring any court papers you received.',
    },
  },
  'housing-conditions': {
    label: 'Repairs / unhealthy housing conditions',
    keywords: [
      { k: 'mold', w: 2 }, { k: 'no heat', w: 3 }, { k: 'repairs', w: 2 }, { k: 'infestation', w: 2 },
      { k: 'habitability', w: 3 }, { k: 'slumlord', w: 2 },
    ],
    referral: {
      legalAidCategory: 'legal-aid-housing',
      serviceDescription: 'Housing conditions enforcement help through your local legal aid housing unit.',
      whereToGo: 'Your nearest legal aid office; bring photos, repair requests, and correspondence with the landlord.',
    },
  },
  'benefits-denial': {
    label: 'Public benefits denied or cut off',
    keywords: [
      { k: 'food stamps', w: 3 }, { k: 'snap', w: 3 }, { k: 'benefits', w: 2 }, { k: 'denied', w: 2 },
      { k: 'medicaid', w: 3 }, { k: 'welfare', w: 2 }, { k: 'overpayment', w: 2 },
    ],
    referral: {
      legalAidCategory: 'legal-aid-benefits',
      serviceDescription: 'Benefits appeals help (fair hearings) through your local legal aid public benefits unit.',
      whereToGo: 'Your nearest legal aid office; bring the denial or overpayment notice and any deadlines listed on it.',
    },
  },
  'family-custody': {
    label: 'Custody / visitation / child support',
    keywords: [
      { k: 'custody', w: 3 }, { k: 'visitation', w: 3 }, { k: 'child support', w: 3 },
      { k: 'my kids', w: 2 }, { k: 'guardianship', w: 2 },
    ],
    referral: {
      legalAidCategory: 'legal-aid-family',
      serviceDescription: 'Family law help (custody, visitation, support) through your local legal aid family unit.',
      whereToGo: 'Your nearest legal aid office or family court self-help center; bring existing court orders.',
    },
  },
  'domestic-violence': {
    label: 'Domestic violence / safety',
    keywords: [
      { k: 'abuse', w: 3 }, { k: 'protective order', w: 3 }, { k: 'restraining order', w: 3 },
      { k: 'unsafe at home', w: 3 }, { k: 'hit me', w: 3 }, { k: 'threatening', w: 2 },
    ],
    referral: {
      legalAidCategory: 'legal-aid-dv',
      serviceDescription: 'Safety planning and protective-order help through a domestic violence advocacy program.',
      whereToGo: 'A DV advocacy hotline or legal aid DV unit; if you are in immediate danger call emergency services first.',
    },
  },
  'consumer-debt': {
    label: 'Debt collection / credit',
    keywords: [
      { k: 'debt collector', w: 3 }, { k: 'sued for', w: 2 }, { k: 'collection', w: 2 },
      { k: 'credit report', w: 2 }, { k: 'garnish', w: 3 }, { k: 'wage garnishment', w: 3 },
    ],
    referral: {
      legalAidCategory: 'legal-aid-consumer',
      serviceDescription: 'Consumer debt defense help through your local legal aid consumer unit.',
      whereToGo: 'Your nearest legal aid office; bring the collection letters or lawsuit papers.',
    },
  },
  'employment-wage': {
    label: 'Wage theft / job problems',
    keywords: [
      { k: 'not paid', w: 3 }, { k: 'wages', w: 2 }, { k: 'overtime', w: 2 }, { k: 'fired', w: 2 },
      { k: 'unemployment', w: 2 }, { k: 'paycheck', w: 2 },
    ],
    referral: {
      legalAidCategory: 'legal-aid-employment',
      serviceDescription: 'Wage claim and employment help through your local legal aid workers’ rights unit.',
      whereToGo: 'Your nearest legal aid office; bring pay stubs, schedules, and any termination notice.',
    },
  },
  'record-clearance': {
    label: 'Record sealing / expungement',
    keywords: [
      { k: 'expunge', w: 3 }, { k: 'criminal record', w: 3 }, { k: 'seal', w: 2 }, { k: 'background check', w: 2 },
    ],
    referral: {
      legalAidCategory: 'legal-aid-record-clearance',
      serviceDescription: 'Record sealing/expungement screening through a legal aid reentry clinic.',
      'whereToGo': 'Your nearest legal aid reentry clinic; bring your RAP sheet if you have one.',
    },
  },
};

export const DISCLAIMER =
  'This tool provides referral information only. It does not provide legal advice, does not evaluate the merits of any claim, and is not a substitute for a licensed attorney.';

const ESCALATE_MESSAGE =
  'We could not confidently classify this description. A staff member will review it and follow up — no automated categorization was applied.';

// ------------------------------------------------------------- matcher

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Deterministic keyword matcher: returns per-issue matched keywords + raw score. */
export function matchKeywords(text, taxonomy) {
  const lower = String(text).toLowerCase();
  const out = {};
  for (const [issue, def] of Object.entries(taxonomy)) {
    const hits = [];
    for (const { k, w } of def.keywords) {
      const pattern = /\s/.test(k)
        ? escapeRe(k)                          // phrases: substring match
        : `\\b${escapeRe(k)}\\b`;              // single words: whole word only
      if (new RegExp(pattern, 'i').test(lower)) hits.push({ keyword: k, weight: w });
    }
    if (hits.length) out[issue] = { hits, score: hits.reduce((s, h) => s + h.weight, 0) };
  }
  return out;
}

/**
 * Triage a plain-language problem description.
 *
 * @param {string} text — the person's own words
 * @param {Object} [opts] — { taxonomy?, minConfidence? (default 0.4), multiIssueGap? (default 0.15) }
 * @returns {Object} triage result — referral info only, never advice
 */
export function triage(text, opts = {}) {
  const taxonomy = opts.taxonomy ?? TAXONOMY;
  const minConfidence = opts.minConfidence ?? 0.4;
  const multiIssueGap = opts.multiIssueGap ?? 0.15;

  const matches = matchKeywords(text ?? '', taxonomy);
  const total = Object.values(matches).reduce((s, m) => s + m.score, 0);
  const ranked = Object.entries(matches)
    .map(([issue, m]) => ({ issue, score: m.score, confidence: total ? Math.round((m.score / total) * 1000) / 1000 : 0, matchedKeywords: m.hits.map((h) => h.keyword) }))
    .sort((a, b) => b.score - a.score || (a.issue < b.issue ? -1 : 1));

  if (ranked.length === 0) {
    return { status: 'escalate', reason: 'no-keyword-match', escalate: ESCALATE_MESSAGE, disclaimer: DISCLAIMER, candidates: [] };
  }

  const top = ranked[0];
  if (top.confidence < minConfidence) {
    return {
      status: 'escalate', reason: 'low-confidence',
      escalate: ESCALATE_MESSAGE, disclaimer: DISCLAIMER,
      candidates: ranked.map((r) => ({ issue: r.issue, confidence: r.confidence })),
    };
  }

  const multi = ranked.length > 1 && top.confidence - ranked[1].confidence < multiIssueGap;
  const served = multi ? [top, ranked[1]] : [top];

  return {
    status: 'classified',
    primaryIssue: top.issue,
    primaryLabel: taxonomy[top.issue].label,
    confidence: top.confidence,
    multiIssue: multi,
    matchedKeywords: top.matchedKeywords,
    referrals: served.map((r) => ({
      issue: r.issue,
      label: taxonomy[r.issue].label,
      confidence: r.confidence,
      legalAidCategory: taxonomy[r.issue].referral.legalAidCategory,
      serviceDescription: taxonomy[r.issue].referral.serviceDescription,
      whereToGo: taxonomy[r.issue].referral.whereToGo,
    })),
    otherCandidates: ranked.slice(2).map((r) => ({ issue: r.issue, confidence: r.confidence })),
    disclaimer: DISCLAIMER,
  };
}

/** Deterministic Markdown rendering of a triage result (referral info only). */
export function renderTriage(result) {
  const L = [];
  if (result.status === 'escalate') {
    L.push(`# Triage — ESCALATE (${result.reason})`, '', result.escalate, '');
    for (const c of result.candidates) L.push(`- possible: ${c.issue} (confidence ${c.confidence}) — not served automatically`);
    if (result.candidates.length) L.push('');
  } else {
    L.push(`# Triage — ${result.primaryLabel}${result.multiIssue ? ' (possible multi-issue)' : ''}`, '');
    L.push(`Confidence: **${result.confidence}** (gate 0.4) · matched keywords: ${result.matchedKeywords.join(', ')}`, '');
    for (const r of result.referrals) {
      L.push(`## Referral — ${r.label}`);
      L.push('');
      L.push(`- Legal aid category: \`${r.legalAidCategory}\` (confidence ${r.confidence})`);
      L.push(`- ${r.serviceDescription}`);
      L.push(`- ${r.whereToGo}`);
      L.push('');
    }
  }
  L.push(`> ${result.disclaimer}`);
  L.push('');
  return L.join('\n');
}
