/**
 * Strict YAML subset parser — dependency-free.
 *
 * Supports exactly what structured playbooks need:
 *   - mappings (nested by indentation)
 *   - lists ("- " items, scalars or mappings whose first key sits on the
 *     dash line, continuation keys aligned under it)
 *   - scalars: "double-quoted", 'single-quoted', numbers, true/false, null
 *   - blank lines, full-line # comments, and inline " #" comments (a #
 *     outside quotes at value start or after whitespace, per YAML; a # glued
 *     to a token — "PB#1" — is part of the value)
 * Not supported (documented): anchors, multi-line blocks,
 * flow collections, "- " items at irregular indentation.
 *
 * Inline comments are stripped BEFORE scalar parsing, so comment text can
 * never silently end up inside a value; malformed structure remains a
 * line-numbered parse error — never a guess.
 *
 * The "- key: value" trick: the dash is rewritten into indentation and the
 * item is parsed as an ordinary mapping at the child indent.
 */

export type YNode = string | number | boolean | null | YNode[] | { [key: string]: YNode };

/** Strip a trailing inline comment: a `#` outside quotes that starts the value
 *  or is preceded by whitespace begins a comment (YAML spec); a `#` glued to
 *  other characters is part of the value. Quote-aware, char-by-char. */
function stripComment(val: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < val.length; i++) {
    const c = val[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || val[i - 1] === ' ' || val[i - 1] === '\t')) {
      return val.slice(0, i);
    }
  }
  return val;
}

function scalar(raw: string): YNode {
  const s = raw.trim();
  if (s === '' || s === 'null' || s === '~') return null;
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      return JSON.parse(s) as string;
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

const KEY_RE = /^([^:#]+?):\s*(.*)$/;

export function parseYaml(src: string): YNode {
  const lines: string[] = [];
  for (const raw of src.split('\n')) {
    const t = raw.replace(/\r$/, '').replace(/\t/g, '  ');
    if (t.trim() === '' || t.trim().startsWith('#')) continue;
    lines.push(t);
  }
  let i = 0;
  const indentOf = (l: string): number => (l.match(/^ */)![0].length);

  function parseMap(ind: number): { [key: string]: YNode } {
    const obj: { [key: string]: YNode } = {};
    while (i < lines.length) {
      const l = lines[i];
      const li = indentOf(l);
      if (li !== ind || l.trimStart().startsWith('- ')) break;
      const m = l.slice(li).match(KEY_RE);
      if (!m) throw new Error(`yaml: expected "key: value" at line ${i + 1}: "${l.trim()}"`);
      const key = m[1].trim();
      const val = stripComment(m[2]);
      i++;
      if (val.trim() !== '') {
        obj[key] = scalar(val);
      } else if (i < lines.length && indentOf(lines[i]) > ind) {
        obj[key] = parseBlock(indentOf(lines[i]));
      } else if (i < lines.length && indentOf(lines[i]) === ind && lines[i].trimStart().startsWith('- ')) {
        obj[key] = parseList(ind);
      } else {
        obj[key] = null;
      }
    }
    return obj;
  }

  function parseList(ind: number): YNode[] {
    const out: YNode[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const li = indentOf(l);
      if (li !== ind || !l.trimStart().startsWith('- ')) break;
      const rest = stripComment(l.trimStart().slice(2));
      if (rest.trim() === '') {
        i++;
        if (i < lines.length && indentOf(lines[i]) > ind) out.push(parseBlock(indentOf(lines[i])));
        else out.push(null);
        continue;
      }
      if (KEY_RE.test(rest)) {
        // rewrite "- key: value" as "  key: value" at child indent, then parse a mapping
        lines[i] = ' '.repeat(li + 2) + rest;
        out.push(parseMap(li + 2));
      } else {
        i++;
        out.push(scalar(rest));
      }
    }
    return out;
  }

  function parseBlock(ind: number): YNode {
    if (lines[i].trimStart().startsWith('- ')) return parseList(ind);
    return parseMap(ind);
  }

  if (lines.length === 0) return {};
  const root = parseBlock(indentOf(lines[0]));
  if (i !== lines.length) throw new Error(`yaml: unexpected content at line ${i + 1}: "${lines[i].trim()}"`);
  return root;
}
