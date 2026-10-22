# Emission factor audit

Checked on 22 October 2026 against primary sources, for use as the data layer of this library and of the planned Python package. The per-factor record is `data/factor_register.csv` (one line per factor: value, unit, source, where in the source, status, previous value, note). Regenerate it with `node scripts/make-register.js` after any change to `data/factors.json`.

Statuses used in the register: **verified** (matches the primary source), **corrected** (was wrong, now fixed), **unverified** (no recorded source or source not reached), **open** (a decision is needed, not just a check).

Result: 367 factors, 137 verified, 5 corrected, 213 unverified, 12 open.

## Corrected
| Factor | Was | Now | Why |
|---|---|---|---|
| R12 GWP | 11,200 | 12,500 | AR6 value for CFC-12 |
| R407C GWP | 1,774 | 1,907.9 | Blend computed from AR6 values: 23% R32, 25% R125, 52% R134a |
| R410A GWP | 1,725 | 2,255.5 | Blend computed from AR6 values: 50% R32, 50% R125 |
| Wood office furniture (spend) | 1.24 | 0.24 | EPA NAICS 337211; the old value was a typing error |
| Small petrol car under 800 CC | 0.1093 | 0.111 | India GHG Program road paper |
| Grid electricity | 0.823 (all years from 2023) | CEA all-India weighted average by financial year | See below |

## Grid electricity
The spreadsheet used 0.815 for 2022 and 0.823 for every later year. No published CEA all-India series contains these numbers. The library now uses the CEA CO2 Baseline Database (v20.0 and v21.0), all-India weighted average including renewables, by financial year:

FY 2013-14 0.774, 2014-15 0.779, 2015-16 0.774, 2016-17 0.770, 2017-18 0.754, 2018-19 0.744, 2019-20 0.713, 2020-21 0.703, 2021-22 0.715, 2022-23 0.716, 2023-24 0.727, 2024-25 0.710 (kg CO2/kWh).

For a financial year CEA has not yet published, the engine uses the latest published value and reports a warning. Passing `gridSet: 'legacy'` reproduces the spreadsheet. On the sample data, Scope 2 is about 12% lower than with 0.823.

## Verified
- GWPs: CH4 29.8, N2O 273, all refrigerants except R600, SF6 (23,500 AR5, 24,300 AR6). Source: GHG Protocol GWP table, August 2024.
- Fuels (Diesel, Petrol, LPG, Natural Gas, CNG, Coal): CO2, CH4, N2O and heat values against IPCC 2006 Vol 2 Tables 1.2, 1.4, 2.4.
- Road fuel CO2 and heat values against IPCC 2006 Vol 2 Tables 1.2 and 1.4.
- Vehicle factors (55 of 56) and mileage values against the India GHG Program road transport paper.
- Spend-based factors against EPA Supply Chain GHG Emission Factors v1.3 (NAICS-6, 2022 USD, with margins).

## Open: needs a decision or a source
1. **Provenance of 0.823.** Ask whoever built the spreadsheet where it came from. It may be a regional figure or an older edition.
2. **Transmission and distribution losses.** The spreadsheet computes kWh × 0.1927 × 0.0172. The 0.0172 is labelled "upstream electricity EF" and neither number has a source. The usual method for lost electricity is loss share × grid factor (about 0.7 kg/kWh), which is roughly 40 times larger. The same sheet lists a distributor loss of 14.72%. The library keeps the spreadsheet method for now and flags it. Pick a method and a source before relying on Category 3 electricity.
3. **Biogenic CO2 from briquettes.** Counted in Scope 1 in the spreadsheet. Under the GHG Protocol it is reported separately, outside the scopes.
4. **Air travel formula.** distance^0.6044 × 1.665 has no recorded derivation. Mumbai to London one way in economy gives about 360 kg CO2, which looks low against published calculators.
5. **Spend-to-USD and spend-to-EUR constants** (21.03 and 27.311): no source or price year. EPA factors are in 2022 US dollars, so the conversion year matters.
6. **EPA factors use AR5 GWPs** while the rest of the library uses AR6. Differences are small for most sectors but should be noted in any paper.
7. **India road factors are CO2 only.** The paper's heavy-duty vehicle figure is also inconsistent (0.7375 in the table, 0.7353 in the worked example).

## Not verified (no source recorded or source not reachable)
- Waste factors (current and pre-2023 tables): need the DEFRA conversion factor files.
- Refrigerant and equipment leak rates and typical charges. "Refrigeration 0.5%" looks low. Compare with IPCC 2006 Vol 3 Table 7.9.
- Fire extinguisher leak rates (3.5% handheld, 2.5% fixed) and SF6 leak rate (2%).
- Fuel densities and upstream (well-to-tank) factors. Natural gas (2,900 kg/TJ) and CNG (10,000 kg/TJ) differ though both are natural gas.
- Briquette factors, rail factors, water transport per EUR (0.162), NAICS 488390, R600 GWP, road CH4 and N2O factors, food factors, airport coordinates.

## How the audit was done
Only web fetch and search were available, so large PDFs were read in parts and the EPA file was read as a CSV extract. Anything that could not be reached is marked unverified rather than assumed correct. The next pass should be done with the source files downloaded next to the register.
