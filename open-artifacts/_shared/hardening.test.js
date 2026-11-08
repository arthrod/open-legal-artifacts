// hardening.test.js — adversarial suite for safeExternalUrl + csvSafeEscape.
// All data fictional. Run: node --test hardening.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeExternalUrl, csvSafeEscape } from './hardening.js';

// ------------------------------------------------------ safeExternalUrl

test('safeExternalUrl accepts plain http/https and normalizes', () => {
  assert.equal(safeExternalUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeExternalUrl('HTTP://EXAMPLE.com/Path'), 'http://example.com/Path');
  assert.equal(safeExternalUrl('http://example.com'), 'http://example.com/');
});

test('safeExternalUrl rejects dangerous schemes', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
    'mailto:someone@example.org',
    'about:blank',
    'blob:https://example.com/xyz',
  ]) {
    assert.equal(safeExternalUrl(bad), null, `expected null for ${bad}`);
  }
});

test('safeExternalUrl defeats scheme-smuggling with control chars/whitespace', () => {
  // Browsers strip TAB/CR/LF inside URLs before parsing; the guard must too.
  assert.equal(safeExternalUrl('java\tscript:alert(1)'), null);
  assert.equal(safeExternalUrl('java\nscript:alert(1)'), null);
  assert.equal(safeExternalUrl('  javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('javascript\t:alert(1)'), null);
});

test('safeExternalUrl rejects relative and protocol-relative URLs', () => {
  assert.equal(safeExternalUrl('/local/path'), null);
  assert.equal(safeExternalUrl('//evil.example.com/x'), null);
  assert.equal(safeExternalUrl('just text'), null);
});

test('safeExternalUrl rejects empty/null/non-string input', () => {
  assert.equal(safeExternalUrl(''), null);
  assert.equal(safeExternalUrl(null), null);
  assert.equal(safeExternalUrl(undefined), null);
  assert.equal(safeExternalUrl(12345), null);
});

// ------------------------------------------------------ csvSafeEscape

test('csvSafeEscape passes plain values through unchanged', () => {
  assert.equal(csvSafeEscape('hello'), 'hello');
  assert.equal(csvSafeEscape('Northwind Logistics'), 'Northwind Logistics');
  assert.equal(csvSafeEscape(''), ''); // empty stays empty, no guard needed
});

test('csvSafeEscape quotes per RFC4180 (comma, quote, newline) and doubles quotes', () => {
  assert.equal(csvSafeEscape('a,b'), '"a,b"');
  assert.equal(csvSafeEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvSafeEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(csvSafeEscape('line1\r\nline2'), '"line1\r\nline2"');
});

test('csvSafeEscape prefixes formula-injection leaders', () => {
  assert.equal(csvSafeEscape('=cmd|/C calc'), "'=cmd|/C calc");
  assert.equal(csvSafeEscape('+SUM(A1:A2)'), "'+SUM(A1:A2)");
  assert.equal(csvSafeEscape('-2+1'), "'-2+1");
  assert.equal(csvSafeEscape('@import(x)'), "'@import(x)");
  assert.equal(csvSafeEscape('\tabc'), "'\tabc");
  // CR leader: guard prefix, then RFC4180 quoting because the cell contains CR
  assert.equal(csvSafeEscape('\rabc'), '"\'\rabc"');
});

test('csvSafeEscape guards before quoting: injected cell with commas is quoted with guard inside', () => {
  assert.equal(csvSafeEscape('=HYPERLINK("http://x","a,b")'), '"\'=HYPERLINK(""http://x"",""a,b"")"');
});

test('csvSafeEscape does not double-guard an already-prefixed value', () => {
  assert.equal(csvSafeEscape("'=already guarded"), "'=already guarded");
});

test('csvSafeEscape handles null/undefined/numbers deterministically', () => {
  assert.equal(csvSafeEscape(null), '');
  assert.equal(csvSafeEscape(undefined), '');
  assert.equal(csvSafeEscape(42), '42');
  assert.equal(csvSafeEscape(-7), "'-7"); // negative numbers are guarded too
});
