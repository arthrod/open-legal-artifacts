/**
 * Pinpoint citation parsing: "p. 12", "pp. 12-13", "§ 5.2", "¶ 8", "at 123".
 * Deterministic, dependency-free. Unparseable strings return null (never guessed).
 */

export type Pinpoint =
  | { kind: 'page'; from: number; to?: number }
  | { kind: 'section'; label: string }
  | { kind: 'paragraph'; number: number };

export function parsePinpoint(raw: string): Pinpoint | null {
  const s = raw.trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^pp?\.\s*(\d+)(?:\s*[-–—to]+\s*(\d+))?$/i))) {
    const page: Pinpoint = { kind: 'page', from: Number(m[1]) };
    if (m[2] !== undefined) page.to = Number(m[2]);
    return page;
  }
  if ((m = s.match(/^at\s+(\d+)$/i))) {
    return { kind: 'page', from: Number(m[1]) };
  }
  if ((m = s.match(/^(?:§+|secs?\.|sections?)\s*([0-9]+(?:\.[0-9]+)*)$/i))) {
    return { kind: 'section', label: m[1] };
  }
  if ((m = s.match(/^(?:¶+|paras?\.|paragraphs?)\s*(\d+)$/i))) {
    return { kind: 'paragraph', number: Number(m[1]) };
  }
  return null;
}

export function formatPinpoint(p: Pinpoint): string {
  switch (p.kind) {
    case 'page':
      return p.to !== undefined ? `pp. ${p.from}-${p.to}` : `p. ${p.from}`;
    case 'section':
      return `§ ${p.label}`;
    case 'paragraph':
      return `¶ ${p.number}`;
  }
}
