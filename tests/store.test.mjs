import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'hh-ru-store-'));
process.env.HH_DATA_DIR = tmp;

const { loadQueue, addVacancyRecord, saveQueue } = await import('../lib/store.mjs');

after(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  delete process.env.HH_DATA_DIR;
});

test('loadQueue на пустом каталоге возвращает []', () => {
  assert.deepEqual(loadQueue(), []);
});

test('addVacancyRecord и round-trip', () => {
  const id = 'test-' + Date.now();
  const ok = addVacancyRecord({
    id,
    vacancyId: '123',
    title: 'T',
    status: 'pending',
  });
  assert.equal(ok, true);
  const q = loadQueue();
  assert.equal(q.length, 1);
  assert.equal(q[0].vacancyId, '123');

  const ok2 = addVacancyRecord({
    id: id + '-2',
    vacancyId: '123',
    title: 'Dup',
    status: 'pending',
  });
  assert.equal(ok2, false);
});

test('saveQueue перезаписывает файл', () => {
  saveQueue([{ id: 'x', vacancyId: '1', title: 'A', status: 'pending' }]);
  const q = loadQueue();
  assert.equal(q.length, 1);
  assert.equal(q[0].id, 'x');
});
