/* Browser check of chart image export: per-chart PNG and SVG, and the ZIP of all charts.
 * Run: node tests/e2e/charts.e2e.js   (set CHROMIUM=/path/to/chromium if Playwright has no browser installed) */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..', '..');
const XL = fs.readFileSync(path.join(root, 'node_modules/exceljs/dist/exceljs.min.js'), 'utf8');
const SJ = fs.readFileSync(path.join(root, 'node_modules/xlsx/dist/xlsx.full.min.js'), 'utf8');
const outDir = process.env.E2E_OUT || path.join(root, 'tests', 'e2e', 'out');
fs.mkdirSync(outDir, { recursive: true });
const ok = (c, m) => { if (!c) { console.error('FAIL ' + m); process.exitCode = 1; } else console.log('ok   ' + m); };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('exceljs')) return r.fulfill({ body: XL, contentType: 'application/javascript' });
    if (u.includes('xlsx.full')) return r.fulfill({ body: SJ, contentType: 'application/javascript' });
    if (u.startsWith('file:') || u.startsWith('data:')) return r.continue();
    return r.abort();
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const page = 'file://' + path.join(root, 'dist/index.html');
  await p.goto(page);
  await p.click('button:has-text("Explore with sample data")');
  await p.waitForSelector('.hero .num');

  // overview: every chart card has image buttons
  ok((await p.locator('.ct').count()) === 3, 'overview has image buttons on its 3 charts');
  const [d1] = await Promise.all([p.waitForEvent('download'), p.locator('.ct button:has-text("PNG")').nth(1).click()]);
  const f1 = path.join(outDir, d1.suggestedFilename()); await d1.saveAs(f1);
  const png = fs.readFileSync(f1);
  ok(png.subarray(0, 8).equals(PNG) && png.length > 15000, 'monthly chart downloads as a PNG (' + d1.suggestedFilename() + ', ' + Math.round(png.length / 1024) + ' KB)');
  ok(png.readUInt32BE(16) === 2560 && png.readUInt32BE(20) === 1440, 'PNG is 2560 x 1440');
  const [d2] = await Promise.all([p.waitForEvent('download'), p.locator('.ct button:has-text("SVG")').first().click()]);
  const f2 = path.join(outDir, d2.suggestedFilename()); await d2.saveAs(f2);
  const svg = fs.readFileSync(f2, 'utf8');
  ok(svg.startsWith('<svg') && svg.includes('Emissions by scope') && svg.includes('GHG Inventory Toolkit'), 'scope chart downloads as an SVG with title and footer');

  // transparent background
  const alphaOf = (file) => p.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return g.getImageData(5, 5, 1, 1).data[3];
  }, fs.readFileSync(file).toString('base64'));
  ok((await alphaOf(f1)) === 255, 'white-background PNG is opaque');
  await p.locator('select.ctbg').first().selectOption('dark');
  ok((await p.locator('select.ctbg').evaluateAll((els) => els.every((e) => e.value === 'dark'))), 'background choice applies to every chart on the page');
  const [dt] = await Promise.all([p.waitForEvent('download'), p.locator('.ct button:has-text("PNG")').first().click()]);
  const ft = path.join(outDir, dt.suggestedFilename()); await dt.saveAs(ft);
  ok(/_transparent\.png$/.test(dt.suggestedFilename()) && (await alphaOf(ft)) === 0, 'transparent PNG has no background (' + dt.suggestedFilename() + ')');
  const [dts] = await Promise.all([p.waitForEvent('download'), p.locator('.ct button:has-text("SVG")').first().click()]);
  const fts = path.join(outDir, dts.suggestedFilename()); await dts.saveAs(fts);
  const svgT = fs.readFileSync(fts, 'utf8');
  ok(!/<rect width="1280" height="720"/.test(svgT) && svgT.includes('#f0efec'), 'transparent SVG has no page rectangle and uses light text');

  // copy to the clipboard
  await p.locator('.ct button:has-text("Copy")').first().click();
  await p.waitForSelector('.ct button:has-text("Copied")');
  const clip = await p.evaluate(async () => { const items = await navigator.clipboard.read(); const t = items[0].types; const blob = await items[0].getType('image/png'); return { types: t, size: blob.size }; });
  ok(clip.types.includes('image/png') && clip.size > 5000, 'copy puts a PNG on the clipboard (' + Math.round(clip.size / 1024) + ' KB)');
  await p.locator('select.ctbg').first().selectOption('light');

  // scope and category pages
  await p.goto(page + '#/scope/1'); await p.waitForSelector('.hero');
  ok((await p.locator('.ct').count()) === 2, 'scope page has image buttons on its 2 charts');
  await p.goto(page + '#/scope/1/fuel'); await p.waitForSelector('.crumbs');
  ok((await p.locator('.ct').count()) === 2, 'category page has image buttons on its 2 charts');

  // export page: list and ZIP
  await p.goto(page + '#/export'); await p.waitForSelector('#charts-card');
  await p.fill('input[aria-label="Organisation"]', 'Example Foods Pvt Ltd');
  const n = await p.locator('#chart-list .ci').count();
  ok(n >= 12, 'export page lists every chart (' + n + ')');
  for (const fmt of ['png', 'svg']) {
    const [dz] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("All charts as ' + fmt.toUpperCase() + '")')]);
    const fz = path.join(outDir, dz.suggestedFilename()); await dz.saveAs(fz);
    let listing = '';
    try { listing = execFileSync('python3', ['-m', 'zipfile', '-l', fz]).toString(); execFileSync('python3', ['-m', 'zipfile', '-t', fz]); } catch (e) { listing = 'ERROR ' + e.message; }
    const names = listing.split('\n').filter((l) => l.includes('.' + fmt));
    ok(names.length === n && !listing.startsWith('ERROR'), fmt.toUpperCase() + ' zip is valid and holds ' + names.length + ' of ' + n + ' charts (' + dz.suggestedFilename() + ')');
    if (fmt === 'png') {
      execFileSync('python3', ['-m', 'zipfile', '-e', fz, path.join(outDir, 'zip_png')]);
      const first = fs.readFileSync(path.join(outDir, 'zip_png', fs.readdirSync(path.join(outDir, 'zip_png'))[0]));
      ok(first.subarray(0, 8).equals(PNG), 'first image in the zip is a real PNG');
    }
  }
  await p.screenshot({ path: path.join(outDir, 'export_charts.png'), fullPage: true });
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
