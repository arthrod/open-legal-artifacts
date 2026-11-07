import {
  arthurOriginals,
  openReimplementations,
  fullGallery,
  GITHUB,
} from "../data/catalog.js";
import { el } from "../router.js";

export function indexPage(): HTMLElement {
  const root = el(`<div class="page index">
    <section class="hero">
      <h1>Open Legal Artifacts</h1>
      <p class="tagline">Every legal AI artifact, open and better.</p>
    </section>
  </div>`);

  // Arthur's originals
  const arthur = el(`<section class="section">
    <h2>Arthur's originals</h2>
    <p class="section-sub">Running in production today — live demos and source.</p>
    <div class="cards"></div>
  </section>`);
  const arthurCards = arthur.querySelector(".cards")!;
  for (const a of arthurOriginals) {
    arthurCards.appendChild(
      el(`<article class="card">
        <h3>${a.name}</h3>
        <p>${a.blurb}</p>
        <div class="card-links">
          ${a.live ? `<a href="${a.live}" rel="noopener">Live demo ↗</a>` : ""}
          <a href="${GITHUB}/tree/main/${a.repo}" rel="noopener">Repo dir ↗</a>
        </div>
      </article>`),
    );
  }

  // Open reimplementations
  const open = el(`<section class="section">
    <h2>Open reimplementations</h2>
    <p class="section-sub">Phase 1: deterministic cores, mock/recorded data, MIT. Each has an interactive demo in this app and a spec + core in the repo.</p>
    <div class="cards"></div>
  </section>`);
  const openCards = open.querySelector(".cards")!;
  for (const r of openReimplementations) {
    openCards.appendChild(
      el(`<article class="card">
        <span class="badge">Phase 1 · interactive demo</span>
        <h3>${r.title}</h3>
        <p>${r.blurb}</p>
        <div class="card-links">
          <a href="${r.route}">In-app demo →</a>
          <a href="../open-artifacts/${r.name}/">../open-artifacts/${r.name}/ ↗</a>
        </div>
      </article>`),
    );
  }

  // Full gallery (other 28)
  const gallery = el(`<section class="section">
    <h2>The full gallery</h2>
    <p class="section-sub">The remaining 28 artifacts in Anthropic's Claude for Legal gallery (22 Anthropic-built + 10 partner-built, minus the 4 in phase 1 above) — queued for open reimplementation in phase 2.</p>
    <div class="cards"></div>
  </section>`);
  const galleryCards = gallery.querySelector(".cards")!;
  for (const g of fullGallery) {
    galleryCards.appendChild(
      el(`<article class="card">
        <span class="badge phase2">Phase 2 · ${g.builtBy}</span>
        <h3>${g.name}</h3>
        <p>${g.oneLiner}</p>
      </article>`),
    );
  }

  root.append(arthur, open, gallery);
  return root;
}
