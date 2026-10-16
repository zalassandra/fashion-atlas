# Connecting sources

Last verified: 2026-10-16. Provider access, data rights and actual live connection are separate states.

## Live original product photography — working

`GET /api/catalog?edit=fogline-utility` queries Shopify Global Catalog for four curated object categories. `lib/catalog-route.mjs` supplies only available listings with HTTPS media and merchant URLs. Photo, title and destination stay associated with the same variant. Partial upstream failures preserve independent successful cards. No API response or product image is written to disk.

The project publishes its own catalog-only UCP capability profile in `config/agent-profile.json`. The default profile URL is pinned to a GitHub commit through a JSON-serving CDN. Direct GitHub raw returned `text/plain`, which Shopify rejected; the JSON-serving URL passed a live test. `SHOPIFY_AGENT_PROFILE_URL` can override it with your own HTTPS JSON host. This profile contains no credentials, cart, checkout or payment capability.

Verified live: four listings, original photos and linked sellers for Salomon XT-6, Arc'teryx Beta, Peak Design Everyday Backpack and Timbuk2 backpack. This is a curatorial selection, not a claim about San Francisco prevalence.

Shopify's [Catalog documentation](https://shopify.dev/docs/agents/catalog) permits keyless profile-based discovery, requires images to accompany their related merchant listings and prohibits caching search results and images. The [profile guide](https://shopify.dev/docs/agents/get-started/profile) describes publishing your own capability document. This live commerce view is deliberately excluded from the longitudinal research pipeline.

## Open metadata watch — working

The `commons-street-fashion` source is enabled by default. It reads one bounded page from the official Wikimedia Commons Action API, ordered by category-addition time. It accepts records with an explicit supported CC license and license URL and retains title, source, photographer, upload timestamp and license. It downloads no images and copies no free-text descriptions. First live run: 11 accepted metadata candidates with a requested page limit of 12, with more pages available. This is a source-discovery baseline, not a new-style detection result.

Run `node scripts/connectors.mjs collect --source commons-street-fashion`. Results go to the ignored connector-run directory with a 30-day retention policy. An editor must check relevance and provenance before any image reuse or city claim. See [MediaWiki category API](https://www.mediawiki.org/wiki/API:Categorymembers), [image metadata API](https://www.mediawiki.org/wiki/API:Imageinfo) and [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).

## Account-authorized research connectors — implemented, awaiting account access

Copy `.env.example` → `.env` and `config/sources.example.json` → `config/sources.local.json`. Both populated files are ignored by Git. Set an `access_reference` documenting the grant and `enabled: true` only for a permitted source. References must be agreement IDs, not secrets.

| Source | Configure | What the client actually reads |
| --- | --- | --- |
| Shopify Storefront | Merchant domain; tokenless/public/private mode; merchant-issued token when needed; API version | First bounded page of titles, vendor, available flag, minimum price, original featured media and listing URL |
| eBay Browse | Application token or developer client ID + secret; sandbox/production; marketplace; production access confirmation | First bounded search page; listing supply, media and seller geography. Seller location is not buyer location; sandbox results are not market evidence |
| Pinterest Trends | Approved app OAuth token, Trends access confirmation, supported region and trend type | Regional keyword rank, growth and relative weekly interest; not images, city purchases or clothing prevalence |
| Instagram Login | Opted-in Professional account ID and token, API version, participant consent reference and declared city | That account's media only; carousel cover or video thumbnail. City is participant-declared and unverified. No location-page scraper |

Account-authorized examples intentionally ship disabled. A token alone does not prove usage or retention rights. Confirm provider scopes and terms for the intended account. Useful entry points: [eBay developer portal](https://developer.ebay.com/), [Pinterest developers](https://developers.pinterest.com/), [Instagram platform](https://developers.facebook.com/docs/instagram-platform/), [Shopify Storefront API](https://shopify.dev/docs/api/storefront).

```sh
node --env-file-if-exists=.env scripts/connectors.mjs status
node --env-file=.env scripts/connectors.mjs probe --source pinterest-us-interest
node --env-file=.env scripts/connectors.mjs collect --source shopify-partner-catalog
```

`status` does not request data. `probe` performs a bounded read and prints only counts/status, never credentials or raw provider responses. `collect` also needs `retention_approved: true`, `retention_reference` and `retention_days` (1–365). It writes normalized unreviewed records only to ignored `.local/connector-runs/`; no record automatically becomes a public snapshot. Keep retention approval specific to the API and use. This does not permit persisting Global Catalog search results.

Requests have timeouts, response limits and sanitized errors. Mock HTTP tests exercise each client's authentication and normalization. The Global Catalog live edit and Commons metadata source have been verified with actual service responses in this workspace. Creating provider apps, granting permissions and obtaining production approvals still requires the account owner; no approvals have been submitted or invented.

`node scripts/connectors.mjs purge` deletes expired collector artifacts from its private output folder; `collect` runs the same expiry cleanup first. The weekly watch also runs it. Cleanup runs when invoked, not as an always-on daemon. Retention deadlines still need an operational scheduler before production collection is enabled; archive permissions must cover the actual cadence.
