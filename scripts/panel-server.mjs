import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, realpath } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createPanelStore, PanelError, TAGS, LICENSES } from '../lib/panel/store.mjs';
import { handleCatalogRequest } from '../lib/catalog-route.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BODY_BYTES = 12 * 1024 * 1024;
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new PanelError('Use application/json.', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new PanelError('Request exceeds the 12 MB limit.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new PanelError('Invalid JSON.'); }
}
export function createPanelServer({ dataDirectory = path.join(projectRoot, '.private', 'visual-panel'), editorToken = randomBytes(32).toString('hex') } = {}) {
  if (!editorToken || editorToken.length < 24) throw new Error('Editor token must have at least 24 characters.');
  const store = createPanelStore(dataDirectory), dist = path.join(projectRoot, 'dist');
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const port = server.address().port, allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host)) throw new PanelError('Invalid local host.', 403);
      const expectedOrigin = `http://${req.headers.host}`;
      if ((req.headers.origin && req.headers.origin !== expectedOrigin) || req.headers['sec-fetch-site'] === 'cross-site') throw new PanelError('Only this local panel may access the API.', 403);
      if (req.method !== 'GET' && req.headers.origin !== expectedOrigin) throw new PanelError('A same-origin request is required.', 403);
      const url = new URL(req.url, expectedOrigin);
      if (await handleCatalogRequest(req, res)) return;
      const editor = () => {
        const actual = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${editorToken}`);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new PanelError('Enter the editor key printed by the local server.', 401);
      };
      if (req.method === 'GET' && url.pathname === '/api/panel/status') return json(res, 200, { mode: 'local-private', tags: TAGS, licenses: LICENSES, automated_vision: false });
      if (req.method === 'GET' && url.pathname === '/api/panel/aggregates') return json(res, 200, await store.aggregates());
      if (req.method === 'POST' && url.pathname === '/api/panel/submissions') return json(res, 201, await store.submit(await body(req)));
      if (req.method === 'GET' && url.pathname === '/api/panel/review') { editor(); return json(res, 200, { submissions: await store.list() }); }
      const match = url.pathname.match(/^\/api\/panel\/submissions\/([a-f0-9-]{36})\/(review|withdraw|image)$/);
      if (match) {
        const [, id, action] = match;
        if (req.method === 'POST' && action === 'review') { editor(); return json(res, 200, await store.review(id, await body(req))); }
        if (req.method === 'POST' && action === 'withdraw') return json(res, 200, await store.withdraw(id, (await body(req)).token));
        if (req.method === 'GET' && action === 'image') { editor(); const image = await store.image(id); res.writeHead(200, { 'Content-Type': image.mime }); return res.end(image.bytes); }
      }
      if (url.pathname.startsWith('/api/') || req.method !== 'GET') throw new PanelError('Route not found.', 404);
      const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.resolve(dist, `.${requested}`);
      if (!file.startsWith(`${dist}${path.sep}`)) throw new PanelError('Route not found.', 404);
      const resolved = await realpath(file);
      if (!resolved.startsWith(`${dist}${path.sep}`)) throw new PanelError('Route not found.', 404);
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(await readFile(resolved));
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const status = error instanceof PanelError ? error.status : error.code === 'ENOENT' ? 404 : 500;
      json(res, status, { error: status === 500 ? 'The local store could not complete this request. Check server access and disk space.' : error.message });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return { server, store, editorToken };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PANEL_PORT || 4180);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PANEL_PORT must be an integer from 1024 to 65535.');
  const { server, editorToken } = createPanelServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Fashion Atlas: http://127.0.0.1:${port}/`);
    console.log(`Local research intake: http://127.0.0.1:${port}/contribute.html`);
    console.log('Private submissions remain in .private/visual-panel; no upload is published.');
    console.log(`Editor key (this run only): ${editorToken}`);
  });
  server.on('error', error => { console.error(`Cannot start local panel: ${error.message}`); process.exitCode = 1; });
}
