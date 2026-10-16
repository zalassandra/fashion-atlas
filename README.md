# Fashion Atlas

**A living editorial archive of fashion signals.**

Fashion Atlas is an open experiment in making place-specific fashion research legible without reducing places or people to stereotypes. It combines editorial visual studies with evidence, confidence and counterexamples.

## What is here now

- An interactive world-map landing page with six fictional editorial studies.
- Six labelled AI-generated visual studies used as interface artwork, not documentary evidence.
- The original visual-archetype probe: licensed sample imagery, neighbor sheets, robustness tests and provenance.

## What this is not

It does not infer how an individual dresses or shops. The current map points are creative hypotheses, not measured facts about populations or national identities.

## Research direction

The next version can combine independently licensed or partner-provided aggregate signals:

1. Apparel category, price band, channel and purchase cadence by region and period.
2. Consent-based visual panels with clear source and reuse rights.
3. Local editorial and cultural research.
4. A visible evidence card for each conclusion: source, confidence, date and counterexample.

This repository is designed to remain useful even when an initial hypothesis is disproved.

See the [source registry](docs/source-registry.md) for the planned signal layers, cadence and publication rules.

## Local preview

Open `dist/index.html`, or run:

```powershell
py -m http.server 4173 --directory .\dist
```

Then visit `http://127.0.0.1:4173/`.
