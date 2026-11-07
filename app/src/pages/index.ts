// Landing page — the centralized "Open Legal Artifacts" catalog.
import { catalog, GITHUB } from "../data/catalog.js";
import { el } from "../router.js";

function chip(category: string): string {
  const label =
    category === "original-idea"
      ? "◆ original idea"
      : category === "partner-built"
        ? "partner-built"
        : "anthropic-built";
  return `<span class="chip${category === "original-idea" ? " chip-original" : ""}">${label}</span>`;
}

export function indexPage(): HTMLElement {
  const { originals, open, external, counts } = catalog;

  const root = el(`<div class="page index">
    <section class="hero">
      <p class="eyebrow"><span class="eyebrow-rule"></span>Arthur Souza Rodrigues · open source</p>
      <h1>Open Legal Artifacts</h1>
      <div class="rule-yellow" role="presentation"></div>
      <p class="intro">
        Every legal AI artifact, open and better. Arthur's originals running in
        production, an open counterpart for every artifact in Anthropic's Claude
        for Legal gallery — deterministic cores where code beats guessing,
        rules-as-data where law is the logic — and the adjacent benchmarks and
        datasets that already have a better home elsewhere, linked, not forked.
        Everything MIT.
      </p>
      <p class="counts">${counts.originals} originals · ${counts.open} open artifacts · ${counts.external} external</p>
    </section>
  </div>`);

  /* ---- Originals ---- */
  const orig = el(`<section class="section">
    <div class="section-head">
      <h2 class="section-title">/ Originals — Arthur's projects</h2>
      <span class="section-meta">${originals.length}</span>
    </div>
    <p class="section-sub">Running in production today — live demos, source in this repo.</p>
    <div class="cards"></div>
  </section>`);
  const origCards = orig.querySelector(".cards")!;
  for (const a of originals) {
    origCards.appendChild(
      el(`<article class="tile tile-striped">
        <div class="tile-top">
          <span class="tile-meta">original</span>
          <span class="tile-meta">${a.name}</span>
        </div>
        <h3 class="tile-title"><a href="#/a/${a.name}">${a.title}</a></h3>
        <p class="tile-desc">${a.tagline}</p>
        <div class="tile-links">
          ${a.links
            .map((l) => `<a href="${l.url}" rel="noopener" target="_blank">${l.label}&nbsp;↗</a>`)
            .join("")}
          <a href="${GITHUB}/tree/main/${a.repoDir}" rel="noopener" target="_blank">Repo&nbsp;↗</a>
        </div>
      </article>`),
    );
  }
  root.appendChild(orig);

  /* ---- Open reimplementations ---- */
  const openSection = el(`<section class="section">
    <div class="section-head">
      <h2 class="section-title">/ Open reimplementations</h2>
      <span class="section-meta">${open.length} artifacts · ${counts.originalIdeas} original ideas</span>
    </div>
    <p class="section-sub">
      One open counterpart per Anthropic-gallery artifact, plus ideas that started here.
      Deterministic cores, specs, and demos — all MIT.
    </p>
    <div class="cards"></div>
  </section>`);
  const openCards = openSection.querySelector(".cards")!;
  for (const a of open) {
    openCards.appendChild(
      el(`<article class="tile${a.category === "original-idea" ? " tile-striped" : ""}">
        <div class="tile-top">
          ${chip(a.category)}
          <span class="tile-meta">${a.status}</span>
        </div>
        <h3 class="tile-title"><a href="#/a/${a.name}">${a.title}</a></h3>
        <p class="tile-desc">${a.tagline}</p>
        <div class="tile-links">
          ${a.hasDemo ? `<a href="open-artifacts/${a.name}/demo/index.html" rel="noopener" target="_blank">Demo&nbsp;↗</a>` : ""}
          <a href="${GITHUB}/tree/main/open-artifacts/${a.name}" rel="noopener" target="_blank">Repo&nbsp;↗</a>
          <a href="#/a/${a.name}">Details&nbsp;→</a>
        </div>
      </article>`),
    );
  }
  root.appendChild(openSection);

  /* ---- External catalog ---- */
  const ext = el(`<section class="section">
    <div class="section-head">
      <h2 class="section-title">/ External catalog</h2>
      <span class="section-meta">link, don't fork</span>
    </div>
    <p class="section-sub">
      Benchmarks, datasets, and tooling that already have a better home — linked,
      not forked.
    </p>
    <div class="ext-list"></div>
  </section>`);
  const extList = ext.querySelector(".ext-list")!;
  for (const x of external) {
    extList.appendChild(
      el(`<div class="ext-row">
        <div class="ext-main">
          <span class="ext-name">${x.title}</span>
          <p class="ext-blurb">${x.blurb}</p>
        </div>
        <div class="ext-links">
          ${x.links
            .map((l) => `<a href="${l.url}" rel="noopener" target="_blank">${l.label}&nbsp;↗</a>`)
            .join("")}
        </div>
      </div>`),
    );
  }
  root.appendChild(ext);

  return root;
}
