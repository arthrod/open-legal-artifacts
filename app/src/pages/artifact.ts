// Per-artifact detail page — #/a/<name>, rendered from artifacts.json.
import { catalog, GITHUB, type OpenEntry, type OriginalEntry } from "../data/catalog.js";
import { el } from "../router.js";

/** Relative-from-dist path to an open-artifacts directory. */
function oaPath(name: string, tail = ""): string {
  return `../open-artifacts/${name}/${tail}`;
}

function originalPage(a: OriginalEntry): HTMLElement {
  return el(`<div class="page artifact">
    <a class="backlink" href="#/">← Catalog</a>
    <p class="eyebrow"><span class="eyebrow-rule"></span>Original · ${a.name}</p>
    <h1>${a.title}</h1>
    <p class="lede">${a.tagline}</p>
    <div class="meta-grid">
      <div class="meta-box">
        <h3>Live</h3>
        <p>${a.links.map((l) => `<a href="${l.url}" rel="noopener" target="_blank">${l.label}&nbsp;↗</a>`).join(" · ")}</p>
      </div>
      <div class="meta-box">
        <h3>Source</h3>
        <p><a href="${GITHUB}/tree/main/${a.repoDir}" rel="noopener" target="_blank">${a.repoDir}/&nbsp;↗</a></p>
      </div>
      <div class="meta-box">
        <h3>License</h3>
        <p>MIT — read the code, not just the demo.</p>
      </div>
    </div>
  </div>`);
}

function openPage(a: OpenEntry): HTMLElement {
  const links: string[] = [];
  if (a.hasDemo) {
    links.push(
      `<a href="${oaPath(a.name, "demo/index.html")}" rel="noopener" target="_blank">Demo&nbsp;↗</a>`,
    );
  }
  if (a.hasSpec) {
    links.push(`<a href="${oaPath(a.name, "spec.md")}" rel="noopener" target="_blank">Spec&nbsp;↗</a>`);
  }
  if (a.hasReadme) {
    links.push(`<a href="${oaPath(a.name)}" rel="noopener" target="_blank">README&nbsp;↗</a>`);
  }
  if (a.inAppDemo) {
    links.push(`<a href="${a.inAppDemo}">In-app demo&nbsp;→</a>`);
  }

  const category =
    a.category === "original-idea"
      ? "◆ original idea"
      : a.category === "partner-built"
        ? "partner-built counterpart"
        : "anthropic-built counterpart";

  return el(`<div class="page artifact">
    <a class="backlink" href="#/">← Catalog</a>
    <p class="eyebrow"><span class="eyebrow-rule"></span>${a.name}</p>
    <h1>${a.title}</h1>
    <p class="lede">${a.tagline}</p>
    <div class="meta-grid">
      <div class="meta-box">
        <h3>Category</h3>
        <p>${category}</p>
      </div>
      <div class="meta-box">
        <h3>Anthropic counterpart</h3>
        <p>${a.anthropicCounterpart ?? "—"}</p>
      </div>
      <div class="meta-box">
        <h3>Status</h3>
        <p>${a.status}</p>
      </div>
    </div>
    <div class="detail-links">${links.join("")}</div>
    <p class="note">Open-artifact links resolve relative to the deployed
      <code>dist/</code> build; they open the repo checkout served alongside it.</p>
  </div>`);
}

export function artifactPage(name: string): HTMLElement {
  const open = catalog.open.find((a) => a.name === name);
  if (open) return openPage(open);
  const original = catalog.originals.find((a) => a.name === name);
  if (original) return originalPage(original);
  return el(`<div class="page">
    <h1>Not found</h1>
    <p class="lede">No artifact named <code>${name}</code> in the catalog.</p>
    <p><a class="backlink" href="#/">← Back to the catalog</a></p>
  </div>`);
}
