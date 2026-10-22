#!/usr/bin/env node
/* Builds data/factor_register.csv: one line per emission factor with its source and checking status.
 * Values come from data/factors.json, so the register cannot drift from what the engine uses.
 * The checking results live in this file (CHECKED, CORRECTED, NOTES). Update them when you verify a factor.
 * Usage: node scripts/make-register.js */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const F = JSON.parse(fs.readFileSync(path.join(root, 'data/factors.json'), 'utf8'));
const AIR = JSON.parse(fs.readFileSync(path.join(root, 'data/airports.json'), 'utf8'));
const CHECKED_ON = '2026-10-22';

const rows = [];
function add(group, name, value, unit, source, locator, status, note, previous) {
  rows.push({ group, name, value, unit, source_id: source, locator: locator || '', status, checked_on: status === 'verified' || status === 'corrected' ? CHECKED_ON : '', previous_value: previous === undefined ? '' : previous, note: note || '' });
}

/* ---- global warming potentials */
add('gwp', 'CH4 (fossil)', 29.8, 'kg CO2e per kg', 'ipcc-ar6-gwp', 'GHG Protocol GWP table (Aug 2024), AR6 column', 'verified');
add('gwp', 'N2O', 273, 'kg CO2e per kg', 'ipcc-ar6-gwp', 'GHG Protocol GWP table (Aug 2024), AR6 column', 'verified');
const gwpPrev = { R12: 11200, R407C: 1774, R410A: 1725 };
const gwpNote = { R12: 'AR6 value for CFC-12 is 12,500 (AR5 10,200). The old 11,200 matches neither.', R407C: 'AR6 does not list blends. Computed as 23% R32 + 25% R125 + 52% R134a by mass with AR6 values. The old 1,774 came from AR4 values.', R410A: 'AR6 does not list blends. Computed as 50% R32 + 50% R125 by mass with AR6 values. The old 1,725 came from the IPCC Second Assessment values.', R600: 'Not in the GHG Protocol table. Check against IPCC AR6 Table 7.SM.7.' };
Object.keys(F.gwp_refrigerant).forEach((k) => {
  const st = gwpPrev[k] ? 'corrected' : (k === 'R600' ? 'unverified' : 'verified');
  add('gwp_refrigerant', k, F.gwp_refrigerant[k], 'kg CO2e per kg', 'ipcc-ar6-gwp', 'GHG Protocol GWP table (Aug 2024), AR6 column', st, gwpNote[k], gwpPrev[k]);
});
add('sf6_gwp', 'up to 2022', F.sf6_gwp['2022'], 'kg CO2e per kg', 'ipcc-ar6-gwp', 'GHG Protocol GWP table, AR5 column', 'verified', 'AR5 value, used for reporting years up to 2022.');
add('sf6_gwp', '2023 onward', F.sf6_gwp['2023+'], 'kg CO2e per kg', 'ipcc-ar6-gwp', 'GHG Protocol GWP table, AR6 column', 'verified');

/* ---- fuels */
Object.keys(F.fuels).forEach((k) => {
  const f = F.fuels[k], bio = k === 'Briquette';
  const bioNote = 'Biomass fuel: CO2 is biogenic, so the engine reports it separately and leaves it out of Scope 1 (GHG Protocol Scope 3 Standard). The original spreadsheet counted it in Scope 1. CH4 and N2O still count.';
  const ipccOk = ['Diesel', 'Petrol', 'LPG', 'Natural Gas', 'CNG', 'Coal'].indexOf(k) >= 0;
  const st = ipccOk ? 'verified' : 'unverified';
  const loc = { Diesel: 'Gas/Diesel Oil: Tables 1.2, 1.4, 2.4 (commercial/institutional)', Petrol: 'Motor Gasoline: Tables 1.2, 1.4, 2.4', LPG: 'Liquefied Petroleum Gases: Tables 1.2, 1.4, 2.4', 'Natural Gas': 'Natural Gas: Tables 1.2, 1.4, 2.4', CNG: 'Natural Gas: Tables 1.2, 1.4, 2.4', Coal: 'Sub-Bituminous Coal: Tables 1.2, 1.4, 2.4', Briquette: 'Looks like IPCC "other primary solid biomass" (CO2 100,000 kg/TJ, NCV 11.6). Not checked.' }[k];
  
  ['co2', 'ch4', 'n2o'].forEach((g) => add('fuel', k + ' ' + g.toUpperCase(), f[g], f.unit.replace('kg/', 'kg per ').replace(' ', ''), 'ipcc-stationary', loc, st, bio && g === 'co2' ? bioNote : (g !== 'co2' && ipccOk ? 'Emission factor is the commercial/institutional default, converted to a per-unit basis with the net calorific value and density.' : '')));
  add('fuel', k + ' heat value', f.heat_TJ_per_Gg, 'TJ/Gg', 'ipcc-stationary', loc, st, k === 'Coal' ? 'IPCC default for sub-bituminous coal. Indian coal usually differs; use measured NCV if known.' : '');
  const dens = { Diesel: 0.84, Petrol: 0.74, 'Natural Gas': 0.7, CNG: 0.7 }[k];
  if (dens !== undefined) add('fuel', k + ' density', f.density, k === 'Natural Gas' || k === 'CNG' ? 'kg/m3' : 'kg/litre', 'none', '', 'unverified', 'Assumed density. No source recorded in the original spreadsheet.');
  add('fuel', k + ' upstream (well-to-tank)', f.upstream_kg_per_TJ, 'kg CO2e per TJ', 'none', '', 'unverified', 'No source recorded. Natural gas (2,900) and CNG (10,000) differ although both are natural gas.');
});

/* ---- road fuels (owned vehicles and machinery, business travel and commuting by fuel) */
Object.keys(F.road_fuel).forEach((k) => {
  const f = F.road_fuel[k];
  const co2src = { Diesel: 74100, Petrol: 69300, CNG: 56100, LPG: 63100 }[k];
  add('road_fuel', k + ' CO2', f.co2, 'kg/TJ', 'ipcc-mobile', 'IPCC 2006 Vol 2 Table 1.4', co2src === f.co2 ? 'verified' : 'unverified');
  add('road_fuel', k + ' CH4', f.ch4, 'kg/TJ', 'ipcc-mobile', 'IPCC 2006 Vol 2 Ch 3 (road transport)', 'unverified', 'Not fetched in this check.');
  add('road_fuel', k + ' N2O', f.n2o, 'kg/TJ', 'ipcc-mobile', 'IPCC 2006 Vol 2 Ch 3 (road transport)', 'unverified', 'Not fetched in this check.');
  const ncv = { Diesel: 43, Petrol: 44.3, CNG: 48, LPG: 47.3 }[k];
  add('road_fuel', k + ' heat value', f.heat, 'TJ/Gg', 'ipcc-mobile', 'IPCC 2006 Vol 2 Table 1.2', ncv === f.heat ? 'verified' : 'unverified');
  add('road_fuel', k + ' density', f.density, 'kg/litre', 'none', '', 'unverified', 'Assumed. No source recorded.');
});

/* ---- leakage rates and charges */
const leakNote = { 'Unitary AC': ['Residential and commercial A/C: 1 to 10%', 'verified', 'Upper end of the range, as IPCC advises for developing countries.'], 'Central HVAC': ['Chillers: 2 to 15%', 'verified', 'Upper end of the range.'], 'Refrigeration': ['Medium and large commercial refrigeration: 10 to 35%', 'corrected', 'Was 0.5%, below every commercial range. Upper end used. If the equipment is industrial refrigeration or cold storage the range is 7 to 25%.'], 'Water coolers': ['Stand-alone commercial: 1 to 15%', 'corrected', 'Was 0.5%, below the range. Upper end used.'] };
const leakPrev = { Refrigeration: 0.005, 'Water coolers': 0.005 };
Object.keys(F.hvac_leak).forEach((k) => add('hvac_leak', k, F.hvac_leak[k], 'share of charge per year', 'ipcc-refrigeration', 'IPCC 2019 Refinement Vol 3 Ch 7, Table 7.9: ' + leakNote[k][0], leakNote[k][1], leakNote[k][2], leakPrev[k]));
const chargeRange = { 'Unitary AC': '0.5 to 100 kg', 'Central HVAC': '10 to 2,000 kg (chillers)', 'Refrigeration': '50 to 2,000 kg (medium and large commercial)', 'Water coolers': '0.2 to 6 kg (stand-alone commercial)' };
Object.keys(F.hvac_typical_charge_kg).forEach((k) => add('hvac_typical_charge', k, F.hvac_typical_charge_kg[k], 'kg per unit', 'ipcc-refrigeration', 'IPCC 2019 Refinement Vol 3 Ch 7, Table 7.9: charge range ' + chargeRange[k], 'verified', 'Inside the IPCC default range for the matching sub-application.'));
add('fire', 'handheld leak rate', F.fire.leak.Handheld, 'share per year', 'none', '', 'unverified', 'No source recorded.');
add('fire', 'fixed leak rate', F.fire.leak.Fixed, 'share per year', 'none', '', 'unverified', 'No source recorded.');
Object.keys(F.fire.agents).forEach((k) => add('fire', k + ' GWP', F.fire.agents[k], 'kg CO2e per kg', 'ipcc-ar6-gwp', '', k === 'Carbon dioxide' ? 'verified' : 'unverified', k === 'Carbon dioxide' ? '' : 'Treated as zero. Confirm the agent is not a fluorinated gas.'));
add('sf6', 'annual leak rate', F.sf6_leak, 'share per year', 'none', 'Compare with IPCC 2006 Vol 3 Ch 8 and the 2019 Refinement', 'unverified', 'No source recorded.');

/* ---- electricity */
Object.keys(F.grid.cea_all_india_fy).forEach((k) => add('grid_cea', 'FY ' + k + '-' + String((Number(k) + 1) % 100).padStart(2, '0'), F.grid.cea_all_india_fy[k], 'kg CO2 per kWh', 'cea-grid', 'CEA CO2 Baseline Database v21.0 (Nov 2025), Annexure I, all-India weighted average incl. RE', 'verified', k === '2024' ? 'Adjusted for cross-border transfers; captive injection figure is provisional.' : ''));
Object.keys(F.grid.legacy_workbook_calendar).forEach((k) => add('grid_legacy', k, F.grid.legacy_workbook_calendar[k], 'kg CO2 per kWh', 'cea-grid', 'Value used in the original spreadsheet', 'open', 'Does not match the CEA all-India series (0.703 to 0.727 for FY 2020-21 to 2023-24). Origin unknown: possibly a regional or older value. Kept only so results can be compared with the original spreadsheet.'));
add('td', 'loss share (default)', F.td.loss_share, 'share of electricity', 'pfc-atc-loss', 'Ministry of Power, 14th Integrated Rating and Ranking of Power Distribution Utilities (FY 2024-25), national AT&C loss 15.04%, as reported by T&D India (27 Jan 2026)', 'corrected', 'AT&C loss includes commercial losses, so it is a proxy for physical loss. Replace with the distribution company\'s own figure (option tdLoss) when known. Lost electricity is valued at the grid factor of the same year, as in GHG Protocol Scope 3 Standard Category 3 (T&D losses include combustion emissions).', 0.1927);
add('td', 'method', 'kWh x loss share x grid factor', 'method', 'ghgp-scope3', 'Scope 3 Standard, Category 3 activity (c)', 'corrected', 'The spreadsheet multiplied by 0.0172 instead of the grid factor. Option tdMethod: "legacy" reproduces it. Upstream (well-to-tank) emissions of generation are not yet included.');
add('td', 'legacy loss share', F.td.legacy.loss_share, 'share of electricity', 'none', '', 'open', 'Original spreadsheet value; no source found.');
add('td', 'legacy factor', F.td.legacy.ef, 'kg CO2e per kWh', 'none', '', 'open', 'Original spreadsheet value; no source found. Only used with tdMethod: "legacy".');

/* ---- vehicles by distance */
const rail = ['Non Sub-Urban Train', 'Sub-Urban Train'];
F.vehicles.forEach((v) => {
  const isRail = rail.indexOf(v[1]) >= 0, isCorr = v[1] === 'Small (Petrol)' && /<800/i.test(v[2]);
  const unit = v[0] === 'Mass Transit' ? 'kg CO2 per passenger-km' : (['LDV', 'MDV', 'HDV'].indexOf(v[0]) >= 0 ? 'kg CO2 per vehicle-km' : 'kg CO2 per km');
  add('vehicle', [v[0], v[1], v[2]].join(' | '), v[3], unit, isRail ? 'none' : 'india-ghg-road', isRail ? 'Not in the road transport paper. Probably the India GHG Program rail paper.' : 'India GHG Program Road Transport Technical Paper (2015), with the paper\'s uplift (10% two-wheelers, 8% cars)', isRail ? 'unverified' : (isCorr ? 'corrected' : 'verified'), v[1] === 'HDV' ? 'The paper gives 0.7375 in its summary table and 0.7353 in its worked calculation.' : (isCorr ? 'Paper gives 0.111. The old 0.1093 matches nothing in it.' : (v[0].indexOf('Passenger') === 0 || v[0] === 'Two Wheeler' || v[0] === 'Three Wheeler' ? 'CO2 only. Methane and nitrous oxide are not included in the paper.' : '')), isCorr ? 0.1093 : undefined);
});
Object.keys(F.mileage).forEach((k) => add('mileage', k, F.mileage[k], 'km per litre', 'india-ghg-road', 'India GHG Program Road Transport Technical Paper (2015)', 'verified'));

/* ---- spend-based factors */
const spendUnverified = ['Other Support Activities for Water Transportation'];
Object.keys(F.spend).forEach((k) => add('spend', k, F.spend[k], 'kg CO2e per 2022 USD', 'epa-supply-chain', 'EPA v1.3 NAICS_CO2e_USD2022.csv, "with margins" column', k === 'Office Furniture (wood)' ? 'corrected' : (spendUnverified.indexOf(k) >= 0 ? 'unverified' : 'verified'), k === 'Office Furniture (wood)' ? 'NAICS 337211 is 0.24. The old 1.24 was a typing error.' : (spendUnverified.indexOf(k) >= 0 ? 'NAICS 488390. Row not reachable in this check.' : 'EPA factors use AR5 GWPs and 2022 US dollars at purchaser prices.'), k === 'Office Furniture (wood)' ? 1.24 : undefined));
Object.keys(F.transport_per_eur).forEach((k) => add('transport_per_eur', k, F.transport_per_eur[k], 'kg CO2e per EUR', 'none', '', 'unverified', 'No source recorded in the original spreadsheet.'));
add('fx', 'INR per USD (market)', F.fx.inr_per_usd, 'INR per USD', 'ecb-fx', 'ECB euro foreign exchange reference rate, 21 Oct 2026 (via Frankfurter): 1 USD = 94.47 INR; cross-checked with Google/Morningstar 22 Oct 2026', 'corrected', 'Market rate on the date of the audit, not a price-year-matched or PPP rate. EPA factors are per 2022 US dollar, so results scale with the rate used. Update the value and date when running an inventory. The spreadsheet used 21.03 (labelled PPP).', F.fx.legacy.inr_per_usd);
add('fx', 'INR per EUR (market)', F.fx.inr_per_eur, 'INR per EUR', 'ecb-fx', 'ECB reference rates 21 Oct 2026: 94.47 INR and 0.89015 EUR per USD, so 106.13 INR per EUR', 'corrected', 'Market rate on the date of the audit. The spreadsheet used 27.311, which is not an exchange rate. The per-EUR transport factors have no recorded source or price year.', F.fx.legacy.inr_per_eur);
add('fx', 'INR per USD (PPP, alternative)', F.fx.inr_per_usd_ppp, 'INR per international USD', 'worldbank-ppp', 'World Bank indicator PA.NUS.PPP, India, 2022', 'verified', 'Not used by default. Pass as option inrPerUsd to compare. About 4.6 times lower than the market rate, so spend-based results are about 4.6 times higher with PPP.');

/* ---- waste */
Object.keys(F.waste).forEach((k) => add('waste', k, F.waste[k], 'kg CO2e per tonne', 'defra-waste', 'Needs the DEFRA conversion factor file for the matching year', 'unverified', 'The original spreadsheet linked a third-party copy of an older table.'));
Object.keys(F.waste_pre2023).forEach((k) => add('waste_up_to_2022', k, F.waste_pre2023[k], 'kg CO2e per tonne', 'defra-waste', 'Older table', 'unverified', 'Used for entries dated 2022 and earlier.'));

/* ---- food */
Object.keys(F.food_g_per_kg).forEach((k) => add('food', k, F.food_g_per_kg[k], 'g CO2e per kg of food', 'india-food', '', 'unverified', 'Derived constant from published Indian food footprints. Derivation not recorded.'));

/* ---- air travel */
Object.keys(AIR).forEach((k) => add('airport', k, AIR[k].join(' / '), 'latitude / longitude', 'air-travel', 'OpenFlights airports.dat', 'unverified', 'Coordinates look right but have not been compared with the database.'));
add('air_formula', 'kg CO2 per passenger = distance_km^0.6044 x 1.665', '0.6044 / 1.665', 'formula constants', 'air-travel', 'ICAO Carbon Emissions Calculator methodology', 'open', 'Constants have no recorded derivation. For Mumbai to London one-way economy the formula gives about 360 kg, which looks low against published calculators. Round trip doubles the result and business class over 3,000 km doubles it again.');

const cols = ['group', 'name', 'value', 'unit', 'source_id', 'locator', 'status', 'checked_on', 'previous_value', 'note'];
const q = (v) => { const s = String(v === undefined ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
fs.writeFileSync(path.join(root, 'data/factor_register.csv'), [cols.join(',')].concat(rows.map((r) => cols.map((c) => q(r[c])).join(','))).join('\n') + '\n');
const count = {}; rows.forEach((r) => { count[r.status] = (count[r.status] || 0) + 1; });
console.log('Wrote data/factor_register.csv with', rows.length, 'factors:', JSON.stringify(count));
