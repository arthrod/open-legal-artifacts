// persist.test.js — appendLog/loadLog (JSONL) + storage wrappers with
// localStorage safety and in-memory fallback. Run: node --test persist.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendLog, loadLog, createStorage } from './persist.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'persist-test-'));

// ------------------------------------------------------ JSONL log (node)

test('appendLog/loadLog round-trips JSONL entries in order', async () => {
  const file = path.join(tmp(), 'log.jsonl');
  await appendLog(file, { id: 1, note: 'first' });
  await appendLog(file, { id: 2, note: 'second' });
  await appendLog(file, { id: 3, note: 'third' });
  const entries = await loadLog(file);
  assert.deepEqual(entries.map((e) => e.id), [1, 2, 3]);
  assert.equal(entries[1].note, 'second');
});

test('appendLog accepts an array (batch) and loadLog skips blank trailing line', async () => {
  const file = path.join(tmp(), 'batch.jsonl');
  await appendLog(file, [{ a: 1 }, { a: 2 }]);
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(raw.endsWith('\n'));
  assert.equal(raw.split('\n').filter(Boolean).length, 2);
  assert.equal((await loadLog(file)).length, 2);
});

test('loadLog throws a line-numbered error on malformed JSONL (never silently drops)', async () => {
  const file = path.join(tmp(), 'bad.jsonl');
  fs.writeFileSync(file, '{"ok":1}\n{not json}\n{"ok":2}\n', 'utf8');
  await assert.rejects(() => loadLog(file), /line 2/);
});

test('loadLog on a missing file → empty array', async () => {
  assert.deepEqual(await loadLog(path.join(tmp(), 'nope.jsonl')), []);
});

// ------------------------------------------------------ storage wrappers

test('createStorage: in-memory backend round-trip, append order, exportJsonl', () => {
  const s = createStorage('t-mem', { backend: 'memory' });
  assert.equal(s.backendName, 'memory');
  assert.equal(s.get('k'), null);
  s.set('k', { n: 1 });
  assert.deepEqual(s.get('k'), { n: 1 });
  s.append('log', { i: 1 });
  s.append('log', { i: 2 });
  assert.deepEqual(s.entries('log'), [{ i: 1 }, { i: 2 }]);
  const jsonl = s.exportJsonl('log');
  assert.equal(jsonl, '{"i":1}\n{"i":2}\n');
});

test('createStorage: localStorage backend persists under namespaced keys', () => {
  const store = new Map();
  const g = globalThis;
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
  try {
    const s = createStorage('t-local', { backend: 'local' });
    assert.equal(s.backendName, 'local');
    s.set('pref', { theme: 'light' });
    s.append('audit', { step: 'ingest' });
    assert.deepEqual(s.get('pref'), { theme: 'light' });
    assert.deepEqual(s.entries('audit'), [{ step: 'ingest' }]);
    assert.ok([...store.keys()].every((k) => k.startsWith('t-local:')), 'keys namespaced');
  } finally {
    g.localStorage = prev ?? undefined;
    if (!prev) delete g.localStorage;
  }
});

test('createStorage: localStorage that THROWS (privacy mode/quota) falls back to memory without throwing', () => {
  const g = globalThis;
  const prev = g.localStorage;
  g.localStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('quota'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  try {
    const s = createStorage('t-blocked', { backend: 'local' });
    assert.equal(s.backendName, 'memory-fallback');
    s.set('k', 'v'); // must not throw
    assert.equal(s.get('k'), 'v');
    s.append('log', { ok: true });
    assert.deepEqual(s.entries('log'), [{ ok: true }]);
  } finally {
    g.localStorage = prev ?? undefined;
    if (!prev) delete g.localStorage;
  }
});

test('createStorage: auto prefers localStorage when usable, else memory', () => {
  const plain = createStorage('t-auto-mem', { backend: 'auto' }); // node: no localStorage
  assert.equal(plain.backendName, 'memory');

  const g = globalThis;
  const prev = g.localStorage;
  const store = new Map();
  g.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
  try {
    const s = createStorage('t-auto-local', { backend: 'auto' });
    assert.equal(s.backendName, 'local');
  } finally {
    g.localStorage = prev ?? undefined;
    if (!prev) delete g.localStorage;
  }
});

test('createStorage: quota degradation mid-session reads through localStorage (audit log must not vanish)', () => {
  const g = globalThis;
  const prev = g.localStorage;
  const store = new Map();
  let quota = false;
  g.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { if (quota) throw new Error('quota exceeded'); store.set(k, String(v)); },
    removeItem: (k) => void store.delete(k),
  };
  try {
    const s = createStorage('t-degrade', { backend: 'local' });
    assert.equal(s.backendName, 'local');
    s.append('audit', { i: 1 });            // persisted to localStorage
    s.set('pref', { theme: 'light' });
    quota = true;                            // every write from here hits quota
    s.append('audit', { i: 2 });            // degrades → memory fallback
    assert.equal(s.backendName, 'memory-fallback');
    assert.deepEqual(s.get('pref'), { theme: 'light' }, 'mem miss reads through localStorage');
    assert.deepEqual(s.entries('audit'), [{ i: 1 }, { i: 2 }], 'audit log must not vanish');
    s.append('audit', { i: 3 });
    assert.deepEqual(s.entries('audit'), [{ i: 1 }, { i: 2 }, { i: 3 }]);
  } finally {
    g.localStorage = prev ?? undefined;
    if (!prev) delete g.localStorage;
  }
});

test('createStorage: set overwrites; remove clears; JSON round-trip for objects', () => {
  const s = createStorage('t-mut', { backend: 'memory' });
  s.set('x', { a: [1, 2] });
  s.set('x', { a: [3] });
  assert.deepEqual(s.get('x'), { a: [3] });
  s.remove('x');
  assert.equal(s.get('x'), null);
});
