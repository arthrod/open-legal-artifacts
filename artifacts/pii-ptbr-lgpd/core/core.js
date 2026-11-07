/**
 * pii-ptbr-lgpd — deterministic rules-based PII detector (demo core).
 *
 * Detects Brazilian personally identifiable information in pt-BR text with
 * char-offset spans: pattern rules (CPF/CNPJ with checksum validation, RG,
 * BR phone, email, dates) plus gazetteer rules (street types, BR personal
 * names, LGPD Art. 5º II sensitive mentions: saúde, religião, origem).
 *
 * HONESTY NOTE: this is a rules-based demo. Confidence values are FIXED per
 * rule — a match means "a rule fired", never "a model scored this span".
 * The fine-tuned GLiNER/OPF models run on HF Spaces:
 *   https://huggingface.co/spaces/arthrod/gliner-ptbr-pii-demo
 *   https://huggingface.co/spaces/arthrod/gliner-opf-ptbr-pii-demo
 *
 * No LLM, no network, no dependencies. Browser + Node ES module.
 *
 * @module core
 */

// ---------------------------------------------------------------------------
// Gazetteers (all fictional example data; word lists are common BR tokens)
// ---------------------------------------------------------------------------

/** Common Brazilian first names for the name-gazetteer rule (case-sensitive). */
const FIRST_NAMES = [
  'Ana', 'André', 'Antônio', 'Beatriz', 'Bruno', 'Camila', 'Carlos', 'Célia',
  'Diego', 'Fernanda', 'Felipe', 'Gabriela', 'Joana', 'João', 'Júlia',
  'Larissa', 'Lucas', 'Luana', 'Marcela', 'Marcelo', 'Mariana', 'Marina',
  'Marta', 'Pedro', 'Rafael', 'Sérgio', 'Tatiana', 'Thiago', 'Vivian',
];

/** Common Brazilian surnames for the name-gazetteer rule (case-sensitive). */
const SURNAMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Carvalho', 'Correia', 'Costa', 'Ferreira',
  'Fonseca', 'Gomes', 'Lima', 'Martins', 'Moraes', 'Moreira', 'Nogueira',
  'Oliveira', 'Pereira', 'Ribeiro', 'Rocha', 'Sales', 'Santana', 'Santos',
  'Silva', 'Souza', 'Teixeira',
];

/** Street-type tokens that start a BR address span. */
const STREET_TYPES = ['Avenida', 'Av\\.', 'Rua', 'Travessa', 'Alameda', 'Estrada', 'Rodovia', 'Praça', 'Beco'];

/** LGPD Art. 5º, II, "f" — health mentions (longest first so long phrases win). */
const HEALTH_PHRASES = [
  'diabetes tipo 2', 'hipertensão arterial', 'transtorno depressivo',
  'transtorno de ansiedade', 'tratamento oncológico', 'portador de deficiência',
  'portadora de deficiência', 'quimioterapia', 'hemodiálise', 'soropositivo',
  'soropositiva', 'diabetes', 'hipertensão', 'hiv',
];

/** LGPD Art. 5º, II, "b" — religious conviction mentions. */
const RELIGION_PHRASES = [
  'testemunha de jeová', 'católico praticante', 'católica praticante',
  'católico', 'católica', 'evangélico', 'evangélica', 'espírita',
  'umbandista', 'umbanda', 'candomblé', 'muçulmano', 'muçulmana',
  'judeu', 'judia', 'budista', 'ateu', 'ateia', 'cristão', 'cristã',
];

/** LGPD Art. 5º, II, "a" — racial/ethnic origin mentions. */
const ORIGIN_PHRASES = [
  'imigrantes japoneses', 'imigrantes italianos', 'imigrantes alemães',
  'descendente de japoneses', 'descendente de italianos', 'descendente de sírios',
  'afrodescendente', 'afrobrasileiro', 'quilombola', 'indígena',
  'imigrante', 'imigrantes', 'refugiado', 'refugiada', 'apátrida', 'cigano',
];

/** Long-form month names for the BR date rule. */
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Entity type → LGPD grouping (Art. 5º, I / II). Used by lgpdCategories(). */
export const LGPD_GROUPS = Object.freeze([
  Object.freeze({
    key: 'identificadores',
    article: 'Art. 5º, I',
    label: 'Dados pessoais — identificadores diretos',
    types: Object.freeze(['NOME_COMPLETO', 'CPF', 'RG', 'TELEFONE', 'EMAIL', 'ENDERECO', 'DATA_DE_NASCIMENTO', 'DATA']),
  }),
  Object.freeze({
    key: 'saude',
    article: 'Art. 5º, II, "f"',
    label: 'Dados sensíveis — saúde',
    types: Object.freeze(['SAUDE']),
  }),
  Object.freeze({
    key: 'religiao',
    article: 'Art. 5º, II, "b"',
    label: 'Dados sensíveis — convicção religiosa',
    types: Object.freeze(['RELIGIAO']),
  }),
  Object.freeze({
    key: 'origem',
    article: 'Art. 5º, II, "a"',
    label: 'Dados sensíveis — origem racial ou étnica',
    types: Object.freeze(['ORIGEM']),
  }),
  Object.freeze({
    key: 'pj',
    article: '—',
    label: 'Dado de pessoa jurídica (fora do conceito de dado pessoal do Art. 5º, I)',
    types: Object.freeze(['CNPJ']),
  }),
]);

/** Fixed per-rule confidence (rule-matched, not model-scored). */
export const RULE_CONFIDENCE = Object.freeze({
  'email-format': 0.99,
  'cpf-checksum': 0.99,
  'cpf-format': 0.6,
  'cnpj-checksum': 0.99,
  'cnpj-format': 0.6,
  'rg-format': 0.9,
  'phone-br': 0.95,
  'address-street-gazetteer': 0.85,
  'name-honorific': 0.85,
  'name-gazetteer': 0.8,
  'date-pattern+birth-context': 0.9,
  'date-pattern': 0.85,
  'sensitive-saude-gazetteer': 0.9,
  'sensitive-religiao-gazetteer': 0.9,
  'sensitive-origem-gazetteer': 0.9,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape a literal string for use inside a RegExp. @param {string} s @returns {string} */
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Unicode word-bounded, case-insensitive regex for a literal phrase list.
 * Entries must be pre-sorted longest-first so longer phrases win.
 * @param {string[]} phrases
 * @returns {RegExp} global regex
 */
function phraseRegex(phrases) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${phrases.map(reEsc).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

/**
 * CPF check-digit validation (official algorithm; all-equal digits rejected).
 * @param {string} digits exactly 11 digit characters
 * @returns {boolean}
 */
export function cpfIsValid(digits) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const d = digits.split('').map(Number);
  const calc = (len, wStart) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * (wStart - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9, 10) === d[9] && calc(10, 11) === d[10];
}

/**
 * CNPJ check-digit validation (official algorithm; all-equal digits rejected).
 * @param {string} digits exactly 14 digit characters
 * @returns {boolean}
 */
export function cnpjIsValid(digits) {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const d = digits.split('').map(Number);
  const calc = (len, weights) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return calc(12, w1) === d[12] && calc(13, w2) === d[13];
}

/**
 * Overlap resolution: sort by start (then longest span, then highest
 * confidence) and drop any span that overlaps a kept span. Policy: the
 * earlier/longer span wins — e.g. an address span keeps a person name
 * nested inside it from double-counting.
 *
 * @param {{type: string, value: string, start: number, end: number,
 *          rule: string, confidence: number, note?: string}[]} entities
 * @returns {Array<object>} non-overlapping entities sorted by start
 */
export function mergeSpans(entities) {
  const sorted = [...entities].sort((a, b) =>
    a.start - b.start || (b.end - b.start) - (a.end - a.start) || b.confidence - a.confidence);
  const kept = [];
  for (const e of sorted) {
    const last = kept[kept.length - 1];
    if (last && e.start < last.end) continue; // overlaps the kept span → dropped
    kept.push(e);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Rules (each pushes candidate entities with char offsets)
// ---------------------------------------------------------------------------

/** @param {object[]} out @param {string} text @param {string} type @param {number} start @param {number} end @param {string} rule @param {string} [note] */
function push(out, text, type, start, end, rule, note) {
  const e = { type, value: text.slice(start, end), start, end, rule, confidence: RULE_CONFIDENCE[rule] };
  if (note) e.note = note;
  out.push(e);
}

/** @param {object[]} out @param {string} text */
function pushEmail(out, text) {
  for (const m of text.matchAll(/(?<![\p{L}\p{N}.@+-])[^\s@<>()\[\]{},;:"']+@[^\s@<>()\[\]{},;:"']+\.[A-Za-z]{2,}(?![\p{L}\p{N}])/gu)) {
    push(out, text, 'EMAIL', m.index, m.index + m[0].length, 'email-format');
  }
}

/** @param {object[]} out @param {string} text */
function pushCpf(out, text) {
  for (const m of text.matchAll(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g)) {
    const digits = m[0].replace(/\D/g, '');
    const ok = cpfIsValid(digits);
    push(out, text, 'CPF', m.index, m.index + m[0].length, ok ? 'cpf-checksum' : 'cpf-format',
      ok ? undefined : 'dígito verificador inválido (formato de CPF, mas checksum não bate)');
  }
}

/** @param {object[]} out @param {string} text */
function pushCnpj(out, text) {
  for (const m of text.matchAll(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|\b\d{14}\b/g)) {
    const digits = m[0].replace(/\D/g, '');
    const ok = cnpjIsValid(digits);
    push(out, text, 'CNPJ', m.index, m.index + m[0].length, ok ? 'cnpj-checksum' : 'cnpj-format',
      ok ? undefined : 'dígito verificador inválido (formato de CNPJ, mas checksum não bate)');
  }
}

/** @param {object[]} out @param {string} text */
function pushRg(out, text) {
  const re = /\b(?:[A-Z]{2}-)?\d{2}\.\d{3}\.\d{3}(?:-(?:\d|X|x))?\b/g;
  for (const m of text.matchAll(re)) push(out, text, 'RG', m.index, m.index + m[0].length, 'rg-format');
}

/** @param {object[]} out @param {string} text */
function pushPhone(out, text) {
  const re = /(?<![\d-])(?:\+55[ ]?)?\(?\d{2}\)?[ ]?(?:9\d{4}|\d{4})-\d{4}(?![\d-])/g;
  for (const m of text.matchAll(re)) push(out, text, 'TELEFONE', m.index, m.index + m[0].length, 'phone-br');
}

/**
 * Dates (dd/mm/yyyy and long form "14 de março de 1985"). A date within 40
 * chars after a "nasc" mention (nascida/nascido/nascimento) is promoted to
 * DATA_DE_NASCIMENTO.
 * @param {object[]} out @param {string} text
 */
function pushDates(out, text) {
  const numeric = /(?<![\d-])(\d{2})([/\-.])(\d{2})\2(\d{4})(?![\d-])/g;
  const longForm = new RegExp(`(?<![\\p{L}\\p{N}])(\\d{1,2}) de (${MONTHS.join('|')}) de (\\d{4})(?![\\p{L}\\p{N}])`, 'giu');
  for (const re of [numeric, longForm]) {
    for (const m of text.matchAll(re)) {
      const start = m.index, end = m.index + m[0].length;
      const context = text.slice(Math.max(0, start - 40), start);
      if (/nasc/i.test(context)) push(out, text, 'DATA_DE_NASCIMENTO', start, end, 'date-pattern+birth-context');
      else push(out, text, 'DATA', start, end, 'date-pattern');
    }
  }
}

/** @param {object[]} out @param {string} text */
function pushAddress(out, text) {
  const re = new RegExp(
    `\\b(?:${STREET_TYPES.join('|')})\\s+[A-ZÀ-Ü][\\p{L}\\p{M}'’.-]*(?:\\s+[A-ZÀ-Ü][\\p{L}\\p{M}'’.-]*){0,2}` +
    `(?:,?\\s*(?:nº\\s*)?\\d+[A-Za-z]?)?(?:,\\s*(?:apto|ap|bloco|sala|conj)\\.?\\s*\\d+)?`, 'gu');
  for (const m of text.matchAll(re)) push(out, text, 'ENDERECO', m.index, m.index + m[0].length, 'address-street-gazetteer');
}

/** @param {object[]} out @param {string} text */
function pushNamesHonorific(out, text) {
  const re = /\b(?:Sr|Sra|Dr|Dra|Senhor|Senhora)\.?\s+([A-ZÀ-Ü][\p{L}\p{M}'’-]*(?:\s+[A-ZÀ-Ü][\p{L}\p{M}'’-]*){0,2})/gu;
  for (const m of text.matchAll(re)) {
    // span = the name only (after the honorific)
    const start = m.index + m[0].indexOf(m[1]);
    push(out, text, 'NOME_COMPLETO', start, start + m[1].length, 'name-honorific');
  }
}

/** @param {object[]} out @param {string} text */
function pushNamesGazetteer(out, text) {
  const first = FIRST_NAMES.map(reEsc).join('|');
  const sur = SURNAMES.map(reEsc).join('|');
  const re = new RegExp(`\\b(?:${first})\\s+(?:(?:de|da|do|das|dos)\\s+)?(?:${sur})(?:\\s+(?:${sur}))?`, 'g');
  for (const m of text.matchAll(re)) push(out, text, 'NOME_COMPLETO', m.index, m.index + m[0].length, 'name-gazetteer');
}

/** @param {object[]} out @param {string} text @param {string[]} phrases @param {string} type @param {string} rule */
function pushSensitive(out, text, phrases, type, rule) {
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  for (const m of text.matchAll(phraseRegex(sorted))) push(out, text, type, m.index, m.index + m[0].length, rule);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect PII in pt-BR text. Deterministic: same input, same output. Every
 * entity carries the rule that fired and a FIXED per-rule confidence —
 * matches are rule-matched, not model-scored.
 *
 * @param {string} text
 * @returns {{type: string, value: string, start: number, end: number,
 *           rule: string, confidence: number, note?: string}[]}
 *   non-overlapping entities sorted by char offset
 * @throws {TypeError} if text is not a string
 */
export function detectPii(text) {
  if (typeof text !== 'string') throw new TypeError('detectPii: expected a string');
  const found = [];
  pushEmail(found, text);
  pushCpf(found, text);
  pushCnpj(found, text);
  pushRg(found, text);
  pushPhone(found, text);
  pushDates(found, text);
  pushAddress(found, text);
  pushNamesHonorific(found, text);
  pushNamesGazetteer(found, text);
  pushSensitive(found, text, HEALTH_PHRASES, 'SAUDE', 'sensitive-saude-gazetteer');
  pushSensitive(found, text, RELIGION_PHRASES, 'RELIGIAO', 'sensitive-religiao-gazetteer');
  pushSensitive(found, text, ORIGIN_PHRASES, 'ORIGEM', 'sensitive-origem-gazetteer');
  return mergeSpans(found);
}

/**
 * Map detected entity types onto LGPD Art. 5º categories. Only categories
 * with at least one matching entity are returned.
 *
 * @param {{type: string}[]} entities entities (e.g. from detectPii)
 * @returns {{key: string, article: string, label: string, types: string[], count: number}[]}
 */
export function lgpdCategories(entities) {
  const counts = Object.create(null);
  for (const e of entities ?? []) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return LGPD_GROUPS
    .map((g) => {
      const types = g.types.filter((t) => counts[t] > 0);
      return { key: g.key, article: g.article, label: g.label, types, count: types.reduce((s, t) => s + counts[t], 0) };
    })
    .filter((g) => g.count > 0);
}

/**
 * Redaction preview: replace each entity span with `[TYPE]` (e.g. `[CPF]`).
 * Spans are merge-resolved first, then replaced right-to-left so offsets stay valid.
 *
 * @param {string} text
 * @param {{type: string, start: number, end: number}[]} entities
 * @returns {string}
 * @throws {TypeError} if text is not a string
 */
export function redactPreview(text, entities) {
  if (typeof text !== 'string') throw new TypeError('redactPreview: expected a string');
  const spans = mergeSpans(Array.isArray(entities) ? entities : [])
    .sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of spans) out = out.slice(0, e.start) + `[${e.type}]` + out.slice(e.end);
  return out;
}
