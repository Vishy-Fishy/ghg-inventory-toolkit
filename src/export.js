/* Export helpers: turn engine results into client-ready summaries, an Excel workbook and CSV.
 * summarise() is pure and runs in Node and the browser. buildWorkbook() needs ExcelJS passed in. */
(function (root) {
  'use strict';

  var VERSION = '0.1.0';

  function round(n, d) { var p = Math.pow(10, d); return Math.round(n * p) / p; }

  /* Pick the rows, months and issues that fall in the chosen period.
   * opts: { basis: 'fy' | 'calendar', period: 'all' | key } */
  function summarise(R, E, opts) {
    opts = opts || {};
    var basis = opts.basis === 'calendar' || opts.basis === 'cal' ? 'calendar' : 'fy';
    var period = opts.period === undefined || opts.period === null ? 'all' : opts.period;
    function keyOf(y, mi) { return basis === 'fy' ? E.fyOf(y, mi) : y; }
    function inPeriod(y, mi) { return period === 'all' || String(keyOf(y, mi)) === String(period); }

    var groups = basis === 'fy' ? R.fiscal : R.calendar;
    var g = groups.filter(function (x) { return String(x.key) === String(period); })[0];
    var periodLabel = period === 'all' ? 'All periods' : (g ? g.label : String(period));

    var months = R.months.filter(function (m) { return inPeriod(m.y, m.mi); });
    var cats = R.cats.map(function (c) { return { id: c.id, scope: c.scope, label: c.label, short: c.short, kg: 0 }; });
    var byId = {}; cats.forEach(function (c) { byId[c.id] = c; });
    var scopeKg = { 1: 0, 2: 0, 3: 0 };
    months.forEach(function (m) { cats.forEach(function (c) { c.kg += m.kg[c.id]; scopeKg[c.scope] += m.kg[c.id]; }); });
    var totalKg = scopeKg[1] + scopeKg[2] + scopeKg[3];

    var scopeNames = { 1: 'Scope 1 - Direct emissions', 2: 'Scope 2 - Purchased energy', 3: 'Scope 3 - Value chain' };
    var scopes = [1, 2, 3].map(function (s) { return { scope: s, name: scopeNames[s], t: scopeKg[s] / 1000, share: totalKg ? scopeKg[s] / totalKg : 0 }; });
    cats.forEach(function (c) { c.t = c.kg / 1000; c.share = totalKg ? c.kg / totalKg : 0; });

    var entries = R.rows.filter(function (r) { return inPeriod(r.y, r.mi); }).map(function (r) {
      var c = byId[r.cat];
      return { scope: c.scope, category: c.label, module: r.module, month: R.MONTHS[r.mi], year: r.y, description: r.label || '', detail: r.detail || '', kg: r.kg, t: r.kg / 1000, row: r.row };
    });
    var issues = R.issues.filter(function (i) { return !i.year || !i.month || inPeriod(Number(i.year), E.monthIndex(i.month)); });

    return {
      version: VERSION, basis: basis, period: period, periodLabel: periodLabel,
      totalKg: totalKg, totalT: totalKg / 1000, scopes: scopes, cats: cats,
      months: months.map(function (m) {
        var o = { label: R.MONTHS[m.mi].slice(0, 3) + ' ' + m.y, y: m.y, mi: m.mi, totalT: m.total / 1000, scopeT: { 1: m.t[1] / 1000, 2: m.t[2] / 1000, 3: m.t[3] / 1000 }, catT: {} };
        cats.forEach(function (c) { o.catT[c.id] = m.kg[c.id] / 1000; });
        return o;
      }),
      entries: entries,
      issues: issues,
      errors: issues.filter(function (i) { return i.level === 'error'; }).length,
      warnings: issues.filter(function (i) { return i.level !== 'error'; }).length
    };
  }

  var METHOD = [
    'Greenhouse gases are converted to CO2e with IPCC AR6 100-year global warming potentials (CH4 29.8, N2O 273).',
    'Stationary and mobile fuel use: quantity x emission factor for CO2, CH4 and N2O. Upstream (well-to-tank) emissions of fuels are reported in Scope 3 category 3.',
    'Refrigerant leakage: charge x units x leak rate x operating time x GWP. Fire extinguishers and SF6 circuit breakers use fixed leakage rates and the GWP of the gas.',
    'Purchased electricity: location-based, kWh x grid emission factor. Transmission and distribution losses are reported in Scope 3 category 3.',
    'Purchased and capital goods: spend-based (INR converted to USD with a purchasing-power factor, multiplied by an EPA supply-chain factor). Transport of goods is spend-based per euro.',
    'Waste: tonnes x disposal factor by material and method, plus transport. Business travel and commuting: distance x vehicle factor, or fuel used. Air travel: great-circle distance between airports.',
    'Rows that cannot be calculated (missing quantity, unknown category, unit that does not fit) are excluded and listed under Data quality. They are never counted as zero silently.'
  ];

  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function entriesCsv(S) {
    var head = ['Scope', 'Category', 'Month', 'Year', 'Description', 'Detail', 'kg CO2e', 't CO2e', 'Source row'];
    var lines = [head.map(csvCell).join(',')];
    S.entries.forEach(function (e) { lines.push([e.scope, e.category, e.month, e.year, e.description, e.detail, round(e.kg, 3), round(e.t, 6), e.row].map(csvCell).join(',')); });
    return '﻿' + lines.join('\r\n');
  }

  /* meta: { org, preparedBy, title, notes }; sources: data/sources.json content (optional) */
  function buildWorkbook(ExcelJS, S, meta, sources) {
    meta = meta || {};
    var wb = new ExcelJS.Workbook();
    wb.creator = meta.preparedBy || 'GHG Inventory Toolkit'; wb.created = new Date();
    var HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    function head(row) { row.eachCell(function (c) { c.fill = HEAD; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { vertical: 'middle', wrapText: true }; }); row.height = 22; }

    /* ---- Summary */
    var ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 44 }, { width: 18 }, { width: 14 }, { width: 14 }];
    ws.getCell('A1').value = meta.title || 'Greenhouse gas inventory'; ws.getCell('A1').font = { size: 16, bold: true };
    var info = [['Organisation', meta.org || ''], ['Reporting period', S.periodLabel + (S.basis === 'fy' ? ' (April to March)' : ' (calendar year)')], ['Prepared by', meta.preparedBy || ''], ['Generated', new Date().toISOString().slice(0, 10)], ['Tool', 'GHG Inventory Toolkit v' + VERSION]];
    info.forEach(function (p, i) { ws.getCell(3 + i, 1).value = p[0]; ws.getCell(3 + i, 1).font = { color: { argb: 'FF6B7280' } }; ws.getCell(3 + i, 2).value = p[1]; });
    var r = 9;
    ws.getCell(r, 1).value = 'Total emissions (tCO2e)'; ws.getCell(r, 1).font = { bold: true, size: 12 };
    var totalCell = ws.getCell(r, 2); totalCell.font = { bold: true, size: 12 }; totalCell.numFmt = '#,##0.00';
    r += 2;
    ws.getRow(r).values = ['By scope', 'tCO2e', 'Share']; head(ws.getRow(r)); r++;
    var s0 = r;
    S.scopes.forEach(function (s) { var row = ws.getRow(r++); row.values = [s.name, round(s.t, 4), s.share]; row.getCell(2).numFmt = '#,##0.00'; row.getCell(3).numFmt = '0.0%'; });
    var s1 = r - 1;
    totalCell.value = { formula: 'SUM(B' + s0 + ':B' + s1 + ')', result: S.totalT };
    r++;
    ws.getRow(r).values = ['By category', 'tCO2e', 'Share', 'Scope']; head(ws.getRow(r)); r++;
    S.cats.forEach(function (c) { var row = ws.getRow(r++); row.values = [c.label, round(c.t, 4), c.share, c.scope]; row.getCell(2).numFmt = '#,##0.00'; row.getCell(3).numFmt = '0.0%'; });
    r++;
    ws.getCell(r, 1).value = S.errors ? S.errors + ' data row(s) could not be calculated and are excluded. See the Data quality sheet.' : 'All rows were calculated.';
    ws.getCell(r, 1).font = { italic: true, color: { argb: S.errors ? 'FFB42828' : 'FF0A6B3B' } };
    if (meta.notes) { r += 2; ws.getCell(r, 1).value = 'Notes'; ws.getCell(r, 1).font = { bold: true }; ws.getCell(r + 1, 1).value = meta.notes; ws.mergeCells(r + 1, 1, r + 1, 4); ws.getCell(r + 1, 1).alignment = { wrapText: true, vertical: 'top' }; ws.getRow(r + 1).height = 60; }

    /* ---- Monthly */
    var wm = wb.addWorksheet('Monthly', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
    var mcols = ['Month', 'Scope 1', 'Scope 2', 'Scope 3'].concat(S.cats.map(function (c) { return c.label; })).concat(['Total']);
    wm.addRow(mcols); head(wm.getRow(1)); wm.getColumn(1).width = 14;
    for (var i = 2; i <= mcols.length; i++) wm.getColumn(i).width = 16;
    S.months.forEach(function (m, idx) {
      var row = wm.addRow([m.label, round(m.scopeT[1], 4), round(m.scopeT[2], 4), round(m.scopeT[3], 4)].concat(S.cats.map(function (c) { return round(m.catT[c.id], 4); })).concat([null]));
      var tc = row.getCell(mcols.length); tc.value = { formula: 'SUM(B' + (idx + 2) + ':D' + (idx + 2) + ')', result: m.totalT }; tc.font = { bold: true };
      for (var k = 2; k <= mcols.length; k++) row.getCell(k).numFmt = '#,##0.00';
    });
    wm.addRow([]); wm.addRow(['Values are tonnes CO2e. Scope columns are the sum of the category columns for that scope.']).font = { italic: true, color: { argb: 'FF6B7280' } };

    /* ---- Entries */
    var we = wb.addWorksheet('Entries', { views: [{ state: 'frozen', ySplit: 1 }] });
    we.addRow(['Scope', 'Category', 'Month', 'Year', 'Description', 'Detail', 'kg CO2e', 't CO2e', 'Source row']); head(we.getRow(1));
    [8, 30, 12, 8, 46, 34, 14, 12, 11].forEach(function (w, i) { we.getColumn(i + 1).width = w; });
    S.entries.forEach(function (e) { var row = we.addRow([e.scope, e.category, e.month, e.year, e.description, e.detail, round(e.kg, 3), round(e.t, 6), e.row]); row.getCell(7).numFmt = '#,##0.00'; row.getCell(8).numFmt = '#,##0.0000'; });
    we.autoFilter = { from: 'A1', to: 'I1' };

    /* ---- Data quality */
    var wq = wb.addWorksheet('Data quality');
    wq.addRow(['Level', 'Source sheet', 'Row', 'Month', 'Year', 'What happened']); head(wq.getRow(1));
    [10, 26, 8, 12, 8, 90].forEach(function (w, i) { wq.getColumn(i + 1).width = w; });
    if (!S.issues.length) wq.addRow(['', 'No problems found.']);
    S.issues.forEach(function (x) { wq.addRow([x.level === 'error' ? 'Excluded' : 'Check', x.sheet || '', x.row || '', x.month || '', x.year || '', x.msg]); });

    /* ---- Method and sources */
    var wd = wb.addWorksheet('Method and sources');
    wd.getColumn(1).width = 30; wd.getColumn(2).width = 90; wd.getColumn(3).width = 46;
    wd.getCell('A1').value = 'How the numbers were calculated'; wd.getCell('A1').font = { bold: true, size: 13 };
    METHOD.forEach(function (t, i) { var c = wd.getCell(3 + i, 1); c.value = t; wd.mergeCells(3 + i, 1, 3 + i, 3); c.alignment = { wrapText: true, vertical: 'top' }; wd.getRow(3 + i).height = 34; });
    var q = 4 + METHOD.length;
    wd.getCell(q, 1).value = 'Emission factor sources'; wd.getCell(q, 1).font = { bold: true, size: 13 }; q++;
    wd.getRow(q).values = ['Applies to', 'Source', 'Status']; head(wd.getRow(q)); q++;
    ((sources && sources.sources) || []).forEach(function (s) {
      var row = wd.getRow(q++); row.values = [s.applies_to.join('; '), s.title + '\n' + s.links.join('\n'), s.status];
      row.eachCell(function (c) { c.alignment = { wrapText: true, vertical: 'top' }; }); row.height = 60;
    });
    wd.getCell(q + 1, 1).value = 'Emission factors are drawn from the sources above and are being independently verified. Treat results as estimates until the factor library is marked verified.';
    wd.mergeCells(q + 1, 1, q + 1, 3); wd.getCell(q + 1, 1).alignment = { wrapText: true }; wd.getRow(q + 1).height = 32;

    return wb.xlsx.writeBuffer();
  }

  var api = { VERSION: VERSION, summarise: summarise, buildWorkbook: buildWorkbook, entriesCsv: entriesCsv, METHOD: METHOD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GHGEXP = api;
})(typeof window !== 'undefined' ? window : this);
