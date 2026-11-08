/**
 * access-to-justice-front-door core — plain-language triage:
 *   - classifies a person's problem description against an issue taxonomy
 *     with a deterministic keyword/alias/rule matcher
 *   - confidence-gated: below threshold (or no match) the matter is
 *     ESCALATED TO A HUMAN instead of guessed; a low-confidence split
 *     returns a clarifying question whose answer (`pick`) resolves it
 *   - urgency flag + plain-language date capture (info-only)
 *   - referral mapping to legal-aid categories with per-issue approved
 *     guidance entries, each carrying a source link
 *
 * OUTPUT IS REFERRAL INFORMATION ONLY. The core never produces legal
 * advice, strategy, or predicted outcomes: every user-facing string in
 * the response is copied verbatim from the referral/guidance data.
 * This is enforced by construction and pinned by tests.
 *
 * NO LLM in the classifier; the taxonomy and referral map are editable
 * rules-as-data. An optional LLM pass (spec.md) may *pre-normalize*
 * spelling, never classify.
 */

// ------------------------------------------------------------- taxonomy

/** Guidance source links (generic referral-process resources). */
const SRC = {
  lawhelp: { name: 'LawHelp.org — legal aid finder', url: 'https://www.lawhelp.org' },
  hud: { name: 'U.S. HUD — housing resources', url: 'https://www.hud.gov' },
  usaBenefits: { name: 'USA.gov — benefits page', url: 'https://www.usa.gov/benefits' },
  dvHotline: { name: 'National Domestic Violence Hotline', url: 'https://www.thehotline.org' },
  cfpb: { name: 'Consumer Financial Protection Bureau', url: 'https://www.consumerfinance.gov' },
  dolWhd: { name: 'U.S. DOL Wage and Hour Division', url: 'https://www.dol.gov/agencies/whd' },
};

/**
 * Issue taxonomy + referral map (editable data).
 * Keywords and aliases are matched case-insensitively; single words use
 * word boundaries so "rent" does not fire inside "present". `aliases`
 * are synonym phrasings ("kicked out", "beats me") matched with the
 * same rules — the deterministic answer to dialect/paraphrase drift.
 * `guidance` is process-only, one source link per entry.
 */
export const TAXONOMY = {
  'housing-eviction': {
    label: 'Eviction / loss of housing',
    keywords: [
      { k: 'evict', w: 3 }, { k: 'eviction', w: 3 }, { k: 'notice to quit', w: 3 },
      { k: 'landlord', w: 2 }, { k: 'court papers', w: 2 }, { k: 'behind on rent', w: 3 }, { k: 'lockout', w: 3 },
    ],
    aliases: [
      { k: 'kicked out', w: 3 }, { k: 'thrown out', w: 3 }, { k: 'threw me out', w: 3 }, { k: 'being put out', w: 3 },
    ],
    guidance: [
      { point: 'Bring every notice, summons, or letter you have received to your first appointment; deadlines printed on court papers are time-sensitive.', source: SRC.lawhelp },
      { point: 'Court self-help centers can explain what each paper means at no cost; intake staff can point you to the nearest one.', source: SRC.lawhelp },
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
    aliases: [
      { k: 'no hot water', w: 3 }, { k: 'roaches', w: 3 }, { k: 'rats', w: 3 },
    ],
    guidance: [
      { point: 'Take photos of the problem and keep copies of repair requests; bring both to your appointment.', source: SRC.lawhelp },
      { point: 'Many localities have a housing code enforcement office that inspects on request; intake staff can identify yours.', source: SRC.hud },
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
    aliases: [
      { k: 'cash assistance', w: 3 }, { k: 'ebt', w: 3 },
    ],
    guidance: [
      { point: 'Appeal deadlines are printed on the denial or overpayment notice; bring the notice to intake staff right away.', source: SRC.usaBenefits },
      { point: 'A fair hearing can often be requested by phone or mail; the notice itself explains how.', source: SRC.usaBenefits },
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
    aliases: [
      { k: 'who gets the kids', w: 3 },
    ],
    guidance: [
      { point: 'Bring existing court orders and any caseworker correspondence to your first appointment.', source: SRC.lawhelp },
      { point: 'Family court self-help centers can explain which forms start a custody or support case.', source: SRC.lawhelp },
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
    aliases: [
      { k: 'beats me', w: 3 }, { k: 'hits me', w: 3 }, { k: 'choked me', w: 3 },
      { k: 'scared of my partner', w: 3 }, { k: 'afraid of my partner', w: 3 },
    ],
    guidance: [
      { point: 'If you are in immediate danger, call emergency services before anything else.', source: SRC.dvHotline },
      { point: 'Safety planning with a trained advocate is free and confidential; advocates also help with protective-order paperwork.', source: SRC.dvHotline },
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
    aliases: [
      { k: 'garnished', w: 3 }, { k: 'garnishment', w: 3 }, { k: 'collection agency', w: 3 },
    ],
    guidance: [
      { point: 'Bring all collection letters, voicemails, and court papers to your appointment.', source: SRC.cfpb },
      { point: 'Summons papers include a response deadline; bring them to intake staff the same week they arrive.', source: SRC.cfpb },
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
    aliases: [
      { k: 'boss owes me', w: 3 }, { k: 'off the clock', w: 3 }, { k: 'unpaid', w: 2 },
    ],
    guidance: [
      { point: 'Bring pay stubs, schedules, and any messages about hours or pay.', source: SRC.lawhelp },
      { point: 'Wage claims are handled by a state or federal labor agency; intake staff can identify the right office for your situation.', source: SRC.dolWhd },
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
    aliases: [
      { k: 'clean up my record', w: 3 }, { k: 'clear my record', w: 3 },
    ],
    guidance: [
      { point: 'Bring your RAP sheet if you have one; if not, intake staff can explain how to request a copy.', source: SRC.lawhelp },
      { point: 'Eligibility for sealing depends on the case outcome and the state; a screener goes through it with you.', source: SRC.lawhelp },
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

// ------------------------------------------------- urgency + date signals

/** Immediate-safety phrases → emergency (word-boundary match, case-insensitive). */
const EMERGENCY_PHRASES = [
  'immediate danger', 'in danger', 'emergency', 'unsafe', 'hit me', 'beats me',
  'threatening to kill', 'strangled', 'choked me', 'afraid for my life', 'scared for my life',
];

/** Time-pressure phrases → urgent (word-boundary match, case-insensitive). */
const URGENT_PHRASES = [
  'court date', 'deadline', 'hearing', 'tonight', 'tomorrow', 'right now',
  'asap', 'this week', 'next week', 'by friday',
];

function assessUrgency(text) {
  // Strip disability-sense hearing phrases first so 'hearing' only signals a
  // court hearing, and match phrases on word boundaries (review 62 nit:
  // 'hearing' must not fire on 'hard of hearing').
  const lower = String(text).toLowerCase()
    .replace(/hard of hearing|hearing aids?|hearing impaired|hearing loss/g, ' ');
  const has = (phrases) => phrases.some((p) => new RegExp(`\\b${p}\\b`).test(lower));
  if (has(EMERGENCY_PHRASES)) return 'emergency';
  if (has(URGENT_PHRASES)) return 'urgent';
  return 'routine';
}

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DATE_PATTERNS = [
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'gi'), // March 3
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\b`, 'gi'),      // 3 March
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,                                    // 3/15, 3/15/2026
];

/**
 * Capture plain-language dates from the description. INFO-ONLY: no year
 * inference, no deadline math — the raw fragments are passed along for
 * staff review, never interpreted.
 */
function extractDates(text) {
  const found = [];
  for (const re of DATE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(String(text ?? ''))) !== null) found.push({ raw: m[0], index: m.index });
  }
  const seen = new Set();
  return found
    .sort((a, b) => a.index - b.index)
    .filter((d) => (seen.has(d.raw) ? false : seen.add(d.raw)))
    .map((d) => d.raw);
}

// ------------------------------------------------------------- matcher

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministic keyword + alias matcher: returns per-issue matched
 * keywords/aliases + raw score. Aliases follow the same rules as
 * keywords (word boundaries for single words, substring for phrases).
 */
export function matchKeywords(text, taxonomy) {
  const lower = String(text).toLowerCase();
  const out = {};
  for (const [issue, def] of Object.entries(taxonomy)) {
    const hits = [];
    for (const { k, w } of [...def.keywords, ...(def.aliases ?? [])]) {
      const pattern = /\s/.test(k)
        ? escapeRe(k)                          // phrases: substring match
        : `\\b${escapeRe(k)}\\b`;              // single words: whole word only
      if (new RegExp(pattern, 'i').test(lower)) hits.push({ keyword: k, weight: w });
    }
    if (hits.length) out[issue] = { hits, score: hits.reduce((s, h) => s + h.weight, 0) };
  }
  return out;
}

/** Copy a referral (incl. approved guidance) verbatim from taxonomy data. */
function referralFor(issue, taxonomy, confidence) {
  const def = taxonomy[issue];
  return {
    issue,
    label: def.label,
    confidence,
    legalAidCategory: def.referral.legalAidCategory,
    serviceDescription: def.referral.serviceDescription,
    whereToGo: def.referral.whereToGo,
    guidance: (def.guidance ?? []).map((g) => ({ point: g.point, source: { ...g.source } })),
  };
}

/**
 * Triage a plain-language problem description.
 *
 * @param {string} text — the person's own words
 * @param {Object} [opts] — { taxonomy?, minConfidence? (default 0.4),
 *   multiIssueGap? (default 0.15), pick? (issue id chosen from a
 *   clarifying question's options) }
 * @returns {Object} triage result — referral info only, never advice
 */
export function triage(text, opts = {}) {
  const taxonomy = opts.taxonomy ?? TAXONOMY;
  const minConfidence = opts.minConfidence ?? 0.4;
  const multiIssueGap = opts.multiIssueGap ?? 0.15;

  const urgency = assessUrgency(text ?? '');
  const dates = extractDates(text);

  const matches = matchKeywords(text ?? '', taxonomy);
  const total = Object.values(matches).reduce((s, m) => s + m.score, 0);
  const ranked = Object.entries(matches)
    .map(([issue, m]) => ({ issue, score: m.score, confidence: total ? Math.round((m.score / total) * 1000) / 1000 : 0, matchedKeywords: m.hits.map((h) => h.keyword) }))
    .sort((a, b) => b.score - a.score || (a.issue < b.issue ? -1 : 1));

  if (ranked.length === 0) {
    return { status: 'escalate', reason: 'no-keyword-match', escalate: ESCALATE_MESSAGE, disclaimer: DISCLAIMER, candidates: [], matchedFragments: [], urgency, dates };
  }

  // A clarifying-question answer resolves the split deterministically.
  if (opts.pick !== undefined) {
    const found = ranked.find((r) => r.issue === opts.pick);
    if (!found) {
      return {
        status: 'escalate', reason: 'invalid-pick',
        escalate: ESCALATE_MESSAGE, disclaimer: DISCLAIMER,
        candidates: [], matchedFragments: [],
        urgency, dates,
      };
    }
    return {
      status: 'classified',
      primaryIssue: found.issue,
      primaryLabel: taxonomy[found.issue].label,
      confidence: found.confidence,
      multiIssue: false,
      matchedKeywords: found.matchedKeywords,
      resolvedBy: 'clarifying-question',
      referrals: [referralFor(found.issue, taxonomy, found.confidence)],
      otherCandidates: ranked.filter((r) => r.issue !== found.issue).map((r) => ({ issue: r.issue, confidence: r.confidence })),
      disclaimer: DISCLAIMER,
      urgency,
      dates,
    };
  }

  const top = ranked[0];
  if (top.confidence < minConfidence) {
    return {
      status: 'escalate', reason: 'low-confidence',
      escalate: ESCALATE_MESSAGE, disclaimer: DISCLAIMER,
      candidates: ranked.map((r) => ({ issue: r.issue, label: taxonomy[r.issue].label, confidence: r.confidence, matchedKeywords: r.matchedKeywords })),
      clarifyingQuestion: {
        question: 'Which of these comes closest to your problem?',
        options: ranked.map((r) => ({ id: r.issue, label: taxonomy[r.issue].label })),
      },
      matchedFragments: [...new Set(ranked.flatMap((r) => r.matchedKeywords))],
      urgency, dates,
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
    referrals: served.map((r) => referralFor(r.issue, taxonomy, r.confidence)),
    otherCandidates: ranked.slice(2).map((r) => ({ issue: r.issue, confidence: r.confidence })),
    disclaimer: DISCLAIMER,
    urgency,
    dates,
  };
}

/** Deterministic Markdown rendering of a triage result (referral info only). */
export function renderTriage(result) {
  const L = [];
  const meta = [`urgency: ${result.urgency ?? 'routine'}`];
  if (result.dates?.length) meta.push(`dates mentioned (info-only): ${result.dates.join(', ')}`);
  if (result.status === 'escalate') {
    L.push(`# Triage — ESCALATE (${result.reason})`, '', result.escalate, '');
    L.push(meta.join(' · '), '');
    for (const c of result.candidates) {
      L.push(`- possible: ${c.label ?? c.issue} (${c.issue}, confidence ${c.confidence})${c.matchedKeywords?.length ? ` — matched: ${c.matchedKeywords.join(', ')}` : ''} — not served automatically`);
    }
    if (result.candidates.length) L.push('');
    if (result.matchedFragments?.length) {
      L.push(`**Staff review packet** — matched fragments: ${result.matchedFragments.join(', ')}`, '');
    }
    if (result.clarifyingQuestion) {
      L.push(`**Clarifying question:** ${result.clarifyingQuestion.question}`);
      for (const o of result.clarifyingQuestion.options) L.push(`- option \`${o.id}\`: ${o.label}`);
      L.push('');
    }
  } else {
    L.push(`# Triage — ${result.primaryLabel}${result.multiIssue ? ' (possible multi-issue)' : ''}${result.resolvedBy === 'clarifying-question' ? ' (resolved by clarifying question)' : ''}`, '');
    L.push(`Confidence: **${result.confidence}** (gate 0.4) · matched keywords: ${result.matchedKeywords.join(', ')}`, '');
    L.push(meta.join(' · '), '');
    for (const r of result.referrals) {
      L.push(`## Referral — ${r.label}`);
      L.push('');
      L.push(`- Legal aid category: \`${r.legalAidCategory}\` (confidence ${r.confidence})`);
      L.push(`- ${r.serviceDescription}`);
      L.push(`- ${r.whereToGo}`);
      for (const g of r.guidance ?? []) L.push(`- Guidance: ${g.point} (source: ${g.source.name} <${g.source.url}>)`);
      L.push('');
    }
  }
  L.push(`> ${result.disclaimer}`);
  L.push('');
  return L.join('\n');
}
