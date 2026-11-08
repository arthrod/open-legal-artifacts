import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runCiteCheck, renderReport } from './citecheck';
import type { CiteCheckInput } from './citecheck';

const here = dirname(fileURLToPath(import.meta.url));

/** Load core.js through a data: URL so tsx cannot resolve it to the .ts sources. */
async function loadJsCore(): Promise<typeof import('./core.js')> {
  const src = readFileSync(join(here, 'core.js'), 'utf8');
  return (await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src))) as never;
}

test('core.js hand-port produces identical output to the TS core (shared example fixture)', async () => {
  const js = await loadJsCore();
  const input: CiteCheckInput = JSON.parse(readFileSync(join(here, '../examples/input.json'), 'utf8'));
  const tsReport = runCiteCheck(input);
  const jsReport = js.runCiteCheck(input);
  assert.deepEqual(jsReport, tsReport);
  assert.equal(js.renderReport(jsReport), renderReport(tsReport));
});

test('core.js hand-port mirrors the engine on guard/omission/diff paths', async () => {
  const js = await loadJsCore();
  const input: CiteCheckInput = {
    document: { name: 'Parity fixture (fictional)' },
    sources: [
      {
        id: 's',
        name: 'Source (fictional)',
        pages: [
          { number: 3, text: 'A. The manifest listed 34,800 kilograms of freight on the outbound leg, and the reweigh at the Millbrook terminal showed only 34,460 kilograms, a shortfall the intake team documented in the overflow log and reported to the dispatch office that same afternoon before the shift ended.' },
        ],
      },
    ],
    quotes: [
      { id: 'P1', text: 'The manifest listed 34,900 kilograms of freight on the outbound leg, and the reweigh at the Millbrook terminal showed only 34,460 kilograms, a shortfall the intake team documented in the overflow log and reported to the dispatch office that same afternoon before the shift ended.', sourceId: 's', pinpoint: 'Tr. 3:1' },
      { id: 'P2', text: 'The manifest listed 34,800 kilograms of freight … reported to the dispatch office that same afternoon.', sourceId: 's' },
    ],
  };
  const negationFixture: CiteCheckInput = {
    document: { name: 'Parity fixture (fictional)' },
    sources: [
      {
        id: 'n',
        name: 'Negation source (fictional)',
        pages: [
          { number: 2, text: 'The intake team documented the shortfall and reported it to the dispatch office that same afternoon before the shift ended.' },
          { number: 4, text: 'the dispatcher confirmed the reweigh at the millbrook terminal.' },
          { number: 7, text: 'The dispatcher confirmed the reweigh at the Millbrook terminal.' },
        ],
      },
    ],
    quotes: [
      { id: 'P3', text: 'The intake team documented the shortfall and never reported it to the dispatch office that same afternoon before the shift ended.', sourceId: 'n', pinpoint: 'p. 2' },
      { id: 'P4', text: 'The dispatcher confirmed the reweigh at the Millbrook terminal.', sourceId: 'n', pinpoint: 'p. 7' },
    ],
  };
  assert.deepEqual(js.runCiteCheck(input), runCiteCheck(input));
  assert.deepEqual(js.runCiteCheck(negationFixture), runCiteCheck(negationFixture));
});
