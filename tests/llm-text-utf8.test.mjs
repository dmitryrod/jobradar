import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stripLoneUtf16Surrogates,
  hasUnicodeReplacementChar,
} from '../lib/llm-text-utf8.mjs';
import { assistantMessageContentToString } from '../lib/llm-chat.mjs';

test('stripLoneUtf16Surrogates keeps BMP Cyrillic', () => {
  assert.equal(stripLoneUtf16Surrogates('все вакансии'), 'все вакансии');
});

test('stripLoneUtf16Surrogates removes lone high surrogate', () => {
  const bad = `a\u{d800}b`;
  assert.equal(stripLoneUtf16Surrogates(bad), 'ab');
});

test('stripLoneUtf16Surrogates keeps valid surrogate pair', () => {
  const s = '\uD83D\uDE00';
  assert.equal(stripLoneUtf16Surrogates(s), s);
});

test('hasUnicodeReplacementChar', () => {
  assert.equal(hasUnicodeReplacementChar('ok'), false);
  assert.equal(hasUnicodeReplacementChar('a\uFFFDb'), true);
});

test('assistantMessageContentToString: string and array blocks', () => {
  assert.equal(assistantMessageContentToString('plain'), 'plain');
  assert.equal(
    assistantMessageContentToString([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ]),
    'a\nb'
  );
  assert.equal(assistantMessageContentToString([{ content: 'x' }]), 'x');
});
