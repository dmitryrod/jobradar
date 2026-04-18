import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const tmp = mkdtempSync(join(tmpdir(), 'hh-rotate-kw-'));
after(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const { rotateSearchKeywordFirstToEnd } = await import('../lib/rotate-search-keyword.mjs');

test('ротация: первая фраза в конец, порядок остальных сохраняется', () => {
  const f = join(tmp, 'k1.txt');
  writeFileSync(f, 'alpha\nbeta\n# comment\ngamma\n', 'utf8');
  const r = rotateSearchKeywordFirstToEnd(f);
  assert.equal(r.ok, true);
  assert.equal(readFileSync(f, 'utf8'), 'beta\n# comment\ngamma\nalpha\n');
});

test('ротация: строка только из комментария не считается ключом — двигается первая фраза', () => {
  const f = join(tmp, 'k2.txt');
  writeFileSync(f, '# only comment\n  delta  \nomega\n', 'utf8');
  const r = rotateSearchKeywordFirstToEnd(f);
  assert.equal(r.ok, true);
  assert.equal(readFileSync(f, 'utf8'), '# only comment\nomega\n  delta  \n');
});

test('нет ключевых строк — ok: false', () => {
  const f = join(tmp, 'k3.txt');
  writeFileSync(f, '# a\n\n', 'utf8');
  const r = rotateSearchKeywordFirstToEnd(f);
  assert.equal(r.ok, false);
});
