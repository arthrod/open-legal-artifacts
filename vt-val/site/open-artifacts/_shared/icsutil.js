/**
 * icsutil.js — RFC 5545 (iCalendar) output helpers (dependency-free ESM).
 *
 *   icsEscapeText(s)  — TEXT escaping: \\ \; \, and literal \n for newlines.
 *   foldIcsLine(line) — fold to ≤75 octets per physical line, CRLF joined,
 *                       never splitting a multibyte character.
 *   buildVEvent(ev)   — one VEVENT as folded CRLF lines, or null when the
 *                       event has no valid date (never a guessed event);
 *                       an invalid dtStamp falls back to dtStart.
 *   buildIcs(evs, o)  — full VCALENDAR string; invalid events are skipped.
 *
 * Canonical source: open-artifacts/_shared/ (see README.md for vendoring).
 * Zero console side effects. All example data fictional.
 */

/** Escape an iCalendar TEXT value (RFC 5545 §3.3.11). */
export function icsEscapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** UTF-8 octets one code point occupies. */
const cpOctets = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/**
 * Fold one logical line so every physical line is ≤75 octets (RFC 5545 §3.1),
 * continuation lines prefixed with a single space, joined with CRLF. A code
 * point is never split across lines.
 *
 * @param {string} line
 * @returns {string}
 */
export function foldIcsLine(line) {
  const out = [];
  let cur = '';
  let curOct = 0;
  for (const ch of String(line)) {
    const chOct = cpOctets(ch.codePointAt(0));
    if (curOct + chOct > 75) {
      out.push(cur);
      cur = ' ';
      curOct = 1;
    }
    cur += ch;
    curOct += chOct;
  }
  out.push(cur);
  return out.join('\r\n');
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_UTC = /^(\d{4})(\d{2})(\d{2})$/;
const DT_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

/** Accept YYYY-MM-DD | YYYYMMDD | YYYY-MM-DDTHH:MM:SSZ → basic iCal form. */
function toIcalDate(s) {
  const t = String(s ?? '').trim();
  let m = DATE_ONLY.exec(t) ?? DATE_UTC.exec(t);
  if (m) {
    const [, y, mo, d] = m;
    const iso = `${y}-${mo}-${d}`;
    if (Number.isNaN(Date.parse(iso))) return null;
    return { value: `${y}${mo}${d}`, dateOnly: true };
  }
  m = DT_UTC.exec(t);
  if (m) {
    const [, y, mo, d, h, mi, se] = m;
    if (Number.isNaN(Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${se}Z`))) return null;
    return { value: `${y}${mo}${d}T${h}${mi}${se}Z`, dateOnly: false };
  }
  return null;
}

/**
 * Build one VEVENT as folded, CRLF-terminated lines. Requires uid and a
 * parseable dtStart; returns null otherwise.
 *
 * @param {{uid: string, dtStart: string, dtStamp?: string, summary?: string,
 *          description?: string, location?: string, url?: string}} ev
 * @returns {string | null}
 */
export function buildVEvent(ev) {
  if (!ev || typeof ev.uid !== 'string' || !ev.uid) return null;
  const start = toIcalDate(ev.dtStart);
  if (!start) return null;
  const stamp = toIcalDate(ev.dtStamp) ?? start; // invalid dtStamp falls back to dtStart
  const lines = [
    'BEGIN:VEVENT',
    `UID:${icsEscapeText(ev.uid)}`,
    `DTSTAMP:${stamp.dateOnly ? stamp.value + 'T000000Z' : stamp.value}`,
    start.dateOnly ? `DTSTART;VALUE=DATE:${start.value}` : `DTSTART:${start.value}`,
  ];
  if (ev.summary != null) lines.push(`SUMMARY:${icsEscapeText(ev.summary)}`);
  if (ev.description != null) lines.push(`DESCRIPTION:${icsEscapeText(ev.description)}`);
  if (ev.location != null) lines.push(`LOCATION:${icsEscapeText(ev.location)}`);
  if (ev.url != null) lines.push(`URL:${icsEscapeText(ev.url)}`);
  lines.push('END:VEVENT');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/**
 * Build a complete VCALENDAR from events; events that fail buildVEvent are
 * skipped, not guessed.
 *
 * @param {Parameters<typeof buildVEvent>[0][]} events
 * @param {{prodId?: string}} [opts]
 * @returns {string}
 */
export function buildIcs(events, opts = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${icsEscapeText(opts.prodId ?? '-//open-legal-artifacts//_shared icsutil//EN')}`,
    'CALSCALE:GREGORIAN',
  ];
  for (const ev of events ?? []) {
    const block = buildVEvent(ev);
    if (block) lines.push(...block.split('\r\n').filter(Boolean));
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
