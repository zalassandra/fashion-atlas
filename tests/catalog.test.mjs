import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogHandler, DEMO_PROFILE, ATLAS_PROFILE } from '../lib/catalog-route.mjs';

// Fictional fixtures only. Merchant API responses are never persisted in tests.
const fixture = {
  result: { structuredContent: { products: [{
    title: 'Sample item', media: [{ type: 'image', url: 'https://images.example/product.jpg' }],
    variants: [{ title: 'Sample black item', url: 'https://shop.example/products/sample',
      seller: { name: 'Example merchant' }, availability: { available: true },
      price: { amount: 9900, currency: 'USD' } }],
  }] } },
};
function request(overrides = {}) {
  return { url: '/api/catalog?edit=fogline-utility', method: 'GET', headers: { host: '127.0.0.1:4180' },
    socket: { remoteAddress: '127.0.0.1' }, ...overrides };
}
function response() {
  return { writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = JSON.parse(body); } };
}

test('renders original merchant media with its own listing, never caches across requests', async () => {
  let calls = 0;
  const handle = createCatalogHandler({ fetchImpl: async (_url, options) => {
    calls++;
    assert.equal(options.cache, 'no-store');
    const input = JSON.parse(options.body);
    assert.equal(input.params.arguments.meta['ucp-agent'].profile, ATLAS_PROFILE);
    return { ok: true, json: async () => fixture };
  } });
  const first = response();
  assert.equal(await handle(request(), first), true);
  const second = response();
  await handle(request(), second);
  assert.equal(calls, 8);
  assert.match(first.headers['Cache-Control'], /no-store/);
  assert.equal(first.body.products.length, 4);
  assert.equal(first.body.products[0].image, 'https://images.example/product.jpg');
  assert.equal(first.body.products[0].url, 'https://shop.example/products/sample');
});

test('refuses hosted demo profile for a nonlocal client', async () => {
  const handle = createCatalogHandler({ profileUrl: DEMO_PROFILE, fetchImpl: () => assert.fail('must not call upstream') });
  const res = response();
  await handle(request({ headers: { host: 'atlas.example' }, socket: { remoteAddress: '203.0.113.1' } }), res);
  assert.equal(res.status, 503);
});

test('a failed upstream slot does not erase independent successful products', async () => {
  const handle = createCatalogHandler({ fetchImpl: async (_url, options) => {
    if (JSON.parse(options.body).id === 'shell') throw new Error('network unavailable');
    return { ok: true, json: async () => fixture };
  } });
  const res = response();
  await handle(request(), res);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'partial');
  assert.equal(res.body.products.length, 3);
});

test('rejects unsafe media, sold-out variants and arbitrary queries', async () => {
  const unsafe = structuredClone(fixture);
  unsafe.result.structuredContent.products[0].media[0].url = 'javascript:alert(1)';
  const handle = createCatalogHandler({ fetchImpl: async () => ({ ok: true, json: async () => unsafe }) });
  const res = response();
  await handle(request(), res);
  assert.equal(res.body.products.length, 0);
  const wrongQuery = response();
  await handle(request({ url: '/api/catalog?query=anything' }), wrongQuery);
  assert.equal(wrongQuery.status, 400);
  unsafe.result.structuredContent.products[0].media[0].url = 'https://images.example/product.jpg';
  unsafe.result.structuredContent.products[0].variants[0].availability.available = false;
  const soldOut = response();
  await handle(request(), soldOut);
  assert.equal(soldOut.body.products.length, 0);
});
