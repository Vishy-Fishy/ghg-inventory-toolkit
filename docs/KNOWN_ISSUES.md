# Known issues

## Found in the original spreadsheet and handled here
This tool began as a re-implementation of an Excel toolkit. Comparing the two month by month found three defects in the spreadsheet. The engine behaves correctly in each case and `tests/engine.test.js` has a regression test for each.

1. **Upstream emissions of fuels measured per tonne were 1000× too small.** Quantities in tonnes were treated as kilograms in the upstream calculation. Affects LPG, coal and briquette.
2. **One bad row blanked a whole month.** An error in any row of a month (for example a cost typed as text, or a row with no category) turned the month's total into an error, which a wrapper then displayed as blank. Here, only the bad row is excluded, and it is listed with its sheet and row.
3. **A trailing space in a material name made its waste factor silently zero.** Lookups here ignore leading and trailing spaces, and the factor table has been cleaned.

## Emission factors
A first audit against primary sources was done on 22 October 2026. See `docs/FACTOR_AUDIT.md` and `data/factor_register.csv`. Ten factors or methods were corrected: refrigerant GWPs, wood furniture, one car factor, the grid factor (CEA by financial year), the T&D method, biogenic CO2, exchange rates and two leak rates.

## Open items
- **Grid factor provenance.** The spreadsheet's 0.823 matches no published CEA series. Kept only as the `legacy` option.
- **T&D loss share** is a national proxy (AT&C 15.04%, FY 2024-25). Use your distribution company's figure.
- **203 of 370 factors are still unverified**: waste (needs DEFRA files), fire and SF6 leak rates, upstream fuel factors, fuel densities, food, rail, the per-EUR transport factors and the air-travel formula. See `data/factor_register.csv`.
- **Exchange rates** are the market rates of 21-22 Oct 2026 (94.47 INR per USD, 106.13 INR per EUR). EPA factors are per 2022 USD, so the price years differ. Update `data/factors.json` for each inventory. The 2022 PPP factor is available as an option.
- **A few constants are written into the engine** rather than the factor library (diesel properties used for waste transport, road-fuel gas factors). They should move to `data/factors.json` with sources.
- **Missing categories:** downstream transport, leased assets, renewable energy and market-based Scope 2, biogenic emissions, other Scope 3 categories.
- **Upload limits:** the template reader matches sheets by name, so renaming sheets breaks the import.
