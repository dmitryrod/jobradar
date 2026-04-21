import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buffersToUtf8String } from '../lib/read-utf8-body.mjs';

test('buffersToUtf8String: склейка буферов до decode даёт корректную кириллицу', () => {
  const s = 'спроектировал';
  const buf = Buffer.from(s, 'utf8');
  const split = 1;
  const c1 = buf.subarray(0, split);
  const c2 = buf.subarray(split);
  const perChunkDecode = c1.toString('utf8') + c2.toString('utf8');
  const merged = buffersToUtf8String([c1, c2]);
  assert.equal(merged, s);
  assert.notEqual(perChunkDecode, s, 'пер-chunk decode должен давать мусор при split внутри символа');
});
