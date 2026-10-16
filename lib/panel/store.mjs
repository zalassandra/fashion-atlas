import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

export const TAGS = ['trail-runner', 'weather-shell', 'technical-tote', 'backpack', 'crossbody-bag', 'soft-knit', 'wide-trouser', 'tailoring', 'layering', 'denim', 'monochrome', 'bright-accent'];
export const LICENSES = ['own-work', 'CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'written-permission'];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const sha = value => createHash('sha256').update(value).digest('hex');
export class PanelError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function field(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/u.test(value)) throw new PanelError(`Provide a valid ${label}.`);
  return value.trim();
}
function webUrl(value, label) {
  const text = field(value, label, 1500);
  let url;
  try { url = new URL(text); } catch { throw new PanelError(`Provide a full ${label}.`); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new PanelError(`Use an http(s) ${label} without credentials.`);
  return url.href;
}
export function validateSubmission(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PanelError('Expected a submission object.');
  if (!LICENSES.includes(input.license)) throw new PanelError('Choose a supported license or documented written permission.');
  if (input.rightsConfirmed !== true || input.subjectConsentConfirmed !== true) throw new PanelError('Rights and photographed-subject consent must be confirmed.');
  if (typeof input.allowAnalysis !== 'boolean' || typeof input.allowDisplay !== 'boolean' || (!input.allowAnalysis && !input.allowDisplay)) throw new PanelError('Choose at least one permission: analysis or editorial display.');
  const capturedAt = field(input.capturedAt, 'capture date', 10);
  const parsedDate = new Date(`${capturedAt}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedAt) || Number.isNaN(+parsedDate) || parsedDate.toISOString().slice(0, 10) !== capturedAt || capturedAt > new Date().toISOString().slice(0, 10)) throw new PanelError('Use a real capture date, today or earlier.');
  const tags = [...new Set(Array.isArray(input.tags) ? input.tags : [])];
  if (!tags.length || tags.some(tag => !TAGS.includes(tag))) throw new PanelError('Select at least one supported garment tag.');
  const sourceGroup = field(input.sourceGroup, 'independent publisher / collection', 160).toLowerCase().replace(/\s+/g, ' ');
  const permissionReference = input.license === 'written-permission' ? field(input.permissionReference, 'permission document reference', 300) : '';
  const metadata = {
    city: field(input.city, 'city', 100), scene: field(input.scene, 'scene', 140), captured_at: capturedAt,
    source_url: webUrl(input.sourceUrl, 'source URL'), source_group_key: sha(sourceGroup),
    rights_holder: field(input.rightsHolder, 'rights holder', 200), license: input.license,
    permission_reference: permissionReference, permissions: { analysis: input.allowAnalysis, display: input.allowDisplay },
    rights_confirmed: true, subject_consent_confirmed: true, tags, tag_method: 'contributor-supplied',
  };
  const bytes = decodeImage(input.image);
  return { metadata, bytes, mime: input.image.mime };
}
export function decodeImage(image) {
  if (!image || !['image/jpeg', 'image/png', 'image/webp'].includes(image.mime) || typeof image.base64 !== 'string' || image.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new PanelError('Upload a JPEG, PNG or WebP up to 8 MB.');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.base64)) throw new PanelError('Invalid image encoding.');
  const bytes = Buffer.from(image.base64, 'base64');
  if (bytes.length < 32 || bytes.length > MAX_IMAGE_BYTES) throw new PanelError('Upload an image between 32 bytes and 8 MB.');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.subarray(12, 16).toString() === 'IHDR' && bytes.subarray(-8, -4).toString() === 'IEND';
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length;
  if (!(image.mime === 'image/png' ? png : image.mime === 'image/jpeg' ? jpeg : webp)) throw new PanelError('Image signature does not match its declared type.');
  return bytes;
}
function tokenMatches(token, expectedHash) {
  if (typeof token !== 'string' || token.length > 256 || typeof expectedHash !== 'string') return false;
  return timingSafeEqual(Buffer.from(sha(token)), Buffer.from(expectedHash));
}
function publicRecord(record) {
  const { withdrawal_token_hash, image_path, ...rest } = record;
  return rest;
}
export function createPanelStore(directory, { minimumSources = 3 } = {}) {
  if (!Number.isInteger(minimumSources) || minimumSources < 3) throw new Error('At least three independent sources are required.');
  const root = path.resolve(directory), dbPath = path.join(root, 'submissions.json'), uploadRoot = path.join(root, 'originals');
  let queue = Promise.resolve();
  async function load() {
    try { return JSON.parse(await readFile(dbPath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async function save(records) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const temp = `${dbPath}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(records, null, 2), { mode: 0o600, flag: 'wx' });
    await rename(temp, dbPath);
  }
  function serial(work) {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  }
  return {
    async submit(input) {
      const { metadata, bytes, mime } = validateSubmission(input);
      return serial(async () => {
        const records = await load(), imageHash = sha(bytes);
        if (records.some(record => record.image_sha256 === imageHash)) throw new PanelError('This image has already been submitted. No new observation was added.', 409);
        const id = randomUUID(), withdrawalToken = randomBytes(32).toString('hex');
        const imagePath = path.join(uploadRoot, `${id}.${{ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime]}`);
        await mkdir(uploadRoot, { recursive: true, mode: 0o700 });
        await writeFile(imagePath, bytes, { mode: 0o600, flag: 'wx' });
        const record = { id, state: 'pending', created_at: new Date().toISOString(), ...metadata, image_sha256: imageHash, image_mime: mime, image_path: imagePath, withdrawal_token_hash: sha(withdrawalToken) };
        records.push(record);
        try { await save(records); } catch (error) { await unlink(imagePath).catch(() => {}); throw error; }
        return { id, state: 'pending', withdrawalToken };
      });
    },
    async list() {
      await queue;
      return (await load()).filter(record => record.state !== 'withdrawn').map(publicRecord);
    },
    async image(id) {
      await queue;
      const record = (await load()).find(record => record.id === id && record.state !== 'withdrawn');
      if (!record) throw new PanelError('Submission not found.', 404);
      return { bytes: await readFile(record.image_path), mime: record.image_mime };
    },
    review(id, { decision, note, independentSourceConfirmed }) {
      return serial(async () => {
        const records = await load(), record = records.find(item => item.id === id);
        if (!record || record.state === 'withdrawn') throw new PanelError('Submission not found.', 404);
        if (!['approved', 'rejected'].includes(decision)) throw new PanelError('Choose approved or rejected.');
        if (decision === 'approved' && independentSourceConfirmed !== true) throw new PanelError('Verify provenance and independent-source grouping before approval.');
        record.review = { note: field(note, 'review note', 1000), reviewed_at: new Date().toISOString(), independent_source_confirmed: decision === 'approved' };
        record.state = decision;
        await save(records);
        return { id, state: record.state };
      });
    },
    withdraw(id, token) {
      return serial(async () => {
        const records = await load(), index = records.findIndex(record => record.id === id), record = records[index];
        if (!record || !tokenMatches(token, record.withdrawal_token_hash)) throw new PanelError('Submission or withdrawal token is invalid.', 403);
        if (record.state === 'withdrawn') return { id, state: 'withdrawn' };
        await unlink(record.image_path).catch(error => { if (error.code !== 'ENOENT') throw error; });
        records[index] = { id, state: 'withdrawn', withdrawn_at: new Date().toISOString(), image_sha256: record.image_sha256, withdrawal_token_hash: record.withdrawal_token_hash };
        await save(records);
        return { id, state: 'withdrawn' };
      });
    },
    async aggregates() {
      await queue;
      const records = (await load()).filter(record => record.state === 'approved' && record.permissions.analysis && record.review?.independent_source_confirmed);
      const groups = new Map();
      for (const record of records) for (const tag of record.tags) {
        const month = record.captured_at.slice(0, 7), city = record.city.toLowerCase(), scene = record.scene.toLowerCase();
        const key = JSON.stringify([city, scene, month, tag]);
        if (!groups.has(key)) groups.set(key, { city, scene, month, tag, sources: new Set(), observation_count: 0 });
        const group = groups.get(key);
        group.sources.add(record.source_group_key); group.observation_count++;
      }
      const visible = [...groups.values()].filter(group => group.sources.size >= minimumSources).map(({ sources, ...group }) => ({ ...group, independent_sources: sources.size, scope: 'contributed panel only; not population prevalence', tag_method: 'contributor-supplied, editor-reviewed' }));
      return { minimum_independent_sources: minimumSources, status: visible.length ? 'panel_observations' : 'insufficient_independent_sources', groups: visible, methodology: 'Only approved, analysis-permitted submissions count. Each city / scene / calendar month / garment tag needs at least three editor-verified independent source groups. Hidden cells expose no locations, counts or identifiers. No automated vision analysis is running.' };
    },
  };
}
