/** Tests for pii-ptbr-lgpd core. Run: node --test "core/*.test.js" */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPii, lgpdCategories, redactPreview, mergeSpans,
  cpfIsValid, cnpjIsValid,
} from './core.js';

const types = (text) => detectPii(text).map((e) => e.type);
const find = (text, type) => detectPii(text).filter((e) => e.type === type);

describe('identifiers — patterns', () => {
  test('checksum-VALID CPF (dotted) is detected as CPF with cpf-checksum rule', () => {
    const es = find('Cliente inscrita no CPF 529.982.247-25, conforme documento.', 'CPF');
    assert.equal(es.length, 1);
    assert.equal(es[0].value, '529.982.247-25');
    assert.equal(es[0].rule, 'cpf-checksum');
    assert.equal(es[0].confidence, 0.99);
    assert.equal(es[0].note, undefined);
  });

  test('checksum-INVALID CPF is still flagged, with a note and lower confidence', () => {
    const es = find('CPF 529.982.247-24 não bate com o documento.', 'CPF');
    assert.equal(es.length, 1);
    assert.equal(es[0].rule, 'cpf-format');
    assert.equal(es[0].confidence, 0.6);
    assert.match(es[0].note, /dígito verificador inválido/);
  });

  test('bare 11-digit valid CPF is detected (no separators)', () => {
    assert.equal(cpfIsValid('52998224725'), true);
    const es = find('o numero 52998224725 aparece no cadastro', 'CPF');
    assert.equal(es.length, 1);
    assert.equal(es[0].value, '52998224725');
  });

  test('checksum-VALID CNPJ detected; invalid one flagged with note', () => {
    const ok = find('Construtora Vale Verde Ltda. (CNPJ 45.723.174/0001-10).', 'CNPJ');
    assert.equal(ok.length, 1);
    assert.equal(ok[0].rule, 'cnpj-checksum');
    const bad = find('CNPJ 45.723.174/0001-11 inválido.', 'CNPJ');
    assert.equal(bad.length, 1);
    assert.equal(bad[0].rule, 'cnpj-format');
    assert.match(bad[0].note, /dígito verificador inválido/);
  });

  test('RG detected in dotted and state-prefixed formats', () => {
    assert.equal(find('RG 31.582.904-7 averbado.', 'RG')[0].value, '31.582.904-7');
    assert.equal(find('RG MG-12.345.678 averbado.', 'RG')[0].value, 'MG-12.345.678');
  });

  test('BR phone variants: (11) 98765-4321 and +55 11 3456-7890', () => {
    assert.equal(find('ligar para (11) 98765-4321 hoje.', 'TELEFONE')[0].value, '(11) 98765-4321');
    assert.equal(find('ou +55 11 3456-7890.', 'TELEFONE')[0].value, '+55 11 3456-7890');
  });

  test('email detected', () => {
    const es = find('Escreva para fernanda.ribeiro@example.com.', 'EMAIL');
    assert.equal(es.length, 1);
    assert.equal(es[0].value, 'fernanda.ribeiro@example.com');
  });

  test('BR address: street type + name + number (+ apto)', () => {
    const es = find('mora na Rua Harmonia 772, apto 42 desde 2019.', 'ENDERECO');
    assert.equal(es.length, 1);
    assert.equal(es[0].value, 'Rua Harmonia 772, apto 42');
    assert.equal(es[0].rule, 'address-street-gazetteer');
  });

  test('full name via honorific; gazetteer duplicate is merged away (1 entity)', () => {
    // "Sra. Fernanda Costa Ribeiro" fires both name-honorific and name-gazetteer
    const es = find('paciente Sra. Fernanda Costa Ribeiro compareceu.', 'NOME_COMPLETO');
    assert.equal(es.length, 1);
    assert.equal(es[0].value, 'Fernanda Costa Ribeiro');
  });

  test('gazetteer-only full name detected without honorific', () => {
    const es = find('compareceu Rafael Moraes Santana ontem.', 'NOME_COMPLETO');
    assert.equal(es.length, 1);
    assert.equal(es[0].value, 'Rafael Moraes Santana');
  });

  test('date near "nasc" becomes DATA_DE_NASCIMENTO; plain date stays DATA; long form works', () => {
    assert.deepEqual(types('nascida em 14/03/1985 em Sorocaba'), ['DATA_DE_NASCIMENTO']);
    assert.deepEqual(types('reunião em 14/03/1985.'), ['DATA']);
    assert.deepEqual(types('nascido em 14 de março de 1985.'), ['DATA_DE_NASCIMENTO']);
  });
});

describe('LGPD sensitive categories (Art. 5º, II)', () => {
  test('saúde / religião / origem mentions map to their entity types', () => {
    assert.equal(types('portadora de diabetes tipo 2')[0], 'SAUDE');
    assert.equal(types('é espírita praticante.')[0], 'RELIGIAO');
    assert.equal(types('neta de imigrantes japoneses.')[0], 'ORIGEM');
  });

  test('longest phrase wins: "diabetes tipo 2", not bare "diabetes"', () => {
    assert.equal(find('portadora de diabetes tipo 2 grave.', 'SAUDE')[0].value, 'diabetes tipo 2');
  });
});

describe('overlap merging', () => {
  test('mergeSpans keeps the longer span and drops the nested one', () => {
    const merged = mergeSpans([
      { type: 'NOME_COMPLETO', value: 'x', start: 5, end: 18, rule: 'name-gazetteer', confidence: 0.8 },
      { type: 'ENDERECO', value: 'x', start: 0, end: 30, rule: 'address-street-gazetteer', confidence: 0.85 },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].type, 'ENDERECO');
  });

  test('integration: address swallows a nested gazetteer name', () => {
    const es = detectPii('Entrega na Rua Fernanda Costa 123 hoje.');
    assert.equal(es.filter((e) => e.type === 'ENDERECO').length, 1);
    assert.equal(es.filter((e) => e.type === 'NOME_COMPLETO').length, 0);
  });

  test('adjacent (non-overlapping) spans are both kept', () => {
    const merged = mergeSpans([
      { type: 'CPF', value: 'x', start: 0, end: 14, rule: 'cpf-checksum', confidence: 0.99 },
      { type: 'EMAIL', value: 'x', start: 14, end: 30, rule: 'email-format', confidence: 0.99 },
    ]);
    assert.equal(merged.length, 2);
  });
});

describe('zero false positives on clean pt-BR text', () => {
  test('no PII in administrative sentences', () => {
    assert.equal(detectPii('Segue o relatório para revisão até sexta, obrigado pela atenção.').length, 0);
    assert.equal(detectPii('O relatório anual de 2024 foi revisado em outubro, sem qualquer dado pessoal.').length, 0);
    assert.equal(detectPii('A ata da reunião de diretoria ficou pronta para assinatura.').length, 0);
  });
});

describe('outputs: offsets, redaction, LGPD summary', () => {
  test('entity offsets always slice back to the entity value', () => {
    const text = 'CPF 529.982.247-25 e email fernanda.ribeiro@example.com no cadastro.';
    for (const e of detectPii(text)) assert.equal(text.slice(e.start, e.end), e.value);
  });

  test('entities are sorted by start offset and non-overlapping', () => {
    const es = detectPii('CPF 529.982.247-25, RG 31.582.904-7 e (11) 98765-4321 no cadastro.');
    for (let i = 1; i < es.length; i++) {
      assert.ok(es[i - 1].start < es[i].start);
      assert.ok(es[i - 1].end <= es[i].start);
    }
  });

  test('redactPreview replaces spans with [TIPO] and keeps the rest', () => {
    const text = 'CPF 529.982.247-25 e email fernanda.ribeiro@example.com.';
    const out = redactPreview(text, detectPii(text));
    assert.equal(out, 'CPF [CPF] e email [EMAIL].');
  });

  test('lgpdCategories lists sensitive groups that appear, omits those that do not', () => {
    const cats = lgpdCategories(detectPii(
      'Sra. Fernanda Costa Ribeiro, CPF 529.982.247-25, portadora de diabetes tipo 2, é espírita e neta de imigrantes japoneses.'
    ));
    const keys = cats.map((c) => c.key);
    assert.ok(keys.includes('identificadores'));
    assert.ok(keys.includes('saude'));
    assert.ok(keys.includes('religiao'));
    assert.ok(keys.includes('origem'));
    assert.ok(!keys.includes('pj'));
    const saude = cats.find((c) => c.key === 'saude');
    assert.equal(saude.article, 'Art. 5º, II, "e"');
  });

  test('lgpdCategories: CNPJ-only text gets the pessoa-jurídica note, no sensitive groups', () => {
    const cats = lgpdCategories(detectPii('CNPJ 45.723.174/0001-10 da empresa.'));
    assert.deepEqual(cats.map((c) => c.key), ['pj']);
  });

  test('non-string input throws TypeError', () => {
    assert.throws(() => detectPii(42), TypeError);
    assert.throws(() => redactPreview(null, []), TypeError);
  });
});
