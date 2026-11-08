/**
 * intake-benchmark — practice-area canon library (named entry point).
 *
 * The canon DATA lives in core.js on purpose: the demo's single relative
 * import of core.js is inlined as a data-URL module by deploy/build-site.mjs,
 * and a nested relative import inside such a module cannot resolve in
 * browsers. This module re-exports the canon API so Node callers (and tests)
 * can import it under its domain name; in the browser, import the same API
 * from core.js directly.
 *
 * Each canon field is tagged with a risk_class:
 *   - 'deadline': drives a clock (notice, hearing, filing, limitations) —
 *     scored as `deadline_capture`.
 *   - 'conflict': feeds the conflicts check (adverse parties, prior counsel)
 *     — scored as `conflict_check`.
 *   - 'core': everything else the scenario needs.
 *
 * ILLUSTRATIVE DATA: field lists and risk tags are plausible defaults, not
 * verified law. Jurisdiction and practice requirements vary — edit the canon
 * for your scenario before relying on it. [verify] against local rules.
 *
 * @module canons
 */
export { CANONS, listCanons, getCanon } from './core.js';
