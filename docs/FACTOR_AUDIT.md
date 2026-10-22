# Emission factor audit

Checked on 22 October 2026 against primary sources, for use as the data layer of this library and of the planned Python package. The per-factor record is `data/factor_register.csv` (one line per factor: value, unit, source, where in the source, status, previous value, note). Regenerate it with `node scripts/make-register.js` after any change to `data/factors.json`.

Statuses used in the register: **verified** (matches the primary source), **corrected** (was wrong, now fixed), **unverified** (no recorded source or source not reached), **open** (a decision is needed, not just a check).

Result: 370 factors, 144 verified, 11 corrected, 203 unverified, 12 open. A second pass on the same day settled the T&D method, biogenic CO2, the INR/USD constant and the refrigerant leak rates.

## Corrected
| Factor | Was | Now | Why |
|---|---|---|---|
| R12 GWP | 11,200 | 12,500 | AR6 value for CFC-12 |
| R407C GWP | 1,774 | 1,907.9 | Blend computed from AR6 values: 23% R32, 25% R125, 52% R134a |
| R410A GWP | 1,725 | 2,255.5 | Blend computed from AR6 values: 50% R32, 50% R125 |
| Wood office furniture (spend) | 1.24 | 0.24 | EPA NAICS 337211; the old value was a typing error |
| Small petrol car under 800 CC | 0.1093 | 0.111 | India GHG Program road paper |
| Grid electricity | 0.823 (all years from 2023) | CEA all-India weighted average by financial year | See below |
| T&D losses (Category 3) | kWh × 0.1927 × 0.0172 | kWh × 0.1504 × grid factor | Lost electricity is valued at the grid factor (GHG Protocol Scope 3 Standard, Category 3). Default loss share is the national AT&C loss for FY 2024-25 (15.04%); users should enter their distribution company's figure. Option `tdMethod: 'legacy'` reproduces the spreadsheet. |
| Biogenic CO2 (briquettes) | In Scope 1 | Reported separately, outside the scopes | GHG Protocol: biogenic CO2 shall not be included in the scopes. CH4 and N2O still count. Returned by the engine as `biogenic`. |
| INR per USD and INR per EUR | 21.03 (labelled PPP) and 27.311 | 94.47 and 106.13 (market rates) | ECB reference rates for 21 Oct 2026 (1 USD = 94.47 INR = 0.89015 EUR), cross-checked with Google/Morningstar on 22 Oct 2026. The World Bank PPP value for 2022 (20.49) stays in the library as an alternative: pass `inrPerUsd: 20.49`. |
| Leak rate, Refrigeration | 0.5% | 35% | IPCC Table 7.9: medium and large commercial refrigeration is 10 to 35%. Upper end used, as for developing countries. |
| Leak rate, Water coolers | 0.5% | 15% | IPCC Table 7.9: stand-alone commercial is 1 to 15%. |

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
1. **Provenance of 0.823.** Low priority now that the library uses the CEA series. Only matters for comparing with the old spreadsheet.
2. **T&D loss share.** The default (15.04%) is a national figure read from a news report of the Ministry of Power rating report. AT&C loss includes commercial losses, so it is a proxy for physical loss. Check it against the report itself, and use the distribution company's own figure for real inventories. Well-to-tank emissions of generation are not yet added.
3. **Refrigeration equipment type.** The 35% leak rate assumes medium or large commercial refrigeration. If the equipment is industrial refrigeration or cold storage (7 to 25%), a lower value is right. Ask what the equipment is.
4. **Air travel formula.** distance^0.6044 × 1.665 has no recorded derivation. Mumbai to London one way in economy gives about 360 kg CO2, which looks low against published calculators. Best fix is to replace it with the DEFRA passenger-km factors by distance band and class.
5. **Exchange rates are market rates of one day** and the EPA factors are per 2022 US dollar, so the two do not share a price year. Spend-based results scale directly with the rate: with the 2022 PPP factor (20.49) they would be about 4.6 times higher. Record the rate date in every inventory and update the values in `data/factors.json`. The per-EUR transport factors have no recorded source.
6. **EPA factors use AR5 GWPs** while the rest of the library uses AR6. Differences are small for most sectors but should be noted in any paper.
7. **India road factors are CO2 only.** The paper's heavy-duty vehicle figure is also inconsistent (0.7375 in the table, 0.7353 in the worked example).

## Not verified (no source recorded or source not reachable)
- Waste factors (current and pre-2023 tables): need the DEFRA conversion factor files, which are spreadsheets and could not be read from the audit environment. Download the DEFRA flat file for the matching year and add it next to the register.
- Fire extinguisher leak rates (3.5% handheld, 2.5% fixed) and SF6 leak rate (2%).
- Fuel densities and upstream (well-to-tank) factors. Natural gas (2,900 kg/TJ) and CNG (10,000 kg/TJ) differ though both are natural gas.
- Briquette factors, rail factors, water transport per EUR (0.162), NAICS 488390, R600 GWP, road CH4 and N2O factors, food factors, airport coordinates.

## How the audit was done
Only web fetch and search were available, so large PDFs were read in parts and the EPA file was read as a CSV extract. Anything that could not be reached is marked unverified rather than assumed correct. The next pass should be done with the source files downloaded next to the register.
