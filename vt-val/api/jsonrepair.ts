/**
 * JSON-mode repair for model output. Models asked for JSON still wrap it in
 * prose or markdown fences, leave trailing commas, or prepend commentary.
 * extractJson recovers the first balanced JSON object from raw text — or
 * returns null. Pure, never throws.
 */

/** Remove trailing commas before } or ] (common LLM JSON quirk). */
export function stripTrailingCommas(s: string): string {
  return s.replace(/,\s*([}\]])/g, "$1");
}

/** Strip a leading markdown fence (```json … ``` or ``` … ```). */
function stripFence(raw: string): string {
  const m = raw.match(/^\s*```[a-zA-Z]*\s*\n?([\s\S]*?)\n?\s*```\s*$/);
  return m ? m[1] : raw;
}

function tryParse(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    const repaired = stripTrailingCommas(s);
    if (repaired !== s) {
      try {
        return JSON.parse(repaired);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Extract the first balanced JSON object from raw model text.
 * String-aware scan: braces/brackets inside string literals and escaped
 * quotes do not break the balance. Returns the parsed value or null.
 */
export function extractJson(raw: string): unknown | null {
  if (typeof raw !== "string") return null;
  let text = stripFence(raw).trim();
  if (!text) return null;

  const direct = tryParse(text);
  if (direct !== null && typeof direct === "object" && !Array.isArray(direct)) return direct;

  // scan for the first '{' and track balance across strings
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        return tryParse(text.slice(start, i + 1));
      }
    }
  }
  return null; // unbalanced — refuse rather than guess
}
