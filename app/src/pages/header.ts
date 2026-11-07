import { el } from "../router.js";

/** Shared page header for demo pages. */
export function demoHeader(opts: {
  title: string;
  lede: string;
  counterpart: string;
  better: string;
  repoName: string;
}): HTMLElement {
  return el(`<div class="page">
    <a class="backlink" href="#/">← All artifacts</a>
    <h1>${opts.title}</h1>
    <p class="lede">${opts.lede}</p>
    <div class="meta-grid">
      <div class="meta-box">
        <h3>Anthropic counterpart</h3>
        <p>${opts.counterpart}</p>
      </div>
      <div class="meta-box">
        <h3>What's better (open)</h3>
        <p>${opts.better}</p>
      </div>
      <div class="meta-box">
        <h3>Source</h3>
        <p><a href="../open-artifacts/${opts.repoName}/" rel="noopener">../open-artifacts/${opts.repoName}/</a> — spec, deterministic core, tests, MIT.</p>
      </div>
    </div>
  </div>`);
}
