/**
 * Proposition harness — the auditable two-stage pipeline around the LLM part.
 *
 * The deterministic core classifies and anchors quotes; ONLY quotes classified
 * exact/normalized are eligible for LLM/human proposition judgment. Everything
 * else is refused with a note: there is no verbatim-verified anchor to judge
 * against, and the core never lets judgment outrun verification.
 */

import type { CiteCheckReport, Classification, QuoteResult } from './citecheck';

export interface PropositionVerdict {
  id: string;
  proposition: string;
  supported: boolean | 'unclear';
  reasoning: string;
  /** the core's verbatim anchor echoed back, so the verdict is pinned to text */
  anchorFromCore?: string;
}

export interface MergedVerdict {
  id: string;
  classification: Classification | null;
  eligible: boolean;
  verdict?: PropositionVerdict;
  refusal?: string;
}

/** Structured prompt for the LLM/human judgment stage (never classification). */
export function buildPropositionPrompt(report: CiteCheckReport): string {
  const eligible = report.results.filter(
    (r: QuoteResult) => r.classification === 'exact' || r.classification === 'normalized',
  );
  const items = eligible.map((r) => ({
    id: r.id,
    proposition: r.proposition ?? null,
    source: r.anchor?.sourceName ?? null,
    anchor: r.anchor?.verbatim ?? null,
  }));
  return [
    'You are judging whether each verbatim-verified quotation actually supports the proposition it is offered to prove.',
    'Quote fidelity was already verified deterministically (exact/normalized). Judge SUPPORT ONLY — never re-classify the quote text.',
    'Respond with JSON only:',
    '{"verdicts":[{"id":"...","supported":true|false|"unclear","reasoning":"..."}]}',
    'Quotes to judge:',
    JSON.stringify(items, null, 2),
  ].join('\n');
}

/** Merge LLM/human verdicts into the report, gating on core verification. */
export function mergeVerdicts(report: CiteCheckReport, verdicts: PropositionVerdict[]): MergedVerdict[] {
  return verdicts.map((v) => {
    const r = report.results.find((x) => x.id === v.id);
    if (!r) {
      return { id: v.id, classification: null, eligible: false, refusal: `refused: no quote with id "${v.id}" in the report` };
    }
    if (r.classification !== 'exact' && r.classification !== 'normalized') {
      return {
        id: v.id,
        classification: r.classification,
        eligible: false,
        refusal: `refused: classification "${r.classification}" is not verbatim-verified — the deterministic core gates proposition judgment`,
      };
    }
    if (v.anchorFromCore !== undefined && v.anchorFromCore !== r.anchor?.verbatim) {
      return {
        id: v.id,
        classification: r.classification,
        eligible: false,
        refusal: 'refused: echoed anchor does not match the core anchor for this quote',
      };
    }
    return { id: v.id, classification: r.classification, eligible: true, verdict: v };
  });
}
