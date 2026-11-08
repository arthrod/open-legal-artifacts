// Pure index-state and filter/search logic for the catalog landing page.
// Self-contained (no imports) so it can be smoke-tested with plain node.

export interface IndexState {
  /** Practice-area id, or null for All. */
  area: string | null;
  /** Raw search query (already trimmed by parseState). */
  q: string;
}

/** Parse hash query params into state. Fail-soft: unknown/empty values → All. */
export function parseState(query: URLSearchParams, validAreas: ReadonlySet<string>): IndexState {
  let area: string | null = null;
  let q = "";
  for (const [key, value] of query) {
    // duplicate params: last one wins
    if (key === "area") area = validAreas.has(value) ? value : null;
    else if (key === "q") q = value.trim();
  }
  return { area, q };
}

/** Serialize state to the canonical hash: `#/`, `#/?area=…`, `#/?q=…`, `#/?area=…&q=…`. */
export function serializeState(state: IndexState): string {
  const params: string[] = [];
  if (state.area) params.push(`area=${encodeURIComponent(state.area)}`);
  if (state.q) params.push(`q=${encodeURIComponent(state.q)}`);
  return params.length ? `#/?${params.join("&")}` : "#/";
}

/**
 * Next index state after a search-box edit (item 2 decision):
 * typing a query clears the inherited area filter (kills the silent
 * AND-condition false negative); deleting all text returns to the
 * deliberately-clicked filter view. Filter clicks keep `q` — explicit
 * action wins; only typing clears `area`.
 */
export function nextStateOnSearch(prev: IndexState, q: string): IndexState {
  const trimmed = q.trim();
  return trimmed ? { area: null, q: trimmed } : { area: prev.area, q: "" };
}

/** Searchable fields concatenated for matching (D7). */
function haystack(a: {
  title: string;
  tagline: string;
  name: string;
  anthropicCounterpart: string | null;
}): string {
  return `${a.title} ${a.tagline} ${a.name} ${a.anthropicCounterpart ?? ""}`.toLowerCase();
}

/** Case-insensitive substring AND-match: every whitespace-separated term must hit. */
export function matchesQuery(
  a: { title: string; tagline: string; name: string; anthropicCounterpart: string | null },
  q: string,
): boolean {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = haystack(a);
  return terms.every((t) => hay.includes(t));
}

/** Filter the open list by state (area AND query). */
export function filterOpen<T extends { practiceArea: string; title: string; tagline: string; name: string; anthropicCounterpart: string | null }>(
  open: T[],
  state: IndexState,
): T[] {
  return open.filter(
    (a) => (!state.area || a.practiceArea === state.area) && matchesQuery(a, state.q),
  );
}
