#!/usr/bin/env node
/* Writes the example files in examples/: a blank template and a template filled with the synthetic sample.
 * Usage: node scripts/make-examples.js */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const root = path.join(__dirname, '..');
const E = require(path.join(root, 'src/engine.js'));
const X = require(path.join(root, 'src/schema.js'));
const SAMPLE = require(path.join(root, 'src/sample.js'));
const F = JSON.parse(fs.readFileSync(path.join(root, 'data/factors.json'), 'utf8'));
F.airports = JSON.parse(fs.readFileSync(path.join(root, 'data/airports.json'), 'utf8'));
const empty = () => { const d = {}; X.TABLES.forEach((t) => { d[t.id] = []; }); return d; };
const ids = X.TABLES.map((t) => t.id);

(async () => {
  const out = path.join(root, 'examples');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'blank_template.xlsx'), Buffer.from(await X.buildTemplate(ExcelJS, F, ids, null, 'All scopes')));
  fs.writeFileSync(path.join(out, 'sample_inputs.xlsx'), Buffer.from(await X.buildTemplate(ExcelJS, F, ids, SAMPLE.sampleData(X, empty, E.MONTHS), 'Synthetic sample')));
  console.log('Wrote examples/blank_template.xlsx and examples/sample_inputs.xlsx');
})();
