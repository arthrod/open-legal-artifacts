// Minimal hash router for the static playground. No framework, no backend.
import { indexPage } from "./pages/index.js";
import { artifactPage } from "./pages/artifact.js";
import { citeCheckPage } from "./pages/cite-check.js";
import { deviationBoardPage } from "./pages/deviation-board.js";
import { chronologyPage } from "./pages/chronology.js";
import { tabularReviewPage } from "./pages/tabular-review.js";
import { catalog } from "./data/catalog.js";
import { serializeState } from "./lib/index-filter.js";
import { attemptedSlug, suggestArtifacts } from "./lib/notfound.js";

export type PageFactory = () => HTMLElement;

export const routes: Record<string, PageFactory> = {
  "/": indexPage,
  "/cite-check": citeCheckPage,
  "/deviation-board": deviationBoardPage,
  "/chronology": chronologyPage,
  "/tabular-review": tabularReviewPage,
};

/** Create an element from an HTML string (first element only). */
export function el(html: string): HTMLElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  const node = tpl.content.firstElementChild;
  if (!(node instanceof HTMLElement)) throw new Error("el(): no element in template");
  return node;
}

export function currentPath(): string {
  const p = window.location.hash.split("?")[0];
  if (!p || p === "#" || p === "#/") return "/";
  return p.replace(/^#/, "").replace(/\/+$/, "") || "/";
}

/** Query params of the current hash route (e.g. `#/?area=x&q=y`). */
export function currentQuery(): URLSearchParams {
  const h = window.location.hash;
  const i = h.indexOf("?");
  return new URLSearchParams(i >= 0 ? h.slice(i + 1) : "");
}

let lastRenderedPath: string | null = null;

export function render(): void {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app missing");

  const path = currentPath();
  let page: HTMLElement;
  const detail = path.match(/^\/a\/([^/]+)$/);
  if (detail) {
    page = artifactPage(decodeURIComponent(detail[1]));
  } else {
    const factory = routes[path];
    page = factory ? factory() : notFound();
  }
  app.replaceChildren(page);
  // Reset scroll on route change — but never when only the index query
  // (filter/search) changed, so typing doesn't scroll-jump.
  if (lastRenderedPath !== "/" || path !== "/") {
    window.scrollTo(0, 0);
  }
  lastRenderedPath = path;
}

export function notFound(): HTMLElement {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const hash = window.location.hash;
  const slug = attemptedSlug(hash);
  // default suggestion order: the static trio first (empty/unmatched slug)
  const names = [
    ...new Set([
      "cite-check",
      "tabular-review",
      "fact-chronology",
      ...catalog.open.map((a) => a.name),
      ...catalog.originals.map((a) => a.name),
    ]),
  ];
  const suggestions = suggestArtifacts(slug, names);

  const page = el(`<div class="page">
    <p class="eyebrow"><span class="eyebrow-rule"></span>Arthur Souza Rodrigues · open source</p>
    <h1>Not found</h1>
    <div class="rule-yellow" role="presentation"></div>
    <p class="lede">No page at <code>${esc(hash)}</code>.</p>
    <section class="index-tools" aria-label="Search artifacts">
      <label class="visually-hidden" for="notfound-search">Search artifacts</label>
      <input type="search" id="notfound-search" placeholder="Search artifacts…"
        value="${esc(slug)}" autocomplete="off">
    </section>
    <p>Try one of these instead:</p>
    <ul class="detail-links">
      ${suggestions.map((n) => `<li><a href="#/a/${n}">${n}</a></li>`).join("")}
    </ul>
    <p><a class="backlink" href="#/">← Back to the catalog</a></p>
    <p class="result-count">404 · ${esc(hash)} · catalog v${catalog.counts.open} artifacts</p>
  </div>`);
  page.querySelector<HTMLInputElement>("#notfound-search")!.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = (e.target as HTMLInputElement).value.trim();
    if (q) location.hash = serializeState({ area: null, q });
  });
  return page;
}
