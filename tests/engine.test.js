/* Engine tests. Run: npm test
 * Part 1: hand-calculated checks, written out from the formulas so a reader can follow them.
 * Part 2: regression tests for three defects found in the original Excel toolkit.
 * Part 3: snapshot of the synthetic sample dataset, and consistency of the exports. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const E = require(path.join(root, 'src/engine.js'));
const X = require(path.join(root, 'src/schema.js'));
const SAMPLE = require(path.join(root, 'src/sample.js'));
const XP = require(path.join(root, 'src/export.js'));
const F = JSON.parse(fs.readFileSync(path.join(root, 'data/factors.json'), 'utf8'));
F.airports = JSON.parse(fs.readFileSync(path.join(root, 'data/airports.json'), 'utf8'));

const empty = () => { const d = {}; X.TABLES.forEach((t) => { d[t.id] = []; }); return d; };
const A = (month, year) => ({ month, year });
const near = (got, want, msg) => assert.ok(Math.abs(got - want) <= Math.max(1e-9, Math.abs(want) * 1e-9), (msg || '') + ' expected ' + want + ' got ' + got);
const sumCat = (R, cat) => R.rows.filter((r) => r.cat === cat).reduce((s, r) => s + r.kg, 0);
const GWP_CH4 = 29.8, GWP_N2O = 273;

/* ---------------------------------------------------------------- 1. hand calculations */
test('diesel: direct CO2e and upstream (Scope 3 category 3)', () => {
  const d = empty(); d.fuel.push({ ...A('April', 2025), fuel: 'Diesel', unit: 'Litres', qty: 1000 });
  const R = E.compute(d, F);
  near(sumCat(R, 'fuel'), 1000 * (2.676492 + 0.0003612 * GWP_CH4 + 2.1672e-05 * GWP_N2O), 'direct');
  near(sumCat(R, 'c3'), (1000 * 0.84) / 1e6 * 43 * 16700, 'upstream'); // 840 kg x 43 TJ/Gg x 16,700 kg/TJ
  assert.equal(R.issues.length, 0);
});

test('electricity: CEA all-India factor for the financial year, T&D losses in Scope 3', () => {
  const d = empty();
  d.electricity.push({ ...A('May', 2023), kwh: 50000 });   // FY 2023-24 -> 0.727
  d.electricity.push({ ...A('February', 2024), kwh: 50000 }); // still FY 2023-24 -> 0.727
  d.electricity.push({ ...A('April', 2024), kwh: 50000 });  // FY 2024-25 -> 0.710
  const R = E.compute(d, F);
  near(sumCat(R, 'elec'), 50000 * 0.727 * 2 + 50000 * 0.710, 'grid');
  near(sumCat(R, 'c3'), 3 * 50000 * 0.1927 * 0.0172, 'T&D'); // loss share x factor (see docs/FACTOR_AUDIT.md: method under review)
  assert.equal(R.issues.length, 0);
});

test('electricity: a year CEA has not published yet uses the latest value and says so', () => {
  const d = empty(); d.electricity.push({ ...A('May', 2026), kwh: 1000 });
  const R = E.compute(d, F);
  near(sumCat(R, 'elec'), 1000 * 0.710);
  assert.equal(R.issues.length, 1); assert.equal(R.issues[0].level, 'warn');
});

test('electricity: legacy option reproduces the original spreadsheet (0.823 for 2023 onward)', () => {
  const d = empty(); d.electricity.push({ ...A('May', 2025), kwh: 50000 });
  near(sumCat(E.compute(d, F, { gridSet: 'legacy' }), 'elec'), 50000 * 0.823);
});

test('refrigerant leak: charge x units x leak rate x operating time x GWP', () => {
  const d = empty(); d.hvac.push({ ...A('June', 2025), equip: 'Unitary AC', refrigerant: 'R32', charge: 1.5, units: 10, refilled: null, hours: 10, days: 26 });
  const R = E.compute(d, F);
  near(sumCat(R, 'hvac'), 1.5 * 10 * 0.1 * (26 * 10) / (30 * 24) * 771, 'hvac');
});

test('factors corrected after checking against primary sources', () => {
  assert.equal(F.gwp_refrigerant.R12, 12500);           // AR6 (was 11,200)
  assert.ok(Math.abs(F.gwp_refrigerant.R407C - (0.23 * 771 + 0.25 * 3740 + 0.52 * 1530)) < 0.05, 'R407C is the AR6 mass-weighted blend of R32, R125, R134a'); // was 1,774 (AR4)
  assert.ok(Math.abs(F.gwp_refrigerant.R410A - (0.5 * 771 + 0.5 * 3740)) < 0.05, 'R410A is the AR6 mass-weighted blend of R32 and R125');   // was 1,725 (AR2)
  assert.equal(F.spend['Office Furniture (wood)'], 0.24); // EPA 337211 (was 1.24)
  assert.equal(F.vehicles.filter((v) => v[1] === 'Small (Petrol)')[0][3], 0.111); // India GHG Program (was 0.1093)
});

test('fire extinguishers: CO2 only, discharged units plus leakage of the rest', () => {
  const d = empty(); d.fire.push({ ...A('July', 2025), agent: 'Carbon dioxide', placement: 'Handheld', units: 10, kg: 4.5, used: 1 });
  const R = E.compute(d, F);
  near(sumCat(R, 'fire'), 1 * (1 * 4.5 + 9 * 0.035 * 4.5), 'fire');
});

test('purchased goods: INR to USD at the PPP factor, times the supply-chain factor', () => {
  const d = empty(); d.purchased.push({ ...A('April', 2025), item: 'Water', category: 'Bottled Water Product', cost: 100000 });
  const R = E.compute(d, F);
  near(sumCat(R, 'c1'), 100000 / 21.03 * 0.214, 'c1');
});

test('waste: tonnes x disposal factor', () => {
  const d = empty(); d.waste.push({ ...A('April', 2025), type: 'Paper', method: 'Recycled closed loop', kg: 2000 });
  const R = E.compute(d, F);
  near(sumCat(R, 'c5'), 2 * 6.41061, 'waste');
});

test('rows that cannot be calculated are reported, not counted as zero', () => {
  const d = empty();
  d.fuel.push({ ...A('April', 2025), fuel: 'Diesel', unit: 'Litres', qty: null });
  d.fuel.push({ ...A('April', 2025), fuel: 'Unobtainium', unit: 'Litres', qty: 5 });
  const R = E.compute(d, F);
  assert.equal(R.errors, 2);
  assert.equal(R.rows.length, 0);
});

/* ---------------------------------------------------------------- 2. regression tests for the Excel toolkit defects */
test('defect 1: LPG upstream is not 1000x too small (tonnes were treated as kg)', () => {
  const d = empty(); d.fuel.push({ ...A('April', 2025), fuel: 'LPG', unit: 'Tonnes', qty: 2 });
  const R = E.compute(d, F);
  near(sumCat(R, 'c3'), 2000 / 1e6 * 47.3 * 8700, 'LPG upstream'); // 823.02 kg. The Excel toolkit gives 0.82.
  near(sumCat(R, 'fuel'), 2 * (2984.63 + 0.2365 * GWP_CH4 + 0.00473 * GWP_N2O), 'LPG direct');
});

test('defect 1b: LPG in 19 kg cylinders and in kg agree', () => {
  const a = empty(); a.fuel.push({ ...A('April', 2025), fuel: 'LPG', unit: 'Qty', qty: 10 });
  const b = empty(); b.fuel.push({ ...A('April', 2025), fuel: 'LPG', unit: 'Kg', qty: 190 });
  const Ra = E.compute(a, F), Rb = E.compute(b, F);
  near(sumCat(Ra, 'c3'), sumCat(Rb, 'c3'), 'upstream'); near(sumCat(Ra, 'fuel'), sumCat(Rb, 'fuel'), 'direct');
  near(sumCat(Ra, 'c3'), 190 / 1e6 * 47.3 * 8700, 'value');
});

test('defect 2: one bad row must not blank the whole month', () => {
  const d = empty();
  d.purchased.push({ ...A('October', 2024), item: 'Tanker water', category: 'Bottled Water Product', cost: 275000, mode: 'Roadway' });
  d.purchased.push({ ...A('October', 2024), item: 'Chemicals', category: null, cost: 6200, mode: 'Roadway' }); // no category
  const R = E.compute(d, F);
  near(sumCat(R, 'c1'), 275000 / 21.03 * 0.214, 'good row still counted');
  assert.equal(R.errors, 1);
  assert.ok(/category/i.test(R.issues[0].msg), 'the bad row is named in the issue list');
});

test('defect 2b: a cost typed as text with a line break is read as a number and flagged', () => {
  const d = empty(); d.purchased.push({ ...A('November', 2024), item: 'Tanker water', category: 'Bottled Water Product', cost: '312400\n' });
  const R = E.compute(d, F);
  near(sumCat(R, 'c1'), 312400 / 21.03 * 0.214, 'text number');
  assert.equal(R.issues.length, 1); assert.equal(R.issues[0].level, 'warn');
});

test('defect 3: waste type with a trailing space still finds its factor', () => {
  const clean = empty(); clean.waste.push({ ...A('April', 2025), type: 'Plastic (Rigid)', method: 'Recycled closed loop', kg: 1000 });
  const spaced = empty(); spaced.waste.push({ ...A('April', 2025), type: 'Plastic (Rigid) ', method: 'Recycled closed loop ', kg: 1000 });
  const a = sumCat(E.compute(clean, F), 'c5'), b = sumCat(E.compute(spaced, F), 'c5');
  assert.ok(a > 0, 'factor found'); near(b, a, 'spaced equals clean');
  Object.keys(F.waste).concat(Object.keys(F.waste_pre2023)).forEach((k) => k.split('|').forEach((p) => assert.equal(p, p.trim(), 'no stray spaces in factor key ' + JSON.stringify(k))));
});

/* ---------------------------------------------------------------- 3. sample data, template round trip, exports */
function sample() { return SAMPLE.sampleData(X, empty, E.MONTHS); }

test('sample data: calculates without problems and totals are stable', () => {
  const R = E.compute(sample(), F);
  assert.equal(R.issues.length, 0);
  const fy = R.fiscal.map((g) => [g.label, Math.round(g.total / 1000 * 100) / 100]);
  assert.deepEqual(fy, JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sample_fy_totals.json'), 'utf8')));
});

test('export summary: scopes, categories, months and entries all add up to the same total', () => {
  const R = E.compute(sample(), F);
  const S = XP.summarise(R, E, { basis: 'fy', period: 2024 });
  near(S.scopes.reduce((s, x) => s + x.t, 0), S.totalT, 'scopes');
  near(S.cats.reduce((s, x) => s + x.t, 0), S.totalT, 'categories');
  near(S.months.reduce((s, x) => s + x.totalT, 0), S.totalT, 'months');
  near(S.entries.reduce((s, x) => s + x.t, 0), S.totalT, 'entries');
  assert.equal(S.periodLabel, 'FY 2024-25'); assert.equal(S.months.length, 12);
  assert.ok(XP.entriesCsv(S).split('\r\n').length === S.entries.length + 1);
});

test('template round trip: download, fill, upload gives the same results', async () => {
  const ExcelJS = require('exceljs'), XLSX = require('xlsx');
  const data = sample();
  const buf = await X.buildTemplate(ExcelJS, F, X.TABLES.map((t) => t.id), data, 'test');
  const parsed = await X.parseWorkbook(XLSX, Buffer.from(buf));
  const a = E.compute(data, F), b = E.compute(parsed.tables, F);
  assert.equal(b.issues.length, 0);
  near(b.months.reduce((s, m) => s + m.total, 0), a.months.reduce((s, m) => s + m.total, 0), 'total after round trip');
});
