/**
 * Worked example runner — reads input.json, answers each question with
 * confidence gating + escalation, writes answers.json and the audit log.
 * Usage: node examples/run.js   (from the artifact root)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { answerQuestion, createAuditLog, exportAuditLog, escalationTicket } from "../core/core.js";

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

// Escalations get a deterministic intake ticket ("drafts the ask") for the lawyer.
const tickets = answers
  .filter((a) => a.escalate)
  .map((a) => ({ ...escalationTicket(a, auditLog) }));

const ticketMd = [
  "## Escalation tickets — deterministic drafts for the lawyer",
  "",
  "Each escalation carries a ready-to-send intake ticket: route, question, asker, matched ids, reasons, and the closest KB entry (if any) to start from.",
  "",
  ...(tickets.length
    ? tickets.flatMap((t) => [
        `### → \`${t.route}\``,
        "",
        `- question: ${t.question}`,
        `- asker: \`${t.asker}\``,
        `- matched KB entries: ${t.matchedIds.length ? t.matchedIds.map((id) => `\`${id}\``).join(", ") : "none (zero overlap)"}`,
        `- why escalated:`,
        ...t.reasons.map((r) => `  - ${r}`),
        t.suggestedEntry
          ? `- closest entry for the lawyer to start from: \`${t.suggestedEntry.id}\` — “${t.suggestedEntry.question}”`
          : "- no KB entry came close — guidance gap for Legal to fill",
        "",
      ])
    : ["_(no escalations in this run)_", ""]),
];

const md = [
  `# ask-legal — worked example (${input.asOf}, ${input.company})`,
  "",
  ...answers.flatMap((a) => [
    `## Q: ${a.question}`,
    "",
    `- asked by \`${a.askedBy}\` · audit \`${a.auditId}\``,
    `- confidence: **${a.confidence.level}**`,
    ...a.confidence.reasons.map((r) => `  - ${r}`),
    a.answered ? `- answer (source \`${a.sourceId}\`)${a.provisional ? " — **provisional**: " + a.label : ""}: ${a.answer}` : `- **escalated to \`${a.route}\`** — no answer returned, nothing guessed`,
    "",
  ]),
  ...ticketMd,
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
console.log(`answered ${answers.length - escalated}/${answers.length}, escalated ${escalated} (${tickets.length} tickets drafted) — wrote answers.json, audit-log.jsonl, report.md`);
