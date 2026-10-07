import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settings = readFileSync('src/components/admin/SmartsheetSyncSettings.jsx', 'utf8');
const tools = readFileSync('src/components/orders/OrderReviewTools.jsx', 'utf8');
const review = readFileSync('src/components/orders/OrderLinkIntegrityReview.jsx', 'utf8');

assert.ok(settings.includes('Number(r.missing_permanent_row_links) > 0'));
assert.ok(settings.includes('Base44 Order IDs: {r.missing_permanent_row_record_ids.join'));
assert.ok(settings.includes('Missing permanent Smartsheet row IDs: {r.missing_permanent_smartsheet_row_ids.join'));
assert.ok(settings.includes('Sorting or moving a Smartsheet row does not change its permanent ID; deleting and recreating a row does.'));
assert.ok(settings.includes('No automatic relink or Smartsheet → Base44 Order creation was attempted.'));
assert.ok(settings.includes('Matching remains configured sheet + permanent row ID only.'));
assert.ok(settings.includes('Order Form diagnostics → Review links'));
assert.ok(settings.includes('Order automatic creation from Smartsheet is locked off'));
assert.ok(settings.includes('They remain review-only evidence.'));
assert.ok(tools.includes('>Review links</Button>'));
assert.ok(review.includes('Linked rows missing from Smartsheet'));
assert.ok(review.includes('A replacement row with matching visible values is a different Smartsheet row.'));
assert.ok(settings.includes('break-words font-mono'));
console.log('PASS Order pull missing-permanent-row sync results are explicit, review-only, and mobile-wrap safe');
