(() => {
const L = window.LESSONS, KEY = 'asr-prompting-progress', SIZE = 'asr-prompting-size';
const app = document.getElementById('app');
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const pad = n => String(n).padStart(2,'0');
let state = {}; try { state = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e) {}
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const done = slug => !!(state[slug] && state[slug].done);
const total = () => L.filter(l => done(l.slug)).length;

// text size
const applySize = s => { document.documentElement.dataset.size = s; document.querySelectorAll('.sizes button').forEach(b => b.classList.toggle('on', b.dataset.size === s)); };
applySize(localStorage.getItem(SIZE) || 'normal');
document.querySelectorAll('.sizes button').forEach(b => b.onclick = () => { localStorage.setItem(SIZE, b.dataset.size); applySize(b.dataset.size); });

function renderProg(cur) {
  document.getElementById('prog').innerHTML = L.map(l => `<b class="${done(l.slug)?'on':''}${l.slug===cur?' cur':''}" title="${pad(L.indexOf(l)+1)} ${esc(l.title)}"></b>`).join('');
}

// [[text|n]] → <mark>
function marks(s) {
  return esc(s).replace(/\[\[([\s\S]*?)\|(\d+)\]\]/g, (_, t, n) => `<mark data-n="${n}">${t}<sup>${pad(+n)}</sup></mark>`);
}
const plain = s => s.replace(/\[\[([\s\S]*?)\|\d+\]\]/g, '$1');

function home() {
  renderProg();
  const n = total(), first = L.find(l => !done(l.slug)) || L[0];
  app.innerHTML = `
<section class="hero">
<p class="eyebrow mono rise"><span class="sq"></span>/ A short course · ten lessons</p>
<h1 class="h1 rise d1">Prompting for attorneys — ten techniques that change the answer.</h1>
<div class="rule rise d1" aria-hidden="true"></div>
<p class="lede rise d2">Each lesson puts a weak prompt and a strong one side by side, marks exactly what was added and why, checks that it landed, and lets you run the prompt yourself. About an hour, in any order.</p>
<div class="hero-meta rise d3"><span><span class="mono">${pad(n)} / ${pad(L.length)}</span> complete</span><span><span class="mono">${L.reduce((a,l)=>a+l.minutes,0)} min</span> total</span><span><span class="mono">EN</span> · examples from U.S., English and Brazilian law</span></div>
<p class="rise d4" style="margin-top:32px"><a class="btn" href="#/${first.slug}">${n ? 'Continue' : 'Start'} with lesson ${pad(L.indexOf(first)+1)} →</a></p>
</section>
<div class="sechead"><span class="mono"><span class="sq"></span>/ Lessons</span><span class="mono">Weak → strong · why · check · try</span></div>
<div class="list">${L.map((l,i) => `<a class="row ${done(l.slug)?'done':''}" href="#/${l.slug}">
<span class="num">${pad(i+1)}</span>
<span><span class="t">${esc(l.title)}</span><span class="o" style="display:block">${esc(l.one)}</span></span>
<span class="go"><span class="st">${done(l.slug) ? 'Done' : l.minutes + ' min'}</span><span class="arrow">→</span></span></a>`).join('')}</div>
<div class="sechead"><span class="mono"><span class="sq"></span>/ The whole course</span><span class="mono">${pad(n)} / ${pad(L.length)} complete</span></div>
<ol class="proof">${L.map((l,i) => `<li class="${done(l.slug)?'done':''}"><a href="#/${l.slug}"><span class="n mono">${pad(i+1)}</span><span class="t">${esc(l.title)}</span><span class="st mono">${done(l.slug) ? 'Done' : l.minutes + ' min'}</span></a></li>`).join('')}</ol>
<p class="prooflinks">Ten lessons, each with a weak prompt, a strong one, the reason for every change, a check, and a way to run it yourself. <a href="/">Run the tools →</a> · <a href="https://github.com/arthrod/open-legal-artifacts" target="_blank" rel="noopener">Read the source ↗</a></p>`;
}

function lesson(slug) {
  const i = L.findIndex(l => l.slug === slug); if (i < 0) return (location.hash = '#/');
  const l = L[i], prev = L[i-1], next = L[i+1], st = state[slug] || {};
  renderProg(slug);
  window.scrollTo(0,0);
  app.innerHTML = `
<div class="lesson">
<aside class="rail">
<span class="mono">/ Lessons · ${pad(total())} of ${pad(L.length)} done</span>
<ol>${L.map((x,k) => `<li class="${x.slug===slug?'cur':''}${done(x.slug)?' done':''}"><a href="#/${x.slug}"><span class="n">${pad(k+1)}</span><span>${esc(x.short)}</span><span class="d"></span></a></li>`).join('')}</ol>
<a class="back mono" href="#/">← Overview</a>
</aside>
<article class="art">
<p class="eyebrow mono rise"><span><span class="sq"></span>Lesson ${pad(i+1)} of ${pad(L.length)}</span><span>${l.minutes} min</span>${done(slug)?'<span>Done</span>':''}</p>
<h1 class="rise d1">${esc(l.title)}</h1>
<p class="one rise d2">${esc(l.one)}</p>

<section class="sec rise d3"><div class="lab"><span class="mono"><span class="sq"></span>/ The situation</span></div>
<div class="situation">${esc(l.situation)}</div></section>

<section class="sec rise d4"><div class="lab"><span class="mono"><span class="sq"></span>/ Two prompts</span><span class="mono r">Tap a highlight</span></div>
<div class="seg"><button class="on" data-show="without">Without</button><button data-show="with">With the technique</button></div>
<div class="cmp" id="cmp" data-show="without">
<div class="pane without"><div class="ph"><span class="mono">Without</span><span class="meta">${plain(l.weak).split(/\s+/).length} words</span></div><div class="prompt">${esc(l.weak)}</div></div>
<div class="pane with"><div class="ph"><span class="mono">With the technique</span><span class="meta">${plain(l.strong).split(/\s+/).length} words · ${pad(l.notes.length)} changes</span></div><div class="prompt" id="strong">${marks(l.strong)}</div></div>
</div>
<ol class="notes" id="notes">${l.notes.map((n,k) => `<li data-n="${k+1}"><span class="n">${pad(k+1)}</span><span>${esc(n)}</span></li>`).join('')}</ol>
</section>

<section class="sec why"><div class="lab"><span class="mono"><span class="sq"></span>/ Why it works</span></div>
${l.why.map(p => `<p>${esc(p)}</p>`).join('')}
${l.aside ? `<div class="aside"><span class="mono">Field note</span><span>${esc(l.aside)}</span></div>` : ''}
</section>

<section class="sec"><div class="lab"><span class="mono"><span class="sq"></span>/ Check yourself</span><span class="mono r">One question</span></div>
<div class="quiz" id="quiz"><div class="q">${esc(l.check.q)}</div>
<div class="opts">${l.check.opts.map((o,k) => `<button class="opt" data-k="${k}"><span class="k">${String.fromCharCode(65+k)}</span><span>${esc(o)}</span></button>`).join('')}</div>
<div class="fb" id="fb"><span class="mono" id="fbl"></span><span id="fbt"></span></div></div>
</section>

<section class="sec"><div class="lab"><span class="mono"><span class="sq"></span>/ Try it</span><span class="mono r">Edit, then run</span></div>
<div class="try">
<div class="chips"><button class="chip" data-load="weak">Load weak prompt</button><button class="chip" data-load="strong">Load strong prompt</button><button class="chip" data-load="">Clear</button></div>
<textarea id="ta" placeholder="Write your own prompt, or load one above and improve it." spellcheck="false">${esc(plain(l.strong))}</textarea>
<div class="tryfoot"><span class="mono" id="trynote">${window.claude ? 'Runs on a live model · responses are not legal advice' : 'Live model unavailable here · copy the prompt into your own assistant'}</span><div style="display:flex;gap:8px"><button class="btn ghost" id="copy">Copy</button><button class="btn" id="run" ${window.claude?'':'disabled'}>Run →</button></div></div>
<div class="resp" id="resp"><div class="rh"><span class="mono">Response</span><span class="mono" id="rmeta"></span></div><div class="rb" id="rb"></div></div>
</div></section>

<section class="sec"><div class="lab"><span class="mono"><span class="sq"></span>/ Further reading</span></div>
<a class="res" href="${l.resource.url}" target="_blank" rel="noopener"><span><span class="t" style="display:block">${esc(l.resource.title)}</span><span class="d" style="display:block">${esc(l.resource.desc)}</span></span><span class="arrow">→</span></a></section>

<nav class="lnav">
${prev ? `<a class="prev" href="#/${prev.slug}"><span class="mono">← Lesson ${pad(i)}</span><span class="tt">${esc(prev.title)}</span></a>` : `<a class="prev" href="#/"><span class="mono">← Overview</span><span class="tt">All lessons</span></a>`}
<div class="mid"><button class="btn ${done(slug)?'ghost':''}" id="mark">${done(slug) ? 'Completed ✓' : 'Mark complete'}</button></div>
${next ? `<a class="next" href="#/${next.slug}"><span class="mono">Lesson ${pad(i+2)} →</span><span class="tt">${esc(next.title)}</span></a>` : `<a class="next" href="#/"><span class="mono">Finish →</span><span class="tt">Back to overview</span></a>`}
</nav>
</article></div>
<div class="mbar">${prev ? `<a href="#/${prev.slug}">← ${pad(i)}</a>` : `<a href="#/">← Home</a>`}<span class="c"><b>${pad(i+1)}</b>&nbsp;/ ${pad(L.length)}</span>${next ? `<a class="r" href="#/${next.slug}">${pad(i+2)} →</a>` : `<a class="r" href="#/">Finish →</a>`}</div>`;

  // highlight linking
  const sync = (n, on) => { document.querySelectorAll(`#strong mark[data-n="${n}"], #notes li[data-n="${n}"]`).forEach(e => e.classList.toggle('on', on)); };
  document.querySelectorAll('#strong mark, #notes li').forEach(e => {
    e.onmouseenter = () => sync(e.dataset.n, true); e.onmouseleave = () => sync(e.dataset.n, false);
    e.onclick = () => { const was = e.classList.contains('on'); document.querySelectorAll('.on[data-n]').forEach(x => x.classList.remove('on')); if (!was) sync(e.dataset.n, true); if (window.innerWidth <= 900 && e.tagName === 'MARK') { const li = document.querySelector(`#notes li[data-n="${e.dataset.n}"]`); const r = li.getBoundingClientRect(); if (r.bottom > innerHeight - 70) window.scrollBy({top: r.bottom - innerHeight + 90, behavior: 'smooth'}); } };
  });
  // mobile segmented
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => { document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); document.getElementById('cmp').dataset.show = b.dataset.show; });
  // quiz
  const answer = k => {
    const opts = document.querySelectorAll('.opt'); opts.forEach(o => { o.disabled = true; o.classList.toggle('right', +o.dataset.k === l.check.answer); o.classList.toggle('wrong', +o.dataset.k === k && k !== l.check.answer); });
    const ok = k === l.check.answer; document.getElementById('fbl').textContent = ok ? 'Correct' : 'Not quite'; document.getElementById('fbt').textContent = l.check.fb[k]; document.getElementById('fb').classList.add('show');
    state[slug] = Object.assign({}, state[slug], { answered: k, done: true }); save(); renderProg(slug);
    const m = document.getElementById('mark'); m.textContent = 'Completed ✓'; m.classList.add('ghost');
    document.querySelectorAll('.rail li')[i].classList.add('done');
  };
  document.querySelectorAll('.opt').forEach(o => o.onclick = () => answer(+o.dataset.k));
  if (typeof st.answered === 'number') answer(st.answered);
  // mark complete
  document.getElementById('mark').onclick = () => { const d = !done(slug); state[slug] = Object.assign({}, state[slug], { done: d }); save(); renderProg(slug); const m = document.getElementById('mark'); m.textContent = d ? 'Completed ✓' : 'Mark complete'; m.classList.toggle('ghost', d); document.querySelectorAll('.rail li')[i].classList.toggle('done', d); };
  // try it
  const ta = document.getElementById('ta');
  document.querySelectorAll('.chip').forEach(c => c.onclick = () => { ta.value = c.dataset.load === 'weak' ? l.weak : c.dataset.load === 'strong' ? plain(l.strong) : ''; ta.focus(); });
  document.getElementById('copy').onclick = e => { navigator.clipboard && navigator.clipboard.writeText(ta.value); e.target.textContent = 'Copied'; setTimeout(() => e.target.textContent = 'Copy', 1200); };
  document.getElementById('run').onclick = async () => {
    const p = ta.value.trim(); if (!p || !window.claude) return;
    const run = document.getElementById('run'), resp = document.getElementById('resp'), rb = document.getElementById('rb'), rm = document.getElementById('rmeta');
    run.disabled = true; resp.classList.add('show'); rb.innerHTML = '<span class="spin"></span>Generating'; rm.textContent = '';
    const t0 = Date.now();
    try {
      const out = await window.claude.complete({ system: 'You are assisting a lawyer who is practising prompting techniques. Answer the prompt directly and professionally. Do not add disclaimers about seeking legal counsel.', messages: [{ role: 'user', content: p }], max_tokens: 1500 });
      rb.textContent = out; rm.textContent = `${((Date.now()-t0)/1000).toFixed(1)} s · ${out.split(/\s+/).length} words`;
    } catch (err) { rb.textContent = 'The model could not be reached. Copy the prompt into your own assistant instead.'; }
    run.disabled = false;
  };
}

function route() { const h = location.hash.replace(/^#\/?/, ''); h ? lesson(h) : home(); }
addEventListener('hashchange', route); route();
})();
