/**
 * Strict YAML subset parser — dependency-free.
 *
 * Supports exactly what structured playbooks need:
 *   - mappings (nested by indentation)
 *   - lists ("- " items, scalars or mappings whose first key sits on the
 *     dash line, continuation keys aligned under it)
 *   - scalars: "double-quoted", 'single-quoted', numbers, true/false, null
 *   - blank lines and full-line # comments
 * Not supported (documented): inline comments, anchors, multi-line blocks,
 * flow collections, "- " items at irregular indentation.
 *
 * The "- key: value" trick: the dash is rewritten into indentation and the
 * item is parsed as an ordinary mapping at the child indent.
 */

export type YNode = string | number | boolean | null | YNode[] | { [key: string]: YNode };

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
      const val = m[2];
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
      const rest = l.trimStart().slice(2);
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
