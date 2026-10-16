# Consented visual panel

Run `npm start`, then open `http://127.0.0.1:4180/contribute.html`. No dependencies need installing. The server listens only on loopback. This is a local research intake, not a publicly deployed upload service.

The form receives an original JPEG, PNG or WebP (up to 8 MB), city, scene, capture date, source link, independent publisher/collection, rights holder, license and garment tags. Rights and subject permission must be confirmed. Analysis and future display are separate opt-ins. Written permission needs a document reference. Do not submit private correspondence, personal contact details or minors' photographs.

Submissions are stored in ignored `.private/visual-panel/`, outside `dist`. They start pending. The receipt contains a withdrawal key, shown once; the store retains only its hash. Exact duplicate image bytes are rejected. No image URL is fetched from an arbitrary website.

The editorial desk needs the ephemeral editor key printed in the local server terminal. The reviewer checks provenance, permissions and independent-source grouping before approval. Approval contributes to permitted aggregates; it never publishes the original. Three distinct approved source groups must contribute the same garment tag in the same city, scene and calendar month before that cell is visible. Repeated images from one source do not establish independence. These are convenience-panel observations, not population prevalence.

Withdrawal deletes the local original and contribution metadata and removes it from subsequent aggregates. A minimal hash tombstone prevents re-submission. Owners must remove private backup copies separately. Display-only contributions never enter analysis aggregates.

Clothing tags are supplied by contributors and reviewed by an editor. **Automatic computer vision is not running.** The next research step is to compare garment-only model suggestions with these reviewed labels. Existing model-probe results do not justify automatically naming city archetypes.

Before public hosting, implement production authentication, storage/backups with deletion propagation, abuse limits, operational monitoring, an actual privacy notice and contributor agreements. Keep the current loopback boundary until those are implemented.

Tests use fictional metadata and synthetic byte fixtures in temporary directories. They cover consent, duplicates, atomic intake, withdrawal, source thresholds, origin checks and protected review routes.
