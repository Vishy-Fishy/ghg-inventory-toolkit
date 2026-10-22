# Known issues

## Found in the original spreadsheet and handled here
This tool began as a re-implementation of an Excel toolkit. Comparing the two month by month found three defects in the spreadsheet. The engine behaves correctly in each case and `tests/engine.test.js` has a regression test for each.

1. **Upstream emissions of fuels measured per tonne were 1000× too small.** Quantities in tonnes were treated as kilograms in the upstream calculation. Affects LPG, coal and briquette.
2. **One bad row blanked a whole month.** An error in any row of a month (for example a cost typed as text, or a row with no category) turned the month's total into an error, which a wrapper then displayed as blank. Here, only the bad row is excluded, and it is listed with its sheet and row.
3. **A trailing space in a material name made its waste factor silently zero.** Lookups here ignore leading and trailing spaces, and the factor table has been cleaned.

## Emission factors
A first audit against primary sources was done on 22 October 2026. See `docs/FACTOR_AUDIT.md` and `data/factor_register.csv`. Five factors were corrected and the grid factor now follows the CEA series by financial year.

## Open items
- **Grid factor provenance.** The spreadsheet's 0.823 matches no published CEA series. Kept only as the `legacy` option.
- **Transmission and distribution losses.** The method (kWh × 0.1927 × 0.0172) is unsourced and probably far too small. Needs a decision.
- **Biogenic CO2** from briquettes is counted in Scope 1; normally it is reported separately.
- **213 of 367 factors are still unverified**, including waste (needs DEFRA files), leak rates, upstream fuel factors, food, rail and the air-travel formula.
- **Spend-based conversion constants** (INR per USD at purchasing-power parity, INR per EUR) have no documented source or price year.
- **A few constants are written into the engine** rather than the factor library (diesel properties used for waste transport, road-fuel gas factors). They should move to `data/factors.json` with sources.
- **Missing categories:** downstream transport, leased assets, renewable energy and market-based Scope 2, biogenic emissions, other Scope 3 categories.
- **Upload limits:** the template reader matches sheets by name, so renaming sheets breaks the import.
