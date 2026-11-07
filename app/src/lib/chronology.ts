// fact-chronology deterministic core.
// Sort dated facts into a timeline and flag conflicts where sources disagree.

export interface FactEntry {
  date: string; // ISO yyyy-mm-dd
  topic?: string; // entries sharing a topic are cross-checked
  fact: string; // what happened
  value?: string; // normalized claim about the topic, e.g. "terminated"
  source: string; // doc + pinpoint
}

export interface ChronologyItem extends FactEntry {
  conflictWith: string[]; // sources that disagree on this topic
}

export interface Chronology {
  timeline: ChronologyItem[]; // sorted by date ascending
  conflicts: number;
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

export function buildChronology(entries: FactEntry[]): Chronology {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const byTopic = new Map<string, Set<string>>();
  for (const e of sorted) {
    if (!e.topic || e.value === undefined) continue;
    const key = norm(e.topic);
    if (!byTopic.has(key)) byTopic.set(key, new Set());
    byTopic.get(key)!.add(norm(e.value));
  }
  const timeline: ChronologyItem[] = sorted.map((e) => {
    const topic = e.topic;
    const value = e.value;
    const conflicting =
      topic !== undefined &&
      value !== undefined &&
      (byTopic.get(norm(topic))?.size ?? 0) > 1;
    return {
      ...e,
      conflictWith:
        conflicting && topic !== undefined && value !== undefined
          ? sorted
              .filter(
                (o) =>
                  o.topic !== undefined &&
                  o.value !== undefined &&
                  norm(o.topic) === norm(topic) &&
                  norm(o.value) !== norm(value),
              )
              .map((o) => o.source)
          : [],
    };
  });
  const conflicts = timeline.filter((t) => t.conflictWith.length > 0).length;
  return { timeline, conflicts };
}

export const sampleFacts: FactEntry[] = [
  {
    date: "2026-02-03",
    topic: "employment-status",
    fact: "Employee signed the offer letter",
    value: "employed",
    source: "Offer letter, p.1 ¶2",
  },
  {
    date: "2026-06-14",
    topic: "warnings",
    fact: "Manager emailed a first written warning about missed deadlines",
    value: "one warning",
    source: "Email, M. Chen 2026-06-14",
  },
  {
    date: "2026-08-02",
    topic: "employment-status",
    fact: "HR memo states the employee 'resigned voluntarily'",
    value: "resigned",
    source: "HR memo 2026-08-02, p.2",
  },
  {
    date: "2026-08-03",
    topic: "employment-status",
    fact: "Termination letter cites 'misconduct' as the reason",
    value: "terminated",
    source: "Termination letter, Ex. A",
  },
  {
    date: "2026-08-15",
    fact: "Employee filed a charge with the labor board",
    source: "Charge no. 26-1187",
  },
];
