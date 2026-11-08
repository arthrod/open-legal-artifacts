// Pure HTML rendering of triage results for the demo (no DOM access, so it
// is unit-testable from node). renderResult branches on result status:
// escalate-shaped results (including invalid-pick after a post-escalate
// edit) carry no matchedKeywords, so they must never reach the classified
// renderer (review 62 crash).

function esc(s) { return String(s).replace(/</g, '&lt;'); }

function metaLine(r) {
  const parts = [`urgency: ${esc(r.urgency)}`];
  if (r.dates && r.dates.length) parts.push(`dates mentioned (info-only): ${r.dates.map(esc).join(', ')}`);
  return `<p class="kw">${parts.join(' · ')}</p>`;
}

function renderClassified(r) {
  return `
      <div class="verdict">Matched: ${esc(r.primaryLabel)} · confidence ${r.confidence}${r.multiIssue ? ' · possible multi-issue' : ''}${r.resolvedBy === 'clarifying-question' ? ' · resolved by clarifying question' : ''}</div>
      <p class="kw">matched keywords: ${r.matchedKeywords.map(esc).join(', ')}</p>
      ${metaLine(r)}
      ${r.referrals.map((ref) => `
        <div class="referral">
          <div class="cat">${esc(ref.legalAidCategory)}</div>
          <p><strong>${esc(ref.label)}</strong> — ${esc(ref.serviceDescription)}</p>
          <p style="font-size:14px;color:var(--text-secondary)">${esc(ref.whereToGo)}</p>
          ${(ref.guidance ?? []).map((g) => `<p style="font-size:14px;color:var(--text-secondary)">Guidance: ${esc(g.point)} <a href="${esc(g.source.url)}" target="_blank" rel="noopener">${esc(g.source.name)}</a></p>`).join('')}
        </div>`).join('')}
      <p class="kw">${esc(r.disclaimer)}</p>`;
}

function renderEscalate(r) {
  return `
      <div class="verdict escalate">Escalated to a human — ${esc(r.reason)}</div>
      <p>${esc(r.escalate)}</p>
      ${metaLine(r)}
      ${r.candidates.length ? `<p class="kw">Possibilities reviewed but not served automatically:</p>
      <ul class="candidates">${r.candidates.map((c) => `<li>${esc(c.label ?? c.issue)} (${esc(c.issue)}, confidence ${c.confidence})${c.matchedKeywords && c.matchedKeywords.length ? ' — matched: ' + c.matchedKeywords.map(esc).join(', ') : ''}</li>`).join('')}</ul>` : ''}
      ${r.matchedFragments && r.matchedFragments.length ? `<p class="kw">Staff review packet — matched fragments: ${r.matchedFragments.map(esc).join(', ')}</p>` : ''}
      ${r.clarifyingQuestion ? `<p class="kw">${esc(r.clarifyingQuestion.question)}</p>
      <p>${r.clarifyingQuestion.options.map((o) => `<button class="pick" data-id="${esc(o.id)}">${esc(o.label)}</button>`).join(' ')}</p>` : ''}
      <p class="kw">${esc(r.disclaimer)}</p>`;
}

/** Render any triage result (classified or escalate) as demo HTML. */
export function renderResult(r) {
  return r.status === 'escalate' ? renderEscalate(r) : renderClassified(r);
}
