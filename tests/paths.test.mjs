import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { sessionProfilePath } from '../lib/paths.mjs';

afterEach(() => {
  delete process.env.HH_SESSION_DIR;
});

test('sessionProfilePath: дефолтный каталог содержит chromium-profile', () => {
  delete process.env.HH_SESSION_DIR;
  const p = sessionProfilePath();
  assert.ok(p.replace(/\\/g, '/').endsWith('chromium-profile'));
});

test('sessionProfilePath: учитывает HH_SESSION_DIR', () => {
  process.env.HH_SESSION_DIR = './custom-session';
  const p = sessionProfilePath();
  assert.match(p, /custom-session/);
  assert.ok(p.includes('chromium-profile'));
});
