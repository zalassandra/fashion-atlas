# Fashion Atlas

**A living editorial archive of fashion signals.**

An interactive fashion gallery exploring the relationship between place, clothes and cultural context. Enter through an editorial world map; open a visual study, shop its material vocabulary, inspect the evidence, or contribute a field note.

## Run the Atlas

Requires Node.js 22.9 or newer. No external packages or API key are needed for the gallery and live shopping preview.

```sh
git clone https://github.com/zalassandra/fashion-atlas.git
cd fashion-atlas
node --env-file-if-exists=.env scripts/panel-server.mjs
```

Open **http://127.0.0.1:4180/**. Enter **Fogline Utility → Shop the edit** for original merchant photographs. The server must be running: opening the HTML file directly shows the editorial archive but cannot query the catalog or receive contributions.

## Working now

- Six interactive editorial territories, with clearly labelled AI study images and an evidence ledger. These are creative hypotheses, not measurements of local populations.
- A live **curatorial shopping edit** for Fogline Utility: trail shoes, weather layers and bags. Actual merchant photographs link to the exact associated listing. Shopify Catalog is queried on demand using the project's published UCP profile. Catalog responses and images are not archived, trained on or used as historical signals.
- A local **consented visual panel**: image intake, provenance, separate permissions, private review queue, withdrawal and source-thresholded garment aggregates. Tags are contributor-supplied and editor-reviewed; automated computer vision is not running.
- API clients for merchant-authorized Shopify Storefront feeds, eBay Browse, approved Pinterest Trends and opted-in Instagram professional accounts. They report `needs_setup` until their access requirements are present. No credentials or private submissions belong in this repository.
- The initial SigLIP2 / DINOv3 / FashionCLIP visual probe, its neighbor sheets, nuisance tests and attribution ledger.
- A live Commons metadata watch: the first run collected 11 licensed candidates into a private research queue. It records source and attribution, without downloading photographs or treating category updates as emerging trends.

## Source activation

The live Shopify Catalog edit works independently of a merchant Storefront integration. eBay, Pinterest and Instagram are **not connected to user accounts yet**. Their clients have mock-based tests, not verified production access.

The Commons metadata source is enabled without a key. Run `node scripts/connectors.mjs collect --source commons-street-fashion` to append a private dated batch. Git must be available for the output-ignore check.

Copy `.env.example` to `.env`, and `config/sources.example.json` to `config/sources.local.json`. Add credentials locally and enable only sources for which access is authorized. Do not paste tokens into issues or chat. Run:

```sh
npm run sources
node --env-file=.env scripts/connectors.mjs probe --source ebay-trail-runners
```

[Connector setup](docs/connectors.md) · [Visual panel](docs/visual-panel.md) · [Source registry](docs/source-registry.md)

## Research boundary

The first convenience sample did **not** establish a usable, general style space. Source collection and scene strongly influence visual similarity. AI illustrations are an interface and proposition; they are not documentary evidence. Merchant availability is not local purchase or wearing prevalence. A future city claim needs independent licensed signals, counterexamples and editorial review.

The weekly watch is a local Codex automation in the owner's workspace, not an always-on service deployed by this repository. It can inspect authorized feeds and maintain dated research notes when the app runs. Monthly synthesis is conditional on sufficient permitted evidence. Shopify live-search results must never be added to historical snapshots.

## Check the project

```sh
node --test --test-isolation=none tests/*.test.mjs
node scripts/validate-snapshot.mjs
```

The intake server binds to `127.0.0.1`. Public deployment of uploads requires production authentication, storage and operational controls; see the panel document. GitHub publication does not deploy the dynamic server.

## Image rights

AI editorial studies are labelled in the interface. Live product photography remains with its respective rights holders and is rendered only beside its associated merchant listing. The Wikimedia research sample has per-image attribution and license links in [the manifest](dist/evidence/attribution_manifest.csv). Each photograph and derivative retains its stated license; there is no blanket license over third-party media. See [research media notes](dist/evidence/README.md).
