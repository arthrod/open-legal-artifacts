// Pure helpers for the firm-facing dashboard (list of submitted intakes).
// No JSX, no DOM, no `Deno.*` — type-only imports plus the pure catalog
// helpers — so they are unit-testable under `deno test` and shared between the
// browser dashboard and any backend/list logic.
//
//   urgencyRank            — severity order (escalating first) for sorting.
//   sortIntakesByUrgency   — surface emergency/urgent intakes to the top.
//   escalatingCount        — how many intakes need attorney escalation.
//   intakeMetaLine         — the one-line "matter · jurisdiction · N parties".
//   filterIntakes          — list filter by matter area and/or urgency.
import { isEscalatingUrgency, matterAreaLabel } from "./catalog.ts";
import type { IntakeSummary, MatterArea, Urgency } from "./types.ts";

/** Severity order for the firm's triage: lower sorts first (most urgent). */
const URGENCY_ORDER: Urgency[] = ["emergency", "urgent", "soon", "routine", "unsure"];

/**
 * Rank of an urgency level for sorting — lower is more urgent. Unknown/garbage
 * levels sort after every known level so a bad value never jumps the queue.
 */
export function urgencyRank(level: string): number {
  const i = URGENCY_ORDER.indexOf(level as Urgency);
  return i === -1 ? URGENCY_ORDER.length : i;
}

/**
 * Return a new array sorted so escalating intakes (emergency, then urgent)
 * surface to the top, with ties preserving the input order (the API already
 * sorts newest-first). Pure: the input array is not mutated.
 */
export function sortIntakesByUrgency(intakes: IntakeSummary[]): IntakeSummary[] {
  return intakes
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const byUrgency = urgencyRank(a.row.urgency_level) - urgencyRank(b.row.urgency_level);
      return byUrgency !== 0 ? byUrgency : a.index - b.index;
    })
    .map((x) => x.row);
}

/** How many intakes are at an escalating level (emergency / urgent). */
export function escalatingCount(intakes: IntakeSummary[]): number {
  return intakes.filter((r) => isEscalatingUrgency(r.urgency_level as Urgency)).length;
}

/** "3 conflict parties" / "1 conflict party" — pluralized party count. */
function partyCountLabel(n: number): string {
  return `${n} conflict part${n === 1 ? "y" : "ies"}`;
}

/**
 * One-line summary for a list row: matter-area label, jurisdiction (dropped
 * when unknown), and the conflict-party count. Pure string mapping.
 */
export function intakeMetaLine(row: IntakeSummary): string {
  const parts = [matterAreaLabel(row.matter_area as MatterArea)];
  const jurisdiction = (row.jurisdiction ?? "").trim();
  if (jurisdiction) parts.push(jurisdiction);
  parts.push(partyCountLabel(row.conflict_count));
  return parts.join(" · ");
}

export interface IntakeFilter {
  /** Matter area id, or "all"/undefined for no area filter. */
  area?: string;
  /**
   * Urgency filter: a specific level, "escalating" (emergency OR urgent), or
   * "all"/undefined for no urgency filter.
   */
  urgency?: string;
}

/**
 * Filter a list of intakes by matter area and/or urgency. "all" (or an omitted
 * value) means no constraint; "escalating" matches emergency + urgent. Returns
 * a new array preserving input order.
 */
export function filterIntakes(intakes: IntakeSummary[], filter: IntakeFilter): IntakeSummary[] {
  const area = filter.area && filter.area !== "all" ? filter.area : null;
  const urgency = filter.urgency && filter.urgency !== "all" ? filter.urgency : null;
  return intakes.filter((r) => {
    if (area && r.matter_area !== area) return false;
    if (urgency) {
      if (urgency === "escalating") {
        if (!isEscalatingUrgency(r.urgency_level as Urgency)) return false;
      } else if (r.urgency_level !== urgency) {
        return false;
      }
    }
    return true;
  });
}
