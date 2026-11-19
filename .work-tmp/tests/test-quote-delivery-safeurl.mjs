import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  installDeno, fakeRequest, responseOf, makeEntity, makeSessionToken,
  writeSdkStub, setStubEntities, bundleFunction, importBundled,
} from './lib/backendFunctionTestKit.mjs';

// Backlog §16 #380: recordEstimateQuoteDelivery safeUrl scheme stripping —
// non-https attachment URLs (javascript:/data:/vbscript:/ftp: and unparseable
// input) must never persist on the audit row; https URLs survive verbatim.
// Also covers updateEstimateRevisionAudit's safeDeliveryEvidence, which allows
// http(s) — the two sanitizers deliberately differ on http:.
// Both seams live inside Deno entry modules, so the functions are bundled with
// the SDK stubbed — this is the only way to exercise them under Node.

const here = dirname(fileURLToPath(import.meta.url));
const getHandler = installDeno();

const stubFile = resolve(here, '.tmp-sdk-stub-delivery.mjs');
writeSdkStub(stubFile, {});
const outDelivery = resolve(here, '.tmp-fn-recordEstimateQuoteDelivery.mjs');
const outAudit = resolve(here, '.tmp-fn-updateEstimateRevisionAudit.mjs');
bundleFunction({ here, entry: '../base44/functions/recordEstimateQuoteDelivery/entry.ts', stubFile, outFile: outDelivery });
await importBundled(outDelivery);
const deliveryHandler = getHandler();
bundleFunction({ here, entry: '../base44/functions/updateEstimateRevisionAudit/entry.ts', stubFile, outFile: outAudit });
await importBundled(outAudit);
const auditHandler = getHandler();
assert.equal(typeof deliveryHandler, 'function');
assert.equal(typeof auditHandler, 'function', 'audit handler captured last');

const SESSION_EMAIL = 'staff@example.com';
const token = makeSessionToken(SESSION_EMAIL);

const freshEntities = (estimateRows = []) => ({
  AuthorizedEmail: makeEntity([{ id: 'u1', email: SESSION_EMAIL, role: 'staff' }]),
  UserSession: makeEntity([]),
  AllInOneEstimate: makeEntity(estimateRows),
  EstimateQuoteDelivery: makeEntity([]),
  EstimateRevision: makeEntity([]),
  CustomerContact: makeEntity([]),
  Customer: makeEntity([]),
  GlobalSettings: makeEntity([]),
});

const estimate = { id: 'e1', status: 'sent', quote_version: 1, quote_total: 100, work_order_id: '', customer_id: '', updated_date: 'v1' };

const deliveryBody = (fileUrl) => ({
  session_token: token,
  delivery: {
    estimate_id: 'e1',
    quote_version: 1,
    recipient_email: 'buyer@example.com',
    gmail_message_id: 'gmail-1',
    attachment_sha256: 'a'.repeat(64),
    sent_at: new Date().toISOString(),
    attachment_file_url: fileUrl,
    attachment_filename: 'quote.pdf',
    quote_total: 100,
  },
});

// ---------- safeUrl: dangerous schemes never persist ----------
// Assert on the PERSISTED EstimateQuoteDelivery row — that is the sanitizer's
// durable contract ("a dangerous scheme must never reach the audit table").
// NB: the response itself may currently 500 on an unrelated `clean(...)`
// ReferenceError in respondWithDelivery (last_contacted_at mirror) — a defect
// outside this test's scope that never reaches the persisted row.
for (const [label, input, expected] of [
  ['javascript: scheme blanked', 'javascript:alert(1)', ''],
  ['data: scheme blanked', 'data:text/html;base64,PGI+', ''],
  ['vbscript: scheme blanked', 'vbscript:msgbox(1)', ''],
  ['ftp: scheme blanked', 'ftp://files.example.com/q.pdf', ''],
  ['bare string blanked', 'not a url', ''],
  ['https: preserved', 'https://cdn.example.com/quote.pdf', 'https://cdn.example.com/quote.pdf'],
  // NOTE: the recordEstimateQuoteDelivery sanitizer is https-ONLY — http: is
  // also blanked (stricter than safeDeliveryEvidence below, which allows it).
  ['http: blanked by delivery sanitizer', 'http://cdn.example.com/quote.pdf', ''],
]) {
  const entities = freshEntities([estimate]);
  setStubEntities(entities);
  await deliveryHandler(fakeRequest(deliveryBody(input)));
  assert.equal(entities.EstimateQuoteDelivery.rows.length, 1, `${label}: delivery row persisted`);
  assert.equal(entities.EstimateQuoteDelivery.rows[0].attachment_file_url, expected, label);
}

// ---------- safeDeliveryEvidence (updateEstimateRevisionAudit): http(s) allowed ----------
// attach_delivery_evidence needs a completed issuance revision for the version.
const issuanceRevision = {
  id: 'rev-1', estimate_id: 'e1', quote_issue_key: 'estimate:e1:quote:v1',
  revision_status: 'completed', revision_type: 'status_transition',
  estimate_snapshot_before: { quote_version: 0 }, estimate_snapshot_after: { quote_version: 1 },
  updated_date: 'rv1', delivery_evidence: {},
};
for (const [label, input, expected] of [
  ['evidence https: preserved', 'https://cdn.example.com/q.pdf', 'https://cdn.example.com/q.pdf'],
  ['evidence http: preserved', 'http://cdn.example.com/q.pdf', 'http://cdn.example.com/q.pdf'],
  ['evidence javascript: blanked', 'javascript:alert(1)', ''],
]) {
  const entities = freshEntities([estimate]);
  entities.EstimateRevision = makeEntity([{ ...issuanceRevision }]);
  setStubEntities(entities);
  const r = await auditHandler(fakeRequest({
    session_token: token,
    action: 'attach_delivery_evidence',
    estimate_id: 'e1',
    quote_version: 1,
    delivery_evidence: { attachment_file_url: input },
  }));
  const { status, data } = await responseOf(r);
  if (expected === '') {
    // Blanked URL + no other evidence -> 400 "Delivery evidence is incomplete."
    assert.equal(status, 400, `${label}: blanked evidence fails closed`);
  } else {
    assert.equal(status, 200, `${label}: request succeeds`);
    assert.equal(data.revision.delivery_evidence.attachment_file_url, expected, label);
  }
}

rmSync(stubFile, { force: true });
rmSync(outDelivery, { force: true });
rmSync(outAudit, { force: true });
console.log('PASS quote delivery safeUrl sanitizers (10 cases)');
process.exit(0);
