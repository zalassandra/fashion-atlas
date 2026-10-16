import { readdir, readFile, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';

// Removes only expired files created by this collector. Unknown files are left alone.
export async function purgeExpiredRuns(directory, now = new Date()) {
  let root;
  try { root = await realpath(directory); }
  catch (error) { if (error.code === 'ENOENT') return { removed: 0 }; throw error; }
  let removed = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const file = path.resolve(root, entry.name);
    if (!file.startsWith(root + path.sep)) continue;
    let data;
    try { data = JSON.parse(await readFile(file, 'utf8')); } catch { continue; }
    if (data.artifact !== 'fashion-atlas-connector-run' || !Array.isArray(data.records)) continue;
    const expiry = Date.parse(data.expires_at);
    if (Number.isFinite(expiry) && expiry <= +now) { await unlink(file); removed++; }
  }
  return { removed };
}
