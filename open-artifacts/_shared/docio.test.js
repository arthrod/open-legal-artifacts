// docio.test.js — node:test suite for _shared/docio.js.
// Round-trips use the real writers (writeDocx/readDocx, writeXlsx/readXlsx).
// Crafted archives (craftZip below) pin DEFLATE reading, sharedStrings, tabs/br,
// and the 'unsupported compression' error. Fictional data; [verify] tags.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readDocx, readXlsx, writeDocx, writeXlsx, redlineMarkdown } from './docio.js';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// --- test-only zip builder (supports arbitrary methods, unlike the writer) ---
function crc32(u8) {
  let c = -1;
  for (let i = 0; i < u8.length; i++) {
    c ^= u8[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? -306674912 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function craftZip(files, method) {
  const enc = new TextEncoder();
  const parts = [], cd = [];
  let off = 0;
  for (const [name, content] of files) {
    const raw = typeof content === 'string' ? enc.encode(content) : content;
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nb = enc.encode(name), crc = crc32(raw), lho = off;
    const lh = new Uint8Array(30), v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(8, method, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, raw.length, true);
    v.setUint16(26, nb.length, true);
    parts.push(lh, nb, data);
    off += 30 + nb.length + data.length;
    const c = new Uint8Array(46), u = new DataView(c.buffer);
    u.setUint32(0, 0x02014b50, true);
    u.setUint16(10, method, true);
    u.setUint32(16, crc, true);
    u.setUint32(20, data.length, true);
    u.setUint32(24, raw.length, true);
    u.setUint16(28, nb.length, true);
    u.setUint32(42, lho, true);
    cd.push(c, nb);
  }
  const cdSize = cd.reduce((n, p) => n + p.length, 0);
  const eocd = new Uint8Array(22), e = new DataView(eocd.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, off, true);
  const all = [...parts, ...cd, eocd];
  const out = new Uint8Array(off + cdSize + 22);
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

function docXml(body) {
  return XML + '<w:document xmlns:w="' + W_NS + '"><w:body>' + body + '</w:body></w:document>';
}

test('docx round-trip: paragraphs, text join, entities, unicode; Buffer output', async () => {
  const paras = ['Hello world', 'Second — with <tag> & "quotes" and \'apostrophes\'', ''];
  const bytes = writeDocx(paras);
  assert.ok(Buffer.isBuffer(bytes), 'node output must be a Buffer');
  const { text, paragraphs } = await readDocx(bytes);
  assert.deepEqual(paragraphs, paras);
  assert.equal(text, paras.join('\n'));
});

test('writeDocx accepts {text} objects and is byte-deterministic', async () => {
  const a = writeDocx([{ text: 'Obj para' }, 'plain']);
  const b = writeDocx([{ text: 'Obj para' }, 'plain']);
  assert.deepEqual(a, b);
  const { paragraphs } = await readDocx(a);
  assert.deepEqual(paragraphs, ['Obj para', 'plain']);
});

test('readDocx reads DEFLATE-compressed entries', async () => {
  const zip = craftZip([
    ['[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['word/document.xml', docXml('<w:p><w:r><w:t>Deflate read</w:t></w:r></w:p>')],
  ], 8);
  const { text, paragraphs } = await readDocx(zip);
  assert.deepEqual(paragraphs, ['Deflate read']);
  assert.equal(text, 'Deflate read');
});

test('docx parser: tabs, breaks, self-closing empty paragraph, namespace-agnostic', async () => {
  const zip = craftZip([['word/document.xml', XML +
    '<w:document xmlns:w="' + W_NS + '"><w:body>' +
    '<w:p><w:r><w:t>a</w:t><w:tab/><w:br/><w:t xml:space="preserve">b</w:t></w:r></w:p>' +
    '<w:p/>' +
    '<w:p><w:r><w:t>coffee &amp; &#116;ea &#x2665;</w:t></w:r></w:p>' +
    '</w:body></w:document>']], 0);
  const { paragraphs } = await readDocx(zip);
  assert.deepEqual(paragraphs, ['a\t\nb', '', 'coffee & tea ♥']);
});

test('unsupported compression method throws named error', async () => {
  const zip = craftZip([['word/document.xml', docXml('<w:p/>')]], 12);
  await assert.rejects(readDocx(zip), (err) =>
    err.name === 'UnsupportedCompression' && /unsupported compression/.test(err.message));
});

test('non-zip input rejects with clear message', async () => {
  await assert.rejects(readDocx(new TextEncoder().encode('not a zip').buffer), /not a zip/);
  await assert.rejects(readXlsx(new Uint8Array([1, 2, 3])), /not a zip/);
});

test('xlsx round-trip: inline strings, numbers, holes, sheet name', async () => {
  const rows = [['Item', 'Qty', 'Note'], ['Widget', 3, null], [null, 2.5, 'ships &amp; handles']];
  const bytes = writeXlsx(rows, { name: 'Inventory' });
  assert.ok(Buffer.isBuffer(bytes));
  const { sheets } = await readXlsx(bytes);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, 'Inventory');
  assert.deepEqual(sheets[0].rows, [
    ['Item', 'Qty', 'Note'],
    ['Widget', '3', ''],
    ['', '2.5', 'ships &amp; handles'],
  ]);
});

test('xlsx reader: sharedStrings, rich runs, booleans, empty cells, row/col gaps', async () => {
  const SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const zip = craftZip([
    ['xl/workbook.xml', XML + '<workbook xmlns="' + SS + '" xmlns:r="' + REL + '">' +
      '<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + REL + '/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', XML + '<sst xmlns="' + SS + '" count="4" uniqueCount="4">' +
      '<si><t>Alpha</t></si>' +
      '<si><t>unused</t></si>' +
      '<si><r><t xml:space="preserve">Beta </t></r><r><t>&amp; Co</t></r></si>' +
      '<si><t xml:space="preserve"> lead</t></si>' +
      '</sst>'],
    ['xl/worksheets/sheet1.xml', XML + '<worksheet xmlns="' + SS + '"><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c>' +
      '<c r="C1" t="s"><v>3</v></c><c r="D1"><v>2.5</v></c></row>' +
      '<row r="3"><c r="A3" t="b"><v>1</v></c><c r="C3"/></row>' +
      '</sheetData></worksheet>'],
  ], 0);
  const { sheets } = await readXlsx(zip);
  assert.equal(sheets[0].name, 'Data');
  assert.deepEqual(sheets[0].rows, [
    ['Alpha', 'Beta & Co', ' lead', '2.5'],
    [],
    ['TRUE', '', ''],
  ]);
});

test('readXlsx decodes XML entities in the sheet name', async () => {
  const SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const zip = craftZip([
    ['xl/workbook.xml', XML + '<workbook xmlns="' + SS + '" xmlns:r="' + REL + '">' +
      '<sheets><sheet name="R&amp;D &#x2665; Q1" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + REL + '/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', XML + '<worksheet xmlns="' + SS + '"><sheetData/></worksheet>'],
  ], 0);
  const { sheets } = await readXlsx(zip);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, 'R&D ♥ Q1');
});

test('writeXlsx sanitizes sheet name: Excel-forbidden chars, 31-char cap, round-trip', async () => {
  const hostile = 'a:b\\c/d?e*f[g]h' + 'x'.repeat(40); // 54 chars, 8 forbidden
  const { sheets } = await readXlsx(writeXlsx([['k']], { name: hostile }));
  const name = sheets[0].name;
  assert.ok(name.length <= 31, 'sheet name must be ≤31 chars');
  assert.ok(!/[:\\/?*[\]]/.test(name), 'forbidden chars must be replaced');
  assert.equal(name, 'a_b_c_d_e_f_g_h' + 'x'.repeat(16)); // 15 + 16 = 31
  const round = await readXlsx(writeXlsx([['k']], { name: 'Tom & Jerry <Q&A>' }));
  assert.equal(round.sheets[0].name, 'Tom & Jerry <Q&A>');
});

// Craft a zip whose central directory claims more data than the archive holds.
function patchedCdEntry(zip, fieldOff, value) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const cdOff = dv.getUint32(zip.length - 22 + 16, true); // EOCD → cd start
  dv.setUint32(cdOff + fieldOff, value, true);
  return zip;
}

test('truncated zip entry (csize past end of archive) throws a clear error', async () => {
  const zip = craftZip([['word/document.xml', docXml('<w:p/>')]], 0);
  await assert.rejects(
    () => readDocx(patchedCdEntry(zip, 20, zip.length + 64)), // csize inflated
    (err) => err instanceof Error && !err.name.startsWith('Range') && /truncated zip/.test(err.message),
  );
});

test('zip64 markers reject with a clear error, not a RangeError', async () => {
  const csizeZip = patchedCdEntry(craftZip([['word/document.xml', docXml('<w:p/>')]], 0), 20, 0xFFFFFFFF);
  await assert.rejects(readDocx(csizeZip),
    (err) => err instanceof Error && !(err instanceof RangeError) && /zip64 unsupported/.test(err.message));
  const lhoZip = patchedCdEntry(craftZip([['word/document.xml', docXml('<w:p/>')]], 0), 42, 0xFFFFFFFF);
  await assert.rejects(readDocx(lhoZip),
    (err) => err instanceof Error && !(err instanceof RangeError) && /zip64 unsupported/.test(err.message));
});

test('hostile numeric entities (lone surrogate, out-of-range) never crash the reader', async () => {
  const zip = craftZip([['word/document.xml',
    docXml('<w:p><w:r><w:t>a&#xD800;b &#x110000;c</w:t></w:r></w:p>')]], 0);
  const { text } = await readDocx(zip);
  assert.equal(text.charCodeAt(1), 0xD800); // lone surrogate: fromCodePoint permits it
  assert.ok(text.includes('b &#x110000;c')); // out-of-range ref kept literally, no throw
});

test('xlsx round-trip of an empty workbook', async () => {
  const { sheets } = await readXlsx(writeXlsx([]));
  assert.deepEqual(sheets, [{ name: 'Sheet1', rows: [] }]);
});

test('redlineMarkdown renders diff fences with +/-/context markers', () => {
  const md = redlineMarkdown([
    { op: 'ctx', text: 'The parties agree as follows:' },
    { op: 'del', text: 'old clause 1' },
    { op: 'ins', text: 'new clause 1' },
  ]);
  assert.equal(md, '```diff\n  The parties agree as follows:\n- old clause 1\n+ new clause 1\n```\n');
});

test('redlineMarkdown escalates the fence when text contains ```', () => {
  const md = redlineMarkdown([{ op: 'ins', text: 'see ```code``` inside' }]);
  assert.equal(md, '````diff\n+ see ```code``` inside\n````\n');
});
