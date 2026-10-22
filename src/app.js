(function () {
  'use strict';
  var F = window.GHG_FACTORS, E = window.GHG, X = window.GHGX, XP = window.GHGEXP, XC = window.GHGCHART, SRC = window.GHG_SOURCES || { sources: [] }, MONTHS = E.MONTHS;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k === 'style') el.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else el.setAttribute(k, v);
    }
    (kids || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  }
  function put(p, el) { if (el) p.appendChild(el); return el; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtT(t) {
    if (t === null || t === undefined || isNaN(t)) return '–';
    if (t === 0) return '0';
    var a = Math.abs(t);
    if (a < 0.01) return t.toPrecision(2);
    var d = a >= 1000 ? 0 : a >= 100 ? 1 : 2;
    return t.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(v, of) { return of ? (v / of * 100).toFixed(of && v / of < 0.001 ? 2 : 1) + '%' : '–'; }
  function tick(n) { return n >= 1000 ? (n / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'K' : String(+n.toPrecision(3)); }

  /* ------------------------------------------------------------ taxonomy */
  var SCOPES = {
    1: { name: 'Scope 1', desc: 'Direct emissions', long: 'Direct emissions from sources you own or control', c: 'var(--s1)', cats: ['fuel', 'mobile', 'hvac', 'sf6', 'fire'] },
    2: { name: 'Scope 2', desc: 'Purchased energy', long: 'Indirect emissions from the electricity you buy', c: 'var(--s2)', cats: ['elec'] },
    3: { name: 'Scope 3', desc: 'Value chain', long: 'Other indirect emissions across your value chain', c: 'var(--s3)', cats: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'food'] }
  };
  var CAT = {
    fuel: { label: 'Stationary combustion', desc: 'Fuel burned on site in generators, boilers and kitchens', mods: ['fuel'] },
    mobile: { label: 'Mobile combustion', desc: 'Company-owned vehicles and mobile machinery', mods: ['mobile'] },
    hvac: { label: 'Refrigerant leaks', desc: 'Leakage from air conditioning and refrigeration', mods: ['hvac'] },
    sf6: { label: 'SF₆ circuit breakers', desc: 'Insulating gas leaking from switchgear', mods: ['sf6'] },
    fire: { label: 'Fire extinguishers', desc: 'Discharge and leakage of CO₂ extinguishers', mods: ['fire'] },
    elec: { label: 'Purchased electricity', desc: 'Grid electricity, location-based method', mods: ['elec'] },
    c1: { label: 'C1 Purchased goods & services', desc: 'Spend-based, from the purchased goods sheet', mods: ['purchased'] },
    c2: { label: 'C2 Capital goods', desc: 'Spend-based, from the capital goods sheet', mods: ['capital'] },
    c3: { label: 'C3 Fuel- & energy-related', desc: 'Upstream emissions of fuels, and grid transmission losses', mods: ['fuel', 'elec'], derived: true },
    c4: { label: 'C4 Upstream transport', desc: 'Transport of purchased and capital goods, spend-based', mods: ['purchased', 'capital'], derived: true },
    c5: { label: 'C5 Waste', desc: 'Treatment and disposal of waste, including transport', mods: ['waste'] },
    c6: { label: 'C6 Business travel', desc: 'Business trips by road and air', mods: ['travelRoad', 'air'] },
    c7: { label: 'C7 Employee commuting', desc: 'Employees travelling to and from work', mods: ['commute'] },
    food: { label: 'Food consumption', desc: 'Food served on site', mods: ['food'] }
  };
  Object.keys(SCOPES).forEach(function (s) { SCOPES[s].cats.forEach(function (id, i) { CAT[id].scope = +s; CAT[id].c = +s === 2 ? 'var(--s2)' : 'var(--c' + (i + 1) + ')'; }); });
  var MOD_TABLE = { elec: 'electricity' };
  function tableOf(mod) { return MOD_TABLE[mod] || mod; }
  var TBL = {}; X.TABLES.forEach(function (t) { TBL[t.id] = t; });
  var PRIMARY = { fuel: 'fuel', mobile: 'mobile', hvac: 'hvac', sf6: 'sf6', fire: 'fire', elec: 'elec', purchased: 'c1', capital: 'c2', waste: 'c5', travelRoad: 'c6', air: 'c6', commute: 'c7', food: 'food' };

  /* ------------------------------------------------------------ state + persistence */
  var KEY = 'ghg-inventory-v1';
  function emptyData() { var d = {}; X.TABLES.forEach(function (t) { d[t.id] = []; }); return d; }
  var S = { data: emptyData(), basis: 'fy', period: null, sample: false, showIssues: false, busy: false, msg: null };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && saved.data) { S.data = Object.assign(emptyData(), saved.data); S.sample = !!saved.sample; S.basis = saved.basis || 'fy'; } } catch (e) { /* storage unavailable */ }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify({ data: S.data, sample: S.sample, basis: S.basis })); } catch (e) { /* ignore */ } }
  function hasData() { return X.TABLES.some(function (t) { return (S.data[t.id] || []).length > 0; }); }

  var R = null, CONTRIB = {}, ROWISS = {};
  function recalc() {
    R = E.compute(S.data, F);
    CONTRIB = {}; ROWISS = {};
    R.rows.forEach(function (r) { var k = r.module + '#' + r.row; (CONTRIB[k] = CONTRIB[k] || {}); CONTRIB[k][r.cat] = (CONTRIB[k][r.cat] || 0) + r.kg; });
    R.issues.forEach(function (i) { var k = i.module + '#' + i.row; (ROWISS[k] = ROWISS[k] || []).push(i); });
    if (S.period !== null && !groups().some(function (g) { return String(g.key) === String(S.period); }) && S.period !== 'all') S.period = null;
  }
  function groups() { return S.basis === 'fy' ? R.fiscal : R.calendar; }
  function period() {
    if (S.period !== null) return S.period;
    var gs = groups(), full = gs.filter(function (g) { return g.months === 12; });
    return full.length ? full[full.length - 1].key : 'all';
  }
  function periodLabel() { var p = period(); if (p === 'all') return 'All periods'; var g = groups().filter(function (x) { return String(x.key) === String(p); })[0]; return g ? g.label : String(p); }
  function inPeriod(y, mi) { var p = period(); if (p === 'all') return true; return String(S.basis === 'fy' ? E.fyOf(y, mi) : y) === String(p); }
  function selMonths() { return R.months.filter(function (m) { return inPeriod(m.y, m.mi); }); }
  function sumSel(ms) {
    var o = { kg: {}, t: { 1: 0, 2: 0, 3: 0 }, total: 0 }; Object.keys(CAT).forEach(function (c) { o.kg[c] = 0; });
    ms.forEach(function (m) { for (var c in o.kg) o.kg[c] += m.kg[c]; [1, 2, 3].forEach(function (s) { o.t[s] += m.t[s]; }); o.total += m.total; });
    return o;
  }

  /* ------------------------------------------------------------ tooltip */
  var tip = $('#tip');
  function showTip(html, ev) {
    tip.innerHTML = html; tip.style.display = 'block';
    var w = tip.offsetWidth, hh = tip.offsetHeight, x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
    if (y + hh > window.innerHeight - 8) y = ev.clientY - hh - 14;
    tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { tip.style.display = 'none'; }
  function hoverTip(el, fn) { el.addEventListener('pointermove', function (ev) { showTip(fn(), ev); }); el.addEventListener('pointerleave', hideTip); }

  /* ------------------------------------------------------------ charts */
  function niceStep(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function topRound(x, y, w, hg, r) { r = Math.min(r, hg, w / 2); return 'M' + x + ',' + (y + hg) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + hg) + 'Z'; }
  function legend(series) { return series.length < 2 ? null : h('div', { class: 'legend' }, series.map(function (s) { return h('span', null, [h('i', { class: 'sw', style: 'background:' + s.c }), s.name]); })); }
  function columns(host, items, series, opts) {
    opts = opts || {};
    host.innerHTML = '';
    if (!items.length) { host.appendChild(h('div', { class: 'empty' }, ['No data for this period.'])); return; }
    var avail = Math.max(300, host.clientWidth || 700), L = 44, Rr = 16, T = 20, B = 40, H = opts.height || 260;
    var slot = Math.max(20, (avail - L - Rr) / items.length), W = Math.max(avail, L + Rr + slot * items.length), bw = Math.min(24, slot - 6);
    var raw = Math.max.apply(null, items.map(function (x) { return x.total; })) / 1000, step = niceStep(raw / 4), max = Math.max(step, Math.ceil(raw / step) * step), y = function (t) { return T + (H - T - B) * (1 - t / max); };
    var s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(opts.label || 'Monthly emissions') + '">';
    for (var g = 0; g * step <= max + 1e-9; g++) { var gv = g * step; s += '<line class="' + (g ? 'gl' : 'ax') + '" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(gv) + '" y2="' + y(gv) + '"/><text x="' + (L - 8) + '" y="' + (y(gv) + 4) + '" text-anchor="end">' + tick(gv) + '</text>'; }
    s += '<text x="' + L + '" y="11">tCO₂e</text>';
    var every = slot >= 30 ? 1 : slot >= 22 ? 2 : 3;
    items.forEach(function (it, i) {
      var cx = L + slot * i + slot / 2, x0 = cx - bw / 2, acc = 0, top = null;
      series.forEach(function (sr) { if (it.v[sr.id] > 0) top = sr.id; });
      s += '<g class="col"><rect class="band" x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B) + '"/>';
      series.forEach(function (sr) {
        var v = (it.v[sr.id] || 0) / 1000; if (v <= 0) return;
        var y1 = y(acc + v), hg = y(acc) - y1, gap = acc > 0 ? 2 : 0, hh = Math.max(1, hg - gap);
        s += sr.id === top ? '<path d="' + topRound(x0, y1, bw, hh, 4) + '" fill="' + sr.c + '"/>' : '<rect x="' + x0 + '" y="' + y1 + '" width="' + bw + '" height="' + hh + '" fill="' + sr.c + '"/>';
        acc += v;
      });
      if (i % every === 0) s += '<text x="' + cx + '" y="' + (H - B + 15) + '" text-anchor="middle">' + esc(it.label) + '</text>' + (it.sub ? '<text x="' + cx + '" y="' + (H - B + 28) + '" text-anchor="middle" style="fill:var(--muted)">' + esc(it.sub) + '</text>' : '');
      s += '<rect class="hit" data-i="' + i + '" x="' + (L + slot * i) + '" y="' + T + '" width="' + slot + '" height="' + (H - T - B) + '"/></g>';
    });
    host.innerHTML = s + '</svg>';
    host.querySelectorAll('.hit').forEach(function (el) {
      var it = items[+el.getAttribute('data-i')];
      hoverTip(el, function () {
        var rows = series.filter(function (sr) { return it.v[sr.id] > 0 || series.length <= 3; }).map(function (sr) { return '<div class="r"><span><i class="sw" style="background:' + sr.c + '"></i>' + esc(sr.name) + '</span><b>' + fmtT((it.v[sr.id] || 0) / 1000) + '</b></div>'; }).join('');
        return '<b>' + esc(it.title) + '</b>' + rows + (series.length > 1 ? '<div class="r tot"><span>Total</span><b>' + fmtT(it.total / 1000) + ' t</b></div>' : '');
      });
      el.addEventListener('pointerdown', function (ev) { showTip(tip.innerHTML, ev); });
    });
  }
  function monthItems(ms, valFn) {
    return ms.map(function (m, i) { var v = valFn(m), tot = 0; for (var k in v) tot += v[k]; return { label: MONTHS[m.mi].slice(0, 3), sub: (m.mi === 0 || i === 0) ? String(m.y) : '', title: MONTHS[m.mi] + ' ' + m.y, v: v, total: tot }; });
  }
  function hbar(segs, total, small) {
    var bar = h('div', { class: 'hbar' + (small ? ' sm' : ''), role: 'list' });
    segs.filter(function (s) { return s.v > 0; }).forEach(function (sg) {
      var share = sg.v / total, a = h('a', { class: 'seg2', role: 'listitem', href: sg.href || null, style: 'width:' + (share * 100).toFixed(3) + '%;background:' + sg.c, 'data-p': pct(sg.v, total), 'aria-label': sg.name + ' ' + fmtT(sg.v / 1000) + ' tonnes, ' + pct(sg.v, total) }, [sg.short ? sg.short + '  ' + pct(sg.v, total) : pct(sg.v, total)]);
      hoverTip(a, function () { return '<b>' + esc(sg.name) + '</b><div class="r"><span>Emissions</span><b>' + fmtT(sg.v / 1000) + ' t</b></div><div class="r"><span>Share</span><b>' + pct(sg.v, total) + '</b></div>' + (sg.href ? '<div class="hint" style="margin-top:4px">Click for the breakdown</div>' : ''); });
      bar.appendChild(a);
    });
    requestAnimationFrame(function () {
      bar.querySelectorAll('.seg2').forEach(function (el) {
        var m = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g); if (m) { var lum = (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; el.style.color = lum > 0.6 ? '#0b0b0b' : '#ffffff'; }
        if (el.scrollWidth > el.clientWidth + 1) el.textContent = el.getAttribute('data-p');
        if (el.scrollWidth > el.clientWidth + 1) el.textContent = '';
      });
    });
    return bar;
  }
  function rankList(items, total, opts) {
    opts = opts || {};
    var box = h('div', { class: 'rank' }), mx = items.length ? items[0].v : 1;
    items.forEach(function (it) {
      var kids = [h('div', { class: 'nm' }, [h('i', { class: 'sw', style: 'background:' + it.c }), h('span', { title: it.name }, [it.name])]),
        h('div', { class: 'tb' }, [h('div', { class: 'trk', style: 'width:' + Math.max(0.4, it.v / mx * 100).toFixed(2) + '%;background:' + it.c })]),
        h('div', { class: 'v' }, [fmtT(it.v / 1000) + ' t']), h('div', { class: 'p' }, [pct(it.v, total)]), h('div', { class: 'chev' }, [it.href ? '›' : ''])];
      box.appendChild(it.href ? h('a', { href: it.href }, kids) : h('div', { class: 'row' }, kids));
    });
    return box;
  }

  /* ------------------------------------------------------------ files */
  function saveBlob(name, blob) {
    function anchor() { try { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); } catch (e) { alert('Download is blocked in this view.'); } }
    if (window.claude && window.claude.use) {
      window.claude.use('downloads').then(function (d) {
        if (!d) return anchor();
        d.save({ filename: name, data: blob }).catch(function (e) { if (e && e.code !== 'declined') alert('Could not save ' + name + ' (' + (e.code || e.message) + ').'); });
      }, anchor);
    } else anchor();
  }
  function needXL() { if (!window.ExcelJS) { alert('The Excel library did not load. Check your connection and reload the page.'); return false; } return true; }
  function downloadTemplate(ids, name, label, withData) {
    if (!needXL()) return;
    X.buildTemplate(window.ExcelJS, F, ids, withData ? S.data : null, label).then(function (buf) {
      saveBlob(name, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }, function (e) { alert('Could not build the template: ' + e.message); });
  }
  function idsForScope(s) { return X.TABLES.filter(function (t) { return !s || t.scope === s; }).map(function (t) { return t.id; }); }
  function importFiles(files) {
    if (!files || !files.length || !needXL()) return;
    S.busy = true; render();
    var list = Array.prototype.slice.call(files), found = [], skipped = [], failed = [];
    var next = function () {
      if (!list.length) {
        S.busy = false;
        recalc();
        S.msg = found.length ? { kind: 'ok', found: found, skipped: skipped, failed: failed } : { kind: 'err', text: 'Nothing was imported. ' + (failed.length ? failed.join(' ') : 'No sheet names matched the template. Download a fresh template and keep the sheet names unchanged.') };
        persist(); render(); return;
      }
      var f = list.shift();
      if (!/\.(xlsx|xlsm|xls)$/i.test(f.name)) { failed.push(f.name + ' is not an Excel file.'); return next(); }
      f.arrayBuffer().then(function (buf) { if (!window.XLSX) throw new Error('the spreadsheet reader did not load'); return X.parseWorkbook(window.XLSX, buf); }).then(function (res) {
        if (res.found.some(function (fd) { return fd.n > 0; }) && S.sample) { S.data = emptyData(); S.sample = false; }
        res.found.forEach(function (fd) { if (!fd.n) return; S.data[fd.id] = res.tables[fd.id]; found.push(fd); });
        res.skipped.forEach(function (s) { skipped.push(f.name + ': ' + s); });
      }, function (e) { failed.push(f.name + ' could not be read (' + e.message + ').'); }).then(next);
    };
    next();
  }

  /* ------------------------------------------------------------ sample data */
  function sampleData() { return window.GHGSAMPLE.sampleData(X, emptyData, MONTHS); }

  /* ------------------------------------------------------------ shared pieces */
  function filters() {
    var gs = groups(), p = String(period());
    var sel = h('select', { class: 'sel', 'aria-label': 'Reporting period', onchange: function (e) { S.period = e.target.value; render(); } },
      [h('option', { value: 'all', selected: p === 'all' }, ['All periods'])].concat(gs.slice().reverse().map(function (g) { return h('option', { value: g.key, selected: p === String(g.key) }, [g.label + (g.months < 12 ? ' (' + g.months + ' months)' : '')]); })));
    return h('div', { class: 'filters' }, [h('div', { class: 'seg', role: 'group', 'aria-label': 'Year basis' }, [['fy', 'Financial year'], ['cal', 'Calendar year']].map(function (b) {
      return h('button', { 'aria-pressed': S.basis === b[0], onclick: function () { S.basis = b[0]; S.period = null; persist(); recalc(); render(); } }, [b[1]]);
    })), sel]);
  }
  function sampleNotice() {
    return S.sample ? h('div', { class: 'notice info' }, [h('span', null, ['You are viewing sample data for an invented facility. Upload your own file to replace it.']),
      h('span', { class: 'row-btns' }, [h('a', { class: 'btn sm', href: '#/data' }, ['Upload data']), h('button', { class: 'btn sm', onclick: function () { S.data = emptyData(); S.sample = false; persist(); recalc(); location.hash = '#/'; render(); } }, ['Clear sample'])])]) : null;
  }
  function issueRef(i) { var t = TBL[tableOf(i.module)]; var src = (S.data[tableOf(i.module)] || [])[i.row - 1] || {}; return { sheet: t ? t.sheet : i.sheet, xlrow: src._xlrow || null, cat: PRIMARY[i.module] }; }
  function issuesNotice() {
    var errs = R.issues.filter(function (i) { return i.level === 'error'; });
    if (!R.issues.length) return null;
    var box = h('div', { class: 'notice ' + (errs.length ? 'err' : 'info'), style: 'display:block' });
    box.appendChild(h('div', { style: 'display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap' }, [
      h('span', null, [errs.length ? '✖ ' + errs.length + ' row' + (errs.length > 1 ? 's' : '') + ' could not be calculated and ' + (errs.length > 1 ? 'are' : 'is') + ' left out of the totals.' : '', R.warnings ? (errs.length ? ' ' : '⚠ ') + R.warnings + ' warning' + (R.warnings > 1 ? 's' : '') + '.' : '']),
      h('button', { class: 'btn sm', onclick: function () { S.showIssues = !S.showIssues; render(); } }, [S.showIssues ? 'Hide' : 'Show rows'])]));
    if (S.showIssues) {
      var t = h('table', { class: 't', style: 'margin-top:10px;background:var(--surface);border-radius:8px' });
      t.appendChild(h('thead', null, [h('tr', null, ['', 'Sheet', 'Excel row', 'Problem', ''].map(function (x) { return h('th', null, [x]); }))]));
      var b = h('tbody');
      R.issues.forEach(function (i) {
        var ref = issueRef(i), sc = CAT[ref.cat] ? CAT[ref.cat].scope : 1;
        b.appendChild(h('tr', null, [h('td', null, [h('span', { class: 'badge ' + (i.level === 'error' ? 'err' : 'warn') }, [i.level === 'error' ? 'Excluded' : 'Warning'])]), h('td', null, [ref.sheet]), h('td', null, [ref.xlrow ? String(ref.xlrow) : String(i.row)]), h('td', { style: 'color:var(--ink)' }, [i.msg]),
          h('td', null, [h('a', { class: 'btn sm', href: '#/scope/' + sc + '/' + ref.cat }, ['View'])])]));
      });
      t.appendChild(b); box.appendChild(h('div', { style: 'overflow-x:auto' }, [t]));
    }
    return box;
  }
  function templateButtons() {
    var pick = h('select', { class: 'sel', 'aria-label': 'Choose one source' }, [h('option', { value: '' }, ['One source…'])].concat([1, 2, 3].map(function (s) {
      return h('optgroup', { label: SCOPES[s].name }, X.TABLES.filter(function (t) { return t.scope === s; }).map(function (t) { return h('option', { value: t.id }, [t.title]); }));
    })));
    pick.addEventListener('change', function () { var t = TBL[pick.value]; if (t) downloadTemplate([t.id], 'GHG template - ' + t.sheet + '.xlsx', t.title); pick.value = ''; });
    return h('div', { class: 'row-btns' }, [
      h('button', { class: 'btn primary', onclick: function () { downloadTemplate(idsForScope(0), 'GHG template - all scopes.xlsx', 'All scopes'); } }, ['↓ Full template']),
      h('button', { class: 'btn', onclick: function () { downloadTemplate(idsForScope(1), 'GHG template - Scope 1.xlsx', 'Scope 1'); } }, ['Scope 1']),
      h('button', { class: 'btn', onclick: function () { downloadTemplate(idsForScope(2), 'GHG template - Scope 2.xlsx', 'Scope 2'); } }, ['Scope 2']),
      h('button', { class: 'btn', onclick: function () { downloadTemplate(idsForScope(3), 'GHG template - Scope 3.xlsx', 'Scope 3'); } }, ['Scope 3']), pick]);
  }
  function uploadZone() {
    var inp = h('input', { type: 'file', class: 'file', accept: '.xlsx,.xlsm,.xls', multiple: 'multiple' });
    inp.addEventListener('change', function () { importFiles(inp.files); inp.value = ''; });
    var z = h('div', { class: 'drop', role: 'button', tabindex: '0', onclick: function () { inp.click(); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } } },
      S.busy ? [h('span', { class: 'spin' }), ' Reading your file…'] : [h('b', null, ['Drop your filled template here']), h('div', { class: 'hint', style: 'margin-top:4px' }, ['or click to choose a file · .xlsx · you can upload several files'])]);
    z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('over'); });
    z.addEventListener('dragleave', function () { z.classList.remove('over'); });
    z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('over'); importFiles(e.dataTransfer.files); });
    return h('div', null, [z, inp]);
  }
  function importMsg() {
    if (!S.msg) return null;
    var m = S.msg, box;
    if (m.kind === 'err') box = h('div', { class: 'notice err' }, [m.text]);
    else {
      var n = m.found.reduce(function (a, b) { return a + b.n; }, 0);
      box = h('div', { class: 'notice ok', style: 'display:block' }, [h('b', null, ['Imported ' + n + ' row' + (n === 1 ? '' : 's') + ' from ' + m.found.length + ' sheet' + (m.found.length > 1 ? 's' : '') + '. ']),
        R.errors ? h('span', null, [R.errors + ' row' + (R.errors > 1 ? 's have' : ' has') + ' a problem and ' + (R.errors > 1 ? 'are' : 'is') + ' left out. ']) : 'Every row was calculated. ',
        h('a', { href: '#/', style: 'font-weight:600' }, ['See the results ›']),
        m.skipped.length ? h('div', { class: 'hint', style: 'margin-top:4px' }, ['Ignored: ' + m.skipped.join('; ')]) : null,
        m.failed.length ? h('div', { style: 'margin-top:4px;color:var(--err)' }, [m.failed.join(' ')]) : null]);
    }
    return box;
  }

  /* ------------------------------------------------------------ pages */
  function pageOnboarding(root) {
    put(root, h('div', { class: 'onb' }, [
      h('h1', null, ['Measure your organisation’s carbon footprint']),
      h('p', { class: 'lead' }, ['Fill in a spreadsheet of your activity data, upload it, and get your Scope 1, 2 and 3 emissions broken down to every source.']),
      h('div', { class: 'step' }, [h('div', { class: 'no' }, ['1']), h('div', null, [h('h3', null, ['Download the template']), h('p', null, ['One sheet per source, with dropdowns for fuels, vehicles, refrigerants and units. Take the full template, or only the scopes you are collecting now.']), templateButtons()])]),
      h('div', { class: 'step' }, [h('div', { class: 'no' }, ['2']), h('div', null, [h('h3', null, ['Fill it in and upload it']), h('p', null, ['One row per item per month. Leave sheets empty if they do not apply to you.']), importMsg(), uploadZone()])]),
      h('p', { class: 'hint', style: 'text-align:center;margin-top:18px' }, ['Just looking? ', h('button', { class: 'linkbtn', onclick: function () { S.data = sampleData(); S.sample = true; S.msg = null; S.period = null; persist(); recalc(); render(); } }, ['Explore with sample data'])])
    ]));
  }
  function pageOverview(root) {
    var ms = selMonths(), sum = sumSel(ms);
    put(root, sampleNotice());
    put(root, h('div', { class: 'head' }, [h('h1', { class: 'pg' }, ['Overview']), filters()]));
    put(root, importMsg());
    put(root, issuesNotice());
    var first = ms[0], last = ms[ms.length - 1];
    var hero = h('div', { class: 'card hero' }, [sum.total > 0 ? chartTools(function () { return specScopes(sum); }) : null, h('div', { class: 'lbl' }, ['Total emissions · ' + periodLabel()]),
      h('div', null, [h('span', { class: 'num' }, [fmtT(sum.total / 1000)]), h('span', { class: 'unit' }, ['tCO₂e'])]),
      h('div', { class: 'meta' }, [ms.length ? ms.length + ' month' + (ms.length > 1 ? 's' : '') + ' of data, ' + MONTHS[first.mi].slice(0, 3) + ' ' + first.y + ' to ' + MONTHS[last.mi].slice(0, 3) + ' ' + last.y : 'No data in this period']),
      sum.total > 0 ? hbar([1, 2, 3].map(function (s) { return { name: SCOPES[s].name + ' · ' + SCOPES[s].desc, short: SCOPES[s].name, v: sum.t[s], c: SCOPES[s].c, href: '#/scope/' + s }; }), sum.total) : null]);
    put(root, hero);
    put(root, h('div', { class: 'scopes' }, [1, 2, 3].map(function (s) {
      return h('a', { class: 'scard', href: '#/scope/' + s }, [h('div', { class: 't' }, [h('i', { class: 'sw', style: 'background:' + SCOPES[s].c }), SCOPES[s].name]), h('div', { class: 'd' }, [SCOPES[s].long]),
        h('div', { class: 'v' }, [fmtT(sum.t[s] / 1000), h('small', null, ['tCO₂e'])]), h('div', { class: 'f' }, [h('span', null, [pct(sum.t[s], sum.total) + ' of total']), h('span', { class: 'go' }, ['Breakdown ›'])])]);
    })));
    var g2 = h('div', { class: 'g2 mt' });
    var series = [1, 2, 3].map(function (s) { return { id: s, name: SCOPES[s].name, c: SCOPES[s].c }; });
    var cb = h('div', { class: 'chartbox' });
    g2.appendChild(h('div', { class: 'card' }, [ms.length ? chartTools(function () { return specScopeMonths(ms); }) : null, h('h2', null, ['Month by month']), h('p', { class: 'sub' }, ['Tonnes CO₂e per month, by scope.']), legend(series), cb]));
    var top = Object.keys(CAT).map(function (id) { return { id: id, name: CAT[id].label, v: sum.kg[id], c: SCOPES[CAT[id].scope].c, href: '#/scope/' + CAT[id].scope + '/' + id }; }).filter(function (x) { return x.v > 0; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 7);
    g2.appendChild(h('div', { class: 'card' }, [top.length ? chartTools(function () { return specTopSources(sum); }) : null, h('h2', null, ['Largest sources']), h('p', { class: 'sub', style: 'margin-bottom:0' }, ['Coloured by scope. Click a source to see its detail.']), legend(series), rankList(top, sum.total)]));
    put(root, g2);
    requestAnimationFrame(function () { columns(cb, monthItems(ms, function (m) { return { 1: m.t[1], 2: m.t[2], 3: m.t[3] }; }), series, { label: 'Monthly emissions by scope' }); });
  }
  function pageScope(root, s) {
    var sc = SCOPES[s], ms = selMonths(), sum = sumSel(ms), tot = sum.t[s];
    put(root, sampleNotice());
    put(root, h('div', { class: 'crumbs' }, [h('a', { href: '#/' }, ['Overview']), '›', h('span', null, [sc.name])]));
    put(root, h('div', { class: 'head' }, [h('div', null, [h('h1', { class: 'pg' }, [sc.name + ' · ' + sc.desc]), h('div', { class: 'hint' }, [sc.long])]), filters()]));
    var items = sc.cats.map(function (id) { return { id: id, name: CAT[id].label, short: CAT[id].label, v: sum.kg[id], c: CAT[id].c, href: '#/scope/' + s + '/' + id }; });
    var withData = items.filter(function (x) { return x.v > 0; }).sort(function (a, b) { return b.v - a.v; }), none = items.filter(function (x) { return x.v <= 0; });
    put(root, h('div', { class: 'card hero' }, [tot > 0 ? chartTools(function () { return specScopeCats(s, sum); }) : null, h('div', { class: 'lbl' }, [sc.name + ' emissions · ' + periodLabel()]),
      h('div', null, [h('span', { class: 'num', style: 'font-size:48px' }, [fmtT(tot / 1000)]), h('span', { class: 'unit' }, ['tCO₂e'])]),
      h('div', { class: 'meta' }, [pct(tot, sum.total) + ' of your total emissions']),
      tot > 0 ? hbar(withData, tot, true) : null,
      withData.length ? rankList(withData, tot) : h('div', { class: 'empty' }, ['No ' + sc.name + ' data in this period.']),
      none.length ? h('p', { class: 'hint', style: 'margin:12px 8px 0' }, ['No data yet for: ' + none.map(function (x) { return x.name; }).join(', ') + '. ', h('a', { href: '#/data' }, ['Upload data'])]) : null]));
    if (withData.length) {
      var series = sc.cats.map(function (id) { return { id: id, name: CAT[id].label, c: CAT[id].c }; }).filter(function (x) { return sum.kg[x.id] > 0; });
      var cb = h('div', { class: 'chartbox' });
      put(root, h('div', { class: 'card' }, [chartTools(function () { return specScopeMonths2(s, ms, sum); }), h('h2', null, ['Month by month']), h('p', { class: 'sub' }, ['Tonnes CO₂e per month, by source.']), legend(series), cb]));
      requestAnimationFrame(function () { columns(cb, monthItems(ms, function (m) { var o = {}; series.forEach(function (x) { o[x.id] = m.kg[x.id]; }); return o; }), series, { label: sc.name + ' by month' }); });
    }
  }
  function groupKey(cat, mod, r) {
    switch (cat) {
      case 'fuel': return r.fuel || '(no fuel)';
      case 'hvac': return (r.equip || '?') + ' · ' + (r.refrigerant || '?');
      case 'fire': return (r.agent || '?') + ' · ' + (r.placement || '?');
      case 'sf6': return 'Installed ' + (r.installYear || '?');
      case 'mobile': case 'c7': return r.type ? r.cat + ' · ' + r.type : 'Fuel-based' + (r.note ? ': ' + r.note : r.fuel ? ' (' + r.fuel + ')' : '');
      case 'elec': return 'Grid electricity';
      case 'c1': case 'c2': return r.category || '(no category)';
      case 'c3': return mod === 'fuel' ? 'Upstream of ' + r.fuel : 'Grid T&D losses';
      case 'c4': return (mod === 'purchased' ? 'Purchased goods' : 'Capital goods') + ' · ' + (r.mode || '?');
      case 'c5': return (r.type || '?') + ' · ' + (r.method || '?');
      case 'c6': return mod === 'air' ? 'Air · ' + r.from + '–' + r.to : 'Road · ' + (r.type || r.fuel || '?');
      case 'food': return r.type || '?';
    }
    return '?';
  }
  function cellText(col, r) {
    var v = r[col.k];
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && (col.k === 'year' || col.k === 'installYear')) return String(v);
    if (typeof v === 'number') return v.toLocaleString('en-IN', { maximumFractionDigits: 3 });
    return String(v);
  }
  function collectCat(id) {
    var cat = CAT[id];
    var groupsMap = {}, tables = [], nRows = 0;
    cat.mods.forEach(function (mod) {
      var tid = tableOf(mod), t = TBL[tid], rows = S.data[tid] || [], list = [];
      rows.forEach(function (r, i) {
        var key = mod + '#' + (i + 1), kg = (CONTRIB[key] || {})[id] || 0, iss = ROWISS[key] || [];
        var mi = E.monthIndex(r.month), y = Number(r.year), known = mi >= 0 && y > 2000;
        if (known && !inPeriod(y, mi)) return;
        if (!known && period() !== 'all') return;
        if (cat.derived && kg <= 0) return;
        if (!cat.derived && PRIMARY[mod] !== id) return;
        list.push({ r: r, i: i, kg: kg, iss: cat.derived ? [] : iss });
        if (kg > 0) { var g = groupKey(id, mod, r); groupsMap[g] = (groupsMap[g] || 0) + kg; }
      });
      if (list.length) { tables.push({ t: t, mod: mod, list: list }); nRows += list.length; }
    });
    return { groupsMap: groupsMap, tables: tables, nRows: nRows };
  }

  /* ------------------------------------------------------------ chart images (PNG, SVG, ZIP) */
  function chartMeta() { return { org: META.org, period: periodLabel(), version: XP.VERSION }; }
  function sub1() { return 'Tonnes CO₂e · ' + periodLabel(); }
  function specScopes(sum) { return { type: 'split', title: 'Emissions by scope', subtitle: sub1(), items: [1, 2, 3].map(function (s) { return { name: SCOPES[s].name + ' · ' + SCOPES[s].desc, v: sum.t[s], c: SCOPES[s].c }; }), total: sum.total }; }
  function specScopeMonths(ms) {
    var series = [1, 2, 3].map(function (s) { return { id: s, name: SCOPES[s].name, c: SCOPES[s].c }; });
    return { type: 'columns', title: 'Monthly emissions by scope', subtitle: sub1(), series: series, items: monthItems(ms, function (m) { return { 1: m.t[1], 2: m.t[2], 3: m.t[3] }; }) };
  }
  function specTopSources(sum) {
    var items = Object.keys(CAT).map(function (id) { return { name: CAT[id].label, v: sum.kg[id], c: SCOPES[CAT[id].scope].c }; });
    return { type: 'rank', title: 'Largest emission sources', subtitle: sub1() + ' · coloured by scope', items: items, total: sum.total };
  }
  function specScopeCats(s, sum) {
    return { type: 'split', title: SCOPES[s].name + ' · ' + SCOPES[s].desc + ' by category', subtitle: sub1(), items: SCOPES[s].cats.map(function (id) { return { name: CAT[id].label, v: sum.kg[id], c: CAT[id].c }; }), total: sum.t[s] };
  }
  function specScopeMonths2(s, ms, sum) {
    var series = SCOPES[s].cats.map(function (id) { return { id: id, name: CAT[id].label, c: CAT[id].c }; }).filter(function (x) { return sum.kg[x.id] > 0; });
    return { type: 'columns', title: SCOPES[s].name + ' monthly emissions by category', subtitle: sub1(), series: series, items: monthItems(ms, function (m) { var o = {}; series.forEach(function (x) { o[x.id] = m.kg[x.id]; }); return o; }) };
  }
  function specCatGroups(id, groupsMap) {
    var items = Object.keys(groupsMap).map(function (k) { return { name: k, v: groupsMap[k], c: CAT[id].c }; });
    return { type: 'rank', title: CAT[id].label + ' by source', subtitle: sub1(), items: items };
  }
  function specCatMonths(id, ms) {
    return { type: 'columns', title: CAT[id].label + ' monthly emissions', subtitle: sub1(), series: [{ id: id, name: CAT[id].label, c: CAT[id].c }], items: monthItems(ms, function (m) { var o = {}; o[id] = m.kg[id]; return o; }) };
  }
  function allSpecs() {
    var ms = selMonths(), sum = sumSel(ms), out = [];
    if (!ms.length || sum.total <= 0) return out;
    out.push({ group: 'Overview', spec: specScopes(sum) }, { group: 'Overview', spec: specScopeMonths(ms) }, { group: 'Overview', spec: specTopSources(sum) });
    [1, 2, 3].forEach(function (s) {
      if (sum.t[s] <= 0) return;
      out.push({ group: SCOPES[s].name, spec: specScopeCats(s, sum) }, { group: SCOPES[s].name, spec: specScopeMonths2(s, ms, sum) });
      SCOPES[s].cats.forEach(function (id) {
        if (sum.kg[id] <= 0) return;
        out.push({ group: SCOPES[s].name, spec: specCatGroups(id, collectCat(id).groupsMap) }, { group: SCOPES[s].name, spec: specCatMonths(id, ms) });
      });
    });
    return out;
  }
  function downloadChart(spec, fmt) {
    var svg = XC.svg(spec, chartMeta()), stem = fileStem() + '_' + XC.slug(spec.title);
    if (fmt === 'svg') return saveBlob(stem + '.svg', new Blob([svg], { type: 'image/svg+xml' }));
    XC.toPng(svg, 2, function (err, b) { if (err) alert('Could not create the image: ' + err.message); else saveBlob(stem + '.png', b); });
  }
  function chartTools(specFn) {
    return h('div', { class: 'ct noprint' }, [h('span', { class: 'lb' }, ['Save image']),
      h('button', { class: 'btn sm', title: 'PNG image for slides and documents', onclick: function () { downloadChart(specFn(), 'png'); } }, ['PNG']),
      h('button', { class: 'btn sm', title: 'SVG, editable in PowerPoint and design tools', onclick: function () { downloadChart(specFn(), 'svg'); } }, ['SVG'])]);
  }
  function downloadAllCharts(fmt) {
    var list = allSpecs(), files = [], i = 0, meta = chartMeta();
    function done() { saveBlob(fileStem() + '_charts_' + fmt + '.zip', new Blob([XC.zip(files)], { type: 'application/zip' })); }
    (function next() {
      if (i >= list.length) return done();
      var spec = list[i].spec, svg = XC.svg(spec, meta), nm = String(i + 1).padStart(2, '0') + '_' + XC.slug(spec.title) + '.' + fmt; i++;
      if (fmt === 'svg') { files.push({ name: nm, data: XC.utf8(svg) }); return next(); }
      XC.toPng(svg, 2, function (err, b) { if (err) return alert('Could not create the images: ' + err.message); b.arrayBuffer().then(function (buf) { files.push({ name: nm, data: new Uint8Array(buf) }); next(); }); });
    })();
  }
  function chartsCard() {
    var list = allSpecs();
    var kids = [h('h2', null, ['Chart images']), h('p', { class: 'sub' }, ['Every chart for ' + periodLabel() + ' as an image for slides, reports and documents. PNG is 2560 × 1440 on a white background. SVG stays editable in PowerPoint and design tools.']),
      h('div', { class: 'row-btns' }, [h('button', { class: 'btn primary', disabled: !list.length, onclick: function () { downloadAllCharts('png'); } }, ['↓ All charts as PNG (.zip)']),
        h('button', { class: 'btn', disabled: !list.length, onclick: function () { downloadAllCharts('svg'); } }, ['↓ All charts as SVG (.zip)'])])];
    if (list.length) kids.push(h('div', { class: 'cl', id: 'chart-list' }, list.map(function (it) { return h('div', { class: 'ci' }, [h('span', null, [h('span', { class: 'k' }, [it.group]), it.spec.title]), chartTools(function () { return it.spec; })]); })));
    else kids.push(h('p', { class: 'hint', style: 'margin-top:10px' }, ['No data in this period.']));
    return h('div', { class: 'card mt', id: 'charts-card' }, kids);
  }
  function pageCategory(root, s, id) {
    var cat = CAT[id], sc = SCOPES[s], ms = selMonths(), sum = sumSel(ms), v = sum.kg[id];
    put(root, sampleNotice());
    put(root, h('div', { class: 'crumbs' }, [h('a', { href: '#/' }, ['Overview']), '›', h('a', { href: '#/scope/' + s }, [sc.name]), '›', h('span', null, [cat.label])]));
    put(root, h('div', { class: 'head' }, [h('div', null, [h('h1', { class: 'pg', style: 'display:flex;align-items:center;gap:10px' }, [h('i', { class: 'sw', style: 'width:14px;height:14px;background:' + cat.c }), cat.label]), h('div', { class: 'hint' }, [cat.desc])]), filters()]));
    var cc = collectCat(id), groupsMap = cc.groupsMap, tables = cc.tables, nRows = cc.nRows;
    var excluded = tables.reduce(function (a, tb) { return a + tb.list.filter(function (x) { return x.iss.some(function (i) { return i.level === 'error'; }); }).length; }, 0);
    put(root, h('div', { class: 'card' }, [h('div', { class: 'kv', style: 'margin-top:0' }, [
      h('div', null, [h('b', { style: 'font-size:30px' }, [fmtT(v / 1000) + ' t']), 'CO₂e · ' + periodLabel()]),
      h('div', null, [h('b', null, [pct(v, sum.t[s])]), 'of ' + sc.name]),
      h('div', null, [h('b', null, [pct(v, sum.total)]), 'of total']),
      h('div', null, [h('b', null, [String(nRows)]), 'entries']),
      excluded ? h('div', null, [h('b', { style: 'color:var(--err)' }, [String(excluded)]), 'excluded']) : null])]));
    var gItems = Object.keys(groupsMap).map(function (k) { return { name: k, v: groupsMap[k], c: cat.c }; }).sort(function (a, b) { return b.v - a.v; });
    var g2 = h('div', { class: 'g2 mt' });
    g2.appendChild(h('div', { class: 'card' }, [gItems.length ? chartTools(function () { return specCatGroups(id, groupsMap); }) : null, h('h2', null, ['What it is made of']), h('p', { class: 'sub', style: 'margin-bottom:0' }, ['Grouped by ' + ({ fuel: 'fuel', hvac: 'equipment and refrigerant', fire: 'agent', sf6: 'installation year', mobile: 'vehicle', c7: 'mode', elec: 'supply', c1: 'spend category', c2: 'spend category', c3: 'source', c4: 'goods and mode', c5: 'waste type and method', c6: 'mode and route', food: 'food type' }[id] || 'item') + '.']),
      gItems.length ? rankList(gItems, v) : h('div', { class: 'empty' }, ['No emissions in this period.'])]));
    var cb = h('div', { class: 'chartbox' });
    g2.appendChild(h('div', { class: 'card' }, [ms.length ? chartTools(function () { return specCatMonths(id, ms); }) : null, h('h2', null, ['Month by month']), h('p', { class: 'sub' }, ['Tonnes CO₂e per month.']), cb]));
    put(root, g2);
    requestAnimationFrame(function () { var o = {}; columns(cb, monthItems(ms, function (m) { o = {}; o[id] = m.kg[id]; return o; }), [{ id: id, name: cat.label, c: cat.c }], { label: cat.label + ' by month' }); });
    // entries
    var card = h('div', { class: 'card mt' }, [h('h2', null, ['Your entries']), h('p', { class: 'sub' }, [cat.derived ? 'Calculated from rows in other sheets; only rows that contribute are shown.' : 'Every row you uploaded for this source, with the emissions calculated for it.'])]);
    if (!tables.length) card.appendChild(h('div', { class: 'empty' }, ['No entries in this period. ', h('a', { href: '#/data' }, ['Upload data'])]));
    tables.forEach(function (tb) {
      if (tables.length > 1 || cat.derived) card.appendChild(h('div', { style: 'font-weight:600;font-size:13px;margin:14px 0 6px' }, ['From sheet “' + tb.t.sheet + '”']));
      var cols = tb.t.cols, tbl = h('table', { class: 't' });
      tbl.appendChild(h('thead', null, [h('tr', null, [h('th', null, ['Row'])].concat(cols.map(function (c) { return h('th', { class: c.num && c.k !== 'year' ? 'n' : '' }, [c.l]); })).concat([h('th', { class: 'n' }, ['tCO₂e']), h('th', null, ['Status'])]))]));
      var body = h('tbody'), subtotal = 0;
      tb.list.forEach(function (x) {
        var err = x.iss.filter(function (i) { return i.level === 'error'; }), warn = x.iss.filter(function (i) { return i.level !== 'error'; });
        subtotal += x.kg;
        body.appendChild(h('tr', { class: err.length ? 'x' : '' }, [h('td', { class: 'hint' }, [String(x.r._xlrow || x.i + 1)])].concat(cols.map(function (c) { return h('td', { class: c.num && c.k !== 'year' ? 'n' : '' }, [cellText(c, x.r)]); })).concat([
          h('td', { class: 'n', style: 'font-weight:600;color:var(--ink)' }, [err.length ? '–' : fmtT(x.kg / 1000)]),
          h('td', null, err.length ? [h('span', { class: 'badge err', title: err[0].msg }, ['Excluded']), h('div', { class: 'hint', style: 'max-width:260px' }, [err[0].msg])] : warn.length ? [h('span', { class: 'badge warn' }, ['Check']), h('div', { class: 'hint', style: 'max-width:260px' }, [warn[0].msg])] : [h('span', { class: 'badge ok' }, ['✓'])])])));
      });
      body.appendChild(h('tr', { class: 'tot' }, [h('td', { colspan: cols.length + 1 }, ['Total']), h('td', { class: 'n' }, [fmtT(subtotal / 1000)]), h('td')]));
      tbl.appendChild(body);
      card.appendChild(h('div', { class: 'scroll' }, [tbl]));
    });
    put(root, card);
  }
  function pageData(root) {
    put(root, h('div', { class: 'head' }, [h('div', null, [h('h1', { class: 'pg' }, ['Upload data']), h('div', { class: 'hint' }, ['Download a template, fill it, and upload it. Each sheet you upload replaces what is loaded for that source.'])])]));
    put(root, h('div', { class: 'step' }, [h('div', { class: 'no' }, ['1']), h('div', null, [h('h3', null, ['Download a template']), h('p', null, ['Dropdowns for every list field. Required columns are marked *.']), templateButtons()])]));
    put(root, h('div', { class: 'step' }, [h('div', { class: 'no' }, ['2']), h('div', null, [h('h3', null, ['Upload your filled file']), h('p', null, ['You can upload one file with every sheet, or separate files per scope.']), importMsg(), uploadZone()])]));
    var card = h('div', { class: 'card mt' }, [h('div', { style: 'display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:10px' }, [
      h('div', null, [h('h2', null, ['Loaded data']), h('p', { class: 'sub', style: 'margin:0' }, [S.sample ? 'Sample data is loaded.' : 'What the calculator is using now.'])]),
      h('div', { class: 'row-btns' }, [hasData() ? h('button', { class: 'btn sm', onclick: function () { downloadTemplate(idsForScope(0), 'GHG inputs - loaded data.xlsx', 'Loaded data', true); } }, ['↓ Download loaded data']) : null,
        hasData() ? h('button', { class: 'btn sm', onclick: function () { if (!confirm('Remove all loaded data?')) return; S.data = emptyData(); S.sample = false; S.msg = null; persist(); recalc(); render(); } }, ['Clear all']) : null])])]);
    var t = h('table', { class: 't' });
    t.appendChild(h('thead', null, [h('tr', null, ['Sheet', 'Scope', 'Rows', 'Period', 'Problems', ''].map(function (x, i) { return h('th', { class: i === 2 ? 'n' : '' }, [x]); }))]));
    var b = h('tbody');
    X.TABLES.forEach(function (tb) {
      var rows = S.data[tb.id] || [], mod = tb.id === 'electricity' ? 'elec' : tb.id;
      var ks = rows.map(function (r) { var mi = E.monthIndex(r.month); return mi >= 0 && r.year ? Number(r.year) * 12 + mi : null; }).filter(function (x) { return x !== null; });
      var lo = ks.length ? Math.min.apply(null, ks) : null, hi = ks.length ? Math.max.apply(null, ks) : null;
      var iss = R.issues.filter(function (i) { return i.module === mod; }), errs = iss.filter(function (i) { return i.level === 'error'; }).length;
      b.appendChild(h('tr', { class: rows.length ? '' : 'x' }, [h('td', null, [tb.sheet]), h('td', null, ['Scope ' + tb.scope]), h('td', { class: 'n' }, [String(rows.length)]),
        h('td', null, [lo !== null ? MONTHS[lo % 12].slice(0, 3) + ' ' + Math.floor(lo / 12) + ' – ' + MONTHS[hi % 12].slice(0, 3) + ' ' + Math.floor(hi / 12) : '–']),
        h('td', null, [rows.length ? (errs ? h('span', { class: 'badge err' }, [errs + ' excluded']) : iss.length ? h('span', { class: 'badge warn' }, [iss.length + ' to check']) : h('span', { class: 'badge ok' }, ['✓ none'])) : '']),
        h('td', null, [rows.length ? h('button', { class: 'btn sm', onclick: function () { S.data[tb.id] = []; if (!hasData()) S.sample = false; persist(); recalc(); render(); } }, ['Remove']) : null])]));
    });
    t.appendChild(b); card.appendChild(h('div', { style: 'overflow-x:auto' }, [t]));
    put(root, card);
  }


  /* ------------------------------------------------------------ export + report */
  var META_KEY = 'ghg-report-meta';
  var META = { org: '', preparedBy: '', title: '', notes: '' };
  try { var sm = JSON.parse(localStorage.getItem(META_KEY) || 'null'); if (sm) META = Object.assign(META, sm); } catch (e) { /* ignore */ }
  function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch (e) { /* ignore */ } }
  function summary() { return XP.summarise(R, E, { basis: S.basis, period: period() }); }
  function fileStem() { return ((META.org || 'GHG inventory') + ' ' + periodLabel()).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_'); }
  function exportXlsx() {
    if (!needXL()) return;
    XP.buildWorkbook(window.ExcelJS, summary(), META, SRC).then(function (buf) {
      saveBlob(fileStem() + '_summary.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }, function (e) { alert('Could not build the Excel summary: ' + e.message); });
  }
  function exportCsv() { saveBlob(fileStem() + '_entries.csv', new Blob([XP.entriesCsv(summary())], { type: 'text/csv;charset=utf-8' })); }
  function field(label, key, opts) {
    opts = opts || {};
    var inp = h(opts.area ? 'textarea' : 'input', { class: 'inp', type: 'text', value: META[key], placeholder: opts.ph || '', rows: opts.area ? 3 : null, 'aria-label': label, oninput: function (e) { META[key] = e.target.value; saveMeta(); } });
    if (opts.area) inp.textContent = META[key];
    return h('label', { class: 'fld' }, [h('span', null, [label]), inp]);
  }
  function pageExport(root) {
    var ms = selMonths(), q = R.errors;
    put(root, h('div', { class: 'head' }, [h('div', null, [h('h1', { class: 'pg' }, ['Export']), h('div', { class: 'hint' }, ['Take the results out as an Excel summary, a CSV of every entry, or a printable report.'])]), filters()]));
    if (q) put(root, h('div', { class: 'notice err' }, [h('span', null, [q + ' data row' + (q > 1 ? 's' : '') + ' could not be calculated and ' + (q > 1 ? 'are' : 'is') + ' left out of the totals. Every export lists them.']), h('a', { class: 'btn sm', href: '#/data' }, ['Review data'])]));
    put(root, h('div', { class: 'card' }, [h('h2', null, ['About this report']), h('p', { class: 'sub' }, ['Shown on the Excel summary and the printable report. Kept on this device only.']),
      h('div', { class: 'flds' }, [field('Organisation', 'org', { ph: 'Organisation name' }), field('Prepared by', 'preparedBy', { ph: 'Your name' }), field('Report title', 'title', { ph: 'Greenhouse gas inventory' })]),
      field('Notes for the reader', 'notes', { area: true, ph: 'Scope, boundaries, exclusions or anything the reader should know.' })]));
    put(root, h('div', { class: 'g3 mt' }, [
      h('div', { class: 'card xc' }, [h('h2', null, ['Excel summary']), h('p', { class: 'sub' }, ['Summary, monthly table, every entry, data quality, method and factor sources. Totals are live formulas.']), h('button', { class: 'btn primary', disabled: !ms.length, onclick: exportXlsx }, ['↓ Download .xlsx'])]),
      h('div', { class: 'card xc' }, [h('h2', null, ['Entries as CSV']), h('p', { class: 'sub' }, ['One line per calculated entry with its category, month and tonnes CO₂e. For your own analysis.']), h('button', { class: 'btn', disabled: !ms.length, onclick: exportCsv }, ['↓ Download .csv'])]),
      h('div', { class: 'card xc' }, [h('h2', null, ['Printable report']), h('p', { class: 'sub' }, ['A clean multi-page view for clients. Print it or save it as PDF from your browser.']), h('a', { class: 'btn', href: '#/report' }, ['Open report ›'])])]));
    put(root, chartsCard());
    put(root, h('p', { class: 'hint', style: 'margin-top:14px' }, ['Period: ' + periodLabel() + '. Change it above to export a different year.']));
  }
  function repTable(rows, cols) {
    var t = h('table', { class: 't' });
    t.appendChild(h('thead', null, [h('tr', null, cols.map(function (c) { return h('th', { class: c.n ? 'n' : '' }, [c.h]); }))]));
    var b = h('tbody'); rows.forEach(function (r) { b.appendChild(h('tr', { class: r.tot ? 'tot' : '' }, cols.map(function (c) { return h('td', { class: c.n ? 'n' : '' }, [r[c.k]]); }))); });
    t.appendChild(b); return t;
  }
  function pageReport(root) {
    var Sm = summary();
    var date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    put(root, h('div', { class: 'noprint row-btns', style: 'margin-bottom:14px' }, [h('a', { class: 'btn', href: '#/export' }, ['‹ Back to export']), filters(),
      h('button', { class: 'btn primary', onclick: function () { try { window.print(); } catch (e) { alert('Use your browser menu: Print, then Save as PDF.'); } } }, ['Print or save as PDF']),
      h('span', { class: 'hint' }, ['Tip: turn on "Background graphics" in the print dialog to keep the colours.'])]));
    var page = h('article', { class: 'report' });
    page.appendChild(h('section', { class: 'rp cover' }, [
      h('div', { class: 'eyebrow' }, [META.org || 'Greenhouse gas inventory']),
      h('h1', null, [META.title || 'Greenhouse gas inventory']),
      h('div', { class: 'big' }, [h('span', { class: 'num' }, [fmtT(Sm.totalT)]), h('span', { class: 'unit' }, ['tCO₂e'])]),
      h('div', { class: 'meta' }, [Sm.periodLabel + (Sm.basis === 'fy' ? ' · April to March' : ' · calendar year') + ' · ' + Sm.months.length + ' month' + (Sm.months.length === 1 ? '' : 's') + ' of data']),
      Sm.totalKg > 0 ? hbar(Sm.scopes.map(function (s) { return { name: s.name, short: 'Scope ' + s.scope, v: s.t * 1000, c: SCOPES[s.scope].c }; }), Sm.totalKg) : null,
      h('div', { class: 'scopes mt' }, Sm.scopes.map(function (s) { return h('div', { class: 'scard' }, [h('div', { class: 't' }, [h('i', { class: 'sw', style: 'background:' + SCOPES[s.scope].c }), 'Scope ' + s.scope]), h('div', { class: 'd' }, [SCOPES[s.scope].long]), h('div', { class: 'v' }, [fmtT(s.t), h('small', null, ['tCO₂e'])]), h('div', { class: 'f' }, [h('span', null, [pct(s.t, Sm.totalT) + ' of total'])])]); })),
      h('div', { class: 'foot' }, ['Prepared ' + date + (META.preparedBy ? ' by ' + META.preparedBy : '')]),
      META.notes ? h('div', { class: 'notes' }, [h('b', null, ['Notes. ']), META.notes]) : null]));
    var series = [1, 2, 3].map(function (s) { return { id: s, name: SCOPES[s].name, c: SCOPES[s].c }; });
    var cb = h('div', { class: 'chartbox' });
    page.appendChild(h('section', { class: 'rp' }, [h('h2', null, ['Emissions by month']), h('p', { class: 'sub' }, ['Tonnes CO₂e per month, by scope.']), legend(series), cb]));
    [1, 2, 3].forEach(function (s) {
      var cats = Sm.cats.filter(function (c) { return c.scope === s; }), sc = Sm.scopes[s - 1];
      var rows = cats.map(function (c) { return { n: c.label, t: fmtT(c.t), p: pct(c.kg, sc.t * 1000) }; });
      rows.push({ n: 'Total ' + SCOPES[s].name, t: fmtT(sc.t), p: '', tot: true });
      var rank = cats.filter(function (c) { return c.kg > 0; }).sort(function (a, b) { return b.kg - a.kg; }).map(function (c) { return { name: c.label, v: c.kg, c: CAT[c.id].c }; });
      page.appendChild(h('section', { class: 'rp' }, [h('h2', null, [SCOPES[s].name + ' · ' + SCOPES[s].desc]), h('p', { class: 'sub' }, [SCOPES[s].long + '. ' + fmtT(sc.t) + ' tCO₂e, ' + pct(sc.t, Sm.totalT) + ' of the total.']),
        sc.t > 0 ? rankList(rank, sc.t * 1000) : h('p', { class: 'hint' }, ['No data for this scope in the period.']),
        repTable(rows, [{ k: 'n', h: 'Category' }, { k: 't', h: 'tCO₂e', n: 1 }, { k: 'p', h: 'Share of scope', n: 1 }])]));
    });
    var issueRows = Sm.issues.slice(0, 40).map(function (i) { return { s: i.sheet || '', r: i.row || '', m: (i.month && i.month !== '?' ? i.month.slice(0, 3) + ' ' + i.year : ''), w: i.msg, l: i.level === 'error' ? 'Excluded' : 'Check' }; });
    page.appendChild(h('section', { class: 'rp' }, [h('h2', null, ['Data quality']),
      h('p', { class: 'sub' }, [Sm.errors ? Sm.errors + ' row' + (Sm.errors > 1 ? 's' : '') + ' could not be calculated and ' + (Sm.errors > 1 ? 'are' : 'is') + ' left out of the totals above. ' : 'Every row supplied was calculated. ', Sm.warnings ? Sm.warnings + ' row' + (Sm.warnings > 1 ? 's' : '') + ' need a check (for example a value typed as text).' : '']),
      issueRows.length ? repTable(issueRows, [{ k: 'l', h: 'Status' }, { k: 's', h: 'Sheet' }, { k: 'r', h: 'Row', n: 1 }, { k: 'm', h: 'Month' }, { k: 'w', h: 'What happened' }]) : null,
      Sm.issues.length > 40 ? h('p', { class: 'hint' }, ['Showing 40 of ' + Sm.issues.length + '. The Excel summary lists all of them.']) : null]));
    var meth = h('section', { class: 'rp' }, [h('h2', null, ['Method and factor sources']), h('ul', { class: 'meth' }, XP.METHOD.map(function (t) { return h('li', null, [t]); })),
      h('h3', null, ['Emission factor sources']),
      h('ul', { class: 'meth' }, SRC.sources.map(function (s) { return h('li', null, [h('b', null, [s.applies_to.join('; ') + '. ']), s.title + '.']); })),
      h('p', { class: 'hint' }, ['Emission factors come from the sources above and are being independently verified. Treat the results as estimates until the factor library is marked verified. Generated with GHG Inventory Toolkit v' + XP.VERSION + '.'])]);
    page.appendChild(meth);
    put(root, page);
    requestAnimationFrame(function () { columns(cb, monthItems(selMonths(), function (m) { return { 1: m.t[1], 2: m.t[2], 3: m.t[3] }; }), series, { label: 'Monthly emissions by scope', height: 240 }); });
  }

  /* ------------------------------------------------------------ shell */
  function route() {
    var p = (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (p[0] === 'data') return { page: 'data' };
    if (p[0] === 'export') return { page: 'export' };
    if (p[0] === 'report') return { page: 'report' };
    if (p[0] === 'scope' && SCOPES[p[1]]) { var c = p[2] && CAT[p[2]] && CAT[p[2]].scope === +p[1] ? p[2] : null; return { page: 'scope', s: +p[1], cat: c }; }
    return { page: 'overview' };
  }
  function renderTabs(rt) {
    var nav = $('#tabs'); nav.innerHTML = '';
    [['#/', 'Overview', rt.page === 'overview', null], ['#/scope/1', 'Scope 1', rt.page === 'scope' && rt.s === 1, SCOPES[1].c], ['#/scope/2', 'Scope 2', rt.page === 'scope' && rt.s === 2, SCOPES[2].c],
      ['#/scope/3', 'Scope 3', rt.page === 'scope' && rt.s === 3, SCOPES[3].c], ['#/export', 'Export', rt.page === 'export' || rt.page === 'report', null], ['#/data', 'Upload data', rt.page === 'data', null]].forEach(function (t) {
      nav.appendChild(h('a', { href: t[0], 'aria-current': t[2] ? 'page' : null }, [t[3] ? h('i', { class: 'sw', style: 'background:' + t[3] }) : null, t[1]]));
    });
  }
  var lastRoute = '';
  function render() {
    hideTip();
    var rt = route(), root = $('#main');
    renderTabs(rt); root.innerHTML = '';
    if (rt.page === 'data') pageData(root);
    else if (!hasData()) {
      if (rt.page === 'overview') pageOnboarding(root);
      else put(root, h('div', { class: 'card empty', style: 'margin-top:20px' }, [h('h2', { style: 'color:var(--ink);margin-bottom:6px' }, ['No data yet']), h('p', { class: 'sub' }, ['Upload a filled template to see ' + (rt.page === 'scope' ? SCOPES[rt.s].name : 'the export') + ' here.']), h('a', { class: 'btn primary', href: '#/' }, ['Get started'])]));
    }
    else if (rt.page === 'export') pageExport(root);
    else if (rt.page === 'report') pageReport(root);
    else if (rt.page === 'overview') pageOverview(root);
    else if (rt.cat) pageCategory(root, rt.s, rt.cat);
    else pageScope(root, rt.s);
    var key = location.hash; if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
  }
  window.addEventListener('hashchange', function () { S.msg = null; render(); });
  $('#themeBtn').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', cur === 'dark' ? 'light' : 'dark'); render();
  });
  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(render, 160); });
  recalc(); render();
  window.__GHG = { S: S, get R() { return R; }, recalc: recalc, render: render };
})();
