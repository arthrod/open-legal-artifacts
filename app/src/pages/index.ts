// Landing page — the centralized "Open Legal Artifacts" catalog.
// Open section: sticky filter/search toolbar, reader-question grouping at
// rest, flat results grid + count when a filter or query is active.
// State lives only in the hash (`#/?area=<slug>&q=<term>`) — one-way flow:
// hash → parseState → render; controls rewrite the hash via replaceState
// and re-render explicitly (replaceState fires no hashchange).
import { catalog, GITHUB, PRACTICE_AREAS, READER_QUESTIONS } from "../data/catalog.js";
import { el, render, currentQuery } from "../router.js";
import { parseState, serializeState, filterOpen, nextStateOnSearch, type IndexState } from "../lib/index-filter.js";

const AREA_IDS = new Set(PRACTICE_AREAS.map((a) => a.id));

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Provenance glyph + word (D5): never glyph-only — `title` keeps the full text. */
function prov(category: string): string {
  const label =
    category === "original-idea"
      ? "◆ original idea"
      : category === "partner-built"
        ? "◇ partner-built"
        : "◇ anthropic-built";
  return `<span class="prov" title="${esc(label.replace(/[◆◇] /, ""))}">${label}</span>`;
}

/**
 * Single update path for every control: write the hash, re-render, then
 * restore focus (search input keeps focus + caret across re-renders; the
 * clicked filter button is re-focused for keyboard users).
 */
function applyState(next: IndexState, focus: { kind: "search" } | { kind: "filter"; area: string | null }): void {
  history.replaceState(null, "", serializeState(next));
  render();
  if (focus.kind === "search") {
    const input = document.querySelector<HTMLInputElement>(".index-tools input[type='search']");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  } else {
    document
      .querySelector<HTMLButtonElement>(`.filter-btn[data-area="${focus.area ?? ""}"]`)
      ?.focus();
  }
}

function buildToolbar(state: IndexState): HTMLElement {
  const toolbar = el(`<section class="index-tools" aria-label="Filter and search artifacts">
    <label class="visually-hidden" for="index-search">Search artifacts</label>
    <input type="search" id="index-search" placeholder="Search title, tagline, counterpart…"
      value="${esc(state.q)}" autocomplete="off">
    <div class="filter-row" role="group" aria-label="Filter by practice area">
      <button type="button" class="filter-btn" data-area="" aria-pressed="${state.area === null}">All</button>
      ${PRACTICE_AREAS.map(
        (a) =>
          `<button type="button" class="filter-btn" data-area="${a.id}" aria-pressed="${state.area === a.id}" title="${esc(a.label)}">${esc(a.filterLabel)}</button>`,
      ).join("")}
    </div>
  </section>`);

  let timer: number | undefined;
  const input = toolbar.querySelector<HTMLInputElement>("#index-search")!;
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      // Typing is search intent: clear the inherited area filter so a
      // known artifact is never a false negative (plan item 2).
      applyState(nextStateOnSearch(state, input.value), { kind: "search" });
    }, 150);
  });

  for (const btn of toolbar.querySelectorAll<HTMLButtonElement>(".filter-btn")) {
    btn.addEventListener("click", () => {
      window.clearTimeout(timer);
      const area = btn.dataset.area || null;
      applyState({ area, q: state.q }, { kind: "filter", area });
    });
  }
  return toolbar;
}

/** One open tile (shared by grouped and flat views). */
function tile(a: (typeof catalog)["open"][number]): HTMLElement {
  return el(`<article class="tile${a.category === "original-idea" ? " tile-striped" : ""}">
    <div class="tile-top">
      ${prov(a.category)}
      <span class="tile-meta">${esc(a.status)}</span>
    </div>
    <h3 class="tile-title"><a href="#/a/${a.name}">${a.title}</a></h3>
    <p class="tile-desc">${a.tagline}</p>
    <div class="tile-links">
      ${a.hasDemo ? `<a href="open-artifacts/${a.name}/demo/index.html" rel="noopener" target="_blank">Demo&nbsp;↗</a>` : ""}
      <a href="${GITHUB}/tree/main/open-artifacts/${a.name}" rel="noopener" target="_blank">Repo&nbsp;↗</a>
      <a href="#/a/${a.name}">Details&nbsp;→</a>
    </div>
  </article>`);
}

export function indexPage(): HTMLElement {
  const { originals, open, external, counts } = catalog;
  const state = parseState(currentQuery(), AREA_IDS);
  const filtering = state.area !== null || state.q !== "";

  const root = el(`<div class="page index">
    <section class="hero">
      <p class="eyebrow"><span class="eyebrow-rule"></span>Arthur Souza Rodrigues · open source</p>
      <h1>Open Legal Artifacts</h1>
      <div class="rule-yellow" role="presentation"></div>
      <p class="intro">
        Every legal AI artifact, open and better. Arthur's originals running in
        production, an open counterpart for every artifact in Anthropic's Claude
        for Legal gallery — deterministic cores where code beats guessing,
        rules-as-data where law is the logic — adjacent benchmarks linked, not
        forked. Everything MIT.
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
    <div class="cards cards-2col"></div>
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
  </section>`);
  openSection.appendChild(buildToolbar(state));

  if (filtering) {
    const results = filterOpen(open, state);
    const areaLabel = state.area ? PRACTICE_AREAS.find((a) => a.id === state.area)!.filterLabel : null;
    const parts = [`${results.length} of ${open.length}`];
    if (areaLabel) parts.push(areaLabel);
    if (state.q) parts.push(`matches “${state.q}”`);
    openSection.appendChild(el(`<p class="result-count" aria-live="polite">${esc(parts.join(" · "))}</p>`));

    // Deep-link confirmation: landing on #/?area=x applies a filter the user
    // never chose — the count line announces *that* results are filtered;
    // this says *what* is active and offers the one-click way out.
    if (state.area !== null) {
      const active = el(`<div class="filter-active">
        <span>Filtered: <strong>${esc(areaLabel ?? state.area)}</strong>${state.q ? ` · “${esc(state.q)}”` : ""}</span>
        <button type="button" class="filter-clear" data-action="clear">Clear</button>
      </div>`);
      active.querySelector("button[data-action='clear']")!.addEventListener("click", () => {
        location.hash = "#/";
      });
      openSection.appendChild(active);
    }

    if (results.length === 0) {
      const where = areaLabel ? ` in ${areaLabel}` : "";
      // Deep-link escape: if the query matches outside the inherited area,
      // offer the unfiltered view (reuses filterOpen — no new helper).
      const allCount = filterOpen(open, { area: null, q: state.q }).length;
      const empty = el(`<div class="empty-state">
        <p>No matches for ‘${esc(state.q)}’${where}.</p>
        <button type="button" class="secondary" data-action="clear">Clear search and filters</button>
        ${allCount > 0 ? `<button type="button" class="secondary" data-action="show-all">${allCount} match${allCount === 1 ? "" : "es"} in all categories → show them</button>` : ""}
      </div>`);
      empty.querySelector("button[data-action='clear']")!.addEventListener("click", () => {
        location.hash = "#/";
      });
      empty.querySelector("button[data-action='show-all']")?.addEventListener("click", () => {
        location.hash = serializeState({ area: null, q: state.q });
      });
      openSection.appendChild(empty);
    } else {
      const cards = el(`<div class="cards"></div>`);
      for (const a of results) cards.appendChild(tile(a));
      openSection.appendChild(cards);
    }
  } else {
    // At rest: reading order via 4 reader-question groups (D3) — grouping is
    // a display mode, never a control; it collapses the moment a filter or
    // search is active.
    for (const q of READER_QUESTIONS) {
      const group = open.filter((a) => a.readerQuestion === q.id);
      const groupEl = el(`<div class="q-group">
        <div class="group-head">
          <h3 class="group-title">${esc(q.label)}</h3>
          <span class="group-count">${group.length}</span>
        </div>
        <p class="group-caption">${esc(q.caption)}</p>
        <div class="cards"></div>
      </div>`);
      const cards = groupEl.querySelector(".cards")!;
      for (const a of group) cards.appendChild(tile(a));
      openSection.appendChild(groupEl);
    }
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
