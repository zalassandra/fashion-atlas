// Read-only, bounded API clients. Provider response bodies and credentials never enter logs.
export const PROVIDERS = ['commons', 'shopify', 'ebay', 'pinterest', 'instagram'];
export class ConnectorError extends Error {
  constructor(code, status = null) { super(code); this.name = 'ConnectorError'; this.code = code; this.status = status; }
}
const present = value => typeof value === 'string' && value.trim().length > 0;
const text = value => typeof value === 'string' ? value.slice(0, 2000) : null;
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = value => Number.isInteger(value) && value >= 1 && value <= 50 ? value : 12;
const money = (amount, currency) => /^\d+(\.\d+)?$/.test(String(amount)) && /^[A-Z]{3}$/.test(currency || '') ? {amount: String(amount), currency} : null;

export function httpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some(key => /^(access_token|token|api_key|password|secret)$/i.test(key))) return null;
    return url.href;
  } catch { return null; }
}

export function sourceStatus(source, env = process.env) {
  const missing = [];
  if (!PROVIDERS.includes(source.provider)) return {id: source.id, provider: source.provider, state: 'invalid', missing: ['supported provider']};
  if (source.enabled !== true) missing.push('source.enabled');
  if (!present(source.access_reference)) missing.push('source.access_reference');
  switch (source.provider) {
    case 'commons':
      if (!/^Category:[^\u0000-\u001f]{1,160}$/.test(source.category || '')) missing.push('category');
      break;
    case 'shopify':
      if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(env.SHOPIFY_STORE_DOMAIN || '')) missing.push('SHOPIFY_STORE_DOMAIN (shop.myshopify.com)');
      if (!['tokenless', 'public', 'private'].includes(source.auth_mode)) missing.push('auth_mode');
      if (source.auth_mode !== 'tokenless' && !present(env.SHOPIFY_STOREFRONT_TOKEN)) missing.push('SHOPIFY_STOREFRONT_TOKEN');
      if (!/^20\d{2}-(01|04|07|10)$/.test(source.api_version || '')) missing.push('api_version');
      break;
    case 'ebay':
      if (!present(env.EBAY_ACCESS_TOKEN) && !(present(env.EBAY_CLIENT_ID) && present(env.EBAY_CLIENT_SECRET))) missing.push('EBAY_ACCESS_TOKEN or EBAY_CLIENT_ID + EBAY_CLIENT_SECRET');
      if (!['sandbox', 'production'].includes(source.environment)) missing.push('environment');
      if (source.environment === 'production' && source.production_access_confirmed !== true) missing.push('production_access_confirmed');
      if (!/^EBAY_[A-Z]{2,5}$/.test(source.marketplace || '')) missing.push('marketplace');
      if (!present(source.query)) missing.push('query');
      break;
    case 'pinterest':
      if (!present(env.PINTEREST_ACCESS_TOKEN)) missing.push('PINTEREST_ACCESS_TOKEN');
      if (source.trends_access_confirmed !== true) missing.push('trends_access_confirmed');
      if (!/^[A-Z]{2}(\+[A-Z]{2})*$/.test(source.region || '')) missing.push('region');
      if (!['growing', 'monthly', 'yearly', 'seasonal'].includes(source.trend_type)) missing.push('trend_type');
      break;
    case 'instagram':
      if (!present(env.INSTAGRAM_ACCESS_TOKEN)) missing.push('INSTAGRAM_ACCESS_TOKEN');
      if (!/^\d+$/.test(env.INSTAGRAM_USER_ID || '')) missing.push('INSTAGRAM_USER_ID');
      if (!/^v\d+\.0$/.test(source.api_version || '')) missing.push('api_version');
      if (!present(source.participant_consent_reference)) missing.push('participant_consent_reference');
      if (!present(source.declared_city)) missing.push('declared_city');
      if (source.account_access_confirmed !== true) missing.push('account_access_confirmed');
      break;
  }
  return {id: source.id, provider: source.provider, state: missing.length ? 'needs_setup' : 'ready_to_probe', missing};
}

async function requestJson(fetchImpl, url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(url, {...options, redirect: 'error', signal: controller.signal});
    if (!response.ok) {
      await response.body?.cancel();
      throw new ConnectorError(response.status === 429 ? 'rate_limited' : response.status === 401 ? 'authentication_failed' : response.status === 403 ? 'access_denied' : 'upstream_http_error', response.status);
    }
    const chunks = [];
    let bytes = 0;
    if (!response.body) throw new ConnectorError('invalid_response');
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > 2 * 1024 * 1024) { controller.abort(); throw new ConnectorError('response_too_large'); }
      chunks.push(Buffer.from(chunk));
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ConnectorError('invalid_json'); }
  } catch (error) {
    if (error instanceof ConnectorError) throw error;
    throw new ConnectorError(controller.signal.aborted ? 'request_timed_out' : 'network_error');
  } finally { clearTimeout(timer); }
}

function base(source, observedAt, kind, id, sourceUrl) {
  return {id: `${source.provider}:${id}`, kind, provider: source.provider, source_id: source.id,
    observed_at: observedAt, source_url: httpsUrl(sourceUrl), evidence_state: 'unreviewed',
    geographic_claim: null, access_reference: source.access_reference, publication_status: 'review_required'};
}
function image(url, sourceUrl, observedAt, alt = null) {
  const safeUrl = httpsUrl(url);
  return safeUrl ? {url: safeUrl, alt: text(alt), provenance: 'original_provider_media', source_url: httpsUrl(sourceUrl),
    observed_at: observedAt, publication_status: 'review_required',
    note: 'Provider-supplied image URL; access does not grant unrestricted republication or model-training rights.'} : null;
}

async function shopify(source, env, fetchImpl, observedAt) {
  const endpoint = `https://${env.SHOPIFY_STORE_DOMAIN}/api/${source.api_version}/graphql.json`;
  const headers = {'Content-Type': 'application/json', Accept: 'application/json'};
  if (source.auth_mode === 'public') headers['X-Shopify-Storefront-Access-Token'] = env.SHOPIFY_STOREFRONT_TOKEN;
  if (source.auth_mode === 'private') headers['Shopify-Storefront-Private-Token'] = env.SHOPIFY_STOREFRONT_TOKEN;
  const payload = await requestJson(fetchImpl, endpoint, {method: 'POST', headers, body: JSON.stringify({
    query: `query AtlasProducts($first: Int!, $query: String) { products(first: $first, query: $query) {
      nodes { id title vendor productType onlineStoreUrl availableForSale
        priceRange { minVariantPrice { amount currencyCode } } featuredImage { url altText } }
      pageInfo { hasNextPage } } }`,
    variables: {first: count(source.limit), query: text(source.query)}})});
  if (payload.errors?.length) throw new ConnectorError('graphql_error');
  if (!Array.isArray(payload.data?.products?.nodes)) throw new ConnectorError('unexpected_schema');
  const records = payload.data.products.nodes.slice(0, count(source.limit)).map(product => {
    const media = image(product.featuredImage?.url, product.onlineStoreUrl, observedAt, product.featuredImage?.altText);
    return {...base(source, observedAt, 'product_reference', product.id, product.onlineStoreUrl),
      title: text(product.title), brand: text(product.vendor), product_type: text(product.productType),
      price: money(product.priceRange?.minVariantPrice?.amount, product.priceRange?.minVariantPrice?.currencyCode),
      available: typeof product.availableForSale === 'boolean' ? product.availableForSale : null,
      media: media ? [media] : [], limitations: ['Catalog availability is not purchase volume or evidence of local style.']};
  });
  return {records, partial: payload.data.products.pageInfo?.hasNextPage === true, requests: 1};
}

async function commons(source, env, fetchImpl, observedAt) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'categorymembers',
    gcmtitle:source.category,gcmnamespace:'6',gcmsort:'timestamp',gcmdir:'desc',gcmlimit:String(count(source.limit)),
    prop:'imageinfo',iiprop:'url|timestamp|extmetadata',iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist'}).toString();
  const payload = await requestJson(fetchImpl,url.href,{headers:{'User-Agent':'FashionAtlas/0.2 (https://github.com/zalassandra/fashion-atlas; metadata research watch)'}});
  if(payload.error) throw new ConnectorError('provider_error');
  const pages = payload.query?.pages || [];
  if(!Array.isArray(pages)) throw new ConnectorError('unexpected_schema');
  const plain = value => text(value)?.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"');
  const records = [];
  for(const page of pages.slice(0,count(source.limit))){
    const info=page.imageinfo?.[0],meta=info?.extmetadata,license=meta?.LicenseShortName?.value;
    if(!/^(CC0|CC BY(?:-SA)? [234]\.0)$/.test(license || '')) continue;
    const licenseUrl=httpsUrl(meta?.LicenseUrl?.value?.replace(/^http:\/\/creativecommons\.org\//,'https://creativecommons.org/'));
    const sourceUrl=httpsUrl(info.descriptionurl);
    if(!licenseUrl || !sourceUrl) continue;
    records.push({...base(source,observedAt,'licensed_visual_candidate',page.pageid,sourceUrl),title:plain(page.title),
      license,license_url:licenseUrl,photographer:plain(meta.Artist?.value),file_uploaded_at:text(info.timestamp),
      category:source.category,media:[],image_downloaded:false,
      limitations:['Metadata discovery only. No photograph is downloaded or displayed by this watch.',
        'Category addition and upload dates are not capture dates or evidence of a new fashion trend.',
        'Category membership is not representative sampling; source, subject context and geographic relevance require review.']});
  }
  return {records,partial:Boolean(payload.continue),requests:1};
}

async function ebay(source, env, fetchImpl, observedAt) {
  const host = source.environment === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
  let token = env.EBAY_ACCESS_TOKEN;
  let requests = 1;
  if (!token) {
    const auth = await requestJson(fetchImpl, `${host}/identity/v1/oauth2/token`, {method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString('base64')}`},
      body: new URLSearchParams({grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope'}).toString()});
    if (!present(auth.access_token)) throw new ConnectorError('unexpected_auth_schema');
    token = auth.access_token; requests++;
  }
  const url = new URL(`${host}/buy/browse/v1/item_summary/search`);
  url.search = new URLSearchParams({q: source.query.slice(0, 200), limit: String(count(source.limit))}).toString();
  const payload = await requestJson(fetchImpl, url.href, {headers: {Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': source.marketplace}});
  if (!Array.isArray(payload.itemSummaries) && payload.total !== 0) throw new ConnectorError('unexpected_schema');
  const records = (payload.itemSummaries || []).slice(0, count(source.limit)).map(item => {
    const media = image(item.image?.imageUrl, item.itemWebUrl, observedAt, item.title);
    return {...base(source, observedAt, 'resale_listing', item.itemId, item.itemWebUrl),
      title: text(item.title), price: money(item.price?.value, item.price?.currency), condition: text(item.condition),
      marketplace: source.marketplace, environment: source.environment, media: media ? [media] : [],
      seller_location: {country: text(item.itemLocation?.country), city: text(item.itemLocation?.city)},
      limitations: ['Seller location is not buyer location. Listing supply is not sales volume.', ...(source.environment === 'sandbox' ? ['Sandbox data must not be treated as real market evidence.'] : [])]};
  });
  return {records, partial: Boolean(payload.next) || payload.total > records.length, requests};
}

async function pinterest(source, env, fetchImpl, observedAt) {
  const url = new URL(`https://api.pinterest.com/v5/trends/keywords/${encodeURIComponent(source.region)}/top/${source.trend_type}`);
  url.searchParams.set('limit', String(count(source.limit)));
  const payload = await requestJson(fetchImpl, url.href, {headers: {Authorization: `Bearer ${env.PINTEREST_ACCESS_TOKEN}`}});
  if (!Array.isArray(payload.trends)) throw new ConnectorError('unexpected_schema');
  const records = payload.trends.slice(0, count(source.limit)).map((trend, i) => ({
    ...base(source, observedAt, 'regional_search_interest', `${source.region}:${source.trend_type}:${trend.keyword}`, 'https://trends.pinterest.com/'),
    keyword: text(trend.keyword), rank: i + 1, region: source.region, trend_type: source.trend_type,
    pct_growth_wow: numeric(trend.pct_growth_wow), pct_growth_mom: numeric(trend.pct_growth_mom), pct_growth_yoy: numeric(trend.pct_growth_yoy),
    weekly_relative_interest: Object.entries(trend.time_series || {}).filter(([date, value]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && typeof value === 'number' && value >= 0 && value <= 100).slice(-60).map(([week_ending, value]) => ({week_ending, value})),
    limitations: ['Relative search interest is not purchases, wear prevalence, or a city-level estimate.', 'Provider terms govern storage and derived uses.']}));
  return {records, partial: true, requests: 1};
}

async function instagram(source, env, fetchImpl, observedAt) {
  const url = new URL(`https://graph.instagram.com/${source.api_version}/${env.INSTAGRAM_USER_ID}/media`);
  url.search = new URLSearchParams({fields: 'id,media_type,media_url,thumbnail_url,permalink,timestamp', limit: String(count(source.limit))}).toString();
  const payload = await requestJson(fetchImpl, url.href, {headers: {Authorization: `Bearer ${env.INSTAGRAM_ACCESS_TOKEN}`}});
  if (payload.error) throw new ConnectorError('provider_error');
  if (!Array.isArray(payload.data)) throw new ConnectorError('unexpected_schema');
  const records = payload.data.slice(0, count(source.limit)).map(item => {
    const media = image(item.media_type === 'VIDEO' ? item.thumbnail_url : item.media_url, item.permalink, observedAt);
    return {...base(source, observedAt, 'consented_visual_reference', item.id, item.permalink),
      published_at: text(item.timestamp), media_type: text(item.media_type), media: media ? [media] : [],
      declared_city: source.declared_city, geographic_basis: 'participant_declared_unverified', participant_consent_reference: source.participant_consent_reference,
      limitations: ['One opted-in professional account; not a representative city sample.', 'Carousels contribute their cover only; video contributes a thumbnail only.', 'No identity, ethnicity, age or other person-level inference.']};
  });
  return {records, partial: Boolean(payload.paging?.next), requests: 1};
}

export async function collectSource(source, {env = process.env, fetchImpl = fetch, now = () => new Date()} = {}) {
  const status = sourceStatus(source, env);
  if (status.state !== 'ready_to_probe') return {...status, records: [], requests: 0};
  const observedAt = now().toISOString();
  try {
    const result = await ({commons, shopify, ebay, pinterest, instagram}[source.provider])(source, env, fetchImpl, observedAt);
    return {id: source.id, provider: source.provider, state: 'connected', observed_at: observedAt, ...result};
  } catch (error) {
    return {id: source.id, provider: source.provider, state: 'error', observed_at: observedAt,
      code: error instanceof ConnectorError ? error.code : 'connector_error', http_status: error instanceof ConnectorError ? error.status : null, records: []};
  }
}
export function summary(result) { const {records, ...safe} = result; return {...safe, record_count: records?.length ?? 0}; }
export function canPersist(source) {
  return source.retention_approved === true && present(source.retention_reference)
    && Number.isInteger(source.retention_days) && source.retention_days > 0 && source.retention_days <= 365;
}
