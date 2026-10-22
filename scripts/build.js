#!/usr/bin/env node
/* Builds the whole dashboard into one self-contained file: dist/index.html
 * Usage: node scripts/build.js */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const factors = JSON.parse(read('data/factors.json'));
factors.airports = JSON.parse(read('data/airports.json'));
const sources = JSON.parse(read('data/sources.json'));

const parts = {
  '/*__FACTORS__*/': 'window.GHG_FACTORS=' + JSON.stringify(factors) + ';window.GHG_SOURCES=' + JSON.stringify(sources) + ';',
  '/*__ENGINE__*/': read('src/engine.js'),
  '/*__SCHEMA__*/': read('src/schema.js'),
  '/*__EXPORT__*/': read('src/export.js'),
  '/*__CHARTS__*/': read('src/charts.js'),
  '/*__SAMPLE__*/': read('src/sample.js'),
  '/*__APP__*/': read('src/app.js'),
};
let html = read('src/template.html');
for (const [marker, code] of Object.entries(parts)) {
  if (!html.includes(marker)) throw new Error('Template is missing ' + marker);
  html = html.split(marker).join(code.replace(/<\/script>/g, '<\\/script>'));
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
console.log('Built dist/index.html (' + Math.round(html.length / 1024) + ' KB)');
