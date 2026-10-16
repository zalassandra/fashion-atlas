# Connector boundary

Fashion Atlas can ingest four source classes, but a connector is only activated after its access requirements are met. Credentials live in a local `.env`, never in Git.

| Connector | What it can contribute | What it cannot prove on its own | Activation |
| --- | --- | --- | --- |
| Shopify storefront / catalog | authorised product, availability, price, collection and product-media references | that residents of a city own or wear an item | merchant URL plus token or valid tokenless access |
| eBay Browse | listing supply, resale descriptors, item imagery and availability | sales volume or a local fashion norm | eBay developer app and application token; production terms apply |
| Pinterest Trends | regional search-interest trend signal | public visual corpus or user-level purchasing | approved Pinterest app and use within API terms |
| Instagram / Meta | opted-in professional-account media; approved public hashtag media where Meta allows it | a complete, representative city visual panel | Meta app review, permissions and a compliant collection design |

## Location-aware computer vision

Do not build this as a scraper of location pages. The permitted version is a **consented panel**: participating photographers, stores, creators or institutions submit media with city/scene labels and a licence. Vision then writes garment attributes, never identities, and aggregates only above a minimum count. A separate city claim needs multiple sources and editor approval.

Instagram can become one input where Meta's approved access permits it, but the official API targets Professional accounts and does not provide a blanket, stable API for harvesting all posts at a geographic location. Its hashtag flow is a narrower, permissioned route. The first production-quality visual panel should therefore be licensed or opt-in.

## First activation order

1. Connect one friendly Shopify merchant or a public Storefront Catalog and treat it as a product-reference feed.
2. Apply for Pinterest Trends and define approved regional queries.
3. Create an eBay developer sandbox integration, then apply for production only when the browsing experience is ready.
4. Build a small consented visual panel for one city before any wide-scale visual inference.
