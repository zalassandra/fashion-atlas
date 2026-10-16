import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { purgeExpiredRuns } from '../lib/connectors/retention.mjs';

test('retention purge removes only expired collector artifacts', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'atlas-retention-test-'));
  t.after(() => rm(directory, {recursive:true,force:true}));
  for (const [name,data] of Object.entries({
    'expired.json':{artifact:'fashion-atlas-connector-run',records:[],expires_at:'2025-01-01T00:00:00Z'},
    'current.json':{artifact:'fashion-atlas-connector-run',records:[],expires_at:'2027-01-01T00:00:00Z'},
    'unrelated.json':{records:[],expires_at:'2025-01-01T00:00:00Z'},
  })) await writeFile(path.join(directory,name),JSON.stringify(data));
  assert.deepEqual(await purgeExpiredRuns(directory,new Date('2026-01-01')),{removed:1});
  assert.deepEqual((await readdir(directory)).sort(),['current.json','unrelated.json']);
});
