const $ = (s) => document.querySelector(s);
const plans = await fetch('/api/lab/plans').then((response) => {
  if (!response.ok) throw new Error(`Could not load sample plans (${response.status})`);
  return response.json();
}).catch(() => {
  $('#msg').textContent = 'Could not load the sample plans. Reload the page to try again.';
  $('#submit').disabled = true;
  return [];
});
const drafts = {};
const completed = {};
let active = plans[0]?.id;
let action = 'accept';
const notes = {
  accept: 'Returns the content object. Required fields must be filled before validating.',
  decline: 'Returns a refusal with no content.',
  cancel: 'Returns a cancellation with no content.',
};
const current = () => plans.find((plan) => plan.id === active);
const draft = () => drafts[active] ||= {};
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function toast(message) {
  const target = $('#toast');
  target.textContent = message;
  target.classList.add('show');
  clearTimeout(target.timer);
  target.timer = setTimeout(() => target.classList.remove('show'), 2200);
}
function drawQueue() {
  const queue = $('#queue');
  queue.replaceChildren();
  plans.forEach((plan, index) => {
    const button = el('button', 'plan');
    button.type = 'button';
    button.setAttribute('aria-current', String(plan.id === active));
    const detail = el('span');
    const description = el('span', 'm', plan.message);
    description.style.display = 'block';
    detail.append(el('span', 't', plan.title), description);
    button.append(el('span', 'i', String(index + 1).padStart(2, '0')), detail, el('span', `st ${completed[plan.id] ? 'done' : ''}`, completed[plan.id] || 'Pending'));
    button.addEventListener('click', () => { active = plan.id; drawQueue(); drawForm(); });
    queue.append(button);
  });
  $('#qcount').textContent = `${Object.keys(completed).length} / ${plans.length} answered`;
}
function issues() {
  const plan = current();
  if (!plan || action !== 'accept') return [];
  const data = draft();
  const problems = plan.requestedSchema.required.filter((key) => data[key] === undefined || data[key] === '').map((key) => `${key}: required`);
  for (const [key, field] of Object.entries(plan.requestedSchema.properties)) {
    const value = data[key];
    if (typeof value !== 'number') continue;
    if ((field.type === 'integer' && !Number.isInteger(value)) || (field.minimum !== undefined && value < field.minimum) || (field.maximum !== undefined && value > field.maximum)) problems.push(`${key}: invalid value`);
  }
  if (plan.id === 'deploy-confirm' && data.environment === 'production' && !String(data.ticket || '').trim()) problems.push('ticket: required for production');
  return problems;
}
function payload() { return action === 'accept' ? { action, content: draft() } : { action }; }
function drawPayload() {
  const problem = issues();
  const text = JSON.stringify(payload(), null, 2);
  $('#pay').textContent = text;
  $('#valid').textContent = problem.length ? `■ ${problem.join(' · ')}` : '■ Ready for server validation';
  $('#valid').className = problem.length ? 'bad' : 'ok';
  $('#bytes').textContent = `${new Blob([text]).size} bytes`;
  $('#submit').disabled = !current() || problem.length > 0;
}
function drawForm() {
  const plan = current();
  if (!plan) return;
  $('#pid').textContent = plan.id;
  $('#msg').replaceChildren(el('b', '', 'Example request'), document.createTextNode(plan.message));
  const form = $('#form');
  form.replaceChildren();
  for (const [key, field] of Object.entries(plan.requestedSchema.properties)) {
    const row = el('div', 'field');
    const grouped = field.enum || field.type === 'boolean';
    const label = el(grouped ? 'span' : 'label', 'fl');
    const inputId = `lab-field-${key}`;
    if (!grouped) label.htmlFor = inputId;
    label.append(document.createTextNode(field.title));
    if (plan.requestedSchema.required.includes(key)) label.append(el('span', 'req', 'required'));
    label.append(el('span', 'hint', field.type + (field.enum ? ' · enum' : '')));
    row.append(label);
    if (field.enum || field.type === 'boolean') {
      const group = el('div', 'opts');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', field.title);
      const values = field.enum || [true, false];
      values.forEach((value, index) => {
        const name = field.enum ? (field.enumNames?.[index] || value) : (value ? 'Yes' : 'No');
        const button = el('button', 'opt', name);
        button.type = 'button';
                button.setAttribute('aria-pressed', String(draft()[key] === value));
        button.addEventListener('click', () => { draft()[key] = value; drawForm(); });
        group.append(button);
      });
      row.append(group);
    } else {
      const input = el('input', 'in' + (field.type === 'string' ? '' : ' mono'));
      input.id = inputId;
      input.type = field.type === 'string' ? 'text' : 'number';
      if (field.minimum !== undefined) input.min = field.minimum;
      if (field.maximum !== undefined) input.max = field.maximum;
      if (field.type === 'integer') input.step = '1';
      if (field.type === 'number') input.step = 'any';
      input.value = draft()[key] ?? '';
      input.placeholder = field.format || '';
      input.addEventListener('input', () => {
        if (input.value === '') delete draft()[key];
        else draft()[key] = field.type === 'string' ? input.value : Number(input.value);
        drawPayload();
      });
      row.append(input);
    }
    if (field.description) row.append(el('span', 'desc', field.description));
    if (field.format) row.append(el('span', 'fmt', `format · ${field.format}`));
    form.append(row);
  }
  $('#actnote').textContent = notes[action];
  drawPayload();
}
$('#action').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  action = button.dataset.v;
  $('#action').querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  $('#actnote').textContent = notes[action];
  drawPayload();
});
$('#submit').addEventListener('click', async () => {
  if (!current() || issues().length) return;
  const planId = active;
  const submitted = payload();
  $('#submit').disabled = true;
  try {
    const response = await fetch(`/api/lab/plans/${encodeURIComponent(planId)}/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submitted) });
    const result = await response.json();
    if (!response.ok || !result.valid) throw new Error(result.errors?.join(' · ') || result.error || 'Validation failed');
    completed[planId] = { accept: 'Accepted', decline: 'Declined', cancel: 'Cancelled' }[submitted.action];
    toast('Response validated · ' + completed[planId]);
    const index = plans.findIndex((plan) => plan.id === planId);
    const next = plans.find((plan, i) => i > index && !completed[plan.id]) || plans.find((plan) => !completed[plan.id]);
    if (next && active === planId) active = next.id;
    action = 'accept';
    $('#action').querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item.dataset.v === 'accept')));
    drawQueue(); drawForm();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not validate response');
    drawPayload();
  }
});
$('#reset').addEventListener('click', () => { delete drafts[active]; delete completed[active]; drawQueue(); drawForm(); });
$('#copy').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText($('#pay').textContent);
    toast('Payload copied');
  } catch { toast('Clipboard unavailable; select and copy the payload'); }
});
const editor = $('#doc');
$('.tools').addEventListener('mousedown', (event) => { if (event.target.closest('button')) event.preventDefault(); });
$('.tools').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.id === 'ctxclear') return;
  editor.focus();
  if (button.dataset.cmd) document.execCommand(button.dataset.cmd);
  if (button.dataset.block) document.execCommand('formatBlock', false, button.dataset.block);
});
$('#ctxclear').addEventListener('click', () => { editor.replaceChildren(); editor.focus(); });
drawQueue(); drawForm();
