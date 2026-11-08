// Pure 404-page helpers (item 1): extract the attempted artifact slug from a
// failed route and rank catalog suggestions. DOM-free so it can be
// smoke-tested with plain node; the router renders it, this module never
// touches the DOM.

/**
 * Extract the likely artifact slug from a failed route.
 * - query string and leading `#` dropped
 * - `/open-artifacts/<x>/demo/(index.html)?` → `<x>`
 * - otherwise the last non-empty path segment, `.html` stripped
 * - decodeURIComponent'd, then clamped to [a-z0-9-] and 60 chars
 * Empty string is allowed (no slug to show).
 */
export function attemptedSlug(path: string): string {
  const p = path.split("?")[0].replace(/^#/, "");
  const demo = p.match(/^\/open-artifacts\/([a-z0-9-]*)\/demo(\/index\.html?)?\/?$/i);
  let last: string;
  if (demo) {
    last = demo[1];
  } else {
    const segs = p.replace(/\/+$/, "").split("/").filter(Boolean);
    last = segs.length ? segs[segs.length - 1] : "";
  }
  last = last.replace(/\.html?$/i, "");
  try {
    last = decodeURIComponent(last);
  } catch {
    // malformed escape sequence — keep the raw segment
  }
  return last.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
}

/** Relevance of `name` to a typo'd `slug`: substring > token overlap > common prefix. */
function relevance(slug: string, name: string): number {
  if (slug === name) return 1000;
  if (name.includes(slug) || slug.includes(name)) return 500;
  let score = 0;
  const st = new Set(slug.split("-").filter(Boolean));
  const overlap = name
    .split("-")
    .filter(Boolean)
    .filter((t) => st.has(t)).length;
  if (overlap) score = 100 + overlap * 10;
  let prefix = 0;
  while (prefix < slug.length && prefix < name.length && slug[prefix] === name[prefix]) prefix++;
  if (prefix >= 2) score = Math.max(score, 10 + prefix);
  return score;
}

/**
 * Top-3 artifact-name suggestions for a failed slug, most relevant first
 * (ties broken alphabetically — deterministic). Fewer than 3 relevant names
 * (or an empty/unmatched slug) → padded from `names`' default order.
 */
export function suggestArtifacts(slug: string, names: string[]): string[] {
  const defaults = names.slice(0, 3);
  const out = names
    .map((name) => ({ name, score: relevance(slug, name) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, 3)
    .map((x) => x.name);
  for (const d of defaults) {
    if (out.length >= 3) break;
    if (!out.includes(d)) out.push(d);
  }
  return out;
}
