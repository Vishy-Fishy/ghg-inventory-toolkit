/* GHG inventory calculation engine (prototype).
 * Pure functions: compute(data, factors) -> results. No DOM access, runs in browser and Node.
 * Rows that cannot be calculated are reported as issues and excluded, never silently set to zero. */
(function (root) {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var GWP = { ch4: 29.8, n2o: 273 }; // IPCC AR6, 100-year

  var CATS = [
    { id: 'fuel',   scope: 1, label: 'Stationary combustion',        short: 'Fuel' },
    { id: 'hvac',   scope: 1, label: 'Refrigerant leaks (HVAC)',     short: 'HVAC' },
    { id: 'fire',   scope: 1, label: 'Fire extinguishers',           short: 'Fire ext.' },
    { id: 'sf6',    scope: 1, label: 'SF₆ circuit breakers',    short: 'SF₆' },
    { id: 'mobile', scope: 1, label: 'Owned vehicles and machinery', short: 'Mobile' },
    { id: 'elec',   scope: 2, label: 'Purchased electricity',        short: 'Electricity' },
    { id: 'c1',     scope: 3, label: 'C1 Purchased goods',           short: 'C1 Goods' },
    { id: 'c2',     scope: 3, label: 'C2 Capital goods',             short: 'C2 Capital' },
    { id: 'c3',     scope: 3, label: 'C3 Fuel- and energy-related',  short: 'C3 Energy' },
    { id: 'c4',     scope: 3, label: 'C4 Upstream transport',        short: 'C4 Transport' },
    { id: 'c5',     scope: 3, label: 'C5 Waste',                     short: 'C5 Waste' },
    { id: 'c6',     scope: 3, label: 'C6 Business travel',           short: 'C6 Travel' },
    { id: 'c7',     scope: 3, label: 'C7 Employee commuting',        short: 'C7 Commute' },
    { id: 'food',   scope: 3, label: 'Food consumption',             short: 'Food' }
  ];

  function monthIndex(m) {
    if (typeof m === 'number') return m >= 1 && m <= 12 ? m - 1 : -1;
    var s = String(m || '').trim().toLowerCase();
    for (var i = 0; i < 12; i++) if (MONTHS[i].toLowerCase() === s || MONTHS[i].slice(0, 3).toLowerCase() === s) return i;
    return -1;
  }
  // number parser that tolerates text such as "312400\n" and "1,200"
  function num(x) {
    if (x === null || x === undefined || x === '') return { v: 0, blank: true };
    if (typeof x === 'number') return { v: x, blank: false };
    var s = String(x).replace(/[,\s]/g, '');
    var n = Number(s);
    if (s === '' ) return { v: 0, blank: true };
    if (isNaN(n)) return { v: NaN, blank: false, bad: true };
    return { v: n, blank: false, text: true };
  }
  function norm(s) { return String(s === null || s === undefined ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function lookupCI(table, key) {
    var k = norm(key);
    for (var name in table) if (norm(name) === k) return table[name];
    return undefined;
  }
  function co2e(co2, ch4, n2o) { return co2 + ch4 * GWP.ch4 + n2o * GWP.n2o; }
  function fyOf(year, mIdx) { return mIdx >= 3 ? year : year - 1; } // April-March, labelled by the starting year

  function compute(data, F, opts) {
    opts = opts || {};
    var rows = [], issues = [];
    var C = Object.assign({ tdLoss: F.td.loss_share, gridSet: 'cea', tdMethod: 'ghgp', inrPerUsd: F.fx.inr_per_usd, inrPerEur: F.fx.inr_per_eur }, opts); // gridSet: 'cea' (default) or 'legacy'; tdMethod: 'ghgp' (default) or 'legacy'; both legacy options reproduce the original spreadsheet
    var biogenic = { kg: 0, rows: [] }; // biogenic CO2: reported separately, never added to a scope (GHG Protocol)

    function ctx(module, idx, r, sheet) {
      var mi = monthIndex(r.month), y = Number(r.year);
      return { module: module, idx: idx, sheet: sheet, mi: mi, y: y, ok: mi >= 0 && y > 2000 };
    }
    function issue(c, level, msg) {
      issues.push({ level: level, module: c.module, sheet: c.sheet, row: c.idx + 1, month: c.mi >= 0 ? MONTHS[c.mi] : '?', year: c.y, msg: msg });
    }
    function add(c, cat, kg, label, detail) {
      rows.push({ module: c.module, cat: cat, mi: c.mi, y: c.y, kg: kg, label: label, detail: detail || '', row: c.idx + 1 });
    }
    function needNum(c, r, field, nice, required, allowNeg) {
      var n = num(r[field]);
      if (n.bad) { issue(c, 'error', nice + ' "' + r[field] + '" is not a number. Row excluded.'); return null; }
      if (n.text) issue(c, 'warn', nice + ' was typed as text and was converted to a number.');
      if (n.v < 0 && !allowNeg) { issue(c, 'error', nice + ' is negative. Row excluded.'); return null; }
      if (required && n.blank) { issue(c, 'error', nice + ' is blank. Row excluded.'); return null; }
      return n.v;
    }
    function periodOk(c) {
      if (!c.ok) { issue(c, 'error', 'Month or year is missing or not recognised. Row excluded.'); return false; }
      return true;
    }

    /* ---------- Scope 1: stationary combustion (+ Scope 3 category 3 upstream) ---------- */
    (data.fuel || []).forEach(function (r, i) {
      var c = ctx('fuel', i, r, 'Stationary fuel'); if (!periodOk(c)) return;
      var f = lookupCI(F.fuels, r.fuel);
      if (!f) { issue(c, 'error', 'Fuel "' + r.fuel + '" is not in the factor library. Row excluded.'); return; }
      var q = needNum(c, r, 'qty', 'Quantity', true); if (q === null) return;
      var unit = norm(r.unit), gas = f.unit.indexOf('m3') >= 0;
      var qty, massKg;
      // quantity in the unit the factor is expressed in (tonne, litre or m3)
      if (unit === 'qty') { if (norm(r.fuel) !== 'lpg') { issue(c, 'error', 'Unit "Qty" (19 kg cylinders) only applies to LPG. Row excluded.'); return; } qty = q * 19 / 1000; }
      else if (unit === 'kg') qty = f.unit === 'kg/tonne' ? q / 1000 : q / f.density;
      else if (unit === 'tonnes') { if (f.unit !== 'kg/tonne') { issue(c, 'error', 'Unit "Tonnes" does not suit ' + r.fuel + '. Row excluded.'); return; } qty = q; }
      else if (unit === 'litres') { if (f.unit !== 'kg/litre') { issue(c, 'error', 'Unit "Litres" does not suit ' + r.fuel + '. Row excluded.'); return; } qty = q; }
      else if (unit === 'scm') { if (!gas) { issue(c, 'error', 'Unit "SCM" does not suit ' + r.fuel + '. Row excluded.'); return; } qty = q; }
      else { issue(c, 'error', 'Unit "' + r.unit + '" is not recognised. Row excluded.'); return; }
      if (f.unit === 'kg/tonne') massKg = qty * 1000; else massKg = qty * f.density; // kg/litre and kg/m3 both use density in kg per unit
      var direct = qty * co2e(f.biogenic ? 0 : f.co2, f.ch4, f.n2o);
      if (f.biogenic) { var bio = qty * f.co2; biogenic.kg += bio; biogenic.rows.push({ y: c.y, mi: c.mi, fy: fyOf(c.y, c.mi), kg: bio, label: r.fuel + ' ' + r.qty + ' ' + r.unit, row: c.idx + 1 }); }
      add(c, 'fuel', direct, r.fuel + ' ' + r.qty + ' ' + r.unit, f.biogenic ? 'biogenic CO2 reported separately; only CH4 and N2O counted' : (r.note || ''));
      var tj = massKg / 1e6 * f.heat_TJ_per_Gg;
      add(c, 'c3', tj * f.upstream_kg_per_TJ, 'Upstream of ' + r.fuel, 'well-to-tank');
    });

    /* ---------- Scope 1: refrigerant leaks ---------- */
    (data.hvac || []).forEach(function (r, i) {
      var c = ctx('hvac', i, r, 'HVAC refrigerants'); if (!periodOk(c)) return;
      var gwp = F.gwp_refrigerant[String(r.refrigerant).toUpperCase()]; if (gwp === undefined) gwp = lookupCI(F.gwp_refrigerant, r.refrigerant);
      if (gwp === undefined) { issue(c, 'error', 'Refrigerant "' + r.refrigerant + '" has no GWP in the library. Row excluded.'); return; }
      var leak = lookupCI(F.hvac_leak, r.equip);
      var charge = needNum(c, r, 'charge', 'Charge'); if (charge === null) return;
      var refilled = needNum(c, r, 'refilled', 'Refilled kg'); if (refilled === null) return;
      var units = needNum(c, r, 'units', 'Number of units'); if (units === null) return;
      var kg;
      if (charge > 0) {
        if (leak === undefined) { issue(c, 'error', 'Equipment type "' + r.equip + '" has no leak rate. Row excluded.'); return; }
        var hrs = needNum(c, r, 'hours', 'Hours per day'), days = needNum(c, r, 'days', 'Days per month');
        if (hrs === null || days === null) return;
        if (hrs === 0 || days === 0) issue(c, 'warn', 'Charge given but hours or days are zero, so the leak estimate is zero.');
        kg = charge * units * leak * (days * hrs) / (30 * 24);
        if (refilled > 0) issue(c, 'warn', 'Both charge and refill were entered. The charge-based estimate is used and the refill is ignored.');
      } else {
        kg = refilled;
        if (refilled === 0) { issue(c, 'warn', 'Neither charge nor refilled quantity entered. This row contributes nothing.'); }
      }
      add(c, 'hvac', kg * gwp, r.equip + ' ' + r.refrigerant, kg.toFixed(2) + ' kg leaked');
    });

    /* ---------- Scope 1: fire extinguishers ---------- */
    (data.fire || []).forEach(function (r, i) {
      var c = ctx('fire', i, r, 'Fire extinguishers'); if (!periodOk(c)) return;
      var g = lookupCI(F.fire.agents, r.agent), lk = lookupCI(F.fire.leak, r.placement);
      if (g === undefined || lk === undefined) { issue(c, 'error', 'Agent or placement not in the library. Row excluded.'); return; }
      var n = needNum(c, r, 'units', 'Units', true), kg = needNum(c, r, 'kg', 'kg per unit'), used = needNum(c, r, 'used', 'Units used');
      if (n === null || kg === null || used === null) return;
      if (used > n) { issue(c, 'error', 'Units used is higher than total units. Row excluded.'); return; }
      if (g > 0 && kg === 0) issue(c, 'warn', 'kg per unit is blank, so CO₂ extinguishers count as zero.');
      add(c, 'fire', g * (used * kg + (n - used) * lk * kg), r.agent + ' ' + r.placement, '');
    });

    /* ---------- Scope 1: SF6 circuit breakers ---------- */
    (data.sf6 || []).forEach(function (r, i) {
      var c = ctx('sf6', i, r, 'Circuit breakers'); if (!periodOk(c)) return;
      var isSF6 = norm(r.type).indexOf('sf6') >= 0;
      var known = ['air', 'vaccum', 'vacuum', 'oil'].indexOf(norm(r.type)) >= 0;
      if (!isSF6 && !known) { issue(c, 'error', 'Breaker type "' + r.type + '" not recognised. Row excluded.'); return; }
      if (!isSF6) { add(c, 'sf6', 0, r.type + ' breaker', 'no fluorinated gas'); return; }
      var kg = needNum(c, r, 'kg', 'kg of gas', true), n = needNum(c, r, 'count', 'Number of breakers', true), inst = needNum(c, r, 'installYear', 'Installation year', true);
      if (kg === null || n === null || inst === null) return;
      var adj = fyOf(c.y, c.mi), age = adj - inst;
      if (age < 0) { issue(c, 'error', 'Installation year is after the reporting year. Row excluded.'); return; }
      var rate = F.sf6_leak, gwp = c.y <= 2022 ? F.sf6_gwp['2022'] : F.sf6_gwp['2023+'];
      var leaked = kg * n * (Math.pow(1 - rate, age) - Math.pow(1 - rate, age + 1));
      add(c, 'sf6', leaked * gwp, 'SF₆ breakers, installed ' + inst, leaked.toFixed(4) + ' kg leaked');
    });

    /* ---------- road-vehicle style rows: owned vehicles, business road travel, commuting ---------- */
    function roadRows(list, module, cat, sheet) {
      (list || []).forEach(function (r, i) {
        var c = ctx(module, i, r, sheet); if (!periodOk(c)) return;
        var km = needNum(c, r, 'km', 'Distance'); if (km === null) return;
        if (km > 0) {
          var key = norm(r.cat) + '|' + norm(r.type) + '|' + norm(r.engine), ef;
          F.vehicles.forEach(function (v) { if (norm(v[0]) + '|' + norm(v[1]) + '|' + norm(v[2]) === key) ef = v[3]; });
          if (ef === undefined) { issue(c, 'error', 'No distance factor for ' + [r.cat, r.type, r.engine].join(' / ') + '. Row excluded.'); return; }
          if (r.fuel && num(r.qty).v > 0) issue(c, 'warn', 'Distance and fuel were both entered. Distance is used and fuel is ignored.');
          add(c, cat, km * ef, [r.cat, r.type].filter(Boolean).join(' '), km + ' km');
        } else {
          var q = needNum(c, r, 'qty', 'Fuel quantity'); if (q === null) return;
          if (!r.fuel || q === 0) { issue(c, 'warn', 'Neither distance nor fuel quantity entered. This row contributes nothing.'); return; }
          var rf = lookupCI(F.road_fuel, r.fuel);
          if (!rf) { issue(c, 'error', 'Fuel "' + r.fuel + '" is not a road fuel in the library. Row excluded.'); return; }
          var un = norm(r.unit), lit = q;
          if (un === 'kg') lit = q / rf.density;
          else if (un && un !== 'litres') { issue(c, 'error', 'Unit "' + r.unit + '" is not supported for road fuel (use Litres or Kg). Row excluded.'); return; }
          var tj = lit * rf.density / 1e6 * rf.heat;
          add(c, cat, tj * co2e(rf.co2, rf.ch4, rf.n2o), (r.cat || 'Machinery') + (r.note ? ' (' + r.note + ')' : '') + ' ' + r.fuel, q + ' ' + (r.unit || ''));
        }
      });
    }
    roadRows(data.mobile, 'mobile', 'mobile', 'Owned vehicles');
    roadRows(data.travelRoad, 'travelRoad', 'c6', 'Business road travel');
    roadRows(data.commute, 'commute', 'c7', 'Employee commute');

    /* ---------- Scope 2: electricity (+ C3 T&D losses) ---------- */
    (data.electricity || []).forEach(function (r, i) {
      var c = ctx('elec', i, r, 'Grid electricity'); if (!periodOk(c)) return;
      var kwh = needNum(c, r, 'kwh', 'kWh', true); if (kwh === null) return;
      var ef, fy = fyOf(c.y, c.mi);
      if (C.gridSet === 'legacy') {
        ef = F.grid.legacy_workbook_calendar[String(c.y)];
        if (ef === undefined) { issue(c, 'error', 'No legacy grid factor for year ' + c.y + '. Row excluded.'); return; }
      } else {
        // CEA all-India weighted average, by financial year (April to March). Months after the latest published year use the latest value.
        var series = F.grid.cea_all_india_fy, yrs = Object.keys(series).map(Number).sort(function (a, b) { return a - b; });
        if (fy < yrs[0]) { issue(c, 'error', 'No grid factor before FY ' + yrs[0] + '-' + String((yrs[0] + 1) % 100).padStart(2, '0') + '. Row excluded.'); return; }
        ef = series[String(fy)];
        if (ef === undefined) { var last = yrs[yrs.length - 1]; ef = series[String(last)]; issue(c, 'warn', 'CEA has not published a grid factor for FY ' + fy + '-' + String((fy + 1) % 100).padStart(2, '0') + ' yet, so the FY ' + last + '-' + String((last + 1) % 100).padStart(2, '0') + ' value (' + ef + ') is used.'); }
      }
      add(c, 'elec', kwh * ef, kwh.toLocaleString('en-IN') + ' kWh', 'grid factor ' + ef);
      if (C.tdMethod === 'legacy') add(c, 'c3', kwh * F.td.legacy.loss_share * F.td.legacy.ef, 'T&D losses', 'loss share ' + F.td.legacy.loss_share + ' x factor ' + F.td.legacy.ef + ' (original spreadsheet method)');
      else add(c, 'c3', kwh * C.tdLoss * ef, 'T&D losses', 'loss share ' + C.tdLoss + ' x grid factor ' + ef);
    });

    /* ---------- spend-based: purchased and capital goods ---------- */
    function spendRows(list, module, cat, sheet) {
      (list || []).forEach(function (r, i) {
        var c = ctx(module, i, r, sheet); if (!periodOk(c)) return;
        var cost = needNum(c, r, 'cost', 'Cost', true); if (cost === null) return;
        var ef = lookupCI(F.spend, r.category);
        if (ef === undefined) { issue(c, 'error', 'Spend category "' + (r.category || '(blank)') + '" is not in the library. Row excluded.'); return; }
        var usd = cost / C.inrPerUsd;
        add(c, cat, usd * ef, r.item || r.category, 'INR ' + cost.toLocaleString('en-IN'));
        var ts = needNum(c, r, 'transportSpend', 'Transport spend');
        if (ts === null) return;
        if (ts > 0) {
          var mf = lookupCI(F.transport_per_eur, r.mode);
          if (mf === undefined) { issue(c, 'error', 'Transport spend given but mode "' + (r.mode || '(blank)') + '" is not recognised. Transport excluded.'); return; }
          add(c, 'c4', ts / C.inrPerEur * mf, 'Transport of ' + (r.item || r.category), r.mode);
        }
      });
    }
    spendRows(data.purchased, 'purchased', 'c1', 'Purchased goods');
    spendRows(data.capital, 'capital', 'c2', 'Capital goods');

    /* ---------- C5 waste ---------- */
    (data.waste || []).forEach(function (r, i) {
      var c = ctx('waste', i, r, 'Waste'); if (!periodOk(c)) return;
      var kg = needNum(c, r, 'kg', 'Waste kg', true); if (kg === null) return;
      var key = norm(r.type) + '|' + norm(r.method), tbl = c.y <= 2022 ? F.waste_pre2023 : F.waste, ef;
      for (var k in tbl) { var kk = k.split('|'); if (norm(kk[0]) + '|' + norm(kk[1]) === key) ef = tbl[k]; }
      if (ef === undefined) { issue(c, 'error', 'No waste factor for ' + r.type + ' / ' + r.method + '. Row excluded.'); return; }
      var tot = kg / 1000 * ef, tr = 0;
      var km = needNum(c, r, 'km', 'Distance to site'); if (km === null) return;
      if (km > 0) {
        var mil = F.mileage[String(r.vehicle || '').toUpperCase()];
        if (!mil) { issue(c, 'warn', 'Distance entered without a vehicle type (LDV, MDV or HDV). Transport left out.'); }
        else { var tj = km / mil * 0.84 / 1e6 * 43; tr = tj * co2e(74100, 3.9, 3.9); }
      }
      add(c, 'c5', tot + tr, r.type + ' to ' + r.method, tr > 0 ? 'incl. ' + tr.toFixed(1) + ' kg transport' : '');
    });

    /* ---------- C6 air travel ---------- */
    (data.air || []).forEach(function (r, i) {
      var c = ctx('air', i, r, 'Air travel'); if (!periodOk(c)) return;
      var A = F.airports || {}, o = A[String(r.from).toUpperCase()], d = A[String(r.to).toUpperCase()];
      if (!o || !d) { issue(c, 'error', 'Airport code ' + (!o ? r.from : r.to) + ' not found. Row excluded.'); return; }
      var pax = needNum(c, r, 'pax', 'Passengers', true); if (pax === null) return;
      var rad = Math.PI / 180;
      var cosd = Math.sin(o[0] * rad) * Math.sin(d[0] * rad) + Math.cos(o[0] * rad) * Math.cos(d[0] * rad) * Math.cos(d[1] * rad - o[1] * rad);
      var km = 3443.8985 * Math.acos(Math.min(1, Math.max(-1, cosd))) * 1.852;
      var round = /round/i.test(r.trip || ''), biz = /bu+si?ness/i.test(r.cls || '') || /business/i.test(r.cls || '');
      var kg = Math.pow(km, 0.6044) * 1.665 * (round ? 2 : 1) * (km > 3000 && biz ? 2 : 1) * pax;
      add(c, 'c6', kg, r.from + (round ? ' ⇄ ' : ' → ') + r.to, Math.round(km) + ' km, ' + pax + ' pax');
    });

    /* ---------- food ---------- */
    (data.food || []).forEach(function (r, i) {
      var c = ctx('food', i, r, 'Food'); if (!periodOk(c)) return;
      var kg = needNum(c, r, 'kg', 'Food kg', true); if (kg === null) return;
      var g = lookupCI(F.food_g_per_kg, r.type);
      if (g === undefined) { issue(c, 'error', 'Food type "' + r.type + '" must be Veg or Non-Veg. Row excluded.'); return; }
      add(c, 'food', g * kg / 1000, r.type + ' meals', kg + ' kg food');
    });

    /* ---------- aggregate ---------- */
    var catIds = CATS.map(function (x) { return x.id; });
    var scopeOf = {}; CATS.forEach(function (x) { scopeOf[x.id] = x.scope; });
    var byKey = {};
    rows.forEach(function (r) {
      var k = r.y * 12 + r.mi;
      if (!byKey[k]) { byKey[k] = { y: r.y, mi: r.mi, fy: fyOf(r.y, r.mi), kg: {} }; catIds.forEach(function (id) { byKey[k].kg[id] = 0; }); }
      byKey[k].kg[r.cat] += r.kg;
    });
    var months = Object.keys(byKey).map(Number).sort(function (a, b) { return a - b; }).map(function (k) {
      var m = byKey[k]; m.t = { 1: 0, 2: 0, 3: 0 };
      catIds.forEach(function (id) { m.t[scopeOf[id]] += m.kg[id]; });
      m.total = m.t[1] + m.t[2] + m.t[3];
      return m;
    });
    function addMonth(into, m) { catIds.forEach(function (id) { into.kg[id] += m.kg[id]; }); [1, 2, 3].forEach(function (s) { into.t[s] += m.t[s]; }); into.total += m.total; }
    function groupBy(keyFn, labelFn) {
      var g = {};
      months.forEach(function (m) {
        var k = keyFn(m);
        if (!g[k]) { g[k] = { key: k, label: labelFn(k), kg: {}, t: { 1: 0, 2: 0, 3: 0 }, total: 0, months: 0 }; catIds.forEach(function (id) { g[k].kg[id] = 0; }); }
        addMonth(g[k], m); g[k].months++;
      });
      return Object.keys(g).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return g[k]; });
    }
    var calendar = groupBy(function (m) { return m.y; }, function (k) { return String(k); });
    var fiscal = groupBy(function (m) { return m.fy; }, function (k) { return 'FY ' + k + '-' + String((k + 1) % 100).padStart(2, '0'); });

    var area = Number((data.site || {}).area) || 0;
    var emp = {};
    (data.employees || []).forEach(function (e) { emp[Number(e.year) * 12 + monthIndex(e.month)] = Number(e.count); });
    months.forEach(function (m) {
      var e = emp[m.y * 12 + m.mi];
      m.perEmployee = e ? m.total / 1000 / e : null; // tonnes per employee
      m.perM2 = area ? m.total / 1000 / area : null;
    });

    var errors = issues.filter(function (x) { return x.level === 'error'; }).length;
    return { rows: rows, issues: issues, months: months, calendar: calendar, fiscal: fiscal, cats: CATS, errors: errors, warnings: issues.length - errors, MONTHS: MONTHS, biogenic: biogenic };
  }

  var api = { compute: compute, CATS: CATS, MONTHS: MONTHS, monthIndex: monthIndex, fyOf: fyOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GHG = api;
})(typeof window !== 'undefined' ? window : this);
