# Method

All results are in kg CO₂e internally and shown in tonnes. Gases are combined with the IPCC AR6 100-year GWPs: CH₄ = 29.8, N₂O = 273.

This page describes what `src/engine.js` does. Factor values are in `data/factors.json`; where each comes from is in `data/sources.json`.

## Scope 1
**Stationary combustion.** Quantity (converted to the unit the factor uses: tonne, litre or m³) × (CO₂ + CH₄ × 29.8 + N₂O × 273). Quantities in kg, tonnes, litres, SCM or LPG cylinders (19 kg) are accepted where they make sense for the fuel.

**Refrigerant leaks.** If the equipment charge is known: charge (kg) × number of units × leak rate for that equipment type × (days per month × hours per day) ÷ (30 × 24) × GWP of the refrigerant. If the charge is blank, the refilled quantity (kg) is taken as the leak. If both are given, the charge-based estimate is used and a warning is shown.

**Fire extinguishers.** GWP × (units used × kg per unit + (total units − units used) × leak rate × kg per unit). Leak rate is 3.5% for handheld and 2.5% for fixed. Only CO₂ extinguishers count; foam and dry powder have no GWP.

**SF₆ circuit breakers.** Gas leaked in the reporting year = kg × number of breakers × ((1 − 2%)^age − (1 − 2%)^(age + 1)), where age is the financial year of the entry minus the installation year. Multiplied by the GWP of SF₆ (23,500 up to 2022, 24,300 from 2023). Breakers without fluorinated gas count as zero.

**Biogenic CO₂.** Fuels of biological origin (briquettes) have their CO₂ reported separately in the `biogenic` result and left out of every scope, as the GHG Protocol requires. Their CH₄ and N₂O are still counted in Scope 1.

**Owned vehicles and machinery.** If a vehicle type and distance are given: distance × the vehicle's kg CO₂/km factor. Otherwise from fuel: litres × density ÷ 10⁶ × heat value × (CO₂ + CH₄ × 29.8 + N₂O × 273 per TJ).

## Scope 2
**Purchased electricity** (location-based). kWh × the CEA all-India weighted-average grid factor for the financial year of the entry (`data/factors.json`, `grid.cea_all_india_fy`). If CEA has not yet published that year, the latest published value is used and a warning is shown. The option `gridSet: 'legacy'` uses the calendar-year values of the original spreadsheet (0.815 for 2022, 0.823 later), which match no CEA series.

## Scope 3
**C1 Purchased goods and C2 Capital goods** (spend-based). Cost in INR ÷ INR per USD (market rate of 21 Oct 2026, 94.47; override with `inrPerUsd`, for example 20.49 for the World Bank 2022 purchasing-power factor) × supply-chain emission factor for the spend category (kg CO₂e per USD).

**C3 Fuel- and energy-related activities.** (a) Upstream of fuels: fuel mass × heat value × upstream factor (kg/TJ). (b) Electricity transmission and distribution losses: kWh × loss share × the grid factor of the same financial year (lost electricity is valued like the electricity itself, GHG Protocol Scope 3 Standard, Category 3). The default loss share is 15.04%, the national AT&C loss for FY 2024-25. Pass `tdLoss` to use your distribution company's figure, or `tdMethod: 'legacy'` for the original spreadsheet calculation.

**C4 Upstream transport** of purchased and capital goods. Transport spend in INR ÷ INR per EUR (market rate of 21 Oct 2026, 106.13; override with `inrPerEur`) × factor for the mode (road, rail, sea, air).

**C5 Waste.** Tonnes × disposal factor for the material and method (for entries up to 2022 an older table is used), plus transport of the waste by LDV, MDV or HDV if a distance is given.

**C6 Business travel.** Road: as for owned vehicles. Air: great-circle distance between two airports; emissions = distance^0.6044 × 1.665 per passenger, doubled for a round trip, and doubled again for business class on flights over 3,000 km.

**C7 Employee commuting.** As for road travel, by vehicle type and distance, or by fuel.

**Food consumption.** kg of food × factor per kg (vegetarian or non-vegetarian).

## Periods
Financial year runs April to March and is labelled by its starting year (FY 2025-26 starts April 2025). Calendar-year view is also available. Intensity per employee and per m² is computed when employee counts or site area are supplied to the engine (not yet in the template).

## Data quality
The engine returns an `issues` list. Level `error` means the row was excluded; level `warn` means it was calculated but needs a look (for example a number typed as text). Both are shown in the app and in every export.
