/**
 * Registry completeness — enforced in BOTH directions:
 *  1. every schemas/*.ts that exports `schema` must be registered in
 *     EXTRACT_SCHEMAS under its exact file basename (demo calls /api/extract
 *     with schema:"<artifact-name>"; an unregistered file means the live route
 *     would 400 on a wired demo);
 *  2. every non-exemplar registry key must have a schemas/ file (no orphan
 *     registrations pointing at deleted modules).
 * Exemplars fact-chronology + obligations-checker live inline in validate.ts
 * (F3) and are exempt from direction 2.
 */
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXTRACT_SCHEMAS } from "../validate.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXEMPLARS = new Set(["fact-chronology", "obligations-checker"]);

Deno.test("every schemas/*.ts module is registered in EXTRACT_SCHEMAS", async () => {
  const files = readdirSync(HERE)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const schemaFiles: string[] = [];
  for (const f of files) {
    const mod = await import(`./${f}`);
    if (mod.schema) schemaFiles.push(f.replace(/\.ts$/, ""));
  }
  if (schemaFiles.length === 0) throw new Error("no schema modules found — scan broken");
  const missing = schemaFiles.filter((k) => !(k in EXTRACT_SCHEMAS));
  if (missing.length) {
    throw new Error(`unregistered schemas (live /api/extract would 400): ${missing.join(", ")}`);
  }
});

Deno.test("every non-exemplar EXTRACT_SCHEMAS key has a schemas/ file", () => {
  const orphans = Object.keys(EXTRACT_SCHEMAS).filter(
    (k) => !EXEMPLARS.has(k) && !existsSync(join(HERE, `${k}.ts`)),
  );
  if (orphans.length) throw new Error(`orphan registrations (no module): ${orphans.join(", ")}`);
});

Deno.test("registered validators are wired (validateData is a function, fields non-empty)", () => {
  for (const [k, s] of Object.entries(EXTRACT_SCHEMAS)) {
    if (typeof s.validateData !== "function") throw new Error(`${k}: validateData missing`);
    if (!Array.isArray(s.fields) || s.fields.length === 0) throw new Error(`${k}: fields empty`);
    if (typeof s.system !== "string" || s.system.length < 80) throw new Error(`${k}: system prompt too thin`);
  }
});
