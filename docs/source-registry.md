# Fashion Atlas source registry

This file records prospective inputs before they are used in a study. A source is not evidence until it has a defined licence, geographic scope, collection date, retention rule and known limitations.

## Cadence

The first useful cadence is a **monthly snapshot**, supplemented by a weekly watchlist for fast-moving signals. The Atlas should store a dated observation, not claim continuous real-time knowledge.

## Candidate inputs

| Layer | Candidate input | What it can contribute | Status |
| --- | --- | --- | --- |
| Visual | Commissioned or explicitly licensed street-fashion photography | Documented silhouettes and styling details | Not connected |
| Trend | Pinterest Trends API, where terms and access allow | Regional keyword movement | Not connected |
| Commerce | Partner or merchant product feeds | Product availability, price, taxonomy and newness | Not connected |
| Commerce | Shopify Storefront Catalogs from participating stores | Product images, collections, availability and outbound product URLs | Not connected |
| Resale | eBay Browse API | Searchable listings and secondary-market availability | Not connected |
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
