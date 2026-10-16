/**
 * Live shopping previews, never a historical signal feed.
 * Shopify requires live rendering with the related merchant listing and prohibits
 * caching catalog results or downloading images: https://shopify.dev/docs/agents/catalog
 */
export const SHOPIFY_ENDPOINT = 'https://catalog.shopify.com/api/ucp/mcp';
export const DEMO_PROFILE = 'https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json';
export const ATLAS_PROFILE = 'https://cdn.jsdelivr.net/gh/zalassandra/fashion-atlas@8448b60d3b3c26f75609381b43944addd360eb54/config/agent-profile.json';

const EDITS = {
  'fogline-utility': [
    { id: 'trail', query: 'Salomon XT-6', label: 'Ground contact' },
    { id: 'shell', query: 'Arcteryx Beta jacket', label: 'Weather layer' },
    { id: 'pack', query: 'Peak Design Everyday Backpack black', label: 'Carry system' },
    { id: 'city-bag', query: 'Timbuk2 backpack', label: 'City cargo' },
  ],
};

function httpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function plain(value, limit = 240) {
  return typeof value === 'string' ? value.replace(/[<>]/g, '').slice(0, limit) : '';
}

function loopbackRequest(req) {
  const remote = req.socket?.remoteAddress;
  let host;
  try { host = new URL(`http://${req.headers.host}`).hostname; } catch { return false; }
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)
    && ['127.0.0.1', 'localhost', '[::1]'].includes(host);
}

function normalizeProduct(product, recipe) {
  // A variant's image and destination stay together; never pair one merchant's
  // photo with an unrelated official-brand link or a different variant.
  const variant = product.variants?.find(v => v.availability?.available === true && httpsUrl(v.url));
  if (!variant) return null;
  const media = (variant.media ?? product.media ?? []).find(m => m.type === 'image' && httpsUrl(m.url));
  if (!media) return null;
  const price = variant.price;
  return {
    id: recipe.id,
    label: recipe.label,
    title: plain(variant.title || product.title),
    merchant: plain(variant.seller?.name || 'Merchant'),
    url: httpsUrl(variant.url),
    image: httpsUrl(media.url),
    imageAlt: plain(media.alt_text || variant.title || product.title),
    price: Number.isSafeInteger(price?.amount) && /^[A-Z]{3}$/.test(price?.currency ?? '')
      ? { amount: price.amount, currency: price.currency } : null,
    available: true,
    source: 'Shopify Catalog',
  };
}

async function discover(recipe, profile, fetchImpl, timeoutMs) {
  const response = await fetchImpl(SHOPIFY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'User-Agent': 'FashionAtlas/0.1 (live-curatorial-shopping-preview)',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'tools/call', id: recipe.id,
      params: {
        name: 'search_catalog',
        arguments: {
          meta: { 'ucp-agent': { profile } },
          catalog: {
            query: recipe.query,
            filters: { ships_to: { country: 'US' }, available: true },
            pagination: { limit: 2 },
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`Catalog returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.error || body.result?.isError) throw new Error('Catalog rejected the request');
  const products = body.result?.structuredContent?.products;
  if (!Array.isArray(products)) throw new Error('Catalog returned an unexpected response');
  return products.map(p => normalizeProduct(p, recipe)).find(Boolean) ?? null;
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

export function createCatalogHandler({ fetchImpl = globalThis.fetch, profileUrl, timeoutMs = 15000 } = {}) {
  return async function catalogHandler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api/catalog') return false;
    if (req.method !== 'GET') {
      send(res, 405, { error: 'Use GET for live product previews.' });
      return true;
    }
    const edit = url.searchParams.get('edit') || 'fogline-utility';
    if (!Object.hasOwn(EDITS, edit) || [...url.searchParams.keys()].some(key => key !== 'edit')) {
      send(res, 400, { error: 'Unknown curatorial edit.' });
      return true;
    }
    // The hosted sample profile is documented for tutorials. Production must
    // identify this project with its own publicly hosted UCP profile.
    const configured = profileUrl || process.env.SHOPIFY_AGENT_PROFILE_URL || ATLAS_PROFILE;
    const profile = httpsUrl(configured);
    if (!profile || (profile === DEMO_PROFILE && !loopbackRequest(req))) {
      send(res, 503, { error: 'Set SHOPIFY_AGENT_PROFILE_URL to the deployed Fashion Atlas UCP profile.' });
      return true;
    }
    const results = await Promise.allSettled(EDITS[edit].map(recipe => discover(recipe, profile, fetchImpl, timeoutMs)));
    const products = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    const failures = results.filter(r => r.status === 'rejected').length;
    send(res, products.length ? 200 : (failures ? 502 : 200), {
      edit,
      mode: 'live-shopping-preview',
      status: products.length ? (products.length < results.length ? 'partial' : 'ready') : 'unavailable',
      retrievedAt: new Date().toISOString(),
      products,
      unavailableSlots: results.length - products.length,
      note: 'Curatorial selection. Merchant listings do not measure local popularity.',
      imageUse: 'Display only with the associated merchant listing. Do not cache or archive.',
      termsUrl: 'https://shopify.dev/docs/agents/catalog',
    });
    return true;
  };
}

export const handleCatalogRequest = createCatalogHandler();
