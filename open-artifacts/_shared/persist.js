/**
 * persist.js — JSONL append/load + storage wrappers (dependency-free ESM).
 *
 * Node/browser safe:
 *   appendLog(file, entryOrEntries) — append JSONL (Node fs; batch ok).
 *   loadLog(file)                   — parse JSONL; line-numbered error on
 *                                     malformed lines (never silently drops);
 *                                     missing file → [].
 *   createStorage(ns, {backend})    — get/set/remove/append/entries/exportJsonl
 *                                     over localStorage when usable, with an
 *                                     in-memory fallback when localStorage is
 *                                     absent or throws (privacy mode/quota).
 *                                     After mid-session quota degradation,
 *                                     reads fall through to localStorage on
 *                                     memory misses (logs never vanish) and
 *                                     backendName reports 'memory-fallback'.
 *                                     backend: 'auto' | 'local' | 'memory'.
 *
 * 'node:fs' is imported lazily inside appendLog/loadLog so the module can be
 * vendored into browser bundles without a build-time Node import.
 * Zero console side effects. All example data fictional.
 */

/** @typedef {{get(k: string): unknown, set(k: string, v: unknown): void,
 *             remove(k: string): void, append(k: string, entry: unknown): void,
 *             entries(k: string): unknown[], exportJsonl(k: string): string,
 *             backendName: string}} Storage */

function memoryBackend(name) {
  const map = new Map(); // key → array of ops (last set wins, appends accumulate)
  return /** @type {Storage} */ ({
    backendName: name,
    get(k) {
      const v = map.get(k);
      return v === undefined ? null : v.value;
    },
    set(k, v) {
      map.set(k, { kind: 'value', value: JSON.parse(JSON.stringify(v ?? null)) });
    },
    remove(k) {
      map.delete(k);
    },
    append(k, entry) {
      if (!map.has(k) || map.get(k).kind !== 'log') map.set(k, { kind: 'log', items: [] });
      map.get(k).items.push(JSON.parse(JSON.stringify(entry ?? null)));
    },
    entries(k) {
      const v = map.get(k);
      return v && v.kind === 'log' ? v.items.slice() : [];
    },
    exportJsonl(k) {
      return this.entries(k).map((e) => JSON.stringify(e)).join('\n') + (this.entries(k).length ? '\n' : '');
    },
  });
}

/** Probe localStorage: usable only if getItem AND setItem both work. */
function probeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probeKey = '__persist_probe__';
    ls.setItem(probeKey, '1');
    const ok = ls.getItem(probeKey) === '1';
    ls.removeItem(probeKey);
    return ok ? ls : null;
  } catch {
    return null;
  }
}

function localBackend(namespace) {
  const ls = probeLocalStorage();
  if (!ls) return memoryBackend('memory-fallback'); // throws in privacy mode → fallback
  const key = (k) => `${namespace}:${k}`;
  const read = (k) => {
    try {
      const raw = ls.getItem(key(k));
      return raw == null ? null : raw;
    } catch {
      return null;
    }
  };
  let degraded = false;
  const mem = memoryBackend('memory');
  const readThrough = (k) => { // after degradation, pre-degradation data still lives in localStorage
    const raw = read(k);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  return /** @type {Storage} */ ({
    get backendName() { return degraded ? 'memory-fallback' : 'local'; },
    get(k) {
      if (degraded) {
        const v = mem.get(k);
        return v !== null ? v : readThrough(k); // mem miss → read through localStorage
      }
      const raw = read(k);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null; // unreadable payload is surfaced as absent, never guessed
      }
    },
    set(k, v) {
      if (degraded) return mem.set(k, v);
      try {
        ls.setItem(key(k), JSON.stringify(v ?? null));
      } catch {
        degraded = true; // quota hit mid-session → fall back from now on
        mem.set(k, v);
      }
    },
    remove(k) {
      if (degraded) return mem.remove(k);
      try {
        ls.removeItem(key(k));
      } catch {
        degraded = true;
      }
    },
    append(k, entry) {
      const cur = this.entries(k);
      cur.push(entry);
      this.set(k, cur);
    },
    entries(k) {
      const v = this.get(k);
      return Array.isArray(v) ? v : [];
    },
    exportJsonl(k) {
      const es = this.entries(k);
      return es.map((e) => JSON.stringify(e)).join('\n') + (es.length ? '\n' : '');
    },
  });
}

/**
 * Create a storage wrapper. backend 'auto' prefers localStorage when it
 * actually works, otherwise in-memory.
 *
 * @param {string} namespace
 * @param {{backend?: 'auto' | 'local' | 'memory'}} [opts]
 * @returns {Storage}
 */
export function createStorage(namespace, opts = {}) {
  const backend = opts.backend ?? 'auto';
  if (backend === 'memory') return memoryBackend('memory');
  if (backend === 'local') return localBackend(namespace);
  return probeLocalStorage() ? localBackend(namespace) : memoryBackend('memory');
}

async function nodeFs() {
  try {
    return await import('node:fs');
  } catch {
    throw new Error('appendLog/loadLog require Node (node:fs unavailable)');
  }
}

/**
 * Append one entry or a batch of entries to a JSONL file (one JSON object
 * per line, trailing newline). Creates the file on first append.
 *
 * @param {string} file
 * @param {unknown} entryOrEntries
 * @returns {Promise<void>}
 */
export async function appendLog(file, entryOrEntries) {
  const fsMod = await nodeFs();
  const list = Array.isArray(entryOrEntries) ? entryOrEntries : [entryOrEntries];
  const block = list.map((e) => JSON.stringify(e ?? null)).join('\n') + '\n';
  await fsMod.promises.appendFile(file, block, 'utf8');
}

/**
 * Load a JSONL file. Blank lines are skipped; a malformed line throws an
 * error naming the 1-based line number — data is never silently dropped.
 * A missing file yields [].
 *
 * @param {string} file
 * @returns {Promise<unknown[]>}
 */
export async function loadLog(file) {
  const fsMod = await nodeFs();
  let raw;
  try {
    raw = await fsMod.promises.readFile(file, 'utf8');
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return [];
    throw err;
  }
  const out = [];
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      throw new Error(`loadLog: malformed JSONL at ${file} line ${i + 1}`);
    }
  }
  return out;
}
