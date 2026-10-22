/* Synthetic example inputs (no real organisation). Used for the "Explore with sample data" button and the examples folder. */
(function (root) {
  'use strict';
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function sampleData(X, emptyData, MONTHS) {
    var Rn = rng(20261019), r = function (a, b) { return a + (b - a) * Rn(); }, ri = function (a, b) { return Math.round(r(a, b)); };
    var D = emptyData();
    function veh(m, y, cat, type, eng, km) { return { month: m, year: y, veh: X.vehLabel([cat, type, eng]), cat: cat, type: type, engine: eng, km: km }; }
    for (var i = 0; i < 24; i++) {
      var mi = (3 + i) % 12, y = 2023 + Math.floor((3 + i) / 12), m = MONTHS[mi], p = function (o) { o.month = m; o.year = y; return o; };
      var season = [2, 3, 4, 5].indexOf(mi) >= 0 ? 1.25 : 1;
      D.fuel.push(p({ fuel: 'Diesel', unit: 'Litres', qty: ri(350, 1800), note: 'Backup generator' }));
      D.fuel.push(p({ fuel: 'LPG', unit: 'Qty', qty: ri(14, 26), note: 'Canteen' }));
      D.hvac.push(p({ equip: 'Unitary AC', refrigerant: 'R32', charge: 1.5, units: 18, refilled: null, hours: 10, days: 26 }));
      D.hvac.push(p({ equip: 'Central HVAC', refrigerant: 'R134A', charge: 80, units: 1, refilled: null, hours: 12, days: 26 }));
      if (Rn() < 0.2) D.hvac.push(p({ equip: 'Refrigeration', refrigerant: 'R134A', charge: null, units: 3, refilled: Math.round(r(0.5, 2) * 10) / 10, hours: null, days: null }));
      D.mobile.push(p({ veh: null, cat: 'Other', fuel: 'Diesel', unit: 'Litres', qty: ri(700, 2600), note: 'Yard machinery' }));
      D.mobile.push(veh(m, y, 'Passenger Cars', 'Sedan (Diesel)', '<1600 CC', ri(1400, 3200)));
      D.mobile.push(veh(m, y, 'Passenger Cars', 'MUV (Diesel)', '<2500 CC', ri(2200, 4600)));
      D.electricity.push(p({ kwh: Math.round(ri(52000, 70000) * season) }));
      D.purchased.push(p({ item: 'Mineral water cans', category: 'Bottled Water Product', cost: ri(52000, 82000), mode: 'Roadway', transportSpend: ri(1200, 3400) }));
      D.purchased.push(p({ item: 'Stationery', category: 'Stationery Products', cost: ri(16000, 41000) }));
      if (i % 3 === 1) D.purchased.push(p({ item: 'Office supplies', category: 'Office Supplies (except Paper)', cost: ri(20000, 60000), mode: 'Roadway', transportSpend: ri(800, 2000) }));
      if (i % 5 === 2) D.capital.push(p({ item: 'Desktop computers', category: 'Electronic & Computer Products', cost: ri(150000, 420000), mode: 'Roadway', transportSpend: ri(3000, 9000) }));
      if (i % 11 === 6) D.capital.push(p({ item: 'Dock leveller', category: 'Other Industrial Machinery Products', cost: ri(300000, 520000), mode: 'Roadway', transportSpend: ri(12000, 20000) }));
      D.waste.push(p({ type: 'Food', method: 'compost', kg: ri(560, 820) }));
      D.waste.push(p({ type: 'Paper', method: 'Recycled closed loop', kg: ri(180, 420), km: 25, vehicle: 'LDV' }));
      D.waste.push(p({ type: 'Plastic (Rigid)', method: 'Recycled open loop', kg: ri(30, 95), km: 32, vehicle: 'HDV' }));
      if (i % 4 === 0) D.waste.push(p({ type: 'Hazardous', method: 'Incineration', kg: ri(40, 120), km: 60, vehicle: 'MDV' }));
      D.commute.push(veh(m, y, 'Mass Transit', 'Sub-Urban Train', 'NA', ri(300000, 420000)));
      D.commute.push(veh(m, y, 'Passenger Cars', 'Sedan (Diesel)', '<1600 CC', ri(90000, 150000)));
      D.commute.push(veh(m, y, 'Two Wheeler', 'Motorcycle', '<125 cc', ri(150000, 230000)));
      D.food.push(p({ type: 'Veg', kg: ri(1900, 2300) }));
      D.food.push(p({ type: 'Non-Veg', kg: ri(420, 720) }));
    }
    [2023, 2024].forEach(function (y) { D.sf6.push({ month: 'April', year: y, type: 'Gas (SF6)', kg: 1.2, count: 2, installYear: 2016 }); });
    D.fire.push({ month: 'July', year: 2023, agent: 'Carbon dioxide', placement: 'Handheld', units: 40, kg: 4.5, used: 1 });
    D.fire.push({ month: 'July', year: 2024, agent: 'Carbon dioxide', placement: 'Fixed', units: 6, kg: 22.5, used: 0 });
    [['June', 2023, 'BOM', 'DEL', 'Economy', 3, 'Round trip'], ['September', 2023, 'BOM', 'LHR', 'Business', 1, 'Round trip'], ['November', 2023, 'BLR', 'SIN', 'Economy', 2, 'Round trip'],
      ['February', 2024, 'DEL', 'DXB', 'Economy', 2, 'One way'], ['May', 2024, 'BOM', 'SFO', 'Business', 1, 'Round trip'], ['January', 2025, 'BOM', 'BLR', 'Economy', 4, 'Round trip']].forEach(function (a) {
      D.air.push({ month: a[0], year: a[1], from: a[2], to: a[3], cls: a[4], pax: a[5], trip: a[6] });
    });
    D.travelRoad.push(veh('August', 2023, 'Passenger Cars', 'Sedan (Diesel)', '<2000 CC', 1800));
    D.travelRoad.push(veh('October', 2024, 'Passenger Cars', 'SUV (Diesel)', '<2500 CC', 2300));
    return D;
  }


  var api = { sampleData: sampleData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GHGSAMPLE = api;
})(typeof window !== 'undefined' ? window : this);
