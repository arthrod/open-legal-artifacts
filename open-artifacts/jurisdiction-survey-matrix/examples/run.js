/**
 * Worked example runner — reads input.json, builds the matrix, writes
 * matrix.json + survey.csv + survey.md.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildMatrix, toCsv, toMarkdown } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));

const matrix = buildMatrix(input.survey, input.asOf);
writeFileSync(join(here, "matrix.json"), JSON.stringify(matrix, null, 2) + "\n");
writeFileSync(join(here, "survey.csv"), toCsv(matrix));
writeFileSync(join(here, "survey.md"), toMarkdown(matrix));

console.log(
  `matrix ${matrix.jurisdictions.length}×${matrix.questions.length}: ` +
  `${matrix.coverage.verified} verified, ${matrix.coverage.stale} stale, ${matrix.coverage.unverified} unverified ` +
  `(${matrix.coverage.pctVerified}% coverage) — wrote matrix.json, survey.csv, survey.md`
);
