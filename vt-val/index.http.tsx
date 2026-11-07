// Open Legal Artifacts — centralized playground on Val Town.
// Routes:
//   /                                      → landing catalog (site/index.html, inlined)
//   /a/<artifact>                          → one self-contained page per artifact
//   /course/*                              → prompting-for-attorneys static course files
//   /open-artifacts/<n>/demo/index.html    → gh-pages-compatible alias
import { readFile } from "https://esm.town/v/std/utils/index.ts";

const ARTIFACTS = [
  // open reimplementations (single-file bundles in site/)
  "access-to-justice-front-door",
  "ai-governance-benchmark",
  "ai-use-case-inventory",
  "ask-legal",
  "cite-check",
  "criminal-charge-reality-check",
  "discovery-response-log",
  "docket-watch-wall",
  "entity-compliance-calendar",
  "eviction-notice-check-board",
  "fact-chronology",
  "immigration-papers-reader",
  "intake-benchmark",
  "intake-queue",
  "jurisdiction-survey-matrix",
  "limitations-radar",
  "litigation-portfolio",
  "matter-board",
  "obligations-checker",
  "outside-counsel-spend",
  "patent-claim-comparison",
  "playbook-deviation-board",
  "privilege-log-builder",
  "pro-bono-case-board",
  "record-clearance",
  "record-sealing-screener",
  "regulatory-horizon-scan",
  "renewal-calendar",
  "rent-ledger-reviewer",
  "sell-side-qa-log",
  "subpoena-response",
  "tabular-review",
  "venture-term-sheet-benchmark",
  // originals (bundled single-file demos where present; course served from course/)
  "client-intake",
  "contracts-playbook",
  "pii-ptbr-lgpd",
];

const COURSE_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  woff2: "font/woff2",
  woff: "font/woff",
  otf: "font/otf",
  txt: "text/plain; charset=utf-8",
  json: "application/json",
};

async function page(path: string): Promise<Response> {
  try {
    const html = await readFile(path, import.meta.url);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export default async function (req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, "") || "/";

  if (p === "/" || p === "/index.html") return page("/site/index.html");

  // prompting-for-attorneys course (multi-file static app).
  // Redirect (not rewrite) so the browser's base URL is /course/ and the
  // app's relative asset paths (js/, css/) resolve correctly.
  if (p === "/a/prompting-for-attorneys" || p === "/open-artifacts/prompting-for-attorneys/demo/index.html") {
    return new Response(null, { status: 302, headers: { Location: "/course/" } });
  }
  if (p === "/course" || p.startsWith("/course/")) {
    const rel = (p === "/course" ? "" : p.slice("/course/".length)).replace(/\.\./g, "");
    const target = rel === "" ? "index.html" : rel;
    const ext = target.split(".").pop() ?? "";
    try {
      const body = await readFile(`/course/${target}`, import.meta.url);
      return new Response(body, {
        headers: { "content-type": COURSE_TYPES[ext] ?? "application/octet-stream" },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  // single-file artifact pages
  const m = p.match(/^\/a\/([a-z0-9-]+)$/);
  if (m && (ARTIFACTS.includes(m[1]))) return page(`/site/${m[1]}.html`);

  // gh-pages-compatible demo-path alias
  const dm = p.match(/^\/open-artifacts\/([a-z0-9-]+)\/demo\/(index\.html)?$/);
  if (dm && ARTIFACTS.includes(dm[1])) return page(`/site/${dm[1]}.html`);

  // Legacy bare-path aliases → /a/<name>
  const bare = p.slice(1);
  if (ARTIFACTS.includes(bare)) {
    return new Response(null, { status: 302, headers: { Location: `/a/${bare}` } });
  }

  return new Response("Open Legal Artifacts — not found", { status: 404 });
};
