# GHG Inventory Toolkit
[![CI](https://github.com/Vishy-Fishy/ghg-inventory-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/Vishy-Fishy/ghg-inventory-toolkit/actions/workflows/ci.yml) [![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

An open-source calculator for greenhouse gas inventories (Scope 1, 2 and 3), built for organisations in India. You download an Excel template, fill it in, upload it, and get totals with drill-down by scope, category and individual entry. Results export as an Excel summary, a CSV, or a printable report.

Everything runs in your browser. Your data is not sent anywhere.

> **Status: early development (v0.1).** The calculation engine reproduces the spreadsheet it was built from, and a first audit of the emission factors against primary sources has been done (`docs/FACTOR_AUDIT.md`, `data/factor_register.csv`). 144 of 370 factors are verified, 11 were corrected or had their method changed, and the rest are still marked unverified. Treat results as estimates until the open items are closed.

## What it does

- **Overview.** Total tCO₂e for a financial or calendar year, with a bar showing the split by scope. Click a scope to go deeper.
- **Scope pages and category pages.** From scope, to category (stationary combustion, refrigerants, purchased electricity, purchased goods, waste, travel and so on), down to each row you entered.
- **Template in, results out.** One Excel template with dropdowns for every list field (fuels, vehicles, refrigerants, airports). Upload the filled file and everything is calculated.
- **Honest about bad rows.** A row that cannot be calculated (missing quantity, unknown category, unit that does not fit) is excluded and listed with its sheet and row number. It is never counted as zero silently.
- **Export.** Excel summary (live formulas, monthly table, every entry, data quality, method and sources), CSV of entries, and a print-ready report.

Categories covered: stationary combustion, refrigerant leaks, fire extinguishers, SF₆ circuit breakers, owned vehicles and machinery, purchased electricity (location-based), purchased and capital goods, fuel- and energy-related activities, upstream transport, waste, business travel (road and air), employee commuting, and food.

Not yet covered: downstream transport and leased assets, renewable energy and market-based Scope 2, biogenic emissions, and the other Scope 3 categories. See `docs/ROADMAP.md`.

## Try it
Use the hosted copy at https://vishy-fishy.github.io/ghg-inventory-toolkit/, or open `dist/index.html` in a browser after building (below). Click **Explore with sample data** to see it with a made-up organisation, or download a template from the first page.

## Develop

Needs Node 20 or newer.

```
npm install
npm test          # unit tests, hand-calculated checks and regression tests
npm run build     # writes dist/index.html, one self-contained file
npm run e2e       # optional browser test of export and report (needs Playwright's Chromium)
```

## How it is organised

```
src/engine.js     calculation engine: pure functions, no browser needed
src/schema.js     input tables, dropdown lists, template builder and reader
src/export.js     summaries, Excel summary and CSV
src/sample.js     synthetic example inputs (no real organisation)
src/app.js        the dashboard
data/             emission factors, airports and the source of each factor
examples/         synthetic template and sample inputs
tests/            tests and fixtures
docs/             method, known issues, roadmap
```

The engine does not touch the page, so it can be reused from Node or another front end.

## Documentation

- `docs/METHOD.md` – how each category is calculated.
- `docs/KNOWN_ISSUES.md` – problems found in the original spreadsheet and how this tool handles them, plus open items.
- `docs/ROADMAP.md` – what is planned.
- `data/README.md` – emission factor sources and licences.
- `AI_USAGE.md` – how AI assistance was used and how the work was reviewed.

## Citing

See `CITATION.cff`.

## Contributing

Issues and pull requests are welcome. See `CONTRIBUTING.md`. Please never include real organisation data in an issue or pull request.

## Licence

Code is released under the MIT licence (`LICENSE`). Emission factor data comes from third-party sources and stays under their terms (`data/sources.json`).
