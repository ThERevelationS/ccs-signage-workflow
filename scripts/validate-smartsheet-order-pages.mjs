import assert from 'node:assert/strict';
import { createSmartsheetOrderPageGuard } from '../base44/shared/smartsheetOrderPageGuard.mjs';

const rows = (start, count) => Array.from({ length: count }, (_, i) => ({ id: String(start + i) }));
const page = (totalRowCount, version, entries) => ({ totalRowCount, version, rows: entries });

{
  const guard = createSmartsheetOrderPageGuard();
  let nextId = 1;
  for (let pageNumber = 1; pageNumber <= 9; pageNumber++) {
    const entries = rows(nextId, Math.min(200, 1675 - nextId + 1));
    nextId += entries.length;
    const done = guard.accept(pageNumber, page(1675, 42, entries), entries);
    assert.equal(done, pageNumber === 9);
  }
  guard.assertComplete();
  console.log('PASS complete 1,675-row Order Request download across nine pages');
}
{
  const guard = createSmartsheetOrderPageGuard();
  assert.equal(guard.accept(1, page(0, 1, []), []), true);
  guard.assertComplete();
  console.log('PASS verified empty sheet');
}
{
  const guard = createSmartsheetOrderPageGuard({ pageSize: 2 });
  assert.throws(() => guard.accept(1, { version: 1, rows: rows(1, 2) }, rows(1, 2)), /row-count/);
  console.log('PASS missing row-count metadata blocks import');
}
{
  const guard = createSmartsheetOrderPageGuard({ pageSize: 2 });
  guard.accept(1, page(4, 1, rows(1, 2)), rows(1, 2));
  assert.throws(() => guard.accept(2, page(4, 2, rows(3, 2)), rows(3, 2)), /changed/);
  console.log('PASS sheet modification during pagination blocks import');
}
{
  const guard = createSmartsheetOrderPageGuard({ pageSize: 2 });
  guard.accept(1, page(4, 1, rows(1, 2)), rows(1, 2));
  assert.throws(() => guard.accept(2, page(4, 1, [rows(2, 1)[0], rows(3, 1)[0]]), [rows(2, 1)[0], rows(3, 1)[0]]), /repeated/);
  console.log('PASS repeated row ID after sorting or movement blocks import');
}
{
  const guard = createSmartsheetOrderPageGuard({ pageSize: 2 });
  guard.accept(1, page(4, 1, rows(1, 2)), rows(1, 2));
  assert.throws(() => guard.accept(2, page(4, 1, []), []), /ended before all rows/);
  console.log('PASS prematurely empty page blocks import');
}
{
  const guard = createSmartsheetOrderPageGuard({ pageSize: 2, maxPages: 2 });
  assert.throws(() => guard.accept(1, page(5, 1, rows(1, 2)), rows(1, 2)), /exceeds/);
  console.log('PASS pagination hard cap cannot silently truncate rows');
}
{
  const guard = createSmartsheetOrderPageGuard({ pageSize: 2, maxPages: 2 });
  guard.accept(1, page(4, 1, rows(1, 2)), rows(1, 2));
  assert.throws(() => guard.accept(2, page(4, 1, rows(3, 1)), rows(3, 1)), /ended before all rows/);
  console.log('PASS short final page with missing rows blocks import');
}
{
  const guard = createSmartsheetOrderPageGuard();
  assert.throws(() => guard.accept(1, { totalRowCount: 1, version: 1 }, []), /malformed/);
  console.log('PASS malformed row page blocks import');
}
