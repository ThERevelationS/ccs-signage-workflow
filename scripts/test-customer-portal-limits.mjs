import assert from 'node:assert/strict';
import {
  PORTAL_ATTACHMENT_MAX_BYTES,
  PORTAL_REQUEST_MAX_CHARS,
  PORTAL_WRITES_PER_HOUR,
  PORTAL_WRITES_PER_DAY,
  PORTAL_ATTACHMENTS_PER_DAY,
  decodePortalAttachment,
  enforcePortalWriteBudget,
  readBoundedPortalJson,
} from '../base44/shared/customerPortalLimits.mjs';

const b64 = (n) => Buffer.alloc(n, 1).toString('base64');
const status = (fn) => { try { fn(); } catch (e) { return e.status; } return 0; };
const statusAsync = async (p) => { try { await p; } catch (e) { return e.status; } return 0; };

assert.equal(decodePortalAttachment({ base64: '', name: 'a.pdf' }), null, 'no attachment is allowed');
{
  const att = decodePortalAttachment({ base64: b64(1024), name: 'proof.PDF', mime: 'application/pdf' });
  assert.equal(att.bytes.length, 1024);
  assert.equal(att.mime, 'application/pdf');
}
assert.equal(decodePortalAttachment({ base64: b64(10), name: 'photo.jpg', mime: '' }).mime, 'image/jpeg', 'mime derived from extension');
assert.equal(status(() => decodePortalAttachment({ base64: b64(10), name: '' })), 400, 'filename required');
assert.equal(status(() => decodePortalAttachment({ base64: b64(PORTAL_ATTACHMENT_MAX_BYTES + 1), name: 'big.pdf' })), 413, 'oversized decoded file rejected');
assert.equal(status(() => decodePortalAttachment({ base64: b64(50 * 1024 * 1024), name: 'huge.pdf' })), 413, '50 MB rejected before decode');
assert.ok(decodePortalAttachment({ base64: b64(PORTAL_ATTACHMENT_MAX_BYTES), name: 'max.png' }), 'exactly-at-limit file accepted');
assert.equal(status(() => decodePortalAttachment({ base64: b64(10), name: 'run.exe' })), 415, 'disallowed extension rejected');
assert.equal(status(() => decodePortalAttachment({ base64: b64(10), name: 'page.html', mime: 'text/html' })), 415, 'html rejected');
assert.equal(status(() => decodePortalAttachment({ base64: b64(10), name: 'x.svg', mime: 'image/svg+xml' })), 415, 'svg rejected');
assert.equal(status(() => decodePortalAttachment({ base64: b64(10), name: 'x.pdf', mime: 'text/html' })), 415, 'mismatched declared mime rejected');
assert.equal(status(() => decodePortalAttachment({ base64: '!!!not base64', name: 'x.pdf' })), 400, 'invalid base64 rejected');

const reqOf = (text, headers = {}) => ({ headers: new Headers(headers), text: async () => text });
assert.deepEqual(await readBoundedPortalJson(reqOf('{"action":"bootstrap"}')), { action: 'bootstrap' });
assert.deepEqual(await readBoundedPortalJson(reqOf('not json')), {});
assert.equal(await statusAsync(readBoundedPortalJson(reqOf('{}', { 'content-length': String(PORTAL_REQUEST_MAX_CHARS + 1) }))), 413, 'declared oversized body rejected');
assert.equal(await statusAsync(readBoundedPortalJson(reqOf('x'.repeat(PORTAL_REQUEST_MAX_CHARS + 1)))), 413, 'actual oversized body rejected');
assert.ok(PORTAL_REQUEST_MAX_CHARS > Math.ceil(PORTAL_ATTACHMENT_MAX_BYTES * 4 / 3), 'max attachment fits in body cap');

const now = Date.parse('2026-10-31T12:00:00Z');
const rows = (n, ageMs, extra = {}) => Array.from({ length: n }, () => ({ created_date: new Date(now - ageMs).toISOString(), ...extra }));
const entity = (list) => {
  const calls = [];
  return { calls, filter: async (...args) => { calls.push(args); return list; } };
};
{
  const e = entity(rows(PORTAL_WRITES_PER_HOUR - 1, 60_000));
  await enforcePortalWriteBudget(e, 'link1', { now });
  assert.deepEqual(e.calls[0][0], { portal_link_id: 'link1', author_side: 'customer' }, 'budget scoped to link + customer side');
}
assert.equal(await statusAsync(enforcePortalWriteBudget(entity(rows(PORTAL_WRITES_PER_HOUR, 60_000)), 'l', { now })), 429, 'hourly cap');
assert.equal(await statusAsync(enforcePortalWriteBudget(entity(rows(PORTAL_WRITES_PER_DAY, 3 * 60 * 60 * 1000)), 'l', { now })), 429, 'daily cap');
await enforcePortalWriteBudget(entity(rows(500, 2 * 24 * 60 * 60 * 1000)), 'l', { now });
{
  const att = rows(PORTAL_ATTACHMENTS_PER_DAY, 3 * 60 * 60 * 1000, { attachment_url: 'https://f/x' });
  await enforcePortalWriteBudget(entity(att), 'l', { now });
  assert.equal(await statusAsync(enforcePortalWriteBudget(entity(att), 'l', { now, withAttachment: true })), 429, 'daily attachment cap');
}
assert.equal(await statusAsync(enforcePortalWriteBudget({ filter: async () => { throw new Error('down'); } }, 'l', { now })), 503, 'fails closed');
assert.equal(await statusAsync(enforcePortalWriteBudget(entity([]), '', { now })), 404, 'link id required');

console.log('PASS customer-portal-limits');
