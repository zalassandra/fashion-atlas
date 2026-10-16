#!/usr/bin/env node
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {sourceStatus, collectSource, summary, canPersist} from '../lib/connectors/index.mjs';
import {purgeExpiredRuns} from '../lib/connectors/retention.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args[0] || 'status';
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
async function main() {
  if (!['status', 'probe', 'collect', 'purge'].includes(command)) throw new Error('Use: connectors.mjs status|probe|collect|purge [--source ID] [--config PATH]');
  if (command === 'purge') { console.log(JSON.stringify(await purgeExpiredRuns(join(root, '.local/connector-runs')))); return; }
  if (command === 'collect') await purgeExpiredRuns(join(root, '.local/connector-runs'));
  const configPath = resolve(root, value('--config') || (existsSync(join(root, 'config/sources.local.json')) ? 'config/sources.local.json' : 'config/sources.example.json'));
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (!Array.isArray(config.sources) || config.sources.length > 20) throw new Error('Config requires at most 20 sources.');
  const selected = value('--source');
  const sources = config.sources.filter(source => !selected || source.id === selected);
  if (!sources.length) throw new Error('No matching source.');
  if (new Set(sources.map(source => source.id)).size !== sources.length || sources.some(source => !/^[a-z0-9-]{1,60}$/.test(source.id))) throw new Error('Source IDs must be unique lowercase letters, digits and hyphens.');
  const output = [];
  for (const source of sources) {
    if (command === 'status') { output.push(sourceStatus(source)); continue; }
    if (command === 'collect' && !canPersist(source)) {
      output.push({...sourceStatus(source), state: 'needs_storage_permission', missing: ['retention_approved, retention_reference, retention_days (1-365)'], record_count: 0}); continue;
    }
    const result = await collectSource(source);
    const safe = summary(result);
    if (command === 'collect' && result.state === 'connected') {
      const relativeFile = `.local/connector-runs/${source.id}-${result.observed_at.replace(/[:.]/g, '-')}.json`;
      const ignored = spawnSync(process.env.GIT_EXECUTABLE || 'git', ['check-ignore', '--quiet', relativeFile], {cwd: root, windowsHide: true});
      if (ignored.status !== 0) throw new Error('Private output is not confirmed ignored by Git. Add .local/ to .gitignore and make git available before collecting.');
      const file = join(root, relativeFile);
      await mkdir(dirname(file), {recursive: true});
      const expiresAt = new Date(Date.parse(result.observed_at) + source.retention_days * 86400000).toISOString();
      await writeFile(file, JSON.stringify({artifact: 'fashion-atlas-connector-run', ...result, expires_at: expiresAt, retention_reference: source.retention_reference}, null, 2) + '\n', {flag: 'wx', mode: 0o600});
      safe.private_output = relativeFile; safe.expires_at = expiresAt;
    }
    output.push(safe);
  }
  console.log(JSON.stringify({mode: command, sources: output}, null, 2));
  if (command !== 'status' && output.some(item => item.state !== 'connected')) process.exitCode = 2;
}
main().catch(error => {
  const known = ['Use:', 'Config requires', 'No matching source', 'Source IDs', 'Private output'];
  console.error(known.some(prefix => error.message.startsWith(prefix)) ? error.message : 'Connector command failed. Check local config and filesystem; secret values are not logged.');
  process.exitCode = 1;
});
