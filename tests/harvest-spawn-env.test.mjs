import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotHarvestSpawnEnv,
  restoreHarvestSpawnEnv,
} from '../lib/harvest-spawn-env.mjs';
import { loadEnv } from '../lib/load-env.mjs';

test('после loadEnv значения из spawn (дашборд) не перетираются .env', () => {
  const prevCycles = process.env.HH_KEYWORDS_CYCLES;
  const prevLogic = process.env.HH_KEYWORDS_LOGIC;
  const prevFlag = process.env.HH_GRACEFUL_STOP_FILE;
  try {
    process.env.HH_KEYWORDS_LOGIC = 'cycles';
    process.env.HH_KEYWORDS_CYCLES = '100';
    process.env.HH_GRACEFUL_STOP_FILE = 'C:\\spawn\\absolute\\harvest-stop.flag';

    const snap = snapshotHarvestSpawnEnv();
    loadEnv();
    restoreHarvestSpawnEnv(snap);

    assert.equal(process.env.HH_KEYWORDS_LOGIC, 'cycles');
    assert.equal(process.env.HH_KEYWORDS_CYCLES, '100');
    assert.equal(process.env.HH_GRACEFUL_STOP_FILE, 'C:\\spawn\\absolute\\harvest-stop.flag');
  } finally {
    if (prevCycles === undefined) delete process.env.HH_KEYWORDS_CYCLES;
    else process.env.HH_KEYWORDS_CYCLES = prevCycles;
    if (prevLogic === undefined) delete process.env.HH_KEYWORDS_LOGIC;
    else process.env.HH_KEYWORDS_LOGIC = prevLogic;
    if (prevFlag === undefined) delete process.env.HH_GRACEFUL_STOP_FILE;
    else process.env.HH_GRACEFUL_STOP_FILE = prevFlag;
  }
});
