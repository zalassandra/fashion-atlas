# Fashion Atlas source registry

This file records prospective inputs before they are used in a study. A source is not evidence until it has a defined licence, geographic scope, collection date, retention rule and known limitations.

## Cadence

The first useful cadence is a **monthly snapshot**, supplemented by a weekly watchlist for fast-moving signals. The Atlas should store a dated observation, not claim continuous real-time knowledge.

## Connection state — 2026-10-16

| Layer | Candidate input | What it can contribute | Status |
| --- | --- | --- | --- |
| Visual | Consented visual panel | Garment tags and documented context | Working local intake + private review; no contributors collected, no automatic vision |
| Visual discovery | Wikimedia Commons category metadata | CC-licensed candidate references with source and attribution | Live collection verified: 11 candidates in first private batch; no image downloads or city inference |
| Trend | Pinterest Trends API | Regional keyword movement | Client implemented; token and approved access missing |
| Commerce | Shopify Global Catalog | Live merchant photographs and listings | Live tested with Fashion Atlas UCP profile; display-only, no result or image caching |
| Commerce | Shopify Storefront from participating stores | Product availability, price and media references | Client implemented; authorized merchant configuration missing |
| Resale | eBay Browse API | Listings and secondary-market availability | Client implemented; application credentials and production access missing |
| Visual | Instagram opted-in Professional account | Participant-declared visual context | Client implemented; account token and participant consent missing |
| Context | Local fashion calendars, music/event listings and editorial research | Context for interpretation and counterexamples | Manual research |

## Every stored signal requires

```text
observed_at
source_name
source_url_or_id
licence_or_terms_reference
geographic_scope
signal_type
attribute_tags
confidence
limitations
human_editor_note
```

## Retail links

Retail objects can appear in a study only when their image and outbound link come from an authorised merchant or affiliate/product-feed relationship. They must be labelled as an **object reference** or **available product**, not as proof that a city wears the product. Affiliate disclosure is required wherever a paid relationship exists.

## Human judgment layer

The judgment layer may propose a new silhouette or an evolving signal, but it cannot publish a claim automatically. A human editor must review provenance, regional relevance, counterexamples and wording before a study changes state from `hypothesis` to `supported`.

## Storage boundaries

Shopify Global Catalog search results are transient commerce UI only. Never put them, their images or a derived historical archive into `data/snapshots`. Other API data needs an explicit, source-specific retention grant before `collect` writes to ignored `.local/connector-runs`. Private submissions remain in `.private/visual-panel`, never in Git or the static website. Only reviewed, permitted aggregates can become public snapshots.

The weekly automation is configured in the owner's Codex app. It is not a continuously deployed collector, and it cannot activate provider accounts or manufacture a new observation when no source is connected.
