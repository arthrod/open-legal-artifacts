// Pure 404-page HTML builder for the Val Town val (item 1b).
// Self-contained — no imports, no JS in the page — so the val can serve it
// and plain-node smoke tests can assert on it. Recovery path is the
// catalog-search link; suggestions are the static common-artifact quartet.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Same slug rules as the SPA's app/src/lib/notfound.ts (simplified copy — the val cannot import app code). */
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

const SUGGESTIONS: Array<[name: string, tagline: string]> = [
  ["cite-check", "quote-level cite verification against the source text"],
  ["tabular-review", "multi-document Q&A on a grid of cited quotes"],
  ["deviation-board", "contract clauses scored against a playbook"],
  ["fact-chronology", "conflicting facts on one timeline"],
];

export function notFoundHtml(p: string): string {
  const slug = attemptedSlug(p);
  const ePath = escapeHtml(p);
  const eSlug = escapeHtml(slug);
  const searchLink = slug
    ? `<a href="/#/?q=${encodeURIComponent(slug)}" style="color:#0a0a0a;font-weight:700;">Search the catalog for \u201c${eSlug}\u201d</a>`
    : `<a href="/#/?q=" style="color:#0a0a0a;font-weight:700;">Search the catalog</a>`;
  const links = SUGGESTIONS.map(
    ([name, tagline]) =>
      `<li style="margin:0 0 10px;"><a href="/a/${name}" style="color:#0a0a0a;font-weight:700;">${name}</a><br><span style="color:#6b6b6b;">${escapeHtml(tagline)}</span></li>`,
  ).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Not found \u00b7 open\u00b7legal\u00b7artifacts</title>
</head>
<body style="margin:0;background:#fafaf8;color:#0a0a0a;font-family:'Manrope',system-ui,sans-serif;">
<header style="border-bottom:1px solid #e8e8e5;">
<div style="max-width:1100px;margin:0 auto;padding:12px 20px;font-family:ui-monospace,'JetBrains Mono',monospace;font-size:12px;letter-spacing:.08em;"><a href="/" style="color:#0a0a0a;text-decoration:none;">open\u00b7legal\u00b7artifacts</a></div>
</header>
<main style="max-width:780px;margin:0 auto;padding:4.5rem 20px 3rem;">
<p style="font-family:ui-monospace,'JetBrains Mono',monospace;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b6b6b;margin:0 0 1.4rem;">Arthur Souza Rodrigues \u00b7 open source</p>
<h1 style="font-size:clamp(2.2rem,6vw,3.4rem);font-weight:700;letter-spacing:-.025em;line-height:1.08;margin:0 0 1.4rem;">Not found</h1>
<div style="height:2px;width:56px;background:#ffd400;margin:0 0 1.4rem;"></div>
<p style="font-size:17px;line-height:1.65;color:#6b6b6b;max-width:65ch;margin:0 0 1.6rem;">No page at <code style="font-family:ui-monospace,'JetBrains Mono',monospace;font-size:15px;">${ePath}</code>. ${searchLink} \u2014 or start from a common artifact:</p>
<ul style="list-style:none;padding:0;margin:0 0 2rem;font-size:14px;line-height:1.5;">
${links}
</ul>
<p style="font-family:ui-monospace,'JetBrains Mono',monospace;font-size:11px;color:#6b6b6b;margin:0;">GET ${ePath} \u00b7 404 \u00b7 text/html</p>
</main>
</body>
</html>`;
}
