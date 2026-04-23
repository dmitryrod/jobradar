import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEnvForLog } from '../lib/harvest-debug.mjs';

test('sanitizeEnvForLog маскирует ключи API', () => {
  const o = sanitizeEnvForLog({
    HH_KEYWORDS_LOGIC: 'cycles',
    POLZA_API_KEY: 'secret123',
    OpenRouter_API_KEY: 'sk-or',
    OPENROUTER_API_KEY: 'sk2',
    GEMINI_API_KEY: 'g',
    HH_SESSION_LIMIT: '7',
    SOME_SECRET_TOKEN: 'x',
  });
  assert.equal(o.HH_KEYWORDS_LOGIC, 'cycles');
  assert.equal(o.HH_SESSION_LIMIT, '7');
  assert.equal(o.POLZA_API_KEY, '[redacted]');
  assert.equal(o.OpenRouter_API_KEY, '[redacted]');
  assert.equal(o.OPENROUTER_API_KEY, '[redacted]');
  assert.equal(o.GEMINI_API_KEY, '[redacted]');
  assert.equal(o.SOME_SECRET_TOKEN, '[redacted]');
});
