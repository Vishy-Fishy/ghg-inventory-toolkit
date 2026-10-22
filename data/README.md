# Data

- `factors.json` – emission factors and constants used by the engine.
- `airports.json` – a small hand-typed set of airport coordinates (latitude, longitude). More are needed.
- `sources.json` – where each group of factors comes from, the licence note, and whether it has been verified. **Nothing is marked verified yet.**

When you add or change a factor, update `sources.json` in the same pull request. Factor sources have their own licences (IPCC, UK Open Government Licence for DEFRA, US federal public domain for EPA, ODbL for OpenFlights, and others). The MIT licence of this repository covers the code, not the underlying factor data.
