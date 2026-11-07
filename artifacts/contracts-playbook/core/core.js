/**
 * contracts-playbook core — deterministic ACC-style playbook check.
 * NO LLM: every classification is reproducible from the inputs alone.
 *
 * Pipeline (mirrors the live "playbook-from-doc" Val Town app, simulated
 * deterministically — see ../README.md):
 *   1. splitClauses(text)          — numbered / heading-based segmentation
 *   2. classifyClause(text, book)  — topic match → preferred / fallback-tier-N /
 *                                    avoid / uncovered (never guessed: a clause
 *                                    with no playbook coverage stays uncovered)
 *   3. verifyQuote(quote, source)  — position source quotes checked against the
 *                                    pasted text: exact / normalized / fuzzy /
 *                                    not_found (logic pattern ported from the
 *                                    cite-check open artifact's core.js; no
 *                                    cross-artifact imports)
 *   4. renderPlaybookMd(report)    — exportable Markdown playbook draft
 *   5. riskSummary(results)        — RYG roll-up
 *
 * Browser + Node compatible, dependency-free ES module.
 * @module core
 */

/* ============================================================
 * text utilities (approach ported from cite-check core.js)
 * ============================================================ */

/** Token with char span in the ORIGINAL string.
 * @typedef {{ norm: string, start: number, end: number }} Tok */

/**
 * Split on runs of non [A-Za-z0-9.] characters; trim leading/trailing dots
 * from each token so "p." -> "p" while "5.2" stays "5.2".
 * @param {string} text @returns {Tok[]} */
export function tokenizeWithSpans(text) {
  const toks = [];
  const re = /[^A-Za-z0-9.]+/g;
  let last = 0;
  let m;
  const push = (start, end) => {
    let ls = start;
    let le = end;
    while (ls < le && text[ls] === ".") ls++;
    while (le > ls && text[le - 1] === ".") le--;
    if (le > ls) toks.push({ norm: text.slice(ls, le).toLowerCase(), start: ls, end: le });
  };
  while ((m = re.exec(text)) !== null) {
    push(last, m.index);
    last = m.index + m[0].length;
  }
  push(last, text.length);
  return toks;
}

/** @param {string} text @returns {string[]} */
function tokens(text) {
  return tokenizeWithSpans(text).map((t) => t.norm);
}

/** @param {string[]} xs @returns {Map<string, number>} */
function multiset(xs) {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/**
 * Slide windows of ~quote length (± padding) over the source and return the
 * best-scoring window. Purely deterministic.
 * @param {string} source @param {string} quote @param {number} [pad]
 * @returns {{ score: number, coverage: number, start: number, end: number, verbatim: string } | null}
 */
export function bestWindow(source, quote, pad = 6) {
  const S = tokenizeWithSpans(source);
  const q = tokens(quote);
  if (S.length === 0 || q.length === 0) return null;
  const qSet = multiset(q);
  let best = null;
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

/** Whitespace-trimmed verbatim containment check on the raw strings.
 * @param {string} source @param {string} quote @returns {boolean} */
function rawContains(source, quote) {
  const q = quote.trim();
  return q.length > 0 && source.includes(q);
}

/* ============================================================
 * quote verification (ported approach from cite-check core.js)
 * ============================================================ */

/** @typedef {"exact"|"normalized"|"fuzzy"|"not_found"} QuoteStatus */

/**
 * Verify a position's source quote against the pasted agreement text.
 * Classification ladder (first match wins):
 *   exact      — quote appears verbatim (whitespace-trimmed) in the source
 *   normalized — same tokens modulo case/punctuation (score ≥ 0.95, coverage ≥ 0.95)
 *   fuzzy      — best window similarity ≥ 0.7 and coverage ≥ 0.6
 *   not_found  — everything below the fuzzy threshold
 * Located quotes carry a verbatim anchor with char offsets; not_found quotes
 * keep their closest window as bestCandidate instead (ported behavior).
 * @param {string} quote @param {string} source @param {{ fuzzyThreshold?: number }} [opts]
 * @returns {{ classification: QuoteStatus, similarity: number, coverage: number,
 *             anchor: { charStart: number, charEnd: number, verbatim: string } | null,
 *             bestCandidate: { charStart: number, charEnd: number, verbatim: string } | null,
 *             notes: string[] }}
 */
export function verifyQuote(quote, source, opts = {}) {
  const fuzzyThreshold = opts.fuzzyThreshold ?? 0.7;
  const notes = [];
  if (typeof quote !== "string" || quote.trim().length === 0) {
    return { classification: "not_found", similarity: 0, coverage: 0, anchor: null, bestCandidate: null, notes: ["empty quote — nothing to verify"] };
  }
  const win = bestWindow(source, quote);
  const similarity = win?.score ?? 0;
  const coverage = win?.coverage ?? 0;

  let classification;
  if (rawContains(source, quote)) {
    classification = "exact";
  } else if (similarity >= 0.95 && coverage >= 0.95) {
    classification = "normalized";
    notes.push("matches modulo case/punctuation/whitespace");
  } else if (similarity >= fuzzyThreshold && coverage >= 0.6) {
    classification = "fuzzy";
    notes.push("substantial overlap but not verbatim — requires human review");
  } else {
    classification = "not_found";
    if (win) notes.push(`best candidate similarity ${similarity.toFixed(2)} below threshold ${fuzzyThreshold}`);
  }

  let anchor = null;
  let bestCandidate = null;
  if (win) {
    const loc = { charStart: win.start, charEnd: win.end, verbatim: win.verbatim };
    if (classification === "not_found") bestCandidate = loc;
    else anchor = loc;
  }
  return { classification, similarity, coverage, anchor, bestCandidate, notes };
}

/* ============================================================
 * clause splitting — deterministic numbered / heading segmentation
 * ============================================================ */

/** @typedef {{ id: string, label: string | null, heading: string, text: string, start: number, end: number }} Clause */

/**
 * Segment an agreement into clauses.
 *
 * Deterministic rules:
 *   - a line starting (column 0–3) with "12." / "12)" / "3.2." begins a clause;
 *   - a markdown heading line (# … ######) begins a clause;
 *   - everything before the first marker is treated as preamble (dropped);
 *   - with no markers at all, blank-line-separated paragraphs become clauses
 *     (label "p1", "p2", …); a fully blank text yields [].
 *
 * Offsets index the CRLF-normalized text (the demo feeds the same string back
 * in, so anchors always resolve).
 * @param {string} text @returns {Clause[]}
 */
export function splitClauses(text) {
  const src = String(text ?? "").replace(/\r\n?/g, "\n");
  if (src.trim().length === 0) return [];
  const lines = src.split("\n");
  const offsets = [];
  let pos = 0;
  for (const line of lines) {
    offsets.push(pos);
    pos += line.length + 1;
  }
  const numbered = /^ {0,3}(\d{1,2})(?:\.\d+)*[.)]\s*(.*)$/;
  const mdHead = /^ {0,3}#{1,6}\s+(.*)$/;
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (numbered.test(lines[i]) || mdHead.test(lines[i])) starts.push(i);
  }

  const toClause = (fromLine, toLine, label) => {
    const start = offsets[fromLine];
    const end = Math.min(src.length, offsets[toLine] + lines[toLine].length);
    const rawText = src.slice(start, end).trim();
    return { id: "", label, heading: headingOf(rawText, label), text: rawText, start, end: start + rawText.length };
  };

  const clauses = [];
  if (starts.length > 0) {
    for (let i = 0; i < starts.length; i++) {
      const from = starts[i];
      const to = i + 1 < starts.length ? starts[i + 1] - 1 : lines.length - 1;
      const m = lines[from].match(numbered);
      const label = m ? m[1] : null;
      clauses.push(toClause(from, to, label));
    }
  } else {
    // fallback: blank-line paragraphs
    let paraStart = -1;
    const flush = (toLine) => {
      if (paraStart >= 0 && toLine >= paraStart) {
        const c = toClause(paraStart, toLine, `p${clauses.length + 1}`);
        if (c.text.length > 0) clauses.push(c);
      }
      paraStart = -1;
    };
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().length > 0) {
        if (paraStart < 0) paraStart = i;
      } else {
        flush(i - 1);
      }
    }
    flush(lines.length - 1);
  }
  clauses.forEach((c, i) => (c.id = `c${i + 1}`));
  return clauses;
}

/** Heading = words before the first period when short, else a 5-word snippet. */
function headingOf(text, label) {
  let body = label === null ? text : text.replace(/^ {0,3}\d{1,2}(?:\.\d+)*[.)]\s*/, "");
  body = body.replace(/^ {0,3}#{1,6}\s*/, "");
  const first = body.split(/[.\n]/)[0].trim();
  if (first.length > 0 && first.split(/\s+/).length <= 5) return first;
  return body.split(/\s+/).slice(0, 5).join(" ") + "…";
}

/* ============================================================
 * bundled ACC-style playbook (fictional; positions for the demo)
 * ============================================================ */

/**
 * Every pattern is a case-insensitive regex source string.
 * A rule's topic matches when the sum of matched topic-pattern weights ≥ 2.
 * A position matches when every `all` pattern tests true and no `none`
 * pattern tests true. Ties between rules break by playbook order.
 * @typedef {{ re: string, w?: number }} TopicPattern }
 * @typedef {{ description: string, all?: string[], none?: string[], source_quote?: string }} Position }
 * @typedef {{ id: string, topic: string, risk: "red"|"yellow",
 *             topicPatterns: TopicPattern[], preferred: Position,
 *             fallbacks: Position[], avoid: Position,
 *             escalate: string, raiseMode: "proactive"|"reactive",
 *             rationale: string }} Rule
 */

export const DEFAULT_PLAYBOOK = {
  name: "Glenmark Systems — vendor NDA playbook (fictional)",
  ourSide: "Glenmark Systems, Inc. (disclosing party)",
  agreementType: "mutual NDA",
  audience: "legal",
  rules: [
    {
      id: "use-and-disclosure",
      topic: "Use and disclosure",
      risk: "yellow",
      topicPatterns: [
        { re: "\\bsolely to evaluate\\b", w: 2 },
        { re: "\\bbusiness purpose\\b" },
        { re: "\\bneed to know\\b", w: 2 },
        { re: "\\bdisclos(?:e|ed|ing|ure)[^.]{0,80}\\bemployees\\b" },
      ],
      preferred: {
        description:
          "Use limited to evaluating the potential relationship; disclosure only to need-to-know people bound by equally protective terms.",
        all: ["\\bsolely to evaluate\\b", "\\bneed to know\\b"],
        source_quote:
          "solely to evaluate a potential business relationship, and may disclose it only to its employees and advisors with a need to know who are bound by confidentiality obligations at least as protective as this Agreement",
      },
      fallbacks: [
        {
          description: "Use for the recipient's internal business purposes; disclosure still restricted to need-to-know staff.",
          all: ["\\binternal(?:ly)?[^.]{0,40}business purposes?\\b"],
        },
      ],
      avoid: {
        description: "Any-business-purpose use, or disclosure to advisors who are not bound.",
        all: ["\\bany business purpose\\b"],
      },
      escalate: "The draft allows use for any business purpose, or disclosure without a need to know.",
      raiseMode: "proactive",
      rationale: "Evaluate-only use keeps the information inside the deal team; unbound advisors leak.",
    },
    {
      id: "confidentiality-term",
      topic: "Term and survival of confidentiality",
      risk: "red",
      topicPatterns: [
        { re: "\\bsurviv(?:e|es|ed|al|ing)\\b", w: 2 },
        { re: "\\btrade secrets?\\b" },
        { re: "\\bcommences? on the effective date\\b" },
      ],
      preferred: {
        description: "Three-year agreement; confidentiality survives five years; trade secrets survive while they remain trade secrets.",
        all: ["\\bfive \\(5\\) years?\\b", "\\btrade secrets?\\b"],
        source_quote:
          "The confidentiality obligations of the Parties survive for five (5) years after disclosure; trade secrets survive for as long as they remain trade secrets.",
      },
      fallbacks: [
        {
          description: "Two-year survival for ordinary confidential information, with trade secrets surviving while secret.",
          all: ["\\btwo \\(2\\) years?\\b", "\\btrade secrets?\\b"],
        },
        {
          description: "Single fixed survival window of three years for all confidential information, including trade secrets.",
          all: ["\\bthree \\(3\\) years?\\b", "\\btrade secrets?\\b"],
        },
      ],
      avoid: {
        description: "Survival shorter than two years, or trade secrets that expire on a fixed date with the agreement.",
        all: ["(?:\\btwelve \\(12\\) months?\\b|\\bone \\(1\\) year\\b)", "\\bsurviv"],
      },
      escalate: "The other side asks for survival under two years, or for trade secrets to expire on a fixed date.",
      raiseMode: "proactive",
      rationale: "Trade secrets lose status if confidentiality lapses early; five-year survival is market for our sector.",
    },
    {
      id: "compelled-disclosure",
      topic: "Compelled disclosure",
      risk: "yellow",
      topicPatterns: [
        { re: "\\brequired by law\\b", w: 2 },
        { re: "\\bprotective (?:treatment|order)\\b" },
        { re: "\\bprompt (?:written )?notice\\b" },
      ],
      preferred: {
        description: "Disclosure required by law is allowed after prompt notice, where notice is legally permitted, with cooperation on protective treatment.",
        all: ["\\brequired by law\\b", "\\bprompt (?:written )?notice\\b", "\\bcooperat"],
      },
      fallbacks: [
        {
          description: "Notice may be given after disclosure when prior notice is prohibited by law.",
          all: ["\\brequired by law\\b", "\\bnotice[^.]{0,80}after disclosure\\b"],
          source_quote:
            "with written notice to the other Party given after disclosure where not prohibited by law; each Party will cooperate in seeking protective treatment",
        },
      ],
      avoid: {
        description: "A right to disclose to any regulator with no notice and no cooperation.",
        all: ["\\bregulator\\b[^.]{0,120}\\bwithout notice\\b"],
      },
      escalate: "The other side refuses notice even where the law allows it.",
      raiseMode: "proactive",
      rationale: "Prompt notice lets us move to quash; after-the-fact notice is acceptable only when prior notice is prohibited.",
    },
    {
      id: "non-solicit",
      topic: "Non-solicitation",
      risk: "red",
      topicPatterns: [
        { re: "\\bsolicit", w: 2 },
        { re: "\\bhires?d?\\b" },
        { re: "\\bemployees?\\b" },
      ],
      preferred: {
        description: "Mutual 12-month non-solicit of employees only; no customer restriction and no no-hire covenant.",
        all: ["\\btwelve \\(12\\) months?\\b", "\\bemployees?\\b"],
      },
      fallbacks: [
        {
          description: "Employee and customer non-solicits, both limited to 12 months or less.",
          all: ["\\bemployees?\\b", "\\bcustomers?\\b", "(?:\\btwelve \\(12\\) months?\\b|\\bsix \\(6\\) months?\\b)"],
        },
        {
          description: "18-month employee-only non-solicit.",
          all: ["\\beighteen \\(18\\) months?\\b", "\\bemployees?\\b"],
        },
      ],
      avoid: {
        description: "Duration over 18 months, or any no-hire covenant (a hire bar, not just a solicitation bar).",
        all: ["(?:\\btwenty-four \\(24\\) months?\\b|\\btwo \\(2\\) years?\\b)"],
        source_quote:
          "Neither Party shall solicit or hire the other Party's employees or solicit the other Party's customers in order to divert business.",
      },
      escalate: "The other side asks for a no-hire covenant or a restriction longer than 18 months.",
      raiseMode: "reactive",
      rationale: "No-hire covenants draw antitrust scrutiny in several of our jurisdictions; customer restrictions belong in the definitive deal, not the NDA.",
    },
    {
      id: "indemnity",
      topic: "Indemnification",
      risk: "yellow",
      topicPatterns: [
        { re: "\\bindemnif", w: 2 },
        { re: "\\bhold harmless\\b", w: 2 },
        { re: "\\bthird-party claims?\\b" },
      ],
      preferred: {
        description: "Mutual indemnification for breach of confidentiality obligations.",
        all: ["\\beach party\\b", "\\bindemnif"],
      },
      fallbacks: [
        {
          description: "One-way indemnity from the recipient for third-party claims, capped at the liability cap.",
          all: ["\\bindemnif", "\\bthird-party claims?\\b"],
          source_quote:
            "Bluepeak shall indemnify and hold harmless Northwind from any third-party claims arising from Bluepeak's breach of this Agreement",
        },
        {
          description: "Indemnity limited to third-party intellectual-property infringement claims.",
          all: ["\\bindemnif", "\\b(?:intellectual propert|patent infringement)\\b"],
        },
      ],
      avoid: {
        description: "Uncapped indemnity, or indemnity covering consequential damages.",
        all: ["\\b(?:unlimited|without limit)\\b", "\\bindemnif"],
      },
      escalate: "The draft demands uncapped one-way indemnity from us.",
      raiseMode: "reactive",
      rationale: "One-way uncapped indemnity in an evaluation-stage NDA is disproportionate to the relationship.",
    },
    {
      id: "liability-cap",
      topic: "Limitation of liability",
      risk: "red",
      topicPatterns: [
        { re: "\\blimitation of liability\\b", w: 2 },
        { re: "\\baggregate liability\\b", w: 2 },
        { re: "\\bconsequential damages?\\b" },
        { re: "\\bshall not exceed\\b" },
      ],
      preferred: {
        description: "Cap = fees paid or payable in the trailing 12 months; mutual waiver of consequential damages.",
        all: ["\\baggregate liability\\b", "\\bfees? (?:paid|payable)\\b"],
        source_quote:
          "Each Party's aggregate liability shall not exceed the greater of one hundred thousand dollars ($100,000) or the fees paid under any resulting definitive agreement.",
      },
      fallbacks: [
        {
          description: "Fixed-dollar cap of $1,000,000 per claim.",
          all: ["\\bshall not exceed\\b", "\\$\\s?\\d"],
        },
        {
          description: "Mutual waiver of consequential damages with no aggregate cap.",
          all: ["\\bconsequential damages?\\b", "\\bmutual\\b"],
        },
      ],
      avoid: {
        description: "No cap at all, or a cap that does not apply to confidentiality breaches.",
        all: ["\\bunlimited\\b|\\bliability[^.]{0,40}shall not be limited\\b"],
      },
      escalate: "The draft removes the aggregate cap or carves confidentiality breaches out of it.",
      raiseMode: "proactive",
      rationale: "A trailing-fees cap scales with the actual relationship; fixed caps invite inflated exposure arguments.",
    },
    {
      id: "governing-law",
      topic: "Governing law and venue",
      risk: "yellow",
      topicPatterns: [
        { re: "\\bgoverned by\\b", w: 2 },
        { re: "\\bgoverning law\\b", w: 2 },
        { re: "\\blaws? of the\\b" },
        { re: "\\bvenue\\b" },
        { re: "\\b(?:aaa|jams) arbitration\\b", w: 2 },
      ],
      preferred: {
        description: "California law, with exclusive jurisdiction in the state and federal courts of northern California.",
        all: ["\\bgoverned by\\b", "\\bcalifornia\\b"],
      },
      fallbacks: [
        {
          description: "Delaware or New York law, with exclusive jurisdiction in those courts.",
          all: ["(?:\\bgoverned by\\b|\\bgoverning law\\b)", "\\b(?:delaware|new york)\\b"],
          source_quote: "This Agreement is governed by the laws of the State of Delaware, without regard to its conflict of laws rules",
        },
        {
          description: "AAA or JAMS arbitration seated in a U.S. city, any state's procedural law.",
          all: ["\\barbitration\\b", "\\b(?:aaa|jams)\\b"],
        },
      ],
      avoid: {
        description: "Foreign governing law or mandatory foreign venue.",
        all: ["\\blaws? of\\b[^.]{0,60}\\b(?:england|united kingdom|singapore|switzerland)\\b"],
      },
      escalate: "The counterparty insists on a foreign governing law.",
      raiseMode: "reactive",
      rationale: "We keep disputes in courts we know; Delaware and New York are acceptable second choices.",
    },
    {
      id: "auto-renewal",
      topic: "Term renewal",
      risk: "yellow",
      topicPatterns: [
        { re: "\\brenew", w: 2 },
        { re: "\\bautomatic(?:ally)?\\b" },
        { re: "\\bnon-renewal\\b" },
        { re: "\\bsuccessive\\b" },
      ],
      preferred: {
        description: "Fixed term with no automatic renewal; extension only by signed amendment.",
        all: ["\\b(?:continues?|shall (?:run|last))\\b"],
        none: ["\\brenew"],
      },
      fallbacks: [
        {
          description: "Automatic 12-month renewals with a 60-day written opt-out.",
          all: ["\\brenew", "\\b(?:sixty \\(60\\)|60) days?\\b"],
          source_quote:
            "This Agreement renews automatically for successive twelve (12) month terms unless either Party gives sixty (60) days' written notice of non-renewal.",
        },
        {
          description: "Automatic renewals with only a 30-day opt-out window.",
          all: ["\\brenew", "\\b(?:thirty \\(30\\)|30) days?\\b"],
        },
      ],
      avoid: {
        description: "Perpetual or indefinite evergreen term.",
        all: ["\\b(?:perpetuit|perpetual|indefinite|evergreen)\\b"],
      },
      escalate: "The draft rolls into an evergreen term with no clean exit.",
      raiseMode: "proactive",
      rationale: "Auto-renewals quietly extend stale terms; if they stay, we need a short, well-signaled opt-out.",
    },
  ],
};

/* ============================================================
 * classification
 * ============================================================ */

const rx = (src) => new RegExp(src, "i");

/**
 * Match one clause against the playbook.
 * Deterministic: the highest-scoring topic wins (ties break by rule order),
 * then positions are tested in ladder order preferred → fallbacks → avoid.
 * A topic match with no matching position is reported as uncovered — the
 * classification is never guessed.
 * @param {string} clauseText
 * @param {{ rules: Rule[] }} [playbook]
 * @returns {{ classification: "preferred"|"fallback-tier-N"|"avoid"|"uncovered",
 *             ruleId: string | null, topic: string | null,
 *             position: { tier: "preferred"|"fallback"|"avoid", index: number, description: string } | null,
 *             sourceQuote: string | null, matchedPatterns: string[], score: number,
 *             note: string | null }}
 */
export function classifyClause(clauseText, playbook = DEFAULT_PLAYBOOK) {
  const text = String(clauseText ?? "");
  const scored = playbook.rules
    .map((rule, order) => {
      const matched = [];
      let score = 0;
      for (const p of rule.topicPatterns) {
        if (rx(p.re).test(text)) {
          score += p.w ?? 1;
          matched.push(p.re);
        }
      }
      return { rule, order, score, matched };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || a.order - b.order);

  if (scored.length === 0) {
    return { classification: "uncovered", ruleId: null, topic: null, position: null, sourceQuote: null, matchedPatterns: [], score: 0,
      note: "no playbook rule matched this clause — left uncovered, never guessed" };
  }
  const top = scored[0];
  const ladder = [
    { tier: "preferred", index: 0, pos: top.rule.preferred },
    ...top.rule.fallbacks.map((p, i) => ({ tier: "fallback", index: i + 1, pos: p })),
    { tier: "avoid", index: top.rule.fallbacks.length + 1, pos: top.rule.avoid },
  ];
  for (const step of ladder) {
    const all = (step.pos.all ?? []).every((re) => rx(re).test(text));
    const none = (step.pos.none ?? []).every((re) => !rx(re).test(text));
    if (all && none) {
      return {
        classification: step.tier === "fallback" ? `fallback-tier-${step.index}` : step.tier,
        ruleId: top.rule.id,
        topic: top.rule.topic,
        position: { tier: step.tier, index: step.index, description: step.pos.description },
        sourceQuote: step.pos.source_quote ?? null,
        matchedPatterns: top.matched,
        score: top.score,
        note: null,
      };
    }
  }
  return { classification: "uncovered", ruleId: top.rule.id, topic: top.rule.topic, position: null, sourceQuote: null,
    matchedPatterns: top.matched, score: top.score,
    note: `topic "${top.rule.topic}" matched (score ${top.score}) but no playbook position matched — not guessed` };
}

/* ============================================================
 * pipeline + summaries
 * ============================================================ */

/**
 * Full deterministic check: split → classify → verify each matched position's
 * source quote against the pasted agreement.
 * @param {string} text @param {{ rules: Rule[] }} [playbook]
 * @returns {{ playbookName: string, ourSide: string, clauses: Clause[],
 *             results: any[], summary: ReturnType<typeof riskSummary> }}
 */
export function runPlaybookCheck(text, playbook = DEFAULT_PLAYBOOK) {
  const clauses = splitClauses(text);
  const results = clauses.map((clause) => {
    const cls = classifyClause(clause.text, playbook);
    const quote = cls.sourceQuote ? verifyQuote(cls.sourceQuote, text) : null;
    return { clause, ...cls, quote };
  });
  return {
    playbookName: playbook.name,
    ourSide: playbook.ourSide,
    agreementType: playbook.agreementType,
    audience: playbook.audience,
    clauses,
    results,
    summary: riskSummary(results),
  };
}

/**
 * RYG roll-up over runPlaybookCheck results.
 * preferred → green · fallback-tier-N → yellow · avoid → red · uncovered → none.
 * @param {any[]} results
 */
export function riskSummary(results) {
  const isFallback = (r) => r.classification.startsWith("fallback-tier");
  const count = (fn) => results.filter(fn).length;
  const qc = (c) => results.filter((r) => r.quote?.classification === c).length;
  const quotes = { total: results.filter((r) => r.quote).length, exact: qc("exact"), normalized: qc("normalized"), fuzzy: qc("fuzzy"), not_found: qc("not_found") };
  return {
    totalClauses: results.length,
    covered: results.filter((r) => r.classification !== "uncovered").length,
    uncovered: count((r) => r.classification === "uncovered"),
    preferred: count((r) => r.classification === "preferred"),
    fallbacks: count(isFallback),
    avoid: count((r) => r.classification === "avoid"),
    green: count((r) => r.classification === "preferred"),
    yellow: count(isFallback),
    red: count((r) => r.classification === "avoid"),
    quotes,
    unverifiedQuotes: quotes.fuzzy + quotes.not_found,
  };
}

const RYG = { preferred: "GREEN", fallback: "YELLOW", avoid: "RED" };

/**
 * Exportable Markdown playbook draft — the app's signature deliverable
 * (format mirrors the live app's export in ../fixtures/sample.md).
 * @param {ReturnType<typeof runPlaybookCheck>} report @returns {string}
 */
export function renderPlaybookMd(report) {
  const s = report.summary;
  const lines = [];
  lines.push(`# Playbook draft — ${report.playbookName}`);
  lines.push("");
  lines.push(`**Our side:** ${report.ourSide} · **Agreement:** ${report.agreementType} · **Audience:** ${report.audience}`);
  lines.push("");
  lines.push(
    `> Deviation check of ${s.totalClauses} clauses: ${s.green} green · ${s.yellow} yellow · ${s.red} red · ${s.uncovered} uncovered. ` +
      `Source quotes verified against the pasted text: ${s.quotes.exact} exact · ${s.quotes.normalized} normalized · ${s.quotes.fuzzy} fuzzy · ${s.quotes.not_found} not found.`,
  );
  lines.push("");
  lines.push("## Deviation table");
  lines.push("");
  lines.push("| Clause | Topic | Classification | Position | Quote |");
  lines.push("|---|---|---|---|---|");
  for (const r of report.results) {
    const pos = r.position ? r.position.description : "—";
    const q = r.quote ? r.quote.classification : "—";
    lines.push(`| ${r.clause.label ?? r.clause.id} ${r.clause.heading} | ${r.topic ?? "—"} | ${r.classification} | ${pos} | ${q} |`);
  }
  lines.push("");

  const seen = new Map();
  for (const r of report.results) {
    if (r.ruleId && !seen.has(r.ruleId)) seen.set(r.ruleId, r);
  }
  const ruleById = new Map(DEFAULT_PLAYBOOK.rules.map((r) => [r.id, r]));
  for (const [ruleId, r] of seen) {
    const rule = ruleById.get(ruleId);
    if (!rule) continue;
    const color = RYG[r.position.tier] ?? "—";
    lines.push(`## ${rule.topic} — ${color}`);
    lines.push("");
    lines.push(
      `**Matched clause ${r.clause.label ?? r.clause.id} (${r.clause.heading}):** ${r.classification}` +
        (r.note ? ` — ${r.note}` : ""),
    );
    if (r.sourceQuote && r.quote) {
      const a = r.quote.anchor ? ` (chars ${r.quote.anchor.charStart}–${r.quote.anchor.charEnd})` : "";
      lines.push("");
      lines.push(`**Source quote — ${r.quote.classification}${a}:**`);
      lines.push("");
      lines.push(`> ${r.sourceQuote.replace(/\n/g, " ")}`);
    }
    lines.push("");
    lines.push(`**Preferred:** ${rule.preferred.description}`);
    lines.push("");
    lines.push("**Fallbacks (in order):**");
    rule.fallbacks.forEach((f, i) => lines.push(`${i + 1}. ${f.description}`));
    lines.push("");
    lines.push(`**Avoid (no-go):** ${rule.avoid.description}`);
    lines.push("");
    lines.push(`**Escalate deviations to:** ${rule.escalate}`);
    lines.push("");
    lines.push(`**Raise:** ${rule.raiseMode}`);
    lines.push("");
    lines.push(`**Rationale:** ${rule.rationale}`);
    lines.push("");
  }

  const uncovered = report.results.filter((r) => r.classification === "uncovered");
  if (uncovered.length > 0) {
    lines.push("## Uncovered clauses");
    lines.push("");
    for (const r of uncovered) {
      lines.push(`- Clause ${r.clause.label ?? r.clause.id} — ${r.clause.heading} — ${r.note ?? "no playbook rule matched"}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("_Draft generated deterministically from the pasted agreement (no LLM in the loop) — review before relying on it. All example data fictional. Not legal advice._");
  return lines.join("\n") + "\n";
}
