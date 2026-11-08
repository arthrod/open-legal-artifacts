/**
 * Deterministic grounding selection for /api/ask-legal: which approved KB
 * entries enter the LLM prompt. Lean re-implementation of the ask-legal
 * core's retrieval idea (tags weigh most, then question-title overlap, then
 * answer overlap; plural-folded tokens) — kept small because the live KB is
 * small. Same question ⇒ same selection, so prompts are auditable.
 */

export interface KbEntry {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  jurisdiction?: string | null;
  updated?: string | null;
  approvedBy?: string | null;
  /** entries with any other status are invisible (pending corrections) */
  status?: string;
}

export interface GroundingHit {
  entry: KbEntry;
  score: number;
  /** folded query terms that matched (tags or text) */
  matched: string[];
}

const STOPWORDS = new Set(
  "a an the is are was were be been being of for to in on at by with about into from as that this it its do does did can could should would will shall may might must need needs i we you our your their what when where who whom how which and or if not no yes".split(" "),
);

function tokenize(s: string): string[] {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Conservative plural fold: "vendors" → "vendor", "classes" → "class", "policies" → "policy". */
export function foldToken(t: string): string {
  if (t.endsWith("ies") && t.length > 4) return t.slice(0, -3) + "y";
  if (t.length > 4 && /(?:x|z|ch|sh|ss)es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss") && t.length > 3) return t.slice(0, -1);
  return t;
}

/**
 * Score each servable entry:
 *   2 × tag hit (exact or plural-folded) + 2 × question-title token overlap
 *   + 1 × answer token overlap. Score > 0 required; ranked best first,
 *   ties broken by id (stable). `limit` (default 4) caps prompt size.
 */
export function selectGrounding(kb: KbEntry[], question: string, opts: { limit?: number } = {}): GroundingHit[] {
  const limit = Math.max(0, opts.limit ?? 4);
  const qFolded = new Set(tokenize(question).map(foldToken));
  if (limit === 0 || qFolded.size === 0) return [];

  const hits: GroundingHit[] = [];
  for (const entry of kb ?? []) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.status && entry.status !== "approved") continue; // pending corrections are invisible
    const matched: string[] = [];
    let score = 0;
    for (const tag of entry.tags ?? []) {
      const f = foldToken(String(tag).toLowerCase());
      if (qFolded.has(f)) {
        score += 2;
        matched.push(f);
      }
    }
    const qText = new Set(tokenize(entry.question ?? "").map(foldToken));
    const aText = new Set(tokenize(entry.answer ?? "").map(foldToken));
    for (const t of qFolded) {
      if (qText.has(t)) {
        score += 2;
        matched.push(t);
      } else if (aText.has(t)) {
        score += 1;
        matched.push(t);
      }
    }
    if (score > 0) hits.push({ entry, score, matched: [...new Set(matched)] });
  }
  hits.sort((a, b) => b.score - a.score || String(a.entry.id).localeCompare(String(b.entry.id)));
  return hits.slice(0, limit);
}
