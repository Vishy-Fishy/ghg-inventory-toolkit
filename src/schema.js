/* Input tables, dropdown lists, and Excel template build/parse. Shared by the page and the Node tests. */
(function (root) {
  'use strict';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function uniq(a) { var o = {}; return a.filter(function (x) { if (o[x]) return false; o[x] = 1; return true; }); }
  function vehLabel(v) { return v[0] + ' | ' + v[1] + (v[2] && v[2] !== 'NA' ? ' | ' + v[2] : ''); }

  function makeLists(F) {
    return {
      month: MONTHS.slice(),
      year: [2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030],
      fuel: Object.keys(F.fuels),
      fuelUnit: ['Litres', 'Kg', 'Tonnes', 'SCM', 'Qty'],
      equip: Object.keys(F.hvac_leak),
      refrigerant: Object.keys(F.gwp_refrigerant),
      agent: Object.keys(F.fire.agents),
      placement: Object.keys(F.fire.leak),
      breaker: ['Gas (SF6)', 'Air', 'Vacuum', 'Oil'],
      vehicle: F.vehicles.map(vehLabel),
      roadFuel: ['Diesel', 'Petrol', 'CNG', 'LPG'],
      roadUnit: ['Litres', 'Kg'],
      spend: Object.keys(F.spend),
      mode: Object.keys(F.transport_per_eur),
      wasteType: uniq(Object.keys(F.waste).map(function (k) { return k.split('|')[0].trim(); })),
      wasteMethod: uniq(Object.keys(F.waste).map(function (k) { return k.split('|')[1].trim(); })),
      wasteVehicle: ['LDV', 'MDV', 'HDV'],
      airport: Object.keys(F.airports).sort(),
      cls: ['Economy', 'Business'],
      trip: ['One way', 'Round trip'],
      food: ['Veg', 'Non-Veg']
    };
  }

  var M = { k: 'month', l: 'Month', list: 'month', w: 13, req: true };
  var Y = { k: 'year', l: 'Year', list: 'year', w: 9, req: true, num: true };
  function c(k, l, opt) { var o = { k: k, l: l, w: 16 }; for (var x in opt) o[x] = opt[x]; return o; }
  var road = [M, Y, c('veh', 'Vehicle type', { list: 'vehicle', w: 44, help: 'Pick a vehicle and enter distance. For machinery or unlisted vehicles leave this blank and enter fuel instead.' }),
    c('km', 'Distance (km)', { num: true, w: 14 }),
    c('fuel', 'Fuel (if no distance)', { list: 'roadFuel', w: 18 }), c('unit', 'Fuel unit', { list: 'roadUnit', w: 11 }),
    c('qty', 'Fuel quantity', { num: true, w: 14 }), c('note', 'Description', { w: 26 })];
  var spend = [M, Y, c('item', 'Item purchased', { w: 26 }), c('category', 'Spend category', { list: 'spend', w: 44, req: true }),
    c('cost', 'Cost (INR)', { num: true, w: 14, req: true }), c('mode', 'Transport mode', { list: 'mode', w: 16, help: 'Only needed if you enter a transport spend.' }),
    c('transportSpend', 'Transport spend (INR)', { num: true, w: 20 })];

  var TABLES = [
    { id: 'fuel', scope: 1, sheet: 'S1 Stationary fuel', title: 'Stationary combustion', cats: ['fuel', 'c3'],
      hint: 'Fuel burned on site in generators, boilers, kitchens and furnaces. One row per fuel per month. LPG can be entered as Qty (number of 19 kg cylinders).',
      cols: [M, Y, c('fuel', 'Fuel', { list: 'fuel', req: true }), c('unit', 'Unit', { list: 'fuelUnit', req: true, w: 10 }), c('qty', 'Quantity', { num: true, req: true, w: 12 }), c('note', 'Description', { w: 26 })] },
    { id: 'mobile', scope: 1, sheet: 'S1 Vehicles & machinery', title: 'Mobile combustion', cats: ['mobile'],
      hint: 'Company-owned vehicles and mobile machinery. Give distance for a listed vehicle type, or leave the vehicle blank and give fuel used.', cols: road },
    { id: 'hvac', scope: 1, sheet: 'S1 Refrigerants', title: 'Refrigerant leaks', cats: ['hvac'],
      hint: 'Air conditioners, chillers and refrigeration. If you know the charge per unit, leakage is estimated from operating time. Otherwise leave charge blank and enter the quantity refilled.',
      cols: [M, Y, c('equip', 'Equipment type', { list: 'equip', req: true, w: 16 }), c('refrigerant', 'Refrigerant', { list: 'refrigerant', req: true, w: 12 }),
        c('charge', 'Charge per unit (kg)', { num: true, w: 18 }), c('units', 'Number of units', { num: true, w: 15 }), c('refilled', 'Refilled (kg)', { num: true, w: 13 }),
        c('hours', 'Hours per day', { num: true, w: 13 }), c('days', 'Days per month', { num: true, w: 14 })] },
    { id: 'sf6', scope: 1, sheet: 'S1 SF6 breakers', title: 'SF₆ circuit breakers', cats: ['sf6'],
      hint: 'One row per group of breakers per reporting year (usually entered in April).',
      cols: [M, Y, c('type', 'Breaker type', { list: 'breaker', req: true }), c('kg', 'SF6 per breaker (kg)', { num: true, w: 18 }), c('count', 'Number of breakers', { num: true, w: 17 }), c('installYear', 'Year installed', { num: true, w: 14 })] },
    { id: 'fire', scope: 1, sheet: 'S1 Fire extinguishers', title: 'Fire extinguishers', cats: ['fire'],
      hint: 'Enter once per year, or in the month a unit was discharged.',
      cols: [M, Y, c('agent', 'Extinguishing agent', { list: 'agent', req: true, w: 18 }), c('placement', 'Placement', { list: 'placement', req: true, w: 12 }),
        c('units', 'Total units', { num: true, req: true, w: 12 }), c('kg', 'Agent per unit (kg)', { num: true, w: 17 }), c('used', 'Units discharged', { num: true, w: 15 })] },
    { id: 'electricity', scope: 2, sheet: 'S2 Electricity', title: 'Purchased electricity', cats: ['elec', 'c3'],
      hint: 'Grid electricity from your bills, one row per month. Transmission and distribution losses are added to Scope 3 automatically.',
      cols: [M, Y, c('kwh', 'Electricity (kWh)', { num: true, req: true, w: 18 })] },
    { id: 'purchased', scope: 3, sheet: 'S3 C1 Purchased goods', title: 'Purchased goods & services', cats: ['c1', 'c4'], hint: 'Spend-based. Transport spend for these goods is reported under C4.', cols: spend },
    { id: 'capital', scope: 3, sheet: 'S3 C2 Capital goods', title: 'Capital goods', cats: ['c2', 'c4'], hint: 'Machinery, IT equipment, furniture and other assets bought in the month.', cols: spend },
    { id: 'waste', scope: 3, sheet: 'S3 C5 Waste', title: 'Waste', cats: ['c5'], hint: 'Waste sent off site, by type and disposal method. Distance and vehicle add the transport leg.',
      cols: [M, Y, c('type', 'Waste type', { list: 'wasteType', req: true }), c('method', 'Disposal method', { list: 'wasteMethod', req: true, w: 20 }),
        c('kg', 'Quantity (kg)', { num: true, req: true, w: 14 }), c('km', 'Distance to site (km)', { num: true, w: 19 }), c('vehicle', 'Transport vehicle', { list: 'wasteVehicle', w: 16 })] },
    { id: 'travelRoad', scope: 3, sheet: 'S3 C6 Road travel', title: 'Business travel (road)', cats: ['c6'], hint: 'Taxis, hired cars, buses and trains for business trips.', cols: road },
    { id: 'air', scope: 3, sheet: 'S3 C6 Air travel', title: 'Business travel (air)', cats: ['c6'], hint: 'One row per itinerary. Choose airport codes from the list.',
      cols: [M, Y, c('from', 'From airport', { list: 'airport', req: true, w: 13 }), c('to', 'To airport', { list: 'airport', req: true, w: 12 }), c('cls', 'Class', { list: 'cls', w: 11 }),
        c('trip', 'Trip type', { list: 'trip', w: 12 }), c('pax', 'Passengers', { num: true, req: true, w: 12 })] },
    { id: 'commute', scope: 3, sheet: 'S3 C7 Commuting', title: 'Employee commuting', cats: ['c7'], hint: 'Total distance travelled by employees in the month, by mode.', cols: road },
    { id: 'food', scope: 3, sheet: 'S3 Food', title: 'Food', cats: ['food'], hint: 'Food served in the canteen, in kg.',
      cols: [M, Y, c('type', 'Type of food', { list: 'food', req: true }), c('kg', 'Quantity (kg)', { num: true, req: true, w: 14 })] }
  ];

  function colLetter(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

  /* Build an .xlsx template (optionally pre-filled) with dropdowns. Returns a Promise<ArrayBuffer>. */
  function buildTemplate(ExcelJS, F, tableIds, data, scopeLabel) {
    var L = makeLists(F), wb = new ExcelJS.Workbook();
    wb.creator = 'GHG Inventory Calculator'; wb.created = new Date();
    var tables = TABLES.filter(function (t) { return tableIds.indexOf(t.id) >= 0; });
    var HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
    var info = wb.addWorksheet('How to fill', { properties: { tabColor: { argb: 'FF2A78D6' } } });
    info.getColumn(1).width = 28; info.getColumn(2).width = 100;
    info.addRow(['GHG inventory input template' + (scopeLabel ? ' — ' + scopeLabel : '')]).font = { bold: true, size: 14 };
    info.addRow([]);
    [['1', 'Fill one sheet per source. Each row is one item for one month.'],
      ['2', 'Use the dropdowns for every grey-headed column that has one. Typed values that do not match the list are rejected.'],
      ['3', 'Leave rows blank if a source does not apply. Do not rename sheets or column headings.'],
      ['4', 'Save as .xlsx and upload it on the website. You can upload several files; each sheet replaces the data already loaded for that source.'],
      ['5', 'Required columns are marked with * in the heading.']].forEach(function (r) { var row = info.addRow(r); row.alignment = { wrapText: true, vertical: 'top' }; });
    info.addRow([]);
    info.addRow(['Sheet', 'What goes in it']).font = { bold: true };
    tables.forEach(function (t) {
      var help = t.cols.filter(function (cl) { return cl.help; }).map(function (cl) { return cl.l + ': ' + cl.help; }).join(' ');
      var row = info.addRow([t.sheet, t.hint + (help ? ' ' + help : '')]); row.alignment = { wrapText: true, vertical: 'top' };
    });
    info.addRow([]);
    info.addRow(['Note', 'Fuel- and energy-related emissions (Scope 3, C3) and upstream transport (C4) are calculated from the fuel, electricity and spend sheets. They have no sheet of their own.']).alignment = { wrapText: true };

    var lists = wb.addWorksheet('Lists'), listRef = {}, li = 0;
    Object.keys(L).forEach(function (k) {
      var col = colLetter(li++); lists.getCell(col + '1').value = k;
      L[k].forEach(function (v, i) { lists.getCell(col + (i + 2)).value = v; });
      listRef[k] = "'Lists'!$" + col + '$2:$' + col + '$' + (L[k].length + 1);
    });

    tables.forEach(function (t) {
      var ws = wb.addWorksheet(t.sheet, { views: [{ state: 'frozen', ySplit: 1 }], properties: { tabColor: { argb: t.scope === 1 ? 'FF2A78D6' : t.scope === 2 ? 'FFEB6834' : 'FF1BAF7A' } } });
      ws.columns = t.cols.map(function (cl) { return { header: cl.l + (cl.req ? ' *' : ''), key: cl.k, width: cl.w || 16 }; });
      var hr = ws.getRow(1); hr.height = 30;
      hr.eachCell(function (cell, n) {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = HEAD; cell.alignment = { vertical: 'middle', wrapText: true };
      });
      var rows = data ? (data[t.id] || []) : [];
      rows.forEach(function (r) { ws.addRow(t.cols.map(function (cl) { var v = r[cl.k]; return v === undefined ? null : v; })); });
      var last = Math.max(500, rows.length + 200);
      t.cols.forEach(function (cl, i) {
        var col = colLetter(i), range = col + '2:' + col + last;
        if (cl.list) ws.dataValidations.add(range, { type: 'list', allowBlank: true, formulae: [listRef[cl.list]], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Pick from the list', error: 'Choose a value from the dropdown for ' + cl.l + '.' });
        else if (cl.num) ws.dataValidations.add(range, { type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Number needed', error: cl.l + ' must be a number of zero or more.' });
        if (cl.num) ws.getColumn(i + 1).numFmt = '#,##0.##';
      });
    });
    lists.state = 'veryHidden';
    return wb.xlsx.writeBuffer();
  }

  function cellVal(v) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if ('result' in v) return cellVal(v.result);
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
      if ('text' in v) return v.text;
      if ('error' in v) return null;
      return null;
    }
    if (typeof v === 'string') { var s = v.trim(); return s === '' ? null : s; }
    return v;
  }
  function normHead(s) { return String(s || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  /* Parse an uploaded workbook with SheetJS (tolerant of files re-saved by Excel, Google Sheets or LibreOffice).
     Returns {tables:{id:rows}, found:[...], skipped:[...]} */
  function parseWorkbook(XLSX, buf) {
    var wb = XLSX.read(buf, { type: 'array', cellDates: true });
    var out = {}, found = [], skipped = [];
    wb.SheetNames.forEach(function (name) {
      if (name === 'Lists' || name === 'How to fill') return;
      var t = TABLES.filter(function (x) { return normHead(x.sheet) === normHead(name) || x.id === name; })[0];
      if (!t) { skipped.push(name); return; }
      var ws = wb.Sheets[name]; if (!ws || !ws['!ref']) { out[t.id] = []; found.push({ id: t.id, sheet: name, n: 0 }); return; }
      var r0 = XLSX.utils.decode_range(ws['!ref']).s.r;
      var m = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
      if (!m.length) { out[t.id] = []; found.push({ id: t.id, sheet: name, n: 0 }); return; }
      var head = {};
      m[0].forEach(function (hv, n) { var hn = normHead(cellVal(hv)); t.cols.forEach(function (cl) { if (normHead(cl.l) === hn || cl.k.toLowerCase() === hn) head[n] = cl; }); });
      if (!Object.keys(head).length) { skipped.push(name + ' (headings not recognised)'); return; }
      var rows = [];
      for (var r = 1; r < m.length; r++) {
        var line = m[r] || [], o = { _xlrow: r0 + r + 1 }, any = false;
        for (var n in head) {
          var cl = head[n], v = cellVal(line[+n]);
          if (v instanceof Date) v = cl.k === 'month' ? MONTHS[v.getMonth()] : cl.k === 'year' ? v.getFullYear() : v.toISOString().slice(0, 10);
          if (v !== null) any = true;
          if (cl.k === 'month' && typeof v === 'number' && v >= 1 && v <= 12) v = MONTHS[v - 1];
          if (cl.num && typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
          o[cl.k] = v;
        }
        if (!any) continue;
        if (o.veh) { var p = String(o.veh).split(' | '); o.cat = p[0]; o.type = p[1] || null; o.engine = p[2] || 'NA'; }
        else if ('veh' in o) o.cat = 'Other';
        rows.push(o);
      }
      out[t.id] = rows; found.push({ id: t.id, sheet: name, n: rows.length });
    });
    return Promise.resolve({ tables: out, found: found, skipped: skipped });
  }

  var api = { MONTHS: MONTHS, TABLES: TABLES, makeLists: makeLists, vehLabel: vehLabel, buildTemplate: buildTemplate, parseWorkbook: parseWorkbook };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GHGX = api;
})(typeof window !== 'undefined' ? window : this);
