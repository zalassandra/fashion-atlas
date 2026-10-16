import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../data/snapshots/', import.meta.url));
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    statSync(path).isDirectory() ? walk(path) : files.push(path);
  }
}
walk(root);
let invalid = 0;
for (const file of files.filter(file => file.endsWith('.json'))) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const required = ['snapshot_id', 'study_id', 'observed_at', 'state', 'geographic_scope', 'confidence'];
  const missing = required.filter(key => !data[key]);
  if (missing.length || !['hypothesis', 'supported', 'rejected'].includes(data.state)) {
    invalid += 1;
    console.error(`${file}: missing ${missing.join(', ') || 'a valid state'}`);
  }
  for (const object of data.candidate_objects || []) {
    if (!object.source_url || !object.claim_boundary || object.evidence_state !== 'candidate_object') {
      invalid += 1;
      console.error(`${file}: candidate object needs URL, claim boundary, and candidate_object state`);
    }
  }
}
if (invalid) process.exit(1);
console.log(`Validated ${files.length} snapshot file(s): claim boundaries present.`);
