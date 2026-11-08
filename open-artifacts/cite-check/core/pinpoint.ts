/**
 * Pinpoint citation parsing: "p. 12", "pp. 12-13", "§ 5.2", "¶ 8", "at 123",
 * plus v2 forms: transcript page:line ("Tr. 12:4", "12:4-12:8"), ranges
 * ("§§ 5-6", "¶¶ 7-8"), "id. at 123", "n. 12", "art. 3", "cl. 8".
 * Deterministic, dependency-free. Unparseable strings return null (never guessed).
 */

export type Pinpoint =
  | { kind: 'page'; from: number; to?: number }
  | { kind: 'page-line'; page: number; lineFrom: number; lineTo?: number; pageTo?: number }
  | { kind: 'section'; label: string; to?: string }
  | { kind: 'paragraph'; number: number; to?: number }
  | { kind: 'footnote'; number: number }
  | { kind: 'article'; label: string }
  | { kind: 'clause'; label: string };

const NUM = '[0-9]+(?:\\.[0-9]+)*';
const SEC_RANGE = new RegExp(`^(?:§§|secs\\.|sections?)\\s*(${NUM})\\s*[-–—]\\s*(${NUM})$`, 'i');
const SEC_SINGLE = new RegExp(`^(?:§+|secs?\\.|sections?)\\s*(${NUM})$`, 'i');
const ART = new RegExp(`^art(?:icle)?\\.?\\s*(${NUM})$`, 'i');
const CL = new RegExp(`^cl(?:ause)?\\.?\\s*(${NUM})$`, 'i');

export function parsePinpoint(raw: string): Pinpoint | null {
  const s = raw.trim();
  let m: RegExpMatchArray | null;
  // id. at 123 / id. at 12:4
  if ((m = s.match(/^id\.\s+at\s+(\d+)$/i))) return { kind: 'page', from: Number(m[1]) };
  if ((m = s.match(/^id\.\s+at\s+(\d+):(\d+)$/i))) return { kind: 'page-line', page: Number(m[1]), lineFrom: Number(m[2]) };
  // page:line, optionally Tr.-prefixed, optionally a range ("Tr. 12:4-12:8", "12:4-8")
  if ((m = s.match(/^(?:tr\.|transcript)?\s*(\d+):(\d+)(?:\s*[-–—]\s*(?:(\d+):)?(\d+))?$/i))) {
    const pl: Pinpoint = { kind: 'page-line', page: Number(m[1]), lineFrom: Number(m[2]) };
    if (m[4] !== undefined) {
      pl.lineTo = Number(m[4]);
      if (m[3] !== undefined) pl.pageTo = Number(m[3]);
    }
    return pl;
  }
  // page / page range
  if ((m = s.match(/^pp?\.\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?$/i))) {
    const page: Pinpoint = { kind: 'page', from: Number(m[1]) };
    if (m[2] !== undefined) page.to = Number(m[2]);
    return page;
  }
  if ((m = s.match(/^at\s+(\d+)$/i))) {
    return { kind: 'page', from: Number(m[1]) };
  }
  // section range then single
  if ((m = s.match(SEC_RANGE))) {
    return { kind: 'section', label: m[1], to: m[2] };
  }
  if ((m = s.match(SEC_SINGLE))) {
    return { kind: 'section', label: m[1] };
  }
  // paragraph range then single
  if ((m = s.match(/^(?:¶¶|paras\.|paragraphs?)\s*(\d+)\s*[-–—]\s*(\d+)$/i))) {
    return { kind: 'paragraph', number: Number(m[1]), to: Number(m[2]) };
  }
  if ((m = s.match(/^(?:¶+|paras?\.|paragraphs?)\s*(\d+)$/i))) {
    return { kind: 'paragraph', number: Number(m[1]) };
  }
  // footnote / article / clause (parsed, but the core models no such segments)
  if ((m = s.match(/^(?:n\.|note)\s*(\d+)$/i))) return { kind: 'footnote', number: Number(m[1]) };
  if ((m = s.match(ART))) return { kind: 'article', label: m[1] };
  if ((m = s.match(CL))) return { kind: 'clause', label: m[1] };
  return null;
}

export function formatPinpoint(p: Pinpoint): string {
  switch (p.kind) {
    case 'page':
      return p.to !== undefined ? `pp. ${p.from}-${p.to}` : `p. ${p.from}`;
    case 'page-line':
      if (p.pageTo !== undefined) return `Tr. ${p.page}:${p.lineFrom}-${p.pageTo}:${p.lineTo}`;
      if (p.lineTo !== undefined) return `Tr. ${p.page}:${p.lineFrom}-${p.lineTo}`;
      return `Tr. ${p.page}:${p.lineFrom}`;
    case 'section':
      return p.to !== undefined ? `§§ ${p.label}-${p.to}` : `§ ${p.label}`;
    case 'paragraph':
      return p.to !== undefined ? `¶¶ ${p.number}-${p.to}` : `¶ ${p.number}`;
    case 'footnote':
      return `n. ${p.number}`;
    case 'article':
      return `art. ${p.label}`;
    case 'clause':
      return `cl. ${p.label}`;
  }
}
