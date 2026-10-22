/* Chart images: turns a chart description into a standalone SVG (slide-sized, white background),
 * rasterises it to PNG in the browser, and packs several files into a ZIP.
 * No dependencies. The SVG and ZIP parts also run in Node, so they are covered by tests.
 *
 * A chart description ("spec") looks like one of:
 *   { type:'split',   title, subtitle, items:[{name, v, c}] }                       one stacked bar plus a ranked list
 *   { type:'rank',    title, subtitle, items:[{name, v, c}] }                       horizontal bars, largest first
 *   { type:'columns', title, subtitle, series:[{id,name,c}], items:[{label, sub, v:{id:kg}, total}] }   stacked columns
 * Values are in kg CO2e; the images show tonnes. Colours may be CSS variables such as var(--s1). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GHGCHART = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var W = 1280, H = 720, PAD = 56;
  var FONT = 'Inter, "Segoe UI", Roboto, Arial, sans-serif';
  var INK = '#0b0b0b', INK2 = '#52514e', MUTED = '#6b6963', GRID = '#e6e4de', AXIS = '#b9b7af';
  var VARS = { 's1': '#2a78d6', 's2': '#eb6834', 's3': '#1baf7a', 'c1': '#2a78d6', 'c2': '#eb6834', 'c3': '#1baf7a', 'c4': '#eda100', 'c5': '#e87ba4', 'c6': '#008300', 'c7': '#6250d6', 'c8': '#e34948' };
  var OTHER = '#9a998f';

  function colour(c) { var m = /var\(--([a-z0-9]+)\)/i.exec(c || ''); return m ? (VARS[m[1]] || OTHER) : (c || OTHER); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function fmtT(t) {
    if (t === null || t === undefined || isNaN(t)) return '–';
    if (t === 0) return '0';
    var a = Math.abs(t);
    if (a < 0.01) return t.toPrecision(2);
    var d = a >= 1000 ? 0 : a >= 100 ? 1 : 2;
    return t.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(v, of) { return of ? (v / of * 100).toFixed(v / of < 0.001 ? 2 : 1) + '%' : '–'; }
  function cut(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function niceStep(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function tick(n) { return n >= 1000 ? (n / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 }) + 'K' : String(+n.toPrecision(3)); }
  function lum(hex) { var m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return 0; var n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; }
  function text(x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 14) + '" fill="' + (o.fill || INK) + '"' + (o.weight ? ' font-weight="' + o.weight + '"' : '') + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + '>' + esc(s) + '</text>';
  }
  function slug(s) { return String(s || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'chart'; }

  /* more than 12 items: keep the largest 11 and fold the rest into "Other" */
  function fold(items, max) {
    var list = items.filter(function (x) { return x.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    if (list.length <= max) return list;
    var head = list.slice(0, max - 1), rest = list.slice(max - 1), sum = 0;
    rest.forEach(function (x) { sum += x.v; });
    head.push({ name: 'Other (' + rest.length + ' more)', v: sum, c: OTHER });
    return head;
  }

  function frame(spec, meta, body, extraH) {
    meta = meta || {};
    var foot = [meta.org, meta.period, 'tCO₂e', 'GHG Inventory Toolkit' + (meta.version ? ' v' + meta.version : '')].filter(Boolean).join('  ·  ');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + FONT + '\' role="img" aria-label="' + esc(spec.title) + '">' +
      '<title>' + esc(spec.title) + '</title><desc>' + esc((spec.subtitle || '') + ' ' + foot) + '</desc>' +
      '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>' +
      text(PAD, 70, cut(spec.title, 70), { size: 30, weight: 600 }) +
      (spec.subtitle ? text(PAD, 100, cut(spec.subtitle, 120), { size: 17, fill: INK2 }) : '') +
      body +
      '<line x1="' + PAD + '" x2="' + (W - PAD) + '" y1="' + (H - 44) + '" y2="' + (H - 44) + '" stroke="' + GRID + '"/>' +
      text(PAD, H - 20, cut(foot, 150), { size: 13, fill: MUTED }) + '</svg>';
  }

  function rankRows(items, total, y0, y1) {
    var n = items.length, rowH = Math.min(46, (y1 - y0) / Math.max(1, n)), s = '';
    var x0 = PAD + 380, x1 = W - PAD - 190, mx = items.length ? Math.max.apply(null, items.map(function (x) { return x.v; })) : 1;
    items.forEach(function (it, i) {
      var cy = y0 + rowH * i + rowH / 2, bw = Math.max(3, (x1 - x0) * it.v / mx), bh = Math.min(22, rowH * 0.56), col = colour(it.c);
      s += '<rect x="' + PAD + '" y="' + (cy - 6) + '" width="12" height="12" rx="3" fill="' + col + '"/>' +
        text(PAD + 22, cy + 5, cut(it.name, 38), { size: 16 }) +
        '<rect x="' + x0 + '" y="' + (cy - bh / 2) + '" width="' + bw.toFixed(1) + '" height="' + bh + '" rx="4" fill="' + col + '"/>' +
        text(W - PAD - 70, cy + 5, fmtT(it.v / 1000) + ' t', { size: 16, weight: 600, anchor: 'end' }) +
        text(W - PAD, cy + 5, pct(it.v, total), { size: 16, fill: INK2, anchor: 'end' });
    });
    return s;
  }

  function buildRank(spec, meta) {
    var items = fold(spec.items || [], 12), total = spec.total || items.reduce(function (a, x) { return a + x.v; }, 0);
    if (!items.length) return frame(spec, meta, text(W / 2, 360, 'No data for this period.', { size: 20, fill: MUTED, anchor: 'middle' }));
    return frame(spec, meta, rankRows(items, total, 130, H - 70));
  }

  function buildSplit(spec, meta) {
    var items = fold(spec.items || [], 12), total = spec.total || items.reduce(function (a, x) { return a + x.v; }, 0), s = '';
    if (!items.length) return frame(spec, meta, text(W / 2, 360, 'No data for this period.', { size: 20, fill: MUTED, anchor: 'middle' }));
    var x = PAD, bw = W - 2 * PAD, by = 138, bh = 64;
    s += text(PAD, by - 6, fmtT(total / 1000) + ' tCO₂e in total', { size: 18, weight: 600 });
    items.forEach(function (it, i) {
      var w = bw * it.v / total, col = colour(it.c), gap = i < items.length - 1 ? 2 : 0;
      s += '<rect x="' + x.toFixed(1) + '" y="' + (by + 8) + '" width="' + Math.max(1, w - gap).toFixed(1) + '" height="' + bh + '" fill="' + col + '"' + (i === 0 ? ' rx="8"' : '') + '/>';
      if (w > 64) s += text((x + w / 2).toFixed(1), by + 8 + bh / 2 + 6, pct(it.v, total), { size: 17, weight: 600, anchor: 'middle', fill: lum(col) > 0.6 ? INK : '#ffffff' });
      x += w;
    });
    s += rankRows(items, total, by + bh + 36, H - 64);
    return frame(spec, meta, s);
  }

  function buildColumns(spec, meta) {
    var items = spec.items || [], series = spec.series || [];
    if (!items.length) return frame(spec, meta, text(W / 2, 360, 'No data for this period.', { size: 20, fill: MUTED, anchor: 'middle' }));
    var legend = '', rows = 0;
    if (series.length > 1) {
      var lx = PAD, ly = 126;
      series.forEach(function (sr) {
        var nm = cut(sr.name, 30), itemW = 18 + nm.length * 7.6 + 26;
        if (lx + itemW > W - PAD && lx > PAD) { lx = PAD; ly += 24; }
        legend += '<rect x="' + lx.toFixed(1) + '" y="' + (ly - 11) + '" width="12" height="12" rx="3" fill="' + colour(sr.c) + '"/>' + text((lx + 18).toFixed(1), ly, nm, { size: 14, fill: INK2 });
        lx += itemW;
      });
      rows = (ly - 126) / 24 + 1;
    }
    var L = PAD + 40, Rr = PAD, T = series.length > 1 ? 126 + rows * 24 + 36 : 140, B = H - 100, slot = (W - L - Rr) / items.length, bw = Math.min(46, slot * 0.68), s = legend;
    var raw = Math.max.apply(null, items.map(function (it) { return it.total; })) / 1000, step = niceStep(raw / 5), max = Math.max(step, Math.ceil(raw / step) * step);
    function y(t) { return T + (B - T) * (1 - t / max); }
    for (var g = 0; g * step <= max + 1e-9; g++) { var gv = g * step; s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(gv).toFixed(1) + '" y2="' + y(gv).toFixed(1) + '" stroke="' + (g ? GRID : AXIS) + '"/>' + text(L - 10, (y(gv) + 5).toFixed(1), tick(gv), { size: 13, fill: MUTED, anchor: 'end' }); }
    s += text(PAD, T - 14, 'tCO₂e', { size: 13, fill: MUTED });
    var every = slot >= 34 ? 1 : slot >= 22 ? 2 : slot >= 14 ? 3 : 6, labelTotals = slot >= 58;
    items.forEach(function (it, i) {
      var cx = L + slot * i + slot / 2, x0 = cx - bw / 2, acc = 0, top = null;
      series.forEach(function (sr) { if ((it.v[sr.id] || 0) > 0) top = sr.id; });
      series.forEach(function (sr) {
        var v = (it.v[sr.id] || 0) / 1000; if (v <= 0) return;
        var y1 = y(acc + v), hg = y(acc) - y1, gap = acc > 0 ? 2 : 0, hh = Math.max(1, hg - gap);
        s += '<rect x="' + x0.toFixed(1) + '" y="' + y1.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="' + colour(sr.c) + '"' + (sr.id === top ? ' rx="4"' : '') + '/>';
        acc += v;
      });
      if (labelTotals && it.total > 0) s += text(cx.toFixed(1), (y(acc) - 8).toFixed(1), fmtT(it.total / 1000), { size: 13, fill: INK2, anchor: 'middle' });
      if (i % every === 0) { s += text(cx.toFixed(1), B + 22, it.label, { size: 14, fill: INK2, anchor: 'middle' }); if (it.sub) s += text(cx.toFixed(1), B + 40, it.sub, { size: 13, fill: MUTED, anchor: 'middle' }); }
    });
    return frame(spec, meta, s);
  }

  function svg(spec, meta) { return spec.type === 'columns' ? buildColumns(spec, meta) : spec.type === 'split' ? buildSplit(spec, meta) : buildRank(spec, meta); }

  /* browser only: SVG text -> PNG blob at 2x */
  function toPng(svgText, scale, cb) {
    var img = new Image(); scale = scale || 2;
    img.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
        var g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { cb(b ? null : new Error('PNG could not be created'), b); }, 'image/png');
      } catch (e) { cb(e); }
    };
    img.onerror = function () { cb(new Error('The chart could not be drawn')); };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  }

  /* ZIP without compression (PNG and SVG are small or already compressed) */
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s); return Uint8Array.from(Buffer.from(s, 'utf8')); }
  function zip(files, when) {
    var d = when || new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [], central = [], offset = 0;
    function u16(v) { return [v & 255, (v >> 8) & 255]; }
    function u32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data);
      var local = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dosT), u16(dosD), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(Uint8Array.from(local), name, data);
      central.push(Uint8Array.from([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dosT), u16(dosD), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += local.length + name.length + data.length;
    });
    var cdSize = 0; central.forEach(function (p) { cdSize += p.length; });
    var end = Uint8Array.from([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0)));
    var all = parts.concat(central, [end]), total = 0; all.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total), pos = 0; all.forEach(function (p) { out.set(p, pos); pos += p.length; });
    return out;
  }

  return { svg: svg, toPng: toPng, zip: zip, crc32: crc32, utf8: utf8, slug: slug, colour: colour, WIDTH: W, HEIGHT: H };
});
