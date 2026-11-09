/** node:test smoke suite for the prompting-for-attorneys course SPA.
 * Run from repo root: node --test artifacts/prompting-for-attorneys/smoke.test.js
 *
 * The course has no build step and no framework: js/lessons.js defines window.LESSONS
 * and js/app.js is an IIFE hash router. These tests load both sources and eval them
 * under a minimal DOM stub (same method as the ola-inspect-2026-11-08 execution
 * probe), so the real app code — routing, quiz grading, progress persistence — runs
 * unmodified. Stub boundaries are listed in the comment at the bottom of this file. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LESSONS_SRC = readFileSync(new URL('./js/lessons.js', import.meta.url), 'utf8');
const APP_SRC = readFileSync(new URL('./js/app.js', import.meta.url), 'utf8');
const INDEX_HTML = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
// The static page header carries #prog and the .sizes buttons that app.js wires at boot.
const HEADER_HTML = /<header class="hdr">[\s\S]*?<\/header>/.exec(INDEX_HTML)?.[0] || '';

// Mirrors of app.js helpers, used to build expected strings for assertions.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (s) => s.replace(/\[\[([\s\S]*?)\|\d+\]\]/g, '$1');
const PROGRESS_KEY = 'asr-prompting-progress';
const SIZE_KEY = 'asr-prompting-size';

// Evaluate the data module once for direct access in tests.
globalThis.window = globalThis;
(0, eval)(LESSONS_SRC);
const LESSONS_ALL = globalThis.window.LESSONS;

// ---------------------------------------------------------------------------
// Minimal DOM stub — supports exactly the surface js/app.js uses:
//   document.getElementById (static per-id stubs, e.g. #app, plus ids inside
//   rendered innerHTML), document.querySelector(All) over a regex-parsed tree
//   of every element whose innerHTML was assigned, classList with force-toggle,
//   dataset from data-* attributes, onclick/onmouseenter/onmouseleave, and
//   documentElement.dataset for the text-size switch.
// ---------------------------------------------------------------------------

function makeClassList(initial) {
  const set = new Set((initial || '').split(/\s+/).filter(Boolean));
  return {
    add: (...cs) => cs.forEach((c) => set.add(c)),
    remove: (...cs) => cs.forEach((c) => set.delete(c)),
    toggle(c, force) {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on) set.add(c); else set.delete(c);
      return on;
    },
    contains: (c) => set.has(c),
  };
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr']);
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;

function parseAttrs(str) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(str))) attrs[m[1]] = m[2] ?? m[3] ?? '';
  return attrs;
}

function walk(nodes, fn) {
  for (const n of nodes) { fn(n); walk(n._children, fn); }
}

// Compound selector: tag, .class, #id, [attr] / [attr="value"] — the forms app.js uses.
function matchesCompound(el, sel) {
  const tagM = /^([a-zA-Z][a-zA-Z0-9]*)/.exec(sel);
  let rest = sel;
  if (tagM) {
    if (el.tagName !== tagM[1].toUpperCase()) return false;
    rest = sel.slice(tagM[1].length);
  }
  const tokRe = /\.([a-zA-Z_][\w-]*)|#([\w-]+)|\[([^\]]*)\]/g;
  let t;
  let consumed = 0;
  while ((t = tokRe.exec(rest))) {
    consumed = tokRe.lastIndex;
    if (t[1] !== undefined) {
      if (!el.classList.contains(t[1])) return false;
    } else if (t[2] !== undefined) {
      if (el.id !== t[2]) return false;
    } else {
      const am = /^([\w-]+)(?:\s*=\s*"([^"]*)")?$/.exec(t[3]);
      if (!am) return false;
      if (am[2] === undefined) {
        if (el._attrs[am[1]] === undefined) return false;
      } else if (el._attrs[am[1]] !== am[2]) return false;
    }
  }
  return consumed === rest.length;
}

// Selector lists with commas and descendant combinators (all app.js uses).
function matchesSelector(el, selector) {
  return selector.split(',').map((s) => s.trim()).filter(Boolean).some((complex) => {
    const parts = complex.split(/\s+/).filter(Boolean);
    if (!parts.length || !matchesCompound(el, parts[parts.length - 1])) return false;
    for (let i = parts.length - 2; i >= 0; i--) {
      let p = el._parent;
      let ok = false;
      while (p) { if (matchesCompound(p, parts[i])) { ok = true; break; } p = p._parent; }
      if (!ok) return false;
    }
    return true;
  });
}

/** A fresh page: own localStorage, own element registry, own location. */
function createWorld({ hash = '#/', storage = new Map() } = {}) {
  const els = new Map();        // static per-id stubs — the index.html elements (#app, …)
  const containers = new Set(); // elements whose innerHTML was assigned — queryable roots

  function makeEl(tag, attrs = {}) {
    const el = {
      tagName: String(tag).toUpperCase(),
      id: attrs.id || '',
      _attrs: attrs,
      _tree: null,
      dataset: {},
      style: {},
      disabled: false,
      value: '',
      textContent: '',
      onclick: null,
      onmouseenter: null,
      onmouseleave: null,
      _html: '',
      _text: '',
      _children: [],
      _parent: null,
      focus() {},
      getBoundingClientRect: () => ({ bottom: 0 }),
    };
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('data-')) el.dataset[k.slice(5)] = v;
    }
    el.classList = makeClassList(attrs.class);
    Object.defineProperty(el, 'innerHTML', {
      get: () => el._html,
      set(v) { el._html = String(v); el._tree = null; containers.add(el); },
      configurable: true,
    });
    return el;
  }

  function parseTree(html) {
    const roots = [];
    const stack = [];
    TAG_RE.lastIndex = 0;
    let m;
    let prevEnd = 0;
    while ((m = TAG_RE.exec(html))) {
      const text = html.slice(prevEnd, m.index);
      prevEnd = TAG_RE.lastIndex;
      const top = stack[stack.length - 1];
      if (top) top._text += text; // stray text at root level is ignored
      const [, close, tag, attrStr] = m;
      if (close) {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tagName === tag.toUpperCase()) {
            const el = stack[i];
            // leaf elements keep their text content (e.g. the #mark button label)
            if (!el._children.length) el.textContent = el._text;
            stack.length = i;
            break;
          }
        }
        continue;
      }
      const el = makeEl(tag, parseAttrs(attrStr));
      el._parent = stack[stack.length - 1] || null;
      (el._parent ? el._parent._children : roots).push(el);
      if (!VOID_TAGS.has(tag.toLowerCase())) stack.push(el);
    }
    return roots;
  }

  function treeOf(c) {
    if (!c._tree) c._tree = parseTree(c._html);
    return c._tree;
  }

  const documentStub = {
    documentElement: { dataset: {} },
    getElementById(id) {
      for (const c of containers) {
        let found = null;
        walk(treeOf(c), (el) => { if (!found && el.id === id) found = el; });
        if (found) return found;
      }
      if (!els.has(id)) els.set(id, makeEl('div', { id }));
      return els.get(id);
    },
    querySelectorAll(selector) {
      const out = [];
      for (const c of containers) {
        if (!c._html) continue;
        walk(treeOf(c), (el) => { if (matchesSelector(el, selector)) out.push(el); });
      }
      return out;
    },
    querySelector(selector) { return documentStub.querySelectorAll(selector)[0] || null; },
  };

  const localStorageStub = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: (k) => { storage.delete(k); },
  };

  const world = {
    document: documentStub,
    location: { hash },
    storage,
    lessons: null,
    el: (id) => documentStub.getElementById(id),
    qsa: (sel) => documentStub.querySelectorAll(sel),
    html: () => documentStub.getElementById('app').innerHTML,
    load() {
      // Seed the static header (#prog, .sizes buttons), then run the real scripts.
      const header = makeEl('header');
      header.innerHTML = HEADER_HTML;
      globalThis.window = globalThis;
      globalThis.document = documentStub;
      globalThis.location = world.location;
      globalThis.localStorage = localStorageStub;
      globalThis.addEventListener = () => {};
      globalThis.scrollTo = () => {};
      globalThis.innerWidth = 1280; // > 900: skips the mobile scroll branch in app.js
      (0, eval)(LESSONS_SRC);
      (0, eval)(APP_SRC);
      world.lessons = globalThis.window.LESSONS;
      return world;
    },
  };
  return world;
}

// ---------------------------------------------------------------------------
// 1) Lessons data integrity
// ---------------------------------------------------------------------------

test('lessons: ten lessons, unique resolvable slugs, every content field non-empty', () => {
  const w = createWorld().load();
  const L = w.lessons;
  assert.ok(Array.isArray(L), 'window.LESSONS is an array');
  assert.equal(L.length, 10, 'ten lessons');
  assert.equal(new Set(L.map((l) => l.slug)).size, 10, 'slugs unique');

  for (const l of L) {
    const where = `lesson "${l.slug}"`;
    assert.match(l.slug, /^[a-z0-9-]+$/, `${where}: slug format`);
    for (const f of ['short', 'title', 'one', 'situation', 'weak', 'strong']) {
      assert.ok(typeof l[f] === 'string' && l[f].trim().length > 0, `${where}: ${f} non-empty`);
    }
    assert.ok(Number.isFinite(l.minutes) && l.minutes > 0, `${where}: minutes positive`);
    assert.ok(Array.isArray(l.notes) && l.notes.length > 0, `${where}: notes present`);
    l.notes.forEach((n, i) => assert.ok(typeof n === 'string' && n.trim(), `${where}: notes[${i}] non-empty`));
    assert.ok(Array.isArray(l.why) && l.why.length > 0, `${where}: why present`);
    l.why.forEach((p, i) => assert.ok(typeof p === 'string' && p.trim(), `${where}: why[${i}] non-empty`));
    if ('aside' in l) assert.ok(typeof l.aside === 'string' && l.aside.trim(), `${where}: aside non-empty`);
    assert.ok(l.resource && l.resource.title && l.resource.desc, `${where}: resource titled`);
    assert.match(l.resource.url, /^https:\/\//, `${where}: resource url`);
  }

  // Total course length the home page advertises.
  assert.equal(L.reduce((a, l) => a + l.minutes, 0), 57, 'advertised total minutes');
});

test('lessons: every [[mark|n]] resolves to a note and every note is referenced', () => {
  const w = createWorld().load();
  for (const l of w.lessons) {
    const re = /\[\[([\s\S]*?)\|(\d+)\]\]/g;
    const refs = [];
    let m;
    while ((m = re.exec(l.strong))) {
      assert.ok(m[1].trim().length > 0, `lesson "${l.slug}": mark ${m[2]} has text`);
      refs.push(+m[2]);
    }
    for (const n of refs) {
      assert.ok(n >= 1 && n <= l.notes.length, `lesson "${l.slug}": mark n=${n} within notes (1..${l.notes.length})`);
    }
    for (let i = 1; i <= l.notes.length; i++) {
      assert.ok(refs.includes(i), `lesson "${l.slug}": note ${i} referenced by a mark`);
    }
  }
});

test('lessons: quiz answer key present and feedback covers every option', () => {
  const w = createWorld().load();
  for (const l of w.lessons) {
    const c = l.check;
    const where = `lesson "${l.slug}"`;
    assert.ok(c && typeof c.q === 'string' && c.q.trim(), `${where}: check.q non-empty`);
    assert.ok(Array.isArray(c.opts) && c.opts.length >= 2, `${where}: at least two options`);
    c.opts.forEach((o, i) => assert.ok(typeof o === 'string' && o.trim(), `${where}: opts[${i}] non-empty`));
    assert.ok(Number.isInteger(c.answer), `${where}: answer is an integer`);
    assert.ok(c.answer >= 0 && c.answer < c.opts.length, `${where}: answer ${c.answer} in range 0..${c.opts.length - 1}`);
    assert.ok(Array.isArray(c.fb) && c.fb.length === c.opts.length, `${where}: one feedback per option`);
    c.fb.forEach((f, i) => assert.ok(typeof f === 'string' && f.trim(), `${where}: fb[${i}] non-empty`));
  }
});

// ---------------------------------------------------------------------------
// 2) Router: home + every lesson route renders the real app without throwing
// ---------------------------------------------------------------------------

test('router: home renders the overview with all ten lessons linked', () => {
  const w = createWorld().load();
  const html = w.html();
  assert.ok(html.length > 1000, 'home produced markup');
  assert.ok(html.includes('Prompting for attorneys — ten techniques that change the answer.'), 'hero title');
  assert.equal((html.match(/class="row /g) || []).length, 10, 'one row per lesson');
  for (const l of w.lessons) {
    assert.ok(html.includes(`href="#/${l.slug}"`), `home links to "${l.slug}"`);
    assert.ok(html.includes(esc(l.title)), `home lists title of "${l.slug}"`);
  }
  assert.ok(html.includes('57 min'), 'total course minutes');
  assert.ok(html.includes('Start with lesson 01'), 'fresh start button');
  assert.ok(html.includes('00 / 10 complete'), 'fresh progress counter');
});

test('router: each lesson route renders its content and quiz without throwing', () => {
  for (const l of LESSONS_ALL) {
    const w = createWorld({ hash: `#/${l.slug}` }).load();
    const html = w.html();
    const where = `route #/${l.slug}`;
    assert.ok(html.length > 1000, `${where}: produced markup`);
    assert.ok(html.includes(`<h1 class="rise d1">${esc(l.title)}</h1>`), `${where}: h1 title`);
    assert.ok(html.includes(esc(l.one)), `${where}: one-liner`);
    assert.ok(html.includes(esc(l.situation)), `${where}: situation`);
    assert.ok(html.includes(esc(l.weak)), `${where}: weak prompt pane`);
    assert.ok(html.includes(esc(l.check.q)), `${where}: quiz question`);
    assert.ok(html.includes(esc(l.resource.title)), `${where}: further-reading title`);
    assert.ok(html.includes(l.resource.url), `${where}: further-reading url`);
    assert.equal(w.qsa('.opt').length, l.check.opts.length, `${where}: one .opt button per option`);
    assert.ok(html.includes('id="run" disabled'), `${where}: Run disabled without window.claude`);
    assert.ok(html.includes('Live model unavailable here'), `${where}: honest try-note`);
    // prev/next navigation targets
    const i = LESSONS_ALL.indexOf(l);
    if (i > 0) assert.ok(html.includes(`href="#/${LESSONS_ALL[i - 1].slug}"`), `${where}: prev link`);
    if (i < LESSONS_ALL.length - 1) assert.ok(html.includes(`href="#/${LESSONS_ALL[i + 1].slug}"`), `${where}: next link`);
  }
});

test('router: unknown slug resets the hash to #/ instead of rendering', () => {
  const w = createWorld({ hash: '#/not-a-lesson' }).load();
  assert.equal(w.location.hash, '#/');
  assert.equal(w.html(), '', 'nothing rendered for unknown slug');
});

test('boot: text-size control applies and persists through localStorage', () => {
  const w = createWorld().load();
  assert.equal(w.document.documentElement.dataset.size, 'normal', 'default size');
  const buttons = w.qsa('.sizes button');
  assert.equal(buttons.length, 2, 'two size buttons in the static header');
  const large = buttons.find((b) => b.dataset.size === 'large');
  large.onclick();
  assert.equal(w.document.documentElement.dataset.size, 'large', 'documentElement updated');
  assert.equal(w.storage.get(SIZE_KEY), 'large', 'choice persisted');
  assert.ok(large.classList.contains('on'), 'large button active');
  assert.ok(!buttons.find((b) => b.dataset.size === 'normal').classList.contains('on'), 'normal button inactive');
});

// ---------------------------------------------------------------------------
// 3) Quiz grading — every option of every lesson, through the real answer() path
// ---------------------------------------------------------------------------

test('quiz: grading math is correct for every option of every lesson', () => {
  for (const l of LESSONS_ALL) {
    const w = createWorld({ hash: `#/${l.slug}` }).load();
    const opts = w.qsa('.opt');
    assert.equal(opts.length, l.check.opts.length, `lesson "${l.slug}": option buttons rendered`);

    for (let k = 0; k < l.check.opts.length; k++) {
      const where = `lesson "${l.slug}" option ${k}`;
      opts.find((o) => +o.dataset.k === k).onclick(); // simulate the click

      const ok = k === l.check.answer;
      assert.equal(w.el('fbl').textContent, ok ? 'Correct' : 'Not quite', `${where}: verdict label`);
      assert.equal(w.el('fbt').textContent, l.check.fb[k], `${where}: feedback text`);
      assert.ok(w.el('fb').classList.contains('show'), `${where}: feedback revealed`);

      const after = w.qsa('.opt');
      assert.ok(after.every((o) => o.disabled), `${where}: all options locked`);
      assert.equal(after.filter((o) => o.classList.contains('right')).length, 1, `${where}: exactly one right`);
      assert.ok(after.find((o) => +o.dataset.k === l.check.answer).classList.contains('right'), `${where}: right lands on the answer key`);
      for (let j = 0; j < after.length; j++) {
        const wrongExpected = j === k && j !== l.check.answer;
        assert.equal(after.find((o) => +o.dataset.k === j).classList.contains('wrong'), wrongExpected, `${where}: wrong flag on option ${j}`);
      }

      // Answering marks the lesson done and persists it — progress side effect.
      const state = JSON.parse(w.storage.get(PROGRESS_KEY));
      assert.deepEqual(state[l.slug], { answered: k, done: true }, `${where}: state persisted`);
      assert.equal(w.el('mark').textContent, 'Completed ✓', `${where}: mark button flips`);
      assert.equal((w.el('prog').innerHTML.match(/class="on/g) || []).length, 1, `${where}: progress bar fills one slot`);
      assert.ok(w.qsa('.rail li')[LESSONS_ALL.indexOf(l)].classList.contains('done'), `${where}: rail entry done`);
    }
  }
});

test('quiz: a stored answer is re-graded on load (resume behavior)', () => {
  const l = LESSONS_ALL.find((x) => x.slug === 'steps'); // answer key 0 — exercises the zero index
  const storage = new Map([[PROGRESS_KEY, JSON.stringify({ steps: { answered: l.check.answer, done: true } })]]);
  const w = createWorld({ hash: `#/${l.slug}`, storage }).load();
  assert.equal(w.el('fbl').textContent, 'Correct', 'verdict restored');
  assert.equal(w.el('fbt').textContent, l.check.fb[l.check.answer], 'feedback restored');
  assert.ok(w.qsa('.opt').every((o) => o.disabled), 'options locked on load');
  assert.ok(w.qsa('.opt').find((o) => +o.dataset.k === l.check.answer).classList.contains('right'), 'right flag restored');
});

// ---------------------------------------------------------------------------
// 4) Progress tracking — mark-complete toggle, persistence, home summary
// ---------------------------------------------------------------------------

test('progress: mark-complete toggles, persists, and survives a reload', () => {
  const storage = new Map();
  const w = createWorld({ hash: '#/persona', storage }).load();

  assert.equal(w.el('mark').textContent, 'Mark complete', 'initially undone');
  w.el('mark').onclick();
  assert.equal(w.el('mark').textContent, 'Completed ✓', 'flips to completed');
  assert.ok(w.el('mark').classList.contains('ghost'), 'ghost style on');
  assert.deepEqual(JSON.parse(storage.get(PROGRESS_KEY)).persona, { done: true }, 'persisted');
  assert.ok(w.qsa('.rail li')[0].classList.contains('done'), 'rail entry done');
  assert.equal((w.el('prog').innerHTML.match(/class="on/g) || []).length, 1, 'progress bar 1/10');

  w.el('mark').onclick(); // toggle back off
  assert.equal(w.el('mark').textContent, 'Mark complete', 'toggles back');
  assert.deepEqual(JSON.parse(storage.get(PROGRESS_KEY)).persona, { done: false }, 'persisted again');
  assert.equal((w.el('prog').innerHTML.match(/class="on/g) || []).length, 0, 'progress bar 0/10');

  w.el('mark').onclick(); // done again, then reload the whole SPA over the same storage
  const h = createWorld({ hash: '#/', storage }).load();
  const home = h.html();
  assert.ok(home.includes('01 / 10 complete'), 'home counter after reload');
  assert.ok(home.includes('Continue with lesson 02'), 'continue points at first undone lesson');
  assert.ok(home.includes('href="#/context"'), 'continue target is the context lesson');
  assert.ok(home.includes('class="row done"'), 'done row marked in the list');
});

test('progress: corrupt localStorage degrades to a fresh start, never crashes', () => {
  const storage = new Map([[PROGRESS_KEY, '{not json'], [SIZE_KEY, 'large']]);
  const w = createWorld({ hash: '#/', storage }).load(); // must not throw
  assert.ok(w.html().includes('00 / 10 complete'), 'fresh progress after corrupt state');
  assert.equal(w.document.documentElement.dataset.size, 'large', 'size key still honoured');
});

// ---------------------------------------------------------------------------
// 5) Lesson UI interactions — compare toggle, prompt chips, highlight linking
// ---------------------------------------------------------------------------

test('lesson UI: compare toggle, prompt chips, and highlight linking', () => {
  const l = LESSONS_ALL.find((x) => x.slug === 'examples');
  const w = createWorld({ hash: `#/${l.slug}` }).load();

  // segmented weak/strong toggle
  assert.equal(w.el('cmp').dataset.show, 'without', 'starts on Without');
  const withBtn = w.qsa('.seg button').find((b) => b.dataset.show === 'with');
  withBtn.onclick();
  assert.equal(w.el('cmp').dataset.show, 'with', 'toggles to With');
  assert.ok(withBtn.classList.contains('on'), 'segment button active');

  // prompt chips fill the try-it textarea
  const ta = w.el('ta');
  const chip = (load) => w.qsa('.chip').find((c) => c.dataset.load === load);
  chip('weak').onclick();
  assert.equal(ta.value, l.weak, 'weak prompt loaded');
  chip('strong').onclick();
  assert.equal(ta.value, plain(l.strong), 'strong prompt loaded, marks stripped');
  chip('').onclick();
  assert.equal(ta.value, '', 'cleared');

  // tapping a highlight syncs its note (and only that one)
  const firstMark = w.qsa('#strong mark')[0];
  firstMark.onclick();
  const n = firstMark.dataset.n;
  assert.ok(firstMark.classList.contains('on'), 'mark highlighted');
  assert.ok(w.qsa(`#notes li[data-n="${n}"]`)[0].classList.contains('on'), 'paired note highlighted');
  assert.equal(w.qsa('#strong mark.on').length, 1, 'no other mark highlighted');
});

/* Stub boundaries (what these tests do NOT cover):
 * - window.claude bridge (absent here too: the Run button renders disabled and the
 *   try-note says the live model is unavailable — asserted in the router tests).
 * - navigator.clipboard (Copy button handler is bound but never invoked).
 * - hashchange event loop: the stub's addEventListener is a no-op, so an unknown
 *   slug sets location.hash back to '#/' without a follow-up home() render.
 * - the #ta textarea starts with value '' (the parser keeps text of leaf elements
 *   but does not sync it into value); only chip interactions set it, which is what
 *   the tests assert.
 * - CSS, fonts, and anything visual. */
