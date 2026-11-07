/**
 * Worked example runner — reads input.json, answers each question with
 * confidence gating + escalation, writes answers.json and the audit log.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerQuestion, createAuditLog, exportAuditLog } from "../core/core.js";

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, "input.json"), "utf8"));
const auditLog = createAuditLog();

const answers = input.questions.map((q) => {
  const r = answerQuestion(
    input.knowledgeBase,
    q.question,
    { asOf: input.asOf, askedBy: q.askedBy, thresholds: input.thresholds, routing: input.routing },
    auditLog
  );
  return { ...q, ...r, answerPreview: r.answer ? r.answer.slice(0, 120) : null };
});

writeFileSync(join(here, "answers.json"), JSON.stringify(answers, null, 2) + "\n");
writeFileSync(join(here, "audit-log.jsonl"), exportAuditLog(auditLog));

const md = [
  `# ask-legal — worked example (${input.asOf}, ${input.company})`,
  "",
  ...answers.flatMap((a) => [
    `## Q: ${a.question}`,
    "",
    `- asked by \`${a.askedBy}\` · audit \`${a.auditId}\``,
    `- confidence: **${a.confidence.level}**`,
    ...a.confidence.reasons.map((r) => `  - ${r}`),
    a.answered ? `- answer (source \`${a.sourceId}\`): ${a.answer}` : `- **escalated to \`${a.route}\`** — no answer returned, nothing guessed`,
    "",
  ]),
  "## Audit log (every question, append-only)",
  "",
  "```jsonl",
  exportAuditLog(auditLog).trim(),
  "```",
  "",
  "_All data fictional. Guidance must be approved by the organization's legal team before use. Not legal advice._",
  "",
].join("\n");
writeFileSync(join(here, "report.md"), md);

const escalated = answers.filter((a) => a.escalate).length;
console.log(`answered ${answers.length - escalated}/${answers.length}, escalated ${escalated} — wrote answers.json, audit-log.jsonl, report.md`);
