/* Tests for chart images: SVG output and the ZIP writer. The PNG step needs a browser and is covered by tests/e2e/charts.e2e.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const zlib = require('zlib');
const C = require(path.join(__dirname, '..', 'src/charts.js'));

const META = { org: 'Acme & Sons <Ltd>', period: 'FY 2024-25', version: '0.1.0' };

test('rank chart: draws every item, escapes text, shows tonnes and shares', () => {
  const svg = C.svg({ type: 'rank', title: 'Largest sources', subtitle: 'Tonnes', items: [{ name: 'Diesel & gas', v: 3000, c: 'var(--s1)' }, { name: 'Grid', v: 1000, c: 'var(--s2)' }] }, META);
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(svg.includes('Diesel &amp; gas') && svg.includes('Acme &amp; Sons &lt;Ltd&gt;'), 'text is escaped');
  assert.ok(svg.includes('3.00 t') && svg.includes('75.0%') && svg.includes('25.0%'), 'values and shares');
  assert.ok(svg.includes('#2a78d6') && !svg.includes('var(--'), 'CSS variables are replaced by real colours');
});

test('rank chart: more than 12 items fold the smallest into "Other"', () => {
  const items = Array.from({ length: 15 }, (_, i) => ({ name: 'Item ' + i, v: 100 - i, c: '#123456' }));
  const svg = C.svg({ type: 'rank', title: 't', items }, META);
  assert.ok(svg.includes('Other (4 more)'));
  assert.ok(!svg.includes('Item 14'));
});

test('columns chart: stacks series, labels months and totals, wraps a long legend', () => {
  const series = Array.from({ length: 8 }, (_, i) => ({ id: 's' + i, name: 'Category number ' + i + ' with a long name', c: 'var(--c' + (i + 1) + ')' }));
  const items = [{ label: 'Apr', sub: '2024', v: { s0: 1000, s1: 2000 }, total: 3000 }, { label: 'May', v: { s0: 500 }, total: 500 }];
  const svg = C.svg({ type: 'columns', title: 'Monthly', series, items }, META);
  assert.ok(svg.includes('>Apr<') && svg.includes('>2024<') && svg.includes('>3.00<'), 'month, year and total labels');
  const legendYs = new Set([...svg.matchAll(/<rect x="[\d.]+" y="(\d+)" width="12" height="12"/g)].map((m) => m[1]));
  assert.ok(legendYs.size >= 2, 'legend wraps onto a second line');
  for (const m of svg.matchAll(/<text x="([\d.]+)"/g)) assert.ok(Number(m[1]) <= C.WIDTH, 'nothing is drawn past the right edge');
});

test('transparent look: no white page, light text, brighter colours', () => {
  const spec = { type: 'rank', title: 'Largest sources', items: [{ name: 'Diesel', v: 3000, c: 'var(--s1)' }] };
  const dark = C.svg(spec, { ...META, bg: 'dark' }), light = C.svg(spec, META);
  assert.ok(!dark.includes('fill="#ffffff"/>') || !/<rect width="1280" height="720" fill="#ffffff"/.test(dark), 'no white page rectangle');
  assert.ok(/<rect width="1280" height="720" fill="#ffffff"/.test(light), 'light look keeps the white page');
  assert.ok(dark.includes('#f0efec') && dark.includes('#3987e5') && !dark.includes('#2a78d6'), 'light text and the dark-mode colours');
  assert.ok(C.svg(spec, META).includes('#2a78d6'), 'the next light chart is not affected');
});

test('empty chart says so instead of failing', () => {
  assert.ok(C.svg({ type: 'rank', title: 'x', items: [] }, META).includes('No data for this period.'));
  assert.ok(C.svg({ type: 'columns', title: 'x', series: [], items: [] }, META).includes('No data for this period.'));
});

test('slug makes safe file names', () => {
  assert.equal(C.slug('Scope 1 · Direct emissions by category'), 'scope-1-direct-emissions-by-category');
  assert.equal(C.slug('///'), 'chart');
});

test('zip: a standard reader finds every file with correct names, sizes and checksums', () => {
  const files = [{ name: '01_a.svg', data: C.utf8('<svg>é</svg>') }, { name: '02_b.png', data: Uint8Array.from([1, 2, 3, 4, 5]) }];
  const z = Buffer.from(C.zip(files, new Date(2026, 9, 22, 12, 0, 0)));
  const eocd = z.length - 22;
  assert.equal(z.readUInt32LE(eocd), 0x06054b50);
  assert.equal(z.readUInt16LE(eocd + 10), 2, 'two entries');
  let pos = z.readUInt32LE(eocd + 16);
  const got = [];
  for (let i = 0; i < 2; i++) {
    assert.equal(z.readUInt32LE(pos), 0x02014b50);
    const crc = z.readUInt32LE(pos + 16), size = z.readUInt32LE(pos + 24), nl = z.readUInt16LE(pos + 28), off = z.readUInt32LE(pos + 42);
    const name = z.subarray(pos + 46, pos + 46 + nl).toString('utf8');
    const lnl = z.readUInt16LE(off + 26), data = z.subarray(off + 30 + lnl, off + 30 + lnl + size);
    assert.equal(zlib.crc32 ? zlib.crc32(data) >>> 0 : crc, crc, 'crc matches');
    got.push([name, size]);
    pos += 46 + nl;
  }
  assert.deepEqual(got, [['01_a.svg', 13], ['02_b.png', 5]]);
});
