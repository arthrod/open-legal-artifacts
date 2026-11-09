/**
 * hardening.js — shared output/input hardening helpers (dependency-free ESM).
 *
 *   safeExternalUrl(s)  — http/https-only URL gate; null for anything else
 *                         (javascript:, data:, vbscript:, file:, relative…).
 *   csvSafeEscape(v)    — RFC 4180 cell escaping + CSV formula-injection
 *                         guard for leaders = + - @ TAB CR.
 *
 * Canonical source: open-artifacts/_shared/ (see README.md for vendoring).
 * Zero console side effects. All example data fictional.
 */

/** ASCII TAB/LF/CR and C0 control characters, which browsers strip from
 *  URLs before scheme parsing — the guard must strip them first too. */
// eslint-disable-next-line no-control-regex
const URL_CTRL = /[\u0000-\u001f\u007f]/g;

/**
 * Return the normalized absolute http(s) URL string, or null when the value
 * is missing, not a URL, relative, or uses any other scheme.
 *
 * @param {unknown} s
 * @returns {string | null}
 */
export function safeExternalUrl(s) {
  if (typeof s !== 'string') return null;
  // Browsers ignore leading/trailing whitespace *and* embedded TAB/CR/LF
  // before parsing a URL; strip exactly that set, nothing more.
  const cleaned = s.replace(URL_CTRL, '').trim();
  if (!cleaned) return null;
  let url;
  try {
    url = new URL(cleaned); // no base ⇒ relative URLs throw ⇒ rejected
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.href;
}

/** Formula-injection leader characters (OWASP CSV injection): = + - @ TAB CR. */
const FORMULA_LEADER = /^[=+\-@\t\r]/;

/**
 * Escape one CSV cell per RFC 4180, with a formula-injection guard:
 * values whose first character is = + - @ TAB CR are prefixed with a
 * single quote so spreadsheet apps render them as text, never execute
 * them. Already-prefixed values are passed through unchanged (no
 * double-guarding).
 *
 * @param {unknown} v
 * @returns {string}
 */
export function csvSafeEscape(v) {
  if (v == null) return '';
  let s = String(v);
  if (FORMULA_LEADER.test(s) && !s.startsWith("'")) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
