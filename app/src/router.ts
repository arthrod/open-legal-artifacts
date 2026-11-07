// Minimal hash router for the static playground. No framework, no backend.
import { indexPage } from "./pages/index.js";
import { citeCheckPage } from "./pages/cite-check.js";
import { deviationBoardPage } from "./pages/deviation-board.js";
import { chronologyPage } from "./pages/chronology.js";
import { tabularReviewPage } from "./pages/tabular-review.js";

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
  const h = window.location.hash;
  if (!h || h === "#" || h === "#/") return "/";
  return h.replace(/^#/, "").replace(/\/+$/, "") || "/";
}

export function render(): void {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app missing");
  const page = routes[currentPath()] ?? notFound;
  app.replaceChildren(page());
  window.scrollTo(0, 0);
}

function notFound(): HTMLElement {
  return el(`<div class="page">
    <h1>Not found</h1>
    <p class="lede">No page at <code>${window.location.hash}</code>.</p>
    <p><a class="backlink" href="#/">← Back to the gallery</a></p>
  </div>`);
}
