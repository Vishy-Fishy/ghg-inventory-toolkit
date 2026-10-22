/* Browser check of the Export page and printable report. Needs Playwright + a Chromium binary.
 * Run: node tests/e2e/export.e2e.js   (set CHROMIUM=/path/to/chromium if Playwright has no browser installed) */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const root = path.join(__dirname, '..', '..');
const XL = fs.readFileSync(path.join(root, 'node_modules/exceljs/dist/exceljs.min.js'), 'utf8');
const SJ = fs.readFileSync(path.join(root, 'node_modules/xlsx/dist/xlsx.full.min.js'), 'utf8');
const outDir = process.env.E2E_OUT || path.join(root, 'tests', 'e2e', 'out');
fs.mkdirSync(outDir, { recursive: true });
const ok = (c, m) => { if (!c) { console.error('FAIL ' + m); process.exitCode = 1; } else console.log('ok   ' + m); };

(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (u.includes('exceljs')) return r.fulfill({ body: XL, contentType: 'application/javascript' });
    if (u.includes('xlsx.full')) return r.fulfill({ body: SJ, contentType: 'application/javascript' });
    if (u.startsWith('file:')) return r.continue();
    return r.abort();
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(root, 'dist/index.html'));
  await p.click('button:has-text("Explore with sample data")');
  await p.goto('file://' + path.join(root, 'dist/index.html') + '#/export');
  await p.waitForSelector('h1.pg:has-text("Export")');
  await p.fill('input[aria-label="Organisation"]', 'Example Foods Pvt Ltd');
  await p.fill('input[aria-label="Prepared by"]', 'A. Analyst');
  await p.fill('textarea[aria-label="Notes for the reader"]', 'Boundary: head office and warehouse.');
  await p.screenshot({ path: path.join(outDir, 'export.png') });

  const [dx] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download .xlsx")')]);
  const xp = path.join(outDir, dx.suggestedFilename()); await dx.saveAs(xp);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xp);
  ok(wb.worksheets.map((w) => w.name).join(',') === 'Summary,Monthly,Entries,Data quality,Method and sources', 'xlsx has the five sheets');
  ok(wb.getWorksheet('Summary').getCell('B3').value === 'Example Foods Pvt Ltd', 'organisation written to summary');
  const tot = wb.getWorksheet('Summary').getCell('B9').value;
  ok(tot && tot.formula && tot.result > 0, 'total is a live formula with a cached result (' + (tot && tot.result && tot.result.toFixed(1)) + ' t)');
  ok(wb.getWorksheet('Entries').rowCount > 100, 'entries sheet has rows (' + wb.getWorksheet('Entries').rowCount + ')');

  const [dc] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Download .csv")')]);
  const cp = path.join(outDir, dc.suggestedFilename()); await dc.saveAs(cp);
  const csv = fs.readFileSync(cp, 'utf8');
  ok(csv.split('\r\n').length > 100 && csv.includes('kg CO2e'), 'csv has header and rows');

  await p.click('a:has-text("Open report")');
  await p.waitForSelector('article.report');
  await p.waitForTimeout(500);
  const txt = await p.locator('article.report').innerText();
  ok(/Example Foods Pvt Ltd/i.test(txt) && /Scope 1/.test(txt) && /Method and factor sources/.test(txt), 'report shows organisation, scopes and method');
  await p.screenshot({ path: path.join(outDir, 'report.png'), fullPage: true });
  await p.emulateMedia({ media: 'print' });
  await p.pdf({ path: path.join(outDir, 'report.pdf'), format: 'A4', printBackground: true });
  ok(fs.statSync(path.join(outDir, 'report.pdf')).size > 20000, 'report prints to PDF');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close();
})();
