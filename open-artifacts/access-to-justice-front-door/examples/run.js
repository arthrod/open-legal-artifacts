/**
 * Reproducible worked example: reads examples/input.json, triages each
 * plain-language description, writes output.json and triage.md.
 * Run:  node examples/run.js
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { triage, renderTriage } from '../core/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, 'input.json'), 'utf8'));

const results = input.descriptions.map((d) => ({ description: d, ...triage(d) }));
writeFileSync(join(here, 'output.json'), JSON.stringify(results, null, 2) + '\n');
writeFileSync(
  join(here, 'triage.md'),
  results
    .map((r, i) =>
      `### ${i + 1}. “${r.description}”\n\n` +
      (r.status === 'classified'
        ? `- Classified: **${r.primaryLabel}** (${r.primaryIssue}, confidence ${r.confidence}${r.multiIssue ? ', possible multi-issue' : ''})\n- Referral: ${r.referrals.map((x) => `\`${x.legalAidCategory}\``).join(' + ')}`
        : `- **ESCALATED to human review** (${r.reason})${r.candidates.length ? `; candidates: ${r.candidates.map((c) => `${c.issue} ${c.confidence}`).join(', ')}` : ''}`))
    .join('\n\n') + '\n\n---\n\n' + results.map((r) => renderTriage(r)).join('\n---\n\n'),
);

const classified = results.filter((r) => r.status === 'classified').length;
console.log(`${results.length} descriptions -> ${classified} classified, ${results.length - classified} escalated -> output.json, triage.md`);
